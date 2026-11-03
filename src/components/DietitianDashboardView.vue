<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePaged } from '../composables/usePaged';
import { useDebounced } from '../composables/useDebounced';
import { useAppStore } from '../store/app';
import { useDietitianCounts } from '../lib/dietitianCounts';
import { campDateRange } from '../lib/camps';
import { Card } from './ui';
import { Users, UserCircle, LogOut, CheckCircle, XCircle, Search, X, FileText, Settings, ChevronDown, CalendarDays, BarChart3, ChevronRight } from 'lucide-vue-next';
import { format, subDays } from 'date-fns';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup } from 'vant';
import { rankStudents } from '../lib/scoring';

const store = useAppStore();

const activeTab = ref<'incomplete' | 'completed'>('incomplete');
const searchQuery = ref('');

// ─── 营期切换 ───
const showCampPicker = ref(false);

const availableCamps = computed(() => store.camps);
// 未选具体营期时回落到第一个 active 营期，避免"全部营期"跨期汇总导致多营期学员重复计分（与学员端/排名页口径一致）
const activeCampId = computed(() => {
  if (store.selectedCampId) return store.selectedCampId;
  const active = store.camps.find((c) => c.status === 'active');
  const first = store.camps.length > 0 ? store.camps[0] : null;
  return active?.id || first?.id || null;
});
const activeCampName = computed(() => {
  if (!activeCampId.value) return '全部营期';
  return store.camps.find((c) => c.id === activeCampId.value)?.name || '全部营期';
});

// 按营期过滤学员（null = 全部活跃学员）
const campStudents = computed(() => {
  if (!activeCampId.value) return store.getAllStudents();
  return store.getStudentsByCamp(activeCampId.value);
});

// 按营期过滤打卡记录（null = 全部记录）
const campDietRecords = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campWeightRecords = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campExerciseRecords = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campManualRecords = computed(() => activeCampId.value ? store.getCampManualScoreRecords(activeCampId.value) : store.manualScoreRecords);
// 防抖镜像：学员打卡/批注高频变化时，首页重计算合并为 300ms 一次，避免提交即全量重排卡顿
const dDietRecords = useDebounced(campDietRecords);
const dExerciseRecords = useDebounced(campExerciseRecords);
const dManualRecords = useDebounced(campManualRecords);
const dWeightRecords = useDebounced(campWeightRecords);

// 底部 Tabbar 角标：批注=待批注数，配置=发放中心待发货数（各营养师页面共用口径）
const { unannotatedCount, fulfillmentPendingCount } = useDietitianCounts();

const _now = new Date();
const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

// 打卡情况概览：首页可直接切换「昨天 / 今天」（与看板详情同口径）
const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const attendanceDay = ref<'yesterday' | 'today'>('yesterday');
const attendanceDate = computed(() => (attendanceDay.value === 'today' ? todayStr : yesterdayStr));
const attendanceDayLabel = computed(() => (attendanceDay.value === 'today' ? '今天' : '昨天'));
const openAttendanceBoard = () => {
  store.attendanceBoardDate = attendanceDate.value;
  store.setCurrentView('attendance-board');
};
const attendanceSummary = computed(() => {
  const date = attendanceDate.value;
  const total = campStudents.value.length;
  let checked = 0;
  let all = 0;
  for (const s of campStudents.value) {
    const meals = new Set(campDietRecords.value.filter((r) => r.studentId === s.id && r.date.startsWith(date)).map((r) => r.meal));
    const hasEx = campExerciseRecords.value.some((r) => r.studentId === s.id && r.date.startsWith(date));
    const hasWt = campWeightRecords.value.some((r) => r.studentId === s.id && r.date.startsWith(date));
    const done = (meals.has('breakfast') ? 1 : 0) + (meals.has('lunch') ? 1 : 0) + (meals.has('dinner') ? 1 : 0) + (hasEx ? 1 : 0) + (hasWt ? 1 : 0);
    if (done > 0) checked++;
    if (done === 5) all++;
  }
  return { total, checked, unchecked: total - checked, all, rate: total ? Math.round((checked / total) * 100) : 0 };
});

