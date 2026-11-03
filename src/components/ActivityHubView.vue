<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useAppStore } from '../store/app';
import { ChevronRight, Coins, Gift, Package, Sparkles } from 'lucide-vue-next';
import { StudentTabbar } from './ui';
import { calculateStreak } from '../lib/streak';

const store = useAppStore();

const isMine = (r: { studentId?: string }) => r.studentId === store.user?.id;

// 营期数据（用于活动摘要）
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});
const activeCamp = computed(() => availableCamps.value.find(c => c.id === activeCampId.value) || null);

const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);

const activityConfig = computed(() => store.getActivityConfig(activeCampId.value));

// 模块开关
const showMall = computed(() => activityConfig.value.pointsMall);

// 连续打卡奖励卡片是否展示（受营养师开关控制，关闭则隐藏；已发放奖励不受影响）
const showStreakReward = computed(() => activityConfig.value.checkinStreak && rewardTiers.value.length > 0);

// ─── 奖品池数据（汇总所有奖品来源） ──────────────────────
interface PrizePoolItem {
  id: string;
  name: string;
  imageUrl: string;
  tag: string;
  tagColor: string;
  category: 'streak' | 'milestone' | 'weekly' | 'lucky' | 'mall';
}

const prizePool = computed<PrizePoolItem[]>(() => {
  const items: PrizePoolItem[] = [];
  const cfg = activityConfig.value;
  const tiers = activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers;
  for (const t of tiers) {
    if (t.stock <= 0) continue;
    if (t.source === 'activity' && t.activityType) {
      const isMilestone = t.activityType === 'milestone';
      const isWeekly = t.activityType === 'weekly';
      // 按营养师活动开关过滤，避免活动关闭时奖品池仍展示引起误解
      if (isMilestone && !cfg.weightMilestone) continue;
      if (isWeekly && !cfg.weeklyChallenge) continue;
      if (!isMilestone && !isWeekly && !cfg.luckyDraw) continue; // 全勤抽奖
      items.push({
        id: t.id, name: t.name, imageUrl: t.imageUrl,
        tag: isMilestone ? '阶梯达标' : isWeekly ? '每周挑战' : '全勤抽奖',
        tagColor: isMilestone ? '#07C160' : isWeekly ? '#1677FF' : '#FF976A',
        category: isMilestone ? 'milestone' : isWeekly ? 'weekly' : 'lucky',
      });
    } else {
      // 连续打卡奖励：受 checkinStreak 开关控制
      if (!cfg.checkinStreak) continue;
      items.push({
        id: t.id, name: t.name, imageUrl: t.imageUrl,
        tag: `坚持${t.requiredDays}天`,
        tagColor: '#07C160', category: 'streak',
      });
    }
  }
  // 积分商城商品：受 pointsMall 开关控制
  if (cfg.pointsMall) {
    for (const p of store.getPointProducts(activeCampId.value)) {
      if (p.stock <= 0 || !p.active) continue;
      items.push({
        id: p.id, name: p.name, imageUrl: p.imageUrl,
        tag: `${p.pointsRequired}积分`,
        tagColor: '#FF6B35', category: 'mall',
      });
    }
  }
  return items;
});

const hasPrizes = computed(() => prizePool.value.length > 0);

// ─── 奖品池滚动（纯 rAF，自动 + 手动统一控制） ────────────
const scrollTrack = ref<HTMLElement | null>(null);
let offset = 0;          // 当前 translateX 偏移（px）
let halfWidth = 0;       // 内容一半宽度（无缝循环用）
let rafId: number | null = null;
let autoScroll = true;   // 是否自动滚动
let isDragging = false;
let lastTouchX = 0;
let velocity = 0;        // 手松开时的惯性速度
let frictionRaf: number | null = null;

const SPEED = 0.5;       // 自动滚动速度 px/frame (~30px/s)

