<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card, ChartRulePopup, StudentTabbar } from './ui';
import { Activity, TrendingDown, Dumbbell, Download, BookOpen, Trophy, ChevronRight } from 'lucide-vue-next';
import { Popup as VanPopup } from 'vant';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { generatePersonalJourney } from '../lib/journey';
import { campDaysOf } from '../lib/camps';
import { generateStudentReport } from '../lib/campReport';
import { exportReport } from '../lib/exportPDF';

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
const activeCamp = computed(() => store.camps.find((c) => c.id === activeCampId.value) || null);
const campDays = computed(() => campDaysOf(activeCamp.value));

// 按营期过滤打卡记录
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);

// 未读批注数（tabbar badge）
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);

// 获取当前学员数据
const studentId = computed(() => store.user?.id || 's1');
const studentName = computed(() => store.user?.name || '学员');
const studentGender = computed(() => store.user?.gender);

// 体重记录
const studentWeights = computed(() =>
  campWt.value.filter((r) => r.studentId === studentId.value),
);

// 饮食记录
const studentDiets = computed(() =>
  campDiet.value.filter((r) => r.studentId === studentId.value),
);

// 运动记录
const studentExercises = computed(() =>
  campEx.value.filter((r) => r.studentId === studentId.value),
);

// 生成个人历程数据
const journey = computed(() =>
  generatePersonalJourney(studentDiets.value, studentExercises.value, studentWeights.value, studentId.value),
);

// 生成成就（复用结营报告的成就计算）
const report = computed(() =>
  generateStudentReport(
    { id: studentId.value, name: studentName.value, gender: studentGender.value },
    store.metricConfigs,
    MOCK_STUDENT_METRIC_VALUES[studentId.value] || {},
    studentDiets.value,
    studentExercises.value,
    studentWeights.value,
    campDays.value,
  ),
);

// 体重趋势 SVG - 动态宽度，数据多时支持横向滚动
const CHART_MIN_WIDTH = 280;
const CHART_POINT_SPACING = 55; // 每个数据点占用的水平像素
const CHART_HEIGHT = 140; // SVG 高度（含标签）
const CHART_PAD_X = 20; // 左右边距
const CHART_PAD_TOP = 25; // 顶部留白（放数值标签）
const CHART_PLOT_HEIGHT = 70; // 折线区域高度
const CHART_PAD_BOTTOM = 25; // 底部留白（放日期标签）

const chartWidth = computed(() => {
  const n = journey.value.weightTrend.records.length;
  if (n <= 1) return CHART_MIN_WIDTH;
  const needed = CHART_PAD_X * 2 + (n - 1) * CHART_POINT_SPACING;
  return Math.max(CHART_MIN_WIDTH, needed);
});

