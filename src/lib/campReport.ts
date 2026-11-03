/**
 * ============================================================================
 *  结营报告 & 统计 - 核心数据计算引擎
 * ============================================================================
 *
 *  本文件是结营报告的**唯一数据源**，前端 UI 和后端 API 均可直接调用，
 *  不需要修改任何计算逻辑。
 *
 *  核心概念:
 *    "完成当天" = 早餐 ✓ + 午餐 ✓ + 晚餐 ✓ + 运动 ✓ + 体重 ✓（五项缺一不可，与 streak.ts isDayComplete 一致）
 *    "打卡天数" = 有任意打卡记录（饮食/运动/体重）的天数
 *    "营期"    = 28 天（可通过 campDays 参数自定义）
 *
 *  指标改善方向:
 *    每个指标有"好方向"：lower（越低越好）或 higher（越高越好）。
 *    判断依据：指标名称匹配 METRIC_DIRECTION 映射表。
 *    改善 = 变化方向与好方向一致 && 变化量 ≠ 0。
 *    同时检查异常→正常的转化作为附加信号。
 *
 *  使用方式:
 *    const report = generateStudentReport(student, configs, values, diets, exercises, weights);
 *    const summary = generateDietitianSummary(students, configs, allValues, diets, exercises, weights);
 *
 *  前后端对接:
 *    - 前端：直接调用本文件函数，传入 store 中的数据
 *    - 后端：实现 GET /camp/student-report?studentId=xxx 返回 StudentCampReport
 *            实现 GET /camp/summary 返回 DietitianCampSummary
 *            计算逻辑应与本文件保持一致
 * ============================================================================
 */
import { differenceInCalendarDays } from 'date-fns';
import type {
  MetricConfig,
  DietRecord,
  ExerciseRecord,
  WeightRecord,
  MetricChange,
  CheckinStats,
  WeightTrend,
  Achievement,
  StudentCampReport,
  DietitianCampSummary,
  MetricAggregate,
  EnterpriseCampReport,
} from '../types';
import type { MetricValue } from './medicalData';
import { isValueOutOfRange } from './medicalData';
import { isDayComplete, calculateStreak } from './streak';
import { calculateDietScore } from './scoring';

/** 训练营默认天数 */
export const DEFAULT_CAMP_DAYS = 28;

/**
 * 指标改善方向映射表
 * - lower: 值降低为改善（如体重、脂肪、胆固醇）
 * - higher: 值升高为改善（如肌肉量、基础代谢率）
 * 未在表中的指标默认为 null（无法判断方向，仅看异常→正常转化）
 */
const METRIC_DIRECTION: Record<string, 'lower' | 'higher'> = {
  // 身体测量 - lower is better
  '体重': 'lower',
  '脂肪量': 'lower',
  '腰臀比': 'lower',
  '内脏脂肪面积': 'lower',
  '肥胖度': 'lower',
  '浮肿指数': 'lower',
  // 身体测量 - higher is better
  '肌肉量': 'higher',
  '骨骼肌': 'higher',
  '基础代谢率': 'higher',
  '身体细胞量': 'higher',
  '四肢骨骼肌质量指数': 'higher',
  'AINST评分': 'higher',
  // 肝功能 - lower is better（酶类偏高表示损伤）
  '丙氨酸氨基转移酶': 'lower',
  '天门冬氨酸氨基转移酶': 'lower',
  'γ-谷氨酰基转移酶': 'lower',
  '碱性磷酸酶': 'lower',
  '总胆红素': 'lower',
  '直接胆红素': 'lower',
  // 肾功能 - lower is better
  '尿素': 'lower',
  '肌酐': 'lower',
  '尿酸': 'lower',
  // 血脂 - lower is better (except HDL)
  '总胆固醇': 'lower',
  '甘油三酯': 'lower',
  '低密度脂蛋白胆固醇': 'lower',
  '高密度脂蛋白胆固醇': 'higher',
  // 血糖 - lower is better
  '葡萄糖(空腹)': 'lower',
  '糖化血红蛋白': 'lower',
  // 营养指标 - higher is better
  '总蛋白': 'higher',
  '白蛋白': 'higher',
  '前白蛋白': 'higher',
};

