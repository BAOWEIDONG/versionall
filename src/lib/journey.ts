/**
 * ============================================================================
 *  个人历程 - 过程数据计算引擎
 * ============================================================================
 *
 *  与结营报告（campReport.ts）的区别:
 *    结营报告关注"前后对比"（开营前 vs 结营后的指标变化）
 *    个人历程关注"过程中的数据"（每日打卡状态、体重趋势、运动累计、饮食得分趋势）
 *
 *  所有数据实时从打卡记录动态计算，学员每次打卡后数据自动更新。
 *
 *  前后端对接:
 *    后端可实现 GET /me/journey 返回 PersonalJourneyData
 *    计算逻辑应与本文件保持一致
 * ============================================================================
 */
import { format, addDays, differenceInCalendarDays, startOfWeek, endOfWeek } from 'date-fns';
import type { DietRecord, ExerciseRecord, WeightRecord } from '../types';
import type { WeightTrend } from '../types';
import { isDayComplete, calculateStreak } from './streak';
import { calculateDietScore } from './scoring';
import { computeWeightTrend } from './campReport';

/** 每日打卡状态 */
export interface DailyCheckinStatus {
  date: string;           // yyyy-MM-dd
  isComplete: boolean;    // 三餐+运动+体重全部完成
  hasBreakfast: boolean;
  hasLunch: boolean;
  hasDinner: boolean;
  hasExercise: boolean;
  hasWeight: boolean;
  hasSnack: boolean;
  /** 完成项数 0-5（早餐+午餐+晚餐+运动+体重） */
  completionCount: number;
}

/** 每日饮食得分 */
export interface DailyDietScore {
  date: string;
  /** 每日封顶6分（三餐各0-2分，日上限6） */
  score: number;
  /** 当日餐次数 */
  meals: number;
}

/** 每周统计 */
export interface WeeklyStats {
  weekLabel: string;      // "第1周"
  weekStart: string;      // yyyy-MM-dd
  weekEnd: string;
  /** 完成全部打卡的天数 */
  completeDays: number;
  /** 该周天数（7或不足7） */
  totalDays: number;
  /** 完成率 */
  completionRate: number;
  /** 该周运动总时长 */
  exerciseDuration: number;
  /** 该周饮食得分 */
  dietScore: number;
}

/** 运动类型统计 */
export interface ExerciseTypeBreakdown {
  type: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
}

/** 每周饮食健康指数 */
export interface DietScoreTrend {
  weekLabel: string;      // "第1周"
  weekStart: string;      // yyyy-MM-dd
  /** 综合指数 0-100 */
  score: number;
  /** 三餐规律率 0-1（有打卡天中三餐齐全的比例） */
  regularityRate: number;
  /** 结构均衡率 0-1（有标签记录中主食+蛋白质+蔬菜全选的比例） */
  balanceRate: number;
  /** 营养师评分均分（原始分，正态化后参与计算） */
  avgDietitianScore: number | null;
  /** 该周有打卡的天数 */
  checkinDays: number;
  /** 该周三餐齐全的天数（规律率分子） */
  fullMealDays: number;
  /** 该周有结构标签的记录数 */
  taggedRecords: number;
}

/** 每周运动趋势 */
export interface ExerciseTrend {
  weekLabel: string;      // "第1周"
  weekStart: string;      // yyyy-MM-dd
  /** 该周运动总时长（分钟） */
  totalDuration: number;
  /** 该周运动次数 */
  count: number;
  /** 单次 ≥40 分钟的次数（企业积分规则中的有效运动） */
  qualifiedCount: number;
  /** 平均强度（RPE 1-5），无记录为 null */
  avgIntensity: number | null;
}