function loop() {
  if (autoScroll && !isDragging) {
    offset -= SPEED;
    if (halfWidth > 0 && offset <= -halfWidth) offset = 0;
  }
  applyTransform();
  rafId = requestAnimationFrame(loop);
}

function applyTransform() {
  const el = scrollTrack.value;
  if (el) el.style.transform = `translate3d(${offset}px,0,0)`;
}

function onTouchStart(e: TouchEvent | MouseEvent) {
  isDragging = true;
  autoScroll = false;
  velocity = 0;
  if (frictionRaf) { cancelAnimationFrame(frictionRaf); frictionRaf = null; }
  lastTouchX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
  const el = scrollTrack.value;
  halfWidth = el ? el.scrollWidth / 2 : 0;
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging) return;
  e.preventDefault();
  const x = e.touches[0].clientX;
  const delta = x - lastTouchX;
  lastTouchX = x;
  velocity = delta;           // 记录最后一步速度供惯性用
  offset += delta;
  // 无缝循环
  if (halfWidth > 0) {
    if (offset <= -halfWidth) offset += halfWidth;
    if (offset >= 0) offset -= halfWidth;
  }
}

function startFriction() {
  const step = () => {
    if (Math.abs(velocity) < 0.3) {
      frictionRaf = null;
      autoScroll = true;   // 惯性结束，恢复自动滚动
      return;
    }
    offset += velocity;
    velocity *= 0.92;      // 摩擦衰减
    if (halfWidth > 0) {
      if (offset <= -halfWidth) offset += halfWidth;
      if (offset >= 0) offset -= halfWidth;
    }
    frictionRaf = requestAnimationFrame(step);
  };
  frictionRaf = requestAnimationFrame(step);
}

function onTouchEnd() {
  if (!isDragging) return;
  isDragging = false;
  startFriction(); // 有惯性 → 惯性结束后自动恢复；无惯性 → 很快恢复
}

// 鼠标拖动（桌面端）
function onMouseDown(e: MouseEvent) {
  onTouchStart(e);
  const onMove = (ev: MouseEvent) => {
    if (!isDragging) return;
    const delta = ev.clientX - lastTouchX;
    lastTouchX = ev.clientX;
    velocity = delta;
    offset += delta;
    if (halfWidth > 0) {
      if (offset <= -halfWidth) offset += halfWidth;
      if (offset >= 0) offset -= halfWidth;
    }
  };
  const onUp = () => {
    onTouchEnd();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

onMounted(() => {
  // 等一帧让 DOM 渲染，读取宽度后启动循环
  requestAnimationFrame(() => {
    const el = scrollTrack.value;
    if (el) halfWidth = el.scrollWidth / 2;
    rafId = requestAnimationFrame(loop);
  });
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (frictionRaf) cancelAnimationFrame(frictionRaf);
});

// 打卡奖励摘要
const streakData = computed(() => calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id));
const rewardTiers = computed(() => {
  const tiers = activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers;
  return tiers.filter(t => t.source === 'streak');
});
const claimedCount = computed(() => {
  const claims = activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims;
  const tiers = activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers;
  return claims.filter(c => {
    if (c.studentId !== store.user?.id) return false;
    const tier = tiers.find(t => t.id === c.tierId);
    return tier?.source === 'streak';
  }).length;
});

// 积分商城摘要
const mallPoints = computed(() => store.user ? store.getStudentMallPoints(store.user.id, activeCampId.value || undefined) : 0);
const totalEarned = computed(() => store.user ? store.getStudentTotalEarnedPoints(store.user.id, activeCampId.value || undefined) : 0);
const productCount = computed(() => store.getPointProducts(activeCampId.value).length);

// 未读批注
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);
</script>