/**
 * 方向性改善判定（仅按指标明确方向的升降判定，不含"异常转正常"）
 * 用于营养师结营统计 / 企业汇报版的"改善率"——用户口径：异常→正常太主观，
 * 有的差异可能是好的也可能是坏的，故不再把异常恢复计为改善。
 * 学员个人营期报告仍走 isImproved（含异常转正常信号），不在此列。
 */
export function isDirectionalImprovement(
  m: Pick<MetricChange, 'name' | 'change'>,
): boolean {
  const direction = METRIC_DIRECTION[m.name];
  if (m.change === null || !direction) return false;
  if (direction === 'lower' && m.change < 0) return true;
  if (direction === 'higher' && m.change > 0) return true;
  return false;
}

/**
 * 计算单个指标的前后变化
 *
 * 改善判断逻辑:
 *   1. 两个值都是数值型
 *   2. 查 METRIC_DIRECTION 获取方向
 *   3. 如果方向 = lower: change < 0 → 改善
 *      如果方向 = higher: change > 0 → 改善
 *   4. 同时检查异常→正常转化（turnedNormal）
 *
 * @param config  指标配置
 * @param value   前后值
 * @param gender  学员性别（用于性别差异化范围判断）
 */
export function computeMetricChange(
  config: MetricConfig,
  value: MetricValue,
  gender?: 'male' | 'female',
): MetricChange {
  const { beforeValue, afterValue } = value;
  const range = config.normalRange || '';

  const beforeAbnormal = isValueOutOfRange(beforeValue, range, gender);
  const afterAbnormal = isValueOutOfRange(afterValue, range, gender);
  const turnedNormal = beforeAbnormal && !afterAbnormal;

  // 计算变化量（仅数值型）
  let change: number | null = null;
  let changePercent: number | null = null;
  if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
    change = afterValue - beforeValue;
    changePercent = beforeValue !== 0 ? (change / Math.abs(beforeValue)) * 100 : null;
  }

  // 判断是否改善
  let isImproved = false;
  const direction = METRIC_DIRECTION[config.name];
  if (change !== null && direction) {
    if (direction === 'lower' && change < 0) isImproved = true;
    if (direction === 'higher' && change > 0) isImproved = true;
  }
  // 异常转正常也算改善
  if (turnedNormal) isImproved = true;

  return {
    configId: config.id,
    name: config.name,
    unit: config.unit,
    category: config.category,
    normalRange: range,
    beforeValue,
    afterValue,
    change,
    changePercent,
    isImproved,
    beforeAbnormal,
    afterAbnormal,
    turnedNormal,
  };
}

/**
 * 计算所有指标的前后变化
 */
export function computeMetricChanges(
  configs: MetricConfig[],
  values: Record<string, MetricValue>,
  gender?: 'male' | 'female',
): MetricChange[] {
  return configs.map((config) => {
    const v = values[config.id] || { beforeValue: null, afterValue: null };
    return computeMetricChange(config, v, gender);
  });
}

/**
 * 计算打卡频率统计
 *
 * 统计内容:
 *   - totalCheckinDays:  有任意打卡记录的不同日期数
 *   - completeDays:      完成全部5项（三餐+运动+体重）的天数
 *   - completionRate:    completeDays / campDays
 *   - currentStreak:     当前连续完成天数（从今天往前数）
 *   - longestStreak:     营期内最长连续完成天数
 *   - totalExerciseDuration: 所有运动记录时长之和
 *   - totalDietScore:    饮食总得分（每日封顶6分，与 scoring.ts calculateDietScore 一致）
 *
 * @param dietRecords     学员的饮食记录
 * @param exerciseRecords 学员的运动记录
 * @param weightRecords   学员的体重记录
 * @param campDays        营期天数（默认28）
 */