/** 个人历程数据 */
export interface PersonalJourneyData {
  /** 每日打卡状态列表（从首条记录到今天） */
  dailyCheckins: DailyCheckinStatus[];
  /** 每日饮食得分列表 */
  dailyDietScores: DailyDietScore[];
  /** 每周统计列表 */
  weeklyStats: WeeklyStats[];
  /** 饮食健康指数周趋势 */
  dietScoreTrends: DietScoreTrend[];
  /** 运动周趋势 */
  exerciseTrends: ExerciseTrend[];
  /** 运动类型分布 */
  exerciseBreakdown: ExerciseTypeBreakdown[];
  /** 总运动时长（分钟） */
  totalExerciseDuration: number;
  /** 平均单次运动时长（分钟） */
  avgExerciseDuration: number;
  /** 最长连续打卡天数 */
  longestStreak: number;
  /** 当前连续打卡天数 */
  currentStreak: number;
  /** 总打卡天数 */
  totalCheckinDays: number;
  /** 完成全部打卡天数 */
  completeDays: number;
  /** 完成率 */
  completionRate: number;
  /** 体重趋势 */
  weightTrend: WeightTrend;
  /** 营期开始日期 */
  startDate: string | null;
  /** 营期天数（从首条记录到今天） */
  journeyDays: number;
}

/**
 * 计算每日打卡状态
 *
 * 从首条打卡记录的日期遍历到今天，逐天检查各项打卡情况。
 *
 * @param dietRecords     饮食记录
 * @param exerciseRecords 运动记录
 * @param weightRecords   体重记录
 * @param userId          学员ID（可选，用于多学员过滤）
 */
export function computeDailyCheckins(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
): DailyCheckinStatus[] {
  // 收集所有打卡日期
  const allDates = new Set<string>();
  dietRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });
  exerciseRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });
  weightRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });

  if (allDates.size === 0) return [];

  const sortedDates = Array.from(allDates).sort();
  const startDate = sortedDates[0];
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // 从首条记录到今天，逐天生成状态
  const result: DailyCheckinStatus[] = [];
  let cursor = new Date(startDate);
  const end = new Date(todayStr);

  while (cursor <= end) {
    const dateStr = format(cursor, 'yyyy-MM-dd');

    const dayDiets = dietRecords.filter((r) =>
      r.date.startsWith(dateStr) && (!userId || r.studentId === userId),
    );
    const dayExercises = exerciseRecords.filter((r) =>
      r.date.startsWith(dateStr) && (!userId || r.studentId === userId),
    );
    const dayWeights = weightRecords.filter((r) =>
      r.date.startsWith(dateStr) && (!userId || r.studentId === userId),
    );

    const hasBreakfast = dayDiets.some((r) => r.meal === 'breakfast');
    const hasLunch = dayDiets.some((r) => r.meal === 'lunch');
    const hasDinner = dayDiets.some((r) => r.meal === 'dinner');
    const hasExercise = dayExercises.length > 0;
    const hasWeight = dayWeights.length > 0;
    const hasSnack = dayDiets.some((r) => r.meal === 'snack');

    const completionCount = [hasBreakfast, hasLunch, hasDinner, hasExercise, hasWeight].filter(Boolean).length;

    result.push({
      date: dateStr,
      isComplete: isDayComplete(dateStr, exerciseRecords, dietRecords, weightRecords, userId),
      hasBreakfast,
      hasLunch,
      hasDinner,
      hasExercise,
      hasWeight,
      hasSnack,
      completionCount,
    });

    cursor = addDays(cursor, 1);
  }

  return result;
}

/**
 * 计算每日饮食得分趋势
 *
 * 按日聚合饮食记录，每日得分 = min(Σ dietitianScore, 6)。
 * 未批注记录(dietitianScore=null/undefined)计 0 分，须营养师点评后才计分。
 * 仅返回有饮食记录的日期。
 *
 * @param dietRecords 饮食记录
 * @param userId      学员ID
 */
