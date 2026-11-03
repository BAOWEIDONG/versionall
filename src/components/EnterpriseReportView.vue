<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { useDeferred } from '../composables/useDeferred';
import { campDaysOf } from '../lib/camps';
import { NavBar, Card } from './ui';
import { Building2, Users, Flame, Sparkles, Download, ShieldCheck, HeartPulse, Dumbbell } from 'lucide-vue-next';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { generateDietitianSummary, generateEnterpriseReport } from '../lib/campReport';
import { exportReport } from '../lib/exportPDF';

const store = useAppStore();

// ─── 营期：仅展示当前营期，由首页全局营期控制（无本地切换） ───
const selectedCamp = computed(() => store.selectedCampId ? store.camps.find((c) => c.id === store.selectedCampId) : null);
const campDays = computed(() => campDaysOf(selectedCamp.value));

// 按当前营期过滤学员和记录
const campStudents = computed(() => store.selectedCampId ? store.getStudentsByCamp(store.selectedCampId) : store.getAllStudents());
const campDietRecords = computed(() => store.selectedCampId ? store.getCampDietRecords(store.selectedCampId) : store.dietRecords);
const campExerciseRecords = computed(() => store.selectedCampId ? store.getCampExerciseRecords(store.selectedCampId) : store.exerciseRecords);
const campWeightRecords = computed(() => store.selectedCampId ? store.getCampWeightRecords(store.selectedCampId) : store.weightRecords);

