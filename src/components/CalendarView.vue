<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card, CheckinComments } from './ui';
import { recordComments } from '../lib/comments';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { Activity, Coffee, Scale, Gift, CheckCircle2, Lock, Package, Sparkles, Trophy, Check, PlayCircle } from 'lucide-vue-next';
import { Popup as VanPopup, showToast } from 'vant';
import { calculateStreak, calculateLongestStreakInRange, getProjectedRewardDates } from '../lib/streak';
import { formatDateTime } from '../lib/utils';
import type { ExerciseRecord } from '../types';

/** 计算单条运动记录的积分（与 scoring.ts calculateExerciseScore 一致） */
const exercisePoints = (record: ExerciseRecord): number => {
  let pts = 0;
  if (record.duration >= 40) pts += 1;
  if (record.coachScore === 2) pts += 2;
  else if (record.coachScore === 1) pts += 1;
  return pts;
};

const store = useAppStore();
const today = new Date();

// ─── 营期切换（多期时显示） ──────────────────────────────
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

// 按营期过滤打卡记录
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campRewardTiers = computed(() => activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers);

// ─── 营期未开始：禁止打卡入口 ─────────────────────────────
const activeCamp = computed(() => availableCamps.value.find(c => c.id === activeCampId.value) || null);
const campNotStarted = computed(() => activeCamp.value ? !store.isCampStarted(activeCamp.value) : false);
const campNotStartedText = computed(() => {
  const camp = activeCamp.value;
  if (camp?.startDate) return `营期尚未开始（${camp.startDate} 开营），暂不能打卡`;
  return '营期尚未开始，暂不能打卡';
});
// 营期拦截：未开始时弹提示并返回 false
function guardCheckin(): boolean {
  if (campNotStarted.value) { showToast(campNotStartedText.value); return false; }
  return true;
}
// 日历仅展示连续打卡奖励（source='streak'），趣味活动奖品在 CampActivitiesView 管理
const streakRewardTiers = computed(() => campRewardTiers.value.filter(t => t.source === 'streak'));
const campRewardClaims = computed(() => activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims);

// ─── 营期日期标注 ──────────────────────────────────────────
const myCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);

interface CampMarker {
  date: string;
  campName: string;
  type: 'start' | 'end';
}

const campMarkers = computed<CampMarker[]>(() => {
  const markers: CampMarker[] = [];
  for (const camp of myCamps.value) {
    if (camp.startDate) markers.push({ date: camp.startDate, campName: camp.name, type: 'start' });
    if (camp.endDate) markers.push({ date: camp.endDate, campName: camp.name, type: 'end' });
  }
  return markers;
});

const getCampMarker = (date: Date): CampMarker | null => {
  const dStr = format(date, 'yyyy-MM-dd');
  return campMarkers.value.find(m => m.date === dStr) || null;
};

/** 判断日期是否在某个营期范围内 */
const isInCampPeriod = (date: Date): boolean => {
  const dStr = format(date, 'yyyy-MM-dd');
  return myCamps.value.some(c => {
    const start = c.startDate || '';
    const end = c.endDate || '';
    return start && end && dStr >= start && dStr <= end;
  });
};

const selectedDate = ref<Date>(today);
const currentMonth = ref<Date>(startOfMonth(today));

const monthStart = computed(() => startOfMonth(currentMonth.value));
const monthEnd = computed(() => endOfMonth(currentMonth.value));
const days = computed(() => eachDayOfInterval({ start: monthStart.value, end: monthEnd.value }));
const pad = computed(() => Array.from({ length: monthStart.value.getDay() }).fill(null));

const getStatus = (date: Date) => {
  const dStr = format(date, 'yyyy-MM-dd');
  const userId = store.user?.id;
  // 严格按学员匹配，与 isDayComplete 口径一致（不把无 studentId 的记录算给当前用户）
  const mine = (r: { studentId?: string }) => !userId || r.studentId === userId;
  const hasBreakfast = campDiet.value.some((r) => r.date.startsWith(dStr) && r.meal === 'breakfast' && mine(r));
  const hasLunch = campDiet.value.some((r) => r.date.startsWith(dStr) && r.meal === 'lunch' && mine(r));
  const hasDinner = campDiet.value.some((r) => r.date.startsWith(dStr) && r.meal === 'dinner' && mine(r));
  const hasExercise = campEx.value.some((r) => r.date.startsWith(dStr) && mine(r));
  const hasWeight = campWt.value.some((r) => r.date.startsWith(dStr) && mine(r));
  const completed = hasBreakfast && hasLunch && hasDinner && hasExercise && hasWeight;
  const completedCount = [hasBreakfast, hasLunch, hasDinner, hasExercise, hasWeight].filter(Boolean).length;
  return { hasBreakfast, hasLunch, hasDinner, hasExercise, hasWeight, completed, completedCount };
};

const selectedStatus = computed(() => getStatus(selectedDate.value));

const selectedDateStr = computed(() => format(selectedDate.value, 'yyyy-MM-dd'));
const dayExercises = computed(() => campEx.value.filter((r) => r.date.startsWith(selectedDateStr.value) && r.studentId === store.user?.id));
const dayDiets = computed(() => campDiet.value.filter((r) => r.date.startsWith(selectedDateStr.value) && r.studentId === store.user?.id));
const dayWeights = computed(() => campWt.value.filter((r) => r.date.startsWith(selectedDateStr.value) && r.studentId === store.user?.id));

// 日历详情已展示批注即视为已读（与打卡页展开一批注才已读的口径一致：看到才算已读）
watch(selectedDate, () => {
  if (!store.user?.id) return;
  dayWeights.value.forEach((w) => { if (w.dietitianComment && !w.commentRead) store.updateWeightRecord(w.id, { commentRead: true }); });
  dayExercises.value.forEach((ex) => { if (ex.coachComment && !ex.commentRead) store.updateExerciseRecord(ex.id, { commentRead: true }); });
  dayDiets.value.forEach((d) => { if (d.dietitianComment && !d.commentRead) store.updateDietRecord(d.id, { commentRead: true }); });
}, { flush: 'post' });

const prevMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1);
};
const nextMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1);
};

const mealLabel = (meal: string) => (meal === 'breakfast' ? '早餐' : meal === 'lunch' ? '午餐' : meal === 'dinner' ? '晚餐' : '加餐');
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

// Reward milestone dates - based on student's actual streak start
const showRewardInfo = ref(false);
const showClaimForm = ref(false);
const selectedRewardTier = ref<any>(null);
const claimFormData = ref({ name: store.user?.name || '', phone: store.user?.phone || '', address: '' });
const claimFormError = ref('');
// 领取方式：随营养师配置的 deliveryMethods 走（与打卡奖励页 RewardView 口径一致），默认取第一种
const selectedDeliveryMethod = ref<'shipped' | 'in-person'>('shipped');
const tierDeliveryMethods = computed(() => (selectedRewardTier.value?.deliveryMethods || ['shipped']) as ('shipped' | 'in-person')[]);
const showDeliveryChoice = computed(() => tierDeliveryMethods.value.length > 1);

const streakData = computed(() => calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id));
const myClaims = computed(() => campRewardClaims.value.filter(c => c.studentId === store.user?.id));

// 资格快照：营期内最长连续完成天数（一旦达到档位即永久解锁，断签不回落）
const campLongestStreak = computed(() => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const endRaw = activeCamp.value?.endDate || todayStr;
  const end = endRaw < todayStr ? endRaw : todayStr;
  return calculateLongestStreakInRange(activeCamp.value?.startDate || '2000-01-01', end, campEx.value, campDiet.value, campWt.value, store.user?.id);
});

/** 已达成（资格判定）= 当前连续天 与 营期最长连续天 取更大者 */
const achievedDays = (requiredDays: number) =>
  Math.max(streakData.value.currentStreak, campLongestStreak.value) >= requiredDays;

const rewardDates = computed(() => {
  const projected = getProjectedRewardDates(streakData.value.currentStreak, streakData.value.streakStartDate, streakRewardTiers.value, campRewardClaims.value, store.user?.id);
  // 资格快照：历史最长连续（断签不回落）作为"是否曾解锁"的兜底
  const snapshot = Math.max(streakData.value.currentStreak, campLongestStreak.value);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  return projected.map(p => {
    // 当前连续不足、但资格快照已曾解锁且未领取 → 仍可领取，日历以"今天"展示（历史完成日已不可还原）
    if (!p.isUnlocked && !p.isClaimed && snapshot >= (p.tier.requiredDays ?? 0)) {
      return { ...p.tier, date: todayStr, dateObj: new Date(todayStr), isUnlocked: true, isClaimed: false };
    }
    if (!p.date) return null;
    const dateObj = new Date(p.date);
    return { ...p.tier, date: p.date, dateObj, isUnlocked: p.isUnlocked, isClaimed: p.isClaimed };
  }).filter(Boolean) as any[];
});

const getRewardOnDate = (date: Date) => {
  const dStr = format(date, 'yyyy-MM-dd');
  return rewardDates.value.find(r => r.date === dStr);
};

/** 奖励状态: claimed=已领取 / claimable=可领取 / outOfStock=已领完 / locked=未解锁
 *  以资格快照判定（不二次校验连续段是否无缺卡）：曾在营期内连续满勤达到档位即视为可领，
 *  营期已结营则所有未领奖励视为失效。 */
const getRewardState = (reward: any): 'claimed' | 'claimable' | 'outOfStock' | 'locked' => {
  if (reward.isClaimed) return 'claimed';
  if (activeCamp.value?.status === 'ended') return 'locked';
  if (achievedDays(reward.requiredDays) && reward.stock > 0) return 'claimable';
  if (achievedDays(reward.requiredDays) && reward.stock <= 0) return 'outOfStock';
  return 'locked';
};

const getDaysToUnlock = (reward: any): number => {
  return Math.max(0, reward.requiredDays - Math.max(streakData.value.currentStreak, campLongestStreak.value));
};

const getClaimInfo = (reward: any) => {
  return myClaims.value.find(c => c.tierId === reward.id);
};

const handleRewardDateClick = (date: Date) => {
  const reward = getRewardOnDate(date);
  if (reward) {
    selectedRewardTier.value = reward;
    showRewardInfo.value = true;
    showClaimForm.value = false;
    claimFormError.value = '';
  }
};

const openClaimForm = () => {
  showClaimForm.value = true;
  claimFormError.value = '';
  claimFormData.value = { name: store.user?.name || '', phone: store.user?.phone || '', address: '' };
  selectedDeliveryMethod.value = tierDeliveryMethods.value[0] || 'shipped';
};

// 仅"当天"允许从完成度清单点击未完成项直达打卡页（历史日期不跳转）
const isSelectedToday = computed(() => isSameDay(selectedDate.value, today));
const goCheckin = (view: 'diet' | 'exercise' | 'weight-checkin') => {
  if (!isSelectedToday.value) return;
  if (!guardCheckin()) return; // 营期未开始时拦截
  store.setCurrentView(view);
};

