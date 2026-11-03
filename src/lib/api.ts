/**
 * ============================================================================
 *  API 层 — 前后端接口契约
 * ============================================================================
 *
 *  联调方式:
 *    USE_MOCK = true  → 使用本地 mock 数据，原型可独立运行（无需后端）
 *    USE_MOCK = false → 发起真实 HTTP 请求到 API_BASE
 *
 *  约定:
 *    - 所有日期字符串格式: "yyyy-MM-dd"（日期）或 "yyyy-MM-dd HH:mm:ss"（日期时间）
 *    - 所有接口返回 JSON
 *    - 错误时 HTTP 状态码非 2xx，前端 catch 后保留本地状态
 *
 *  业务规则索引:
 *    - 当天打卡完成定义 → streak.ts → isDayComplete()
 *    - 连续打卡天数计算   → streak.ts → calculateStreak()
 *    - 奖励解锁/领取判定 → streak.ts → getProjectedRewardDates()
 *    - 饮食/运动积分计算  → scoring.ts → calculateDietScore() / calculateExerciseScore()
 *    - 学员排名           → scoring.ts → rankStudents()
 * ============================================================================
 */

import type {
  User,
  WeightRecord,
  ExerciseRecord,
  DietRecord,
  CoachActivityRecord,
  RewardTier,
  RewardClaim,
  MealTimeConfig,
  MetricConfig,
  Camp,
  Account,
  PointProduct,
  PointExchangeRecord,
  ManualScoreRecord,
} from '../types';
import {
  MOCK_STUDENTS,
  MOCK_DIET_RECORDS,
  MOCK_WEIGHT_RECORDS,
  MOCK_EXERCISE_RECORDS,
  MOCK_COACH_ACTIVITIES,
  MOCK_REWARD_TIERS,
  MOCK_REWARD_CLAIMS,
  DEFAULT_MEAL_TIME_CONFIG,
  DEFAULT_METRIC_CONFIGS,
  MOCK_CAMPS,
  MOCK_ACCOUNTS,
  MOCK_POINT_PRODUCTS,
  MOCK_POINT_EXCHANGES,
} from '../mock/data';

// ============ 联调配置 ============
// 通过 .env 配置（构建期注入）：
//   VITE_USE_MOCK = 'true'  → 使用本地 mock 数据，原型可独立运行（无需后端）
//   VITE_USE_MOCK = 'false' → 发起真实 HTTP 请求到 VITE_API_BASE
// 未配置 .env 时保持下列默认值（与旧硬编码行为一致，可直接构建运行）。
const rawUseMock = import.meta.env.VITE_USE_MOCK as string | undefined;
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';
export const USE_MOCK: boolean = rawUseMock === undefined ? true : rawUseMock === 'true';

/** 通用请求封装（USE_MOCK=false 时实际发起请求） */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ============ 鉴权 ============

/**
 * 用户登录（手机号 + 验证码）
 * POST /auth/login
 *
 * @body  { phone: string, code: string, role: 'student'|'coach'|'dietitian' }
 * @returns User — 包含 id, role, name, phone
 */
export async function login(phone: string, code: string, role: User['role']): Promise<User> {
  if (USE_MOCK) {
    return {
      id: role === 'student' ? 's1' : `usr_${Date.now()}`,
      role,
      name: role === 'student' ? '李明' : role === 'coach' ? '李教练' : '王营养师',
      phone,
    };
  }
  return request<User>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, code, role }),
  });
}

// ============ 学员列表 ============

/**
 * 获取营期所有学员列表（用于排行榜、营养师批注等）
 * GET /students
 *
 * @returns Array<{ id, name, age, gender, phone }>
 */
export async function getStudents(): Promise<typeof MOCK_STUDENTS> {
  if (USE_MOCK) return MOCK_STUDENTS;
  return request<typeof MOCK_STUDENTS>('/students');
}

// ============ 饮食打卡 ============

