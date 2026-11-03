<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { useDietitianCounts } from '../lib/dietitianCounts';
import { campDaysOf } from '../lib/camps';
import { useDeferred } from '../composables/useDeferred';
import { NavBar, Card, ChartRulePopup } from './ui';
import { BarChart3, TrendingDown, Users, Activity, ChevronRight, Download, UserCheck, Building2, FileText, Settings, Flame } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { generateDietitianSummary } from '../lib/campReport';
import { exportReport } from '../lib/exportPDF';
import type { DietitianCampSummary } from '../types';

const store = useAppStore();
// 底部 Tabbar 角标：批注=待批注数，配置=发放中心待发货数（各营养师页面共用口径）
const { unannotatedCount, fulfillmentPendingCount } = useDietitianCounts();

// ─── 营期：仅展示当前营期，由首页全局营期控制（无本地切换） ───
const selectedCamp = computed(() => store.selectedCampId ? store.camps.find((c) => c.id === store.selectedCampId) : null);
const campDays = computed(() => campDaysOf(selectedCamp.value));

// 按当前营期过滤学员和记录
const campStudents = computed(() => store.selectedCampId ? store.getStudentsByCamp(store.selectedCampId) : store.getAllStudents());
const campDietRecords = computed(() => store.selectedCampId ? store.getCampDietRecords(store.selectedCampId) : store.dietRecords);
const campExerciseRecords = computed(() => store.selectedCampId ? store.getCampExerciseRecords(store.selectedCampId) : store.exerciseRecords);
const campWeightRecords = computed(() => store.selectedCampId ? store.getCampWeightRecords(store.selectedCampId) : store.weightRecords);

// 生成结营统计（使用营期过滤后的数据）
// 首次进入全校聚合较慢：用 useDeferred 延迟到首帧后空闲计算，先出骨架屏，避免阻塞首绘
const { data: summary, done: summaryReady } = useDeferred<DietitianCampSummary>(() =>
  generateDietitianSummary(
    campStudents.value,
    store.metricConfigs,
    MOCK_STUDENT_METRIC_VALUES,
    campDietRecords.value,
    campExerciseRecords.value,
    campWeightRecords.value,
    campDays.value,
  ),
);

// 减重总人数及占比（分母=本营期参营学员总数：体重下降人数 / 参营学员总数）
const weightLossStats = computed(() => {
  if (!summary.value) return { count: 0, total: 0 };
  const count = summary.value.studentReports.filter((r) => (r.weightTrend.totalChange ?? 0) < 0).length;
  return { count, total: summary.value.totalStudents };
});

// 按分类分组的指标聚合（summary 未就绪时为空）
const metricCategories = computed(() => {
  if (!summary.value) return [];
  const cats = new Map<string, typeof summary.value.metricAggregates>();
  for (const m of summary.value.metricAggregates) {
    if (!cats.has(m.category)) cats.set(m.category, []);
    cats.get(m.category)!.push(m);
  }
  return Array.from(cats.entries());
});

// 打开学员详情
const openStudent = (id: string) => {
  store.setSelectedStudentId(id);
  store.setCurrentView('dietitian-student-detail');
};

// 导出（普通浏览器=PDF，微信=长图长按保存）
const exportRef = ref<HTMLElement | null>(null);
const exportPDF = () => {
  if (exportRef.value) {
    exportReport(exportRef.value, `结营统计_${new Date().toISOString().split('T')[0]}`);
  }
};

// 格式化数字
const fmt = (v: number | null, digits = 1): string => {
  if (v === null) return '--';
  return v.toFixed(digits);
};

// 格式化百分比
const fmtPct = (v: number | null): string => {
  if (v === null) return '--';
  return `${(v * 100).toFixed(0)}%`;
};

// 格式化变化量（带正负号）
const fmtChange = (v: number | null, unit = ''): string => {
  if (v === null) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
};

