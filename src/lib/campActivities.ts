/**
 * ============================================================================
 *  趣味活动 - 计算引擎（技术可直接参考本文档实现）
 * ============================================================================
 *
 *  【定位】独立于积分排名体系的第二条激励赛道。
 *    - 积分规则（scoring.ts）是企业合同约定项，【冻结、不可改】；
 *      本模块所有活动【不读不写】积分，仅基于打卡记录实时计算。
 *    - 学员端展示入口：CampActivitiesView.vue（首页"趣味活动"卡片进入）。
 *
 *  【三类活动】
 *    1. 阶梯减重达标奖 —— 按开营体重下降百分比判定（3% / 5% 两档）。
 *    2. 每周主题挑战   —— 可配置周数（默认 4 周），每周一个主题（启动/晨型人/多面手/冲刺循环）。
 *    3. 全勤幸运抽奖   —— 完成率 ≥ 80% 的学员进入结营抽奖池。
 *
 *  【营养师端交互】
 *    - 阶梯减重达标奖：学员达标后须上传"体重秤照片"，由营养师在管理后台
 *      确认后奖品才生效。前端只展示"待确认"状态，确认动作发生在线下或
 *      管理端（当前版本未内置确认 UI，属后端待办）。
 *    - 每周主题挑战 / 全勤抽奖：纯自动计算，无需营养师操作；
 *      营养师可在学员详情页口头/批注鼓励，不产生数据写操作。
 *
 *  【数据同步与异步性】
 *    - 本模块全部为【纯函数、同步、实时】计算：输入 = 当前 store 中该学员的
 *      打卡记录数组，输出 = 各活动进度。任何打卡提交/删除后重新渲染即自动更新。
 *    - 不涉及服务端轮询；后端只需保证打卡记录 CRUD 正确，活动进度由前端推导。
 *    - 营养师评分（dietitianScore）变化【不影响】活动进度（活动不看评分）。
 *
 *  【后端对接清单】
 *    - 里程碑确认表（新）：studentId + milestoneId + 照片URL + 确认状态 +
 *      确认人 + 确认时间。接口：POST /activity/milestone/confirm。
 *    - 抽奖结果表（新）：campId + studentId + 奖项 + 抽取时间。
 *      抽奖动作建议由后端执行并落库，前端只读结果。
 *    - 其余字段全部复用现有打卡记录表，无需新增。
 * ============================================================================
 */
import { format, addDays, differenceInCalendarDays } from 'date-fns';
import type { DietRecord, ExerciseRecord, WeightRecord } from '../types';
import { isDayComplete } from './streak';

// ─── 阶梯减重达标奖 ─────────────────────────────────────────

export interface WeightMilestone {
  id: string;
  label: string;
  /** 需要减掉的百分比（如 0.03 = 3%） */
  threshold: number;
  /** 学员当前是否达标 */
  achieved: boolean;
  /** 当前进度 0~1 */
  progress: number;
  /** 奖励说明 */
  reward: string;
}

/**
 * 计算阶梯减重达标情况
 *
 * 【规则】
 *   - 减重百分比 = (开营体重 - 历史最低体重) / 开营体重；
 *     使用历史最低而非最新体重，确保"达标即锁定"--
 *     学员不能通过输入低体重达标领奖后再改回高体重来作弊。
 *   - 两档：3%（一档礼品）、5%（二档礼品）。档位可同时达成（5% 必含 3%）。
 *   - progress = min(实际百分比 / 档位阈值, 1)，用于进度条展示。
 *   - 无体重记录或无开营体重时，返回未开始的初始状态（progress=0）。
 *
 * 【营养师交互】达标 ≠ 发奖。学员需上传体重秤照片，营养师在管理端确认后
 *   奖品才生效（见 ActivityAdminView 发奖入口）。本函数只负责"算出来"，不管"发不发"。
 *
 * 【同步性】同步纯函数，体重打卡后立即重算。
 *
 * @param weightRecords 学员体重记录
 * @param startWeight   开营体重（第一条记录或用户档案）
 */
