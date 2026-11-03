<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar as VanNavBar, showSuccessToast } from 'vant';
import { StudentTabbar } from './ui';
import { Coins, Truck, Package, AlertTriangle, ChevronRight, MapPin } from 'lucide-vue-next';
import type { PointExchangeRecord, RewardClaim } from '../types';
import { calculateStreak, calculateLongestStreakInRange } from '../lib/streak';
import { format } from 'date-fns';

const store = useAppStore();

// ─── Tab（去掉「活动奖励」，仅 全部/积分兑换/打卡奖励） ───
type Tab = 'all' | 'exchange' | 'reward';
const activeTab = ref<Tab>('all');
// 从消息中心发货通知等跳进来时，始终回到「全部」tab（即使 KeepAlive 缓存过旧 tab）
onMounted(() => { activeTab.value = 'all'; captureUnlocks(); });
onActivated(() => { activeTab.value = 'all'; captureUnlocks(); });

// ─── 学员数据 ───
const studentId = computed(() => store.user?.id || '');

// ─── 营期上下文（与日历、首页保持一致） ───
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

// 营期范围内的奖品层级（用于 tier 查找）
const campTiers = computed(() =>
  activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers,
);

// 营期打卡记录（用于连续天数计算）
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);

// 连续打卡数据
const streakData = computed(() => calculateStreak(campEx.value, campDiet.value, campWt.value, studentId.value));

// ─── 资格快照：营期内任意历史最长连续（断签后已解锁未领取档位不回落），与 RewardView 口径一致 ──
const activeCampObj = computed(() => availableCamps.value.find(c => c.id === activeCampId.value) || null);
const campLongestStreak = computed(() => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const endRaw = activeCampObj.value?.endDate || todayStr;
  const end = endRaw < todayStr ? endRaw : todayStr;
  return calculateLongestStreakInRange(
    activeCampObj.value?.startDate || '2000-01-01',
    end,
    campEx.value, campDiet.value, campWt.value,
    studentId.value,
  );
});

// 积分兑换记录（按当前营期过滤，与打卡/活动奖励口径一致）
const exchanges = computed(() =>
  store.getStudentExchanges(studentId.value)
    .filter((e) => !activeCampId.value || !e.campId || e.campId === activeCampId.value),
);

// 打卡奖励 claims（source = streak）— 按营期过滤
const streakClaims = computed(() => {
  const claims = activeCampId.value
    ? store.getCampRewardClaims(activeCampId.value)
    : store.rewardClaims;
  return claims.filter(c => {
    if (c.studentId !== studentId.value) return false;
    const tier = campTiers.value.find(t => t.id === c.tierId);
    return tier?.source === 'streak';
  });
});

// 该学员已领取过的连续打卡 tierId 集合（判"未领取"直接查 rewardClaims，不依赖档位是否仍存在——被删档也可定位）
const claimedStreakTierIds = computed(() => {
  const claims = activeCampId.value
    ? store.getCampRewardClaims(activeCampId.value)
    : store.rewardClaims;
  return new Set(claims.filter(c => c.studentId === studentId.value).map(c => c.tierId));
});

// 已解锁未领取的档位（含已被营养师下架/删除的）：以"解锁时的快照"为准渲染，
// 任何档位状态(下架/删除)都不影响已解锁记录的展示（资格快照语义）。live 仍上架且有货时用 live 呈现。
const claimableStreakTiers = computed(() => {
  const records = store
    .getStudentUnlockRecords(studentId.value, activeCampId.value)
    .filter(r => !claimedStreakTierIds.value.has(r.tierId));
  return records
    .map(r => {
      const live = campTiers.value.find(t => t.id === r.tierId);
      // live 存在但已售罄：无法领取则暂不在此展示（RewardView 显示售罄）；live 不存在=已删除，快照兜底始终可领
      if (live && live.stock <= 0) return null;
      return {
        id: r.tierId,
        name: live?.name ?? r.snapshot.name,
        imageUrl: live?.imageUrl ?? r.snapshot.imageUrl,
        requiredDays: r.snapshot.requiredDays,
      };
    })
    .filter((x): x is { id: string; name: string; imageUrl: string; requiredDays: number } => !!x);
});

/** 进入本页时把"已解锁未领取"的 live 档位快照落盘（幂等），确保营养师此后下架/删除该奖，学员端依赖快照仍能显示并领取。 */
function captureUnlocks() {
  const achieved = Math.max(streakData.value.currentStreak, campLongestStreak.value);
  const freshUnlocked = campTiers.value.filter(t =>
    t.source === 'streak' && t.requiredDays > 0 && t.active !== false &&
    !claimedStreakTierIds.value.has(t.id) && achieved >= t.requiredDays,
  );
  if (freshUnlocked.length) {
    store.recordUnlockSnapshots(studentId.value, activeCampId.value, freshUnlocked);
  }
}

