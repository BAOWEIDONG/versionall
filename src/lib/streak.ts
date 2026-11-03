/**
 * ============================================================================
 *  连续打卡 & 奖励解锁 - 业务规则计算引擎
 * ============================================================================
 *
 *  核心概念:
 *    "完成当天" = 早餐 ✓ + 午餐 ✓ + 晚餐 ✓ + 运动 ✓ + 体重 ✓（五项缺一不可）
 *    加餐 不影响"完成当天"判定。
 *
 *  连续打卡天数 (streak):
 *    从今天开始往前数，遇到第一个"未完成"的日期即停止。
 *    中断一天即归零，重新累计。
 *
 *  奖励解锁:
 *    streak >= tier.requiredDays 时解锁，可领取。
 *    已领取的奖励固定在领取日，不再随 streak 变化。
 *
 *  前端计算 vs 后端计算:
 *    当前由前端从打卡记录实时计算（无需额外接口）。
 *    后端如需预计算，可实现 GET /me/streak-status 返回相同结构。
 * ============================================================================
 */
import { format, addDays } from 'date-fns';
import type { ExerciseRecord, DietRecord, WeightRecord, RewardTier } from '../types';

export interface StreakResult {
  /** 当前连续打卡天数（从今天往前数，遇到未完成即停） */
  currentStreak: number;
  /** 累计打卡天数（有任意打卡记录的日期数，含部分打卡） */
  totalDays: number;
  /** 当前连续段的起始日期 (yyyy-MM-dd)，streak=0 时为 null */
  streakStartDate: string | null;
}

/**
 * 检查某天是否完成全部打卡
 *
 * 完成条件（五项全部满足）:
 *   1. 有一条 breakfast 饮食记录
 *   2. 有一条 lunch 饮食记录
 *   3. 有一条 dinner 饮食记录
 *   4. 至少有一条运动记录
 *   5. 至少有一条体重记录
 *
 * 不影响完成判定的:
 *   - 加餐 (snack) 记录（可选）
 *
 * @param dateStr    日期字符串 "yyyy-MM-dd"
 * @param exercises  全部运动记录
 * @param diets      全部饮食记录
 * @param weights    全部体重记录
 * @param userId     学员 ID（用于多学员数据过滤）
 */
export function isDayComplete(
  dateStr: string,
  exercises: ExerciseRecord[],
  diets: DietRecord[],
  weights: WeightRecord[],
  userId?: string
): boolean {
  // 严格按学员匹配：记录必须属于当前用户（不再把缺 studentId 的他人记录算进来，
  // 否则会出现"我 22 号才开始打卡，21 号的礼物却能领取"的问题）
  const mine = (r: { studentId?: string }) => !userId || r.studentId === userId;
  const hasBreakfast = diets.some(r =>
    r.date.startsWith(dateStr) && r.meal === 'breakfast' && mine(r)
  );
  const hasLunch = diets.some(r =>
    r.date.startsWith(dateStr) && r.meal === 'lunch' && mine(r)
  );
  const hasDinner = diets.some(r =>
    r.date.startsWith(dateStr) && r.meal === 'dinner' && mine(r)
  );
  const hasExercise = exercises.some(r =>
    r.date.startsWith(dateStr) && mine(r)
  );
  const hasWeight = weights.some(r =>
    r.date.startsWith(dateStr) && mine(r)
  );
  return hasBreakfast && hasLunch && hasDinner && hasExercise && hasWeight;
}

/**
 * 计算连续打卡天数
 *
 * 算法:
 *   1. 从今天 (today) 开始，调用 isDayComplete 往前逐天检查
 *   2. 遇到第一个"未完成"的日期即停止
 *   3. streak = 连续完成的天数
 *   4. streakStartDate = today - (streak - 1) 天
 *
 * totalDays:
 *   统计所有有任意打卡记录（饮食/运动/体重）的不同日期数。
 *   包含部分打卡的日期（如只打了早餐没打运动）。
 *
 * @returns StreakResult
 */
export function calculateStreak(
  exercises: ExerciseRecord[],
  diets: DietRecord[],
  weights: WeightRecord[],
  userId?: string
): StreakResult {
  // 收集所有有任意打卡记录的日期（用于计算总打卡天数）
  const anyCheckinDates = new Set<string>();
  exercises.forEach(r => { if (!userId || r.studentId === userId) anyCheckinDates.add(r.date.substring(0, 10)); });
  diets.forEach(r => { if (!userId || r.studentId === userId) anyCheckinDates.add(r.date.substring(0, 10)); });
  weights.forEach(r => { if (!userId || r.studentId === userId) anyCheckinDates.add(r.date.substring(0, 10)); });

  const total = anyCheckinDates.size;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // 从今天开始往前数连续完成全部打卡的天数
  // 注意：如果今天尚未完成全部打卡（如还没到晚餐时间），
  // 则从昨天开始计算，避免日间 streak 归零导致已解锁奖品重新锁定
  let streak = 0;
  let checkDate = todayStr;

  if (!isDayComplete(checkDate, exercises, diets, weights, userId)) {
    // 今天尚未完成，从昨天开始算
    checkDate = format(addDays(new Date(checkDate), -1), 'yyyy-MM-dd');
  }

  while (isDayComplete(checkDate, exercises, diets, weights, userId)) {
    streak++;
    checkDate = format(addDays(new Date(checkDate), -1), 'yyyy-MM-dd');
  }

  // 当前连续段的起始日期
  const streakStartDate = streak > 0
    ? format(addDays(new Date(todayStr), -(streak - (isDayComplete(todayStr, exercises, diets, weights, userId) ? 1 : 0))), 'yyyy-MM-dd')
    : null;

  return { currentStreak: streak, totalDays: total, streakStartDate };
}