export function computeDailyDietScores(
  dietRecords: DietRecord[],
  userId?: string,
): DailyDietScore[] {
  const dayMap: Record<string, DietRecord[]> = {};

  dietRecords.forEach((r) => {
    if (userId && r.studentId !== userId) return;
    const day = r.date.substring(0, 10);
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(r);
  });

  return Object.keys(dayMap)
    .sort()
    .map((date) => {
      const records = dayMap[date];
      const rawScore = records.reduce((sum, r) => sum + (r.dietitianScore != null ? r.dietitianScore : 0), 0);
      return {
        date,
        score: Math.min(rawScore, 6),
        meals: records.length,
      };
    });
}

/**
 * 计算每周打卡统计
 *
 * 从首条打卡记录开始，按自然周（周一~周日）分组统计。
 *
 * @param dietRecords     饮食记录
 * @param exerciseRecords 运动记录
 * @param userId          学员ID
 */
export function computeWeeklyStats(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
): WeeklyStats[] {
  // 收集所有打卡日期确定起始点
  const allDates = new Set<string>();
  dietRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });
  exerciseRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });

  if (allDates.size === 0) return [];

  const sortedDates = Array.from(allDates).sort();
  const startDate = new Date(sortedDates[0]);
  const today = new Date();

  // 按自然周分组
  const weeks: WeeklyStats[] = [];
  let weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  let weekIndex = 1;

  while (weekStart <= today) {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const actualEnd = weekEnd > today ? today : weekEnd;

    // 统计这一周内的打卡情况
    let completeDays = 0;
    const daysInWeek = differenceInCalendarDays(actualEnd, weekStart) + 1;
    let exerciseDuration = 0;
    let weekDietRecords: DietRecord[] = [];

    let cursor = new Date(weekStart);
    while (cursor <= actualEnd) {
      const dateStr = format(cursor, 'yyyy-MM-dd');

      // 完成天数：三餐+运动+体重全部完成
      if (isDayComplete(dateStr, exerciseRecords, dietRecords, weightRecords, userId)) {
        completeDays++;
      }

      // 运动时长
      exerciseRecords.forEach((r) => {
        if (r.date.startsWith(dateStr) && (!userId || r.studentId === userId)) {
          exerciseDuration += r.duration;
        }
      });

      // 饮食记录
      weekDietRecords = weekDietRecords.concat(
        dietRecords.filter((r) => r.date.startsWith(dateStr) && (!userId || r.studentId === userId)),
      );

      cursor = addDays(cursor, 1);
    }

    const dietScore = calculateDietScore(weekDietRecords);

    weeks.push({
      weekLabel: `第${weekIndex}周`,
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(actualEnd, 'yyyy-MM-dd'),
      completeDays,
      totalDays: daysInWeek,
      completionRate: daysInWeek > 0 ? completeDays / daysInWeek : 0,
      exerciseDuration,
      dietScore,
    });

    weekStart = addDays(weekEnd, 1);
    weekIndex++;
  }

  return weeks;
}

/**
 * 计算运动类型分布
 *
 * @param exerciseRecords 运动记录
 * @param userId          学员ID
 */
export function computeExerciseBreakdown(
  exerciseRecords: ExerciseRecord[],
  userId?: string,
): ExerciseTypeBreakdown[] {
  const filtered = userId
    ? exerciseRecords.filter((r) => r.studentId === userId)
    : exerciseRecords;

  const typeMap: Record<string, { count: number; totalDuration: number }> = {};

  filtered.forEach((r) => {
    const type = r.type || '其他';
    if (!typeMap[type]) typeMap[type] = { count: 0, totalDuration: 0 };
    typeMap[type].count++;
    typeMap[type].totalDuration += r.duration;
  });

  return Object.entries(typeMap)
    .map(([type, data]) => ({
      type,
      count: data.count,
      totalDuration: data.totalDuration,
      avgDuration: data.count > 0 ? data.totalDuration / data.count : 0,
    }))
    .sort((a, b) => b.totalDuration - a.totalDuration);
}

