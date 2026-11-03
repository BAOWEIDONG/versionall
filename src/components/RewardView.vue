<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { format } from 'date-fns';
import { calculateStreak, calculateLongestStreakInRange } from '../lib/streak';
import { useAppStore } from '../store/app';
import { NavBar } from './ui';
import { Popup as VanPopup, showToast } from 'vant';
import { Gift, Lock, CheckCircle2, Check, Sparkles, Trophy, Package, Flame, Copy, MapPin } from 'lucide-vue-next';
import type { RewardTier } from '../types';

const store = useAppStore();

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
// 按营期过滤奖励
const campRewardTiers = computed(() => activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers);
const campRewardClaims = computed(() => activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims);

const showClaimModal = ref(false);
const submitting = ref(false); // 领取防连点：请求期间忽略重复提交
const selectedTier = ref<RewardTier | null>(null);
const selectedDeliveryMethod = ref<'shipped' | 'in-person'>('shipped');
const formData = ref({ name: store.user?.name || '', phone: store.user?.phone || '', address: '' });
const formError = ref('');

const streakData = computed(() => calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id));
const currentStreak = computed(() => streakData.value.currentStreak);
const totalDays = computed(() => streakData.value.totalDays);

const myClaims = computed(() => campRewardClaims.value.filter(c => c.studentId === store.user?.id));
// 新版口径：防重复领取 = 同一档位所在营期只能领取一次（不再跨营期合并卡相同档位）
const shippedClaims = computed(() => myClaims.value.filter(c => c.status === 'shipped'));
/** 该学员已领取过的 tierId 集合（判"未领取"直接查领取记录，不依赖档位是否仍存在——被删档也可定位） */
const myClaimedTierIds = computed(() => new Set(myClaims.value.map(c => c.tierId)));
/** 已解锁未领取的连续打卡档位快照（含被营养师下架/删除的）。解锁时落盘，任何档位状态不影响其可见可领（资格快照语义）。 */
const unlockedUnclaimedRecords = computed(() =>
  store.getStudentUnlockRecords(store.user?.id || '', activeCampId.value).filter(r => !myClaimedTierIds.value.has(r.tierId)),
);
const sortedTiers = computed(() => {
  const base = [...campRewardTiers.value].filter(t => t.source !== 'activity' && t.active !== false).sort((a, b) => a.requiredDays - b.requiredDays);
  // 已解锁但 live 已售罄/已下架/已删除的档位：用解锁快照兜底补进可领列表，保证"资格一旦解锁仍可见可领"
  for (const r of unlockedUnclaimedRecords.value) {
    const live = campRewardTiers.value.find(t => t.id === r.tierId);
    if (live) {
      // live 仍存在（含被下架）：有货则可领（getTierState 只看库存，不看 active）
      if (live.stock > 0 && !base.some(t => t.id === live.id)) base.push(live);
    } else {
      // live 被删除：物化成一张可领档位（stock 哨兵>0；claimRewardTier 走解锁快照发放，不扣 live 库存）
      base.push({
        id: r.tierId, name: r.snapshot.name, requiredDays: r.snapshot.requiredDays,
        imageUrl: r.snapshot.imageUrl, stock: 9999, active: true, source: 'streak',
        deliveryMethods: r.snapshot.deliveryMethods,
      });
    }
  }
  return base.sort((a, b) => a.requiredDays - b.requiredDays);
});
const maxRequiredDays = computed(() => Math.max(...sortedTiers.value.map(t => t.requiredDays), 1));

// ─── 资格快照：营期内任意历史最长连续完成天数（断签后已解锁未领取档位不回落） ──────────────
const activeCampObj = computed(() => availableCamps.value.find(c => c.id === activeCampId.value) || null);
const campLongestStreak = computed(() => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const endRaw = activeCampObj.value?.endDate || todayStr;
  const end = endRaw < todayStr ? endRaw : todayStr;
  return calculateLongestStreakInRange(
    activeCampObj.value?.startDate || '2000-01-01',
    end,
    campEx.value, campDiet.value, campWt.value,
    store.user?.id,
  );
});
/** 达标口径：当前连续 与 营期历史最长连续 取较大（资格快照语义，断签不回落） */
const snapshotDays = computed(() => Math.max(currentStreak.value, campLongestStreak.value));
/** 达成档位资格用快照语义（= snapshotDays）；里程碑/进度也一并用它，避免断签后"已可领取却显示 0/N 天"自相矛盾 */
const achievedDays = (tier: RewardTier) => snapshotDays.value;