export function computeCheckinStats(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  campDays: number = DEFAULT_CAMP_DAYS,
  userId?: string,
): CheckinStats {
  // 收集所有有打卡记录的日期
  const checkinDates = new Set<string>();
  const dietDates = new Set<string>();
  const exerciseDates = new Set<string>();
  const weightDates = new Set<string>();

  dietRecords.forEach((r) => {
    const d = r.date.substring(0, 10);
    checkinDates.add(d);
    dietDates.add(d);
  });
  exerciseRecords.forEach((r) => {
    const d = r.date.substring(0, 10);
    checkinDates.add(d);
    exerciseDates.add(d);
  });
  weightRecords.forEach((r) => {
    const d = r.date.substring(0, 10);
    checkinDates.add(d);
    weightDates.add(d);
  });

  // 计算完成天数
  const allDates = Array.from(checkinDates).sort();
  let completeDays = 0;
  for (const d of allDates) {
    if (isDayComplete(d, exerciseRecords, dietRecords, weightRecords, userId)) {
      completeDays++;
    }
  }

  // 计算最长连续完成天数
  // 遍历所有打卡日期，找出最长连续 isDayComplete 的段
  let longestStreak = 0;
  let currentRun = 0;
  let prevDate: string | null = null;
  for (const d of allDates) {
    const isComplete = isDayComplete(d, exerciseRecords, dietRecords, weightRecords, userId);
    if (isComplete) {
      if (prevDate && differenceInCalendarDays(new Date(d), new Date(prevDate)) === 1) {
        currentRun++;
      } else {
        currentRun = 1;
      }
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 0;
    }
    prevDate = d;
  }

  // 也检查当前 streak（从今天往前数）
  const streakResult = calculateStreak(exerciseRecords, dietRecords, weightRecords, userId);

  // 总运动时长
  const totalExerciseDuration = exerciseRecords.reduce((sum, r) => sum + r.duration, 0);

  // 饮食总得分
  const totalDietScore = calculateDietScore(dietRecords);

  return {
    campDays,
    totalCheckinDays: checkinDates.size,
    completeDays,
    completionRate: campDays > 0 ? completeDays / campDays : 0,
    dietCheckinDays: dietDates.size,
    exerciseCheckinDays: exerciseDates.size,
    weightCheckinDays: weightDates.size,
    totalDietRecords: dietRecords.length,
    totalExerciseRecords: exerciseRecords.length,
    totalWeightRecords: weightRecords.length,
    currentStreak: streakResult.currentStreak,
    longestStreak: Math.max(longestStreak, streakResult.currentStreak),
    totalExerciseDuration,
    totalDietScore,
  };
}

/**
 * 计算体重趋势
 *
 * 趋势判断:
 *   - insufficient: 少于2条记录，无法判断
 *   - decreasing:   末值 < 首值（减重）
 *   - increasing:   末值 > 首值（增重）
 *   - stable:       末值 = 首值 或变化 < 0.1kg
 *
 * @param weightRecords 学员的体重记录（无需预排序，函数内按日期排序）
 */
export function computeWeightTrend(weightRecords: WeightRecord[]): WeightTrend {
  if (weightRecords.length === 0) {
    return {
      records: [],
      startWeight: null,
      endWeight: null,
      totalChange: null,
      changePercent: null,
      trend: 'insufficient',
    };
  }

  // 按日期排序
  const sorted = [...weightRecords].sort((a, b) => a.date.localeCompare(b.date));
  const records = sorted.map((r) => ({
    date: r.date.substring(0, 10),
    weight: r.weight,
  }));

  const startWeight = records[0].weight;
  const endWeight = records[records.length - 1].weight;
  const totalChange = endWeight - startWeight;
  const changePercent = startWeight !== 0 ? (totalChange / Math.abs(startWeight)) * 100 : null;

  let trend: WeightTrend['trend'] = 'stable';
  if (records.length < 2) {
    trend = 'insufficient';
  } else if (totalChange < -0.1) {
    trend = 'decreasing';
  } else if (totalChange > 0.1) {
    trend = 'increasing';
  }

  return {
    records,
    startWeight,
    endWeight,
    totalChange,
    changePercent,
    trend,
  };
}

/**
 * 成就定义及解锁条件
 *
 * 成就在 generateStudentReport 中根据数据自动判定 unlocked 状态。
 * 每个成就的解锁条件是独立的，不会互相影响。
 */
