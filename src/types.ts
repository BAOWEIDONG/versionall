export type Role = 'student' | 'coach' | 'dietitian';

// ============================================================================
//  账户管理类型 (Account Management)
// ============================================================================

/** 营期/期 */
export interface Camp {
  id: string;
  name: string;        // 如 "第一期"
  startDate?: string;  // 开营日期 YYYY-MM-DD
  endDate?: string;    // 结营日期 YYYY-MM-DD
  status: 'upcoming' | 'active' | 'ended';
}

/** 账户（手机号 = 登录凭证，只有配置了手机号的人才能登录） */
export interface Account {
  id: string;
  phone: string;       // 手机号（唯一登录凭证）
  name: string;        // 姓名
  role: Role;          // student | coach | dietitian
  /** 学员所属期（可多选，同一人可参与多期；教练/营养师不强制） */
  campIds?: string[];
  /** 是否启用（禁用后该手机号无法登录） */
  active: boolean;
  /** 督导权限：仅此类账号可进入运营总览（可看全部学员与营养师/教练批注情况） */
  supervisor?: boolean;
  createdAt: string;   // 创建时间 YYYY-MM-DD HH:mm:ss
}

export interface MedicalReport {
  url: string;
  type: 'image' | 'pdf';
  name?: string;
}

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  gender?: 'male' | 'female';
  age?: number;
  height?: number;
  weight?: number;
  /** 目标体重（学员在体重打卡页可设置） */
  targetWeight?: number;
  medicalHistory?: string;
  allergies?: string;
  medicalReports?: MedicalReport[];
  /** 督导权限标记（登录时由账户带入） */
  supervisor?: boolean;
}

/** 打卡记录上的单条批注（同一记录可有多名同角色人员分别批注，逐条展示不覆盖；作者带角色+姓名） */
export interface CheckinComment {
  id: string;
  /** 作者角色：营养师 / 教练 */
  role: 'dietitian' | 'coach';
  /** 作者姓名 */
  name: string;
  text: string;
  /** yyyy-MM-dd HH:mm:ss */
  date: string;
}

export interface WeightRecord {
  id: string;
  date: string; // YYYY-MM-DD HH:mm:ss
  weight: number;
  studentId?: string; // 用于多学员数据过滤（营养师端）
  /** 所属营期 ID */
  campId?: string;
  /** 打卡照片 */
  photos?: string[];
  /** 全部营养师批注（多名营养师各自撰写，逐条展示；新增优先，同时镜像到 dietitian* 单字段以兼容消息/计数） */
  comments?: CheckinComment[];
  /** 营养师对该条体重记录的批注（最新一条的镜像） */
  dietitianComment?: string;
  /** 批注营养师姓名 */
  dietitianName?: string;
  /** 批注时间 yyyy-MM-dd HH:mm:ss */
  dietitianCommentDate?: string;
  /** 学员对批注的反馈：收到 / 有用 */
  studentFeedback?: 'received' | 'helpful';
  /** 学员是否已读该批注 */
  commentRead?: boolean;
}

export interface ExerciseRecord {
  id: string;
  studentId?: string;
  date: string;
  type: string;
  duration: number;
  intensity: number;
  /** 所属营期 ID */
  campId?: string;
  notes?: string;
  photos?: string[];
  /** 运动视频 URL 列表 */
  videoUrls?: string[];
  /** 全部教练批注（多名教练各自撰写，逐条展示；新增优先，同时镜像到 coach* 单字段以兼容消息/计数） */
  comments?: CheckinComment[];
  /** 教练对该条运动记录的批注（最新一条的镜像） */
  coachComment?: string;
  coachName?: string;
  coachCommentDate?: string;
  /** 学员对批注的反馈：收到 / 有用 */
  studentFeedback?: 'received' | 'helpful';
  /** 学员是否已读该批注 */
  commentRead?: boolean;
  /** 教练对该条运动记录的评分：0=未达标 / 1=尚可 / 2=到位 */
  coachScore?: 0 | 1 | 2 | null;
}