/**
 * ============================================================================
 *  计算规则文档：每周饮食健康指数（computeDietScoreTrends）
 * ============================================================================
 *
 *  【输出】每周一个 0-100 的综合指数 + 三个分解指标。
 *
 *  【公式】
 *    score = 规律分×30% + 均衡分×40% + 评分分×30%
 *    动态加权：某项指标当周无数据时，其权重按比例分配给已有指标，
 *    避免"未评分=不及格"
 *
 *  【三个分解指标】
 *    1. 规律分 regularityRate = 三餐齐全天数 ÷ 该周有任意饮食打卡的天数
 *       - "三餐齐全" = 同一天存在 breakfast + lunch + dinner 三条记录
 *       - 分母只算有打卡的天，不惩罚完全没打卡的日子
 *
 *    2. 均衡分 balanceRate = 均衡记录数 ÷ 有结构标签的记录数
 *       - "均衡" = hasStaple / hasProtein / hasVegetable 三项中至少包含2项
 *       - 减脂餐可能不吃主食，只要蛋白+蔬菜也算均衡
 *       - "有结构标签" = hasStaple / hasProtein / hasVegetable 至少一项不为 undefined
 *       - 学员提交时 hasStaple 等默认为 false，但不计入统计
 *       - 数据来源：营养师在批注时设定餐次结构标签
 *
 *    3. 评分分 scoreRate = 营养师评分均值 ÷ 2，映射 0~2 -> 0~1
 *       - 只统计 dietitianScore != null 的记录
 *       - 无评分记录时为 0（不再默认 0.5）
 *
 *  【营养师端交互影响】
 *    - 评分分直接来自营养师在学员详情页打出的 dietitianScore（2/1/0），
 *      营养师打分行为会实时影响学员端该图的趋势走向——批注越及时，
 *      学员看到的指数越新。未批注的记录不计分，所以营养师延迟批注
 *      只会让该周指数"暂时不完整"，不会产生错误分数。
 *    - 结构标签（hasStaple/hasProtein/hasVegetable）学员勾选后，
 *      营养师在学员详情页可直接看到每条记录的结构标签，
 *      无需点开大图即可快速判断结构是否均衡，写批注更快。
 *
 *  【数据同步/异步性】
 *    - 学员端：store.dietRecords 本地新增后立即重算（同步可见）。
 *    - 营养师端：依赖 api.getDietRecords 拉取，学员打卡后需营养师端
 *      重新 init() 或轮询才可见（异步，取决于后端推送机制）。
 *    - dietitianScore 反向同步：营养师打分 → api.updateDietRecord →
 *      学员端下次拉取时评分分更新（异步）。
 *
 *  【后端对接清单】
 *    DietRecord 需新增字段：hasStaple / hasProtein / hasVegetable（boolean）
 *    接口：POST /diet-records 接收；GET /diet-records 返回；PUT 可修改。
 * ============================================================================
 */