const ACHIEVEMENT_DEFS: Array<{
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (report: {
    checkinStats: CheckinStats;
    weightTrend: WeightTrend;
    metricChanges: MetricChange[];
  }) => boolean;
}> = [
  {
    id: 'streak_7',
    title: '连续打卡达人',
    description: '连续7天完成全部打卡（三餐+运动）',
    icon: '🏆',
    check: (r) => r.checkinStats.longestStreak >= 7,
  },
  {
    id: 'streak_14',
    title: '坚持不懈',
    description: '连续14天完成全部打卡',
    icon: '🔥',
    check: (r) => r.checkinStats.longestStreak >= 14,
  },
  {
    id: 'streak_28',
    title: '全勤先锋',
    description: '连续完成全部打卡，完美全勤！',
    icon: '🏅',
    check: (r) => r.checkinStats.longestStreak >= 28,
  },
  {
    id: 'weight_loss_3',
    title: '减重之星',
    description: '体重减少超过3公斤',
    icon: '⚖️',
    check: (r) => r.weightTrend.totalChange !== null && r.weightTrend.totalChange <= -3,
  },
  {
    id: 'weight_loss_5',
    title: '减重冠军',
    description: '体重减少超过5公斤',
    icon: '👑',
    check: (r) => r.weightTrend.totalChange !== null && r.weightTrend.totalChange <= -5,
  },
  {
    id: 'fat_loss',
    title: '燃脂勇士',
    description: '脂肪量减少超过2公斤',
    icon: '🔥',
    check: (r) => {
      const fat = r.metricChanges.find((m) => m.name === '脂肪量');
      return fat?.change !== null && fat?.change !== undefined && fat.change <= -2;
    },
  },
  {
    id: 'muscle_gain',
    title: '肌肉增强',
    description: '肌肉量增加',
    icon: '💪',
    check: (r) => {
      const muscle = r.metricChanges.find((m) => m.name === '肌肉量');
      return muscle?.change !== null && muscle?.change !== undefined && muscle.change > 0;
    },
  },
  {
    id: 'bmr_up',
    title: '代谢提升',
    description: '基础代谢率提升',
    icon: '📈',
    check: (r) => {
      const bmr = r.metricChanges.find((m) => m.name === '基础代谢率');
      return bmr?.change !== null && bmr?.change !== undefined && bmr.change > 0;
    },
  },
  {
    id: 'visceral_fat',
    title: '内脏脂肪改善',
    description: '内脏脂肪面积下降',
    icon: '🫀',
    check: (r) => {
      const v = r.metricChanges.find((m) => m.name === '内脏脂肪面积');
      return v?.change !== null && v?.change !== undefined && v.change < 0;
    },
  },
  {
    id: 'abnormal_improved',
    title: '健康改善',
    description: '异常指标数量减少',
    icon: '🎯',
    check: (r) => {
      const beforeAbn = r.metricChanges.filter((m) => m.beforeAbnormal).length;
      const afterAbn = r.metricChanges.filter((m) => m.afterAbnormal).length;
      return afterAbn < beforeAbn;
    },
  },
  {
    id: 'abnormal_cleared',
    title: '全部达标',
    description: '所有异常指标恢复正常',
    icon: '✅',
    check: (r) => {
      const beforeAbn = r.metricChanges.filter((m) => m.beforeAbnormal).length;
      const afterAbn = r.metricChanges.filter((m) => m.afterAbnormal).length;
      return beforeAbn > 0 && afterAbn === 0;
    },
  },
  {
    id: 'exercise_800',
    title: '运动健将',
    description: '累计运动时长超过800分钟',
    icon: '🏃',
    check: (r) => r.checkinStats.totalExerciseDuration >= 800,
  },
  {
    id: 'diet_90',
    title: '饮食自律',
    description: '打卡天数达到营期的90%',
    icon: '🥗',
    check: (r) => r.checkinStats.completionRate >= 0.9,
  },
  {
    id: 'perfect_transform',
    title: '完美蜕变',
    description: '体重下降 + 脂肪下降 + 肌肉增长',
    icon: '🌟',
    check: (r) => {
      const weight = r.weightTrend.totalChange;
      const fat = r.metricChanges.find((m) => m.name === '脂肪量')?.change;
      const muscle = r.metricChanges.find((m) => m.name === '肌肉量')?.change;
      return (
        weight !== null && weight !== undefined && weight < 0 &&
        fat !== null && fat !== undefined && fat < 0 &&
        muscle !== null && muscle !== undefined && muscle > 0
      );
    },
  },
];

/**
 * 计算成就列表
 */
