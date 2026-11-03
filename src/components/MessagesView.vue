<script setup lang="ts">
import { computed, ref } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { NavBar, StudentTabbar } from './ui';
import { MessageCircle, Gift, Trophy, Bell, ChevronRight, Activity, RefreshCw } from 'lucide-vue-next';
import { useTabSwipe } from '../lib/useTabSwipe';
import { usePaged } from '../composables/usePaged';
import { useDebounced } from '../composables/useDebounced';

const store = useAppStore();
const isMine = (r: { studentId?: string }) => r.studentId === store.user?.id;

// ─── 刷新 toast ───
const isRefreshing = ref(false);
const toastText = ref('');
const toastVisible = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(text: string) {
  toastText.value = text;
  toastVisible.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastVisible.value = false; }, 2500);
}

async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await store.init();
    showToast('已刷新');
  } catch {
    showToast('刷新失败，请稍后重试');
  } finally {
    isRefreshing.value = false;
  }
}

// ─── 与首页 dashboard 完全一致的营期解析逻辑（保证 badge 与未读数口径统一） ───
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});
const campDietRecs = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campExRecs = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWtRecs = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campClaims = computed(() => activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims);
const campTiers = computed(() => activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers);

interface MessageItem {
  id: string;
  type: 'dietitian' | 'coach' | 'reward' | 'rank';
  date: string; // yyyy-MM-dd HH:mm:ss
  title: string;
  body: string;
  unread: boolean;
  targetView: 'diet' | 'exercise' | 'weight-checkin' | 'reward' | 'ranking' | 'camp-activities' | 'points-mall' | 'my-rewards';
  targetDate?: string; // yyyy-MM-dd for scroll-to-record
  recType?: 'diet' | 'weight' | 'exercise'; // 批注消息：点开时按此清该条 commentRead
  recordId?: string; // 批注消息对应记录 id
  notifId?: string; // 系统通知消息：点开时按此记已读
}

// ---- 批注消息（营养师：饮食/体重；教练：运动） ----
const commentMessages = computed<MessageItem[]>(() => {
  const dietitianWrap = (r: any, type: 'diet' | 'weight'): MessageItem => ({
    id: `${type}-${r.id}`,
    type: 'dietitian',
    date: r.dietitianCommentDate || r.date,
    title: `${r.dietitianName || '营养师'} 批注了你的${type === 'diet' ? '饮食' : '体重'}打卡`,
    body: r.dietitianComment,
    unread: !r.commentRead,
    targetView: type === 'diet' ? 'diet' : 'weight-checkin',
    targetDate: (r.date || '').substring(0, 10),
    recType: type,
    recordId: r.id,
  });
  const coachWrap = (r: any): MessageItem => ({
    id: `ex-${r.id}`,
    type: 'coach',
    date: r.coachCommentDate || r.date,
    title: `${r.coachName || '教练'} 批注了你的运动打卡`,
    body: r.coachComment,
    unread: !r.commentRead,
    targetView: 'exercise',
    targetDate: (r.date || '').substring(0, 10),
    recType: 'exercise',
    recordId: r.id,
  });
  return [
    ...campDietRecs.value.filter((r) => isMine(r) && r.dietitianComment).map((r) => dietitianWrap(r, 'diet')),
    ...campWtRecs.value.filter((r) => isMine(r) && r.dietitianComment).map((r) => dietitianWrap(r, 'weight')),
    ...campExRecs.value.filter((r) => isMine(r) && r.coachComment).map((r) => coachWrap(r)),
  ];
});

// ---- 奖励消息（领取/审核/发货/线下发放，计入「系统通知」未读） ----
const rewardMessages = computed<MessageItem[]>(() => {
  return campClaims.value
    .filter((c) => c.studentId === store.user?.id)
    .map((c) => {
      const tier = campTiers.value.find((t) => t.id === c.tierId);
      const shipped = c.status === 'shipped';
      const inPerson = c.status === 'in-person';
      const confirmed = c.status === 'confirmed';
      const date = (shipped && c.shipDate) || (inPerson && c.deliveredAt) || c.claimDate;
      return {
        id: `reward-${c.id}`,
        type: 'reward' as const,
        date,
        title: confirmed ? '活动奖励已审核通过' : shipped ? '你的奖励已发货' : inPerson ? '奖励已线下领取' : '奖励领取成功',
        body: confirmed
          ? `${tier?.name || '奖励'} 已审核通过，请前往趣味活动页面领取`
          : shipped
            ? `${tier?.name || '奖励'} 已寄出${c.trackingNumber ? `，快递单号 ${c.trackingNumber}` : ''}，请注意查收`
            : inPerson
              ? `${tier?.name || '奖励'} 已线下发放，请向服务人员确认领取`
              : c.deliveryMethod === 'in-person'
                ? `恭喜达成「${tier?.name || '奖励'}」，已为你安排线下领取，请等待营养师联系`
                : `恭喜达成「${tier?.name || '奖励'}」，礼品将尽快寄出`,
        unread: store.isNotifUnread(date, `reward-${c.id}`),
        notifId: `reward-${c.id}`,
        targetView: confirmed ? 'camp-activities' : 'my-rewards',
      };
    });
});