export interface DietRecord {
  id: string;
  studentId?: string;
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  description: string;
  photos: string[];
  /** 所属营期 ID */
  campId?: string;
  /** 全部营养师批注（多名营养师各自撰写，逐条展示；新增优先，同时镜像到 dietitian* 单字段以兼容消息/计数） */
  comments?: CheckinComment[];
  dietitianComment?: string;
  dietitianName?: string;
  dietitianCommentDate?: string;
  isFasted?: boolean;
  dietitianScore?: 0 | 1 | 2 | null;
  /** 学员对批注的反馈：收到 / 有用 */
  studentFeedback?: 'received' | 'helpful';
  /** 学员是否已读该批注 */
  commentRead?: boolean;
  /** 餐次结构标签（学员打卡时一键勾选） */
  hasStaple?: boolean;    // 有主食
  hasProtein?: boolean;   // 有蛋白质
  hasVegetable?: boolean; // 有蔬菜
}

/** 营养师手动加减分记录（用于补录线下打卡积分等） */
export interface ManualScoreRecord {
  id: string;
  studentId: string;
  /** 加减分值：正数=加分，负数=减分 */
  points: number;
  /** 原因说明 */
  reason: string;
  /** 操作营养师姓名 */
  dietitianName: string;
  /** 创建时间 YYYY-MM-DD HH:mm:ss */
  createdAt: string;
  /** 关联日期 YYYY-MM-DD（用于周榜过滤） */
  date: string;
  /** 所属营期 ID */
  campId?: string;
}

export interface CoachActivityRecord {
  id: string;
  title: string;
  description: string;
  imageUrls: string[];
  coachName: string;
  date: string;
  videoUrls?: string[];
  /** 所属营期 ID 列表（空/不填 = 全部营期可见） */
  campIds?: string[];
}

// Reward types
/** 领奖时锁定的档位快照：历史领取记录以生成时为准，不依赖当前档位反查 */
export interface RewardTierSnapshot {
  name: string;
  imageUrl: string;
  requiredDays: number;
  deliveryMethods?: ('shipped' | 'in-person')[];
  version?: number;
}

/** 学员已解锁(达到连续天数)但尚未领取的连续打卡档位快照。
 *  在解锁的那一刻即落盘，使营养师后续「下架」或「删除」该奖也不影响学员端已解锁记录的显示与领取（资格快照语义）。 */
export interface UnlockRecord {
  /** `${studentId}_${tierId}`（同一档位每学员唯一） */
  id: string;
  studentId: string;
  campId?: string;
  tierId: string;
  snapshot: RewardTierSnapshot;
  unlockedDate: string;
}

/** 结营寄语（可多条：多名营养师/教练各自撰写提交，append 不覆盖）。营收报告逐条展示，带角色+姓名。 */
export interface CampMessageEntry {
  id: string;
  campId: string;
  studentId: string;
  /** 作者角色：营养师 / 教练 */
  role: 'dietitian' | 'coach';
  /** 作者姓名 */
  authorName: string;
  /** 作者账号 ID（用于"仅本人可编辑自己的寄语"判定；教练/营养师端对非本人寄语只读） */
  authorId?: string;
  text: string;
  /** yyyy-MM-dd HH:mm:ss */
  createdAt: string;
}

export interface RewardTier {
  id: string;
  name: string;
  requiredDays: number;
  imageUrl: string;
  stock: number;
  description?: string;
  /** 所属营期 ID（按营期独立配置奖品） */
  campId?: string;
  /** 奖品来源：streak=连续打卡奖励 / activity=趣味活动奖品 */
  source?: 'streak' | 'activity';
  /** 是否上架；false = 学员端不可见、不可兑换（营养师下架后生效）；缺省视为上架 */
  active?: boolean;
  /** 关联的趣味活动类型（source=activity 时有效）：milestone=阶梯减重 / weekly=每周挑战 / lucky=全勤抽奖 */
  activityType?: 'milestone' | 'weekly' | 'lucky';
  /** 支持的领取方式（营养师配置，学员从中选择）：shipped=邮寄 / in-person=线下领取 */
  deliveryMethods?: ('shipped' | 'in-person')[];
  /** 排序值（越小越靠前展示；未设置 = 0） */
  sortValue?: number;
  /** 版本号：每次编辑 +1。历史领取以档位版本快照为准 */
  version?: number;
}

