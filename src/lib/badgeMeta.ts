import type { BadgeCadence, BadgeCategory, BadgeCondition, BadgeConfig } from '../types';

/** 徽章分类文案（学员端、报告、营养师端共用，避免各处不一致） */
export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = {
  milestone: '里程碑',
  achievement: '成就',
  activity: '活动',
};

/** 徽章周期文案 */
export const BADGE_CADENCE_LABEL: Record<BadgeCadence, string> = {
  day: '每日',
  week: '每周',
  month: '每月',
};

/** 达成条件文案与单位 */
export const BADGE_CONDITION_META: Record<BadgeCondition, { label: string; unit: string }> = {
  checkin_days: { label: '有打卡天数', unit: '天' },
  all_items: { label: '全项完成天数', unit: '天' },
  streak_days: { label: '最长连续全项打卡', unit: '天' },
  weight_loss_kg: { label: '体重下降', unit: 'kg' },
  weight_loss_percent: { label: '体重下降', unit: '%' },
  fat_loss_kg: { label: '脂肪量下降', unit: 'kg' },
  early_exercise_count: { label: '早 9 点前完成运动', unit: '次' },
  single_exercise_minutes: { label: '单次运动时长', unit: '分钟' },
  max_intensity: { label: '单次运动强度达到', unit: '级' },
  exercise_type_count: { label: '运动种类', unit: '种' },
};

/** 完整描述一条徽章的达成条件（营养师怎么配，学员端就怎么显示） */
export function describeBadgeCondition(cfg: Pick<BadgeConfig, 'category' | 'cadence' | 'condition' | 'threshold'>): string {
  const meta = BADGE_CONDITION_META[cfg.condition];
  const base = `${meta?.label || cfg.condition} ≥ ${cfg.threshold} ${meta?.unit || ''}`.trim();
  if (cfg.category === 'activity') {
    const scope = cfg.cadence === 'day' ? '每天' : cfg.cadence === 'week' ? '每个自然周' : '每个自然月';
    return `${scope}统计：${base}`;
  }
  return base;
}

/** 该徽章是否可重复获得（仅活动徽章） */
export const isRepeatableBadge = (cfg: Pick<BadgeConfig, 'category'>) => cfg.category === 'activity';