// 活动奖励 claims（source = activity）— 按营期过滤
const activityClaims = computed(() => {
  const claims = activeCampId.value
    ? store.getCampRewardClaims(activeCampId.value)
    : store.rewardClaims;
  return claims.filter(c => {
    if (c.studentId !== studentId.value) return false;
    const tier = campTiers.value.find(t => t.id === c.tierId);
    return tier?.source === 'activity';
  });
});

// 统一记录类型
interface UnifiedRecord {
  id: string;
  type: 'exchange' | 'streak' | 'activity';
  typeName: string;
  productName: string;
  productImage: string;
  date: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  deliveryMethod?: 'shipped' | 'in-person';
  trackingNumber?: string;
  shipDate?: string;
  deliveredAt?: string;
  pointsSpent?: number;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  raw?: PointExchangeRecord | RewardClaim;
}

const EXCHANGE_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待发货', color: '#1677FF', bg: '#EBF5FF' },
  fulfilled: { label: '已发货', color: '#07C160', bg: '#E8F8EE' },
  cancelled: { label: '已取消', color: '#969799', bg: '#F2F3F5' },
};

const CLAIM_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  claimable: { label: '可领取', color: '#FF976A', bg: '#FFF4ED' },
  confirmed: { label: '待领取', color: '#FF976A', bg: '#FFF4ED' },
  pending: { label: '待发货', color: '#1677FF', bg: '#EBF5FF' },
  shipped: { label: '已发货', color: '#07C160', bg: '#E8F8EE' },
  'in-person': { label: '线下发放', color: '#07C160', bg: '#E8F8EE' },
};

/** 领取记录状态标签：线下方式且尚未发放时要区分"待线下发放"，与打卡奖励/日历的"等待线下发放"口径一致 */
function claimStatusMeta(claim: { status: string; deliveryMethod?: string }) {
  const base = CLAIM_STATUS_MAP[claim.status] || { label: claim.status, color: '#969799', bg: '#F2F3F5' };
  if (claim.status === 'pending' && claim.deliveryMethod === 'in-person') {
    return { label: '待线下发放', color: '#FF976A', bg: '#FFF4ED' };
  }
  return base;
}