// ---- 积分商城兑换消息（含发货） ----
const exchangeMessages = computed<MessageItem[]>(() => {
  if (!store.user) return [];
  const mine = store.getStudentExchanges(store.user.id)
    .filter((e) => !activeCampId.value || e.campId === activeCampId.value);
  return mine
    .map((e): MessageItem => {
      const fulfilled = e.status === 'fulfilled';
      const date = (fulfilled && e.shipDate) || e.exchangeDate;
      return {
        id: `exch-${e.id}`,
        type: 'reward',
        date,
        title: fulfilled ? '积分兑换已发货' : '积分兑换成功',
        body: fulfilled
          ? `「${e.productName}」已寄出${e.trackingNumber ? `，快递单号 ${e.trackingNumber}` : ''}，请注意查收`
          : `你使用 ${e.pointsSpent} 积分兑换了「${e.productName}」，礼品将尽快寄出`,
        unread: store.isNotifUnread(date, `exch-${e.id}`),
        notifId: `exch-${e.id}`,
        targetView: 'my-rewards',
      };
    });
});

// ---- 汇总排序 ----
// 同一时间按优先级：批注 > 奖励/兑换（排名动态不再推送消息到消息中心）
const typePriority: Record<string, number> = { dietitian: 0, coach: 0, reward: 1 };
const allMessages = computed<MessageItem[]>(() =>
  [...commentMessages.value, ...rewardMessages.value, ...exchangeMessages.value]
    .sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      if (dc !== 0) return dc;
      return (typePriority[a.type] ?? 9) - (typePriority[b.type] ?? 9);
    }),
);

// ---- 分类筛选：营养师批注 / 教练批注 / 系统通知 ----
const filters = [
  { key: 'all', label: '全部' },
  { key: 'dietitian', label: '营养师批注' },
  { key: 'coach', label: '教练批注' },
  { key: 'reward', label: '系统通知' },
];
const activeFilter = ref<string>('all');
const sheetRoot = ref<HTMLElement | null>(null);
useTabSwipe(sheetRoot, activeFilter, ['all', 'dietitian', 'coach', 'reward']);
const messages = computed<MessageItem[]>(() =>
  activeFilter.value === 'all'
    ? allMessages.value
    : allMessages.value.filter((m) => m.type === activeFilter.value),
);

// 未读数 = 批注(营养师+教练) + 系统通知(奖励/兑换)，与各学员页底部「消息」Tab 角标口径一致
// （共享 store.getStudentMsgUnreadCount / lib/messageSeen）。排名动态不进入角标。
const unreadCount = computed(() =>
  allMessages.value.filter((m) => m.unread && (m.type === 'dietitian' || m.type === 'coach' || m.type === 'reward')).length,
);
// 长列表分页 + 防抖：默认只渲染前 20 条；打卡/批注等高频变化时列表重建合并为一次
const debouncedMessages = useDebounced(messages, 300);
const { items: pagedMessages, hasMore, remaining, loadMore } = usePaged(debouncedMessages, 20);

/** 各分类筛选 Tab 的未读数：all=总未读，其余按 type 统计未读 */
const tabUnread = (key: string): number =>
  key === 'all'
    ? unreadCount.value
    : allMessages.value.filter((m) => m.type === key && m.unread).length;

/** 当前激活 sheet 的未读数（顶部摘要用，随切换联动） */
const sheetUnread = computed(() => tabUnread(activeFilter.value));

const typeMeta = (type: MessageItem['type']) =>
  type === 'dietitian'
    ? { icon: MessageCircle, cls: 'bg-[#07C160]/10 text-[#07C160]', tag: '营养师批注', tagCls: 'bg-[#07C160]/10 text-[#07C160]' }
    : type === 'coach'
      ? { icon: Activity, cls: 'bg-sky-50 text-sky-500', tag: '教练批注', tagCls: 'bg-sky-50 text-sky-500' }
      : type === 'reward'
        ? { icon: Gift, cls: 'bg-orange-50 text-orange-500', tag: '系统通知', tagCls: 'bg-orange-50 text-orange-500' }
        : { icon: Trophy, cls: 'bg-yellow-50 text-yellow-600', tag: '排名动态', tagCls: 'bg-yellow-50 text-yellow-600' };

