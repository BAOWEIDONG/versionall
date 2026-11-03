import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { showImagePreview } from 'vant';
import type { User, WeightRecord, ExerciseRecord, DietRecord, CheckinComment, CoachActivityRecord, RewardTier, RewardClaim, MealTimeConfig, MetricConfig, Camp, Account, PointProduct, PointExchangeRecord, ManualScoreRecord, ExchangeAuditEntry, ConfigAudit, RewardTierSnapshot, UnlockRecord, CampMessageEntry, BadgeConfig, BadgeRecord } from '../types';
import {
  MOCK_REWARD_TIERS,
  MOCK_REWARD_CLAIMS,
  DEFAULT_MEAL_TIME_CONFIG,
  MOCK_DIET_RECORDS,
  MOCK_WEIGHT_RECORDS,
  MOCK_EXERCISE_RECORDS,
  MOCK_COACH_ACTIVITIES,
  DEFAULT_METRIC_CONFIGS,
  MOCK_STUDENTS,
  MOCK_CAMPS,
  MOCK_ACCOUNTS,
  MOCK_POINT_PRODUCTS,
  MOCK_POINT_EXCHANGES,
  MOCK_MANUAL_SCORES,
  metricValuesFor,
  DEMO_SCHEMA_VERSION,
} from '../mock/data';
import * as api from '../lib/api';
import { calculateTotalScore } from '../lib/scoring';
import { nsKey } from '../lib/storage';
import { computeBadgeRecords, computeOneTimeBadgeRecords } from '../lib/badges';
import { generateStudentReport } from '../lib/campReport';
import { calculateStreak, calculateLongestStreakInRange } from '../lib/streak';
import { latestOrFirst, latestOrFirstId } from '../lib/camps';
import { loadMsgSeenState, saveMsgSeenState, systemMsgUnread } from '../lib/messageSeen';

/** 生成 yyyy-MM-dd HH:mm:ss 格式的当前时间字符串（全站统一格式） */
function formatDateTimeStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 按学员生成"入营问卷"本地存储键（submitted_questionnaire_<id> / draft_questionnaire_<id>）。
 *  入营问卷完成标志与提交数据必须按账户隔离——否则同一浏览器用不同账户(尤其新加的学生)
 *  时,会串用前一个学员的 localStorage(跳过问卷直达首页、健康档案显示别人的数据)。 */
export function questionnaireStorageKey(kind: 'submitted' | 'draft', studentId: string): string {
  return nsKey(`${kind === 'submitted' ? 'submitted_questionnaire' : 'draft_questionnaire'}_${studentId}`);
}

export type View =
  | 'login'
  | 'register'
  | 'questionnaire'
  | 'dashboard'
  | 'upload'
  | 'health-profile'
  | 'exercise'
  | 'diet'
  | 'weight-checkin'
  | 'calendar'
  | 'coach-dashboard'
  | 'coach-student-detail'
  | 'coach-unannotated-list'
  | 'activity-upload'
  | 'dietitian-dashboard'
  | 'dietitian-student-detail'
  | 'dietitian-unannotated-list'
  | 'activities-list'
  | 'video-player'
  | 'camp-summary'
  | 'camp-report'
  | 'enterprise-report'
  | 'camp-activities'
  | 'personal-journey'
  | 'ranking'
  | 'pointsDetail'
  | 'reward'
  | 'reward-config'
  | 'meal-time-config'
  | 'metric-config'
  | 'activity-admin'
  | 'messages'
  | 'account-manage'
  | 'dietitian-config'
  | 'activity-hub'
  | 'points-mall'
  | 'fulfillment-center'
  | 'my-rewards'
  | 'camp-stats'
  | 'attendance-board'
  | 'badge-center'
  | 'badge-config'
  | 'supervisor-dashboard';

/** 趣味活动配置（营养师端可切换开关；学员端按此展示） */
export interface ActivityConfig {
  /** 阶梯达标奖 */
  weightMilestone: boolean;
  /** 每周主题挑战 */
  weeklyChallenge: boolean;
  /** 全勤幸运抽奖 */
  luckyDraw: boolean;
  /** 积分商城开关 */
  pointsMall: boolean;
  /** 连续打卡奖励开关（学员端首页「连续打卡」活动入口按此显示） */
  checkinStreak: boolean;
  /** 每周挑战独立配置：开始日期（不填则用营期开营日） */
  weeklyChallengeStartDate?: string;
  /** 每周挑战独立配置：总周数（默认4周） */
  weeklyChallengeWeeks?: number;
}

/** 新营期默认徽章：里程碑 / 成就 / 活动三类，全部可在营养师端增删改 */
function defaultBadges(campId: string): BadgeConfig[] {
  const base = { campId, active: true };
  return [
    // 里程碑（一次性，减重 %）
    { ...base, id: 'm_3', category: 'milestone', name: '减重 3% 里程碑', cadence: 'day', condition: 'weight_loss_percent', threshold: 3, icon: '🎯', description: '体重较开营下降 3%' },
    { ...base, id: 'm_5', category: 'milestone', name: '减重 5% 里程碑', cadence: 'day', condition: 'weight_loss_percent', threshold: 5, icon: '🎯', description: '体重较开营下降 5%' },
    // 成就（一次性）
    { ...base, id: 'a_streak7', category: 'achievement', name: '连续打卡 7 天', cadence: 'day', condition: 'streak_days', threshold: 7, icon: '🏆', description: '最长连续全项打卡满 7 天' },
    { ...base, id: 'a_streak14', category: 'achievement', name: '连续打卡 14 天', cadence: 'day', condition: 'streak_days', threshold: 14, icon: '🔥', description: '最长连续全项打卡满 14 天' },
    { ...base, id: 'a_streak28', category: 'achievement', name: '全勤先锋', cadence: 'day', condition: 'streak_days', threshold: 28, icon: '🏅', description: '最长连续全项打卡满 28 天' },
    { ...base, id: 'a_wl3', category: 'achievement', name: '减重 3kg', cadence: 'day', condition: 'weight_loss_kg', threshold: 3, icon: '⚖️', description: '体重下降达到 3kg' },
    { ...base, id: 'a_wl5', category: 'achievement', name: '减重 5kg', cadence: 'day', condition: 'weight_loss_kg', threshold: 5, icon: '👑', description: '体重下降达到 5kg' },
    { ...base, id: 'a_fat2', category: 'achievement', name: '燃脂勇士', cadence: 'day', condition: 'fat_loss_kg', threshold: 2, icon: '🔥', description: '脂肪量下降达到 2kg' },
    { ...base, id: 'a_early3', category: 'achievement', name: '晨型人', cadence: 'day', condition: 'early_exercise_count', threshold: 3, icon: '🌅', description: '早 9 点前完成运动满 3 次' },
    { ...base, id: 'a_endurance60', category: 'achievement', name: '耐力王', cadence: 'day', condition: 'single_exercise_minutes', threshold: 60, icon: '🏅', description: '单次运动达到 60 分钟' },
    { ...base, id: 'a_intensity5', category: 'achievement', name: '极限挑战', cadence: 'day', condition: 'max_intensity', threshold: 5, icon: '⚡', description: '完成一次 Lv.5 高强度运动' },
    { ...base, id: 'a_types3', category: 'achievement', name: '运动多面手', cadence: 'day', condition: 'exercise_type_count', threshold: 3, icon: '🎽', description: '尝试 3 种以上运动' },
    // 活动（周期性，可重复）
    { ...base, id: 'b_day', category: 'activity', name: '每日打卡', cadence: 'day', condition: 'checkin_days', threshold: 1, icon: '🌱', description: '每天完成任意一项打卡即获得' },
    { ...base, id: 'b_all', category: 'activity', name: '全项达标', cadence: 'day', condition: 'all_items', threshold: 1, icon: '✅', description: '当天早、中、晚、运动、体重全部完成' },
    { ...base, id: 'b_week', category: 'activity', name: '本周坚持', cadence: 'week', condition: 'checkin_days', threshold: 3, icon: '🏅', description: '一周内打卡满 3 天' },
    { ...base, id: 'b_month', category: 'activity', name: '月度坚持', cadence: 'month', condition: 'checkin_days', threshold: 5, icon: '🏆', description: '一个月内打卡满 5 天' },
  ];
}