export function computeDietScoreTrends(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
): DietScoreTrend[] {
  // 收集所有打卡日期确定周划分
  const allDates = new Set<string>();
  dietRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });
  exerciseRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });
  weightRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });

  if (allDates.size === 0) return [];

  const sortedDates = Array.from(allDates).sort();
  const startDate = new Date(sortedDates[0]);
  const today = new Date();

  const trends: DietScoreTrend[] = [];
  let weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  let weekIndex = 1;

  while (weekStart <= today) {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const actualEnd = weekEnd > today ? today : weekEnd;

    // 该周内的饮食记录
    const weekDiets = dietRecords.filter((r) => {
      if (userId && r.studentId && r.studentId !== userId) return false;
      const d = r.date.substring(0, 10);
      return d >= format(weekStart, 'yyyy-MM-dd') && d <= format(actualEnd, 'yyyy-MM-dd');
    });

    if (weekDiets.length === 0) {
      weekStart = addDays(weekEnd, 1);
      weekIndex++;
      continue;
    }

    // 按天分桶
    const dayMap: Record<string, DietRecord[]> = {};
    weekDiets.forEach((r) => {
      const d = r.date.substring(0, 10);
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push(r);
    });

    const checkinDays = Object.keys(dayMap).length;

    // 规律分：三餐齐全的天数 / 有打卡的天数
    let fullMealDays = 0;
    for (const [, dayRecords] of Object.entries(dayMap)) {
      const meals = new Set(dayRecords.map((r) => r.meal));
      if (meals.has('breakfast') && meals.has('lunch') && meals.has('dinner')) {
        fullMealDays++;
      }
    }
    const regularityRate = checkinDays > 0 ? fullMealDays / checkinDays : 0;

    // 均衡分：营养师已评定结构（hasStaple/hasProtein/hasVegetable 至少一项不为 undefined）的记录
    // “均衡” = 至少包含 2/3 食物类别（主食/蛋白/蔬菜），不要求三项全有
    // 减脂餐可能不吃主食，只要蛋白+蔬菜也算均衡
    const tagged = weekDiets.filter((r) =>
      r.hasStaple !== undefined || r.hasProtein !== undefined || r.hasVegetable !== undefined
    );
    const balanced = tagged.filter((r) => {
      const count = (r.hasStaple ? 1 : 0) + (r.hasProtein ? 1 : 0) + (r.hasVegetable ? 1 : 0);
      return count >= 2;
    });
    const balanceRate = tagged.length > 0 ? balanced.length / tagged.length : 0;

    // 评分分：营养师评分的日均值（0~2 映射到 0~1）
    const evaluated = weekDiets.filter((r) => r.dietitianScore != null);
    let avgDietitianScore: number | null = null;
    let scoreRate = 0;
    if (evaluated.length > 0) {
      const rawAvg = evaluated.reduce((sum, r) => sum + (r.dietitianScore ?? 0), 0) / evaluated.length;
      avgDietitianScore = rawAvg;
      scoreRate = rawAvg / 2;
    }

    // 综合指数：动态权重
    // - 三餐规律始终参与（权重 30%）
    // - 结构均衡仅在有评定数据时参与（权重 40%）
    // - 营养师评分仅在有评分数据时参与（权重 30%）
    // 缺失的指标权重按比例分配给已参与的指标，避免”无评分=不及格”
    const w_reg = 0.3;
    const w_bal = 0.4;
    const w_sco = 0.3;
    const hasReg = checkinDays > 0;
    const hasBal = tagged.length > 0;
    const hasSco = evaluated.length > 0;
    const activeWeight = (hasReg ? w_reg : 0) + (hasBal ? w_bal : 0) + (hasSco ? w_sco : 0);
    let score: number;
    if (activeWeight > 0) {
      const raw = (hasReg ? regularityRate * w_reg : 0) + (hasBal ? balanceRate * w_bal : 0) + (hasSco ? scoreRate * w_sco : 0);
      score = Math.round((raw / activeWeight) * 100);
    } else {
      score = 0;
    }

    trends.push({
      weekLabel: `第${weekIndex}周`,
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      score,
      regularityRate,
      balanceRate,
      avgDietitianScore,
      checkinDays,
      fullMealDays,
      taggedRecords: tagged.length,
    });

    weekStart = addDays(weekEnd, 1);
    weekIndex++;
  }

  return trends;
}