// 下一个未达标的里程碑：按资格快照推算（曾达到的档位不再要求重走当前连续）
const nextTier = computed(() => sortedTiers.value.find(t => snapshotDays.value < t.requiredDays));
const daysToNext = computed(() => nextTier.value ? nextTier.value.requiredDays - snapshotDays.value : 0);

const getTierState = (tier: RewardTier) => {
  // 同一营期内判重（已领取）
  const claimed = myClaims.value.find(c => c.tierId === tier.id);
  if (claimed) return 'claimed';
  // 营期已结束且未领取 → 已失效（锁定）
  if (activeCampObj.value?.status === 'ended') return 'locked';
  // 资格快照：曾达到或当前达到档位天数 => 已解锁（断签不回落）
  const reached = achievedDays(tier) >= tier.requiredDays;
  if (!reached) return 'locked';
  if (tier.stock > 0) return 'unlocked';
  return 'outOfStock';
};

const tierDeliveryMethods = computed(() => selectedTier.value?.deliveryMethods || ['shipped']);
const showDeliveryChoice = computed(() => tierDeliveryMethods.value.length > 1);

const handleClaimClick = (tier: RewardTier) => {
  selectedTier.value = tier;
  const methods = tier.deliveryMethods || ['shipped'];
  selectedDeliveryMethod.value = methods[0];
  showClaimModal.value = true;
  formError.value = '';
};

const submitClaim = () => {
  const method = selectedDeliveryMethod.value;
  if (method === 'shipped') {
    if (!formData.value.name.trim()) { formError.value = '请输入收货人姓名'; return; }
    if (!/^1[3-9]\d{9}$/.test(formData.value.phone.trim())) { formError.value = '请输入有效的11位手机号'; return; }
    if (!formData.value.address.trim()) { formError.value = '请输入详细收货地址'; return; }
  }
  if (selectedTier.value && store.user) {
    if (submitting.value) return; // 防连点：提交期间忽略重复提交（重复领取/重复扣库存）
    // 二次校验：必须真的满足连续打卡天数（五项全部完成才算一天）才能领取
    if (getTierState(selectedTier.value) !== 'unlocked') {
      formError.value = '还未达成连续打卡要求，暂不能领取';
      return;
    }
    if (selectedTier.value.stock <= 0) {
      formError.value = '该礼品库存不足';
      return;
    }
    submitting.value = true;
    // 走 store 单一咽喉：实时校验库存/营期/once-per-tier 判重后写记录并扣库存
    const result = store.claimRewardTier(
      selectedTier.value.id,
      store.user.id,
      store.user.name,
      {
        recipientName: method === 'shipped' ? formData.value.name.trim() : store.user.name,
        recipientPhone: method === 'shipped' ? formData.value.phone.trim() : store.user.phone,
        recipientAddress: method === 'shipped' ? formData.value.address.trim() : '线下领取',
        deliveryMethod: method,
        campId: activeCampId.value || undefined,
      },
    );
    submitting.value = false;
    if (!result.ok) {
      formError.value = result.reason || '领取失败，请稍后重试';
      return;
    }
    showClaimModal.value = false;
    formData.value.address = '';
    showToast({ message: '领取成功，请耐心等待发放', position: 'top', duration: 2000 });
  }
};

// 卡片入场动画延迟
const visibleCards = ref<number[]>([]);
onMounted(() => {
  // 把已解锁未领取的 live 档位快照落盘（幂等），确保此后营养师下架/删除该奖，学员端仍能显示并领取
  const unlockedLive = campRewardTiers.value.filter(
    (t) => t.source === 'streak' && t.active !== false && !myClaimedTierIds.value.has(t.id) && snapshotDays.value >= t.requiredDays,
  );
  if (unlockedLive.length) {
    store.recordUnlockSnapshots(store.user?.id || '', activeCampId.value, unlockedLive);
  }
  sortedTiers.value.forEach((_, idx) => {
    setTimeout(() => visibleCards.value.push(idx), 120 * idx);
  });
});