const allRecords = computed<UnifiedRecord[]>(() => {
  const list: UnifiedRecord[] = [];

  // 兑换记录
  exchanges.value.forEach(e => {
    // 与领取记录同口径：待发货的线下兑换在「我的奖励」显示"待线下发放"（发放中心同单显示"线下领取"）
    const s = (e.status === 'pending' && e.deliveryMethod === 'in-person')
      ? { label: '待线下发放', color: '#FF976A', bg: '#FFF4ED' }
      : EXCHANGE_STATUS_MAP[e.status] || { label: e.status, color: '#969799', bg: '#F2F3F5' };
    list.push({
      id: e.id, type: 'exchange', typeName: '积分兑换',
      productName: e.productName, productImage: e.productImage,
      date: e.exchangeDate, status: e.status,
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
      deliveryMethod: e.deliveryMethod,
      trackingNumber: e.trackingNumber,
      shipDate: e.shipDate, deliveredAt: e.deliveredAt,
      pointsSpent: e.pointsSpent,
      recipientName: e.recipientName,
      recipientPhone: e.recipientPhone,
      recipientAddress: e.recipientAddress,
      raw: e,
    });
  });

  // 打卡奖励
  streakClaims.value.forEach(c => {
    const tier = campTiers.value.find(t => t.id === c.tierId);
    const s = claimStatusMeta(c);
    list.push({
      id: c.id, type: 'streak', typeName: '打卡奖励',
      productName: tier?.name || '未知礼品', productImage: tier?.imageUrl || '',
      date: c.claimDate, status: c.status,
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
      deliveryMethod: c.deliveryMethod,
      trackingNumber: c.trackingNumber,
      shipDate: c.shipDate, deliveredAt: c.deliveredAt,
      recipientName: c.recipientName,
      recipientPhone: c.recipientPhone,
      recipientAddress: c.recipientAddress,
      raw: c,
    });
  });

  // 可领取但尚未领取的连续打卡奖励
  claimableStreakTiers.value.forEach(tier => {
    const s = CLAIM_STATUS_MAP['claimable'];
    list.push({
      id: 'claimable_' + tier.id, type: 'streak', typeName: '打卡奖励',
      productName: tier.name, productImage: tier.imageUrl,
      date: new Date().toISOString().substring(0, 10),
      status: 'claimable',
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
    });
  });

  // 活动奖励
  activityClaims.value.forEach(c => {
    const tier = campTiers.value.find(t => t.id === c.tierId);
    const s = claimStatusMeta(c);
    list.push({
      id: c.id, type: 'activity', typeName: '活动奖励',
      productName: tier?.name || '未知礼品', productImage: tier?.imageUrl || '',
      date: c.claimDate, status: c.status,
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
      deliveryMethod: c.deliveryMethod,
      trackingNumber: c.trackingNumber,
      shipDate: c.shipDate, deliveredAt: c.deliveredAt,
      recipientName: c.recipientName,
      recipientPhone: c.recipientPhone,
      recipientAddress: c.recipientAddress,
      raw: c,
    });
  });

  return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

const filteredRecords = computed(() => {
  if (activeTab.value === 'all') return allRecords.value;
  // tab key 'reward' 对应 unified record type 'streak'
  const typeFilter = activeTab.value === 'reward' ? 'streak' : activeTab.value;
  return allRecords.value.filter(r => r.type === typeFilter);
});

const tabCounts = computed(() => ({
  all: allRecords.value.length,
  exchange: allRecords.value.filter(r => r.type === 'exchange').length,
  reward: allRecords.value.filter(r => r.type === 'streak').length,
}));

// ─── 跳转到领取页面 ───
function goToClaim(record: UnifiedRecord) {
  if (record.type === 'streak') {
    store.setCurrentView('reward');
  } else if (record.type === 'activity') {
    store.setCurrentView('camp-activities');
  }
}

// ─── 取消兑换二次确认 ───
const showCancelModal = ref(false);
const cancelTarget = ref<UnifiedRecord | null>(null);

function openCancelModal(record: UnifiedRecord) {
  cancelTarget.value = record;
  showCancelModal.value = true;
}

function confirmCancel() {
  if (!cancelTarget.value || cancelTarget.value.type !== 'exchange') return;
  const raw = cancelTarget.value.raw as PointExchangeRecord;
  store.cancelExchange(raw.id, store.user?.role === 'dietitian' ? store.user.name : store.user?.name || '学员');
  showCancelModal.value = false;
  cancelTarget.value = null;
  showSuccessToast('已取消兑换，积分已返还');
}

// ─── 修改收货地址（积分兑换·待发货·邮寄方式） ───
const showEditAddress = ref(false);
const editTarget = ref<UnifiedRecord | null>(null);
const editAddressForm = ref({ name: '', phone: '', address: '' });
const editAddressError = ref('');

function openEditAddress(record: UnifiedRecord) {
  editTarget.value = record;
  editAddressForm.value = {
    name: record.recipientName || '',
    phone: record.recipientPhone || '',
    address: record.recipientAddress || '',
  };
  editAddressError.value = '';
  showEditAddress.value = true;
}

function submitAddressEdit() {
  if (!editTarget.value) return;
  if (editTarget.value.type !== 'exchange' && editTarget.value.type !== 'streak') return;
  if (!editAddressForm.value.name.trim()) { editAddressError.value = '请输入收货人姓名'; return; }
  if (!/^1[3-9]\d{9}$/.test(editAddressForm.value.phone.trim())) { editAddressError.value = '请输入有效的11位手机号'; return; }
  if (!editAddressForm.value.address.trim()) { editAddressError.value = '请输入详细收货地址'; return; }
  const info = {
    recipientName: editAddressForm.value.name.trim(),
    recipientPhone: editAddressForm.value.phone.trim(),
    recipientAddress: editAddressForm.value.address.trim(),
  };
  if (editTarget.value.type === 'exchange') {
    store.updateExchangeAddress((editTarget.value.raw as PointExchangeRecord).id, info);
  } else {
    // 打卡奖励走 updateRewardClaim（RewardClaim 侧），并标记已编辑一次——与打卡日历"仅可改1次"同口径
    store.updateRewardClaim((editTarget.value.raw as RewardClaim).id, { ...info, addressEdited: true });
  }
  showEditAddress.value = false;
  editTarget.value = null;
  showSuccessToast('收货地址已更新');
}

// ─── 工具函数 ───
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 未读批注
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);
</script>

<template>
  <div class="flex min-h-full flex-col font-sans relative bg-[#F7F8FA]">
    <!-- 返回 = 回来源页：首页「我的奖励」卡进入则回首页，活动页进入则回活动页（勿写死 activity-hub，否则无活动营期从首页进来返回会落进「无活动」空页） -->
    <VanNavBar left-arrow @click-left="store.goBack()" title="我的奖励" :border="false"
      class="!bg-transparent !pt-[env(safe-area-inset-top)]" />

    <!-- Tab 栏 -->
    <div class="px-5 pt-2 pb-3">
      <div class="flex gap-2 overflow-x-auto">
        <button
          v-for="t in [
            { key: 'all', label: '全部', count: tabCounts.all },
            { key: 'exchange', label: '积分兑换', count: tabCounts.exchange },
            { key: 'reward', label: '打卡奖励', count: tabCounts.reward },
          ]"
          :key="t.key"
          @click="activeTab = t.key as Tab"
          :class="[
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
            activeTab === t.key
              ? 'bg-[#FF6B35] text-white'
              : 'bg-white text-gray-500 border border-gray-200'
          ]"
        >
          {{ t.label }}
          <span v-if="t.count > 0" class="ml-0.5">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <!-- 记录列表 -->
    <div class="flex-1 px-5 pb-28">
      <div v-if="filteredRecords.length === 0" class="flex flex-col items-center justify-center py-24">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Package class="w-8 h-8 text-gray-300" />
        </div>
        <p class="text-sm text-gray-400">暂无奖励记录</p>
        <p class="text-[11px] text-gray-400 mt-1">坚持打卡，赢取丰厚奖励</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="record in filteredRecords" :key="record.id"
          class="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
        >
          <div class="flex p-3 gap-3">
            <!-- 商品图 -->
            <div class="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 shrink-0">
              <img loading="lazy" decoding="async" :src="record.productImage" class="w-full h-full object-cover" :alt="record.productName" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="text-sm font-bold text-gray-900 truncate">{{ record.productName }}</h3>
                <span
                  :class="['shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full',
                    record.statusBg, record.statusColor]"
                >
                  {{ record.statusLabel }}
                </span>
              </div>

              <!-- 来源标签 + 积分/日期 -->
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span :class="['text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                  record.type === 'exchange' ? 'bg-[#FFF4ED] text-[#FF6B35]' :
                  record.type === 'streak' ? 'bg-[#E8F8EE] text-[#07C160]' :
                  'bg-[#EBF5FF] text-[#1677FF]']">
                  {{ record.typeName }}
                </span>
                <span v-if="record.pointsSpent && record.status !== 'cancelled'" class="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <Coins class="w-3 h-3 text-[#FF976A]" />
                  <span class="font-bold text-[#FF6B35]">-{{ record.pointsSpent }}</span>
                </span>
                <!-- 已取消则积分已返还，不再显示红字扣分（弹窗明示已返还） -->
                <span v-else-if="record.pointsSpent && record.status === 'cancelled'" class="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <Coins class="w-3 h-3 text-[#07C160]" />
                  <span class="font-bold text-[#07C160]">+{{ record.pointsSpent }} 已返还</span>
                </span>
                <span v-if="record.status !== 'claimable'" class="text-[10px] text-gray-400">{{ formatDate(record.date) }}</span>
              </div>

              <!-- 配送方式 -->
              <div v-if="record.deliveryMethod" class="mt-1 text-[10px] text-gray-400">
                <Truck class="w-3 h-3 inline mr-0.5" />
                {{ record.deliveryMethod === 'shipped' ? '邮寄' : '线下领取' }}
              </div>

              <!-- 收货地址信息 -->
              <div v-if="record.recipientName && record.recipientAddress && record.recipientAddress !== '线下领取'" class="mt-1.5 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
                <div class="flex items-center gap-1 text-gray-400 mb-0.5">
                  <MapPin class="w-3 h-3" /> 收货信息
                </div>
                <div>{{ record.recipientName }} {{ record.recipientPhone }}</div>
                <div class="mt-0.5">{{ record.recipientAddress }}</div>
              </div>

              <!-- 快递单号 -->
              <div v-if="record.trackingNumber" class="mt-2 bg-green-50 rounded-lg p-2 flex items-center justify-between">
                <div class="text-[10px] text-gray-600">
                  <span class="text-gray-400">快递单号：</span>
                  <span class="font-mono font-bold">{{ record.trackingNumber }}</span>
                </div>
              </div>

              <!-- 去领取按钮（待领取状态，streak和activity类型） -->
              <div v-if="(record.type === 'streak' || record.type === 'activity') && (record.status === 'confirmed' || record.status === 'claimable')" class="mt-2">
                <button
                  class="text-[11px] font-bold text-white bg-[#FF6B35] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                  @click="goToClaim(record)"
                >
                  去领取 <ChevronRight class="w-3 h-3" />
                </button>
              </div>

              <!-- 取消/改地址按钮（仅积分兑换+待发货状态） -->
              <div v-if="record.type === 'exchange' && record.status === 'pending'" class="mt-2 flex items-center gap-2">
                <button
                  class="text-[11px] font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  @click="openCancelModal(record)"
                >
                  取消兑换
                </button>
                <button
                  v-if="record.deliveryMethod === 'shipped'"
                  class="text-[11px] font-bold text-white bg-[#1677FF] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                  @click="openEditAddress(record)"
                >
                  <MapPin class="w-3 h-3" /> 修改地址
                </button>
              </div>

              <!-- 改地址按钮（打卡奖励·待发货·邮寄方式）：营养师发货前可修改，与打卡日历同口径（仅一次） -->
              <div v-if="record.type === 'streak' && record.status === 'pending' && record.deliveryMethod === 'shipped' && !(record.raw as RewardClaim)?.addressEdited" class="mt-2 flex items-center gap-2">
                <button
                  class="text-[11px] font-bold text-white bg-[#1677FF] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                  @click="openEditAddress(record)"
                >
                  <MapPin class="w-3 h-3" /> 修改地址
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 取消兑换确认弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showCancelModal" class="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-6" @click="showCancelModal = false">
          <div v-if="cancelTarget" class="bg-white rounded-3xl w-full max-w-[320px] overflow-hidden shadow-xl" @click.stop>
            <div class="p-5 text-center">
              <div class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle class="w-6 h-6 text-[#FF4444]" />
              </div>
              <h3 class="text-base font-black text-gray-900">确认取消兑换？</h3>
              <p class="text-xs text-gray-500 mt-2 leading-relaxed">
                取消后将在记录中显示为"已取消"，<br>
                消耗的 <span class="font-bold text-[#FF6B35]">{{ cancelTarget.pointsSpent }} 积分</span> 将自动返还。
              </p>
              <div class="mt-3 bg-gray-50 rounded-xl p-2.5 flex items-center gap-2 text-left">
                <div class="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <img loading="lazy" decoding="async" :src="cancelTarget.productImage" class="w-full h-full object-cover" />
                </div>
                <div class="min-w-0">
                  <div class="text-xs font-bold text-gray-900 truncate">{{ cancelTarget.productName }}</div>
                  <div class="text-[10px] text-gray-400">{{ formatDate(cancelTarget.date) }}</div>
                </div>
              </div>
              <div class="flex gap-3 mt-4">
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 active:scale-95 transition-transform"
                  @click="showCancelModal = false"
                >
                  再想想
                </button>
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#FF4444] active:scale-95 transition-transform"
                  @click="confirmCancel"
                >
                  确认取消
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 修改收货地址弹窗（积分兑换·待发货·邮寄） -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showEditAddress" class="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-6" @click="showEditAddress = false">
          <div v-if="editTarget" class="bg-white rounded-3xl w-full max-w-[320px] overflow-hidden shadow-xl" @click.stop>
            <div class="p-5">
              <h3 class="text-base font-black text-gray-900 text-center">修改收货地址</h3>
              <p class="text-[11px] text-gray-400 text-center mt-1">发送前可修改，已发货后不可改</p>
              <div class="mt-3 bg-gray-50 rounded-xl p-2.5 flex items-center gap-2">
                <div class="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <img loading="lazy" decoding="async" :src="editTarget.productImage" class="w-full h-full object-cover" />
                </div>
                <div class="min-w-0">
                  <div class="text-xs font-bold text-gray-900 truncate">{{ editTarget.productName }}</div>
                  <div class="text-[10px] text-gray-400">{{ formatDate(editTarget.date) }}</div>
                </div>
              </div>
              <div class="mt-4 space-y-3">
                <input
                  v-model="editAddressForm.name" placeholder="收货人姓名"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#1677FF] focus:outline-none"
                />
                <input
                  v-model="editAddressForm.phone" type="tel" maxlength="11" placeholder="收货人手机号"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#1677FF] focus:outline-none"
                />
                <textarea
                  v-model="editAddressForm.address" rows="2" placeholder="详细收货地址"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#1677FF] focus:outline-none resize-none"
                ></textarea>
              </div>
              <p v-if="editAddressError" class="text-xs text-[#FF4444] mt-2">{{ editAddressError }}</p>
              <div class="flex gap-3 mt-4">
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 active:scale-95 transition-transform"
                  @click="showEditAddress = false"
                >
                  取消
                </button>
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1677FF] active:scale-95 transition-transform"
                  @click="submitAddressEdit"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Bottom Nav -->
    <StudentTabbar anchor="activity-hub" :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