/**
 * ============================================================================
 *  计算规则文档：每周运动趋势（computeExerciseTrends）
 * ============================================================================
 *
 *  【输出】每周四项指标：总时长、次数、达标次数、平均强度。
 *
 *  【规则】
 *    1. totalDuration = 该周所有运动记录的 duration 之和（分钟）
 *    2. count = 该周运动记录条数（同一天多次运动分别计数）
 *    3. qualifiedCount = 单次 duration ≥ 40 分钟的记录数
 *       - 与企业积分规则一致（每日完成单次40分钟以上运动即可计分），
 *         学员可将此理解为"有效运动次数"
 *    4. avgIntensity = 该周记录 intensity 的算术平均值（RPE 1-5）
 *       - 无记录时为 null，前端显示 "--"
 *
 *  【周划分】
 *    自然周（周一至周日），从首条打卡记录所在周开始，到本周结束。
 *    首周可能不足 7 天。
 *
 *  【营养师端交互影响】
 *    - 营养师在学员详情页可看到同一批运动记录，该图数据与营养师端
 *      完全一致（同一份 ExerciseRecord），不存在口径差异。
 *    - 营养师批注不影响本图任何指标（批注只影响学员端的未读提醒）。
 *
 *  【数据同步/异步性】
 *    - 学员端：store.exerciseRecords 本地新增后立即重算（同步可见）。
 *    - 营养师端：依赖 api.getExerciseRecords 拉取（异步）。
 *
 *  【后端对接清单】
 *    无需新增字段。ExerciseRecord 现有字段已足够：
 *    duration（分钟）、intensity（1-5）、type、date。
 * ============================================================================
 */
export function computeExerciseTrends(
  exerciseRecords: ExerciseRecord[],
  userId?: string,
): ExerciseTrend[] {
  if (exerciseRecords.length === 0) return [];

  const allDates = new Set<string>();
  exerciseRecords.forEach((r) => {
    if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10));
  });
  if (allDates.size === 0) return [];

  const startDate = new Date(Array.from(allDates).sort()[0]);
  const today = new Date();

  const trends: ExerciseTrend[] = [];
  let weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  let weekIndex = 1;

  while (weekStart <= today) {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const actualEnd = weekEnd > today ? today : weekEnd;
    const wsStr = format(weekStart, 'yyyy-MM-dd');
    const weStr = format(actualEnd, 'yyyy-MM-dd');

    const weekRecords = exerciseRecords.filter((r) => {
      if (userId && r.studentId && r.studentId !== userId) return false;
      const d = r.date.substring(0, 10);
      return d >= wsStr && d <= weStr;
    });

    if (weekRecords.length === 0) {
      weekStart = addDays(weekEnd, 1);
      weekIndex++;
      continue;
    }

    const totalDuration = weekRecords.reduce((sum, r) => sum + r.duration, 0);
    const qualifiedCount = weekRecords.filter((r) => r.duration >= 40).length;
    const avgIntensity = weekRecords.length > 0
      ? weekRecords.reduce((sum, r) => sum + r.intensity, 0) / weekRecords.length
      : null;

    trends.push({
      weekLabel: `第${weekIndex}周`,
      weekStart: wsStr,
      totalDuration,
      count: weekRecords.length,
      qualifiedCount,
      avgIntensity,
    });

    weekStart = addDays(weekEnd, 1);
    weekIndex++;
  }

  return trends;
}

/** 单个运动日趋势项 */
export interface ExerciseDayTrend {
  /** 日期 yyyy-MM-dd */
  date: string;
  /** 当日运动总时长（分钟） */
  totalDuration: number;
  /** 当日运动次数（同一天多次分别计数） */
  count: number;
  /** 当日单次 ≥40 分钟的次数 */
  qualifiedCount: number;
  /** 当日平均强度（RPE 1-5），无记录为 null */
  avgIntensity: number | null;
}

/**
 * 计算每日运动趋势（用于学员/教练/营养师三端趋势图）。
 * 按自然日聚合，从首条打卡记录所在日到今天，逐日生成（中间无运动的天也保留，
 * 便于在趋势图上展示连续性）。
 */