export interface RewardClaim {
  id: string;
  /** 业务订单号：后端生成填写（预留字段，与积分兑换统一单号体系，前端不生成、不展示） */
  orderNo?: string;
  tierId: string;
  studentId: string;
  studentName: string;
  /** 所属营期 ID */
  campId?: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  /** 是否已编辑过一次收货地址（仅未发货前可编辑，最多一次） */
  addressEdited?: boolean;
  claimDate: string;
  /**
   * 奖励状态流转：
   *   confirmed -> 营养师已审核通过（仅活动奖励），等待学员领取
   *   pending   -> 学员已领取（填了地址/选了方式），等待营养师发货
   *   shipped   -> 已发货（有快递单号）
   *   in-person -> 已线下发放
   */
  status: 'confirmed' | 'pending' | 'shipped' | 'in-person';
  trackingNumber?: string;
  shipDate?: string;
  /** 线下发放时间（status=in-person 时有效） */
  deliveredAt?: string;
  /** 学员选择的领取方式 */
  deliveryMethod?: 'shipped' | 'in-person';
  /** 关联活动类型（仅活动奖励） */
  activityType?: 'milestone' | 'weekly' | 'lucky';
  /** 领奖时锁定的档位快照：历史以快照为准，当前档位编辑/下架不影响 */
  tierSnapshot?: RewardTierSnapshot;
}

// Points mall types
/** 积分商城兑换操作审计条目（发货/线下核销/取消，记录操作人、时间、原因、状态流转） */
export interface ExchangeAuditEntry {
  /** created=下单 / shipped=邮寄发货 / verified=线下核销 / cancelled=取消 */
  op: 'created' | 'shipped' | 'verified' | 'cancelled';
  /** 操作人（下单=学员名；发货/核销=营养师；取消=学员或营养师） */
  operator: string;
  /** 操作时间（yyyy-MM-dd HH:mm:ss） */
  operatorTime: string;
  /** 操作原因说明（可空） */
  reason?: string;
  /** 状态流转 from -> to */
  fromStatus: string;
  toStatus: string;
}

/** 下单时锁定的商品完整快照：之后编辑/下架商品不影响历史订单（历史以快照为准） */
export interface PointProductSnapshot {
  productId: string;
  name: string;
  imageUrl: string;
  pointsRequired: number;
  deliveryOptions: ('shipped' | 'in-person')[];
  productVersion?: number;
}

/** 积分商城商品 */
export interface PointProduct {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  /** 所需积分 */
  pointsRequired: number;
  stock: number;
  active: boolean;
  /** 支持配送方式 */
  deliveryOptions: ('shipped' | 'in-person')[];
  /** 每人限兑换次数；0/未设置 = 不限制（营养师端配置） */
  maxExchange?: number;
  /** 排序值（营养师配置，越小越靠前展示；未设置 = 0） */
  sortValue?: number;
  /** 商品版本号：每次编辑 +1。下单时写入订单快照，历史订单以其生成时版本为准，编辑商品不追溯 */
  productVersion?: number;
  /** 所属营期 id；未设置(=undefined)视为全局/所有营期共用（与 RewardTier.campId 口径一致）。
   *  营养师在某个营期下新增商品时写入当前营期，随营期切换在配置端与学员商城分别展示。 */
  campId?: string;
}

/** 积分兑换记录 */
export interface PointExchangeRecord {
  id: string;
  /** 业务订单号：后端生成填写（预留字段，前端不生成、不展示，仅后台可追溯） */
  orderNo?: string;
  studentId: string;
  studentName: string;
  productId: string;
  productName: string;
  productImage: string;
  /** 消耗积分 */
  pointsSpent: number;
  exchangeDate: string;
  /** 兑换状态：pending=待发货 / fulfilled=已发货 / cancelled=已取消 */
  status: 'pending' | 'fulfilled' | 'cancelled';
  /** 配送方式 */
  deliveryMethod?: 'shipped' | 'in-person';
  /** 快递单号 */
  trackingNumber?: string;
  /** 发货时间 */
  shipDate?: string;
  /** 线下发放时间 */
  deliveredAt?: string;
  /** 取消时间 */
  cancelledAt?: string;
  /** 营期ID */
  campId?: string;
  /** 收货人姓名 */
  recipientName?: string;
  /** 收货人电话 */
  recipientPhone?: string;
  /** 收货地址 */
  recipientAddress?: string;
  /** 下单时锁定的商品快照：编辑/下架商品不影响本单，历史以快照为准 */
  snapshot?: PointProductSnapshot;
  /** 操作审计：created/shipped/verified/cancelled 全程留痕 */
  audit?: ExchangeAuditEntry[];
}