// 首次聚合计算较慢：用 useDeferred 延迟到首帧后空闲计算，先出骨架屏
const { data: summary, done: summaryReady } = useDeferred(() =>
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

// 企业汇报版（匿名聚合），summary 就绪后生成
const report = computed(() => summary.value ? generateEnterpriseReport(summary.value) : null);

const fmt = (v: number | null, digits = 1): string => (v === null ? '--' : v.toFixed(digits));
const fmtPct = (v: number | null): string => (v === null ? '--' : `${Math.round(v * 100)}%`);

// 导出（普通浏览器=PDF，微信=长图长按保存）
const exportRef = ref<HTMLElement | null>(null);
const handleExport = () => {
  if (exportRef.value) {
    exportReport(exportRef.value, `企业汇报_健康训练营_${new Date().toISOString().split('T')[0]}`);
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="企业汇报版" :on-back="store.goBack">
      <template #right>
        <button class="text-[#07C160] hover:bg-green-50 p-2 rounded-full transition-colors" @click="handleExport">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

    <!-- 当前营期（由首页全局切换） -->
    <div class="bg-white px-4 py-3 border-b border-gray-100 flex items-center gap-1.5">
      <div class="text-xs text-gray-500">当前营期</div>
      <div class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</div>
    </div>

    <!-- 首次聚合计算完成前的骨架屏 -->
    <div v-if="!summaryReady" class="p-4 space-y-4 animate-pulse">
      <div class="h-32 bg-gray-100 rounded-xl"></div>
      <div class="h-24 bg-gray-100 rounded-xl"></div>
      <div class="h-40 bg-gray-100 rounded-xl"></div>
      <div class="h-32 bg-gray-100 rounded-xl"></div>
    </div>

    <div v-if="summaryReady" ref="exportRef" class="p-4 space-y-4">
      <!-- 隐私提示（导出时隐藏） -->
      <div class="flex items-start gap-2 bg-[#07C160]/5 border border-[#07C160]/15 rounded-xl px-3 py-2.5" data-html2canvas-ignore>
        <ShieldCheck class="w-4 h-4 text-[#07C160] shrink-0 mt-0.5" />
        <p class="text-[11px] text-gray-500 leading-relaxed">
          本页仅含匿名聚合数据，无任何学员个人健康信息，可放心导出发送给企业 HR。
        </p>
      </div>

      <!-- 顶部品牌卡片 -->
      <div class="bg-gradient-to-br from-[#07C160] to-[#06A952] rounded-2xl p-5 text-white shadow-lg">
        <div class="flex items-center gap-2 mb-1">
          <Building2 class="w-5 h-5" />
          <h2 class="text-lg font-bold">健康训练营 · 结营汇报</h2>
        </div>
        <p class="text-xs opacity-85 mb-4">{{ report.campDays }} 天 · {{ report.totalStudents }} 名员工参营</p>
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="bg-white/15 rounded-lg py-3">
            <div class="text-2xl font-bold">{{ fmt(report.avgWeightLoss) }}<span class="text-xs font-normal">kg</span></div>
            <div class="text-[10px] opacity-80 mt-0.5">人均减重</div>
          </div>
          <div class="bg-white/15 rounded-lg py-3">
            <div class="text-2xl font-bold">{{ fmtPct(report.avgCompletionRate) }}</div>
            <div class="text-[10px] opacity-80 mt-0.5">平均打卡完成率</div>
          </div>
        </div>
      </div>

      <!-- 本期亮点 -->
      <Card v-if="report.highlights.length > 0">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Sparkles class="h-4 w-4 text-[#FF976A]" />
          本期亮点
        </h3>
        <div class="space-y-2.5">
          <div v-for="(h, i) in report.highlights" :key="i" class="flex items-start gap-2.5">
            <span class="w-5 h-5 rounded-full bg-[#07C160]/10 text-[#07C160] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{{ i + 1 }}</span>
            <p class="text-sm text-gray-700 leading-relaxed">{{ h }}</p>
          </div>
        </div>
      </Card>

      <!-- 参与度 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Users class="h-4 w-4 text-[#1677FF]" />
          参与情况
        </h3>
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.highCompletionCount }}<span class="text-xs text-gray-400 font-normal">/{{ report.totalStudents }}人</span></div>
            <div class="text-[10px] text-gray-500 mt-1">完成率≥80%的学员</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.streakChampionCount }}<span class="text-xs text-gray-400 font-normal">/{{ report.totalStudents }}人</span></div>
            <div class="text-[10px] text-gray-500 mt-1">坚持≥70%营期天数</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ fmt(report.avgCheckinDays, 0) }}<span class="text-xs text-gray-400 font-normal">天</span></div>
            <div class="text-[10px] text-gray-500 mt-1">人均打卡天数</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ fmt(report.avgLongestStreak, 0) }}<span class="text-xs text-gray-400 font-normal">天</span></div>
            <div class="text-[10px] text-gray-500 mt-1">人均最长连续打卡</div>
          </div>
        </div>
        <!-- 打卡类型细分 -->
        <div class="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 w-16 shrink-0">饮食打卡</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
              <div class="absolute left-0 top-0 h-full rounded-full bg-[#07C160]" :style="{ width: `${Math.min((report.avgDietCheckinDays ?? 0) / Math.max(report.campDays, 1) * 100, 100)}%` }"></div>
            </div>
            <span class="text-xs text-gray-600 w-14 text-right shrink-0">{{ fmt(report.avgDietCheckinDays, 0) }}天</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 w-16 shrink-0">运动打卡</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
              <div class="absolute left-0 top-0 h-full rounded-full bg-[#FF976A]" :style="{ width: `${Math.min((report.avgExerciseCheckinDays ?? 0) / Math.max(report.campDays, 1) * 100, 100)}%` }"></div>
            </div>
            <span class="text-xs text-gray-600 w-14 text-right shrink-0">{{ fmt(report.avgExerciseCheckinDays, 0) }}天</span>
          </div>
        </div>
      </Card>

      <!-- 健康改善成果 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <HeartPulse class="h-4 w-4 text-[#07C160]" />
          健康改善成果
        </h3>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">减重≥3kg 人数</span>
          <span class="text-sm font-bold text-gray-900">
            {{ report.weightGoalCount }} 人
            <span v-if="report.weightGoalRate !== null" class="text-xs text-[#07C160]">（{{ fmtPct(report.weightGoalRate) }}）</span>
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">体重下降的学员</span>
          <span class="text-sm font-bold text-gray-900">{{ report.weightLossCount }}/{{ report.weightRecordCount }} 人</span>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">体脂肪下降的学员</span>
          <span class="text-sm font-bold text-gray-900">
            {{ report.bodyFatLossCount }}/{{ report.bodyFatRecordCount }} 人
            <span v-if="report.bodyFatRecordCount > 0" class="text-xs text-[#07C160]">（{{ fmtPct(report.bodyFatLossCount / report.bodyFatRecordCount) }}）</span>
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">肌肉量增加的学员</span>
          <span class="text-sm font-bold text-gray-900">
            {{ report.muscleGainCount }}/{{ report.muscleRecordCount }} 人
            <span v-if="report.muscleRecordCount > 0" class="text-xs text-[#1677FF]">（{{ fmtPct(report.muscleGainCount / report.muscleRecordCount) }}）</span>
          </span>
        </div>
      </Card>

      <!-- 运动参与 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Dumbbell class="h-4 w-4 text-[#FF976A]" />
          运动参与
        </h3>
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ (report.totalExerciseMinutes / 60).toFixed(0) }}<span class="text-xs text-gray-400 font-normal">小时</span></div>
            <div class="text-[10px] text-gray-500 mt-1">全员累计运动时长</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.totalCheckinRecords }}</div>
            <div class="text-[10px] text-gray-500 mt-1">累计打卡总次数</div>
          </div>
        </div>
      </Card>

      <!-- 页脚 -->
      <div class="text-center py-3">
        <div class="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Flame class="w-3.5 h-3.5" />
          <span>健康训练营 · 专业营养师全程指导</span>
        </div>
        <p class="text-[10px] text-gray-300 mt-1">本报告仅含群体统计数据，不涉及任何个人健康信息</p>
      </div>
    </div>

    <!-- 底部无独立营期选择：服从首页全局营期 -->
  </div>
</template>
