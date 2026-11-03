<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { format } from 'date-fns';
import { computeDailyExerciseTrends, type ExerciseDayTrend } from '../lib/journey';
import type { ExerciseRecord } from '../types';
import { TrendingUp, Clock, Gauge, ListChecks, ChevronLeft, ChevronRight } from 'lucide-vue-next';

/**
 * 每日运动趋势图（学员/教练/营养师三端复用）
 *
 * props.records: 已按当前用户/学员过滤好的运动记录数组。
 * 内部按自然日聚合出"每日累计时长趋势"，支持：
 *   - 点击某天柱形 → 下方展示当天运动记录
 *   - 左右滑动 → 切换查看前一天/后一天
 *   - 单日统计：总时长 / 平均强度 / 打卡次数
 */
const props = defineProps<{ records: ExerciseRecord[] }>();

const INTENSITY_COLOR = ['#3B82F6', '#10B981', '#F59E0B', '#F97316', '#EF4444'];

const daily = computed<ExerciseDayTrend[]>(() => computeDailyExerciseTrends(props.records));
const maxDuration = computed(() => Math.max(...daily.value.map((d) => d.totalDuration), 1));

// 默认选中到最后一天（今天或最近一次打卡）
const selectedIdx = ref(daily.value.length - 1);
const selectedDay = computed<ExerciseDayTrend | null>(() => daily.value[selectedIdx.value] || null);
const selectedDateStr = computed(() => selectedDay.value?.date || '');

// 当前选中日的运动记录
const dayRecords = computed<ExerciseRecord[]>(() =>
  props.records
    .filter((r) => r.date.substring(0, 10) === selectedDateStr.value)
    .sort((a, b) => a.date.localeCompare(b.date)),
);

// 前进/后退一天（swipe + 按钮共用）
function move(delta: number) {
  const next = Math.max(0, Math.min(daily.value.length - 1, selectedIdx.value + delta));
  if (next === selectedIdx.value) return;
  selectedIdx.value = next;
  scrollBarToCenter(next);
}

// 点击某天
function selectDay(idx: number) {
  selectedIdx.value = idx;
  scrollBarToCenter(idx);
}

// 柱形滚动居中
const barWrapRef = ref<HTMLElement | null>(null);
function scrollBarToCenter(idx: number) {
  nextTick(() => {
    const wrap = barWrapRef.value;
    if (!wrap) return;
    const child = wrap.children[idx] as HTMLElement | undefined;
    if (child) {
      const w = wrap as HTMLElement;
      w.scrollTo({ left: child.offsetLeft - w.clientWidth / 2 + child.clientWidth / 2, behavior: 'auto' });
    }
  });
}

// 触摸滑动手势：手指拖动即实时切换选中日期（STEP px ≈ 一天；向右=前一天），松手即停，
// 纵向手势仍交给原生滚动。相比「拖动时无反馈、松手才整段换天+ smooth 滚动动画」，实时跟随不卡顿。
const STEP = 48;
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragStartIdx = ref(0);
const swiping = ref(false);
const onTouchStart = (e: TouchEvent) => {
  const t = e.touches[0];
  dragStartX.value = t.clientX;
  dragStartY.value = t.clientY;
  dragStartIdx.value = selectedIdx.value;
  swiping.value = false;
};
const onTouchMove = (e: TouchEvent) => {
  const t = e.touches[0];
  const dx = t.clientX - dragStartX.value;
  const dy = t.clientY - dragStartY.value;
  if (!swiping.value) {
    // 只有明显横向的手势才接管；纵向交给原生滚动（容器 touch-action: pan-y）
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) swiping.value = true;
    else return;
  }
  e.preventDefault();
  // 实时跟随手指切换日期：不再「松手猛跳 + smooth 动画」，避免滑动卡顿
  const steps = Math.round(dx / STEP);
  const target = Math.max(0, Math.min(daily.value.length - 1, dragStartIdx.value - steps));
  if (target !== selectedIdx.value) {
    selectedIdx.value = target;
    scrollBarToCenter(target);
  }
};
const onTouchEnd = () => {
  swiping.value = false; // 已在 move 中实时到位，无需松手再判
};

const fmtDay = (d: string) => format(new Date(d), 'M/d');
const intensityColor = (lv: number) => INTENSITY_COLOR[Math.min(4, Math.max(1, lv)) - 1];
const hasRecords = computed(() => dayRecords.value.length > 0);
</script>

