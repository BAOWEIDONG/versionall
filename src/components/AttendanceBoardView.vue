<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, format, subDays } from 'date-fns';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { CalendarDays, ChevronLeft, ChevronRight, Search, X, Users, CheckCircle2, Circle, ChevronRight as Arrow } from 'lucide-vue-next';

const store = useAppStore();

const selectedCamp = computed(() => store.camps.find((c) => c.id === store.selectedCampId) || null);
const campStudents = computed(() => (store.selectedCampId ? store.getStudentsByCamp(store.selectedCampId) : store.getAllStudents()));

// 默认昨天；顶部可一键切换「昨天 / 今天」，也可在营期范围内前后翻天
const todayStr = format(new Date(), 'yyyy-MM-dd');
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const dateStr = ref(store.attendanceBoardDate || yesterday);
const isToday = computed(() => dateStr.value === todayStr);
const isYesterday = computed(() => dateStr.value === yesterday);
const setQuickDate = (kind: 'yesterday' | 'today') => {
  dateStr.value = kind === 'today' ? todayStr : yesterday;
};

const dateObj = computed(() => new Date(`${dateStr.value}T00:00:00`));
const canPrev = computed(() => {
  const s = selectedCamp.value?.startDate;
  return !s || format(subDays(dateObj.value, 1), 'yyyy-MM-dd') >= s.substring(0, 10);
});
const canNext = computed(() => {
  const e = selectedCamp.value?.endDate;
  return !e || format(addDays(dateObj.value, 1), 'yyyy-MM-dd') <= e.substring(0, 10);
});
const shiftDay = (n: number) => {
  if (n < 0 && !canPrev.value) return;
  if (n > 0 && !canNext.value) return;
  dateStr.value = format(addDays(dateObj.value, n), 'yyyy-MM-dd');
};

const diet = computed(() => (store.selectedCampId ? store.getCampDietRecords(store.selectedCampId) : store.dietRecords));
const ex = computed(() => (store.selectedCampId ? store.getCampExerciseRecords(store.selectedCampId) : store.exerciseRecords));
const wt = computed(() => (store.selectedCampId ? store.getCampWeightRecords(store.selectedCampId) : store.weightRecords));

const rows = computed(() => campStudents.value.map((s) => {
  const d = diet.value.filter((r) => r.studentId === s.id && r.date.startsWith(dateStr.value));
  const e = ex.value.filter((r) => r.studentId === s.id && r.date.startsWith(dateStr.value));
  const w = wt.value.filter((r) => r.studentId === s.id && r.date.startsWith(dateStr.value));
  const meals = new Set(d.map((r) => r.meal));
  const items = {
    breakfast: meals.has('breakfast'),
    lunch: meals.has('lunch'),
    dinner: meals.has('dinner'),
    exercise: e.length > 0,
    weight: w.length > 0,
  };
  const done = Object.values(items).filter(Boolean).length;
  const times = [...d, ...e, ...w].map((r) => r.date).sort();
  return { ...s, items, done, all: done === 5, any: done > 0, firstTime: times[0] ? times[0].substring(11, 16) : '' };
}));

const summary = computed(() => {
  const total = rows.value.length;
  const checked = rows.value.filter((r) => r.any).length;
  const all = rows.value.filter((r) => r.all).length;
  return { total, checked, unchecked: total - checked, all, rate: total ? Math.round((checked / total) * 100) : 0, allRate: total ? Math.round((all / total) * 100) : 0 };
});