export function computeWeightMilestones(
  weightRecords: WeightRecord[],
  startWeight: number | null,
): WeightMilestone[] {
  if (!startWeight || weightRecords.length === 0) {
    return [
      { id: 'm3', label: '达标 3%', threshold: 0.03, achieved: false, progress: 0, reward: '一档礼品' },
      { id: 'm5', label: '达标 5%', threshold: 0.05, achieved: false, progress: 0, reward: '二档礼品' },
    ];
  }

  // 使用历史最低体重：达标后不可逆，防止输入低体重领奖后改回高体重
  const minWeight = Math.min(...weightRecords.map(r => r.weight));
  const lossPercent = (startWeight - minWeight) / startWeight;

  return [
    {
      id: 'm3',
      label: '达标 3%',
      threshold: 0.03,
      achieved: lossPercent >= 0.03,
      progress: Math.min(lossPercent / 0.03, 1),
      reward: '一档礼品',
    },
    {
      id: 'm5',
      label: '达标 5%',
      threshold: 0.05,
      achieved: lossPercent >= 0.05,
      progress: Math.min(lossPercent / 0.05, 1),
      reward: '二档礼品',
    },
  ];
}

// ─── 每周主题挑战 ───────────────────────────────────────────

export interface WeeklyChallenge {
  id: string;
  weekIndex: number;
  title: string;
  description: string;
  icon: string;
  /** 是否当前周 */
  isCurrent: boolean;
  /** 是否已完成 */
  completed: boolean;
  /** 当前进度文本（如 "3/5 天"） */
  progressText: string;
  /** 进度 0~1 */
  progress: number;
  /** 挑战状态 */
  status: 'locked' | 'active' | 'completed' | 'missed';
  /** 该周起始日期 yyyy-MM-dd */
  weekStart: string;
  /** 该周结束日期 yyyy-MM-dd */
  weekEnd: string;
}

/**
 * 获取当前是挑战第几周（1 ~ challengeWeeks）
 *
 * 【规则】优先使用 challengeStartDate，其次 campStartDate，最后回退到学员首次打卡日。
 *   第 N 周 = floor((今天-起点)/7)+1，超过 challengeWeeks 按 challengeWeeks 计。
 *
 * 【独立配置】challengeStartDate 和 challengeWeeks 由 ActivityConfig 提供，
 *   独立于营期开营日。未配置时回退到 campStartDate，周数默认 4。
 */
export function getCampWeekIndex(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
  campStartDate?: string,
  challengeStartDate?: string,
  challengeWeeks?: number,
): number {
  const effectiveStart = challengeStartDate || campStartDate;
  const maxWeeks = challengeWeeks || 4;

  if (effectiveStart) {
    const start = new Date(effectiveStart);
    const today = new Date();
    const diff = differenceInCalendarDays(today, start);
    if (diff < 0) return 0; // 挑战尚未开始
    return Math.min(Math.floor(diff / 7) + 1, maxWeeks);
  }

  // 回退：学员首次打卡日
  const allDates = new Set<string>();
  dietRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
  exerciseRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
  weightRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });

  if (allDates.size === 0) return 1;
  const start = new Date(Array.from(allDates).sort()[0]);
  const today = new Date();
  return Math.min(Math.floor(differenceInCalendarDays(today, start) / 7) + 1, maxWeeks);
}

