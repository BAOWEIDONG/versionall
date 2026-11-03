import { eachDayOfInterval, format, isValid, startOfWeek } from 'date-fns';
import type { BadgeCondition, BadgeConfig, BadgeRecord, Camp, DietRecord, ExerciseRecord, WeightRecord } from '../types';

interface StudentLike { id: string }

const DATE_FMT = 'yyyy-MM-dd';

/** 安全解析 yyyy-MM-dd，非法返回 null */
function parseDay(d: string): Date | null {
  const date = new Date(`${d.substring(0, 10)}T00:00:00`);
  return isValid(date) ? date : null;
}

/** 营期内的所有日期（含首尾）；缺少日期时返回空数组 */
export function campDateKeys(camp: Camp | null | undefined): string[] {
  if (!camp?.startDate || !camp?.endDate) return [];
  const start = parseDay(camp.startDate);
  const end = parseDay(camp.endDate);
  if (!start || !end || end < start) return [];
  // 上限 90 天，避免异常配置造成大循环
  const days = eachDayOfInterval({ start, end }).slice(0, 90);
  return days.map((d) => format(d, DATE_FMT));
}

/** 单个学员当天已完成的打卡项集合 */
function dayItems(studentId: string, date: string, diet: DietRecord[], ex: ExerciseRecord[], wt: WeightRecord[]) {
  const meals = new Set(
    diet.filter((r) => r.studentId === studentId && r.date.startsWith(date)).map((r) => r.meal),
  );
  return {
    breakfast: meals.has('breakfast'),
    lunch: meals.has('lunch'),
    dinner: meals.has('dinner'),
    exercise: ex.some((r) => r.studentId === studentId && r.date.startsWith(date)),
    weight: wt.some((r) => r.studentId === studentId && r.date.startsWith(date)),
    any: meals.size > 0 || ex.some((r) => r.studentId === studentId && r.date.startsWith(date)) || wt.some((r) => r.studentId === studentId && r.date.startsWith(date)),
    all: meals.has('breakfast') && meals.has('lunch') && meals.has('dinner')
      && ex.some((r) => r.studentId === studentId && r.date.startsWith(date))
      && wt.some((r) => r.studentId === studentId && r.date.startsWith(date)),
  };
}

/**
 * 计算某营期内所有学员的徽章记录（不修改入参）。
 * 规则：
 *  - 同一学员 × 同一徽章 × 同一周期 只记 1 枚
 *  - day 周期 = 自然日；week = 周一为一周起点；month = 自然月
 *  - condition=checkin_days：周期内有打卡的天数 ≥ threshold
 *  - condition=all_items：周期内「全项完成」的天数 ≥ threshold（day 周期即当天全项）
 */
export function computeBadgeRecords(
  configs: BadgeConfig[],
  students: StudentLike[],
  diet: DietRecord[],
  ex: ExerciseRecord[],
  wt: WeightRecord[],
  camp: Camp | null | undefined,
): BadgeRecord[] {
  const days = campDateKeys(camp);
  if (!camp || days.length === 0) return [];
  const active = configs.filter((c) => c.active !== false && (c.category ?? 'activity') === 'activity');
  const out: BadgeRecord[] = [];

  for (const cfg of active) {
    const threshold = Math.max(1, cfg.threshold || 1);
    for (const s of students) {
      // 按周期分组：key -> { achievedDays: string[], lastDate: string, value: number }
      const groups = new Map<string, { dates: string[]; value: number }>();
      for (const d of days) {
        const items = dayItems(s.id, d, diet, ex, wt);
        const hit = cfg.condition === 'all_items' ? items.all : items.any;
        if (!hit) continue;
        let key = d;
        if (cfg.cadence === 'week') key = format(startOfWeek(parseDay(d)!, { weekStartsOn: 1 }), DATE_FMT);
        else if (cfg.cadence === 'month') key = d.substring(0, 7);
        const g = groups.get(key) || { dates: [], value: 0 };
        g.dates.push(d);
        g.value = g.dates.length;
        groups.set(key, g);
      }
      for (const [periodKey, g] of groups) {
        if (g.value < threshold) continue;
        const earnedAt = g.dates.sort().slice(-1)[0];
        out.push({
          id: `${s.id}_${cfg.id}_${periodKey}`,
          studentId: s.id,
          campId: camp.id,
          badgeId: cfg.id,
          badgeName: cfg.name,
          category: 'activity',
          cadence: cfg.cadence,
          icon: cfg.icon,
          periodKey,
          earnedAt,
          value: g.value,
        });
      }
    }
  }
  return out;
}

/** 一次性徽章判定上下文（里程碑 / 成就） */
export interface OneTimeBadgeContext {
  longestStreak: number;
  /** 体重下降（正数=减重） */
  weightLossKg: number | null;
  /** 体重下降百分比（正数=减重） */
  weightLossPercent: number | null;
  /** 脂肪量下降（正数=减脂） */
  fatLossKg: number | null;
  exerciseRecords: ExerciseRecord[];
  earnedAt: string;
}

/** 按配置的条件类型判定一次性徽章是否达成 */
export function evaluateOneTimeCondition(
  condition: BadgeCondition,
  threshold: number,
  ctx: OneTimeBadgeContext,
): boolean {
  const t = Number(threshold) || 0;
  switch (condition) {
    case 'streak_days':
      return ctx.longestStreak >= t;
    case 'weight_loss_kg':
      return (ctx.weightLossKg ?? 0) >= t;
    case 'weight_loss_percent':
      return (ctx.weightLossPercent ?? 0) >= t;
    case 'fat_loss_kg':
      return (ctx.fatLossKg ?? 0) >= t;
    case 'early_exercise_count':
      return ctx.exerciseRecords.filter((r) => {
        const time = r.date.split(' ')[1] || '';
        return time >= '05:00' && time < '09:00';
      }).length >= t;
    case 'single_exercise_minutes':
      return ctx.exerciseRecords.some((r) => r.duration >= t);
    case 'max_intensity':
      return ctx.exerciseRecords.some((r) => r.intensity >= t);
    case 'exercise_type_count':
      return new Set(ctx.exerciseRecords.map((r) => r.type)).size >= t;
    default:
      // 周期类条件（checkin_days / all_items）不适用于一次性徽章
      return false;
  }
}

/** 计算某学员的一次性徽章（里程碑 + 成就） */
export function computeOneTimeBadgeRecords(
  configs: BadgeConfig[],
  studentId: string,
  campId: string,
  ctx: OneTimeBadgeContext,
): BadgeRecord[] {
  return configs
    .filter((c) => c.active !== false && c.category !== 'activity')
    .filter((c) => evaluateOneTimeCondition(c.condition, c.threshold, ctx))
    .map((c) => ({
      id: `${studentId}_${c.id}_once`,
      studentId,
      campId,
      badgeId: c.id,
      badgeName: c.name,
      category: c.category,
      cadence: c.cadence,
      icon: c.icon,
      periodKey: 'once',
      earnedAt: ctx.earnedAt,
      value: c.threshold,
    }));
}