const rankedStudents = computed(() => {
  if (campStudents.value.length === 0) return [];
  return rankStudents(campStudents.value, dDietRecords.value, dExerciseRecords.value, dManualRecords.value);
});

const studentsStatus = computed(() =>
  campStudents.value.map((student) => {
    const studentDiets = dDietRecords.value.filter((r) => r.studentId === student.id && r.date.startsWith(todayStr));
    const studentExercises = dExerciseRecords.value.filter((r) => r.studentId === student.id && r.date.startsWith(todayStr));

    const hasBreakfast = studentDiets.some((d) => d.meal === 'breakfast');
    const hasLunch = studentDiets.some((d) => d.meal === 'lunch');
    const hasDinner = studentDiets.some((d) => d.meal === 'dinner');
    const hasExercise = studentExercises.some((e) => e.studentId === student.id);
    const hasWeight = dWeightRecords.value.some((w) => w.studentId === student.id && w.date.startsWith(todayStr));

    const missing: string[] = [];
    if (!hasBreakfast) missing.push('早餐');
    if (!hasLunch) missing.push('中餐');
    if (!hasDinner) missing.push('晚餐');
    if (!hasWeight) missing.push('体重');
    if (!hasExercise) missing.push('运动');

    const rankInfo = rankedStudents.value.find((r) => r.studentId === student.id);

    return {
      ...student,
      isCompleted: missing.length === 0,
      missingTags: missing,
      totalScore: rankInfo?.totalScore || 0,
      rank: rankInfo?.rank || 0,
    };
  })
    .sort((a, b) => b.totalScore - a.totalScore),
);

const completedStudents = computed(() => studentsStatus.value.filter((s) => s.isCompleted));
const incompleteStudents = computed(() => studentsStatus.value.filter((s) => !s.isCompleted));

// 姓名或手机号搜索过滤（全局搜索，跨已打卡/未打卡两个 tab）
const searchKeyword = computed(() => searchQuery.value.trim().toLowerCase());
const matchStudent = (s: { name: string; phone: string }) =>
  s.name.toLowerCase().includes(searchKeyword.value) || s.phone.includes(searchQuery.value.trim());
const filteredComplete = computed(() => {
  if (!searchKeyword.value) return completedStudents.value;
  return completedStudents.value.filter(matchStudent);
});
const filteredIncomplete = computed(() => {
  if (!searchKeyword.value) return incompleteStudents.value;
  return incompleteStudents.value.filter(matchStudent);
});

const displayedStudents = computed(() => (activeTab.value === 'incomplete' ? filteredIncomplete.value : filteredComplete.value));
// 首页学员列表分页：默认前 20，更多点「加载更多」（切 tab 重置）
const { items: pagedStudents, hasMore, remaining, loadMore, reset: resetPagedStudents } = usePaged(displayedStudents, 20);
watch(activeTab, () => resetPagedStudents());
const emptyText = computed(() => {
  if (searchKeyword.value) return `未找到姓名包含「${searchQuery.value.trim()}」的学员`;
  return activeTab.value === 'incomplete' ? '所有学员已完成今日打卡' : '暂无学员完成全部打卡';
});

const openStudent = (id: string) => {
  store.setSelectedStudentId(id);
  store.setCurrentView('dietitian-student-detail');
};