export interface RewardClaimRef {
  id: string;
  tierId: string;
  studentId: string;
  claimDate: string;
  status: string;
  trackingNumber?: string;
}

/**
 * 检查从 startDate 到 endDate（含）的每一天是否都完成了全部打卡（五项）
 *
 * 用于奖励领取前的二次校验：即使 streak 计算正确，
 * 也要确保从首次打卡日到奖励目标日之间没有缺卡的天数。
 */
export function isRangeComplete(
  startDate: string,
  endDate: string,
  exercises: ExerciseRecord[],
  diets: DietRecord[],
  weights: WeightRecord[],
  userId?: string
): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const dStr = format(d, 'yyyy-MM-dd');
    if (!isDayComplete(dStr, exercises, diets, weights, userId)) {
      return false;
    }
  }
  return true;
}

/**
 * 计算营期区间内的最长连续完成天数（资格快照判定用）
 *
 * 新版 PRD（version2）语义：
 *   "首次达到档位即创建不可逆资格快照" —— 一旦在该营期内任意时段连续满勤达到档位天数，
 *   这个"已解锁资格"就永远成立，后续断签不会让已解锁但未领取的奖励重新锁定（场景二反转）。
 *
 * 该函数在 [startDate, endDate]（含）区间内逐日判断"当天是否五项全完成"，
 * 返回最大连续完成段的天数。因为是一个最大值（单调不回退），天然等价于"历史是否曾达到过 N 天"，
 * 从而无需额外持久化一个资格快照数组 —— 只要 once 达到过，之后任意时刻该值都 >= N。
 *
 * @param startDate  区间起点（营期开营日 / 该营期该学员生效日）
 * @param endDate    区间终点（营期结营日，覆盖到 today 即可）
 */
export function calculateLongestStreakInRange(
  startDate: string,
  endDate: string,
  exercises: ExerciseRecord[],
  diets: DietRecord[],
  weights: WeightRecord[],
  userId?: string
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) return 0;
  let longest = 0;
  let run = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const dStr = format(d, 'yyyy-MM-dd');
    if (isDayComplete(dStr, exercises, diets, weights, userId)) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

/**
 * 计算各奖励阶梯的日期与状态
 *
 * 三种状态:
 *   - claimed  (已领取): 该阶梯已被当前用户领取，日期 = 领取日
 *   - claimable(可领取): streak >= requiredDays 且未领取，日期 = streak 达到 requiredDays 的那一天
 *   - locked   (未解锁): streak < requiredDays，日期 = 预计解锁日 = today + (requiredDays - streak)
 *
 * 日期计算:
 *   - claimed:   claim.claimDate 的日期部分
 *   - claimable: streakStartDate + (requiredDays - 1)
 *     （即连续打卡段中第 requiredDays 天完成的日期，不超过今天）
 *   - locked:    today + (requiredDays - streak)
 *     （从今天起还需 (requiredDays - streak) 天即可解锁）
 *
 * @param streak          当前连续打卡天数
 * @param streakStartDate 当前连续段起始日期
 * @param tiers           奖励阶梯配置列表
 * @param claims          所有领取记录（按 studentId 过滤当前用户）
 * @param userId          当前用户 ID
 */
export function getProjectedRewardDates(
  streak: number,
  streakStartDate: string | null,
  tiers: RewardTier[],
  claims: RewardClaimRef[] = [],
  userId?: string
): Array<{ tier: RewardTier; date: string | null; isUnlocked: boolean; isClaimed: boolean }> {
  const myClaims = claims.filter(c => c.studentId === userId);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return tiers.map(tier => {
    const claim = myClaims.find(c => c.tierId === tier.id);
    const isClaimed = !!claim;
    const isUnlocked = streak >= tier.requiredDays;
    let date: string | null = null;

    if (isUnlocked && streakStartDate) {
      // 已解锁（无论是否领取）：固定在连续段中第 requiredDays 天完成的日期
      const targetDate = addDays(new Date(streakStartDate), tier.requiredDays - 1);
      date = format(targetDate, 'yyyy-MM-dd');
      if (date > todayStr) {
        date = todayStr;
      }
    } else if (!isUnlocked && streakStartDate && streak > 0) {
      // 未解锁：预计解锁日期
      const targetDate = addDays(new Date(todayStr), tier.requiredDays - streak);
      date = format(targetDate, 'yyyy-MM-dd');
    }

    return { tier, date, isUnlocked, isClaimed };
  });
}