export function computeAchievements(
  checkinStats: CheckinStats,
  weightTrend: WeightTrend,
  metricChanges: MetricChange[],
  extra?: { exerciseRecords?: ExerciseRecord[] },
): Achievement[] {
  const ctx = { checkinStats, weightTrend, metricChanges };
  const base = ACHIEVEMENT_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    icon: def.icon,
    unlocked: def.check(ctx),
  }));

  // ---- 基于运动记录的行为勋章（不依赖体成分数据，学员更有获得感）----
  const exerciseRecords = extra?.exerciseRecords || [];
  const behavioral: Achievement[] = [];

  if (exerciseRecords.length > 0) {
    // 晨型人：累计 3 次在 9:00 前完成运动打卡
    const earlyCount = exerciseRecords.filter((r) => {
      const timePart = r.date.split(' ')[1] || '';
      return timePart >= '05:00' && timePart < '09:00';
    }).length;
    behavioral.push({
      id: 'early_bird',
      title: '晨型人',
      description: `累计 3 次在早上 9 点前完成运动打卡（当前 ${earlyCount}/3）`,
      icon: '🌅',
      unlocked: earlyCount >= 3,
    });

    // 耐力王：单次运动 ≥ 60 分钟
    const maxSingle = Math.max(...exerciseRecords.map((r) => r.duration));
    behavioral.push({
      id: 'endurance_king',
      title: '耐力王',
      description: `单次运动达到 60 分钟（当前最长 ${maxSingle} 分钟）`,
      icon: '🏅',
      unlocked: maxSingle >= 60,
    });

    // 高强度挑战：单次主观强度拉满（Lv.5）
    const hasMaxIntensity = exerciseRecords.some((r) => r.intensity >= 5);
    behavioral.push({
      id: 'high_intensity',
      title: '极限挑战',
      description: '完成一次 Lv.5 非常高强度的运动',
      icon: '⚡',
      unlocked: hasMaxIntensity,
    });

    // 多面手：尝试过 3 种以上运动类型
    const typeSet = new Set(exerciseRecords.map((r) => r.type));
    behavioral.push({
      id: 'versatile',
      title: '运动多面手',
      description: `尝试过 3 种以上运动类型（当前 ${typeSet.size}/3 种）`,
      icon: '🎽',
      unlocked: typeSet.size >= 3,
    });
  }

  return [...behavioral, ...base];
}

/**
 * 生成学员结营报告
 *
 * 这是学员端结营报告的唯一入口函数。
 * 传入原始数据，返回完整的 StudentCampReport 结构。
 *
 * @param student         学员信息 { id, name, gender }
 * @param metricConfigs   指标配置列表
 * @param metricValues    该学员的指标值（key = configId）
 * @param dietRecords     该学员的饮食记录
 * @param exerciseRecords 该学员的运动记录
 * @param weightRecords   该学员的体重记录
 * @param campDays        营期天数（默认28）
 */
export function generateStudentReport(
  student: { id: string; name: string; gender?: 'male' | 'female' },
  metricConfigs: MetricConfig[],
  metricValues: Record<string, MetricValue>,
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  campDays: number = DEFAULT_CAMP_DAYS,
): StudentCampReport {
  // 1. 打卡统计
  const checkinStats = computeCheckinStats(
    dietRecords,
    exerciseRecords,
    weightRecords,
    campDays,
    student.id,
  );

  // 2. 体重趋势
  const weightTrend = computeWeightTrend(weightRecords);

  // 3. 指标变化
  const metricChanges = computeMetricChanges(metricConfigs, metricValues, student.gender);

  // 4. 成就（传入运动记录以计算行为类勋章）
  const achievements = computeAchievements(checkinStats, weightTrend, metricChanges, { exerciseRecords });

  // 5. 核心摘要
  const weightLossKg = weightTrend.totalChange !== null ? -weightTrend.totalChange : null;
  const weightLossPercent = weightTrend.changePercent !== null ? -weightTrend.changePercent : null;

  const fatChange = metricChanges.find((m) => m.name === '脂肪量')?.change ?? null;
  const muscleChange = metricChanges.find((m) => m.name === '肌肉量')?.change ?? null;
  const visceralChange = metricChanges.find((m) => m.name === '内脏脂肪面积')?.change ?? null;

  const abnormalCountBefore = metricChanges.filter((m) => m.beforeAbnormal).length;
  const abnormalCountAfter = metricChanges.filter((m) => m.afterAbnormal).length;
  const abnormalImprovedCount = metricChanges.filter((m) => m.turnedNormal).length;

  return {
    studentId: student.id,
    studentName: student.name,
    gender: student.gender,
    campDays,
    checkinStats,
    weightTrend,
    metricChanges,
    achievements,
    summary: {
      weightLossKg,
      weightLossPercent,
      bodyFatLossKg: fatChange !== null ? -fatChange : null,
      muscleChangeKg: muscleChange,
      visceralFatChange: visceralChange !== null ? -visceralChange : null,
      abnormalCountBefore,
      abnormalCountAfter,
      abnormalImprovedCount,
      totalCheckinDays: checkinStats.totalCheckinDays,
      completionRate: checkinStats.completionRate,
      longestStreak: checkinStats.longestStreak,
      totalExerciseDuration: checkinStats.totalExerciseDuration,
      totalDietScore: checkinStats.totalDietScore,
    },
  };
}