/** 营养师奖品/商品配置操作审计：记录操作者、时间、营期、前后值、原因、关联对象数 */
export interface ConfigAudit {
  id: string;
  /** 配置对象：tier=连续打卡档位 / product=积分商城商品 */
  module: 'tier' | 'product';
  /** 操作动作描述：新增/编辑/下架/上架/删除 */
  action: string;
  /** 操作对象名称 */
  targetName: string;
  /** 操作人 */
  operator: string;
  /** 操作时间（yyyy-MM-dd HH:mm:ss） */
  operatorTime: string;
  /** 所属营期 */
  campId?: string;
  /** 修改前摘要（如库存/排序/状态） */
  before?: string;
  /** 修改后摘要 */
  after?: string;
  /** 操作原因 */
  reason?: string;
  /** 关联对象数（受影响记录数，如已领取/待发数） */
  affectedCount?: number;
}

// Meal time configuration
export interface MealTimeSlot {
  start: string;  // "07:00"
  end: string;    // "09:00"
  enabled: boolean;
}

export interface MealTimeConfig {
  breakfast: MealTimeSlot;
  lunch: MealTimeSlot;
  dinner: MealTimeSlot;
  snack: MealTimeSlot;
}

// Health metric configuration (dynamic, configurable by dietitian)
export interface MetricConfig {
  id: string;
  name: string;          // 指标名称
  unit: string;          // 单位
  normalRange?: string;  // 参考区间（非必填）
  category: string;      // 分类（如"身体测量数据"、"血糖相关"）
}

// ============================================================================
//  结营报告 & 统计类型 (Camp Report & Summary Types)
// ============================================================================

/** 单个指标的前后变化 */
export interface MetricChange {
  configId: string;
  name: string;
  unit: string;
  category: string;
  normalRange: string;
  beforeValue: number | string | null;
  afterValue: number | string | null;
  /** 变化量 = after - before（仅数值型有值） */
  change: number | null;
  /** 变化百分比 = change / before * 100 */
  changePercent: number | null;
  /** 是否改善（按指标方向判断） */
  isImproved: boolean;
  /** 开营前是否异常 */
  beforeAbnormal: boolean;
  /** 结营后是否异常 */
  afterAbnormal: boolean;
  /** 异常转正常 */
  turnedNormal: boolean;
}

/** 打卡频率统计 */
export interface CheckinStats {
  /** 训练营总天数 */
  campDays: number;
  /** 有任意打卡记录的天数（含部分打卡） */
  totalCheckinDays: number;
  /** 完成全部打卡的天数（三餐+运动） */
  completeDays: number;
  /** 完成率 = completeDays / campDays */
  completionRate: number;
  /** 有饮食打卡的天数 */
  dietCheckinDays: number;
  /** 有运动打卡的天数 */
  exerciseCheckinDays: number;
  /** 有体重打卡的天数 */
  weightCheckinDays: number;
  /** 饮食打卡总条数 */
  totalDietRecords: number;
  /** 运动打卡总条数 */
  totalExerciseRecords: number;
  /** 体重打卡总条数 */
  totalWeightRecords: number;
  /** 当前连续打卡天数 */
  currentStreak: number;
  /** 最长连续打卡天数（整个营期内） */
  longestStreak: number;
  /** 总运动时长（分钟） */
  totalExerciseDuration: number;
  /** 饮食总得分（每日封顶6分） */
  totalDietScore: number;
}