/**
 * 计算每周主题挑战进度
 *
 * 【规则】可配置周数（默认 4 周），每周一个主题。周区间以 challengeStartDate
 *   为起点，按滚动 7 天划分（第1周 = 开始日期 ~ 开始日期+6，第2周 = +7 ~ +13…）：
 *   - w1 启动周：该周内【完成全部打卡】（三餐+运动+体重，isDayComplete）>= 5 天
 *   - w2 晨型人周：该周内运动打卡时间在 05:00-09:00 的记录 >= 3 次
 *   - w3 多面手周：该周内出现过的不同运动类型 >= 3 种
 *   - w4 冲刺周：该周内完成全部打卡 >= 6 天（更严格，制造冲刺感）
 *   周数 > 4 时按上述 4 周主题循环重复。
 *   状态机：locked（未到周）/ active（本周进行中）/ completed（达标）/ missed（过期未达标）。
 *   每周均为完整7天，无论开始日期是星期几，学员都有公平的打卡时间。
 *
 * 【独立配置】challengeStartDate 和 challengeWeeks 独立于营期开营日，
 *   由 ActivityConfig.weeklyChallengeStartDate / weeklyChallengeWeeks 提供。
 *   未配置时回退到 campStartDate，周数默认 4。
 *
 * 【营养师交互】无需操作；营养师端可在学员详情看到学员活跃周，用于话题引导。
 *
 * 【同步性】同步纯函数。w2 的时间判断依赖记录时间字符串中含 "HH:mm" 部分；
 *   若后端存的是纯日期（无时刻），晨型人周恒为 0 次--后端需保证运动记录带时刻。
 */

// -- Challenge definition templates (cycled for weeks > 4) --
type ChallengeMode = 'completeDays' | 'earlyMorning' | 'exerciseTypes';

interface ChallengeDef {
  title: string;
  icon: string;
  description: string;
  target: number;
  unit: string;
  mode: ChallengeMode;
}

/** 8 周挑战主题模板；超过 8 周循环重复 */
const CHALLENGE_DEFS: ChallengeDef[] = [
  { title: '启动周', icon: '🚀', description: '完成 5 天全部打卡（三餐+运动+体重）', target: 5, unit: '天', mode: 'completeDays' },
  { title: '晨型人周', icon: '🌅', description: '3 次在早上 9 点前完成运动打卡', target: 3, unit: '次', mode: 'earlyMorning' },
  { title: '多面手周', icon: '🎽', description: '尝试 3 种不同类型的运动', target: 3, unit: '种', mode: 'exerciseTypes' },
  { title: '绿色饮食周', icon: '🥗', description: '完成 6 天全部打卡，每餐都有蔬菜', target: 6, unit: '天', mode: 'completeDays' },
  { title: '力量周', icon: '💪', description: '4 次在早上 9 点前完成运动打卡', target: 4, unit: '次', mode: 'earlyMorning' },
  { title: '柔韧周', icon: '🧘', description: '尝试 3 种不同类型的运动', target: 3, unit: '种', mode: 'exerciseTypes' },
  { title: '全能周', icon: '⚡', description: '完成 7 天全部打卡，全方位自律', target: 7, unit: '天', mode: 'completeDays' },
  { title: '冲刺周', icon: '🏁', description: '完成 6 天全部打卡，为结营冲刺', target: 6, unit: '天', mode: 'completeDays' },
];