/**
 * 生成营养师端结营统计（聚合所有学员）
 *
 * @param students        学员列表
 * @param metricConfigs   指标配置列表
 * @param allMetricValues 所有学员的指标值 { [studentId]: { [configId]: MetricValue } }
 * @param dietRecords     全部饮食记录（函数内按 studentId 过滤）
 * @param exerciseRecords 全部运动记录
 * @param weightRecords   全部体重记录
 * @param campDays        营期天数
 */
export function generateDietitianSummary(
  students: Array<{ id: string; name: string; gender?: 'male' | 'female' }>,
  metricConfigs: MetricConfig[],
  allMetricValues: Record<string, Record<string, MetricValue>>,
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  campDays: number = DEFAULT_CAMP_DAYS,
): DietitianCampSummary {
  // 为每个学员生成报告
  const studentReports = students.map((student) => {
    const sDiet = dietRecords.filter((r) => r.studentId === student.id);
    const sExercise = exerciseRecords.filter((r) => r.studentId === student.id);
    const sWeight = weightRecords.filter((r) => r.studentId === student.id);
    const sValues = allMetricValues[student.id] || {};
    return generateStudentReport(
      student,
      metricConfigs,
      sValues,
      sDiet,
      sExercise,
      sWeight,
      campDays,
    );
  });

  // 有效学员：至少有一项"身体测量数据"分类的指标同时有 beforeValue 和 afterValue（数值型）
  // 这些学员才参与体重变化等聚合统计
  const bodyConfigIds = metricConfigs
    .filter((c) => c.category === '身体测量数据')
    .map((c) => c.id);

  const validReports = studentReports.filter((report) => {
    const values = allMetricValues[report.studentId] || {};
    return bodyConfigIds.some((id) => {
      const v = values[id];
      if (!v) return false;
      return typeof v.beforeValue === 'number' && typeof v.afterValue === 'number';
    });
  });

  const totalStudents = students.length;
  const validStudentCount = validReports.length;

  // 聚合统计
  // 体重变化：基于有体重数据的学员（不依赖体成分数据）
  const weightChanges = studentReports
    .map((r) => r.weightTrend.totalChange)
    .filter((v): v is number => v !== null);
  const avgWeightChange = weightChanges.length > 0
    ? weightChanges.reduce((a, b) => a + b, 0) / weightChanges.length
    : null;

  // 完成率/打卡天数：基于全部学员（过程指标不依赖体成分数据）
  const avgCompletionRate = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.completionRate, 0) / totalStudents
    : null;

  const avgCheckinDays = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.totalCheckinDays, 0) / totalStudents
    : null;

  // 指标聚合
  const metricAggregates: MetricAggregate[] = metricConfigs.map((config) => {
    const changes: MetricChange[] = studentReports.map((r) =>
      r.metricChanges.find((m) => m.configId === config.id),
    ).filter((m): m is MetricChange => m !== undefined);

    // 仅统计有数值数据的学员
    const numericChanges = changes.filter(
      (m) => typeof m.beforeValue === 'number' && typeof m.afterValue === 'number',
    );

    const avgBefore = numericChanges.length > 0
      ? numericChanges.reduce((sum, m) => sum + (m.beforeValue as number), 0) / numericChanges.length
      : null;

    const avgAfter = numericChanges.length > 0
      ? numericChanges.reduce((sum, m) => sum + (m.afterValue as number), 0) / numericChanges.length
      : null;

    const avgChange = numericChanges.length > 0 && avgBefore !== null && avgAfter !== null
      ? avgAfter - avgBefore
      : null;

    // 有效检测数据：前后都有值（数值或非数值）的学员才算参与检测
    const validChanges = changes.filter(
      (m) => m.beforeValue !== null && m.afterValue !== null,
    );

    const improvedCount = validChanges.filter((m) => isDirectionalImprovement(m)).length;
    const totalCount = validChanges.length;
    const improvementRate = totalCount > 0 ? improvedCount / totalCount : null;

    return {
      configId: config.id,
      name: config.name,
      unit: config.unit,
      category: config.category,
      avgBefore,
      avgAfter,
      avgChange,
      improvedCount,
      totalCount,
      improvementRate,
    };
  });

  return {
    totalStudents,
    validStudentCount,
    campDays,
    avgWeightChange,
    avgCompletionRate,
    avgCheckinDays,
    studentReports,
    metricAggregates,
  };
}