/**
 * 获取当前用户所有饮食打卡记录
 * GET /diet-records?studentId={userId}
 *
 * @returns DietRecord[] — 按 date 升序
 *
 * 业务规则: 一条记录对应一餐（breakfast/lunch/dinner/snack）。
 *           同一天三餐 + 运动全部打卡才算"完成当天"。
 */
export async function getDietRecords(): Promise<DietRecord[]> {
  if (USE_MOCK) return MOCK_DIET_RECORDS;
  return request<DietRecord[]>('/diet-records');
}

/**
 * 创建饮食打卡记录
 * POST /diet-records
 *
 * @body  DietRecord（id 由后端生成）
 * @returns DietRecord（含后端生成的 id）
 */
export async function createDietRecord(record: DietRecord): Promise<DietRecord> {
  if (USE_MOCK) return record;
  return request<DietRecord>('/diet-records', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * 更新饮食打卡记录（营养师批注/打分）
 * PATCH /diet-records/:id
 *
 * @body  Partial<DietRecord> — 通常只传 dietitianComment, dietitianScore
 * @returns DietRecord — 更新后的完整记录
 */
export async function updateDietRecord(id: string, updates: Partial<DietRecord>): Promise<DietRecord> {
  if (USE_MOCK) return { id, ...updates } as DietRecord;
  return request<DietRecord>(`/diet-records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ 运动打卡 ============

/**
 * 获取当前用户所有运动打卡记录
 * GET /exercise-records?studentId={userId}
 *
 * @returns ExerciseRecord[] — 按 date 升序
 *
 * 业务规则: 运动打卡是"完成当天"的必要条件之一。
 *           积分规则: duration >= 40 分钟记 1 分，否则 0 分。
 */
export async function getExerciseRecords(): Promise<ExerciseRecord[]> {
  if (USE_MOCK) return MOCK_EXERCISE_RECORDS;
  return request<ExerciseRecord[]>('/exercise-records');
}

/**
 * 创建运动打卡记录
 * POST /exercise-records
 *
 * @body  ExerciseRecord（id 由后端生成）
 * @returns ExerciseRecord
 */
export async function createExerciseRecord(record: ExerciseRecord): Promise<ExerciseRecord> {
  if (USE_MOCK) return record;
  return request<ExerciseRecord>('/exercise-records', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * 更新运动记录（营养师批注）
 * PATCH /exercise-records/{id}
 *
 * @body  Partial<ExerciseRecord> - { dietitianComment, dietitianName, dietitianCommentDate }
 * @returns ExerciseRecord
 */
export async function updateExerciseRecord(id: string, updates: Partial<ExerciseRecord>): Promise<ExerciseRecord> {
  if (USE_MOCK) return { id, ...updates } as ExerciseRecord;
  return request<ExerciseRecord>(`/exercise-records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ 体重打卡 ============

/**
 * 获取所有体重打卡记录
 * GET /weight-records
 *
 * @returns WeightRecord[] — 按 date 升序
 *
 * 业务规则: 体重打卡不影响"完成当天"判定，也不影响连续打卡天数。
 *           仅用于体重趋势图展示。
 */
export async function getWeightRecords(): Promise<WeightRecord[]> {
  if (USE_MOCK) return MOCK_WEIGHT_RECORDS;
  return request<WeightRecord[]>('/weight-records');
}

/**
 * 创建体重打卡记录
 * POST /weight-records
 *
 * @body  WeightRecord — { id, date: "yyyy-MM-dd HH:mm", weight: number }
 * @returns WeightRecord
 */
export async function createWeightRecord(record: WeightRecord): Promise<WeightRecord> {
  if (USE_MOCK) return record;
  return request<WeightRecord>('/weight-records', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * 更新体重打卡记录（营养师批注）
 * PATCH /weight-records/{id}
 *
 * @body  Partial<WeightRecord> - { dietitianComment, dietitianName, dietitianCommentDate }
 * @returns WeightRecord
 */
export async function updateWeightRecord(id: string, updates: Partial<WeightRecord>): Promise<WeightRecord> {
  if (USE_MOCK) return { id, ...updates } as WeightRecord;
  return request<WeightRecord>(`/weight-records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ 教练活动（图文/视频） ============

/**
 * 获取教练发布的活动列表
 * GET /coach-activities
 *
 * @returns CoachActivityRecord[] — 按 date 降序
 */
export async function getCoachActivities(): Promise<CoachActivityRecord[]> {
  if (USE_MOCK) return MOCK_COACH_ACTIVITIES;
  return request<CoachActivityRecord[]>('/coach-activities');
}

/**
 * 创建教练活动（教练端发布图文/视频）
 * POST /coach-activities
 *
 * @body  CoachActivityRecord
 * @returns CoachActivityRecord
 */
export async function createCoachActivity(record: CoachActivityRecord): Promise<CoachActivityRecord> {
  if (USE_MOCK) return record;
  return request<CoachActivityRecord>('/coach-activities', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * 编辑教练活动（教练端修改已发布的历史活动）
 * PUT /coach-activities/:id
 *
 * @body  Partial<CoachActivityRecord> — 仅包含需要更新的字段
 * @returns CoachActivityRecord
 */
export async function updateCoachActivity(id: string, updates: Partial<CoachActivityRecord>): Promise<CoachActivityRecord> {
  if (USE_MOCK) {
    const base = MOCK_COACH_ACTIVITIES.find((a) => a.id === id);
    return { ...(base as CoachActivityRecord), ...updates, id };
  }
  return request<CoachActivityRecord>(`/coach-activities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除教练活动（教练端删除已发布的历史活动）
 * DELETE /coach-activities/:id
 *
 * @returns { success: boolean }
 */
export async function deleteCoachActivity(id: string): Promise<{ success: boolean }> {
  if (USE_MOCK) return { success: true };
  return request<{ success: boolean }>(`/coach-activities/${id}`, {
    method: 'DELETE',
  });
}

// ============ 奖励阶梯配置 ============

/**
 * 获取所有奖励阶梯配置
 * GET /reward-tiers
 *
 * @returns RewardTier[] — 按 requiredDays 升序
 *
 * 业务规则: 营养师/管理员配置。每档包含名称、所需连续打卡天数、库存。
 *           学员连续打卡天数 >= requiredDays 时解锁该档奖励。
 */
export async function getRewardTiers(): Promise<RewardTier[]> {
  if (USE_MOCK) return MOCK_REWARD_TIERS;
  return request<RewardTier[]>('/reward-tiers');
}

/**
 * 新增奖励阶梯
 * POST /reward-tiers
 *
 * @body  RewardTier — { id, name, requiredDays, imageUrl, stock, description? }
 * @returns RewardTier
 */
export async function createRewardTier(tier: RewardTier): Promise<RewardTier> {
  if (USE_MOCK) return tier;
  return request<RewardTier>('/reward-tiers', {
    method: 'POST',
    body: JSON.stringify(tier),
  });
}

/**
 * 更新奖励阶梯（修改名称/天数/库存等）
 * PATCH /reward-tiers/:id
 *
 * @body  Partial<RewardTier>
 * @returns RewardTier
 */
export async function updateRewardTier(id: string, updates: Partial<RewardTier>): Promise<RewardTier> {
  if (USE_MOCK) return { id, ...updates } as RewardTier;
  return request<RewardTier>(`/reward-tiers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除奖励阶梯
 * DELETE /reward-tiers/:id
 */
export async function deleteRewardTier(id: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/reward-tiers/${id}`, { method: 'DELETE' });
}

// ============ 奖励领取记录 ============

/**
 * 获取所有奖励领取记录
 * GET /reward-claims
 *
 * @returns RewardClaim[] — 包含所有学员的领取记录
 *
 * 业务规则: 管理员端用于发货管理。前端按 studentId 过滤当前用户的记录。
 */
export async function getRewardClaims(): Promise<RewardClaim[]> {
  if (USE_MOCK) return MOCK_REWARD_CLAIMS;
  return request<RewardClaim[]>('/reward-claims');
}

/**
 * 创建奖励领取记录（学员领取奖品）
 * POST /reward-claims
 *
 * @body  RewardClaim — { id, tierId, studentId, studentName,
 *                        recipientName, recipientPhone, recipientAddress,
 *                        claimDate, status: 'pending' }
 * @returns RewardClaim
 *
 * 业务规则:
 *   1. 当前连续打卡天数 >= tier.requiredDays（前端已校验）
 *   2. 该阶梯未被当前用户领取过（前端已校验）
 *   3. 库存 > 0（前端已校验）
 *   4. 后端创建 claim 记录后，应同时扣减对应 tier 的 stock
 */
export async function createRewardClaim(claim: RewardClaim): Promise<RewardClaim> {
  if (USE_MOCK) return claim;
  return request<RewardClaim>('/reward-claims', {
    method: 'POST',
    body: JSON.stringify(claim),
  });
}

/**
 * 更新领取记录（管理员发货：填写快递单号）
 * PATCH /reward-claims/:id
 *
 * @body  Partial<RewardClaim> — 通常传 { status: 'shipped', trackingNumber, shipDate }
 * @returns RewardClaim
 */
export async function updateRewardClaim(id: string, updates: Partial<RewardClaim>): Promise<RewardClaim> {
  if (USE_MOCK) return { id, ...updates } as RewardClaim;
  return request<RewardClaim>(`/reward-claims/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ 健康指标配置 ============

/**
 * 获取所有健康指标配置（指标名称/单位/参考区间/分类）
 * GET /metric-configs
 *
 * @returns MetricConfig[] - 30 项指标配置（身体测量/肝功能/肾功能/血脂/血糖/营养）
 *
 * 业务规则: 营养师可在配置页面增删改指标。指标配置影响异常检测和结营报告计算。
 */
export async function getMetricConfigs(): Promise<MetricConfig[]> {
  if (USE_MOCK) return DEFAULT_METRIC_CONFIGS;
  return request<MetricConfig[]>('/metric-configs');
}

/**
 * 新增健康指标配置
 * POST /metric-configs
 *
 * @body  MetricConfig - { id, name, unit, normalRange?, category }
 * @returns MetricConfig
 */
export async function createMetricConfig(config: MetricConfig): Promise<MetricConfig> {
  if (USE_MOCK) return config;
  return request<MetricConfig>('/metric-configs', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

/**
 * 更新健康指标配置
 * PATCH /metric-configs/:id
 *
 * @body  Partial<MetricConfig> - 可更新 name/unit/normalRange/category
 * @returns MetricConfig
 */
export async function updateMetricConfig(id: string, updates: Partial<MetricConfig>): Promise<MetricConfig> {
  if (USE_MOCK) return { id, ...updates } as MetricConfig;
  return request<MetricConfig>(`/metric-configs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除健康指标配置
 * DELETE /metric-configs/:id
 */
export async function deleteMetricConfig(id: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/metric-configs/${id}`, { method: 'DELETE' });
}

// ============ 文件上传 ============

/**
 * 上传文件（图片/视频）
 * POST /upload
 *
 * @body  FormData (file)
 * @returns string — 可访问的 URL
 *
 * mock: 返回 blob URL（刷新失效，仅原型用）
 * 真实: 上传到对象存储，返回持久 URL
 */
export async function uploadFile(file: File): Promise<string> {
  if (USE_MOCK) return URL.createObjectURL(file);
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('upload failed');
  const data = await res.json();
  return data.url as string;
}

// ============ 营期管理 ============

/**
 * 获取所有营期列表
 * GET /camps
 *
 * @returns Camp[] - 按 startDate 降序
 */
export async function getCamps(): Promise<Camp[]> {
  if (USE_MOCK) return MOCK_CAMPS;
  return request<Camp[]>('/camps');
}

/**
 * 新增营期
 * POST /camps
 */
export async function createCamp(camp: Camp): Promise<Camp> {
  if (USE_MOCK) return camp;
  return request<Camp>('/camps', {
    method: 'POST',
    body: JSON.stringify(camp),
  });
}

/**
 * 更新营期
 * PATCH /camps/:id
 */
export async function updateCamp(id: string, updates: Partial<Camp>): Promise<Camp> {
  if (USE_MOCK) return { id, ...updates } as Camp;
  return request<Camp>(`/camps/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除营期
 * DELETE /camps/:id
 */
export async function deleteCamp(id: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/camps/${id}`, { method: 'DELETE' });
}

// ============ 账户管理 ============

/**
 * 获取所有账户列表
 * GET /accounts
 *
 * 业务规则: 只有配置了手机号的账户才能登录。
 *           营养师=管理员，第一批数据库预维护，后续在营养师端管理。
 *           学员需关联营期（campIds），每期排名相互独立。
 */
export async function getAccounts(): Promise<Account[]> {
  if (USE_MOCK) return MOCK_ACCOUNTS;
  return request<Account[]>('/accounts');
}

/**
 * 新增账户（手机号唯一）
 * POST /accounts
 */
export async function createAccount(account: Account): Promise<Account> {
  if (USE_MOCK) return account;
  return request<Account>('/accounts', {
    method: 'POST',
    body: JSON.stringify(account),
  });
}

/**
 * 更新账户
 * PATCH /accounts/:id
 */
export async function updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
  if (USE_MOCK) return { id, ...updates } as Account;
  return request<Account>(`/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除账户
 * DELETE /accounts/:id
 */
export async function deleteAccount(id: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/accounts/${id}`, { method: 'DELETE' });
}

// ============ 积分商城商品 ============

/**
 * 获取所有积分商城商品
 * GET /point-products
 *
 * @returns PointProduct[] - 仅 active=true 的商品对学员可见
 */
export async function getPointProducts(): Promise<PointProduct[]> {
  if (USE_MOCK) return MOCK_POINT_PRODUCTS;
  return request<PointProduct[]>('/point-products');
}

/**
 * 新增积分商城商品（营养师配置）
 * POST /point-products
 */
export async function createPointProduct(product: PointProduct): Promise<PointProduct> {
  if (USE_MOCK) return product;
  return request<PointProduct>('/point-products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
}

/**
 * 更新积分商城商品（修改价格/库存/上下架等）
 * PATCH /point-products/:id
 */
export async function updatePointProduct(id: string, updates: Partial<PointProduct>): Promise<PointProduct> {
  if (USE_MOCK) return { id, ...updates } as PointProduct;
  return request<PointProduct>(`/point-products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除积分商城商品
 * DELETE /point-products/:id
 */
export async function deletePointProduct(id: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/point-products/${id}`, { method: 'DELETE' });
}

// ============ 积分兑换记录 ============

/**
 * 获取所有积分兑换记录
 * GET /point-exchanges
 *
 * @returns PointExchangeRecord[] - 前端按 studentId 过滤当前用户的记录
 */
export async function getPointExchanges(): Promise<PointExchangeRecord[]> {
  if (USE_MOCK) return MOCK_POINT_EXCHANGES;
  return request<PointExchangeRecord[]>('/point-exchanges');
}

/**
 * 创建积分兑换记录（学员兑换商品）
 * POST /point-exchanges
 *
 * @body  PointExchangeRecord - { studentId, productId, pointsSpent, deliveryMethod, recipientInfo, status: 'pending' }
 * @returns PointExchangeRecord
 *
 * 业务规则:
 *   1. 学员可用积分 >= product.pointsRequired（前端已校验）
 *   2. 商品库存 > 0（前端已校验）
 *   3. 后端创建记录后，应同时扣减对应商品的 stock
 */
export async function createPointExchange(record: PointExchangeRecord): Promise<PointExchangeRecord> {
  if (USE_MOCK) return record;
  return request<PointExchangeRecord>('/point-exchanges', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * 更新兑换记录（营养师发货 / 学员取消）
 * PATCH /point-exchanges/:id
 *
 * @body  Partial<PointExchangeRecord> - 发货传 { status: 'fulfilled', trackingNumber, shipDate }
 *        取消传 { status: 'cancelled' }，后端应恢复商品库存 + 返还积分
 */
export async function updatePointExchange(id: string, updates: Partial<PointExchangeRecord>): Promise<PointExchangeRecord> {
  if (USE_MOCK) return { id, ...updates } as PointExchangeRecord;
  return request<PointExchangeRecord>(`/point-exchanges/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ 活动配置（按营期） ============

/**
 * 获取指定营期的趣味活动配置
 * GET /activity-config/:campId
 *
 * @returns ActivityConfig - { weightMilestone, weeklyChallenge, luckyDraw, pointsMall, ... }
 *
 * 业务规则: 营养师在配置页开关各活动；学员端按此展示对应活动入口。
 */
export async function getActivityConfig(campId: string): Promise<Record<string, unknown>> {
  if (USE_MOCK) return {};
  return request<Record<string, unknown>>(`/activity-config/${campId}`);
}

/**
 * 更新指定营期的趣味活动配置
 * PUT /activity-config/:campId
 *
 * @body  ActivityConfig - 完整配置
 */
export async function updateActivityConfigApi(campId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (USE_MOCK) return config;
  return request<Record<string, unknown>>(`/activity-config/${campId}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ============ 结营寄语 ============

/**
 * 获取指定营期+学员的结营寄语
 * GET /camp-messages/:campId/:studentId
 *
 * @returns string - 寄语文本（空字符串表示未填写）
 */
export async function getCampMessage(campId: string, studentId: string): Promise<string> {
  if (USE_MOCK) return '';
  const res = await request<{ text: string }>(`/camp-messages/${campId}/${studentId}`);
  return res.text;
}

/**
 * 保存结营寄语
 * PUT /camp-messages/:campId/:studentId
 *
 * @body  { text: string }
 */
export async function saveCampMessage(campId: string, studentId: string, text: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/camp-messages/${campId}/${studentId}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

// ============ 餐时配置（按营期） ============

/**
 * 获取指定营期的餐时配置
 * GET /meal-time-config/:campId
 *
 * @returns MealTimeConfig - breakfast/lunch/dinner/snack 各含 { start, end, enabled }
 */
export async function getMealTimeConfigByCamp(campId: string): Promise<MealTimeConfig> {
  if (USE_MOCK) return DEFAULT_MEAL_TIME_CONFIG;
  return request<MealTimeConfig>(`/meal-time-config/${campId}`);
}

/**
 * 更新指定营期的餐时配置
 * PUT /meal-time-config/:campId
 *
 * @body  MealTimeConfig - 完整配置
 */
export async function updateMealTimeConfigByCamp(campId: string, config: MealTimeConfig): Promise<MealTimeConfig> {
  if (USE_MOCK) return config;
  return request<MealTimeConfig>(`/meal-time-config/${campId}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ============ 营养师手动加减分 ============

/**
 * 创建营养师手动加减分记录（补录线下打卡积分等）
 * POST /manual-score-records
 *
 * @body  ManualScoreRecord - { studentId, points, reason, dietitianName, campId }
 * @returns ManualScoreRecord
 */
export async function createManualScoreRecord(record: ManualScoreRecord): Promise<ManualScoreRecord> {
  if (USE_MOCK) return record;
  return request<ManualScoreRecord>('/manual-score-records', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * 删除营养师手动加减分记录
 * DELETE /manual-score-records/:id
 */
export async function deleteManualScoreRecord(id: string): Promise<void> {
  if (USE_MOCK) return;
  return request<void>(`/manual-score-records/${id}`, { method: 'DELETE' });
}