const submitClaim = () => {
  const method = selectedDeliveryMethod.value || 'shipped';
  if (method === 'shipped') {
    if (!claimFormData.value.name.trim()) { claimFormError.value = '请输入收货人姓名'; return; }
    if (!/^1[3-9]\d{9}$/.test(claimFormData.value.phone.trim())) { claimFormError.value = '请输入有效的11位手机号'; return; }
    if (!claimFormData.value.address.trim()) { claimFormError.value = '请输入详细收货地址'; return; }
  }
  if (selectedRewardTier.value && store.user) {
    // 二次校验：必须真的满足连续打卡天数（五项全部完成才算一天）才能领取
    if (getRewardState(selectedRewardTier.value) !== 'claimable') {
      claimFormError.value = '还未达成连续打卡要求，暂不能领取';
      return;
    }
    if (selectedRewardTier.value.stock <= 0) { claimFormError.value = '该礼品库存不足'; return; }
    // 走 store 单一咽喉：实时校验库存/营期/once-per-tier 判重后写记录并扣库存；领取方式随营养师配置
    const result = store.claimRewardTier(
      selectedRewardTier.value.id,
      store.user.id,
      store.user.name,
      {
        recipientName: method === 'shipped' ? claimFormData.value.name.trim() : store.user.name,
        recipientPhone: method === 'shipped' ? claimFormData.value.phone.trim() : store.user.phone,
        recipientAddress: method === 'shipped' ? claimFormData.value.address.trim() : '线下领取',
        deliveryMethod: method,
        campId: activeCampId.value || undefined,
      },
    );
    if (!result.ok) {
      claimFormError.value = result.reason || '领取失败，请稍后重试';
      return;
    }
    showToast({ message: '领取成功，请耐心等待发放', position: 'top', duration: 2000 });
    showRewardInfo.value = false;
    showClaimForm.value = false;
  }
};

// 详情卡片入场动画
const detailCards = ref<number[]>([]);
onMounted(() => {
  const delays = [100, 250, 400, 550];
  delays.forEach((delay, idx) => {
    setTimeout(() => detailCards.value.push(idx), delay);
  });
});

// ─── 领取后修改地址（仅未发货前，最多一次） ──────────────────
const editingAddress = ref(false);
const editAddressData = ref({ name: '', phone: '', address: '' });
const editAddressError = ref('');

/** 是否允许修改地址：待发货 && 尚未编辑过 && 邮寄领取（线下领取无邮寄地址可改） */
const canEditAddress = computed(() => {
  const claim = getClaimInfo(selectedRewardTier.value);
  return !!(claim && claim.status === 'pending' && !claim.addressEdited && claim.deliveryMethod !== 'in-person');
});

const startEditAddress = () => {
  const claim = getClaimInfo(selectedRewardTier.value);
  if (!claim) return;
  editAddressData.value = {
    name: claim.recipientName || '',
    phone: claim.recipientPhone || '',
    address: claim.recipientAddress || '',
  };
  editingAddress.value = true;
  editAddressError.value = '';
};