/**
 * 生成企业汇报版报告（匿名聚合，无个人健康明细）
 *
 * 基于营养师端结营统计二次加工，输出可直接发给企业 HR 的数据：
 *   - 只有群体聚合数字，不含任何学员个人健康数据
 *   - 亮点文案自动提炼，可直接放进汇报 PPT
 *
 * @param summary 营养师端结营统计
 */
export function generateEnterpriseReport(summary: DietitianCampSummary): EnterpriseCampReport {
  const { studentReports, metricAggregates, totalStudents, validStudentCount, campDays } = summary;

  // 完成率 ≥80% 人数（基于全部学员——完成率不依赖体成分数据）
  const highCompletionCount = studentReports.filter((r) => r.checkinStats.completionRate >= 0.8).length;
  const highCompletionRate = totalStudents > 0 ? highCompletionCount / totalStudents : null;

  // 平均打卡完成率（全学员口径，比营养师端"有效人数"口径更适合对外汇报参与度）
  const avgCompletionRate = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.completionRate, 0) / totalStudents
    : null;

  // 体重维度（仅统计有 ≥2 条体重记录的学员）
  const withWeight = studentReports.filter((r) => r.weightTrend.totalChange !== null);
  const weightRecordCount = withWeight.length;
  const weightLossCount = withWeight.filter((r) => (r.weightTrend.totalChange ?? 0) < 0).length;
  const weightGoalCount = withWeight.filter((r) => (r.weightTrend.totalChange ?? 0) <= -3).length;
  const weightGoalRate = totalStudents > 0 ? weightGoalCount / totalStudents : null;
  const avgWeightLoss = weightRecordCount > 0
    ? -withWeight.reduce((sum, r) => sum + (r.weightTrend.totalChange ?? 0), 0) / weightRecordCount
    : null;

  // 过程数据
  const totalCheckinRecords = studentReports.reduce(
    (sum, r) => sum + r.checkinStats.totalDietRecords + r.checkinStats.totalExerciseRecords + r.checkinStats.totalWeightRecords,
    0,
  );
  const totalExerciseMinutes = studentReports.reduce(
    (sum, r) => sum + r.checkinStats.totalExerciseDuration,
    0,
  );

  // 参与度细分
  const avgCheckinDays = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.totalCheckinDays, 0) / totalStudents
    : null;
  const avgLongestStreak = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.longestStreak, 0) / totalStudents
    : null;
  const streakChampionCount = studentReports.filter(
    (r) => r.checkinStats.longestStreak >= campDays * 0.7,
  ).length;
  const avgDietCheckinDays = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.dietCheckinDays, 0) / totalStudents
    : null;
  const avgExerciseCheckinDays = totalStudents > 0
    ? studentReports.reduce((sum, r) => sum + r.checkinStats.exerciseCheckinDays, 0) / totalStudents
    : null;

  // 体成分改善分布（基于有前后数据的学员）
  const bodyFatStudents = studentReports.filter((r) => r.summary.bodyFatLossKg !== null);
  const bodyFatRecordCount = bodyFatStudents.length;
  const bodyFatLossCount = bodyFatStudents.filter((r) => (r.summary.bodyFatLossKg ?? 0) > 0).length;
  const muscleStudents = studentReports.filter((r) => r.summary.muscleChangeKg !== null);
  const muscleRecordCount = muscleStudents.length;
  const muscleGainCount = muscleStudents.filter((r) => (r.summary.muscleChangeKg ?? 0) > 0).length;

  // 改善率 Top 指标（至少 2 人有前后检测数据，避免小样本误导）
  // 排序：先按改善率（改善人数÷参与检测人数）降序，再按变化量绝对值降序
  const topImprovedMetrics = metricAggregates
    .filter((m) => m.totalCount >= 2 && m.improvementRate !== null && m.improvementRate > 0)
    .sort((a, b) => {
      const rateDiff = (b.improvementRate ?? 0) - (a.improvementRate ?? 0);
      if (Math.abs(rateDiff) > 0.001) return rateDiff;
      // 改善率相同时，按变化量绝对值降序
      const aMag = Math.abs(a.avgChange ?? 0);
      const bMag = Math.abs(b.avgChange ?? 0);
      return bMag - aMag;
    })
    .slice(0, 5)
    .map((m) => ({
      name: m.name,
      unit: m.unit,
      avgChange: m.avgChange,
      improvementRate: m.improvementRate,
      improvedCount: m.improvedCount,
      totalCount: m.totalCount,
    }));

  // ─── 自动提炼亮点（取成立的前几条）───────────────────────
  const highlights: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  if (avgWeightLoss !== null && avgWeightLoss > 0) {
    highlights.push(
      `本期 ${totalStudents} 名学员人均减重 ${avgWeightLoss.toFixed(1)} kg` +
      (weightLossCount > 0 ? `，${weightLossCount}/${totalStudents} 名学员体重下降` : ''),
    );
  }
  if (highCompletionRate !== null && highCompletionCount > 0) {
    highlights.push(`${pct(highCompletionRate)} 的学员打卡完成率超过 80%，全员平均完成率 ${avgCompletionRate !== null ? pct(avgCompletionRate) : '--'}`);
  }
  if (weightGoalCount > 0) {
    highlights.push(`${weightGoalCount} 名学员减重达到 3kg 以上，占总参营人数 ${pct(weightGoalCount / Math.max(totalStudents, 1))}`);
  }
  if (bodyFatRecordCount > 0 && bodyFatLossCount > 0) {
    highlights.push(`${bodyFatLossCount}/${bodyFatRecordCount} 名学员体脂肪下降，健康风险降低`);
  }
  if (highlights.length === 0 && totalExerciseMinutes > 0) {
    highlights.push(`全员累计运动 ${(totalExerciseMinutes / 60).toFixed(0)} 小时，累计打卡 ${totalCheckinRecords} 次`);
  }

  return {
    totalStudents,
    validStudentCount,
    campDays,
    avgCompletionRate,
    highCompletionCount,
    highCompletionRate,
    avgWeightLoss,
    weightGoalCount,
    weightGoalRate,
    weightLossCount,
    weightRecordCount,
    totalCheckinRecords,
    totalExerciseMinutes,
    avgCheckinDays,
    avgLongestStreak,
    streakChampionCount,
    avgDietCheckinDays,
    avgExerciseCheckinDays,
    bodyFatLossCount,
    bodyFatRecordCount,
    muscleGainCount,
    muscleRecordCount,
    topImprovedMetrics,
    highlights: highlights.slice(0, 4),
  };
}

/**
 * 生成体重趋势 SVG 折线图数据
 * 返回可直接用于 SVG polyline 的 points 字符串
 *
 * @param trend     体重趋势数据
 * @param width     SVG 宽度
 * @param height    SVG 高度
 * @param padding   边距
 */
export function weightTrendToSvgPoints(
  trend: WeightTrend,
  width: number = 300,
  height: number = 120,
  padding: number = 20,
): string {
  if (trend.records.length < 2) return '';

  const weights = trend.records.map((r) => r.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  const n = trend.records.length;
  return trend.records
    .map((r, i) => {
      const x = padding + (i / (n - 1)) * (width - 2 * padding);
      const y = height - padding - ((r.weight - minW) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
