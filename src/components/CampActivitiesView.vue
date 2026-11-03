<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../store/app';
import { campDateRange } from '../lib/camps';
import { NavBar, Card, StudentTabbar } from './ui';
import { Popup as VanPopup, showToast } from 'vant';
import { Zap, Scale, Calendar, CheckCircle2, PartyPopper, Gift, Truck, HandCoins, Package, ChevronDown, MapPin } from 'lucide-vue-next';
import { computeWeightMilestones, computeWeeklyChallenges, computeLuckyDraw } from '../lib/campActivities';
import type { RewardClaim } from '../types';

const store = useAppStore();

// ─── 营期切换器（多期时显示） ──────────────────────────────
const availableCamps = computed(() => {
  if (store.user?.role === 'student') return store.getStudentCamps(store.user.id);
  return store.camps;
});

const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some((c) => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find((c) => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

const activeCamp = computed(() => availableCamps.value.find((c) => c.id === activeCampId.value) || null);
// 活动配置按营期独立读取（取代旧的全局 activityConfig）
const activityConfig = computed(() => store.getActivityConfig(activeCampId.value));
const showCampSwitcher = computed(() => availableCamps.value.length > 1);
const showCampPicker = ref(false);

const handleCampSelect = (campId: string) => {
  store.selectedCampId = campId;
  showCampPicker.value = false;
};

// 按营期过滤打卡记录（campId 精确匹配，取代日期范围猜测）
const campDietRecords = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campExerciseRecords = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWeightRecords = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campRewardTiers = computed(() => activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers);
const campRewardClaims = computed(() => activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims);

// 未读批注数（tabbar badge）
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);

const isMine = (r: { studentId?: string }) => r.studentId === store.user?.id;

// 学员体重记录（按当前营期过滤）
const myWeights = computed(() => campWeightRecords.value.filter(isMine).sort((a, b) => a.date.localeCompare(b.date)));
const startWeight = computed(() => myWeights.value.length > 0 ? myWeights.value[0].weight : null);

// 阶梯减重
const milestones = computed(() => computeWeightMilestones(myWeights.value, startWeight.value));
const latestWeight = computed(() => myWeights.value.length > 0 ? myWeights.value[myWeights.value.length - 1].weight : null);

/**
 * 查找某里程碑对应的奖品层级（通过描述中的百分比匹配）
 * milestone.threshold=0.03 -> 匹配 description 含 "3%" 的 tier
 */
function findMilestoneTier(threshold: number) {
  const percent = Math.round(threshold * 100);
  return campRewardTiers.value.find(t =>
    t.source === 'activity' && t.activityType === 'milestone' &&
    t.description.includes(`${percent}%`)
  );
}

/** 获取当前学员某里程碑的 claim 状态 */
function milestoneClaimStatus(threshold: number): string | null {
  const tier = findMilestoneTier(threshold);
  if (!tier) return null;
  const claim = campRewardClaims.value.find(c =>
    c.studentId === store.user?.id && c.tierId === tier.id
  );
  return claim?.status || null;
}

/** 里程碑状态文案 */
function milestoneStatusText(m: { achieved: boolean; threshold: number; progress: number }): string {
  if (!m.achieved) return `${Math.round(m.progress * 100)}%`;
  const status = milestoneClaimStatus(m.threshold);
  switch (status) {
    case 'confirmed': return '待领取';
    case 'pending': return '待发货';
    case 'shipped': return '已发货';
    case 'in-person': return '已发放';
    default: return '已达标·待确认';
  }
}

/** 里程碑状态样式 */
function milestoneStatusCls(m: { achieved: boolean; threshold: number }): string {
  if (!m.achieved) return 'bg-gray-100 text-gray-400';
  const status = milestoneClaimStatus(m.threshold);
  switch (status) {
    case 'confirmed': return 'bg-[#FF976A] text-white';
    case 'pending': return 'bg-blue-500 text-white';
    case 'shipped': return 'bg-blue-400 text-white';
    case 'in-person': return 'bg-[#07C160] text-white';
    default: return 'bg-[#07C160] text-white';
  }
}

// 每周挑战（按当前营期过滤，用活动配置的 weeklyChallengeStartDate 或营期开营日作为周计算起点）
const challenges = computed(() => computeWeeklyChallenges(
  campDietRecords.value, campExerciseRecords.value, campWeightRecords.value,
  store.user?.id,
  {
    challengeStartDate: activityConfig.value.weeklyChallengeStartDate,
    challengeWeeks: activityConfig.value.weeklyChallengeWeeks,
    campStartDate: activeCamp.value?.startDate,
  },
));

// 挑战是否尚未开始（开始日期在未来）
const challengeNotStarted = computed(() => {
  if (!activityConfig.value.weeklyChallenge || !activityConfig.value.weeklyChallengeStartDate) return false;
  return challenges.value.length > 0 && challenges.value.every(c => c.status === 'locked');
});

// 全勤抽奖 - 分母取自营养师配置的营期起止日期，分子按营期范围过滤
const luckyDraw = computed(() => computeLuckyDraw(
  campDietRecords.value, campExerciseRecords.value, campWeightRecords.value,
  store.user?.id,
  activeCamp.value ? (() => {
    const c = activeCamp.value;
    if (c.startDate && c.endDate) {
      const s = new Date(c.startDate);
      const e = new Date(c.endDate);
      const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 28;
    }
    return 28;
  })() : 28,
));

// ---- 活动奖励（营养师审核通过后学员可领取） ----
const myActivityClaims = computed(() => {
  return campRewardClaims.value
    .filter(c => {
      if (c.studentId !== store.user?.id) return false;
      const tier = campRewardTiers.value.find(t => t.id === c.tierId);
      return tier?.source === 'activity';
    })
    .map(c => {
      const tier = campRewardTiers.value.find(t => t.id === c.tierId);
      return { claim: c, tier };
    })
    .sort((a, b) => b.claim.claimDate.localeCompare(a.claim.claimDate));
});

// 可领取的奖励（营养师已审核通过）
const claimableRewards = computed(() => myActivityClaims.value.filter(item => item.claim.status === 'confirmed'));
// 待发货
const pendingShip = computed(() => myActivityClaims.value.filter(item => item.claim.status === 'pending'));
// 已完成
const fulfilled = computed(() => myActivityClaims.value.filter(item => item.claim.status === 'shipped' || item.claim.status === 'in-person'));

// ---- 领取弹窗 ----
const showClaimModal = ref(false);
const claimTarget = ref<RewardClaim | null>(null);
const deliveryMethod = ref<'shipped' | 'in-person'>('shipped');
const formData = ref({ name: store.user?.name || '', phone: store.user?.phone || '', address: '' });
const claimError = ref('');

function openClaimModal(claim: RewardClaim) {
  claimTarget.value = claim;
  // 根据奖品配置的领取方式设置默认值
  const tier = campRewardTiers.value.find(t => t.id === claim.tierId);
  const methods = tier?.deliveryMethods || ['shipped'];
  deliveryMethod.value = methods[0];
  formData.value = { name: store.user?.name || '', phone: store.user?.phone || '', address: '' };
  claimError.value = '';
  showClaimModal.value = true;
}

// 当前领取弹窗中奖品支持的领取方式
const claimableDeliveryMethods = computed(() => {
  if (!claimTarget.value) return ['shipped' as const];
  const tier = campRewardTiers.value.find(t => t.id === claimTarget.value!.tierId);
  return tier?.deliveryMethods || ['shipped' as const];
});
const showDeliveryChoice = computed(() => claimableDeliveryMethods.value.length > 1);

function submitClaim() {
  if (!claimTarget.value) return;
  if (deliveryMethod.value === 'shipped') {
    if (!formData.value.name.trim()) { claimError.value = '请输入收货人姓名'; return; }
    if (!/^1[3-9]\d{9}$/.test(formData.value.phone.trim())) { claimError.value = '请输入有效的11位手机号'; return; }
    if (!formData.value.address.trim()) { claimError.value = '请输入详细收货地址'; return; }
  }

  store.updateRewardClaim(claimTarget.value.id, {
    status: 'pending',
    deliveryMethod: deliveryMethod.value,
    recipientName: deliveryMethod.value === 'shipped' ? formData.value.name.trim() : store.user?.name || '',
    recipientPhone: deliveryMethod.value === 'shipped' ? formData.value.phone.trim() : store.user?.phone || '',
    recipientAddress: deliveryMethod.value === 'shipped' ? formData.value.address.trim() : '线下领取',
  });

  showClaimModal.value = false;
  showToast('领取成功！营养师将尽快为您发货');
}

// 分活动查看：避免所有活动堆在一页显示太乱
const activityTab = ref<'milestone' | 'weekly' | 'lucky'>('milestone');

const challengeStatusConfig = (status: string) => {
  switch (status) {
    case 'completed': return { text: '已完成', cls: 'text-[#07C160] bg-[#07C160]/10' };
    case 'active': return { text: '进行中', cls: 'text-[#FF976A] bg-[#FF976A]/10' };
    case 'missed': return { text: '已过期', cls: 'text-gray-400 bg-gray-100' };
    default: return { text: '未开始', cls: 'text-gray-400 bg-gray-100' };
  }
};

const activityTypeLabel = (type?: string) => {
  switch (type) {
    case 'milestone': return '阶梯达标';
    case 'weekly': return '每周挑战完成';
    case 'lucky': return '全勤幸运抽奖';
    default: return '活动奖励';
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-28 font-sans">
    <NavBar title="趣味活动" :on-back="store.goBack" />

    <div class="p-4 space-y-4">
      <!-- 营期切换（多期时显示） -->
      <div v-if="showCampSwitcher" class="flex items-center gap-2">
        <button
          @click="showCampPicker = true"
          class="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-sm font-medium text-gray-700 active:bg-gray-50"
        >
          {{ activeCamp?.name || '选择营期' }}
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
        <span v-if="activeCamp?.startDate && activeCamp?.endDate" class="text-xs text-gray-400">
          {{ activeCamp.startDate }} ~ {{ activeCamp.endDate }}
        </span>
      </div>
      <!-- 单期时显示营期名称和日期 -->
      <div v-else-if="activeCamp" class="text-xs text-gray-400 pl-1">
        {{ activeCamp.name }}
        <span v-if="activeCamp.startDate && activeCamp.endDate"> · {{ activeCamp.startDate }} ~ {{ activeCamp.endDate }}</span>
      </div>
      <!-- 顶部限时活动横幅 -->
      <div class="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#07C160]/10 via-[#FF976A]/8 to-[#1677FF]/8 border border-white/60 shadow-sm">
        <!-- 装饰背景 -->
        <div class="absolute -top-8 -right-8 w-28 h-28 bg-[#FF976A]/12 rounded-full blur-2xl pointer-events-none"></div>
        <div class="absolute -bottom-6 -left-6 w-24 h-24 bg-[#07C160]/10 rounded-full blur-2xl pointer-events-none"></div>
        <div class="absolute top-3 right-12 w-3 h-3 bg-[#FF976A]/20 rounded-full pointer-events-none"></div>
        <div class="absolute bottom-4 right-20 w-2 h-2 bg-[#07C160]/20 rounded-full pointer-events-none"></div>

        <div class="relative z-10">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[10px] font-bold text-white bg-gradient-to-r from-[#FF976A] to-[#FF6B35] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Zap class="w-2.5 h-2.5" /> 限时活动
            </span>
            <span v-if="activeCamp?.endDate" class="text-[10px] text-gray-400">截至 {{ activeCamp.endDate }}</span>
          </div>
          <h2 class="text-lg font-black text-gray-900 mb-0.5">达标赢好礼</h2>
          <p class="text-xs text-gray-500 leading-relaxed">
            完成挑战赢奖励，与积分排名互不影响，人人都能参与！
          </p>
        </div>
      </div>

      <!-- 活动奖励（审核通过后领取） -->
      <Card v-if="myActivityClaims.length > 0">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Gift class="h-4 w-4 text-[#FF976A]" />
          我的活动奖励
        </h3>

        <!-- 可领取 -->
        <div v-for="item in claimableRewards" :key="item.claim.id" class="mb-3">
          <div class="rounded-xl p-4 border-2 border-[#FF976A]/30 bg-gradient-to-br from-orange-50 to-yellow-50 relative overflow-hidden">
            <div class="absolute top-2 right-2">
              <span class="text-[9px] font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-0.5 rounded-full animate-pulse">可领取</span>
            </div>
            <div class="flex gap-3 items-start">
              <img loading="lazy" decoding="async" v-if="item.tier?.imageUrl" :src="item.tier.imageUrl" class="w-16 h-16 rounded-xl object-cover bg-gray-100" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-gray-900">{{ item.tier?.name || '活动奖品' }}</div>
                <div class="text-[10px] text-gray-500 mt-0.5">{{ activityTypeLabel(item.claim.activityType) }} · 审核已通过</div>
                <button
                  @click="openClaimModal(item.claim)"
                  class="mt-2 w-full py-2 rounded-xl bg-gradient-to-r from-[#FF976A] to-[#FF6B35] text-white text-xs font-bold shadow-md active:scale-95 transition-transform"
                >
                  立即领取
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 待发货 -->
        <div v-for="item in pendingShip" :key="item.claim.id" class="mb-3">
          <div class="rounded-xl p-4 border border-blue-100 bg-blue-50/50">
            <div class="flex gap-3 items-start">
              <img loading="lazy" decoding="async" v-if="item.tier?.imageUrl" :src="item.tier.imageUrl" class="w-16 h-16 rounded-xl object-cover bg-gray-100 opacity-80" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-gray-900">{{ item.tier?.name || '活动奖品' }}</div>
                <div class="text-[10px] text-gray-500 mt-0.5">{{ activityTypeLabel(item.claim.activityType) }}</div>
                <div class="mt-2 flex items-center gap-1.5">
                  <span class="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full flex items-center gap-1">
                    <Truck class="w-3 h-3" />
                    {{ item.claim.deliveryMethod === 'shipped' ? '待发货' : '待线下发放' }}
                  </span>
                </div>
                <div v-if="item.claim.recipientName && item.claim.recipientAddress && item.claim.recipientAddress !== '线下领取'" class="text-[10px] text-gray-400 mt-1.5">
                  {{ item.claim.recipientName }} · {{ item.claim.recipientAddress }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 已完成 -->
        <div v-for="item in fulfilled" :key="item.claim.id" class="mb-3 last:mb-0">
          <div class="rounded-xl p-4 border border-green-100 bg-green-50/30">
            <div class="flex gap-3 items-start">
              <img loading="lazy" decoding="async" v-if="item.tier?.imageUrl" :src="item.tier.imageUrl" class="w-16 h-16 rounded-xl object-cover bg-gray-100" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <div class="text-sm font-bold text-gray-900">{{ item.tier?.name || '活动奖品' }}</div>
                  <CheckCircle2 class="w-4 h-4 text-[#07C160]" />
                </div>
                <div class="text-[10px] text-gray-500 mt-0.5">{{ activityTypeLabel(item.claim.activityType) }}</div>
                <div v-if="item.claim.status === 'shipped'" class="mt-2 text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-lg border border-blue-100">
                  <div class="font-bold flex items-center gap-1"><Package class="w-3 h-3" /> 已发货</div>
                  <div class="font-mono mt-0.5">单号: {{ item.claim.trackingNumber }}</div>
                </div>
                <div v-else class="mt-2 text-[10px] bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg border border-green-100 flex items-center gap-1">
                  <HandCoins class="w-3 h-3" /> 已线下领取
                </div>
                <!-- 收货地址信息 -->
                <div v-if="item.claim.recipientName && item.claim.recipientAddress && item.claim.recipientAddress !== '线下领取'" class="mt-1.5 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
                  <div class="flex items-center gap-1 text-gray-400 mb-0.5">
                    <MapPin class="w-3 h-3" /> 收货信息
                  </div>
                  <div>{{ item.claim.recipientName }} {{ item.claim.recipientPhone }}</div>
                  <div class="mt-0.5">{{ item.claim.recipientAddress }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- 活动分类切换（液态玻璃胶囊，避免所有活动堆在一页） -->
      <div v-if="activityConfig.weightMilestone || activityConfig.weeklyChallenge || activityConfig.luckyDraw" class="seg-tabs">
        <button
          v-if="activityConfig.weightMilestone"
          @click="activityTab = 'milestone'"
          :class="['seg-tab seg-tab-green', activityTab === 'milestone' ? 'active' : '']"
        >
          <Scale class="w-3.5 h-3.5" /> 阶梯达标
        </button>
        <button
          v-if="activityConfig.weeklyChallenge"
          @click="activityTab = 'weekly'"
          :class="['seg-tab seg-tab-blue', activityTab === 'weekly' ? 'active' : '']"
        >
          <Calendar class="w-3.5 h-3.5" /> 每周挑战
        </button>
        <button
          v-if="activityConfig.luckyDraw"
          @click="activityTab = 'lucky'"
          :class="['seg-tab seg-tab-orange', activityTab === 'lucky' ? 'active' : '']"
        >
          <PartyPopper class="w-3.5 h-3.5" /> 全勤抽奖
        </button>
      </div>

      <!-- 阶梯达标奖 -->
      <Card v-if="activityConfig.weightMilestone && activityTab === 'milestone'">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Scale class="h-4 w-4 text-[#07C160]" />
          阶梯达标奖
        </h3>
        <p class="text-[10px] text-gray-400 mb-3">按开营体重百分比计算，达标后上传体重秤照片，营养师确认即可领奖</p>

        <!-- 当前进度：核心成果"已减Xkg"大数字突出展示 -->
        <div v-if="startWeight && latestWeight" class="relative overflow-hidden rounded-2xl p-5 mb-4 text-center border border-[#07C160]/20 bg-gradient-to-b from-[#07C160]/[0.07] to-white">
          <div class="absolute -top-10 -right-10 w-32 h-32 bg-[#07C160]/10 rounded-full blur-2xl pointer-events-none"></div>
          <div class="text-[11px] text-gray-400 font-medium mb-1">开营 {{ startWeight }}kg → 当前 {{ latestWeight }}kg</div>
          <div :class="['text-4xl font-black tracking-tight leading-none', (startWeight - latestWeight) > 0 ? 'text-[#07C160]' : 'text-gray-900']">
            {{ (startWeight - latestWeight) > 0 ? '-' : '+' }}{{ Math.abs(startWeight - latestWeight).toFixed(1) }}<span class="text-base font-bold ml-0.5">kg</span>
          </div>
          <div class="text-[11px] font-bold mt-1.5" :class="(startWeight - latestWeight) > 0 ? 'text-[#07C160]' : 'text-gray-500'">
            {{ (startWeight - latestWeight) > 0 ? '已下降' : '增了' }} {{ (Math.abs(startWeight - latestWeight) / startWeight * 100).toFixed(1) }}%
            <span v-if="(startWeight - latestWeight) > 0" class="ml-1">🎉</span>
          </div>
        </div>

        <div class="space-y-3">
          <div
            v-for="m in milestones"
            :key="m.id"
            :class="['rounded-xl p-3 border transition-all', m.achieved ? 'border-[#07C160]/30 bg-[#07C160]/5' : 'border-gray-100 bg-white']"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-lg">{{ m.achieved ? '🎉' : '🎯' }}</span>
                <span class="text-sm font-bold" :class="m.achieved ? 'text-[#07C160]' : 'text-gray-900'">{{ m.label }}</span>
              </div>
              <span :class="['text-[10px] font-bold px-2 py-0.5 rounded-full', milestoneStatusCls(m)]">
                {{ milestoneStatusText(m) }}
              </span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="m.achieved ? 'bg-[#07C160]' : 'bg-[#FF976A]'"
                :style="{ width: `${m.progress * 100}%` }"
              ></div>
            </div>
            <div class="text-[10px] text-gray-400 mt-1.5">{{ m.reward }} · 需营养师确认体重秤照片</div>
          </div>
        </div>
      </Card>

      <!-- 每周主题挑战 -->
      <Card v-if="activityConfig.weeklyChallenge && activityTab === 'weekly'">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Calendar class="h-4 w-4 text-[#1677FF]" />
          每周主题挑战
          <span class="text-[10px] text-[#1677FF] bg-[#1677FF]/10 px-1.5 py-0.5 rounded-full ml-auto">{{ challenges.filter(c => c.completed).length }}/{{ challenges.length }} 周</span>
        </h3>
        <!-- 未开始提示 -->
        <div v-if="challengeNotStarted" class="rounded-xl p-4 mb-3 bg-blue-50 border border-blue-100 text-center">
          <div class="text-2xl mb-1">🗓️</div>
          <div class="text-sm font-bold text-gray-900">挑战尚未开始</div>
          <div class="text-xs text-gray-500 mt-1">开始日期：{{ activityConfig.weeklyChallengeStartDate }}，敬请期待！</div>
        </div>
        <div class="space-y-3">
          <div
            v-for="c in challenges"
            :key="c.id"
            :class="['relative overflow-hidden rounded-2xl p-4 border transition-all', c.isCurrent ? 'border-[#FF976A]/30 bg-gradient-to-br from-[#FF976A]/8 to-white' : c.completed ? 'border-[#07C160]/20 bg-gradient-to-br from-[#07C160]/6 to-white' : 'border-gray-100 bg-white']"
          >
            <!-- 装饰圆点 -->
            <div v-if="c.completed" class="absolute -top-4 -right-4 w-16 h-16 bg-[#07C160]/8 rounded-full blur-xl pointer-events-none"></div>
            <div v-else-if="c.isCurrent" class="absolute -top-4 -right-4 w-16 h-16 bg-[#FF976A]/8 rounded-full blur-xl pointer-events-none"></div>

            <div class="relative z-10 flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2">
                <span class="text-2xl">{{ c.icon }}</span>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-black text-gray-900">{{ c.title }}</span>
                    <span v-if="c.isCurrent" class="text-[9px] bg-[#FF976A] text-white px-1.5 py-0.5 rounded-full font-bold">本周</span>
                  </div>
                  <div class="text-[10px] text-gray-400">{{ c.weekStart }} ~ {{ c.weekEnd }}</div>
                </div>
              </div>
              <span :class="['text-[10px] font-bold px-2 py-0.5 rounded-full', challengeStatusConfig(c.status).cls]">
                {{ challengeStatusConfig(c.status).text }}
              </span>
            </div>
            <p class="relative z-10 text-xs text-gray-500 mb-2">{{ c.description }}</p>
            <div class="relative z-10 flex items-center gap-2">
              <div class="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="c.completed ? 'bg-[#07C160]' : 'bg-[#FF976A]'"
                  :style="{ width: `${c.progress * 100}%` }"
                ></div>
              </div>
              <span class="text-[10px] text-gray-400 shrink-0">{{ c.progressText }}</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 全勤幸运抽奖 -->
      <Card v-if="activityConfig.luckyDraw && activityTab === 'lucky'">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <PartyPopper class="h-4 w-4 text-[#FF976A]" />
          全勤幸运抽奖
        </h3>
        <p class="text-[10px] text-gray-400 mb-3">打卡完成率 ≥80% 即可进入抽奖池，结营时抽取幸运学员送出特别礼品</p>

        <div :class="['relative overflow-hidden rounded-2xl p-5 text-center border', luckyDraw.eligible ? 'border-[#07C160]/30 bg-gradient-to-b from-[#07C160]/8 to-white' : 'border-gray-100 bg-gradient-to-b from-gray-50 to-white']">
          <!-- 装饰背景 -->
          <div v-if="luckyDraw.eligible" class="absolute -top-6 -right-6 w-24 h-24 bg-[#07C160]/10 rounded-full blur-2xl pointer-events-none"></div>
          <div v-else class="absolute -top-6 -right-6 w-24 h-24 bg-[#FF976A]/8 rounded-full blur-2xl pointer-events-none"></div>
          <div class="absolute bottom-2 left-3 w-2 h-2 bg-[#FF976A]/15 rounded-full pointer-events-none"></div>

          <div class="relative z-10">
            <div class="text-3xl mb-1">{{ luckyDraw.eligible ? '🎊' : '🍀' }}</div>
            <div class="text-sm font-black" :class="luckyDraw.eligible ? 'text-[#07C160]' : 'text-gray-700'">
              {{ luckyDraw.eligible ? '恭喜！你已进入抽奖池' : '继续加油，还差一点点' }}
            </div>
            <div class="text-xs text-gray-500 mt-1">
              完成率 {{ Math.round(luckyDraw.completionRate * 100) }}%（{{ luckyDraw.progressText }}）
              <template v-if="!luckyDraw.eligible">
                ，目标 80%
              </template>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5 mt-3 overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="luckyDraw.eligible ? 'bg-[#07C160]' : 'bg-[#FF976A]'"
                :style="{ width: `${Math.min(luckyDraw.completionRate / 0.8 * 100, 100)}%` }"
              ></div>
            </div>
          </div>
        </div>
      </Card>

      <!-- 底部说明 -->
      <div v-if="!activityConfig.weightMilestone && !activityConfig.weeklyChallenge && !activityConfig.luckyDraw" class="text-center py-10 bg-white rounded-2xl border border-gray-100">
        <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-gray-100 flex items-center justify-center">
          <Zap class="w-7 h-7 text-gray-300" />
        </div>
        <div class="text-sm font-bold text-gray-400">活动暂未开启</div>
        <div class="text-xs text-gray-300 mt-1">营养师正在准备中，请稍后再来</div>
      </div>

      <div v-else class="text-center py-3">
        <p class="text-[10px] text-gray-300">活动奖励与积分排名互不影响，人人可参与</p>
        <p class="text-[10px] text-gray-300 mt-0.5">具体奖品以企业/营养师通知为准</p>
      </div>
    </div>

    <!-- 领取弹窗 -->
    <VanPopup v-model:show="showClaimModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5" v-if="claimTarget">
        <h3 class="text-lg font-bold text-gray-900 mb-1">领取活动奖励</h3>
        <p class="text-xs text-gray-500 mb-4">{{ activityTypeLabel(claimTarget.activityType) }}</p>

        <!-- 奖品信息 -->
        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 p-3 rounded-xl mb-4 flex gap-3 items-center border border-orange-100">
          <img loading="lazy" decoding="async" v-if="claimTarget.tierId && campRewardTiers.find(t => t.id === claimTarget.tierId)?.imageUrl" :src="campRewardTiers.find(t => t.id === claimTarget.tierId)!.imageUrl" class="w-12 h-12 rounded-lg object-cover" />
          <div>
            <div class="text-sm font-bold text-gray-900">{{ campRewardTiers.find(t => t.id === claimTarget.tierId)?.name || '活动奖品' }}</div>
            <div class="text-xs text-orange-600 mt-0.5">营养师已审核通过</div>
          </div>
        </div>

        <!-- 领取方式（仅当配置了多种方式时显示选择） -->
        <div v-if="showDeliveryChoice" class="mb-4">
          <label class="text-sm font-medium text-gray-700 block mb-2">领取方式</label>
          <div class="flex gap-2">
            <button
              v-if="claimableDeliveryMethods.includes('shipped')"
              :class="['flex-1 py-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5', deliveryMethod === 'shipped' ? 'border-[#1677FF] bg-[#1677FF]/5 text-[#1677FF]' : 'border-gray-200 text-gray-500']"
              @click="deliveryMethod = 'shipped'"
            >
              <Truck class="w-4 h-4" /> 快递邮寄
            </button>
            <button
              v-if="claimableDeliveryMethods.includes('in-person')"
              :class="['flex-1 py-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5', deliveryMethod === 'in-person' ? 'border-[#07C160] bg-[#07C160]/5 text-[#07C160]' : 'border-gray-200 text-gray-500']"
              @click="deliveryMethod = 'in-person'"
            >
              <HandCoins class="w-4 h-4" /> 线下领取
            </button>
          </div>
        </div>
        <!-- 仅一种方式时显示提示 -->
        <div v-else class="mb-4">
          <div class="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <component :is="claimableDeliveryMethods[0] === 'shipped' ? Truck : HandCoins" class="w-4 h-4" />
            领取方式：{{ claimableDeliveryMethods[0] === 'shipped' ? '快递邮寄' : '线下领取' }}
          </div>
        </div>

        <!-- 快递信息表单 -->
        <div v-if="deliveryMethod === 'shipped'" class="space-y-4 mb-6">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">收货人 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="请输入姓名" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="formData.name" @input="claimError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">手机号 <span class="text-red-500">*</span></label>
            <input type="tel" placeholder="请输入11位手机号" maxlength="11" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="formData.phone" @input="claimError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">详细地址 <span class="text-red-500">*</span></label>
            <textarea placeholder="省市区、街道、小区、楼栋及门牌号" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm h-20 resize-none transition-colors" v-model="formData.address" @input="claimError = ''"></textarea>
          </div>
        </div>

        <!-- 线下领取说明 -->
        <div v-else class="bg-green-50 rounded-xl p-4 mb-6 text-center">
          <HandCoins class="w-10 h-10 text-[#07C160] mx-auto mb-2" />
          <div class="text-sm font-bold text-gray-900">线下领取</div>
          <div class="text-xs text-gray-500 mt-1">提交后营养师将与你联系安排线下领取</div>
        </div>

        <div v-if="claimError" class="text-red-500 text-xs font-medium text-center mb-3">{{ claimError }}</div>

        <button class="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FF976A] to-[#FF6B35] text-white font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-transform" @click="submitClaim">
          确认领取
        </button>
      </div>
    </VanPopup>

    <StudentTabbar anchor="dashboard" :badge="unreadCount > 0 ? unreadCount : undefined" />

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round class="custom-popup">
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in availableCamps"
            :key="camp.id"
            @click="handleCampSelect(camp.id)"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              activeCampId === camp.id
                ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div>
              <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
              <span v-if="camp.startDate && camp.endDate" class="text-xs text-gray-400 ml-2">{{ camp.startDate }} ~ {{ camp.endDate }}</span>
            </div>
            <span
              v-if="camp.status === 'active'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600"
            >进行中</span>
            <span
              v-else-if="camp.status === 'ended'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >已结束</span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500"
            >未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