/** 体重趋势 */
export interface WeightTrend {
  /** 体重记录列表（按日期排序） */
  records: { date: string; weight: number }[];
  /** 初始体重 */
  startWeight: number | null;
  /** 最终体重 */
  endWeight: number | null;
  /** 体重变化 = end - start */
  totalChange: number | null;
  /** 体重变化百分比 */
  changePercent: number | null;
  /** 趋势方向 */
  trend: 'decreasing' | 'increasing' | 'stable' | 'insufficient';
}

/** 成就 */
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;           // emoji
  unlocked: boolean;
  /** 解锁日期（yyyy-MM-dd） */
  unlockedDate?: string;
}

/** 学员结营报告 */
export interface StudentCampReport {
  studentId: string;
  studentName: string;
  gender: 'male' | 'female' | undefined;
  campDays: number;
  /** 打卡统计 */
  checkinStats: CheckinStats;
  /** 体重趋势 */
  weightTrend: WeightTrend;
  /** 全部指标变化 */
  metricChanges: MetricChange[];
  /** 成就列表 */
  achievements: Achievement[];
  /** 核心摘要 */
  summary: {
    weightLossKg: number | null;       // 体重减少量（正数=减了，负数=增了）
    weightLossPercent: number | null;
    bodyFatLossKg: number | null;      // 脂肪减少量
    muscleChangeKg: number | null;     // 肌肉变化量
    visceralFatChange: number | null;  // 内脏脂肪变化
    abnormalCountBefore: number;       // 开营前异常指标数
    abnormalCountAfter: number;        // 结营后异常指标数
    abnormalImprovedCount: number;     // 异常转正常数
    totalCheckinDays: number;
    completionRate: number;
    longestStreak: number;
    totalExerciseDuration: number;
    totalDietScore: number;
  };
}

/** 营养师端结营统计（聚合） */
export interface DietitianCampSummary {
  totalStudents: number;
  /** 有效人数（有前后体成分检测数据的学员） */
  validStudentCount: number;
  campDays: number;
  /** 平均体重变化（基于有体重记录的学员） */
  avgWeightChange: number | null;
  /** 平均完成率（基于全部学员） */
  avgCompletionRate: number | null;
  /** 平均打卡天数（基于全部学员） */
  avgCheckinDays: number | null;
  /** 每位学员的报告 */
  studentReports: StudentCampReport[];
  /** 指标聚合统计 */
  metricAggregates: MetricAggregate[];
}

/** 企业汇报版报告（仅匿名聚合数据，无个人健康明细，可直接发 HR） */
export interface EnterpriseCampReport {
  /** 参营总人数 */
  totalStudents: number;
  /** 有效人数（有前后体成分数据） */
  validStudentCount: number;
  campDays: number;
  /** 平均打卡完成率（0~1，基于有效人数） */
  avgCompletionRate: number | null;
  /** 完成率 ≥80% 的人数及占比 */
  highCompletionCount: number;
  highCompletionRate: number | null;
  /** 平均减重 kg（正数=减了，基于有效人数） */
  avgWeightLoss: number | null;
  /** 减重 ≥3kg 的人数及占比（基于有体重记录者） */
  weightGoalCount: number;
  weightGoalRate: number | null;
  /** 减重总人数（分母为参营总人数） */
  weightLossCount: number;
  weightRecordCount: number;
  /** 累计打卡人次（三类打卡记录总数） */
  totalCheckinRecords: number;
  /** 累计运动总时长（分钟，全体学员） */
  totalExerciseMinutes: number;
  /** 平均打卡天数（全体学员） */
  avgCheckinDays: number | null;
  /** 平均最长连续打卡天数 */
  avgLongestStreak: number | null;
  /** 坚持≥70%营期天数的人数 */
  streakChampionCount: number;
  /** 平均饮食打卡天数 */
  avgDietCheckinDays: number | null;
  /** 平均运动打卡天数 */
  avgExerciseCheckinDays: number | null;
  /** 体脂下降人数（有体脂数据的学员中） */
  bodyFatLossCount: number;
  bodyFatRecordCount: number;
  /** 肌肉量增加人数 */
  muscleGainCount: number;
  muscleRecordCount: number;
  /** 改善率最高的指标 Top N（按 improvementRate 降序，过滤样本过少的） */
  topImprovedMetrics: Array<{
    name: string;
    unit: string;
    avgChange: number | null;
    improvementRate: number | null;
    improvedCount: number;
    totalCount: number;
  }>;
  /** 自动提炼的本期亮点（2~4 条，可直接放进汇报 PPT） */
  highlights: string[];
}