export const useAppStore = defineStore('app', () => {
  const user = ref<User | null>(null);
  /** 结营寄语列表（支持多条：多名营养师/教练各自撰写提交，append 不覆盖）。
   *  种子含 camp1_s1 的 3 条，演示"营养师 + 教练 多条寄语带角色姓名"的展示效果。 */
  const campMessageList = ref<CampMessageEntry[]>([
    {
      id: 'cm1', campId: 'camp1', studentId: 's1', role: 'dietitian', authorName: '王营养师', authorId: 'd1',
      text: '坚持下来很不容易，你的自律大家都看在眼里。这段时间养成的饮食和运动习惯是最好的收获，继续保持，健康是一辈子的事！',
      createdAt: '2026-09-01 09:12:00',
    },
    {
      id: 'cm3', campId: 'camp1', studentId: 's1', role: 'dietitian', authorName: '张营养师',
      text: '注意结营后的回弹控制：聚餐后下一餐清淡，每天 1500ml 饮水别断，2 周后回来复测体成分。',
      createdAt: '2026-09-03 10:05:00',
    },
    {
      id: 'cm4', campId: 'camp1', studentId: 's13', role: 'dietitian', authorName: '王营养师', authorId: 'd1',
      text: '这段时间你的打卡完成度是全营最高的，饮食结构也稳定了。结营后先保持现在的三餐节奏，两周内不要突然放开主食。',
      createdAt: '2026-11-02 10:20:00',
    },
    {
      id: 'cm5', campId: 'camp1', studentId: 's13', role: 'coach', authorName: '李教练', authorId: 'c1',
      text: '运动习惯已经建立起来了，接下来把频率保持在一周 4 次，强度可以慢慢加到中等偏上，记得每次练完拉伸。',
      createdAt: '2026-11-02 18:40:00',
    },
    {
      id: 'cm6', campId: 'camp2', studentId: 's13', role: 'dietitian', authorName: '李营养师', authorId: 'd2',
      text: '第二期刚开营，先把早餐和饮水固定下来，前一周不用刻意节食，把节奏跑顺最重要。',
      createdAt: '2026-11-03 09:10:00',
    },
    {
      id: 'cm7', campId: 'camp1', studentId: 's2', role: 'dietitian', authorName: '王营养师', authorId: 'd1',
      text: '8 天连续完成很不容易，体重下降也在健康区间。后面重点看腰围和体脂，不用只盯体重数字。',
      createdAt: '2026-11-01 15:00:00',
    },
    {
      id: 'cm8', campId: 'camp1', studentId: 's14', role: 'coach', authorName: '王教练', authorId: 'c2',
      text: '你的有氧基础不错，建议每周加两次力量训练，把肌肉量守住，减脂会更稳。',
      createdAt: '2026-11-02 19:30:00',
    },
  ]);

  /** 趣味活动开关（按营期独立配置，营养师端配置，学员端按此展示） */
  /** 每周挑战默认关闭：需营养师先设置开始日期，再手动开启 */
  const activityConfigByCamp = ref<Record<string, ActivityConfig>>({
    camp1: { weightMilestone: true, weeklyChallenge: false, luckyDraw: true, pointsMall: true, checkinStreak: true, weeklyChallengeWeeks: 4 },
    camp2: { weightMilestone: true, weeklyChallenge: false, luckyDraw: true, pointsMall: true, checkinStreak: true, weeklyChallengeWeeks: 4 },
    camp3: { weightMilestone: false, weeklyChallenge: false, luckyDraw: false, pointsMall: false, checkinStreak: false, weeklyChallengeWeeks: 4 },
  });

  /** 获取指定营期的活动配置（无配置时返回全关默认值） */
  function getActivityConfig(campId: string | null | undefined): ActivityConfig {
    if (!campId) return { weightMilestone: false, weeklyChallenge: false, luckyDraw: false, pointsMall: false, checkinStreak: false, weeklyChallengeWeeks: 4 };
    return activityConfigByCamp.value[campId] || { weightMilestone: false, weeklyChallenge: false, luckyDraw: false, pointsMall: false, checkinStreak: false, weeklyChallengeWeeks: 4 };
  }

  /** 该营期是否有「实际可见」的活动（判定口径与学员端活动页空态完全一致）：
   *  积分商城开启，或 连续打卡奖励开启且存在对应奖品档(streak tier)，任一即算有活动。
   *  决定学员端底部菜单是否显示「活动」tab：无活动则隐藏，仅留 首页/消息/档案（三等分）。 */
  function getHasActivity(campId: string | null | undefined): boolean {
    const cfg = getActivityConfig(campId);
    if (cfg.pointsMall) return true;
    if (cfg.checkinStreak) {
      const tiers = campId
        ? rewardTiers.value.filter((t) => !t.campId || t.campId === campId)
        : rewardTiers.value;
      if (tiers.some((t) => t.source === 'streak' && t.active !== false)) return true;
    }
    return false;
  }

  /** 更新指定营期的活动配置 */
  function updateActivityConfig(campId: string, updates: Partial<ActivityConfig>) {
    const current = getActivityConfig(campId);
    const merged = { ...current, ...updates };
    activityConfigByCamp.value = {
      ...activityConfigByCamp.value,
      [campId]: merged,
    };
    api.updateActivityConfigApi(campId, merged as Record<string, unknown>).catch(() => {});
  }

  /** 发布/编辑一条结营寄语（每个营养师对同一 营期+学员 只发布一条：本人已发布则"编辑更新该条"，未发布才新增；authorId 记作者账号）。
   *  空文本不写入。 */
  function addCampMessage(campId: string, studentId: string, text: string, role: 'dietitian' | 'coach', authorName: string, authorId?: string) {
    const t = text.trim();
    if (!t) return;
    const authorMatch = (m: CampMessageEntry) => m.campId === campId && m.studentId === studentId
      && (authorId ? m.authorId === authorId : (m.role === role && m.authorName === (authorName || '营养师')));
    const idx = campMessageList.value.findIndex(authorMatch);
    if (idx >= 0) {
      // 已发布：编辑更新该条（保留 id/发布作者，替换文案）
      campMessageList.value.splice(idx, 1, { ...campMessageList.value[idx], text: t });
    } else {
      campMessageList.value.push({
        id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        campId,
        studentId,
        role,
        authorName: authorName || '营养师',
        authorId,
        text: t,
        createdAt: formatDateTimeStr(),
      });
    }
    api.saveCampMessage(campId, studentId, t).catch(() => {});
  }

  /** 该学员该营期的全部结营寄语（按撰写先后排列，逐条展示） */
  function getCampMessages(campId: string, studentId: string): CampMessageEntry[] {
    return campMessageList.value.filter((m) => m.campId === campId && m.studentId === studentId);
  }

  /** 编辑本人撰写的一条结营寄语（仅作者本人触发；非本人寄语各端只读不提供编辑入口）。空文本删除该条。 */
  function updateCampMessage(messageId: string, text: string) {
    const t = text.trim();
    const idx = campMessageList.value.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    if (!t) { campMessageList.value.splice(idx, 1); return; }
    campMessageList.value.splice(idx, 1, { ...campMessageList.value[idx], text: t });
    api.saveCampMessage(campMessageList.value[idx].campId, campMessageList.value[idx].studentId, t).catch(() => {});
  }

  /** 将某学员的全部打卡批注标记为已读（进入学员端消息中心时调用，清底栏未读角标）。 */
  function markAllCommentsRead(studentId: string) {
    const touch = (arr: any[]) => { for (const r of arr) {
      if (r.studentId === studentId && r.commentRead === false) r.commentRead = true;
    } };
    touch(dietRecords.value); touch(weightRecords.value); touch(exerciseRecords.value);
  }

  // 当前登录学员「系统通知最近查看时刻」的响应式版本。各页面角标统一读它，进入消息中心(considerAllRead)时 markSystemSeenAt 刷新，
  // 使所有 KeepAlive 缓存页的角标 computed 同时重算为 0，根治「进消息中心不清、且各页显示不一致」。
  const systemSeenAt = ref<number>(0);
  watch(() => user.value?.id, (id) => {
    systemSeenAt.value = id ? loadMsgSeenState(id).lastSystemSeenAt : 0;
  }, { immediate: true });

  /** 把当前登录学员的系统通知查看时刻置为现在并持久化（跨页角标响应式刷新）。 */
  function markSystemSeenAt() {
    systemSeenAt.value = Date.now();
    if (user.value) saveMsgSeenState(user.value.id, { lastSystemSeenAt: systemSeenAt.value });
  }

  // 已点开读过的「系统通知」id 列表（响应式镜像 seenState.readNotif）。只读不自动清：点开某条才算已读。
  // 各页角标(系统通知分支)与消息页内红点共用，markNotifRead 刷新后所有缓存页角标同步扣减。
  const readNotifIds = ref<string[]>([]);
  watch(() => user.value?.id, (id) => {
    readNotifIds.value = id ? (loadMsgSeenState(id).readNotif || []) : [];
  }, { immediate: true });

  /** 把某条系统通知标记为已读(点开它即读)，并持久化(跨页角标响应式)。 */
  function markNotifRead(notifId: string) {
    if (!user.value || !notifId) return;
    if (!readNotifIds.value.includes(notifId)) {
      readNotifIds.value = [...readNotifIds.value, notifId];
      saveMsgSeenState(user.value.id, { readNotif: readNotifIds.value });
    }
  }

  /** 某条系统通知是否未读 = 事件晚于查看基线 且 未被点开读过（与消息页红点口径一致）。 */
  function isNotifUnread(date: string | undefined | null, notifId?: string): boolean {
    return systemMsgUnread({ ranks: {}, lastSystemSeenAt: systemSeenAt.value, readNotif: readNotifIds.value }, date, notifId);
  }

  /** 把某条打卡记录的批注标记为已读（学生点开该批注消息时调用，仅清这一条，勿整体清）。 */
  function markCommentRead(type: 'diet' | 'weight' | 'exercise', recordId: string) {
    const arr = type === 'diet' ? dietRecords.value : type === 'weight' ? weightRecords.value : exerciseRecords.value;
    const r = arr.find((item) => item.id === recordId);
    if (r) (r as any).commentRead = true;
  }
  const viewHistory = ref<View[]>(['login']);
  const currentView = computed<View>(() => viewHistory.value[viewHistory.value.length - 1]);

  const questionnaireAnswered = ref(false);
  const students = ref<typeof MOCK_STUDENTS>([...MOCK_STUDENTS]);
  const weightRecords = ref<WeightRecord[]>([...MOCK_WEIGHT_RECORDS]);
  const exerciseRecords = ref<ExerciseRecord[]>([...MOCK_EXERCISE_RECORDS]);
  const dietRecords = ref<DietRecord[]>([...MOCK_DIET_RECORDS]);
  const coachActivities = ref<CoachActivityRecord[]>([...MOCK_COACH_ACTIVITIES]);
  // 正在编辑的教练活动（from coach dashboard → activity-upload 编辑模式）
  const editingActivity = ref<CoachActivityRecord | null>(null);
  // 教练端首页当前激活 Tab（持久化，返回/编辑发布后回到对应 Tab，而非重置到「未运动」）
  const coachDashboardTab = ref<'incomplete' | 'completed' | 'activities'>('incomplete');
  const rewardTiers = ref<RewardTier[]>([...MOCK_REWARD_TIERS]);
  const rewardClaims = ref<RewardClaim[]>([...MOCK_REWARD_CLAIMS]);
  /** 学员已解锁(达到连续天数)但尚未领取的连续打卡档位快照。解锁即落盘,使后续下架/删除不影响已解锁记录的显示与领取（资格快照语义）。 */
  const unlockRecords = ref<UnlockRecord[]>([]);
  /** 营养师奖品/商品配置操作审计（新增/编辑/上架/下架/删除），按时间倒序 */
  const configAudits = ref<ConfigAudit[]>([]);
  function recordConfigAudit(entry: Omit<ConfigAudit, 'id' | 'operatorTime' | 'operator'> & Partial<Pick<ConfigAudit, 'operator'>>) {
    configAudits.value.unshift({
      id: `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      operator: entry.operator || user.value?.name || '营养师',
      operatorTime: formatDateTimeStr(),
      ...entry,
    });
    if (configAudits.value.length > 200) configAudits.value.splice(200);
  }
  const mealTimeConfigByCamp = ref<Record<string, MealTimeConfig>>({});
  const metricConfigs = ref<MetricConfig[]>([...DEFAULT_METRIC_CONFIGS]);

  /** 营期列表 */
  const camps = ref<Camp[]>([...MOCK_CAMPS]);
  /** 账户列表（手机号=登录凭证） */
  const accounts = ref<Account[]>([...MOCK_ACCOUNTS]);

  /** 徽章配置（按营期独立，营养师可增删改） */
  const badgeConfigsByCamp = ref<Record<string, BadgeConfig[]>>({
    camp1: defaultBadges('camp1'),
    camp2: defaultBadges('camp2'),
  });
  /** 学员徽章获得记录（达成即记 1 枚） */
  const badgeRecords = ref<BadgeRecord[]>([]);

  const selectedStudentId = ref<string | null>(null);
  const selectedDateStr = ref<string | null>(null);
  /** 营养师首页「昨天/今天」切换后进入打卡情况看板的初始日期 */
  const attendanceBoardDate = ref<string>('');
  // 教练批注深链：跳转到某条运动记录（教练学员详情页滚动定位到该条后清空）
  const coachFocusRecordId = ref<string | null>(null);


  /** 学员端当前选中的营期 ID（多期学员可切换；null 时自动取第一个 active 营期） */
  const selectedCampId = ref<string | null>(null);

  /** 学员详情（营养师/教练查看某学员档案）流内的营期上下文，独立于全局 selectedCampId，不影响首页营期 */
  const detailSelectedCampId = ref<string | null>(null);

  /** 刚完成打卡标记（用于返回首页时触发成就/里程碑检测） */
  const justCheckedIn = ref(false);

  /** 待批注列表点击跳转时携带的目标记录信息（用于营养师端自动切 Tab + 滚动定位） */
  const pendingRecordType = ref<'diet' | 'weight' | 'exercise' | null>(null);
  const pendingRecordId = ref<string | null>(null);

  function setPendingAnnotation(type: 'diet' | 'weight' | 'exercise' | null, recordId: string | null = null) {
    pendingRecordType.value = type;
    pendingRecordId.value = recordId;
  }

  const videoPreview = ref<{ url: string } | null>(null);

  // 联调加载：USE_MOCK=true 时返回同一份 mock（无副作用）；USE_MOCK=false 时从后端拉取
  async function init() {
    // 已有本地持久化的业务数据时直接回读，避免后续被 MOCK 种子覆盖（保证发货/批注等成果刷新后仍在）
    if (restoreBiz()) return;
    try {
      const [studentList, diet, exercise, weight, activities, tiers, claims, metricCfgs, campList, accountList, products, exchanges] = await Promise.all([
        api.getStudents(),
        api.getDietRecords(),
        api.getExerciseRecords(),
        api.getWeightRecords(),
        api.getCoachActivities(),
        api.getRewardTiers(),
        api.getRewardClaims(),
        api.getMetricConfigs(),
        api.getCamps(),
        api.getAccounts(),
        api.getPointProducts(),
        api.getPointExchanges(),
      ]);
      students.value = studentList;
      dietRecords.value = diet;
      exerciseRecords.value = exercise;
      weightRecords.value = weight;
      coachActivities.value = activities;
      rewardTiers.value = tiers;
      rewardClaims.value = claims;
      metricConfigs.value = metricCfgs;
      camps.value = campList;
      accounts.value = accountList;
      pointProducts.value = products;
      pointExchanges.value = exchanges;

      persistBiz(); // 首次拉取后建立持久化基线（记录被改前内存态无存储基线）

      // 按营期加载活动配置和餐时配置
      for (const camp of campList) {
        try {
          const [actCfg, mealCfg] = await Promise.all([
            api.getActivityConfig(camp.id),
            api.getMealTimeConfigByCamp(camp.id),
          ]);
          if (actCfg && Object.keys(actCfg).length > 0) {
            // TODO(api): getActivityConfig 返回 Record<string, unknown>，待后端接口定型后改返回 ActivityConfig 类型以去除该断言
            activityConfigByCamp.value = { ...activityConfigByCamp.value, [camp.id]: actCfg as unknown as ActivityConfig };
          }
          if (mealCfg) {
            mealTimeConfigByCamp.value = { ...mealTimeConfigByCamp.value, [camp.id]: mealCfg };
          }
        } catch {
          // 单个营期配置加载失败不影响整体
        }
      }
    } catch (e) {
      // 联调失败保留 mock 初值
    }
  }

  /** 默认展示最新营期：学员取本人所属期中最新的，教练取其负责期中最新的，营养师取全局最新的 */
  function applyLatestCampDefault() {
    if (!user.value) return;
    let pool: Camp[];
    if (user.value.role === 'student') {
      pool = getStudentCamps(user.value.id);
    } else if (user.value.role === 'coach') {
      pool = getCoachCamps();
    } else {
      pool = camps.value;
    }
    const latestId = latestOrFirstId(pool);
    if (latestId) selectedCampId.value = latestId;
  }

  function setUser(u: User | null) {
    user.value = u;
    if (u) {
      // 默认展示最新营期（学员取本人所属期中最新的，营养师/教练取全局最新的）
      applyLatestCampDefault();
      // 持久化登录态到 localStorage，实现保活
      const authData = {
        user: u,
        timestamp: Date.now(),
      };
      localStorage.setItem('camp_auth_versionall', JSON.stringify(authData));
    } else {
      localStorage.removeItem('camp_auth_versionall');
    }
  }

  /** 更新当前登录用户的个人信息（姓名/性别等），同步到 user + accounts + students + localStorage */
  function updateUserProfile(updates: Partial<User>) {
    if (!user.value) return;
    user.value = { ...user.value, ...updates };
    // 同步 name/gender/age 到 students 列表
    if (updates.name !== undefined || updates.gender !== undefined || updates.age !== undefined) {
      students.value = students.value.map((s) =>
        s.id === user.value!.id
          ? { ...s, name: updates.name ?? s.name, gender: updates.gender ?? s.gender, age: updates.age ?? s.age }
          : s,
      );
    }
    // 同步 name 到 accounts 列表（营养师端账号管理可见）
    if (updates.name !== undefined) {
      accounts.value = accounts.value.map((a) =>
        a.id === user.value!.id ? { ...a, name: updates.name! } : a,
      );
    }
    // 重新持久化
    const authData = { user: user.value, timestamp: Date.now() };
    localStorage.setItem('camp_auth_versionall', JSON.stringify(authData));
  }

  /** 从 localStorage 恢复登录态（页面刷新/重新打开时自动登录） */
  function restoreAuth(): boolean {
    try {
      const raw = localStorage.getItem('camp_auth_versionall');
      if (!raw) return false;
      const data = JSON.parse(raw);
      // 30 天过期
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - data.timestamp > maxAge) {
        localStorage.removeItem('camp_auth_versionall');
        return false;
      }
      if (data.user && data.user.role) {
        // P0：退营学员刷新/重开不得自动重登——重查 active（登录时已拦，但持久化 camp_auth 会绕过）
        // 注意：init() 的 restoreBiz() 尚未执行，此时 accounts.value 还是 mock，必须直接读持久化快照
        if (data.user.role === 'student') {
          let accountPool = accounts.value;
          try {
            const rawBiz = localStorage.getItem('camp_biz_data_versionall');
            const snap = rawBiz ? JSON.parse(rawBiz) : null;
            if (snap && Array.isArray(snap.accounts) && snap.accounts.length > 0) accountPool = snap.accounts;
          } catch { /* 快照损坏时回退内存账户 */ }
          const account = accountPool.find((a) => a.id === data.user.id && a.role === 'student');
          if (account && account.active === false) {
            localStorage.removeItem('camp_auth_versionall');
            return false;
          }
        }
        user.value = data.user;
        // 权限以账户数据为准：授权/收回后刷新页面也能生效
        const acc = accounts.value.find((a) => a.id === data.user.id || a.phone === data.user.phone);
        if (acc) user.value = { ...user.value, supervisor: acc.supervisor === true };
        // 默认展示最新营期
        applyLatestCampDefault();
        // 恢复问卷状态（按学员隔离，防止串用他人问卷数据）
        const qSaved = localStorage.getItem(questionnaireStorageKey('submitted', data.user.id));
        questionnaireAnswered.value = !!qSaved;
        // 根据角色和问卷状态跳转到对应首页
        if (data.user.role === 'coach') {
          viewHistory.value = ['coach-dashboard'];
        } else if (data.user.role === 'dietitian') {
          viewHistory.value = ['dietitian-dashboard'];
        } else {
          // 学员：已填问卷 -> 首页，未填 -> 问卷页
          viewHistory.value = [qSaved ? 'dashboard' : 'questionnaire'];
        }
        return true;
      }
    } catch (e) {
      // JSON 解析失败，清除无效数据
      localStorage.removeItem('camp_auth_versionall');
    }
    return false;
  }

  /** 学员是否已退营（active=false）。退营是全局状态，任何资金/打卡写操作都须守此闸门。 */
  function isStudentDisabled(studentId: string): boolean {
    const acc = accounts.value.find((a) => a.id === studentId && a.role === 'student');
    return acc ? acc.active === false : false;
  }

  /** 退出登录 */
  function logout() {
    user.value = null;
    selectedCampId.value = null;
    localStorage.removeItem('camp_auth_versionall');
    viewHistory.value = ['login'];
  }

  /** 底部 Tab 根页面（切换时去重，避免历史栈无限增长） */
  // 学员端底部Tab：首页/消息/活动/档案（无活动配置时「活动」自动隐藏）；教练/营养师端各自的底部Tab根页
  const TAB_ROOTS: View[] = ['dashboard', 'messages', 'activity-hub', 'health-profile', 'coach-dashboard', 'dietitian-dashboard', 'dietitian-unannotated-list', 'dietitian-config', 'supervisor-dashboard'];

  /** 学员详情流视图：在此流内继承 detailSelectedCampId，离开则清空（不污染全局 selectedCampId） */
  const DETAIL_FLOW_VIEWS: View[] = ['dietitian-student-detail', 'coach-student-detail', 'pointsDetail'];

  function setCurrentView(view: View) {
    // 运营总览守卫：无督导权限一律拦截（含底部 Tab / 历史栈可达路径）
    if (view === 'supervisor-dashboard' && !user.value?.supervisor) return;
    // 入营问卷强制守卫：学员未完成问卷前，任何跳转一律被拉回问卷页，
    // 杜绝通过其它残留入口(如旧数据上传页 setCurrentView('dashboard'))绕过问卷直接进首页。
    // 以 localStorage 的 submitted_questionnaire 为权威完成标志（提交成功后立刻写入）。
    if (view !== 'questionnaire') {
      const completed = user.value
        ? !!localStorage.getItem(questionnaireStorageKey('submitted', user.value.id))
        : true;
      if (user.value?.role === 'student' && !completed) view = 'questionnaire';
    }
    const current = viewHistory.value[viewHistory.value.length - 1];
    if (current === view) return;

    // Tab 根页面切换：若目标根页已在历史栈中，截断到该位置（模拟原生 Tab 行为）；
    // 尚未进入过历史栈时（如登录/首次切换该根页），必须 push，否则无法跳转。
    if (TAB_ROOTS.includes(view)) {
      const idx = viewHistory.value.lastIndexOf(view);
      if (idx >= 0) {
        viewHistory.value = viewHistory.value.slice(0, idx + 1);
        // 回到根页面时清空详情流营期上下文
        detailSelectedCampId.value = null;
        return;
      }
    }

    viewHistory.value.push(view);
    // 离开详情流时清空详情营期上下文
    if (!DETAIL_FLOW_VIEWS.includes(view)) detailSelectedCampId.value = null;
  }

  function goBack() {
    if (viewHistory.value.length > 1) {
      viewHistory.value.pop();
      if (!DETAIL_FLOW_VIEWS.includes(currentView.value)) detailSelectedCampId.value = null;
    }
  }

  function setQuestionnaireAnswered(v: boolean) {
    questionnaireAnswered.value = v;
  }

  function addWeightRecord(record: WeightRecord) {
    if (isStudentDisabled(record.studentId)) return; // 退营学员禁止继续打卡
    weightRecords.value.push(record);
    api.createWeightRecord(record).catch(() => {});
  }

  /** 更新体重记录（营养师批注使用） */
  function updateWeightRecord(id: string, updates: Partial<WeightRecord>) {
    weightRecords.value = weightRecords.value.map((r) => (r.id === id ? { ...r, ...updates } : r));
    api.updateWeightRecord(id, updates).catch(() => {});
  }

  function addExerciseRecord(record: ExerciseRecord) {
    if (isStudentDisabled(record.studentId)) return; // 退营学员禁止继续打卡
    exerciseRecords.value.push(record);
    api.createExerciseRecord(record).catch(() => {});
  }

  /** 更新运动记录（营养师批注使用） */
  function updateExerciseRecord(id: string, updates: Partial<ExerciseRecord>) {
    exerciseRecords.value = exerciseRecords.value.map((r) => (r.id === id ? { ...r, ...updates } : r));
    api.updateExerciseRecord(id, updates).catch(() => {});
  }

  function addDietRecord(record: DietRecord) {
    if (isStudentDisabled(record.studentId)) return; // 退营学员禁止继续打卡
    // 幂等：同一学员、同一营期、同一天、同一餐次不重复插入（防绕过前端重复打卡）
    const day = (record.date || '').slice(0, 10);
    const exists = dietRecords.value.some(
      (r) => r.studentId === record.studentId
        && r.campId === record.campId
        && r.meal === record.meal
        && (r.date || '').startsWith(day),
    );
    if (exists) return;
    dietRecords.value.push(record);
    api.createDietRecord(record).catch(() => {});
  }

  function updateDietRecord(id: string, updates: Partial<DietRecord>) {
    dietRecords.value = dietRecords.value.map((r) => (r.id === id ? { ...r, ...updates } : r));
    api.updateDietRecord(id, updates).catch(() => {});
  }

  /**
   * 给打卡记录写批注（恢复「单一批注」语义）：一条记录营养师/教练**各只有一条批注**，
   * 谁编辑都改这同一条（保留最新内容，作者=最后编辑者），**不再为不同作者各新增一条**。
   * 同时镜像到单字段（dietitian 系 / coach 系），保证消息中心/未读计数等仍按单品逻辑工作。
   * ★并发：由 annotationLock 编辑锁保证「先后提交」，此处直接覆写为单条最新。
   */
  function addRecordComment(type: 'diet' | 'weight' | 'exercise', recordId: string, entry: CheckinComment) {
    const arr = type === 'diet' ? dietRecords.value : type === 'weight' ? weightRecords.value : exerciseRecords.value;
    const idx = arr.findIndex((r) => r.id === recordId);
    if (idx < 0) return;
    const r = arr[idx];
    // 覆盖为单条最新（幂等：同一作者重复编辑/不同作者编辑都只留下最新这一条）
    (r as any).comments = [{ ...entry }];
    (r as any).commentRead = false;
    if (type === 'exercise') {
      (r as any).coachComment = entry.text;
      (r as any).coachName = entry.name;
      (r as any).coachCommentDate = entry.date;
    } else {
      (r as any).dietitianComment = entry.text;
      (r as any).dietitianName = entry.name;
      (r as any).dietitianCommentDate = entry.date;
    }
  }

  // ─── 批注编辑锁（并发串行）──────────────────────────────────────────────
  // 同一浏览器多 Tab/账号共享 localStorage，避免两人同时对同一学员同一条记录批注互相覆盖（看不到对方批注）。
  // 打开批注编辑器即持锁，保存/取消/离开释放；持锁期间其他人打开→提示「X 正在编辑…请稍后再试」，实现先后提交。
  // TTL 3 分钟：持锁人异常离开（杀 Tab/崩溃）自动过期，防锁死。
  interface AnnotationLock { byId: string; byName: string; at: number; expiresAt: number }
  const ANNO_LOCK_KEY = nsKey('annotation_locks');
  const ANNO_LOCK_TTL = 3 * 60 * 1000;
  const annLockKey = (type: string, recordId: string) => `${type}:${recordId}`;
  function loadAnnLocks(): Record<string, AnnotationLock> {
    try {
      const raw = localStorage.getItem(ANNO_LOCK_KEY);
      if (!raw) return {};
      const m = JSON.parse(raw) || {};
      const now = Date.now();
      const clean: Record<string, AnnotationLock> = {};
      for (const k in m) { const l = m[k]; if (l && l.expiresAt > now) clean[k] = l; }
      return clean;
    } catch { return {}; }
  }
  function persistAnnLocks(m: Record<string, AnnotationLock>) {
    const now = Date.now();
    const clean: Record<string, AnnotationLock> = {};
    for (const k in m) { const l = m[k]; if (l && l.expiresAt > now) clean[k] = l; }
    try { clean ? localStorage.setItem(ANNO_LOCK_KEY, JSON.stringify(clean)) : localStorage.removeItem(ANNO_LOCK_KEY); } catch {}
  }

  /** 尝试对某条记录批注持锁。成功→已持锁可编辑；失败→他人正在编辑(返回 byName)。同一人重复调(=编辑中刷新)视为延长不视为冲突。 */
  function tryLockAnnotation(type: 'diet' | 'weight' | 'exercise', recordId: string, editorId: string, editorName: string) {
    const k = annLockKey(type, recordId);
    const m = loadAnnLocks();
    const cur = m[k];
    const now = Date.now();
    if (cur && cur.expiresAt > now && cur.byId !== editorId && cur.byName !== editorName) {
      return { ok: false, byName: cur.byName };
    }
    m[k] = { byId: editorId, byName: editorName, at: now, expiresAt: now + ANNO_LOCK_TTL };
    persistAnnLocks(m);
    return { ok: true, byName: editorName };
  }

  /** 释放某条记录的批注编辑锁（保存/取消/离开时调用）。 */
  function releaseAnnotationLock(type: 'diet' | 'weight' | 'exercise', recordId: string) {
    const k = annLockKey(type, recordId);
    const m = loadAnnLocks();
    if (m[k]) { delete m[k]; persistAnnLocks(m); }
  }

  /** 查看某条记录是否被他人持锁（只读场景提示用）。 */
  function annotationLockInfo(type: 'diet' | 'weight' | 'exercise', recordId: string) {
    const k = annLockKey(type, recordId);
    const cur = loadAnnLocks()[k];
    if (cur && cur.expiresAt > Date.now()) return { locked: true, byName: cur.byName };
    return { locked: false, byName: '' };
  }


  function addCoachActivity(record: CoachActivityRecord) {
    coachActivities.value.push(record);
    api.createCoachActivity(record).catch(() => {});
  }

  function updateCoachActivity(id: string, updates: Partial<CoachActivityRecord>) {
    const idx = coachActivities.value.findIndex((a) => a.id === id);
    if (idx >= 0) coachActivities.value[idx] = { ...coachActivities.value[idx], ...updates, id };
    api.updateCoachActivity(id, updates).catch(() => {});
  }

  function deleteCoachActivity(id: string) {
    coachActivities.value = coachActivities.value.filter((a) => a.id !== id);
    api.deleteCoachActivity(id).catch(() => {});
  }

  function setEditingActivity(record: CoachActivityRecord | null) {
    editingActivity.value = record;
  }

  function setSelectedStudentId(id: string | null) {
    selectedStudentId.value = id;
  }

  function setSelectedDateStr(date: string | null) {
    selectedDateStr.value = date;
  }

  function openImagePreview(urls: string[], index: number = 0) {
    if (urls.length > 0) {
      showImagePreview({ images: urls, startPosition: index, closeable: true });
    }
  }

  function openVideoPreview(url: string) {
    videoPreview.value = { url };
  }

  function addRewardTier(tier: RewardTier) {
    rewardTiers.value.push({ ...tier, sortValue: tier.sortValue ?? 0, version: 1 });
    recordConfigAudit({ module: 'tier', action: '新增', targetName: tier.name, campId: tier.campId, after: `连续${tier.requiredDays}天 · 库存 ${tier.stock}` });
    api.createRewardTier(tier).catch(() => {});
  }

  function updateRewardTier(id: string, updates: Partial<RewardTier>) {
    const prev = rewardTiers.value.find((t) => t.id === id);
    // 仅"配置编辑"（非系统内部扣库存）才 bump 版本 + 记配置审计；领取扣库存只改 stock 不记
    const isConfigEdit = Object.keys(updates).some((k) => k !== 'stock');
    rewardTiers.value = rewardTiers.value.map((t) =>
      (t.id === id ? { ...t, ...updates, ...(isConfigEdit ? { version: (t.version ?? 1) + 1 } : {}) } : t)
    );
    if (prev && isConfigEdit) {
      const next = rewardTiers.value.find((t) => t.id === id);
      recordConfigAudit({ module: 'tier', action: '编辑', targetName: prev.name, campId: prev.campId, before: `库存 ${prev.stock} v${prev.version ?? 1}`, after: `库存 ${next?.stock ?? prev.stock} v${(next?.version ?? prev.version ?? 1)}` });
    }
    api.updateRewardTier(id, updates).catch(() => {});
  }

  /** 删除奖励层级。新版口径：一旦出现资格/领取/发货/售后记录即禁止物理删除，只能下架或归档（历史以档位快照为准）。
   *  返回 {ok, reason}，由调用方提示拦截原因与连带影响。 */
  function deleteRewardTier(id: string): { ok: boolean; reason?: string } {
    const anyClaim = rewardClaims.value.filter((c) => c.tierId === id);
    if (anyClaim.length > 0) {
      const open = anyClaim.filter((c) => c.status === 'confirmed' || c.status === 'pending');
      return { ok: false, reason: open.length > 0
        ? `该奖励已有 ${open.length} 条未发货领取记录（待发货/待领取），无法删除`
        : `该奖励已产生 ${anyClaim.length} 条领取/发货记录，无法物理删除，只能下架或归档` };
    }
    const target = rewardTiers.value.find((t) => t.id === id);
    rewardTiers.value = rewardTiers.value.filter((t) => t.id !== id);
    if (target) recordConfigAudit({ module: 'tier', action: '删除', targetName: target.name, campId: target.campId, before: `连续${target.requiredDays}天` });
    api.deleteRewardTier(id).catch(() => {});
    return { ok: true };
  }

  /** 仅种子/内部使用：不做任何校验直接写领取记录。生产路径必须走 claimRewardTier（校验+扣库存的单一咽喉）。 */
  function addRewardClaim(claim: RewardClaim) {
    rewardClaims.value.push(claim);
    api.createRewardClaim(claim).catch(() => {});
  }

  /** 从 live 档位生成"锁定时快照"（解锁记录/领奖快照共用口径；供 claimRewardTier 复用，勿另写） */
  function snapshotOfTier(t: RewardTier): RewardTierSnapshot {
    return {
      name: t.name,
      imageUrl: t.imageUrl,
      requiredDays: t.requiredDays,
      deliveryMethods: t.deliveryMethods,
      version: t.version ?? 1,
    };
  }

  /** 记录学员"已解锁未领取"的连续打卡档位快照（幂等：id = `${studentId}_${tierId}` 唯一，重复传同档位不重复建）。
   *  在解锁的那一刻即落盘——营养师后续下架/删除该奖也不影响已解锁记录的显示与领取（资格快照语义）。 */
  function recordUnlockSnapshots(studentId: string, campId: string | null | undefined, tiers: RewardTier[]) {
    const existing = new Set(unlockRecords.value.map((r) => r.id));
    const news: UnlockRecord[] = [];
    for (const t of tiers) {
      const id = `${studentId}_${t.id}`;
      if (existing.has(id)) continue;
      existing.add(id);
      news.push({ id, studentId, campId: campId || undefined, tierId: t.id, snapshot: snapshotOfTier(t), unlockedDate: formatDateTimeStr() });
    }
    if (news.length) {
      unlockRecords.value = [...unlockRecords.value, ...news];
      persistBiz(); // 解锁是关键节点，立即落盘（避免防抖间隙丢失）
    }
  }

  /** 该学员（可带营期过滤）的已解锁未领取档位快照列表。快照在解锁时已固化，独立于当前档位（下架/删除不影响读取）。 */
  function getStudentUnlockRecords(studentId: string, campId?: string | null): UnlockRecord[] {
    return unlockRecords.value.filter(
      (r) => r.studentId === studentId && (!campId || !r.campId || r.campId === campId),
    );
  }

  /** 领取奖励单一咽喉（连续打卡领取 / 活动审核发放统一入口，仿 exchangePointProduct 加固模式）：
   *  ①按 id 实时重读 tier，校验存在与库存（剩余可发量语义）；②营期一致性（tier 绑定营期时须与领取营期一致，未绑定=全局共享）；
   *  ③once-per-tier 判重（同一学员同一 tier 仅可领取一次）；④全部通过才写 claim 记录并用 fresh tier 扣库存。
   *  连续打卡档位的"已解锁资格"采用快照语义：已解锁未领取的记录即使后来被营养师下架/删除，仍可凭解锁快照领取（资格一旦解锁永久保留）。
   *  真实上线须由服务端做权威校验（原子+幂等）。 */
  function claimRewardTier(
    tierId: string,
    studentId: string,
    studentName: string,
    claimInfo: {
      recipientName: string;
      recipientPhone: string;
      recipientAddress: string;
      deliveryMethod?: 'shipped' | 'in-person';
      campId?: string;
      activityType?: 'milestone' | 'weekly' | 'lucky';
      status?: 'confirmed' | 'pending';
    },
  ): { ok: boolean; reason?: string; claim?: RewardClaim } {
    if (isStudentDisabled(studentId)) return { ok: false, reason: '该学员已退营，无法领取奖励' }; // 退营学员禁止资金/领取操作
    // 连续打卡/解锁判定必须落在具体营期，禁止用全部营期合并数据拼连续天数
    if (!claimInfo.campId) return { ok: false, reason: '缺少营期信息，无法领取' };
    // ①实时重读 tier + 已解锁快照，避免调用方传入的快照过期（已被删除 / 库存已被其它领取占用）
    const fresh = rewardTiers.value.find((t) => t.id === tierId);
    // 已解锁资格（仅连续打卡）：只要曾解锁即可凭快照领取，不依赖 live 档位是否存在/上下架
    const unlockSnap = unlockRecords.value.find(
      (r) => r.studentId === studentId && r.tierId === tierId && (claimInfo.campId ? r.campId === claimInfo.campId : true),
    );
    const reqDays = fresh ? fresh.requiredDays : unlockSnap?.snapshot.requiredDays;
    if (reqDays === undefined) return { ok: false, reason: '该奖励不存在或已被删除' };
    // 下架仅拦截"未解锁"的档位；已解锁的档位（含已下架/已删除）仍可领取
    if (fresh && fresh.active === false && !unlockSnap) return { ok: false, reason: '该奖励已下架，无法领取' };
    // 库存（剩余可发量）：只要档位仍存在就校验，解锁快照只解决「下架/删除」，不能绕过没货
    if (fresh && fresh.stock <= 0) return { ok: false, reason: '该礼品库存不足' };
    // ②营期一致性
    if (claimInfo.campId && fresh && fresh.campId && fresh.campId !== claimInfo.campId) {
      return { ok: false, reason: '该奖励不属于当前营期' };
    }
    // ③once-per-tier 判重（仅判"同一营期"：同一档位所在营期只能领取一次；跨营期不同营期各自领取）
    if (rewardClaims.value.some((c) => c.studentId === studentId && c.tierId === tierId && (claimInfo.campId ? c.campId === claimInfo.campId : true))) {
      return { ok: false, reason: '您已领取过该奖励，请勿重复领取' };
    }
    // ④连续打卡达标校验（仅连续打卡奖励）：资格快照口径 —— 已解锁未领取的档位断签后仍可领取。
    //    达标判定 = max(当前连续天数, 营期内任意历史最长连续天数) >= requiredDays，避免断签重新锁定已解锁档位。
    if (fresh ? fresh.source === 'streak' : true) {
      const cid = claimInfo.campId;
      const diet = (cid ? getCampDietRecords(cid) : dietRecords.value).filter((r) => r.studentId === studentId);
      const ex = (cid ? getCampExerciseRecords(cid) : exerciseRecords.value).filter((r) => r.studentId === studentId);
      const wt = (cid ? getCampWeightRecords(cid) : weightRecords.value).filter((r) => r.studentId === studentId);
      const streak = calculateStreak(ex, diet, wt, studentId);
      const todayStr = formatDateTimeStr().slice(0, 10);
      let longest = 0;
      if (cid) {
        const camp = camps.value.find((c) => c.id === cid) || null;
        const endRaw = camp?.endDate || todayStr;
        const end = endRaw < todayStr ? endRaw : todayStr;
        longest = calculateLongestStreakInRange(camp?.startDate || '2000-01-01', end, ex, diet, wt, studentId);
      }
      const achieved = Math.max(streak.currentStreak, longest);
      if (achieved < reqDays) {
        return { ok: false, reason: '连续打卡天数未达到该奖励要求，无法领取' };
      }
    }
    // ⑤邮寄类必须填收货信息（运营后台审核确认阶段尚未收集地址，不在此拦截）
    if (claimInfo.status !== 'confirmed' && claimInfo.deliveryMethod === 'shipped') {
      if (!claimInfo.recipientName?.trim() || !claimInfo.recipientPhone?.trim() || !claimInfo.recipientAddress?.trim()) {
        return { ok: false, reason: '请完整填写收件人、电话和收货地址' };
      }
    }
    // ⑤b 领取方式必须落在配置的 deliveryMethods 内（防 PWA 旧包/异常入口提交非法方式）
    if (claimInfo.deliveryMethod) {
      const allowed = fresh?.deliveryMethods || unlockSnap?.snapshot.deliveryMethods || ['shipped'];
      if (!allowed.includes(claimInfo.deliveryMethod)) {
        return { ok: false, reason: '该奖励不支持所选领取方式' };
      }
    }
    const claim: RewardClaim = {
      id: `claim_${Date.now()}`,
      tierId,
      studentId,
      studentName,
      recipientName: claimInfo.recipientName,
      recipientPhone: claimInfo.recipientPhone,
      recipientAddress: claimInfo.recipientAddress,
      claimDate: formatDateTimeStr(),
      status: claimInfo.status ?? 'pending',
      deliveryMethod: claimInfo.deliveryMethod,
      campId: claimInfo.campId,
      activityType: claimInfo.activityType,
      // 档位快照：锁定领取时名称/图片/门槛/领取方式/版本，之后编辑或下架档位不影响历史记录反查（live 被删除则用解锁快照）
      tierSnapshot: {
        name: fresh?.name ?? unlockSnap!.snapshot.name,
        imageUrl: fresh?.imageUrl ?? unlockSnap!.snapshot.imageUrl,
        requiredDays: fresh?.requiredDays ?? unlockSnap!.snapshot.requiredDays,
        deliveryMethods: fresh?.deliveryMethods ?? unlockSnap!.snapshot.deliveryMethods,
        version: fresh?.version ?? unlockSnap!.snapshot.version,
      },
    };
    // ④写记录 + 用 fresh tier 扣库存（live 被删除时无库存可扣，凭解锁资格发放）
    rewardClaims.value.push(claim);
    api.createRewardClaim(claim).catch(() => {});
    if (fresh) updateRewardTier(fresh.id, { stock: fresh.stock - 1 });
    return { ok: true, claim };
  }

  function updateRewardClaim(id: string, updates: Partial<RewardClaim>) {
    rewardClaims.value = rewardClaims.value.map((c) => (c.id === id ? { ...c, ...updates } : c));
    api.updateRewardClaim(id, updates).catch(() => {});
  }

  /** 连续打卡奖励 上架/下架（只改 active，不删数据；下架后学员端不可见、不可兑换，已兑仍可发货） */
  function toggleRewardTierActive(id: string) {
    const tier = rewardTiers.value.find((t) => t.id === id);
    if (!tier) return;
    updateRewardTier(id, { active: tier.active === false });
  }

  // ─── 积分商城 ──────────────────────────────────────────
  /** 积分商城商品。可绑定营期(campId)；未绑定则全局共享。兑换记录按 exchange.campId 营期隔离。 */
  const pointProducts = ref<PointProduct[]>([...MOCK_POINT_PRODUCTS]);
  /** 积分兑换记录 */
  const pointExchanges = ref<PointExchangeRecord[]>([...MOCK_POINT_EXCHANGES]);
  /** 营养师手动加减分记录 */
  const manualScoreRecords = ref<ManualScoreRecord[]>([...MOCK_MANUAL_SCORES]);

  // ============================================================================
  //  业务数据 localStorage 持久化（纯前端 demo：业务数据默认只在内存，刷新/跨会话即丢）
  //  ---------------------------------------------------------------------------
  //  用一个快照桶把主要可变业务数据统一写进 localStorage，并在 init() 时回读，
  //  让营养师发货/批注/打分等跨角色操作的成果在刷新或同浏览器重进页面后仍然可见，
  //  修复"营养师发货后学员端仍显示待发货/无发货消息"的断链。
  //  边界：demo 无共享后端，跨浏览器/设备仍无法同步；这里仅解决"同浏览器刷新/换号"的丢数。
  // ============================================================================
  const BIZ_KEY = 'camp_biz_data_versionall';
  const bizSources = [
    students, weightRecords, exerciseRecords, dietRecords, coachActivities,
    rewardTiers, rewardClaims, unlockRecords, campMessageList, metricConfigs, camps, accounts,
    pointProducts, pointExchanges, manualScoreRecords,
    activityConfigByCamp, mealTimeConfigByCamp,
    badgeConfigsByCamp, badgeRecords,
  ];
  const bizNames = [
    'students', 'weightRecords', 'exerciseRecords', 'dietRecords', 'coachActivities',
    'rewardTiers', 'rewardClaims', 'unlockRecords', 'campMessageList', 'metricConfigs', 'camps', 'accounts',
    'pointProducts', 'pointExchanges', 'manualScoreRecords',
    'activityConfigByCamp', 'mealTimeConfigByCamp',
    'badgeConfigsByCamp', 'badgeRecords',
  ] as const;
  function persistBiz() {
    const snap: Record<string, unknown> = {};
    bizSources.forEach((src, i) => { snap[bizNames[i]] = src.value; });
    snap._v = DEMO_SCHEMA_VERSION;
    try { localStorage.setItem(BIZ_KEY, JSON.stringify(snap)); } catch { /* 隐私模式/超限：静默降级为内存，不影响功能 */ }
  }

  /** 旧版本快照 → 新 mock 种子的一次性增量合并：
   *  保留用户改过的数据，仅补充新增的学员/账号/奖品/记录，并清掉未来日期等脏数据。 */
  function mergeSeedData() {
    const today = formatDateTimeStr().slice(0, 10);
    const campStart = (cid?: string) => camps.value.find((c) => c.id === cid)?.startDate || '';
    const validDate = (d: string, cid?: string) => {
      const day = (d || '').slice(0, 10);
      return !!day && day <= today && (!campStart(cid) || day >= campStart(cid)!);
    };

    // 学员 / 营期：按 id 补缺
    MOCK_STUDENTS.forEach((stu) => { if (!students.value.some((s) => s.id === stu.id)) students.value.push({ ...stu } as any); });
    MOCK_CAMPS.forEach((c) => { if (!camps.value.some((x) => x.id === c.id)) camps.value.push({ ...c }); });
    // 账号：同手机号+角色视为同一账户；新种子的督导权限合并进来
    MOCK_ACCOUNTS.forEach((a) => {
      const hit = accounts.value.find((x) => x.phone === a.phone && x.role === a.role);
      if (!hit) accounts.value.push({ ...a });
      else if (a.supervisor && !hit.supervisor) hit.supervisor = true;
    });
    // 记录：清掉未来/开营前脏数据，再按业务主键补缺
    dietRecords.value = dietRecords.value.filter((r) => validDate(r.date, r.campId));
    exerciseRecords.value = exerciseRecords.value.filter((r) => validDate(r.date, r.campId));
    weightRecords.value = weightRecords.value.filter((r) => validDate(r.date, r.campId));
    const dietKey = (r: DietRecord) => `${r.studentId}|${r.campId}|${r.date.slice(0, 10)}|${r.meal}`;
    const dietSet = new Set(dietRecords.value.map(dietKey));
    MOCK_DIET_RECORDS.forEach((r) => { if (!dietSet.has(dietKey(r))) { dietRecords.value.push({ ...r }); dietSet.add(dietKey(r)); } });
    const exSet = new Set(exerciseRecords.value.map((r) => r.id));
    MOCK_EXERCISE_RECORDS.forEach((r) => { if (!exSet.has(r.id)) { exerciseRecords.value.push({ ...r }); exSet.add(r.id); } });
    const wtKey = (r: WeightRecord) => `${r.studentId}|${r.campId}|${r.date.slice(0, 10)}`;
    const wtSet = new Set(weightRecords.value.map(wtKey));
    MOCK_WEIGHT_RECORDS.forEach((r) => { if (!wtSet.has(wtKey(r))) { weightRecords.value.push({ ...r }); wtSet.add(wtKey(r)); } });
    // 奖励 / 商品 / 领取 / 兑换 / 手动分：按 id 补缺
    MOCK_REWARD_TIERS.forEach((t) => { if (!rewardTiers.value.some((x) => x.id === t.id)) rewardTiers.value.push({ ...t }); });
    MOCK_POINT_PRODUCTS.forEach((p) => { if (!pointProducts.value.some((x) => x.id === p.id)) pointProducts.value.push({ ...p }); });
    MOCK_REWARD_CLAIMS.forEach((c) => { if (!rewardClaims.value.some((x) => x.id === c.id)) rewardClaims.value.push({ ...c }); });
    MOCK_POINT_EXCHANGES.forEach((e) => { if (!pointExchanges.value.some((x) => x.id === e.id)) pointExchanges.value.push({ ...e }); });
    MOCK_MANUAL_SCORES.forEach((m) => { if (!manualScoreRecords.value.some((x) => x.id === m.id)) manualScoreRecords.value.push({ ...m }); });
  }
  /** 从 localStorage 回读业务数据并覆盖各 ref；无可用数据返回 false */
  function restoreBiz(): boolean {
    try {
      const raw = localStorage.getItem(BIZ_KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw) as Record<string, unknown>;
      let hasData = false;
      bizSources.forEach((src, i) => {
        if (snap[bizNames[i]] !== undefined) { (src as { value: unknown }).value = snap[bizNames[i]]; hasData = true; }
      });
      const savedVersion = Number((snap as any)._v || 1);
      if (hasData && savedVersion < DEMO_SCHEMA_VERSION) {
        mergeSeedData();
        persistBiz();
      }
      return hasData;
    } catch { return false; }
  }
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  // 任何业务数据变化后防抖写盘（demo 数据量小；防抖避免批注输入时高频序列化）
  watch(bizSources as any, () => { clearTimeout(persistTimer); persistTimer = setTimeout(persistBiz, 400); }, { deep: true });

  /** 获取上架商品；campId 传入时按营期过滤（未绑定 campId 的商品视为全局共享，与 RewardTier 口径一致）。
   *  按 sortValue 升序（越小越靠前），sortValue 相同按名称/原始序。 */
  function getPointProducts(campId?: string | null) {
    return pointProducts.value
      .filter((p) => p.active && (!campId || !p.campId || p.campId === campId))
      .sort((a, b) => (a.sortValue ?? 0) - (b.sortValue ?? 0) || a.name.localeCompare(b.name));
  }

  function addPointProduct(product: PointProduct) {
    pointProducts.value.push({ ...product, sortValue: product.sortValue ?? 0, productVersion: 1 });
    recordConfigAudit({ module: 'product', action: '新增', targetName: product.name, campId: product.campId, after: `${product.pointsRequired}积分 · 库存 ${product.stock}` });
    api.createPointProduct(product).catch(() => {});
  }

  /** 更新商品。仅"配置编辑"（含 active 上/下架、不含系统内部扣/加库存）才递增版本号 + 写配置审计；
   *  兑换/取消扣加库存只改 stock 不 bump 版本（历史订单版本以生成时快照为准）。 */
  function updatePointProduct(id: string, updates: Partial<PointProduct>) {
    const prev = pointProducts.value.find((p) => p.id === id);
    const isConfigEdit = 'active' in updates || Object.keys(updates).some((k) => k !== 'stock');
    pointProducts.value = pointProducts.value.map((p) =>
      (p.id === id ? { ...p, ...updates, ...(isConfigEdit ? { productVersion: (p.productVersion ?? 1) + 1 } : {}) } : p)
    );
    if (prev && isConfigEdit) {
      const next = pointProducts.value.find((p) => p.id === id);
      if (updates.active !== undefined) {
        recordConfigAudit({ module: 'product', action: updates.active ? '上架' : '下架', targetName: prev.name, campId: prev.campId, before: updates.active ? '已下架' : '上架中', after: updates.active ? '上架中' : '已下架' });
      } else {
        recordConfigAudit({ module: 'product', action: '编辑', targetName: prev.name, campId: prev.campId, before: `库存 ${prev.stock} v${prev.productVersion ?? 1}`, after: `库存 ${next?.stock ?? prev.stock} v${(next?.productVersion ?? prev.productVersion ?? 1)}` });
      }
    }
    api.updatePointProduct(id, updates).catch(() => {});
  }

  /** 删除积分商品。存在非取消（pending/fulfilled）兑换记录时拒绝删除。
   *  返回 {ok, reason}，由调用方提示拦截原因与连带影响。 */
  function deletePointProduct(id: string): { ok: boolean; reason?: string } {
    const open = pointExchanges.value.filter((e) => e.productId === id && e.status !== 'cancelled');
    if (open.length > 0) {
      return { ok: false, reason: `该商品已有 ${open.length} 条非取消兑换记录（待发货/已发货），无法删除` };
    }
    const target = pointProducts.value.find((p) => p.id === id);
    pointProducts.value = pointProducts.value.filter((p) => p.id !== id);
    if (target) recordConfigAudit({ module: 'product', action: '删除', targetName: target.name, campId: target.campId, before: `${target.pointsRequired}积分` });
    api.deletePointProduct(id).catch(() => {});
    return { ok: true };
  }

  /** 计算学员的积分商城可用积分（排行榜总积分 - 已消耗积分，不可为负）
   *  campId 传入时按营期过滤（与排行榜一致），不传则汇总全部营期
   */
  function getStudentMallPoints(studentId: string, campId?: string): number {
    const earned = getStudentTotalEarnedPoints(studentId, campId);
    // 已消费也按营期过滤，与 earned 同口径：避免多营期学员在一营期的兑换侵蚀另一营期的可用积分/重复抵扣
    const spent = pointExchanges.value
      .filter((e) => e.studentId === studentId && e.status !== 'cancelled' && (!campId || e.campId === campId))
      .reduce((sum, e) => sum + e.pointsSpent, 0);
    return Math.max(0, earned - spent);
  }

  /** 学员总获得积分（饮食分+运动分+手动加减分）
   *  campId 传入时按营期过滤（与排行榜一致），不传则汇总全部营期
   */
  function getStudentTotalEarnedPoints(studentId: string, campId?: string): number {
    const diet = (campId ? getCampDietRecords(campId) : dietRecords.value).filter((r) => r.studentId === studentId);
    const exercise = (campId ? getCampExerciseRecords(campId) : exerciseRecords.value).filter((r) => r.studentId === studentId);
    const manual = (campId ? getCampManualScoreRecords(campId) : manualScoreRecords.value).filter((r) => r.studentId === studentId);
    return calculateTotalScore(diet, exercise, manual);
  }

  /** 营养师手动加减分（乐观更新 + fire-and-forget 持久化，同 addDietRecord 模式） */
  function addManualScoreRecord(record: ManualScoreRecord) {
    if (isStudentDisabled(record.studentId)) return; // 退营学员禁止手动加减分（与其余写方法口径一致）
    manualScoreRecords.value.push(record);
    api.createManualScoreRecord(record).catch(() => {});
  }
  function deleteManualScoreRecord(id: string) {
    manualScoreRecords.value = manualScoreRecords.value.filter((r) => r.id !== id);
    api.deleteManualScoreRecord(id).catch(() => {});
  }

  /** 兑换商品 */
  function exchangePointProduct(
    studentId: string,
    studentName: string,
    product: PointProduct,
    deliveryInfo?: { recipientName: string; recipientPhone: string; recipientAddress: string; deliveryMethod: 'shipped' | 'in-person' },
    campId?: string,
  ): PointExchangeRecord | null {
    if (isStudentDisabled(studentId)) return null; // 退营学员禁止资金/领取操作
    // 实时重读商品，避免调用方传入的快照过期（已下架 / 库存已被其它兑换占用）。真实上线须由服务端做权威校验。
    const fresh = pointProducts.value.find((p) => p.id === product.id);
    if (!fresh || !fresh.active) return null;
    const available = getStudentMallPoints(studentId, campId);
    if (available < fresh.pointsRequired) return null;
    if (fresh.stock <= 0) return null;
    // 防御性校验：每人限兑换次数（maxExchange；0/未设置=不限）
    if (fresh.maxExchange) {
      const used = pointExchanges.value.filter((e) => e.studentId === studentId && e.productId === product.id && e.status !== 'cancelled').length;
      if (used >= fresh.maxExchange) return null;
    }
    // 防御性校验：deliveryMethod 必须被商品支持
    if (deliveryInfo && !fresh.deliveryOptions.includes(deliveryInfo.deliveryMethod)) return null;
    // 邮寄类必须填收货信息
    if (deliveryInfo?.deliveryMethod === 'shipped') {
      if (!deliveryInfo.recipientName?.trim() || !deliveryInfo.recipientPhone?.trim() || !deliveryInfo.recipientAddress?.trim()) return null;
    }

    const now = formatDateTimeStr();
    const record: PointExchangeRecord = {
      id: `pe_${Date.now()}`,
      studentId,
      studentName,
      productId: fresh.id,
      productName: fresh.name,
      productImage: fresh.imageUrl,
      pointsSpent: fresh.pointsRequired,
      exchangeDate: now,
      status: 'pending',
      deliveryMethod: deliveryInfo?.deliveryMethod,
      recipientName: deliveryInfo?.recipientName,
      recipientPhone: deliveryInfo?.recipientPhone,
      recipientAddress: deliveryInfo?.recipientAddress,
      campId,
      // 商品快照：锁定下单时名称/图片/积分/配送/商品版本，之后编辑/下架商品不影响本单历史
      snapshot: {
        productId: fresh.id,
        name: fresh.name,
        imageUrl: fresh.imageUrl,
        pointsRequired: fresh.pointsRequired,
        deliveryOptions: fresh.deliveryOptions,
        productVersion: fresh.productVersion ?? 1,
      },
      // 操作审计：下单即创建首条留痕
      audit: [{ op: 'created', operator: studentName, operatorTime: now, fromStatus: '-', toStatus: 'pending', reason: '学员下单' }],
    };
    pointExchanges.value.push(record);
    // 扣减库存（剩余可发量语义：领取减 / 取消加 / 发货不动）
    updatePointProduct(fresh.id, { stock: fresh.stock - 1 });
    api.createPointExchange(record).catch(() => {});
    return record;
  }

  /** 获取学员兑换记录 */
  function getStudentExchanges(studentId: string): PointExchangeRecord[] {
    return pointExchanges.value
      .filter((e) => e.studentId === studentId)
      .sort((a, b) => b.exchangeDate.localeCompare(a.exchangeDate));
  }

  /**
   * 学员「消息」Tab 角标总数 = 批注未读(营养师+教练) + 系统通知未读(奖励/兑换，事件晚于最近查看时刻)。
   * 供各学员页底部 StudentTabbar 的 messages badge 统一使用，保证任何页面下角标一致。
   * 口径与 MessagesView 内逐条 unread 完全一致（共享 lib/messageSeen 的时刻模型 + getStudentCamp 营期）。
   */
  function getStudentMsgUnreadCount(studentId: string): number {
    const camp = getStudentCamp(studentId);
    const cid = camp?.id || null;
    const diet = (cid ? getCampDietRecords(cid) : dietRecords.value).filter(
      (r) => r.studentId === studentId && r.dietitianComment && !r.commentRead,
    );
    const ex = (cid ? getCampExerciseRecords(cid) : exerciseRecords.value).filter(
      (r) => r.studentId === studentId && r.coachComment && !r.commentRead,
    );
    const wt = (cid ? getCampWeightRecords(cid) : weightRecords.value).filter(
      (r) => r.studentId === studentId && r.dietitianComment && !r.commentRead,
    );
    const batch = diet.length + ex.length + wt.length;

    const seen = { ranks: {}, lastSystemSeenAt: systemSeenAt.value, readNotif: readNotifIds.value };
    const claims = (cid ? getCampRewardClaims(cid) : rewardClaims.value).filter((c) => c.studentId === studentId);
    // 与消息列表同口径：营期内的兑换才计入，避免出现看得见角标、列表里没有的死计数
    const exchanges = getStudentExchanges(studentId).filter((e) => !cid || e.campId === cid);

    let sys = 0;
    for (const c of claims) {
      // 与 MessagesView rewardMessages.date 一致：已发/已线下取发货日，否则领取日
      const d = (c.status === 'shipped' && c.shipDate) || (c.status === 'in-person' && c.deliveredAt) || c.claimDate;
      if (systemMsgUnread(seen, d, `reward-${c.id}`)) sys++;
    }
    for (const e of exchanges) {
      // 与 MessagesView exchangeMessages.date 一致
      const d = (e.status === 'fulfilled' && e.shipDate) || e.exchangeDate;
      if (systemMsgUnread(seen, d, `exch-${e.id}`)) sys++;
    }
    return batch + sys;
  }

  /** 更新兑换状态（含审计留痕）。
   *  operator 操作人，reason 操作原因，写进 audit[] ；取消时自动恢复库存、积分自动返还 */
  function updateExchangeStatus(id: string, status: PointExchangeRecord['status'], operator?: string, reason?: string) {
    const exchange = pointExchanges.value.find(e => e.id === id);
    if (!exchange) return;
    // 状态机校验：只允许 pending -> fulfilled/cancelled
    if (exchange.status !== 'pending') return;
    const fromStatus = exchange.status;
    // 如果取消兑换，恢复库存（剩余可发量语义：领取减 / 取消加 / 发货不动）
    if (status === 'cancelled') {
      const product = pointProducts.value.find(p => p.id === exchange.productId);
      if (product) {
        updatePointProduct(product.id, { stock: product.stock + 1 });
      }
    }
    const now = formatDateTimeStr();
    const auditEntry = {
      op: (status === 'cancelled' ? 'cancelled' : status === 'fulfilled' ? exchange.deliveryMethod === 'in-person' ? 'verified' : 'shipped' : 'created') as ExchangeAuditEntry['op'],
      operator: operator || (status === 'cancelled' ? '学员' : '营养师'),
      operatorTime: now,
      fromStatus,
      toStatus: status,
      reason,
    };
    pointExchanges.value = pointExchanges.value.map((e) =>
      (e.id === id ? {
        ...e,
        status,
        cancelledAt: status === 'cancelled' ? now : undefined,
        audit: [...(e.audit || []), auditEntry],
      } : e)
    );
    api.updatePointExchange(id, status === 'cancelled' ? { status, cancelledAt: pointExchanges.value.find((x) => x.id === id)?.cancelledAt } : { status }).catch(() => {});
  }

  /** 学员取消兑换（发货前可取消，积分自动返还）。operator 默认学员名 */
  function cancelExchange(id: string, operator?: string) {
    updateExchangeStatus(id, 'cancelled', operator || undefined, '学员取消');
  }

  /** 学员修改兑换收货地址（仅待发货未邮寄时体现，不改变状态机；用于「我的奖励」发货前改地址） */
  function updateExchangeAddress(id: string, info: { recipientName: string; recipientPhone: string; recipientAddress: string }) {
    const exchange = pointExchanges.value.find((e) => e.id === id);
    if (!exchange || exchange.status !== 'pending') return;
    pointExchanges.value = pointExchanges.value.map((e) => (e.id === id ? { ...e, ...info } : e));
    api.updatePointExchange(id, info).catch(() => {});
  }

  /** 营养师发货（邮寄）或线下核销（in-person）；含审计留痕。operator 操作人 */
  function shipExchange(id: string, trackingNumber: string, method: 'shipped' | 'in-person', operator?: string) {
    const exchange = pointExchanges.value.find(e => e.id === id);
    if (!exchange || exchange.status !== 'pending') return;
    const now = formatDateTimeStr();
    const updates: Partial<PointExchangeRecord> = {
      status: 'fulfilled',
      deliveryMethod: method,
      trackingNumber: method === 'shipped' ? trackingNumber : undefined,
      shipDate: method === 'shipped' ? now : undefined,
      deliveredAt: method === 'in-person' ? now : undefined,
      audit: [...(exchange.audit || []), {
        op: method === 'in-person' ? 'verified' : 'shipped',
        operator: operator || '营养师',
        operatorTime: now,
        fromStatus: 'pending',
        toStatus: 'fulfilled',
        reason: method === 'in-person' ? '线下核销发放' : `邮寄发货${trackingNumber ? `，单号 ${trackingNumber}` : ''}`,
      }],
    };
    pointExchanges.value = pointExchanges.value.map((e) => (e.id === id ? { ...e, ...updates } : e));
    api.updatePointExchange(id, updates).catch(() => {});
  }

  function getMealTimeConfig(campId: string): MealTimeConfig {
    return mealTimeConfigByCamp.value[campId] || { ...DEFAULT_MEAL_TIME_CONFIG };
  }

  function updateMealTimeConfig(campId: string, config: MealTimeConfig) {
    mealTimeConfigByCamp.value = { ...mealTimeConfigByCamp.value, [campId]: { ...config } };
    api.updateMealTimeConfigByCamp(campId, config).catch(() => {});
  }

  function addMetricConfig(config: MetricConfig) {
    metricConfigs.value.push(config);
    api.createMetricConfig(config).catch(() => {});
  }

  function updateMetricConfig(id: string, updates: Partial<MetricConfig>) {
    metricConfigs.value = metricConfigs.value.map((c) => (c.id === id ? { ...c, ...updates } : c));
    api.updateMetricConfig(id, updates).catch(() => {});
  }

  function deleteMetricConfig(id: string) {
    metricConfigs.value = metricConfigs.value.filter((c) => c.id !== id);
    api.deleteMetricConfig(id).catch(() => {});
  }

  function closeVideoPreview() {
    videoPreview.value = null;
  }

  // ─── 营期管理 ───
  function addCamp(camp: Camp) {
    camps.value.push(camp);
    api.createCamp(camp).catch(() => {});
  }
  function updateCamp(id: string, updates: Partial<Camp>) {
    camps.value = camps.value.map((c) => (c.id === id ? { ...c, ...updates } : c));
    api.updateCamp(id, updates).catch(() => {});
  }
  function deleteCamp(id: string) {
    camps.value = camps.value.filter((c) => c.id !== id);
    api.deleteCamp(id).catch(() => {});
  }

  // ─── 趣味活动徽章（记录 + 导出，不含商城/领取/发放） ───
  function getBadgeConfigs(campId: string | null | undefined): BadgeConfig[] {
    if (!campId) return [];
    if (!badgeConfigsByCamp.value[campId]) {
      badgeConfigsByCamp.value = { ...badgeConfigsByCamp.value, [campId]: defaultBadges(campId) };
    }
    return badgeConfigsByCamp.value[campId];
  }

  function setBadgeConfigs(campId: string, list: BadgeConfig[]) {
    badgeConfigsByCamp.value = { ...badgeConfigsByCamp.value, [campId]: list };
  }

  function upsertBadgeConfig(campId: string, cfg: BadgeConfig) {
    const list = getBadgeConfigs(campId).slice();
    const i = list.findIndex((x) => x.id === cfg.id);
    if (i >= 0) list[i] = cfg;
    else list.push(cfg);
    setBadgeConfigs(campId, list);
    // ★配置即联动：任何配置变更后立刻按新规则重算学员徽章，避免「配了但学员端不生效」
    syncBadges(campId);
  }

  function deleteBadgeConfig(campId: string, id: string) {
    setBadgeConfigs(campId, getBadgeConfigs(campId).filter((x) => x.id !== id));
    syncBadges(campId);
  }

  /** 按当前打卡数据与配置重算徽章（活动徽章幂等追加；一次性徽章按配置重建） */
  function syncBadges(campId: string) {
    const camp = camps.value.find((c) => c.id === campId);
    if (!camp) return;
    const configs = getBadgeConfigs(campId);
    const studentList = getStudentsByCamp(campId);
    const diet = dietRecords.value.filter((r) => r.campId === campId);
    const ex = exerciseRecords.value.filter((r) => r.campId === campId);
    const wt = weightRecords.value.filter((r) => r.campId === campId);

    // 活动徽章（周期、可重复）
    const activity = computeBadgeRecords(configs, studentList, diet, ex, wt, camp);

    // 一次性徽章（里程碑 + 成就）：每次按最新配置重建
    const campDays = camp.startDate && camp.endDate
      ? Math.max(1, Math.round((new Date(camp.endDate).getTime() - new Date(camp.startDate).getTime()) / 86400000))
      : 28;
    const today = formatDateTimeStr().substring(0, 10);
    const oneTime = studentList.flatMap((s) => {
      const sd = diet.filter((r) => r.studentId === s.id);
      const se = ex.filter((r) => r.studentId === s.id);
      const sw = wt.filter((r) => r.studentId === s.id);
      const report = generateStudentReport(
        { id: s.id, name: s.name, gender: s.gender },
        metricConfigs.value,
        metricValuesFor(s.id, campId),
        sd,
        se,
        sw,
        campDays,
      );
      return computeOneTimeBadgeRecords(configs, s.id, campId, {
        longestStreak: report.checkinStats.longestStreak,
        weightLossKg: report.summary.weightLossKg,
        weightLossPercent: report.summary.weightLossPercent,
        fatLossKg: report.summary.bodyFatLossKg,
        exerciseRecords: se,
        earnedAt: today,
      });
    });

    // 生效中的配置以最新规则为准重建记录；已停用/已删除的徽章保留历史记录
    const activeActivityIds = new Set(
      configs.filter((c) => c.active !== false && c.category === 'activity').map((c) => c.id),
    );
    const activeOnceIds = new Set(
      configs.filter((c) => c.active !== false && c.category !== 'activity').map((c) => c.id),
    );
    const preserved = badgeRecords.value.filter((r) => {
      if (r.campId !== campId) return true;
      if (r.category === 'activity') return !activeActivityIds.has(r.badgeId);
      return !activeOnceIds.has(r.badgeId);
    });
    badgeRecords.value = [...preserved, ...activity, ...oneTime];
  }

  function getCampBadgeRecords(campId: string): BadgeRecord[] {
    return badgeRecords.value.filter((r) => r.campId === campId);
  }

  function getStudentBadges(studentId: string, campId: string): BadgeRecord[] {
    return badgeRecords.value
      .filter((r) => r.campId === campId && r.studentId === studentId)
      .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
  }

  /** 学员徽章统一视图：当前生效配置 + 已获记录 + 已停用/已删除的历史记录。
   *  学员端与结营报告都用它，保证「配置端看到的」与「学员端看到的」是同一份。 */
  function getStudentBadgeView(studentId: string, campId: string) {
    const earned = getStudentBadges(studentId, campId);
    const activeConfigs = getBadgeConfigs(campId).filter((c) => c.active !== false);
    const activeIds = new Set(activeConfigs.map((c) => c.id));
    const historical = earned.filter((r) => !activeIds.has(r.badgeId));
    return { earned, activeConfigs, historical };
  }

  // ─── 账户管理 ───
  function addAccount(account: Account) {
    accounts.value.push(account);
    api.createAccount(account).catch(() => {});
  }
  function updateAccount(id: string, updates: Partial<Account>) {
    accounts.value = accounts.value.map((a) => (a.id === id ? { ...a, ...updates } : a));
    api.updateAccount(id, updates).catch(() => {});
  }
  function deleteAccount(id: string) {
    accounts.value = accounts.value.filter((a) => a.id !== id);
    api.deleteAccount(id).catch(() => {});
  }

  /** 获取学员的所有营期列表 */
  function getStudentCamps(studentId: string): Camp[] {
    const account = accounts.value.find((a) => a.id === studentId);
    if (!account?.campIds || account.campIds.length === 0) return [];
    return camps.value.filter((c) => account.campIds!.includes(c.id));
  }

  /** 获取学员当前营期（详情流优先 detailSelectedCampId，其次全局 selectedCampId，否则取第一个 active） */
  function getStudentCamp(studentId: string): Camp | null {
    const studentCamps = getStudentCamps(studentId);
    if (studentCamps.length === 0) return null;
    // 详情流上下文营期（学员档案内独立切换，不影响全局）优先
    if (detailSelectedCampId.value && studentCamps.some((c) => c.id === detailSelectedCampId.value)) {
      return studentCamps.find((c) => c.id === detailSelectedCampId.value) || null;
    }
    // 优先使用学员选中的营期（且该营期属于此学员）
    if (selectedCampId.value && studentCamps.some((c) => c.id === selectedCampId.value)) {
      return studentCamps.find((c) => c.id === selectedCampId.value) || null;
    }
    // 自动选择：优先 active，其次 ended，最后 upcoming
    const active = studentCamps.find((c) => c.status === 'active');
    const ended = studentCamps.find((c) => c.status === 'ended');
    const upcoming = studentCamps.find((c) => c.status === 'upcoming');
    return active || ended || upcoming || studentCamps[0];
  }

  /** 获取营期天数（从 start/end 日期计算；无日期则返回默认 28 天） */
  function getCampDays(studentId: string): number {
    const camp = getStudentCamp(studentId);
    if (camp?.startDate && camp?.endDate) {
      const start = new Date(camp.startDate);
      const end = new Date(camp.endDate);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 28;
    }
    return 28;
  }

  /** 结营报告是否可查看（营期已结束，即当前日期 > 结营日期） */
  function canViewCampReport(studentId: string): boolean {
    const camp = getStudentCamp(studentId);
    if (!camp) return false;
    if (camp.status === 'ended') return true;
    if (camp.endDate) {
      const end = new Date(camp.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today > end;
    }
    return false;
  }

  /** 营期是否已开营（当前日期 >= 开营日期；status 优先，无 status 时按 startDate 判断） */
  function isCampStarted(camp: Camp | null | undefined): boolean {
    if (!camp) return true; // 无营期信息时不限制
    if (camp.status === 'upcoming') return false;
    if (camp.status === 'active' || camp.status === 'ended') return true;
    if (camp.startDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(camp.startDate);
      start.setHours(0, 0, 0, 0);
      return today >= start;
    }
    return true;
  }

  /** 学员当前营期是否已开营（学员能否打卡）。退营学员一律禁止。 */
  function canStudentCheckIn(studentId: string): boolean {
    if (isStudentDisabled(studentId)) return false;
    return isCampStarted(getStudentCamp(studentId));
  }

  // ─── 按营期过滤打卡记录（campId 精确匹配，不靠日期范围猜测） ──────
  function getCampDietRecords(campId: string) {
    return dietRecords.value.filter((r) => r.campId === campId);
  }
  function getCampExerciseRecords(campId: string) {
    return exerciseRecords.value.filter((r) => r.campId === campId);
  }
  function getCampManualScoreRecords(campId: string) {
    // 与饮食/运动/体重一致：严格按营期归属，避免一笔无归属补分被每期重复计入
    return manualScoreRecords.value.filter((r) => r.campId === campId);
  }
  function getCampWeightRecords(campId: string) {
    return weightRecords.value.filter((r) => r.campId === campId);
  }
  function getCampRewardTiers(campId: string) {
    return rewardTiers.value.filter((t) => !t.campId || t.campId === campId);
  }
  function getCampRewardClaims(campId: string) {
    return rewardClaims.value.filter((c) => !c.campId || c.campId === campId);
  }
  function getCampCoachActivities(campId: string) {
    return coachActivities.value.filter((a) => !a.campIds || a.campIds.length === 0 || a.campIds.includes(campId));
  }

  /** 获取教练负责的营期列表（从 coach account.campIds 获取） */
  /** 兼容旧版命名：取营期列表中最新的已开营营期（口径同 lib/camps.latestCamp） */
  function pickLatestCamp(campList: Camp[]): Camp | null {
    return latestOrFirst(campList);
  }

  function getCoachCamps(): Camp[] {
    if (!user.value || user.value.role !== 'coach') return [];
    const account = accounts.value.find(a => a.id === user.value!.id || a.phone === user.value!.phone);
    if (!account?.campIds || account.campIds.length === 0) return camps.value.filter(c => c.status === 'active');
    return camps.value.filter(c => account.campIds.includes(c.id));
  }

  /** 获取教练负责的学员列表（按教练营期过滤） */
  function getCoachStudents(): { id: string; name: string; phone: string; gender?: 'male' | 'female'; age?: number }[] {
    const coachCamps = getCoachCamps();
    if (coachCamps.length === 0) return [];
    const campIds = coachCamps.map(c => c.id);
    return accounts.value
      .filter(a => a.role === 'student' && a.active && a.campIds?.some(id => campIds.includes(id)))
      .map(a => {
        const studentInfo = students.value.find(s => s.id === a.id);
        return {
          id: a.id,
          name: a.name,
          phone: a.phone,
          gender: studentInfo?.gender,
          age: studentInfo?.age,
        };
      });
  }

  /** 获取指定营期的学员列表（从 accounts 中筛选 campIds 包含该营期且 active 的学员） */
  function getStudentsByCamp(campId: string): { id: string; name: string; phone: string; gender?: 'male' | 'female'; age?: number }[] {
    return accounts.value
      .filter((a) => a.role === 'student' && a.active && a.campIds?.includes(campId))
      .map((a) => {
        // 从 students 列表补充 gender/age 信息
        const studentInfo = students.value.find((s) => s.id === a.id);
        return {
          id: a.id,
          name: a.name,
          phone: a.phone,
          gender: studentInfo?.gender,
          age: studentInfo?.age,
        };
      });
  }

  /** 获取所有活跃学员（不限营期） */
  function getAllStudents(): { id: string; name: string; phone: string; gender?: 'male' | 'female'; age?: number }[] {
    return accounts.value
      .filter((a) => a.role === 'student' && a.active)
      .map((a) => {
        const studentInfo = students.value.find((s) => s.id === a.id);
        return {
          id: a.id,
          name: a.name,
          phone: a.phone,
          gender: studentInfo?.gender,
          age: studentInfo?.age,
        };
      });
  }

  /** 获取学员的当前营期 ID（优先 active，其次 ended） */
  function getStudentCampId(studentId: string): string | null {
    const camp = getStudentCamp(studentId);
    return camp?.id || null;
  }

  return {
    user,
    campMessageList,
    addCampMessage,
    getCampMessages,
    updateCampMessage,
    markAllCommentsRead,
    markSystemSeenAt,
    activityConfigByCamp,
    getActivityConfig,
    getHasActivity,
    updateActivityConfig,
    currentView,
    init,
    questionnaireAnswered,
    students,
    weightRecords,
    exerciseRecords,
    dietRecords,
    coachActivities,
    getCampCoachActivities,
    selectedStudentId,
    selectedDateStr,
    attendanceBoardDate,
    coachFocusRecordId,
    selectedCampId,
    detailSelectedCampId,
    justCheckedIn,
    pendingRecordType,
    pendingRecordId,
    setPendingAnnotation,
    videoPreview,
    setUser,
    updateUserProfile,
    restoreAuth,
    logout,
    setCurrentView,
    goBack,
    setQuestionnaireAnswered,
    addWeightRecord,
    updateWeightRecord,
    addExerciseRecord,
    updateExerciseRecord,
    addDietRecord,
    updateDietRecord,
    addRecordComment,
    markCommentRead,
    markNotifRead,
    isNotifUnread,
    tryLockAnnotation,
    releaseAnnotationLock,
    annotationLockInfo,
    addCoachActivity,
    updateCoachActivity,
    deleteCoachActivity,
    setEditingActivity,
    editingActivity,
    coachDashboardTab,
    setSelectedStudentId,
    setSelectedDateStr,
    rewardTiers,
    rewardClaims,
    configAudits,
    unlockRecords,
    recordUnlockSnapshots,
    getStudentUnlockRecords,
    addRewardTier,
    updateRewardTier,
    toggleRewardTierActive,
    deleteRewardTier,
    addRewardClaim,
    claimRewardTier,
    updateRewardClaim,
    getPointProducts,
    addPointProduct,
    updatePointProduct,
    deletePointProduct,
    getStudentMallPoints,
    getStudentTotalEarnedPoints,
    exchangePointProduct,
    getStudentExchanges,
    getStudentMsgUnreadCount,
    updateExchangeStatus,
    cancelExchange,
    shipExchange,
    updateExchangeAddress,
    pointProducts,
    pointExchanges,
    manualScoreRecords,
    addManualScoreRecord,
    deleteManualScoreRecord,
    getCampDietRecords,
    getCampExerciseRecords,
    getCampManualScoreRecords,
    getCampWeightRecords,
    getCampRewardTiers,
    getCampRewardClaims,
    mealTimeConfigByCamp,
    getMealTimeConfig,
    updateMealTimeConfig,
    metricConfigs,
    addMetricConfig,
    updateMetricConfig,
    deleteMetricConfig,
    openImagePreview,
    openVideoPreview,
    closeVideoPreview,
    camps,
    accounts,
    addCamp,
    updateCamp,
    deleteCamp,
    addAccount,
    updateAccount,
    deleteAccount,
    getStudentCamp,
    getCampDays,
    canViewCampReport,
    isCampStarted,
    canStudentCheckIn,
    getStudentsByCamp,
    getAllStudents,
    getCoachCamps,
    getCoachStudents,
    getStudentCampId,
    getStudentCamps,
    pickLatestCamp,
    badgeConfigsByCamp,
    badgeRecords,
    getBadgeConfigs,
    upsertBadgeConfig,
    deleteBadgeConfig,
    syncBadges,
    getCampBadgeRecords,
    getStudentBadges,
    getStudentBadgeView,
  };
});
