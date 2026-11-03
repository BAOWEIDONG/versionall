import type { MetricConfig } from '../types';

export type Indicator = {
  name: string;
  unit: string;
  normalRange: string;
  beforeValue: number | string | null;
  afterValue: number | string | null;
  isBeforeOut: boolean;
  isAfterOut: boolean;
};

export type MedicalCategory = {
  title: string;
  items: Indicator[];
};

/** 指标值（仅需 beforeValue/afterValue，异常状态由 isValueOutOfRange 动态计算） */
export type MetricValue = {
  beforeValue: number | string | null;
  afterValue: number | string | null;
};

/**
 * 根据性别解析参考范围
 * 支持以下格式：
 *   "男9-50 / 女7-40"      性别差异化区间
 *   "3.9-6.1"              通用区间
 *   "<5.2"                 小于上限（下限视为0）
 *   ">1.04"                大于下限（上限视为无穷大）
 *   "男<420 / 女<360"      性别差异化小于上限
 *   "男>1.04 / 女>0.9"     性别差异化大于下限
 * gender 为 undefined 时取所有子范围的全局最小/最大值（保守判断）
 */
export function parseRangeByGender(
  normalRange: string,
  gender?: 'male' | 'female',
): { min: number; max: number } | null {
  // 有性别信息时，优先匹配对应性别的范围
  if (gender) {
    const prefix = gender === 'male' ? '男' : '女';
    // 匹配 "男44-104" 性别差异化区间
    const rangeRe = new RegExp(prefix + '(\\d+\\.?\\d*)\\s*-\\s*(\\d+\\.?\\d*)');
    const rangeM = normalRange.match(rangeRe);
    if (rangeM) return { min: parseFloat(rangeM[1]), max: parseFloat(rangeM[2]) };
    // 匹配 "男<420" 性别差异化小于上限
    const lessRe = new RegExp(prefix + '\\s*<\\s*(\\d+\\.?\\d*)');
    const lessM = normalRange.match(lessRe);
    if (lessM) return { min: 0, max: parseFloat(lessM[1]) };
    // 匹配 "男>1.04" 性别差异化大于下限
    const greaterRe = new RegExp(prefix + '\\s*>\\s*(\\d+\\.?\\d*)');
    const greaterM = normalRange.match(greaterRe);
    if (greaterM) return { min: parseFloat(greaterM[1]), max: Infinity };
  }
  // 通用小于上限: "<5.2" 或 "< 5.2"
  const lessMatch = normalRange.match(/<\s*(\d+\.?\d*)/);
  if (lessMatch) return { min: 0, max: parseFloat(lessMatch[1]) };
  // 通用大于下限: ">1.04" 或 "> 1.04"
  const greaterMatch = normalRange.match(/>\s*(\d+\.?\d*)/);
  if (greaterMatch) return { min: parseFloat(greaterMatch[1]), max: Infinity };
  // 无性别信息或未匹配到，取所有数字范围的全局最小/最大值
  const matches = normalRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/g);
  if (!matches || matches.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  matches.forEach((m) => {
    const nums = m.match(/(\d+\.?\d*)/g);
    if (nums && nums.length >= 2) {
      min = Math.min(min, parseFloat(nums[0]));
      max = Math.max(max, parseFloat(nums[1]));
    }
  });
  return { min, max };
}

/**
 * 判断指标值是否超出参考范围（按性别）
 * - null/undefined/空值 → false（未检测不标记异常）
 * - 字符串型值（如"阴性"）→ false（非数值型不自动判断）
 * - 数值型 → 按 parseRangeByGender 解析范围后比较
 */
export function isValueOutOfRange(
  value: number | string | null,
  normalRange: string,
  gender?: 'male' | 'female',
): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return false;
  const range = parseRangeByGender(normalRange, gender);
  if (!range) return false;
  return value < range.min || value > range.max;
}

/**
 * 根据动态配置 + 值，构建医疗指标分类数据
 * isBeforeOut/isAfterOut 由 isValueOutOfRange 按性别动态计算
 * 新增的指标（无 mock 值）自动填充 null/false
 */
export function buildMedicalData(
  configs: MetricConfig[],
  values: Record<string, MetricValue>,
  gender?: 'male' | 'female',
): MedicalCategory[] {
  const categoryMap = new Map<string, Indicator[]>();
  for (const config of configs) {
    const v = values[config.id] || { beforeValue: null, afterValue: null };
    const range = config.normalRange || '';
    const indicator: Indicator = {
      name: config.name,
      unit: config.unit,
      normalRange: range,
      beforeValue: v.beforeValue,
      afterValue: v.afterValue,
      isBeforeOut: isValueOutOfRange(v.beforeValue, range, gender),
      isAfterOut: isValueOutOfRange(v.afterValue, range, gender),
    };
    if (!categoryMap.has(config.category)) {
      categoryMap.set(config.category, []);
    }
    categoryMap.get(config.category)!.push(indicator);
  }
  return Array.from(categoryMap.entries()).map(([title, items]) => ({ title, items }));
}