// 体重 SVG 坐标计算辅助
const weightRange = computed(() => {
  const records = journey.value.weightTrend.records;
  if (records.length === 0) return { min: 0, max: 1 };
  const weights = records.map((r) => r.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  return { min: minW, max: maxW };
});
const weightCy = (weight: number) => {
  const range = weightRange.value.max - weightRange.value.min || 1;
  return CHART_PAD_TOP + CHART_PLOT_HEIGHT - ((weight - weightRange.value.min) / range) * CHART_PLOT_HEIGHT;
};
const weightCx = (i: number) => CHART_PAD_X + i * CHART_POINT_SPACING;

// SVG polyline points
const svgPoints = computed(() => {
  const records = journey.value.weightTrend.records;
  if (records.length === 0) return '';
  return records.map((r, i) => `${weightCx(i)},${weightCy(r.weight)}`).join(' ');
});

// 格式化日期（M.D）
const fmtDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

// 体重里程碑标注
const weightMilestones = computed(() => {
  const records = journey.value.weightTrend.records;
  if (records.length < 2) return null;
  const lowestW = Math.min(...records.map((r) => r.weight));
  const lowestIdx = records.findIndex((r) => r.weight === lowestW);
  return {
    lowestCx: weightCx(lowestIdx),
    lowestCy: weightCy(lowestW),
    lowestWeight: lowestW,
  };
});

// 每周完成率图表最大值
const weeklyMax = computed(() => Math.max(...journey.value.weeklyStats.map((w) => w.completionRate), 1));

// 格式化
const fmt = (v: number | null, digits = 1): string => v === null ? '--' : v.toFixed(digits);

// 导出（普通浏览器=PDF，微信=长图长按保存）
const exportRef = ref<HTMLElement | null>(null);
const exportPDF = () => {
  if (exportRef.value) {
    exportReport(exportRef.value, `个人历程_${studentName.value}_${new Date().toISOString().split('T')[0]}`);
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="个人历程" :on-back="store.goBack">
      <template #right>
        <button class="text-[#07C160] hover:bg-green-50 p-2 rounded-full transition-colors" @click="exportPDF">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

    <!-- 个人营期报告入口（置顶，由完结/数据指标自动生成） -->
    <div class="px-4 pt-4">
      <Card class="bg-gradient-to-r from-[#07C160]/10 to-[#07C160]/5 border-[#07C160]/20 cursor-pointer hover:shadow-md transition-shadow" @click="store.setCurrentView('camp-report')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#07C160]/15 flex items-center justify-center shrink-0">
            <Trophy class="w-5 h-5 text-[#07C160]" />
          </div>
          <div class="flex-1">
            <div class="font-bold text-gray-900 text-sm flex items-center gap-1.5">
              个人营期报告
            </div>
            <div class="text-xs text-gray-500 mt-0.5">
              报告由你的打卡与健康数据自动生成，可随时查看
            </div>
          </div>
          <ChevronRight class="w-4 h-4 text-[#07C160]" />
        </div>
      </Card>
    </div>

    <div ref="exportRef" class="p-4 space-y-4">
      <!-- 顶部概览卡片 -->
      <div class="bg-gradient-to-br from-[#07C160] to-[#06A952] rounded-2xl p-5 text-white shadow-lg">
        <div class="flex items-center gap-2 mb-4">
          <BookOpen class="w-6 h-6" />
          <h2 class="text-lg font-bold">{{ studentName }}的个人历程</h2>
        </div>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="bg-black/15 rounded-lg py-3">
            <div class="text-2xl font-bold drop-shadow">{{ journey.totalCheckinDays }}</div>
            <div class="text-[10px] mt-0.5">打卡天数</div>
          </div>
          <div class="bg-black/15 rounded-lg py-3">
            <div class="text-2xl font-bold drop-shadow">{{ journey.completeDays }}</div>
            <div class="text-[10px] mt-0.5">完成天数</div>
          </div>
          <div class="bg-black/15 rounded-lg py-3">
            <div class="text-2xl font-bold drop-shadow">{{ journey.currentStreak }}</div>
            <div class="text-[10px] mt-0.5">当前连续</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-3 text-center">
          <div class="bg-black/10 rounded-lg py-2">
            <span class="text-xs">最长连续 </span>
            <span class="text-sm font-bold drop-shadow">{{ journey.longestStreak }}</span>
            <span class="text-xs"> 天</span>
          </div>
          <div class="bg-black/10 rounded-lg py-2">
            <span class="text-xs">累计运动 </span>
            <span class="text-sm font-bold drop-shadow">{{ journey.totalExerciseDuration }}</span>
            <span class="text-xs"> 分钟</span>
          </div>
        </div>
      </div>

      <!-- 体重趋势 -->
      <Card>
        <div class="flex items-center justify-between mb-2 border-b pb-2">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
            <TrendingDown class="h-4 w-4 text-[#07C160]" />
            体重趋势
          </h3>
          <ChartRulePopup title="体重趋势计算规则">
            <p>记录每次体重打卡的体重值，按时间顺序连成折线。</p>
            <p><span class="font-bold text-gray-900">初始体重：</span>首条体重记录的值。</p>
            <p><span class="font-bold text-gray-900">最新体重：</span>最近一条体重记录的值。</p>
            <p><span class="font-bold text-gray-900">变化量：</span>最新体重 - 初始体重，负值表示体重下降（绿色），正值表示上升（橙色）。</p>
            <p><span class="font-bold text-gray-900">变化百分比：</span>变化量 ÷ 初始体重 × 100%。</p>
          </ChartRulePopup>
        </div>
        <template v-if="journey.weightTrend.records.length > 0">
          <div class="flex items-center justify-between mb-4">
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">初始</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(journey.weightTrend.startWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
            <div class="flex-1 mx-4 text-center">
              <div class="text-2xl font-bold" :class="journey.weightTrend.totalChange !== null && journey.weightTrend.totalChange < 0 ? 'text-[#07C160]' : 'text-orange-500'">
                {{ journey.weightTrend.totalChange !== null ? `${journey.weightTrend.totalChange > 0 ? '+' : ''}${journey.weightTrend.totalChange.toFixed(1)} kg` : '--' }}
              </div>
              <div class="text-xs text-gray-400 mt-1">{{ journey.weightTrend.changePercent !== null ? `${Math.abs(journey.weightTrend.changePercent).toFixed(1)}%` : '--' }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">最新</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(journey.weightTrend.endWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
          </div>
          <div v-if="svgPoints" class="w-full">
            <div class="overflow-x-auto overflow-y-hidden -mx-1 px-1" style="-webkit-overflow-scrolling: touch;">
              <svg :viewBox="`0 0 ${chartWidth} ${CHART_HEIGHT}`" :style="{ width: chartWidth > CHART_MIN_WIDTH ? `${chartWidth}px` : '100%', height: `${CHART_HEIGHT}px` }" preserveAspectRatio="xMidYMid meet" class="block">
                <defs>
                  <linearGradient id="weightGradJourney" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#07C160" stop-opacity="0.2" />
                    <stop offset="100%" stop-color="#07C160" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <!-- 渐变填充 -->
                <polygon :points="`${CHART_PAD_X},${CHART_PAD_TOP + CHART_PLOT_HEIGHT} ${svgPoints} ${weightCx(journey.weightTrend.records.length - 1)},${CHART_PAD_TOP + CHART_PLOT_HEIGHT}`" fill="url(#weightGradJourney)" />
                <!-- 折线 -->
                <polyline :points="svgPoints" fill="none" stroke="#07C160" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
                <!-- 数据点 + 数值标签 + 日期 -->
                <template v-for="(r, i) in journey.weightTrend.records" :key="i">
                  <circle :cx="weightCx(i)" :cy="weightCy(r.weight)" r="2.5" fill="#07C160" />
                  <!-- 体重数值 -->
                  <text :x="weightCx(i)" :y="weightCy(r.weight) - 6" text-anchor="middle" font-size="8" font-weight="bold" fill="#374151">{{ r.weight.toFixed(1) }}</text>
                  <!-- 日期 -->
                  <text :x="weightCx(i)" :y="CHART_HEIGHT - 6" text-anchor="middle" font-size="7" fill="#9CA3AF">{{ fmtDate(r.date) }}</text>
                </template>
                <!-- 历史最低点标注 -->
                <circle v-if="weightMilestones" :cx="weightMilestones.lowestCx" :cy="weightMilestones.lowestCy" r="4" fill="none" stroke="#07C160" stroke-width="1.5" />
              </svg>
            </div>
            <!-- 最低点标签 -->
            <div v-if="weightMilestones" class="flex items-center gap-1 mt-1 text-[9px] font-bold text-[#07C160]">
              <span class="inline-block w-2 h-2 rounded-full border border-[#07C160]"></span>
              历史最低 {{ weightMilestones.lowestWeight.toFixed(1) }} kg
            </div>
            <!-- 滑动提示 -->
            <div v-if="chartWidth > CHART_MIN_WIDTH" class="text-center text-[9px] text-gray-300 mt-1">← 左右滑动查看更多 →</div>
          </div>
        </template>
        <div v-else class="text-center text-sm text-gray-400 py-6">暂无体重记录</div>
      </Card>

      <!-- 每周打卡完成率 -->
      <Card v-if="journey.weeklyStats.length > 0">
        <div class="flex items-center justify-between mb-3 border-b pb-2">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
            <Activity class="h-4 w-4 text-[#1677FF]" />
            每周完成率
          </h3>
          <ChartRulePopup title="每周完成率计算规则">
            <p><span class="font-bold text-gray-900">周划分：</span>按自然周（周一至周日）分组，从首条打卡记录所在周开始，首周可能不足7天。</p>
            <p><span class="font-bold text-gray-900">完成天数：</span>同一天内三餐（早+午+晚）+ 运动 + 体重全部打卡才算"完成"。</p>
            <p><span class="font-bold text-gray-900">完成率：</span>完成天数 ÷ 该周天数 × 100%。</p>
            <p><span class="font-bold text-gray-900">颜色分级：</span>≥80% 绿色、50-79% 橙色、&lt;50% 灰色。</p>
          </ChartRulePopup>
        </div>
        <div class="flex items-end justify-between gap-2 h-32">
          <div
            v-for="week in journey.weeklyStats"
            :key="week.weekLabel"
            class="flex-1 flex flex-col items-center justify-end h-full"
          >
            <div class="text-[10px] font-bold text-gray-700 mb-1">{{ Math.round(week.completionRate * 100) }}%</div>
            <div
              class="w-full rounded-t-md transition-all min-h-[4px]"
              :class="week.completionRate >= 0.8 ? 'bg-[#07C160]' : week.completionRate >= 0.5 ? 'bg-[#FF976A]' : 'bg-gray-300'"
              :style="{ height: `${Math.max(week.completionRate / weeklyMax * 100, 4)}%` }"
            ></div>
            <div class="text-[10px] text-gray-500 mt-1">{{ week.weekLabel }}</div>
            <div class="text-[9px] text-gray-400">{{ week.completeDays }}/{{ week.totalDays }}天</div>
          </div>
        </div>
      </Card>

      <!-- 运动统计 -->
      <Card v-if="journey.exerciseBreakdown.length > 0">
        <div class="flex items-center justify-between mb-3 border-b pb-2">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
            <Dumbbell class="h-4 w-4 text-[#FF976A]" />
            运动统计
          </h3>
          <ChartRulePopup title="运动统计计算规则">
            <p><span class="font-bold text-gray-900">总时长：</span>所有运动记录的 duration 之和（分钟）。</p>
            <p><span class="font-bold text-gray-900">平均每次：</span>总时长 ÷ 运动总次数。</p>
            <p><span class="font-bold text-gray-900">类型分布：</span>按运动类型（跑步/游泳/力量训练等）分组统计，进度条长度 = 该类型时长 ÷ 总时长。</p>
            <p><span class="font-bold text-gray-900">排序：</span>按总时长降序排列。</p>
          </ChartRulePopup>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-4 text-center">
          <div class="bg-gray-50 rounded-lg py-3">
            <div class="text-xl font-bold text-gray-900">{{ journey.totalExerciseDuration }}</div>
            <div class="text-[10px] text-gray-500 mt-1">总时长（分钟）</div>
          </div>
          <div class="bg-[#FF976A]/5 rounded-lg py-3">
            <div class="text-xl font-bold text-[#FF976A]">{{ journey.avgExerciseDuration.toFixed(0) }}</div>
            <div class="text-[10px] text-gray-500 mt-1">平均每次（分钟）</div>
          </div>
        </div>
        <div class="space-y-2">
          <div
            v-for="(item, idx) in journey.exerciseBreakdown"
            :key="idx"
            class="flex items-center gap-3"
          >
            <span class="text-xs text-gray-700 w-16 shrink-0 truncate">{{ item.type }}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
              <div
                class="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#FF976A] to-orange-400"
                :style="{ width: `${(item.totalDuration / journey.totalExerciseDuration) * 100}%` }"
              ></div>
            </div>
            <span class="text-[10px] text-gray-500 w-20 text-right shrink-0">{{ item.totalDuration }}分钟 / {{ item.count }}次</span>
          </div>
        </div>
      </Card>
    </div>

    <StudentTabbar anchor="dashboard" print-hidden :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style>
@media print {
  .print\:hidden { display: none !important; }
  .custom-nav { display: none !important; }
  .custom-tabbar { display: none !important; }
  .van-overlay { display: none !important; }
  body { background: white !important; }
  .shadow-lg, .shadow-sm, .shadow-md { box-shadow: none !important; }
  .grid { break-inside: avoid; }
  .max-w-md { max-width: 100% !important; }
  .mx-auto { margin: 0 !important; }
  .fixed { position: static !important; }
  .overflow-y-auto { overflow: visible !important; }
  .pb-24 { padding-bottom: 1rem !important; }
  .pt-12 { padding-top: 0 !important; }
}
</style>