/** 指标聚合统计 */
export interface MetricAggregate {
  configId: string;
  name: string;
  unit: string;
  category: string;
  /** 平均开营前值 */
  avgBefore: number | null;
  /** 平均结营后值 */
  avgAfter: number | null;
  /** 平均变化量 */
  avgChange: number | null;
  /** 改善人数 */
  improvedCount: number;
  /** 有数据的人数 */
  totalCount: number;
  /** 改善率 */
  improvementRate: number | null;
}

/** 徽章周期：按天 / 按周 / 按月（仅活动徽章使用） */
export type BadgeCadence = 'day' | 'week' | 'month';

/** 徽章分类：
 *  - milestone：里程碑徽章（一次性，如减重 3%/5%）
 *  - achievement：成就徽章（一次性，如连续打卡 7 天、运动 60 分钟）
 *  - activity：活动徽章（周期性，可重复获得，如每日打卡/本周坚持）
 */
export type BadgeCategory = 'milestone' | 'achievement' | 'activity';

/** 徽章达成条件（全部由营养师配置，不写死）：
 *  - checkin_days：周期内有打卡的天数 ≥ threshold
 *  - all_items：周期内「全项完成」的天数 ≥ threshold
 *  - streak_days：最长连续全项打卡 ≥ threshold 天
 *  - weight_loss_kg：体重下降 ≥ threshold kg
 *  - weight_loss_percent：体重下降 ≥ threshold %
 *  - fat_loss_kg：脂肪量下降 ≥ threshold kg
 *  - early_exercise_count：早上 9 点前完成运动 ≥ threshold 次
 *  - single_exercise_minutes：单次运动时长 ≥ threshold 分钟
 *  - max_intensity：单次运动强度达到 Lv.threshold
 *  - exercise_type_count：运动种类 ≥ threshold 种
 */
export type BadgeCondition =
  | 'checkin_days'
  | 'all_items'
  | 'streak_days'
  | 'weight_loss_kg'
  | 'weight_loss_percent'
  | 'fat_loss_kg'
  | 'early_exercise_count'
  | 'single_exercise_minutes'
  | 'max_intensity'
  | 'exercise_type_count';

/** 徽章配置（按营期独立配置，营养师可增删改） */
export interface BadgeConfig {
  id: string;
  /** 所属营期；不填 = 全部营期共用 */
  campId?: string;
  /** 徽章分类 */
  category: BadgeCategory;
  /** 徽章名称，如「每日打卡」「本周满勤」「连续 7 天」 */
  name: string;
  /** 周期（仅活动徽章有意义） */
  cadence: BadgeCadence;
  condition: BadgeCondition;
  /** 达成阈值（天数 / 次数 / kg / % / 强度等级，按 condition 解释） */
  threshold: number;
  /** 展示图标（emoji） */
  icon: string;
  /** 活动/徽章说明 */
  description?: string;
  /** 是否启用；false = 不再产生新记录（历史记录保留） */
  active: boolean;
}

/** 学员徽章获得记录（达成即记录 1 枚；不涉及领取/核销/发放） */
export interface BadgeRecord {
  /** `${studentId}_${badgeId}_${periodKey}`，天然幂等 */
  id: string;
  studentId: string;
  campId: string;
  badgeId: string;
  badgeName: string;
  category: BadgeCategory;
  cadence: BadgeCadence;
  icon: string;
  /** 周期键：day=yyyy-MM-dd / week=周一日期 / month=yyyy-MM / once=一次性 */
  periodKey: string;
  /** 获得日期 yyyy-MM-dd */
  earnedAt: string;
  /** 该周期内达成的天数 / 达成值 */
  value: number;
}
