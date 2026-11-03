<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePaged } from '../composables/usePaged';
import { useDebounced } from '../composables/useDebounced';
import { useAppStore } from '../store/app';
import { campDateRange } from '../lib/camps';
import { NavBar, Card } from './ui';
import { rankStudents } from '../lib/scoring';
import { Trophy, Download, ChevronRight, Info, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Minus, Heart } from 'lucide-vue-next';
import { Popup as VanPopup, showToast } from 'vant';
import { format } from 'date-fns';

const store = useAppStore();
const highlightedId = ref<string | null>(null);
const showRules = ref(false);
const isRefreshing = ref(false);


// ─── 营期选择 ───
// 学员端：显示自己所属的营期列表（多期可切换）
// 营养师端：显示所有营期，可手动切换
const isDietitian = computed(() => store.user?.role === 'dietitian');

// 可选营期列表
// 学员端：只显示自己 campIds 中的营期；营养师端：显示所有营期
const availableCamps = computed(() => {
  if (isDietitian.value) return store.camps;
  if (store.user?.role === 'student') return store.getStudentCamps(store.user.id);
  return store.camps;
});

// 营养师端用 store.selectedCampId（与 Dashboard 共享），学员端也用 store.selectedCampId
// 当前生效的营期 ID
const activeCampId = computed(() => {
  // 优先使用 store 中选中的营期
  if (store.selectedCampId && availableCamps.value.some((c) => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  // 自动选择第一个 active 营期
  const active = availableCamps.value.find((c) => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

// 当前营期名称
const activeCampName = computed(() => {
  const camp = availableCamps.value.find((c) => c.id === activeCampId.value);
  return camp?.name || '全部';
});

// 是否显示营期切换器：仅营养师端显示（学员端由首页全局切换器控制）
const showCampSwitcher = computed(() => isDietitian.value && availableCamps.value.length > 1);

const showCampPicker = ref(false);

const handleCampSelect = (campId: string) => {
  store.selectedCampId = campId;
  showCampPicker.value = false;
};

// 按营期过滤学员
const campStudents = computed(() => {
  if (!activeCampId.value) return [];
  return store.getStudentsByCamp(activeCampId.value);
});

// 按营期过滤打卡记录
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campManual = computed(() => activeCampId.value ? store.getCampManualScoreRecords(activeCampId.value) : store.manualScoreRecords);

const handleRefresh = () => {
  isRefreshing.value = true;
  setTimeout(() => {
    isRefreshing.value = false;
    showToast({ message: '排名数据已更新', position: 'middle', duration: 2000 });
  }, 800);
};

// 防抖源：打卡/批注高频变化时合并为一次重算，避免提交即全量重排
const dDiet = useDebounced(campDiet);
const dEx = useDebounced(campEx);
const dManual = useDebounced(campManual);

const rankedStudents = computed(() => {
  if (campStudents.value.length === 0) return [];
  return rankStudents(campStudents.value, dDiet.value, dEx.value, dManual.value);
});

// ---- 排名较昨日变动 ----
const todayKey = format(new Date(), 'yyyy-MM-dd');
const yesterdayKey = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
const yesterdayRankKey = `rank_${activeCampId.value}_${yesterdayKey}`;
const todayRankKey = `rank_${activeCampId.value}_${todayKey}`;

const yesterdayRankMap = computed(() => {
  try {
    const raw = localStorage.getItem(yesterdayRankKey);
    if (raw) return new Map<string, number>(JSON.parse(raw));
  } catch { /* */ }
  return new Map<string, number>();
});

// 今日首次打开时，保存当前排名为"今日排名"，同时把"昨日排名"缓存好
function persistTodayRank() {
  const ranked = rankStudents(campStudents.value, campDiet.value, campEx.value, campManual.value);
  const entries = ranked.map((r) => [r.studentId, r.rank] as [string, number]);
  // 如果今天还没存过，把昨天存的数据移到 yesterday（如果已有今日数据说明今天已存过）
  const existingToday = localStorage.getItem(todayRankKey);
  if (!existingToday) {
    // 当前 localStorage 里可能存的是前一天的排名，把它移到 yesterday
    const oldKey = `rank_${activeCampId.value}_${format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')}`;
    // yesterday 已经有自己的 key，不需要移动
  }
  localStorage.setItem(todayRankKey, JSON.stringify(entries));
}

const rankChange = (studentId: string, currentRank: number): number | null => {
  const prev = yesterdayRankMap.value.get(studentId);
  if (prev === undefined) return null;
  return prev - currentRank; // 正数=上升，负数=下降
};


// ---- 加油互动 ----
const cheerKey = (toId: string) => `cheer_${store.user?.id || 'anon'}_${toId}_${todayKey}`;
const cheeredIds = ref<Set<string>>(new Set());

const loadCheers = () => {
  const cheered = new Set<string>();
  for (const s of campStudents.value) {
    if (localStorage.getItem(cheerKey(s.id))) cheered.add(s.id);
  }
  cheeredIds.value = cheered;
};

const cheerCount = (studentId: string): number => {
  // 统计所有人对该学员的加油次数（从 localStorage 扫描）
  let count = 0;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('cheer_') && key.includes(`_${studentId}_${todayKey}`)) count++;
  }
  return count;
};

const handleCheer = (studentId: string, name: string) => {
  if (cheeredIds.value.has(studentId)) {
    showToast({ message: '今天已经给TA加过油了', position: 'middle', duration: 1500 });
    return;
  }
  localStorage.setItem(cheerKey(studentId), '1');
  cheeredIds.value.add(studentId);
  showToast({ message: `已给${name}加油！`, position: 'middle', duration: 1500 });
};

// 首次加载时保存今日排名
loadCheers();
persistTodayRank();

const handleExportCSV = () => {
  const BOM = '﻿';
  let csvContent = '排名,姓名,总积分,饮食积分,运动积分,手动调整\n';

  rankedStudents.value.forEach((row) => {
    csvContent += `${row.rank},${row.name},${row.totalScore},${row.dietScore},${row.exerciseScore},${(row as any).manualScore ?? 0}\n`;
  });

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `学员积分排名_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const handleRowClick = (studentId: string) => {
  if (store.user?.role === 'student' && store.user.id !== studentId) {
    showToast({ message: '仅可查看自己的明细', position: 'middle', duration: 2000 });
    return;
  }
  store.setSelectedStudentId(studentId);
  store.setCurrentView('pointsDetail');
};

const handleScrollToMe = () => {
  if (!store.user) return;
  const el = document.getElementById(`rank-row-${store.user.id}`);
  if (el) {
    el.scrollIntoView({ block: 'center' });
    highlightedId.value = store.user.id;
    setTimeout(() => {
      highlightedId.value = null;
    }, 1500);
  }
};

const currentUserRank = computed(() => rankedStudents.value.find((s) => s.studentId === store.user?.id));
// 长列表分页：默认渲染前 20 名，更多名次点「加载更多」（生产由后端分页）
const { items: pagedRanked, hasMore, remaining, loadMore } = usePaged(rankedStudents, 20);

const medalConfig = (rank: number) =>
  rank === 1
    ? { bg: '#FDE047', border: '#EAB308' }
    : rank === 2
    ? { bg: '#E2E8F0', border: '#94A3B8' }
    : { bg: '#FDBA74', border: '#F97316' };

const rankNumberCls = (rank: number) =>
  rank === 1
    ? 'text-yellow-500 drop-shadow-md'
    : rank === 2
    ? 'text-gray-400 drop-shadow-md'
    : rank === 3
    ? 'text-amber-600 drop-shadow-md'
    : 'text-gray-300';
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="积分排行" :on-back="store.goBack">
      <template #right>
        <div class="flex items-center gap-2">
          <button @click="handleRefresh" :disabled="isRefreshing" class="text-gray-500 hover:text-gray-900 p-2">
            <RefreshCw :class="['w-5 h-5', isRefreshing ? 'animate-spin' : '']" />
          </button>
          <button v-if="store.user?.role === 'dietitian'" @click="handleExportCSV" class="text-gray-500 hover:text-gray-900 p-2">
            <Download class="w-5 h-5" />
          </button>
        </div>
      </template>
    </NavBar>

    <div class="flex-1 p-4 space-y-3 pb-8">
      <!-- 营期切换（仅营养师端显示，学员端由首页全局切换器控制） -->
      <div v-if="showCampSwitcher" class="flex items-center gap-2">
        <button
          @click="showCampPicker = true"
          class="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-sm font-medium text-gray-700 active:bg-gray-50"
        >
          {{ activeCampName }}
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
        <span class="text-xs text-gray-400">{{ campStudents.length }} 名学员</span>
      </div>

      <!-- 营期名称（学员端或单期时显示） -->
      <div v-else class="text-xs text-gray-400 pl-1">
        {{ activeCampName }} · {{ campStudents.length }} 名学员参与排名
      </div>

      <div class="bg-gradient-to-r from-[#FF976A] to-[#ffb191] rounded-2xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div class="relative z-10">
          <template v-if="store.user?.role === 'dietitian'">
            <h2 class="text-xl font-bold mb-1">共 {{ rankedStudents.length }} 名学员参与排名</h2>
          </template>
          <template v-else>
            <h2 class="text-lg font-bold mb-1 leading-snug">
              当前我的排名位于 <span @click="handleScrollToMe" class="text-white border-b border-white/60 cursor-pointer pb-0.5">{{ currentUserRank?.rank || '--' }}</span> 位，<br />
              总积分 <span @click="store.user && handleRowClick(store.user.id)" class="text-white border-b border-white/60 cursor-pointer pb-0.5">{{ currentUserRank?.totalScore || 0 }}</span> 分
            </h2>
            <p class="text-xs opacity-90 mt-2">'坚持打卡，健康生活每一天！'</p>
          </template>
        </div>
        <Trophy class="absolute right-4 -bottom-4 w-24 h-24 text-white opacity-20" />
      </div>

            <div class="flex items-center justify-end -mt-3 mb-1">
        <button @click="showRules = true" class="flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF976A] transition-colors">
          <Info class="w-3.5 h-3.5" />
          积分规则
        </button>
      </div>

      <Card
        v-for="student in pagedRanked"
        :key="student.studentId"
        :id="`rank-row-${student.studentId}`"
        :class="['p-4 flex items-center transition-all duration-300', store.user?.id === student.studentId ? 'bg-green-50/30' : '', highlightedId === student.studentId ? 'ring-2 ring-[#FF976A] bg-orange-50/50 scale-[1.02]' : '']"
      >
        <div class="w-12 mr-3 flex items-center justify-center shrink-0 relative">
          <span :class="['text-4xl font-black italic tracking-tighter', rankNumberCls(student.rank)]">
            {{ student.rank }}
          </span>
          <svg v-if="student.rank <= 3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="absolute -top-3 -right-3 w-8 h-8 drop-shadow-sm">
            <path d="M6 0L10.5 9H12V0H6Z" fill="#3B82F6" />
            <path d="M12 0V9H13.5L18 0H12Z" fill="#EF4444" />
            <circle cx="12" cy="14" r="8" :fill="medalConfig(student.rank).bg" :stroke="medalConfig(student.rank).border" stroke-width="1.5" />
            <circle cx="12" cy="14" r="5" fill="none" :stroke="medalConfig(student.rank).border" stroke-width="0.5" />
          </svg>
        </div>

        <div class="flex-1 min-w-0">
          <div class="font-bold text-gray-900 flex items-center gap-2 truncate">
            <span class="truncate">{{ student.name }}</span>
            <span v-if="store.user?.id === student.studentId" class="text-[10px] bg-[#07C160] text-white px-1.5 py-0.5 rounded shrink-0">我</span>
            <!-- 排名变动趋势 -->

              <span v-if="rankChange(student.studentId, student.rank) !== null && rankChange(student.studentId, student.rank)! > 0" class="flex items-center gap-0.5 text-[10px] text-[#07C160] font-bold shrink-0">
                <TrendingUp class="w-3 h-3" />{{ rankChange(student.studentId, student.rank) }}
              </span>
              <span v-else-if="rankChange(student.studentId, student.rank) !== null && rankChange(student.studentId, student.rank)! < 0" class="flex items-center gap-0.5 text-[10px] text-orange-400 font-bold shrink-0">
                <TrendingDown class="w-3 h-3" />{{ Math.abs(rankChange(student.studentId, student.rank)!) }}
              </span>
              <span v-else-if="rankChange(student.studentId, student.rank) === 0" class="flex items-center gap-0.5 text-[10px] text-gray-300 font-bold shrink-0">
                <Minus class="w-3 h-3" />
              </span>
          </div>
          <!-- 加油次数 -->
          <div v-if="cheerCount(student.studentId) > 0" class="text-[10px] text-pink-400 flex items-center gap-0.5 mt-0.5">
            <Heart class="w-2.5 h-2.5 fill-current" /> {{ cheerCount(student.studentId) }}
          </div>
        </div>

        <!-- 加油按钮（非自己、学员端） -->
        <button
          v-if="store.user?.role === 'student' && store.user?.id !== student.studentId"
          @click="handleCheer(student.studentId, student.name)"
          :class="['p-2 rounded-full transition-all active:scale-90 shrink-0', cheeredIds.has(student.studentId) ? 'text-pink-400 bg-pink-50' : 'text-gray-300 hover:text-pink-400 hover:bg-pink-50']"
        >
          <Heart :class="['w-4 h-4', cheeredIds.has(student.studentId) ? 'fill-current' : '']" />
        </button>

        <div
          :class="['flex items-center gap-1 pl-3 py-1 ml-2', store.user?.role === 'dietitian' || store.user?.id === student.studentId ? 'cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity' : 'opacity-80']"
          @click="handleRowClick(student.studentId)"
        >
          <div class="text-right flex flex-col items-end justify-center">
            <div class="text-[22px] font-black text-[#FF976A] leading-none tracking-tighter">
              {{ student.totalScore }}
            </div>
            <div class="text-[10px] text-gray-400 mt-1">
              积分详情
            </div>
          </div>
          <ChevronRight :class="['w-4 h-4', store.user?.role === 'dietitian' || store.user?.id === student.studentId ? 'text-gray-300' : 'text-transparent']" />
        </div>
      </Card>
      <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mt-2 text-xs font-bold text-[#FF976A] bg-white border border-[#FF976A]/30 rounded-xl active:bg-orange-50">
        加载更多（还有 {{ remaining }} 名）
      </button>
    </div>

    <VanPopup v-model:show="showRules" position="center" closeable close-icon-position="top-right" class="custom-popup">
      <div class="p-5 max-h-[80vh] ">
        <h3 class="font-bold text-gray-900 text-base mb-3">打卡积分规则说明</h3>
        <div class="text-sm text-gray-700 space-y-3 leading-relaxed">
          <p class="font-medium">本期健康训练营为期{{ store.getCampDays(store.user?.id || '') || 28 }}天：</p>
          <p><span class="font-bold text-gray-900">饮食打卡：</span>饮食按一日三餐打卡，营养师对每餐进行评分（+2=较好落实计划 / +1=整体尚可但有改进空间 / 0=明显偏离计划），未批注不计分，单日饮食最高6分。</p>
          <p><span class="font-bold text-gray-900">运动打卡：</span>每日完成单次40分钟以上运动得1分基础分；营养师评分直接加分：+2（到位）再得2分，+1（尚可）再得1分。</p>
          <p>所有打卡积分累计后排名，积分越高名次越靠前，同分并列，对应名次均可兑换礼品，并列者享受同等激励。</p>
        </div>
      </div>
    </VanPopup>

    <!-- 营期选择弹窗（仅营养师端） -->
    <VanPopup v-if="isDietitian" v-model:show="showCampPicker" position="bottom" round class="custom-popup">
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
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">{{ store.getStudentsByCamp(camp.id).length }}人</span>
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
            </div>
          </button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
