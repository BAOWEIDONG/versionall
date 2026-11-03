import type { CheckinComment } from '../types';

/**
 * 取一条打卡记录的批注（「单一批注」展示语义）。
 * 语义：每条记录营养师/教练各只有一条批注(作者=最后编辑者)，多人共同编辑同一份、不新增。
 * 读取时对存量历史数据做兜底：`comments` 数组每个角色只保留最后一条，`无 comments` 时退化为旧的单品字段(dietitian 系/coach 系)归一成单条。
 */
export function recordComments(rec: unknown): CheckinComment[] {
  const r = rec as Record<string, unknown> & { id?: string; date?: string };
  let arr: CheckinComment[];
  if (Array.isArray(r?.comments) && (r.comments as CheckinComment[]).length > 0) {
    arr = r.comments as CheckinComment[];
  } else {
    const isCoach = Boolean(r?.coachComment);
    const text = (isCoach ? r?.coachComment : r?.dietitianComment) as string | undefined;
    if (!text) return [];
    arr = [
      {
        id: `legacy_${r?.id || 'x'}`,
        role: isCoach ? 'coach' : 'dietitian',
        name: ((isCoach ? r?.coachName : r?.dietitianName) as string) || (isCoach ? '教练' : '营养师'),
        text,
        date: ((isCoach ? r?.coachCommentDate : r?.dietitianCommentDate) as string) || r?.date || '',
      },
    ];
  }
  // 兜底存量多作者数据：每角色只留最后一条(作者=最后编辑者)，全站保持「单一批注」展示
  const byRole = new Map<CheckinComment['role'], CheckinComment>();
  for (const c of arr) byRole.set(c.role, c);
  return [...byRole.values()];
}