const submitAddressEdit = () => {
  const claim = getClaimInfo(selectedRewardTier.value);
  if (!claim) return;
  if (!editAddressData.value.name.trim()) { editAddressError.value = '请输入收货人姓名'; return; }
  if (!/^1[3-9]\d{9}$/.test(editAddressData.value.phone.trim())) { editAddressError.value = '请输入有效的11位手机号'; return; }
  if (!editAddressData.value.address.trim()) { editAddressError.value = '请输入详细收货地址'; return; }
  store.updateRewardClaim(claim.id, {
    recipientName: editAddressData.value.name.trim(),
    recipientPhone: editAddressData.value.phone.trim(),
    recipientAddress: editAddressData.value.address.trim(),
    addressEdited: true,
  });
  editingAddress.value = false;
  showToast('收货地址已更新');
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-8">
    <NavBar title="打卡记录" :on-back="store.goBack" />

    <div class="p-4 space-y-4">
      <Card>
        <div class="flex items-center justify-between mb-4">
          <button @click="prevMonth" class="p-2 text-gray-500 hover:text-gray-900 bg-gray-50 rounded-lg transition-transform hover:scale-110 active:scale-95">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div class="text-center font-bold text-lg text-gray-900 animate-pop-in" :key="format(currentMonth, 'yyyy-MM')">
            {{ format(currentMonth, 'yyyy年MM月') }}
          </div>
          <button @click="nextMonth" class="p-2 text-gray-500 hover:text-gray-900 bg-gray-50 rounded-lg transition-transform hover:scale-110 active:scale-95">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div class="grid grid-cols-7 gap-1 text-center mb-2">
          <div v-for="d in weekdays" :key="d" class="text-xs text-gray-500 font-medium">{{ d }}</div>
        </div>

        <div class="grid grid-cols-7 gap-1 text-center">
          <div v-for="(_, i) in pad" :key="`pad-${i}`" class="h-10" />
          <div
            v-for="(d, i) in days"
            :key="i"
            @click="selectedDate = d; getRewardOnDate(d) && handleRewardDateClick(d)"
            :class="['h-12 flex flex-col items-center justify-start pt-1 rounded-lg cursor-pointer transition-all duration-200', isSameDay(d, selectedDate) ? 'bg-gray-100 ring-1 ring-gray-200 scale-105' : 'hover:bg-gray-50', getStatus(d).completed ? 'bg-green-50/50' : '', isInCampPeriod(d) && !isSameDay(d, selectedDate) ? 'bg-blue-50/30' : '']"
          >
            <span :class="[
              'text-sm w-6 h-6 flex items-center justify-center rounded-full transition-all',
              getStatus(d).completed ? 'bg-[#07C160] text-white font-bold' :
              isSameDay(d, today) ? 'font-bold text-[#07C160]' : 'text-gray-700'
            ]">
              {{ format(d, 'd') }}
            </span>
            <div class="flex gap-0.5 mt-0.5 items-center justify-center">
              <!-- 营期标注：开营/结营 -->
              <span v-if="getCampMarker(d)?.type === 'start'" class="text-[8px] font-bold text-white bg-[#07C160] px-1 rounded leading-tight">开营</span>
              <span v-else-if="getCampMarker(d)?.type === 'end'" class="text-[8px] font-bold text-white bg-[#FF976A] px-1 rounded leading-tight">结营</span>
              <!-- Partial: show 5 dots (done=colored, missing=gray) -->
              <template v-else-if="!getStatus(d).completed && getStatus(d).completedCount > 0">
                <div :class="['w-1 h-1 rounded-full', getStatus(d).hasBreakfast ? 'bg-[#FF976A]' : 'bg-gray-200']" />
                <div :class="['w-1 h-1 rounded-full', getStatus(d).hasLunch ? 'bg-[#FF976A]' : 'bg-gray-200']" />
                <div :class="['w-1 h-1 rounded-full', getStatus(d).hasDinner ? 'bg-[#FF976A]' : 'bg-gray-200']" />
                <div :class="['w-1 h-1 rounded-full', getStatus(d).hasExercise ? 'bg-[#07C160]' : 'bg-gray-200']" />
                <div :class="['w-1 h-1 rounded-full', getStatus(d).hasWeight ? 'bg-[#1677FF]' : 'bg-gray-200']" />
              </template>
              <!-- Reward icons -->
              <CheckCircle2 v-if="getRewardOnDate(d) && getRewardState(getRewardOnDate(d)) === 'claimed'" class="w-3 h-3 text-[#07C160] shrink-0" />
              <Gift v-else-if="getRewardOnDate(d) && getRewardState(getRewardOnDate(d)) === 'claimable'" class="w-3 h-3 text-orange-400 shrink-0 animate-pulse" />
              <Package v-else-if="getRewardOnDate(d) && getRewardState(getRewardOnDate(d)) === 'outOfStock'" class="w-3 h-3 text-gray-400 shrink-0" />
              <Lock v-else-if="getRewardOnDate(d) && getRewardState(getRewardOnDate(d)) === 'locked'" class="w-2.5 h-2.5 text-gray-300 shrink-0" />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-gray-100 flex-wrap">
          <div class="flex items-center gap-1.5">
            <div class="w-4 h-4 rounded-full bg-[#07C160] flex items-center justify-center">
              <Check class="w-2.5 h-2.5 text-white" />
            </div>
            <span class="text-xs text-gray-500">全部完成</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-[#FF976A]" />
            <div class="w-1.5 h-1.5 rounded-full bg-[#07C160]" />
            <div class="w-1.5 h-1.5 rounded-full bg-[#1677FF]" />
            <div class="w-1.5 h-1.5 rounded-full bg-gray-200" />
            <span class="text-xs text-gray-500 ml-0.5">部分完成</span>
          </div>
          <div class="flex items-center gap-1.5">
            <Gift class="w-3.5 h-3.5 text-orange-400" />
            <span class="text-xs text-gray-500">奖励</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[8px] font-bold text-white bg-[#07C160] px-1 rounded">开营</span>
            <span class="text-[8px] font-bold text-white bg-[#FF976A] px-1 rounded">结营</span>
            <span class="text-xs text-gray-500">营期标注</span>
          </div>
        </div>
      </Card>

      <h3 class="text-sm font-bold text-gray-900 pt-2 px-1 animate-pop-in" :key="format(selectedDate, 'yyyy-MM-dd')">
        {{ isSameDay(selectedDate, today) ? '今日详情' : `${format(selectedDate, 'M月d日')} 详情` }}
      </h3>

      <!-- Completion checklist -->
      <Card :class="['detail-enter', detailCards.includes(0) ? 'detail-enter-active' : '']">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div :class="['w-8 h-8 rounded-full flex items-center justify-center shrink-0', selectedStatus.completed ? 'bg-[#07C160]' : 'bg-gray-100']">
              <CheckCircle2 v-if="selectedStatus.completed" class="w-5 h-5 text-white" />
              <span v-else class="text-[11px] font-bold text-gray-400">{{ selectedStatus.completedCount }}/5</span>
            </div>
            <div>
              <h4 class="font-bold text-sm text-gray-900">打卡完成度</h4>
              <div class="text-[10px] text-gray-400">早餐 · 午餐 · 晚餐 · 运动 · 体重</div>
            </div>
          </div>
          <span :class="['text-xs font-bold', selectedStatus.completed ? 'text-[#07C160]' : 'text-gray-400']">
            {{ selectedStatus.completedCount }}/5
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 mb-3">
          <button type="button" @click="goCheckin('diet')" :disabled="!isSelectedToday"
                  :class="['flex items-center gap-2 p-2 rounded-lg text-left transition-all', selectedStatus.hasBreakfast ? 'bg-orange-50' : 'bg-gray-50', isSelectedToday && !selectedStatus.hasBreakfast ? 'ring-1 ring-[#FF976A]/40 cursor-pointer active:scale-[0.97]' : 'cursor-default']">
            <Coffee class="w-4 h-4 shrink-0" :class="selectedStatus.hasBreakfast ? 'text-[#FF976A]' : 'text-gray-300'" />
            <span class="text-xs font-medium" :class="selectedStatus.hasBreakfast ? 'text-gray-900' : 'text-gray-400'">早餐</span>
            <CheckCircle2 v-if="selectedStatus.hasBreakfast" class="w-3.5 h-3.5 text-[#07C160] ml-auto shrink-0" />
            <span v-else class="text-[10px] ml-auto" :class="isSelectedToday ? 'text-[#FF976A] font-bold' : 'text-gray-300'">{{ isSelectedToday ? '去打卡 →' : '未打卡' }}</span>
          </button>
          <button type="button" @click="goCheckin('diet')" :disabled="!isSelectedToday"
                  :class="['flex items-center gap-2 p-2 rounded-lg text-left transition-all', selectedStatus.hasLunch ? 'bg-orange-50' : 'bg-gray-50', isSelectedToday && !selectedStatus.hasLunch ? 'ring-1 ring-[#FF976A]/40 cursor-pointer active:scale-[0.97]' : 'cursor-default']">
            <Coffee class="w-4 h-4 shrink-0" :class="selectedStatus.hasLunch ? 'text-[#FF976A]' : 'text-gray-300'" />
            <span class="text-xs font-medium" :class="selectedStatus.hasLunch ? 'text-gray-900' : 'text-gray-400'">午餐</span>
            <CheckCircle2 v-if="selectedStatus.hasLunch" class="w-3.5 h-3.5 text-[#07C160] ml-auto shrink-0" />
            <span v-else class="text-[10px] ml-auto" :class="isSelectedToday ? 'text-[#FF976A] font-bold' : 'text-gray-300'">{{ isSelectedToday ? '去打卡 →' : '未打卡' }}</span>
          </button>
          <button type="button" @click="goCheckin('diet')" :disabled="!isSelectedToday"
                  :class="['flex items-center gap-2 p-2 rounded-lg text-left transition-all', selectedStatus.hasDinner ? 'bg-orange-50' : 'bg-gray-50', isSelectedToday && !selectedStatus.hasDinner ? 'ring-1 ring-[#FF976A]/40 cursor-pointer active:scale-[0.97]' : 'cursor-default']">
            <Coffee class="w-4 h-4 shrink-0" :class="selectedStatus.hasDinner ? 'text-[#FF976A]' : 'text-gray-300'" />
            <span class="text-xs font-medium" :class="selectedStatus.hasDinner ? 'text-gray-900' : 'text-gray-400'">晚餐</span>
            <CheckCircle2 v-if="selectedStatus.hasDinner" class="w-3.5 h-3.5 text-[#07C160] ml-auto shrink-0" />
            <span v-else class="text-[10px] ml-auto" :class="isSelectedToday ? 'text-[#FF976A] font-bold' : 'text-gray-300'">{{ isSelectedToday ? '去打卡 →' : '未打卡' }}</span>
          </button>
          <button type="button" @click="goCheckin('exercise')" :disabled="!isSelectedToday"
                  :class="['flex items-center gap-2 p-2 rounded-lg text-left transition-all', selectedStatus.hasExercise ? 'bg-green-50' : 'bg-gray-50', isSelectedToday && !selectedStatus.hasExercise ? 'ring-1 ring-[#07C160]/40 cursor-pointer active:scale-[0.97]' : 'cursor-default']">
            <Activity class="w-4 h-4 shrink-0" :class="selectedStatus.hasExercise ? 'text-[#07C160]' : 'text-gray-300'" />
            <span class="text-xs font-medium" :class="selectedStatus.hasExercise ? 'text-gray-900' : 'text-gray-400'">运动</span>
            <CheckCircle2 v-if="selectedStatus.hasExercise" class="w-3.5 h-3.5 text-[#07C160] ml-auto shrink-0" />
            <span v-else class="text-[10px] ml-auto" :class="isSelectedToday ? 'text-[#07C160] font-bold' : 'text-gray-300'">{{ isSelectedToday ? '去打卡 →' : '未打卡' }}</span>
          </button>
          <button type="button" @click="goCheckin('weight-checkin')" :disabled="!isSelectedToday"
                  :class="['flex items-center gap-2 p-2 rounded-lg text-left transition-all', selectedStatus.hasWeight ? 'bg-blue-50' : 'bg-gray-50', isSelectedToday && !selectedStatus.hasWeight ? 'ring-1 ring-[#1677FF]/40 cursor-pointer active:scale-[0.97]' : 'cursor-default']">
            <Scale class="w-4 h-4 shrink-0" :class="selectedStatus.hasWeight ? 'text-[#1677FF]' : 'text-gray-300'" />
            <span class="text-xs font-medium" :class="selectedStatus.hasWeight ? 'text-gray-900' : 'text-gray-400'">体重</span>
            <CheckCircle2 v-if="selectedStatus.hasWeight" class="w-3.5 h-3.5 text-[#07C160] ml-auto shrink-0" />
            <span v-else class="text-[10px] ml-auto" :class="isSelectedToday ? 'text-[#1677FF] font-bold' : 'text-gray-300'">{{ isSelectedToday ? '去打卡 →' : '未打卡' }}</span>
          </button>
        </div>

        <!-- Status message + action buttons -->
        <div v-if="selectedStatus.completed" class="text-center text-xs text-[#07C160] font-bold py-1 flex items-center justify-center gap-1">
          <CheckCircle2 class="w-3.5 h-3.5" /> 当天打卡已全部完成！
        </div>
        <div v-else-if="isSameDay(selectedDate, today)" class="space-y-2">
          <div class="text-center text-xs text-orange-500">还有 {{ 5 - selectedStatus.completedCount }} 项未完成，继续加油！</div>
          <div class="flex gap-2">
            <button v-if="!selectedStatus.hasBreakfast || !selectedStatus.hasLunch || !selectedStatus.hasDinner"
                    @click="goCheckin('diet')"
                    class="flex-1 py-2 rounded-lg bg-[#FF976A] text-white text-xs font-bold active:scale-95 transition-transform">
              去饮食打卡
            </button>
            <button v-if="!selectedStatus.hasExercise"
                    @click="goCheckin('exercise')"
                    class="flex-1 py-2 rounded-lg bg-[#07C160] text-white text-xs font-bold active:scale-95 transition-transform">
              去运动打卡
            </button>
            <button v-if="!selectedStatus.hasWeight"
                    @click="goCheckin('weight-checkin')"
                    class="flex-1 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-bold active:scale-95 transition-transform">
              去体重打卡
            </button>
          </div>
        </div>
        <div v-else-if="selectedDate < today" class="text-center text-xs text-gray-400">
          有 {{ 5 - selectedStatus.completedCount }} 项未完成
        </div>
        <div v-else class="text-center text-xs text-gray-400">
          未来日期，待打卡
        </div>
      </Card>

      <Card v-if="dayWeights.length > 0" :class="['detail-enter', detailCards.includes(1) ? 'detail-enter-active' : '']">
        <div class="flex items-center gap-2 text-[#1677FF] mb-3">
          <Scale class="h-4 w-4" />
          <h4 class="font-bold text-sm">体重打卡</h4>
        </div>
        <div v-for="w in dayWeights" :key="w.id" class="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
          <div class="flex justify-between items-end">
            <span class="text-2xl font-light text-gray-900">{{ w.weight }} <span class="text-xs font-normal text-gray-500">kg</span></span>
          </div>
          <div v-if="w.photos && w.photos.length > 0" class="flex gap-2 mt-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <img loading="lazy" decoding="async"
              v-for="(url, idx) in w.photos"
              :key="idx"
              :src="url"
              alt="体重打卡"
              class="h-16 w-16 object-cover rounded-lg shrink-0 snap-center border border-gray-100 cursor-pointer"
              @click="store.openImagePreview(w.photos || [], idx)"
            />
          </div>
          <div v-if="w.dietitianComment" class="mt-2 p-2.5 bg-[#1677FF]/5 rounded-lg border border-[#1677FF]/10">
            <span class="text-xs font-bold text-[#1677FF]">营养师批注</span>
            <CheckinComments :comments="recordComments(w)" />
          </div>
        </div>
      </Card>

      <Card v-if="dayExercises.length > 0" :class="['detail-enter', detailCards.includes(2) ? 'detail-enter-active' : '']">
        <div class="flex items-center gap-2 text-[#07C160] mb-3">
          <Activity class="h-4 w-4" />
          <h4 class="font-bold text-sm">运动打卡</h4>
        </div>
        <div class="space-y-3">
          <div v-for="ex in dayExercises" :key="ex.id" class="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            <div class="flex justify-between items-center mb-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900">{{ ex.type }}</span>
                <span class="text-[10px] text-gray-500">{{ formatDateTime(ex.date) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500">{{ ex.duration }} 分钟</span>
                <span :class="['text-[10px] font-bold px-1.5 py-0.5 rounded', exercisePoints(ex) > 0 ? 'text-white bg-[#07C160]' : 'text-gray-500 bg-gray-100']">+{{ exercisePoints(ex) }}</span>
              </div>
            </div>
            <div class="text-xs text-yellow-500 mb-1">强度: {{ '★'.repeat(ex.intensity) }}</div>
            <p v-if="ex.notes" class="text-xs text-gray-500 mt-1">{{ ex.notes }}</p>
            <div v-if="ex.photos && ex.photos.length > 0" class="flex gap-2 mt-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <img loading="lazy" decoding="async"
                v-for="(url, idx) in ex.photos"
                :key="idx"
                :src="url"
                alt="运动照片"
                class="h-20 w-20 object-cover rounded-lg shrink-0 snap-center cursor-pointer"
                @click="store.openImagePreview(ex.photos || [], idx)"
              />
            </div>
            <div v-if="ex.videoUrls && ex.videoUrls.length > 0" class="flex gap-2 mt-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div
                v-for="(url, idx) in ex.videoUrls"
                :key="idx"
                class="h-20 w-20 rounded-lg shrink-0 snap-center border border-gray-100 overflow-hidden relative bg-black cursor-pointer"
                @click="store.openVideoPreview(url)"
              >
                <video :src="url" class="w-full h-full object-cover" preload="metadata" playsinline webkit-playsinline />
                <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                  <PlayCircle class="w-6 h-6 text-white drop-shadow" />
                </div>
              </div>
            </div>
            <div v-if="ex.coachComment" class="mt-2 p-2.5 bg-[#07C160]/5 rounded-lg border border-[#07C160]/10">
              <span class="text-xs font-bold text-[#07C160]">教练批注</span>
              <CheckinComments :comments="recordComments(ex)" />
            </div>
          </div>
        </div>
      </Card>

      <Card v-if="dayDiets.length > 0" :class="['detail-enter', detailCards.includes(3) ? 'detail-enter-active' : '']">
        <div class="flex items-center gap-2 text-[#FF976A] mb-3">
          <Coffee class="h-4 w-4" />
          <h4 class="font-bold text-sm">饮食打卡</h4>
        </div>
        <div class="space-y-4">
          <div v-for="diet in dayDiets" :key="diet.id" class="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium">
                  {{ mealLabel(diet.meal) }}
                </span>
                <span class="text-[10px] text-gray-500">{{ formatDateTime(diet.date) }}</span>
              </div>
            </div>
            <p class="text-sm text-gray-900 mb-2">{{ diet.description }}</p>
            <div v-if="diet.photos && diet.photos.length > 0" class="flex gap-2 mt-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <img loading="lazy" decoding="async"
                v-for="(url, idx) in diet.photos"
                :key="idx"
                :src="url"
                alt="食物照片"
                class="h-20 w-20 object-cover rounded-lg shrink-0 snap-center cursor-pointer"
                @click="store.openImagePreview(diet.photos || [], idx)"
              />
            </div>
            <div v-if="diet.dietitianComment || typeof diet.dietitianScore === 'number'" class="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-bold text-[#FF976A]">营养师批注</span>
                <span v-if="diet.dietitianScore === 2" class="text-[10px] font-bold text-white bg-[#07C160] px-1.5 py-0.5 rounded">+2</span>
                <span v-else-if="diet.dietitianScore === 1" class="text-[10px] font-bold text-white bg-[#FF976A] px-1.5 py-0.5 rounded">+1</span>
                <span v-else-if="diet.dietitianScore === 0" class="text-[10px] font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded">0</span>
              </div>
              <CheckinComments :comments="recordComments(diet)" />
            </div>
          </div>
        </div>
      </Card>
    </div>
    <!-- Reward info popup -->
    <VanPopup v-model:show="showRewardInfo" position="center" round :style="{ width: '85%' }">
      <div class="p-5" v-if="selectedRewardTier">
        <!-- Info view (not claiming) -->
        <div v-if="!showClaimForm" class="flex flex-col items-center text-center">
          <div class="w-20 h-20 rounded-2xl overflow-hidden border-2 mb-3 animate-pop-in relative"
               :class="getRewardState(selectedRewardTier) === 'claimed' ? 'border-green-200' :
                       getRewardState(selectedRewardTier) === 'claimable' ? 'border-orange-200 shadow-md' :
                       getRewardState(selectedRewardTier) === 'outOfStock' ? 'border-gray-200' :
                       'border-gray-200'">
            <img loading="lazy" decoding="async" :src="selectedRewardTier.imageUrl" :alt="selectedRewardTier.name" class="w-full h-full object-cover"
                 :class="getRewardState(selectedRewardTier) === 'locked' ? 'opacity-50' : ''" />
            <div v-if="getRewardState(selectedRewardTier) === 'locked'" class="absolute inset-0 bg-gray-900/20 flex items-center justify-center">
              <Lock class="w-6 h-6 text-white/80" />
            </div>
          </div>
          <h3 class="text-lg font-bold mb-1"
              :class="getRewardState(selectedRewardTier) === 'locked' ? 'text-gray-400' : 'text-gray-900'">{{ selectedRewardTier.name }}</h3>
          <!-- 礼品描述（营养师配置，两行截断） -->
          <p v-if="selectedRewardTier.description" class="text-xs text-gray-500 leading-relaxed max-w-[260px] mb-1.5 line-clamp-2">{{ selectedRewardTier.description }}</p>
          <div class="text-xs font-medium mb-3 flex items-center gap-1"
               :class="getRewardState(selectedRewardTier) === 'claimed' ? 'text-[#07C160]' :
                       getRewardState(selectedRewardTier) === 'claimable' ? 'text-orange-500' :
                       'text-gray-400'">
            <Gift class="w-3.5 h-3.5" /> 连续打卡 {{ selectedRewardTier.requiredDays }} 天解锁
          </div>

          <!-- Claimed state -->
          <div v-if="getRewardState(selectedRewardTier) === 'claimed'" class="w-full">
            <!-- 编辑收货地址（未发货前仅一次） -->
            <div v-if="editingAddress" class="w-full text-left">
              <h3 class="text-lg font-bold text-gray-900 mb-4 text-center">修改收货信息</h3>
              <div class="space-y-4 mb-4">
                <div>
                  <label class="text-sm font-medium text-gray-700 block mb-1">收货人 <span class="text-red-500">*</span></label>
                  <input type="text" placeholder="请输入姓名" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="editAddressData.name" @input="editAddressError = ''" />
                </div>
                <div>
                  <label class="text-sm font-medium text-gray-700 block mb-1">手机号 <span class="text-red-500">*</span></label>
                  <input type="tel" placeholder="请输入11位手机号" maxlength="11" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="editAddressData.phone" @input="editAddressError = ''" />
                </div>
                <div>
                  <label class="text-sm font-medium text-gray-700 block mb-1">详细地址 <span class="text-red-500">*</span></label>
                  <textarea placeholder="省市区、街道、小区、楼栋及门牌号" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm h-20 resize-none transition-colors" v-model="editAddressData.address" @input="editAddressError = ''"></textarea>
                </div>
                <div class="text-xs text-gray-400 flex items-start gap-1.5">
                  <Check class="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <span>收货地址仅可修改 1 次，修改后将不能再次调整。</span>
                </div>
                <div v-if="editAddressError" class="text-red-500 text-xs font-medium text-center">{{ editAddressError }}</div>
              </div>
              <div class="flex gap-3">
                <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="editingAddress = false">取消</button>
                <button class="flex-[2] py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold shadow-lg shadow-orange-500/30 active:scale-95 transition-transform" @click="submitAddressEdit">
                  保存修改
                </button>
              </div>
            </div>
            <template v-else>
              <div class="flex items-center justify-center gap-1.5 text-[#07C160] text-sm font-bold mb-3">
                <CheckCircle2 class="w-4 h-4" /> 已领取
              </div>
              <div v-if="getClaimInfo(selectedRewardTier)?.status === 'shipped'" class="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600 border border-blue-100 mb-3">
                <div class="font-bold mb-1 flex items-center gap-1"><Package class="w-3 h-3" /> 已发货</div>
                <div class="font-mono">快递单号: {{ getClaimInfo(selectedRewardTier)?.trackingNumber }}</div>
              </div>
              <div v-else-if="getClaimInfo(selectedRewardTier)?.status === 'in-person'" class="bg-orange-50 rounded-xl px-4 py-3 text-xs text-orange-600 border border-orange-100 mb-3 flex items-center justify-center gap-1">
                <Package class="w-3 h-3" /> 已线下领取
              </div>
              <div v-else-if="getClaimInfo(selectedRewardTier)?.deliveryMethod === 'in-person'" class="bg-orange-50 rounded-xl px-4 py-3 text-xs text-orange-600 border border-orange-100 mb-3 flex items-center justify-center gap-1">
                <Package class="w-3 h-3" /> 等待线下发放
              </div>
              <div v-else class="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 border border-gray-100 mb-3 flex items-center justify-center gap-1">
                <Package class="w-3 h-3" /> 仓库备货中，待发货
              </div>
              <div v-if="canEditAddress" @click="startEditAddress"
                   class="mb-3 py-2.5 rounded-xl bg-white border border-orange-200 text-orange-500 text-sm font-bold active:scale-95 transition-transform cursor-pointer">
                修改收货地址
              </div>
              <button class="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showRewardInfo = false">
                知道了
              </button>
            </template>
          </div>

          <!-- Claimable state -->
          <div v-else-if="getRewardState(selectedRewardTier) === 'claimable'" class="w-full">
            <div class="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl px-4 py-3 text-xs text-gray-600 leading-relaxed border border-orange-100 mb-3">
              <div class="flex items-center justify-center gap-1.5 text-orange-600 font-bold mb-1">
                <Trophy class="w-3.5 h-3.5" /> 恭喜！已连续打卡 {{ selectedRewardTier.requiredDays }} 天
              </div>
              <span>礼品已在 <span class="font-bold">{{ format(selectedRewardTier.dateObj, 'M月d日') }}</span> 解锁，立即领取吧！</span>
            </div>
            <button class="w-full py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-sm font-bold shadow-md shadow-orange-500/30 active:scale-95 transition-transform"
                    @click="openClaimForm">
              立即领取
            </button>
          </div>

          <!-- Out of stock state -->
          <div v-else-if="getRewardState(selectedRewardTier) === 'outOfStock'" class="w-full">
            <div class="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed border border-gray-100 mb-3">
              <div class="flex items-center justify-center gap-1.5 text-gray-400 font-bold mb-1">
                <Package class="w-3.5 h-3.5" /> 已领完，待补货
              </div>
              <span>恭喜完成 {{ selectedRewardTier.requiredDays }} 天连续打卡！该礼品已领完，请等待补货。</span>
            </div>
            <button class="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showRewardInfo = false">
              知道了
            </button>
          </div>

          <!-- Locked state -->
          <div v-else class="w-full">
            <div class="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed border border-gray-100 mb-3">
              <div class="flex items-center justify-center gap-1.5 text-gray-400 font-bold mb-1">
                <Lock class="w-3.5 h-3.5" /> 还需 {{ getDaysToUnlock(selectedRewardTier) }} 天
              </div>
              <span>预计 <span class="font-bold text-gray-600">{{ format(selectedRewardTier.dateObj, 'M月d日') }}</span> 解锁此礼品，坚持打卡不要断签哦！</span>
            </div>
            <button class="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showRewardInfo = false">
              继续加油
            </button>
          </div>
        </div>

        <!-- Claim form view -->
        <div v-else>
          <h3 class="text-lg font-bold text-gray-900 mb-4">{{ selectedDeliveryMethod === 'shipped' ? '填写收货信息' : '确认领取信息' }}</h3>
          <div class="bg-gradient-to-r from-orange-50 to-yellow-50 p-3 rounded-xl mb-4 flex gap-3 items-center border border-orange-100">
            <img loading="lazy" decoding="async" :src="selectedRewardTier.imageUrl" class="w-12 h-12 rounded-lg object-cover" />
            <div>
              <div class="text-sm font-bold text-gray-900">{{ selectedRewardTier.name }}</div>
              <div class="text-xs text-orange-600 mt-0.5 flex items-center gap-1">
                <Sparkles class="w-3 h-3" /> 恭喜完成 {{ selectedRewardTier.requiredDays }} 天连续打卡！
              </div>
            </div>
          </div>

          <!-- 领取方式选择（仅当营养师配置了多种方式时显示，与打卡奖励页一致） -->
          <div v-if="showDeliveryChoice" class="mb-4">
            <label class="text-sm font-medium text-gray-700 block mb-2">选择领取方式</label>
            <div class="flex gap-2">
              <button
                :class="['flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors', selectedDeliveryMethod === 'shipped' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500']"
                @click="selectedDeliveryMethod = 'shipped'; claimFormError = ''"
              >邮寄</button>
              <button
                :class="['flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors', selectedDeliveryMethod === 'in-person' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500']"
                @click="selectedDeliveryMethod = 'in-person'; claimFormError = ''"
              >线下领取</button>
            </div>
          </div>

          <!-- 邮寄：收货信息表单 -->
          <div v-if="selectedDeliveryMethod === 'shipped'" class="space-y-4 mb-6">
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1">收货人 <span class="text-red-500">*</span></label>
              <input type="text" placeholder="请输入姓名" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="claimFormData.name" @input="claimFormError = ''" />
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1">手机号 <span class="text-red-500">*</span></label>
              <input type="tel" placeholder="请输入11位手机号" maxlength="11" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="claimFormData.phone" @input="claimFormError = ''" />
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1">详细地址 <span class="text-red-500">*</span></label>
              <textarea placeholder="省市区、街道、小区、楼栋及门牌号" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm h-20 resize-none transition-colors" v-model="claimFormData.address" @input="claimFormError = ''"></textarea>
            </div>
            <div class="text-xs text-gray-400 flex items-start gap-1.5">
              <Check class="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              <span>请确认信息无误，提交后如需修改请联系教练。</span>
            </div>
            <div v-if="claimFormError" class="text-red-500 text-xs font-medium text-center">{{ claimFormError }}</div>
          </div>

          <!-- 线下领取：说明信息 -->
          <div v-else class="space-y-3 mb-6">
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <Package class="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <div class="text-sm font-bold text-gray-900 mb-1">线下领取</div>
              <div class="text-xs text-gray-500">提交后请等待营养师确认，确认后请前往指定地点领取奖品。</div>
            </div>
          </div>

          <div class="flex gap-3">
            <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showClaimForm = false">返回</button>
            <button class="flex-[2] py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold shadow-lg shadow-orange-500/30 active:scale-95 transition-transform" @click="submitClaim">
              确认提交
            </button>
          </div>
        </div>
      </div>
    </VanPopup>
  </div>
</template>

<style scoped>
@keyframes popIn {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-pop-in {
  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.detail-enter {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.detail-enter-active {
  opacity: 1;
  transform: translateY(0);
}
</style>