const openMessage = (m: MessageItem) => {
  // 点开才读才清：批注清该记录 commentRead，系统通知记该 notifId 已读
  if (m.recType && m.recordId) {
    store.markCommentRead(m.recType, m.recordId);
  } else if (m.notifId) {
    store.markNotifRead(m.notifId);
  }
  if (m.targetDate) {
    store.setSelectedDateStr(m.targetDate);
  }
  store.setCurrentView(m.targetView);
};

// 日期友好显示
const fmtDate = (d: string) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  const day = d.substring(0, 10);
  const time = d.substring(11, 16);
  if (day === today) return time ? `今天 ${time}` : '今天';
  if (day === yesterday) return time ? `昨天 ${time}` : '昨天';
  return day.substring(5).replace('-', '/');
};
</script>

<template>
  <div ref="sheetRoot" class="flex min-h-full flex-col bg-[#F7F8FA] pb-28">
    <NavBar title="消息中心" :on-back="store.goBack">
      <template #right>
        <button
          @click="handleRefresh"
          :disabled="isRefreshing"
          class="p-2 rounded-full hover:bg-gray-100 active:scale-90 transition-all disabled:opacity-50"
        >
          <RefreshCw class="w-4 h-4 text-[#07C160]" :class="{ 'animate-spin': isRefreshing }" />
        </button>
      </template>
    </NavBar>

    <transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition-all duration-300"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="toastVisible" class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-black/75 text-white text-xs font-medium rounded-full shadow-lg whitespace-nowrap">
        {{ toastText }}
      </div>
    </transition>

    <div class="px-4 pt-4">
      <div class="flex bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
        <button
          v-for="f in filters"
          :key="f.key"
          @click="activeFilter = f.key"
          :class="['flex-1 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 min-w-0', activeFilter === f.key ? 'bg-[#07C160] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700']"
        >
          <span class="truncate">{{ f.label }}</span>
          <span
            v-if="tabUnread(f.key) > 0 && activeFilter !== f.key"
            class="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black leading-4 text-center shrink-0 whitespace-nowrap"
            :class="activeFilter === f.key ? 'bg-white/30 text-white' : 'bg-red-500 text-white'"
          >{{ tabUnread(f.key) > 99 ? '99+' : tabUnread(f.key) }}</span>
        </button>
      </div>
    </div>

    <div class="p-4 space-y-3">
      <!-- 顶部摘要：未读数随当前 sheet 联动 -->
      <div v-if="sheetUnread > 0" class="flex items-center gap-2 px-4 py-3 bg-[#07C160]/5 border border-[#07C160]/15 rounded-xl">
        <Bell class="w-4 h-4 text-[#07C160] shrink-0" />
        <span class="text-xs text-gray-700">你有 <span class="font-bold text-[#07C160]">{{ sheetUnread }}</span> 条未读消息</span>
      </div>

      <!-- 空态 -->
      <div v-if="messages.length === 0" class="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
          <Bell class="w-8 h-8 text-gray-300" />
        </div>
        <div class="text-sm font-bold text-gray-600 mb-1">暂无消息</div>
        <div class="text-xs text-gray-400">营养师/教练的批注和系统通知会出现在这里</div>
      </div>

      <!-- 消息列表 -->
      <button
        v-for="m in pagedMessages"
        :key="m.id"
        @click="openMessage(m)"
        :class="['w-full text-left bg-white rounded-2xl p-4 flex items-start gap-3 active:scale-[0.98] transition-all shadow-sm hover:shadow-md', m.type === 'dietitian' || m.type === 'coach' ? 'border border-[#07C160]/15' : 'border border-gray-100']"
      >
        <div :class="['w-10 h-10 rounded-xl flex items-center justify-center shrink-0', typeMeta(m.type).cls]">
          <component :is="typeMeta(m.type).icon" class="w-5 h-5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span :class="['text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0', typeMeta(m.type).tagCls]">{{ typeMeta(m.type).tag }}</span>
            <span class="text-sm font-bold text-gray-900 truncate">{{ m.title }}</span>
            <span v-if="m.unread" class="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
          </div>
          <p class="text-xs text-gray-500 leading-relaxed line-clamp-2">{{ m.body }}</p>
          <div class="text-[10px] text-gray-400 mt-1">{{ fmtDate(m.date) }}</div>
        </div>
        <ChevronRight class="w-4 h-4 text-gray-300 shrink-0 mt-1" />
      </button>
      <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mt-2 text-xs font-bold text-[#07C160] bg-white border border-[#07C160]/30 rounded-xl active:bg-green-50">
        加载更多（还有 {{ remaining }} 条）
      </button>
    </div>

    <!-- Bottom Nav -->
    <StudentTabbar anchor="messages" :badge="unreadCount" />
  </div>
</template>