const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col pb-24 font-sans bg-gradient-to-b from-[#FFF6EE] to-[#FFFDFB]">
    <div class="pt-[calc(env(safe-area-inset-top)+2.5rem)] px-6 pb-6">
      <div class="flex justify-end mb-2">
        <button @click="store.logout()" class="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1 text-xs bg-white/50 px-2 py-1 rounded-full backdrop-blur-sm">
          <LogOut class="h-3 w-3" /> 退出
        </button>
      </div>
      <div class="flex items-center space-x-4">
        <div class="h-14 w-14 rounded-full bg-[#FF976A] flex items-center justify-center shadow-md shrink-0">
          <Users class="h-7 w-7 text-white" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-gray-900">营养师您好，{{ store.user?.name || '专家' }}</h2>
          <p class="text-xs font-bold text-[#FF976A] uppercase tracking-wider mt-1">您当前负责管理 {{ campStudents.length }} 名学员</p>
        </div>
      </div>
    </div>

    <div class="flex-1 px-5 space-y-4 relative -mt-2">
      <!-- 营期切换 + 总排名入口 -->
      <div class="flex items-center gap-2 mb-1">
        <button
          @click="showCampPicker = true"
          class="flex items-center gap-1.5 px-3 py-2 bg-white/55 backdrop-blur-md rounded-xl border border-white/60 text-sm font-medium text-gray-700 active:bg-gray-50 shadow-sm"
        >
          {{ activeCampName }}
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
        <span class="text-xs text-gray-400">{{ campStudents.length }} 名学员</span>
        <button
          @click="store.setCurrentView('ranking')"
          class="ml-auto text-xs font-medium text-[#FF976A] active:opacity-70"
        >
          总排名 ›
        </button>
      </div>

      <!-- 学员打卡情况看板：首页可直接切换昨天/今天，点卡片看详情 -->
      <Card class="p-4 cursor-pointer border-0 shadow-sm bg-gradient-to-br from-[#FF976A]/12 to-white active:scale-[0.99] transition-transform" @click="openAttendanceBoard">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-lg bg-[#FF976A]/15 flex items-center justify-center shrink-0">
            <CalendarDays class="w-4 h-4 text-[#FF976A]" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-gray-900">学员打卡情况看板</div>
            <div class="text-[10px] text-gray-500">{{ attendanceDayLabel }} {{ attendanceDate }} · 打卡率 {{ attendanceSummary.rate }}%</div>
          </div>
          <!-- 昨天/今天切换：阻止冒泡，避免点切换时跳转详情 -->
          <div class="flex bg-gray-100 p-0.5 rounded-full shrink-0" @click.stop>
            <button @click="attendanceDay = 'yesterday'"
              :class="['px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors', attendanceDay === 'yesterday' ? 'bg-white text-[#FF976A] shadow-sm' : 'text-gray-500']">昨天</button>
            <button @click="attendanceDay = 'today'"
              :class="['px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors', attendanceDay === 'today' ? 'bg-white text-[#FF976A] shadow-sm' : 'text-gray-500']">今天</button>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-2 text-center">
          <div class="bg-white/70 rounded-xl py-2">
            <div class="text-lg font-black text-gray-900">{{ attendanceSummary.checked }}</div>
            <div class="text-[10px] text-gray-500">已打卡</div>
          </div>
          <div class="bg-white/70 rounded-xl py-2">
            <div class="text-lg font-black text-[#FF976A]">{{ attendanceSummary.unchecked }}</div>
            <div class="text-[10px] text-gray-500">未打卡</div>
          </div>
          <div class="bg-white/70 rounded-xl py-2">
            <div class="text-lg font-black text-[#07C160]">{{ attendanceSummary.all }}</div>
            <div class="text-[10px] text-gray-500">全项完成</div>
          </div>
          <div class="bg-white/70 rounded-xl py-2">
            <div class="text-lg font-black text-gray-900">{{ attendanceSummary.total }}</div>
            <div class="text-[10px] text-gray-500">应打卡</div>
          </div>
        </div>
        <div class="flex items-center justify-end mt-2 text-[10px] text-[#FF976A] font-bold">
          查看每位学员明细 <ChevronRight class="w-3.5 h-3.5" />
        </div>
      </Card>

      <!-- 运营总览：仅督导权限账号可见 -->
      <Card v-if="store.user?.supervisor" class="p-4 cursor-pointer border-0 shadow-sm bg-gradient-to-br from-[#1F4E79]/10 to-white active:scale-[0.99] transition-transform" @click="store.setCurrentView('supervisor-dashboard')">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#1F4E79]/10 flex items-center justify-center shrink-0">
            <BarChart3 class="w-4 h-4 text-[#1F4E79]" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-gray-900">运营总览</div>
            <div class="text-[10px] text-gray-500">营养师/教练批注情况与完成率</div>
          </div>
          <ChevronRight class="w-4 h-4 text-gray-400" />
        </div>
      </Card>

        <div class="flex bg-white/55 backdrop-blur-md p-1 rounded-xl shadow-sm mb-3 border border-white/60">
          <button
            :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'incomplete' ? 'bg-[#FF976A] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
            @click="activeTab = 'incomplete'"
          >
            <XCircle class="w-4 h-4" />
            未打卡 ({{ filteredIncomplete.length }})
          </button>
          <button
            :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'completed' ? 'bg-[#07C160] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
            @click="activeTab = 'completed'"
          >
            <CheckCircle class="w-4 h-4" />
            已打卡 ({{ filteredComplete.length }})
          </button>
        </div>

        <!-- 搜索框（未打卡/已打卡 tab 下方，支持姓名或手机号） -->
        <div class="relative mb-4">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索学员姓名或手机号"
            class="w-full pl-9 pr-9 py-2.5 bg-white/55 backdrop-blur-md border border-white/60 rounded-xl text-sm shadow-sm focus:outline-none focus:border-[#FF976A] transition-colors"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <template v-if="displayedStudents.length > 0">
            <div
              v-for="student in pagedStudents"
              :key="student.id"
              class="flex items-center justify-between p-4 rounded-2xl bg-white/55 backdrop-blur-md border border-white/60 cursor-pointer hover:border-[#FF976A] transition-colors shadow-sm mb-3"
              @click="openStudent(student.id)"
            >
              <div class="flex items-start space-x-3">
                <div class="h-10 w-10 rounded-full bg-[#FF976A]/10 flex items-center justify-center text-[#FF976A] shrink-0">
                  <UserCircle class="h-6 w-6" />
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                    {{ student.name || '未填写' }}
                    <span class="text-[10px] font-medium bg-[#FF976A]/10 text-[#FF976A] px-1.5 py-0.5 rounded">
                      总排名第{{ student.rank }}位 / {{ student.totalScore }}分
                    </span>
                  </div>
                  <div class="text-[10px] text-gray-500 mb-1.5">
                    {{ student.gender === 'male' ? '男' : '女' }} · {{ student.age }}岁 · {{ maskPhone(student.phone) }}
                  </div>
                  <div v-if="!student.isCompleted && student.missingTags.length > 0" class="flex flex-wrap gap-1">
                    <span v-for="tag in student.missingTags" :key="tag" class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-500">
                      未打卡{{ tag }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="text-[#FF976A] font-bold">›</div>
            </div>
            <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mb-1 text-xs font-bold text-[#FF976A] bg-white/55 backdrop-blur-md border border-[#FF976A]/30 rounded-xl active:bg-orange-50">
              加载更多（还有 {{ remaining }} 名学员）
            </button>
          </template>
          <div v-else class="text-center text-xs text-gray-400 py-4 rounded-2xl bg-white/55 backdrop-blur-md border border-white/60">{{ emptyText }}</div>
        </div>
    </div>

    <!-- Bottom Nav (Vant Tabbar) -->
    <VanTabbar class="custom-tabbar tabbar-orange" :model-value="0">
      <VanTabbarItem>
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-unannotated-list')" :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-config')" :badge="fulfillmentPendingCount > 0 ? fulfillmentPendingCount : undefined">
        <template #icon><Settings class="h-6 w-6" /></template>
        配置
      </VanTabbarItem>
    </VanTabbar>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round class="custom-popup">
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in availableCamps"
            :key="camp.id"
            @click="store.selectedCampId = camp.id; showCampPicker = false"
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