// 复制快递单号
const copyTracking = async (num?: string) => {
  if (!num) return;
  try {
    await navigator.clipboard.writeText(num);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch { /* 剪贴板不可用时静默 */ }
};
const copied = ref(false);
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="打卡奖励" :on-back="store.goBack" />

    <!-- Header：去实色化橙黄渐变（偏白底）+ 玻璃感大数字 -->
    <div class="relative overflow-hidden bg-gradient-to-b from-amber-50 via-orange-50/60 to-transparent px-6 pt-8 pb-6">
      <div class="absolute -top-20 -right-10 w-48 h-48 bg-orange-200/30 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-10 -left-10 w-40 h-40 bg-yellow-200/20 rounded-full blur-3xl pointer-events-none"></div>

      <div class="relative z-10">
        <!-- Stats row -->
        <div class="flex justify-between items-end mb-1">
          <div class="animate-pop-in">
            <div class="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
              <Flame class="w-3.5 h-3.5 text-[#FF976A]" /> 连续打卡
            </div>
            <div class="relative inline-block">
              <div class="absolute inset-0 bg-white/60 blur-xl rounded-full scale-125 pointer-events-none"></div>
              <div class="relative text-5xl font-black tracking-tighter text-gray-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]">{{ currentStreak }}<span class="text-lg font-normal ml-1 text-gray-400">天</span></div>
            </div>
          </div>
          <div class="text-right animate-pop-in" style="animation-delay: 0.15s;">
            <div class="text-gray-400 text-xs mb-1">累计打卡</div>
            <div class="text-2xl font-bold text-gray-700">{{ totalDays }}<span class="text-sm font-normal ml-1 text-gray-400">天</span></div>
          </div>
        </div>

        <!-- Next reward hint -->
        <Transition name="fade-up">
          <div v-if="nextTier" class="mt-4 bg-white/70 backdrop-blur-sm border border-white/80 rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-sm">
            <Sparkles class="w-4 h-4 text-[#FF976A] shrink-0 animate-spin-slow" />
            <span class="text-xs font-medium text-gray-600">再坚持 <span class="font-black text-[#FF976A] text-sm">{{ daysToNext }}</span> 天，即可解锁「{{ nextTier.name }}」</span>
          </div>
        </Transition>
      </div>

      <!-- Milestone path：流光渐变线 + 统一尺寸节点 -->
      <div class="relative z-10 mt-7 px-2">
        <div class="relative flex justify-between items-center">
          <!-- Connecting line -->
          <div class="absolute top-[18px] left-0 right-0 h-[3px] bg-gray-200/70 rounded-full"></div>
          <div class="absolute top-[18px] left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.5)] transition-all duration-1000 ease-out" :style="{ width: `${Math.min((snapshotDays / maxRequiredDays) * 100, 100)}%` }"></div>

          <!-- Milestone dots（统一 w-9 尺寸，靠高亮/外发光区分状态） -->
          <div v-for="tier in sortedTiers" :key="tier.id" class="relative flex flex-col items-center z-10" style="width: 0;">
            <div :class="[
              'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-500',
              getTierState(tier) === 'claimed' ? 'bg-white border-[#07C160] shadow-md' :
              getTierState(tier) === 'unlocked' ? 'bg-gradient-to-br from-amber-200 to-orange-300 border-white shadow-[0_0_14px_rgba(251,146,60,0.55)]' :
              'bg-white border-gray-200'
            ]">
              <CheckCircle2 v-if="getTierState(tier) === 'claimed'" class="w-4.5 h-4.5 text-[#07C160]" />
              <Gift v-else-if="getTierState(tier) === 'unlocked'" class="w-4.5 h-4.5 text-orange-600 animate-bounce" />
              <Lock v-else class="w-3.5 h-3.5 text-gray-300" />
            </div>
            <div :class="['text-[10px] mt-1.5 font-bold whitespace-nowrap transition-colors', snapshotDays >= tier.requiredDays ? 'text-gray-700' : 'text-gray-400']">
              {{ tier.requiredDays }}天
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Shipped notification：挪到白色卡片区上方，不再夹在顶栏与头部之间 -->
    <Transition name="slide-down">
      <div v-if="shippedClaims.length > 0" class="mx-4 mt-4 bg-blue-50 text-blue-600 px-4 py-2.5 text-xs font-medium flex items-center gap-1.5 border border-blue-100 rounded-xl">
        <Package class="w-4 h-4 shrink-0 animate-bounce" />
        您有 {{ shippedClaims.length }} 个包裹已发出，请注意查收！
      </div>
    </Transition>

    <!-- Reward cards -->
    <div class="p-4 space-y-4">
      <!-- Gift cards -->
      <div v-for="(tier, idx) in sortedTiers" :key="tier.id" :class="['card-enter', visibleCards.includes(idx) ? 'card-enter-active' : '']">
        <!-- Locked card -->
        <div v-if="getTierState(tier) === 'locked'" class="bg-white rounded-2xl p-4 flex gap-4 border border-gray-100 shadow-sm relative overflow-hidden transition-transform hover:-translate-y-0.5">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full blur-2xl transform translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
          <div class="w-20 h-20 rounded-2xl bg-gray-100 shrink-0 overflow-hidden relative border border-gray-100 cursor-pointer" @click="store.openImagePreview([tier.imageUrl], 0)">
            <img loading="lazy" decoding="async" :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover opacity-50" />
            <div class="absolute inset-0 bg-gray-900/30 flex items-center justify-center">
              <Lock class="w-6 h-6 text-white/80" />
            </div>
          </div>
          <div class="flex-1 flex flex-col justify-center min-w-0 relative">
            <h3 class="font-bold text-gray-400 text-base mb-1 truncate">{{ tier.name }}</h3>
            <p v-if="tier.description" class="text-xs text-gray-400 leading-relaxed mb-1.5 line-clamp-2">{{ tier.description }}</p>
            <div class="text-xs text-gray-400 font-medium mb-2">连续打卡 {{ tier.requiredDays }} 天解锁</div>
            <div class="flex items-center gap-1.5">
              <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-orange-300 to-yellow-400 rounded-full transition-all duration-700" :style="{ width: `${Math.min((snapshotDays / tier.requiredDays) * 100, 100)}%` }"></div>
              </div>
              <span class="text-[10px] text-gray-400 font-medium shrink-0">{{ snapshotDays }}/{{ tier.requiredDays }}</span>
            </div>
          </div>
        </div>

        <!-- Unlocked card -->
        <div v-else-if="getTierState(tier) === 'unlocked'" class="bg-white rounded-2xl p-4 flex gap-4 border-2 border-orange-200 shadow-md relative overflow-hidden animate-glow">
          <div class="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-orange-100 to-yellow-50 rounded-full blur-2xl transform translate-x-1/4 -translate-y-1/4 pointer-events-none"></div>
          <div class="absolute top-2 right-2 z-10">
            <div class="flex items-center gap-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
              <Sparkles class="w-2.5 h-2.5" /> 可领取
            </div>
          </div>
          <div class="w-20 h-20 rounded-2xl bg-gray-100 shrink-0 overflow-hidden relative border border-orange-100 cursor-pointer shadow-sm transition-transform hover:scale-105" @click="store.openImagePreview([tier.imageUrl], 0)">
            <img loading="lazy" decoding="async" :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 flex flex-col justify-center min-w-0 relative">
            <h3 class="font-bold text-gray-900 text-base mb-1 truncate">{{ tier.name }}</h3>
            <p v-if="tier.description" class="text-xs text-gray-500 leading-relaxed mb-1.5 line-clamp-2">{{ tier.description }}</p>
            <div class="text-xs text-orange-500 font-medium mb-2 flex items-center gap-1">
              <Trophy class="w-3 h-3 animate-bounce" /> 已连续打卡 {{ tier.requiredDays }} 天，恭喜解锁！
            </div>
            <button @click="handleClaimClick(tier)" class="btn-glass-orange w-full py-2 rounded-xl text-white text-sm font-bold active:scale-95 transition-transform">
              立即领取
            </button>
          </div>
        </div>

        <!-- Out of stock card -->
        <div v-else-if="getTierState(tier) === 'outOfStock'" class="bg-white rounded-2xl p-4 flex gap-4 border border-gray-100 shadow-sm relative overflow-hidden opacity-70">
          <div class="w-20 h-20 rounded-2xl bg-gray-100 shrink-0 overflow-hidden relative border border-gray-100 cursor-pointer" @click="store.openImagePreview([tier.imageUrl], 0)">
            <img loading="lazy" decoding="async" :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 flex flex-col justify-center min-w-0">
            <h3 class="font-bold text-gray-500 text-base mb-1 truncate">{{ tier.name }}</h3>
            <p v-if="tier.description" class="text-xs text-gray-400 leading-relaxed mb-1.5 line-clamp-2">{{ tier.description }}</p>
            <div class="text-xs text-gray-400 font-medium mb-2">已解锁但库存不足</div>
            <div class="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg text-center font-medium">已领完，待补货</div>
          </div>
        </div>

        <!-- Claimed card -->
        <div v-else class="bg-white rounded-2xl p-4 flex gap-4 border border-green-100 shadow-sm relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full blur-2xl transform translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
          <div class="w-20 h-20 rounded-2xl bg-gray-100 shrink-0 overflow-hidden relative border border-green-100 cursor-pointer" @click="store.openImagePreview([tier.imageUrl], 0)">
            <img loading="lazy" decoding="async" :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover" />
            <div class="absolute top-1 right-1 w-5 h-5 bg-[#07C160] rounded-full flex items-center justify-center">
              <CheckCircle2 class="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div class="flex-1 flex flex-col justify-center min-w-0">
            <h3 class="font-bold text-gray-900 text-base mb-1 truncate">{{ tier.name }}</h3>
            <p v-if="tier.description" class="text-xs text-gray-500 leading-relaxed mb-1.5 line-clamp-2">{{ tier.description }}</p>
            <div class="flex items-center gap-1.5 text-[#07C160] text-xs font-bold mb-2">
              <CheckCircle2 class="w-3.5 h-3.5" /> 已领取
            </div>
            <div v-if="myClaims.find(c => c.tierId === tier.id)?.status === 'shipped'" class="flex items-center gap-2 text-[11px] text-gray-500">
              <span class="font-bold text-blue-600 flex items-center gap-1 shrink-0"><Package class="w-3 h-3" /> 已发货</span>
              <span class="font-mono truncate">单号: {{ myClaims.find(c => c.tierId === tier.id)?.trackingNumber }}</span>
              <button @click.stop="copyTracking(myClaims.find(c => c.tierId === tier.id)?.trackingNumber)" class="shrink-0 flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white/70 border border-gray-200 text-[10px] font-bold text-gray-500 active:scale-95 transition-transform">
                <Copy class="w-2.5 h-2.5" /> {{ copied ? '已复制' : '复制' }}
              </button>
            </div>
            <div v-else-if="myClaims.find(c => c.tierId === tier.id)?.status === 'in-person'" class="text-[10px] bg-green-50 text-[#07C160] px-2.5 py-1.5 rounded-lg border border-green-100 flex items-center gap-1">
              <CheckCircle2 class="w-3 h-3" /> 已线下领取
            </div>
            <div v-else-if="myClaims.find(c => c.tierId === tier.id)?.deliveryMethod === 'in-person'" class="text-[10px] bg-orange-50 text-orange-600 px-2.5 py-1.5 rounded-lg border border-orange-100 flex items-center gap-1">
              <Package class="w-3 h-3" /> 等待线下发放
            </div>
            <div v-else class="text-[10px] bg-gray-50 text-gray-500 px-2.5 py-1.5 rounded-lg border border-gray-100 flex items-center gap-1">
              <Package class="w-3 h-3" /> 仓库备货中，待发货
            </div>
            <!-- 收货地址信息 -->
            <div v-if="myClaims.find(c => c.tierId === tier.id)?.recipientName && myClaims.find(c => c.tierId === tier.id)?.recipientAddress && myClaims.find(c => c.tierId === tier.id)?.recipientAddress !== '线下领取'"
              class="mt-2 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
              <div class="flex items-center gap-1 text-gray-400 mb-0.5">
                <MapPin class="w-3 h-3" /> 收货信息
              </div>
              <div>{{ myClaims.find(c => c.tierId === tier.id)?.recipientName }} {{ myClaims.find(c => c.tierId === tier.id)?.recipientPhone }}</div>
              <div class="mt-0.5">{{ myClaims.find(c => c.tierId === tier.id)?.recipientAddress }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="sortedTiers.length === 0" class="text-center py-16">
        <Gift class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <div class="text-sm text-gray-400">暂无奖励配置</div>
      </div>
    </div>

    <!-- Claim popup -->
    <VanPopup v-model:show="showClaimModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5" v-if="selectedTier">
        <h3 class="text-lg font-bold text-gray-900 mb-4">{{ selectedDeliveryMethod === 'shipped' ? '填写收货信息' : '确认领取信息' }}</h3>
        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 p-3 rounded-xl mb-4 flex gap-3 items-center border border-orange-100">
          <img loading="lazy" decoding="async" :src="selectedTier.imageUrl" class="w-12 h-12 rounded-lg object-cover" />
          <div>
            <div class="text-sm font-bold text-gray-900">{{ selectedTier.name }}</div>
            <div class="text-xs text-orange-600 mt-0.5 flex items-center gap-1">
              <Sparkles class="w-3 h-3" /> 恭喜完成 {{ selectedTier.requiredDays }} 天连续打卡！
            </div>
          </div>
        </div>

        <!-- 领取方式选择（多种方式时显示） -->
        <div v-if="showDeliveryChoice" class="mb-4">
          <label class="text-sm font-medium text-gray-700 block mb-2">选择领取方式</label>
          <div class="flex gap-2">
            <button
              :class="['flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors', selectedDeliveryMethod === 'shipped' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500']"
              @click="selectedDeliveryMethod = 'shipped'; formError = ''"
            >邮寄</button>
            <button
              :class="['flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors', selectedDeliveryMethod === 'in-person' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500']"
              @click="selectedDeliveryMethod = 'in-person'; formError = ''"
            >线下领取</button>
          </div>
        </div>

        <!-- 邮寄：收货信息表单 -->
        <div v-if="selectedDeliveryMethod === 'shipped'" class="space-y-4 mb-6">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">收货人 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="请输入姓名" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="formData.name" @input="formError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">手机号 <span class="text-red-500">*</span></label>
            <input type="tel" placeholder="请输入11位手机号" maxlength="11" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm transition-colors" v-model="formData.phone" @input="formError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">详细地址 <span class="text-red-500">*</span></label>
            <textarea placeholder="省市区、街道、小区、楼栋及门牌号" class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white text-sm h-20 resize-none transition-colors" v-model="formData.address" @input="formError = ''"></textarea>
          </div>
          <div class="text-xs text-gray-400 flex items-start gap-1.5">
            <Check class="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
            <span>请确认信息无误，提交后如需修改请联系教练。</span>
          </div>
        </div>

        <!-- 线下领取：说明信息 -->
        <div v-else class="space-y-3 mb-6">
          <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
            <Package class="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <div class="text-sm font-bold text-gray-900 mb-1">线下领取</div>
            <div class="text-xs text-gray-500">提交后请等待营养师确认，确认后请前往指定地点领取奖品。</div>
          </div>
        </div>

        <div v-if="formError" class="text-red-500 text-xs font-medium text-center mb-4">{{ formError }}</div>
        <button class="btn-glass-orange w-full py-3.5 rounded-xl text-white font-bold active:scale-95 transition-transform" @click="submitClaim">
          确认提交
        </button>
      </div>
    </VanPopup>
  </div>
</template>

<style scoped>
@keyframes popIn {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes spinSlow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.animate-pop-in {
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.animate-spin-slow {
  animation: spinSlow 3s linear infinite;
}
.card-enter {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-enter-active {
  opacity: 1;
  transform: translateY(0);
}
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
.fade-up-enter-active, .fade-up-leave-active {
  transition: all 0.3s ease;
}
.fade-up-enter-from, .fade-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