const itemStats = computed(() => {
  const total = rows.value.length;
  const defs: { key: keyof (typeof rows.value)[number]['items']; label: string; color: string }[] = [
    { key: 'breakfast', label: '早餐', color: '#FF976A' },
    { key: 'lunch', label: '中餐', color: '#FF976A' },
    { key: 'dinner', label: '晚餐', color: '#FF976A' },
    { key: 'exercise', label: '运动', color: '#1677FF' },
    { key: 'weight', label: '体重', color: '#07C160' },
  ];
  return defs.map((d) => {
    const n = rows.value.filter((r) => r.items[d.key]).length;
    return { ...d, count: n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
});

const filter = ref<'all' | 'unchecked' | 'partial' | 'allDone'>('all');
const keyword = ref('');
const filtered = computed(() => {
  let list = rows.value;
  if (filter.value === 'unchecked') list = list.filter((r) => !r.any);
  else if (filter.value === 'partial') list = list.filter((r) => r.any && !r.all);
  else if (filter.value === 'allDone') list = list.filter((r) => r.all);
  const k = keyword.value.trim().toLowerCase();
  if (k) list = list.filter((r) => r.name.toLowerCase().includes(k) || r.phone.includes(keyword.value.trim()));
  return list;
});

const openStudent = (id: string) => {
  store.setSelectedStudentId(id);
  store.setCurrentView('dietitian-student-detail');
};

const itemDefs = [
  { key: 'breakfast' as const, label: '早餐' },
  { key: 'lunch' as const, label: '中餐' },
  { key: 'dinner' as const, label: '晚餐' },
  { key: 'exercise' as const, label: '运动' },
  { key: 'weight' as const, label: '体重' },
];
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-8 font-sans">
    <NavBar title="学员打卡情况看板" :on-back="store.goBack" />

    <!-- 当前营期 + 昨天/今天切换 + 日期 -->
    <div class="bg-white px-4 py-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">当前营期 · <span class="text-gray-800 font-medium">{{ selectedCamp?.name || '未选择' }}</span></div>
        <div class="flex bg-gray-100 p-0.5 rounded-full">
          <button @click="setQuickDate('yesterday')"
            :class="['px-3 py-1 rounded-full text-xs font-bold transition-colors', isYesterday ? 'bg-white text-[#FF976A] shadow-sm' : 'text-gray-500']">昨天</button>
          <button @click="setQuickDate('today')"
            :class="['px-3 py-1 rounded-full text-xs font-bold transition-colors', isToday ? 'bg-white text-[#FF976A] shadow-sm' : 'text-gray-500']">今天</button>
        </div>
      </div>
      <div class="flex items-center justify-center gap-2 mt-2.5">
        <button :disabled="!canPrev" :class="['w-8 h-8 rounded-full flex items-center justify-center', canPrev ? 'bg-gray-100 text-gray-700 active:bg-gray-200' : 'bg-gray-50 text-gray-300']" @click="shiftDay(-1)">
          <ChevronLeft class="w-4 h-4" />
        </button>
        <label class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-sm font-bold text-gray-900">
          <CalendarDays class="w-4 h-4 text-[#FF976A]" />
          <input v-model="dateStr" type="date" class="bg-transparent outline-none text-sm font-bold" />
        </label>
        <button :disabled="!canNext" :class="['w-8 h-8 rounded-full flex items-center justify-center', canNext ? 'bg-gray-100 text-gray-700 active:bg-gray-200' : 'bg-gray-50 text-gray-300']" @click="shiftDay(1)">
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="p-4 space-y-4">
      <!-- 概览：打卡覆盖 + 完成质量（避免四个卡互相重复） -->
      <div class="flex items-center justify-between px-1">
        <span class="text-xs font-bold text-gray-700">打卡概览</span>
        <span class="text-[11px] text-gray-400">本营期共 {{ summary.total }} 人</span>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <Card class="p-4">
          <div class="flex items-end gap-1">
            <span class="text-2xl font-black text-gray-900">{{ summary.checked }}</span>
            <span class="text-sm text-gray-400 mb-0.5">/ {{ summary.total }} 人</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-1">已打卡 · 打卡率 {{ summary.rate }}%</div>
          <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full bg-[#FF976A] transition-all" :style="{ width: summary.rate + '%' }"></div>
          </div>
          <div class="text-[10px] text-gray-400 mt-1">未打卡 {{ summary.unchecked }} 人</div>
        </Card>
        <Card class="p-4">
          <div class="flex items-end gap-1">
            <span class="text-2xl font-black text-[#07C160]">{{ summary.all }}</span>
            <span class="text-sm text-gray-400 mb-0.5">/ {{ summary.total }} 人</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-1">全项完成 · 全项率 {{ summary.allRate }}%</div>
          <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full bg-[#07C160] transition-all" :style="{ width: summary.allRate + '%' }"></div>
          </div>
          <div class="text-[10px] text-gray-400 mt-1">部分完成 {{ summary.checked - summary.all }} 人</div>
        </Card>
      </div>

      <!-- 项目维度 -->
      <Card>
        <h3 class="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Users class="w-4 h-4 text-[#FF976A]" /> 各项目打卡人数
          <span class="ml-auto text-[11px] text-gray-400 font-normal">本营期共 {{ summary.total }} 人</span>
        </h3>
        <div class="space-y-2.5">
          <div v-for="it in itemStats" :key="it.key" class="flex items-center gap-2">
            <span class="text-xs text-gray-600 w-10 shrink-0">{{ it.label }}</span>
            <div class="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div class="h-full rounded-full transition-all" :style="{ width: it.pct + '%', background: it.color }"></div>
            </div>
            <span class="text-xs text-gray-700 w-24 text-right shrink-0 font-medium">{{ it.count }}/{{ summary.total }}人 · {{ it.pct }}%</span>
          </div>
        </div>
      </Card>

      <!-- 学员明细 -->
      <Card>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900">学员明细</h3>
          <span class="text-[11px] text-gray-400">共 {{ filtered.length }} 人</span>
        </div>

        <div class="flex gap-1.5 overflow-x-auto pb-3 no-scrollbar">
          <button v-for="t in [
            { k: 'all', l: '全部' }, { k: 'unchecked', l: '未打卡' }, { k: 'partial', l: '未全项' }, { k: 'allDone', l: '全项完成' }
          ]" :key="t.k" @click="filter = t.k as any"
            :class="['px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors', filter === t.k ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-600']">
            {{ t.l }}
          </button>
        </div>

        <div class="relative mb-3">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input v-model="keyword" type="text" placeholder="搜索姓名或手机号"
            class="w-full pl-9 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FF976A]" />
          <button v-if="keyword" @click="keyword = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-2">
          <div v-for="r in filtered" :key="r.id" class="p-3 rounded-xl bg-gray-50 active:bg-gray-100 cursor-pointer" @click="openStudent(r.id)">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-gray-900">{{ r.name }}</span>
              <span class="text-[10px] text-gray-500">{{ r.gender === 'male' ? '男' : '女' }} · {{ r.age }}岁</span>
              <span v-if="r.all" class="text-[9px] px-1.5 py-0.5 rounded bg-[#07C160]/10 text-[#07C160] font-bold">全项完成</span>
              <span v-else-if="!r.any" class="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-bold">未打卡</span>
              <span class="ml-auto text-[10px] text-gray-400">{{ r.firstTime ? '首次打卡 ' + r.firstTime : '未打卡' }}</span>
              <Arrow class="w-3.5 h-3.5 text-gray-300" />
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span v-for="it in itemDefs" :key="it.key"
                :class="['flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded', r.items[it.key] ? 'bg-[#07C160]/10 text-[#07C160]' : 'bg-gray-200/70 text-gray-400 line-through']">
                <CheckCircle2 v-if="r.items[it.key]" class="w-3 h-3" />
                <Circle v-else class="w-3 h-3" />
                {{ it.label }}
              </span>
            </div>
          </div>
          <div v-if="filtered.length === 0" class="text-center text-xs text-gray-400 py-6">该筛选下暂无学员</div>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
