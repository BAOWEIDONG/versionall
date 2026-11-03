<script setup lang="ts">
// 共享「每日运动趋势」卡片：标题 + 计算规则说明 + 趋势图 + 全部运动统计
// 三端(学员/营养师/教练)统一展示，保证口径一致
import { computed } from 'vue';
import type { ExerciseRecord } from '../types';
import DailyExerciseTrend from './DailyExerciseTrend.vue';
import { Card, ChartRulePopup } from './ui';
import { TrendingUp } from 'lucide-vue-next';

const props = defineProps<{ records: ExerciseRecord[] }>();

const totalCount = computed(() => props.records.length);
const totalDuration = computed(() => props.records.reduce((s, r) => s + r.duration, 0));
const qualifiedCount = computed(() => props.records.filter((r) => r.duration >= 40).length);
const avgDuration = computed(() => (totalCount.value > 0 ? Math.round(totalDuration.value / totalCount.value) : 0));
</script>

<template>
  <Card v-if="records.length > 0" class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
        <TrendingUp class="h-4 w-4 text-[#07C160]" />
        每日运动趋势
      </h3>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-gray-400">单位：分钟</span>
        <ChartRulePopup title="运动趋势计算规则">
          <p><span class="font-bold text-gray-900">每日总时长：</span>该日所有运动记录的时长之和（分钟），同日多次分别相加。</p>
          <p><span class="font-bold text-gray-900">达标（≥40min）：</span>单次时长≥40 分钟的记录数。与积分规则一致。</p>
          <p><span class="font-bold text-gray-900">交互：</span>点击柱形看当天记录；图上左右滑动切换前一天/后一天。</p>
        </ChartRulePopup>
      </div>
    </div>

    <DailyExerciseTrend :records="records" />

    <!-- 全部运动统计 -->
    <div class="pt-3 border-t border-gray-50 space-y-2">
      <div class="text-[10px] text-gray-400">全部运动统计：</div>
      <div class="grid grid-cols-4 gap-2 text-center">
        <div class="bg-gray-50 rounded-lg py-2">
          <div class="text-sm font-bold text-gray-900">{{ totalCount }}</div>
          <div class="text-[9px] text-gray-500">总次数</div>
        </div>
        <div class="bg-[#07C160]/5 rounded-lg py-2">
          <div class="text-sm font-bold text-[#07C160]">{{ totalDuration }}</div>
          <div class="text-[9px] text-gray-500">总时长(分)</div>
        </div>
        <div class="bg-[#EBF5FF]/60 rounded-lg py-2">
          <div class="text-sm font-bold text-[#1677FF]">{{ qualifiedCount }}</div>
          <div class="text-[9px] text-gray-500">达标次数</div>
        </div>
        <div class="bg-[#FFF4ED]/60 rounded-lg py-2">
          <div class="text-sm font-bold text-[#FF6B35]">{{ avgDuration }}</div>
          <div class="text-[9px] text-gray-500">平均时长</div>
        </div>
      </div>
    </div>
  </Card>
</template>