// 打卡频率（打卡完成率·有打卡就算）= 任意打卡天数 totalCheckinDays / 营期天数
const freqRate = (r: { checkinStats: { totalCheckinDays: number; campDays: number } }): number =>
  r.checkinStats.campDays > 0 ? r.checkinStats.totalCheckinDays / r.checkinStats.campDays : 0;
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="结营统计" :on-back="store.goBack">
      <template #right>
        <button class="text-[#FF976A] hover:bg-orange-50 p-2 rounded-full transition-colors" @click="exportPDF">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

    <!-- 当前营期（由首页全局切换） -->
    <div class="bg-white px-4 py-3 border-b border-gray-100 flex items-center gap-1.5">
      <div class="text-xs text-gray-500">当前营期</div>
      <div class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</div>
    </div>

    <!-- 首次聚合计算完成前的骨架屏，避免全校统计同步计算阻塞首帧 -->
    <div v-if="!summaryReady" class="p-4 space-y-4 animate-pulse">
      <div class="h-24 bg-gray-100 rounded-xl"></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="h-28 bg-gray-100 rounded-xl"></div>
        <div class="h-28 bg-gray-100 rounded-xl"></div>
        <div class="h-28 bg-gray-100 rounded-xl"></div>
        <div class="h-28 bg-gray-100 rounded-xl"></div>
      </div>
      <div class="h-40 bg-gray-100 rounded-xl"></div>
      <div class="h-40 bg-gray-100 rounded-xl"></div>
    </div>

    <div v-if="summaryReady" ref="exportRef" class="p-4 space-y-4">
      <!-- 企业汇报版入口 -->
      <Card
        class="bg-gradient-to-r from-[#07C160]/10 to-[#07C160]/5 border-[#07C160]/20 cursor-pointer hover:shadow-md transition-shadow"
        @click="store.setCurrentView('enterprise-report')"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#07C160]/15 flex items-center justify-center shrink-0">
            <Building2 class="w-5 h-5 text-[#07C160]" />
          </div>
          <div class="flex-1">
            <div class="font-bold text-gray-900 text-sm">企业汇报版</div>
            <div class="text-xs text-gray-500 mt-0.5">匿名聚合数据 + 本期亮点，可直接导出发给 HR</div>
          </div>
          <ChevronRight class="w-4 h-4 text-[#07C160]" />
        </div>
      </Card>

      <!-- 概览卡片 -->
      <div class="grid grid-cols-2 gap-3">
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <Users class="w-5 h-5 text-[#FF976A] mr-1" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ summary.totalStudents }}</div>
          <div class="text-xs text-gray-500 mt-1">参营学员</div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <UserCheck class="w-5 h-5 text-[#07C160] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#07C160]">{{ summary.validStudentCount }}</div>
          <div class="text-xs text-gray-500 mt-1">有效人数<span class="text-[10px] text-gray-400">（有前后体成分数据）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <TrendingDown class="w-5 h-5 text-[#07C160] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#07C160]">{{ fmtChange(summary.avgWeightChange, 'kg') }}</div>
          <div class="text-xs text-gray-500 mt-1">平均体重变化<span class="text-[10px] text-gray-400">（按有体重记录）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <Activity class="w-5 h-5 text-[#1677FF] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#1677FF]">{{ fmtPct(summary.avgCompletionRate) }}</div>
          <div class="text-xs text-gray-500 mt-1">平均完成率<span class="text-[10px] text-gray-400">（按全部学员）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <BarChart3 class="w-5 h-5 text-[#1677FF] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#1677FF]">{{ fmt(summary.avgCheckinDays, 0) }}</div>
          <div class="text-xs text-gray-500 mt-1">平均打卡天数<span class="text-[10px] text-gray-400">（按全部学员）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <Flame class="w-5 h-5 text-[#FF976A] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#FF976A]">{{ weightLossStats.count }}<span class="text-sm font-normal text-gray-400">/{{ weightLossStats.total }}</span></div>
          <div class="text-xs text-gray-500 mt-1">减重总人数<span class="text-[10px] text-gray-400">（{{ fmtPct(weightLossStats.total ? weightLossStats.count / weightLossStats.total : 0) }}占参营）</span></div>
        </Card>
      </div>

      <!-- 学员列表 -->
      <Card>
        <div class="flex items-center justify-between mb-4 border-b pb-2">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 class="h-4 w-4 text-[#FF976A]" />
            学员结营概况
          </h3>
          <ChartRulePopup title="学员结营概况计算规则" button-text="规则说明">
            <p><span class="font-bold text-gray-900">有效：</span>该学员有营前+营后体测数据（身体测量数据分类至少一项指标同时有前后数值），可作前后对比；仅有体重记录而无前后体测数据不标该标签。</p>
            <p><span class="font-bold text-gray-900">体重变化：</span>营期末体重 − 营期初体重（负值=减重），按有体重记录的学员统计。</p>
            <p><span class="font-bold text-gray-900">打卡率：</span>有打卡记录的天数 / 营期天数（当天有饮食/运动/体重任一项即算打卡一天，含部分打卡）。</p>
            <p><span class="font-bold text-gray-900">打卡全部完成率：</span>每天完成全部打卡（早+午+晚餐、运动、体重五项全齐）的天数 / 营期天数。</p>
            <p><span class="font-bold text-gray-900">进度条颜色：</span>统一绿色，条长表示打卡率（越长打卡越勤）。</p>
            <p><span class="font-bold text-gray-900">最长连续打卡：</span>营期内连续完成全部打卡（五项全齐，中断即重新计）的最长天数。</p>
            <p><span class="font-bold text-gray-900">交互：</span>点击学员整行跳转该学员详情。</p>
          </ChartRulePopup>
        </div>
        <div class="space-y-3">
          <div
            v-for="report in summary.studentReports"
            :key="report.studentId"
            class="p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
            @click="openStudent(report.studentId)"
          >
            <!-- 头部：姓名 / 性别 / 有效 + 体重变化 + 箭头 -->
            <div class="flex items-center gap-2">
              <span class="font-bold text-gray-900 text-sm truncate">{{ report.studentName }}</span>
              <span class="text-[10px] text-gray-500 shrink-0">{{ report.gender === 'male' ? '男' : '女' }}</span>
              <span
                v-if="report.metricChanges.filter(m => m.category === '身体测量数据' && typeof m.beforeValue === 'number' && typeof m.afterValue === 'number').length > 0"
                class="text-[9px] bg-[#07C160]/10 text-[#07C160] px-1.5 py-0.5 rounded font-medium shrink-0"
              >有效</span>
              <span class="flex items-center gap-0.5 text-[10px] text-gray-500 ml-auto shrink-0">
                <TrendingDown class="w-3 h-3" :class="report.summary.weightLossKg !== null && report.summary.weightLossKg > 0 ? 'text-[#07C160]' : 'text-gray-400'" />
                体重变化 <span class="text-gray-700 font-medium">{{ report.summary.weightLossKg !== null ? `${fmt(report.summary.weightLossKg)}kg` : '--' }}</span>
              </span>
              <ChevronRight class="w-4 h-4 text-gray-300 shrink-0" />
            </div>
            <!-- 打卡频率进度条：总打卡 X/Y天 + 打卡完成率Z%（有打卡就算） -->
            <div class="flex items-center gap-2 mt-2.5">
              <div class="flex-1 bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
                <div
                  class="absolute left-0 top-0 h-full rounded-full transition-all bg-[#07C160]"
                  :style="{ width: `${Math.min(freqRate(report) * 100, 100)}%` }"
                ></div>
              </div>
              <span class="text-[10px] text-gray-600 shrink-0">
                总打卡 {{ report.checkinStats.totalCheckinDays }}/{{ report.checkinStats.campDays }}天 · 打卡率{{ fmtPct(freqRate(report)) }}
              </span>
            </div>
            <!-- 打卡全部完成率（每天完成所有项目）+ 最长连续打卡 -->
            <div class="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
              <span>打卡全部完成率 <span class="text-gray-700 font-medium">{{ fmtPct(report.checkinStats.completionRate) }}</span><span class="text-gray-400">（每天完成所有项目）</span></span>
              <span class="ml-auto shrink-0">最长连续打卡<span class="text-gray-700 font-medium">{{ report.checkinStats.longestStreak }}</span>天</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 指标聚合统计 -->
      <Card v-for="[catName, metrics] in metricCategories" :key="catName">
        <div class="flex items-center justify-between mb-3 border-b pb-2">
          <h3 class="font-bold text-gray-900 flex items-center gap-2 text-sm">
            <Activity class="h-4 w-4 text-[#1677FF]" />
            {{ catName }}
          </h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-500 border-b border-gray-100">
                <th class="text-left py-2 font-medium">指标</th>
                <th class="text-right py-2 font-medium">营前(均)</th>
                <th class="text-right py-2 font-medium">营后(均)</th>
                <th class="text-right py-2 font-medium">变化</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in metrics"
                :key="m.configId"
                class="border-b border-gray-50 last:border-0"
              >
                <td class="py-2 text-left text-gray-900 font-medium">{{ m.name }}</td>
                <td class="py-2 text-right text-gray-600">
                  {{ m.avgBefore !== null ? m.avgBefore.toFixed(1) : '--' }}
                  <span class="text-gray-400">{{ m.unit }}</span>
                </td>
                <td class="py-2 text-right text-gray-600">
                  {{ m.avgAfter !== null ? m.avgAfter.toFixed(1) : '--' }}
                  <span class="text-gray-400">{{ m.unit }}</span>
                </td>
                <td class="py-2 text-right font-medium" :class="m.avgChange !== null && m.avgChange < 0 ? 'text-[#07C160]' : m.avgChange !== null && m.avgChange > 0 ? 'text-orange-500' : 'text-gray-400'">
                  {{ fmtChange(m.avgChange) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>

    <VanTabbar class="custom-tabbar tabbar-orange print:hidden" :model-value="2">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-unannotated-list')" :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem :badge="fulfillmentPendingCount > 0 ? fulfillmentPendingCount : undefined">
        <template #icon><Settings class="h-6 w-6" /></template>
        配置
      </VanTabbarItem>
    </VanTabbar>
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
  .overflow-x-auto { overflow: visible !important; }
  .pb-24 { padding-bottom: 1rem !important; }
  .pt-12 { padding-top: 0 !important; }
}
</style>