<template>
  <div class="flex min-h-full flex-col pb-28 font-sans relative">
    <!-- Header -->
    <div class="relative pt-[calc(env(safe-area-inset-top)+1.5rem)] px-5 pb-4 overflow-hidden">
      <div class="relative z-10 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-black text-gray-900 tracking-tight">活动奖励</h1>
          <p class="text-[11px] text-gray-500 mt-1">坚持打卡，赢取丰厚奖励</p>
        </div>
        <button
          class="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm border border-gray-100 px-3 py-2 rounded-full shadow-sm active:scale-95 transition-transform"
          @click="store.setCurrentView('my-rewards')"
        >
          <Package class="w-4 h-4 text-[#FF6B35]" />
          <span class="text-xs font-bold text-gray-700">我的奖励</span>
        </button>
      </div>
    </div>

    <div class="flex-1 px-5 space-y-4 relative z-20">
      <!-- 奖品池（自动滚动 + 手动滑动） -->
      <div v-if="hasPrizes" class="relative rounded-3xl overflow-hidden">
        <!-- 温暖渐变背景 -->
        <div class="absolute inset-0 bg-gradient-to-br from-orange-50/80 via-white to-amber-50/60"></div>
        <div class="absolute -top-8 -right-4 w-28 h-28 rounded-full bg-[#FF976A]/8 blur-2xl"></div>
        <div class="absolute -bottom-6 -left-4 w-24 h-24 rounded-full bg-[#F59E0B]/8 blur-2xl"></div>

        <div class="relative z-10">
          <!-- 标题行 -->
          <div class="flex items-center justify-between px-4 pt-4 pb-3">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF976A] to-[#F59E0B] flex items-center justify-center shadow-md shadow-orange-500/20">
                <Gift class="w-4 h-4 text-white" />
              </div>
              <span class="text-sm font-black text-gray-900 flex items-center gap-1">
                奖品池
                <Sparkles class="w-3 h-3 text-[#FF976A] sparkle-pulse" />
              </span>
            </div>
            <span class="text-[10px] font-bold text-[#FF6B35] bg-[#FF6B35]/10 px-2.5 py-1 rounded-full">{{ prizePool.length }}件奖品</span>
          </div>

          <!-- 自动滚动奖品展示（支持手动滑动） -->
          <div
            class="overflow-hidden px-4"
            @touchstart.passive="onTouchStart"
            @touchmove="onTouchMove"
            @touchend.passive="onTouchEnd"
            @mousedown="onMouseDown"
          >
            <div
              ref="scrollTrack"
              class="flex w-max pb-4"
              style="will-change: transform"
            >
              <div
                v-for="(prize, idx) in [...prizePool, ...prizePool]"
                :key="prize.id + '-' + idx"
                class="shrink-0 w-[96px] mr-2.5"
              >
                <!-- 图片：干净无遮挡 -->
                <div class="w-[96px] h-[96px] rounded-xl overflow-hidden bg-gray-50 shadow-sm border border-gray-100">
                  <img :src="prize.imageUrl" class="w-full h-full object-cover" loading="lazy" />
                </div>
                <!-- 标签：实色背景白字 -->
                <div class="mt-1.5 flex justify-center">
                  <span
                    class="text-[9px] font-bold text-white px-2 py-0.5 rounded-full leading-none"
                    :style="{ background: prize.tagColor }"
                  >{{ prize.tag }}</span>
                </div>
                <!-- 奖品名 -->
                <div class="text-[10px] font-bold text-gray-800 mt-1 text-center truncate px-0.5">{{ prize.name }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 积分商城（需营养师开启） -->
      <div
        v-if="showMall"
        class="relative rounded-3xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        @click="store.setCurrentView('points-mall')"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-[#FF976A] via-[#FF6B35] to-[#F59E0B]"></div>
        <div class="absolute -top-10 -right-6 w-32 h-32 rounded-full bg-white/15 blur-2xl"></div>
        <div class="absolute -bottom-8 -left-4 w-28 h-28 rounded-full bg-white/10 blur-2xl"></div>

        <div class="relative z-10 p-5 min-h-[160px] flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Coins class="w-5 h-5 text-white" />
              </div>
              <div>
                <div class="text-base font-black text-white">积分商城</div>
                <div class="text-[11px] text-white/70">打卡累积，兑换好礼</div>
              </div>
            </div>
            <div class="flex items-center gap-1 text-white/90 text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full">
              去兑换 <ChevronRight class="w-3 h-3" />
            </div>
          </div>

          <div class="flex items-end justify-between">
            <div class="flex flex-col gap-1">
              <div class="flex items-end gap-1.5">
                <span class="text-[40px] leading-none font-black text-white tracking-tight">{{ mallPoints }}</span>
                <span class="text-sm text-white/80 font-medium mb-1.5">可用积分</span>
              </div>
              <div class="flex items-center gap-2 text-[10px] text-white/60">
                <span>累计 {{ totalEarned }}</span>
                <span>·</span>
                <span>{{ productCount }} 件可兑</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <div v-for="p in store.getPointProducts(activeCampId).slice(0, 3)" :key="p.id"
                class="w-10 h-10 rounded-lg overflow-hidden bg-white/20 border border-white/20 shrink-0">
                <img loading="lazy" decoding="async" :src="p.imageUrl" class="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 打卡奖励（受连续打卡奖励开关控制，关闭则隐藏） -->
      <div
        v-if="showStreakReward"
        class="relative rounded-3xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        @click="store.setCurrentView('reward')"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-[#07C160]/10 via-[#04A551]/8 to-[#1677FF]/8 border border-white/60"></div>
        <div class="absolute -top-8 -right-6 w-24 h-24 rounded-full bg-[#07C160]/12 blur-2xl"></div>
        <div class="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-[#1677FF]/8 blur-2xl"></div>

        <div class="relative z-10 p-5 min-h-[160px] flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
                <Gift class="w-5 h-5 text-[#07C160]" />
              </div>
              <div>
                <div class="text-base font-black text-gray-900">打卡奖励</div>
                <div class="text-[11px] text-gray-500">坚持连续打卡，领取礼品</div>
              </div>
            </div>
            <ChevronRight class="w-5 h-5 text-gray-300" />
          </div>

          <div class="flex items-end justify-between">
            <div class="flex flex-col gap-1">
              <div class="flex items-end gap-1.5">
                <span class="text-[40px] leading-none font-black text-[#07C160] tracking-tight">{{ streakData.currentStreak }}</span>
                <span class="text-sm text-gray-400 font-medium mb-1.5">连续天数</span>
              </div>
              <div class="flex items-center gap-2 text-[10px] text-gray-400">
                <span>{{ rewardTiers.length }}档礼品</span>
                <span>·</span>
                <span>已领{{ claimedCount }}次</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <div v-for="tier in rewardTiers.slice(0, 3)" :key="tier.id"
                class="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-white/60">
                <img loading="lazy" decoding="async" :src="tier.imageUrl" class="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态：所有模块都未开启 -->
      <div v-if="!showMall && !showStreakReward" class="flex flex-col items-center justify-center py-16">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Gift class="w-8 h-8 text-gray-300" />
        </div>
        <p class="text-sm text-gray-400">活动正在筹备中</p>
        <p class="text-[11px] text-gray-400 mt-1">营养师正在配置活动内容，敬请期待</p>
      </div>

      <!-- 免责声明 -->
      <div class="pt-2 pb-1">
        <p class="text-[10px] text-gray-400 leading-relaxed text-center px-2">
          本平台所列活动奖品及积分商城商品均为第三方采购的赠品，非平台自有产品。如遇质量问题、售后维修等事宜，请直接联系商品生产厂家或品牌方处理，平台仅提供积分兑换及活动赠礼服务，不承担商品质量担保责任。
        </p>
      </div>
    </div>

    <!-- Bottom Nav -->
    <StudentTabbar anchor="activity-hub" :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style scoped>
/* 星星脉动 */
.sparkle-pulse {
  animation: sparklePulse 2s ease-in-out infinite;
}
@keyframes sparklePulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8) rotate(0deg); }
  50% { opacity: 1; transform: scale(1.2) rotate(15deg); }
}
</style>