<template>
  <div>
    <div v-if="daily.length === 0" class="py-6 text-center bg-gray-50 rounded-xl">
      <TrendingUp class="w-6 h-6 text-gray-300 mx-auto mb-2" />
      <p class="text-xs text-gray-400">暂无运动数据，完成打卡后生成每日趋势</p>
    </div>

    <div v-else class="relative select-none" style="touch-action: pan-y"
         @touchstart.passive.stop="onTouchStart" @touchmove.prevent="onTouchMove" @touchend.stop="onTouchEnd">
      <!-- 日期/手势提示 -->
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] text-gray-400">每日累计时长（分钟）</span>
        <span class="text-[10px] text-gray-400 flex items-center gap-1"><ChevronLeft class="w-3 h-3" />滑动切换日期<ChevronRight class="w-3 h-3" /></span>
      </div>

      <!-- 柱状图 -->
      <div ref="barWrapRef" class="flex gap-1.5 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div
          v-for="(d, idx) in daily"
          :key="d.date"
          @click="selectDay(idx)"
          class="flex flex-col items-center justify-end shrink-0 cursor-pointer group"
          :style="{ width: '34px' }"
        >
          <span class="text-[9px] font-bold mb-0.5"
                :class="idx === selectedIdx ? 'text-[#07C160]' : 'text-gray-300 group-hover:text-[#07C160]'">{{ d.totalDuration }}</span>
          <div
            class="w-6 rounded-t"
            :class="idx === selectedIdx ? 'bg-[#07C160]' : 'bg-[#07C160]/35 group-hover:bg-[#07C160]/60'"
            :style="{ height: `${Math.max((d.totalDuration / maxDuration) * 72, 3)}px` }"
          ></div>
          <span class="text-[8px] text-gray-400 mt-1 whitespace-nowrap"
                :class="idx === selectedIdx ? 'font-bold text-[#07C160]' : ''">{{ fmtDay(d.date) }}</span>
        </div>
      </div>

      <!-- 选中日统计 -->
      <div v-if="selectedDay" class="mt-2 pt-3 border-t border-gray-100 grid grid-cols-4 gap-2 text-center">
        <div class="bg-[#07C160]/5 rounded-lg py-2">
          <div class="text-sm font-bold text-[#07C160]">{{ selectedDay.totalDuration }}</div>
          <div class="text-[9px] text-gray-500">总时长(分)</div>
        </div>
        <div class="bg-[#FF976A]/5 rounded-lg py-2">
          <div class="text-sm font-bold text-[#FF976A]">{{ selectedDay.avgIntensity !== null ? selectedDay.avgIntensity.toFixed(1) : '--' }}</div>
          <div class="text-[9px] text-gray-500">平均强度(1-5)</div>
        </div>
        <div class="bg-blue-50 rounded-lg py-2">
          <div class="text-sm font-bold text-blue-600">{{ selectedDay.count }}</div>
          <div class="text-[9px] text-gray-500">打卡次数</div>
        </div>
        <div class="bg-gray-50 rounded-lg py-2">
          <div class="text-sm font-bold text-gray-900">{{ selectedDay.qualifiedCount }}</div>
          <div class="text-[9px] text-gray-500">达标(≥40min)</div>
        </div>
      </div>

      <!-- 选中日期头 -->
      <div class="flex items-center justify-between mt-3">
        <span class="text-xs font-bold text-gray-900">{{ format(new Date(selectedDay!.date), 'yyyy年M月d日') }} 运动记录</span>
        <div class="flex gap-1">
          <button @click="move(-1)" :disabled="selectedIdx <= 0"
                  class="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-all disabled:opacity-30">
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>
          <button @click="move(1)" :disabled="selectedIdx >= daily.length - 1"
                  class="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-all disabled:opacity-30">
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 当日记录 -->
      <div v-if="hasRecords" class="mt-2 space-y-2">
        <div v-for="r in dayRecords" :key="r.id" class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: intensityColor(r.intensity) }"></span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold text-gray-900 truncate">{{ r.type }} · {{ r.duration }} 分钟</div>
            <div class="text-[10px] text-gray-400">强度 Lv.{{ r.intensity }}</div>
          </div>
          <span v-if="r.notes" class="text-[10px] text-gray-400 truncate max-w-[40%]">{{ r.notes }}</span>
        </div>
      </div>
      <div v-else class="mt-2 py-3 text-center text-[10px] text-gray-400 bg-gray-50 rounded-lg">当天无运动记录</div>
    </div>
  </div>
</template>