export function computeWeeklyChallenges(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
  options?: { challengeStartDate?: string; challengeWeeks?: number; campStartDate?: string },
): WeeklyChallenge[] {
  const challengeStartDate = options?.challengeStartDate || options?.campStartDate;
  const challengeWeeks = options?.challengeWeeks || 4;

  const currentWeek = getCampWeekIndex(
    dietRecords, exerciseRecords, weightRecords, userId,
    options?.campStartDate, options?.challengeStartDate, challengeWeeks,
  );

  // Determine challenge start: prefer challengeStartDate/campStartDate, fall back to first checkin
  const challengeStart = challengeStartDate
    ? new Date(challengeStartDate)
    : (() => {
        const allDates = new Set<string>();
        dietRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
        exerciseRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
        weightRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
        return allDates.size > 0 ? new Date(Array.from(allDates).sort()[0]) : new Date();
      })();

  // Get week-filtered records and date range for a given week index
  // 滚动7天周期：第N周 = 开始日期 + (N-1)*7 ~ 开始日期 + N*7-1
  const getWeekRecords = (weekIdx: number) => {
    const ws = addDays(challengeStart, (weekIdx - 1) * 7);
    const we = addDays(ws, 6);
    const wsStr = format(ws, 'yyyy-MM-dd');
    const weStr = format(we, 'yyyy-MM-dd');

    const filter = <T extends { date: string; studentId?: string }>(arr: T[]): T[] =>
      arr.filter((r) => {
        if (userId && r.studentId && r.studentId !== userId) return false;
        const d = r.date.substring(0, 10);
        return d >= wsStr && d <= weStr;
      });

    return { diets: filter(dietRecords), exercises: filter(exerciseRecords), weights: filter(weightRecords), wsStr, weStr };
  };

  const challenges: WeeklyChallenge[] = [];

  for (let weekIdx = 1; weekIdx <= challengeWeeks; weekIdx++) {
    const def = CHALLENGE_DEFS[(weekIdx - 1) % CHALLENGE_DEFS.length];
    const { diets, exercises, weights, wsStr, weStr } = getWeekRecords(weekIdx);

    let count = 0;
    if (def.mode === 'completeDays') {
      const allDates = new Set<string>();
      diets.forEach((r) => allDates.add(r.date.substring(0, 10)));
      exercises.forEach((r) => allDates.add(r.date.substring(0, 10)));
      weights.forEach((r) => allDates.add(r.date.substring(0, 10)));
      allDates.forEach((d) => {
        if (isDayComplete(d, exerciseRecords, dietRecords, weightRecords, userId)) count++;
      });
    } else if (def.mode === 'earlyMorning') {
      count = exercises.filter((r) => {
        const t = r.date.split(' ')[1] || '';
        return t >= '05:00' && t < '09:00';
      }).length;
    } else if (def.mode === 'exerciseTypes') {
      count = new Set(exercises.map((r) => r.type)).size;
    }

    const done = count >= def.target;
    challenges.push({
      id: `w${weekIdx}`,
      weekIndex: weekIdx,
      title: def.title,
      icon: def.icon,
      description: def.description,
      isCurrent: currentWeek === weekIdx,
      completed: done,
      progressText: `${count}/${def.target} ${def.unit}`,
      progress: Math.min(count / def.target, 1),
      status: done ? 'completed' : currentWeek === weekIdx ? 'active' : currentWeek > weekIdx ? 'missed' : 'locked',
      weekStart: wsStr,
      weekEnd: weStr,
    });
  }

  return challenges;
}

// ─── 全勤幸运抽奖 ───────────────────────────────────────────

export interface LuckyDrawInfo {
  /** 是否满足抽奖条件 */
  eligible: boolean;
  /** 完成率 0~1 */
  completionRate: number;
  /** 完成全部打卡的天数 */
  completeDays: number;
  /** 营期天数 */
  campDays: number;
  /** 进度文本 */
  progressText: string;
}

/**
 * 计算全勤抽奖资格
 *
 * 【规则】
 *   - 完成率 = 完成全部打卡的天数 ÷ 营期总天数（默认 28，可配）。
 *   - 完成率 ≥ 0.8（即 28 天营需 ≥ 23 天）→ 进入结营抽奖池。
 *   - 抽奖本身【不在前端执行】：避免前端随机数可被篡改，建议结营时由后端
 *     统一抽取并落库，前端只展示"已获得资格/还差 X 天"。
 *
 * 【营养师交互】结营时营养师/运营导出资格名单；前端 eligible 仅为预测，
 *   最终名单以后端结算为准（防止营期最后一天数据补录造成偏差）。
 *
 * 【同步性】同步纯函数，每次打卡后实时重算进度条。
 */
export function computeLuckyDraw(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  weightRecords: WeightRecord[],
  userId?: string,
  campDays: number = 28,
): LuckyDrawInfo {
  // 收集所有打卡日期
  const allDates = new Set<string>();
  dietRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
  exerciseRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });
  weightRecords.forEach((r) => { if (!userId || r.studentId === userId) allDates.add(r.date.substring(0, 10)); });

  let completeDays = 0;
  allDates.forEach((d) => {
    if (isDayComplete(d, exerciseRecords, dietRecords, weightRecords, userId)) completeDays++;
  });

  const completionRate = campDays > 0 ? Math.min(completeDays / campDays, 1) : 0;
  const eligible = completionRate >= 0.8;

  return {
    eligible,
    completionRate,
    completeDays,
    campDays,
    progressText: `${completeDays}/${campDays} 天`,
  };
}