export function computeDailyExerciseTrends(
  records: ExerciseRecord[],
  userId?: string,
): ExerciseDayTrend[] {
  const mine = records.filter((r) => !userId || r.studentId === userId);
  if (mine.length === 0) return [];

  const dates = mine.map((r) => r.date.substring(0, 10)).sort();
  const firstDate = dates[0];
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const trends: ExerciseDayTrend[] = [];
  let cur = new Date(firstDate);
  const lastDay = new Date(`${todayStr}T00:00:00`);
  while (cur <= lastDay) {
    const dStr = format(cur, 'yyyy-MM-dd');
    const dayRecords = mine.filter((r) => r.date.substring(0, 10) === dStr);
    trends.push({
      date: dStr,
      totalDuration: dayRecords.reduce((s, r) => s + r.duration, 0),
      count: dayRecords.length,
      qualifiedCount: dayRecords.filter((r) => r.duration >= 40).length,
      avgIntensity: dayRecords.length > 0
        ? Math.round((dayRecords.reduce((s, r) => s + r.intensity, 0) / dayRecords.length) * 10) / 10
        : null,
    });
    cur = addDays(cur, 1);
  }

  return trends;
}

/**
 * 生成个人历程数据
 *
 * 这是个人历程页面的唯一入口函数。
 * 传入原始打卡记录，返回完整的 PersonalJourneyData。
 * 所有数据实时计算，随打卡数据动态变更。
 *
 * @param dietRecords     学员的饮食记录
 * @param exerciseRecords 学员的运动记录
 * @param weightRecords   学员的体重记录
 * @param userId          学员ID
 */
export function generatePersonalJourney(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
): PersonalJourneyData {
  // 1. 每日打卡状态
  const dailyCheckins = computeDailyCheckins(dietRecords, exerciseRecords, weightRecords, userId);

  // 2. 每日饮食得分
  const dailyDietScores = computeDailyDietScores(dietRecords, userId);

  // 3. 每周统计
  const weeklyStats = computeWeeklyStats(dietRecords, exerciseRecords, weightRecords, userId);

  // 3.5 饮食健康指数周趋势
  const dietScoreTrends = computeDietScoreTrends(dietRecords, exerciseRecords, weightRecords, userId);

  // 3.6 运动周趋势
  const exerciseTrends = computeExerciseTrends(exerciseRecords, userId);

  // 4. 运动类型分布
  const exerciseBreakdown = computeExerciseBreakdown(exerciseRecords, userId);

  // 5. 体重趋势
  const weightTrend = computeWeightTrend(weightRecords);

  // 6. 连续打卡
  const streakResult = calculateStreak(exerciseRecords, dietRecords, weightRecords, userId);

  // 7. 最长连续（从 dailyCheckins 计算）
  let longestStreak = 0;
  let currentRun = 0;
  let prevDate: string | null = null;
  for (const d of dailyCheckins) {
    if (d.isComplete) {
      if (prevDate && differenceInCalendarDays(new Date(d.date), new Date(prevDate)) === 1) {
        currentRun++;
      } else {
        currentRun = 1;
      }
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 0;
    }
    prevDate = d.date;
  }

  // 8. 汇总
  const totalCheckinDays = dailyCheckins.filter((d) =>
    d.hasBreakfast || d.hasLunch || d.hasDinner || d.hasExercise || d.hasWeight,
  ).length;
  const completeDays = dailyCheckins.filter((d) => d.isComplete).length;
  const totalExerciseDuration = exerciseBreakdown.reduce((sum, e) => sum + e.totalDuration, 0);
  const exerciseCount = exerciseBreakdown.reduce((sum, e) => sum + e.count, 0);

  const startDate = dailyCheckins.length > 0 ? dailyCheckins[0].date : null;
  const journeyDays = dailyCheckins.length;

  return {
    dailyCheckins,
    dailyDietScores,
    weeklyStats,
    dietScoreTrends,
    exerciseTrends,
    exerciseBreakdown,
    totalExerciseDuration,
    avgExerciseDuration: exerciseCount > 0 ? totalExerciseDuration / exerciseCount : 0,
    longestStreak: Math.max(longestStreak, streakResult.currentStreak),
    currentStreak: streakResult.currentStreak,
    totalCheckinDays,
    completeDays,
    completionRate: journeyDays > 0 ? completeDays / journeyDays : 0,
    weightTrend,
    startDate,
    journeyDays,
  };
}
