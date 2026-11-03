<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { format } from 'date-fns';
import { Scale, TrendingUp, TrendingDown, Minus } from 'lucide-vue-next';
import { Card } from './index';
import type { WeightRecord } from '../../types';

const props = defineProps<{
  records: WeightRecord[]; // 按日期升序
  gradientId: string;      // SVG 渐变 id 需页面内唯一
}>();

const CW = 320, CH = 180;
const PL = 36, PR = 14, PT = 14, PB = 26;
const PW = CW - PL - PR;
const PH = CH - PT - PB;

const weightStats = computed(() => {
  const recs = props.records;
  if (recs.length === 0) return null;
  const weights = recs.map((r) => r.weight);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const change = parseFloat((last - first).toFixed(1));
  const changePercent = first !== 0 ? parseFloat(((change / Math.abs(first)) * 100).toFixed(1)) : null;
  return { first, last, change, changePercent, min: Math.min(...weights), max: Math.max(...weights), count: weights.length };
});

const yDomain = computed(() => {
  const weights = props.records.map((r) => r.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const pad = range * 0.2;
  return { yMin: minW - pad, yMax: maxW + pad };
});

const chartPoints = computed(() => {
  const recs = props.records;
  if (recs.length === 0) return [];
  const { yMin, yMax } = yDomain.value;
  return recs.map((r, i) => {
    const x = recs.length === 1 ? PL + PW / 2 : PL + (i / (recs.length - 1)) * PW;
    const y = PT + PH - ((r.weight - yMin) / (yMax - yMin)) * PH;
    return { x, y, weight: r.weight, date: r.date };
  });
});

const linePath = computed(() =>
  chartPoints.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
);

const areaPath = computed(() => {
  const pts = chartPoints.value;
  if (pts.length === 0) return '';
  const baseY = PT + PH;
  return `M ${pts[0].x.toFixed(1)} ${baseY} ` +
    pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} Z`;
});

const yLabels = computed(() => {
  if (props.records.length === 0) return [];
  const { yMin, yMax } = yDomain.value;
  return Array.from({ length: 4 }, (_, i) => {
    const val = yMin + (i / 3) * (yMax - yMin);
    const y = PT + PH - (i / 3) * PH;
    return { value: val.toFixed(1), y };
  });
});

const xLabels = computed(() => {
  const pts = chartPoints.value;
  if (pts.length === 0) return [];
  const step = Math.ceil(pts.length / 6);
  const labels: { x: number; label: string }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    labels.push({ x: pts[i].x, label: format(new Date(pts[i].date.replace(' ', 'T')), 'M/d') });
  }
  const last = pts[pts.length - 1];
  if (labels.length > 0 && labels[labels.length - 1].x !== last.x) {
    labels.push({ x: last.x, label: format(new Date(last.date.replace(' ', 'T')), 'M/d') });
  }
  return labels;
});

// Chart interaction: touch/click to slide and inspect data points
const selectedIdx = ref<number | null>(null);
const hoveredIdx = ref<number | null>(null);
const activeIdx = computed(() => selectedIdx.value ?? hoveredIdx.value);

const selectedPoint = computed(() => {
  const idx = activeIdx.value;
  if (idx === null || !chartPoints.value[idx]) return null;
  const pt = chartPoints.value[idx];
  const recs = props.records;
  const rec = recs[idx];
  const prevWeight = idx > 0 ? recs[idx - 1].weight : null;
  const change = prevWeight !== null ? parseFloat((pt.weight - prevWeight).toFixed(1)) : null;
  return {
    ...pt,
    fullDate: rec ? format(new Date(rec.date.replace(' ', 'T')), 'MM月dd日 HH:mm') : '',
    change,
    prevWeight,
  };
});

function clientToSvgX(clientX: number, svgEl: SVGSVGElement): number {
  const rect = svgEl.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * CW;
}

function findNearestPoint(svgX: number): number | null {
  const pts = chartPoints.value;
  if (pts.length === 0) return null;
  let minDist = Infinity;
  let nearest = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i].x - svgX);
    if (d < minDist) { minDist = d; nearest = i; }
  }
  return nearest;
}

function handleChartClick(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const idx = findNearestPoint(clientToSvgX(e.clientX, svg));
  if (idx !== null) selectedIdx.value = idx;
}

function handleChartTouchStart(e: TouchEvent) {
  e.preventDefault();
  const svg = e.currentTarget as SVGSVGElement;
  if (e.touches.length > 0) {
    const idx = findNearestPoint(clientToSvgX(e.touches[0].clientX, svg));
    if (idx !== null) selectedIdx.value = idx;
  }
}

function handleChartTouchMove(e: TouchEvent) {
  e.preventDefault();
  const svg = e.currentTarget as SVGSVGElement;
  if (e.touches.length > 0) {
    const idx = findNearestPoint(clientToSvgX(e.touches[0].clientX, svg));
    if (idx !== null) selectedIdx.value = idx;
  }
}

// 暴露常量给模板
const consts = { CW, CH, PL, PR, PT, PB, PH };

// 手势改命令式绑定（Vue 压缩器会错绑模板 passive touch 事件致滑动失灵，见 feedback-tab-swipe-prod-build）
const chartSvgRef = ref<SVGSVGElement | null>(null);
const onChartTouchStart = (e: TouchEvent) => handleChartTouchStart(e);
const onChartTouchMove = (e: TouchEvent) => handleChartTouchMove(e);
onMounted(() => {
  const svg = chartSvgRef.value;
  if (!svg) return;
  // 处理函数内调用 preventDefault，必须显式 passive:false
  svg.addEventListener('touchstart', onChartTouchStart, { passive: false });
  svg.addEventListener('touchmove', onChartTouchMove, { passive: false });
});
onUnmounted(() => {
  const svg = chartSvgRef.value;
  if (!svg) return;
  svg.removeEventListener('touchstart', onChartTouchStart);
  svg.removeEventListener('touchmove', onChartTouchMove);
});
</script>

<template>
  <Card class="p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-gray-900 text-sm flex items-center gap-1.5">
        <Scale class="w-4 h-4 text-[#07C160]" />
        体重趋势
      </h3>
      <div v-if="weightStats" class="flex items-center gap-1 text-xs">
        <component
          :is="weightStats.change < 0 ? TrendingDown : weightStats.change > 0 ? TrendingUp : Minus"
          :class="['w-3.5 h-3.5', weightStats.change < 0 ? 'text-[#07C160]' : weightStats.change > 0 ? 'text-orange-500' : 'text-gray-400']"
        />
        <span :class="weightStats.change < 0 ? 'text-[#07C160]' : weightStats.change > 0 ? 'text-orange-500' : 'text-gray-400'">
          {{ weightStats.change > 0 ? '+' : '' }}{{ weightStats.change }}kg
          <span v-if="weightStats.changePercent !== null" class="text-gray-400 ml-0.5">({{ weightStats.changePercent > 0 ? '+' : '' }}{{ weightStats.changePercent }}%)</span>
        </span>
      </div>
    </div>

    <div class="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <svg :viewBox="`0 0 ${consts.CW} ${consts.CH}`" class="w-full touch-none select-none"
           style="min-width: 280px;" preserveAspectRatio="xMidYMid meet"
           @click="handleChartClick"
           ref="chartSvgRef">
        <defs>
          <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#07C160" stop-opacity="0.2" />
            <stop offset="100%" stop-color="#07C160" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Y-axis labels -->
        <text v-for="(yl, i) in yLabels" :key="`yl-${i}`" :x="consts.PL - 6" :y="yl.y + 3" text-anchor="end" class="fill-gray-400" style="font-size: 9px">{{ yl.value }}</text>

        <!-- Horizontal grid lines -->
        <line v-for="(yl, i) in yLabels" :key="`gl-${i}`" :x1="consts.PL" :y1="yl.y" :x2="consts.CW - consts.PR" :y2="yl.y" stroke="#f0f0f0" stroke-width="0.5" />

        <!-- Area fill -->
        <path v-if="areaPath" :d="areaPath" :fill="`url(#${gradientId})`" />

        <!-- Line -->
        <path v-if="linePath" :d="linePath" fill="none" stroke="#07C160" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

        <!-- Vertical guide line (active point) -->
        <line v-if="activeIdx !== null && chartPoints[activeIdx]"
              :x1="chartPoints[activeIdx].x" :y1="consts.PT"
              :x2="chartPoints[activeIdx].x" :y2="consts.PT + consts.PH"
              stroke="#07C160" stroke-width="1" stroke-dasharray="3 3" opacity="0.4" />

        <!-- Data points -->
        <circle v-for="(pt, i) in chartPoints" :key="`pt-${i}`"
                :cx="pt.x" :cy="pt.y"
                :r="activeIdx === i ? 5.5 : 3"
                :fill="activeIdx === i ? '#07C160' : '#fff'"
                stroke="#07C160" stroke-width="1.5"
                class="cursor-pointer transition-all"
                @mouseenter="hoveredIdx = i"
                @mouseleave="hoveredIdx = null" />

        <!-- X-axis labels -->
        <text v-for="(xl, i) in xLabels" :key="`xl-${i}`" :x="xl.x" :y="consts.CH - 8" text-anchor="middle" class="fill-gray-400" style="font-size: 9px">{{ xl.label }}</text>

        <!-- Tooltip for active point -->
        <g v-if="activeIdx !== null && chartPoints[activeIdx]">
          <rect :x="Math.max(consts.PL, Math.min(consts.CW - consts.PR - 72, chartPoints[activeIdx].x - 36))"
                :y="chartPoints[activeIdx].y - 38" width="72" height="28" rx="5"
                fill="#1e293b" />
          <text :x="Math.max(consts.PL + 36, Math.min(consts.CW - consts.PR - 36, chartPoints[activeIdx].x))"
                :y="chartPoints[activeIdx].y - 24" text-anchor="middle"
                font-size="11" fill="#fff" font-weight="bold">
            {{ chartPoints[activeIdx].weight }}kg
          </text>
          <text :x="Math.max(consts.PL + 36, Math.min(consts.CW - consts.PR - 36, chartPoints[activeIdx].x))"
                :y="chartPoints[activeIdx].y - 14" text-anchor="middle"
                font-size="8" fill="rgba(255,255,255,0.7)">
            {{ format(new Date(chartPoints[activeIdx].date.replace(' ', 'T')), 'M/d') }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Selected point detail card -->
    <div v-if="selectedPoint" class="mt-3 p-3 rounded-xl bg-[#07C160]/5 border border-[#07C160]/10 flex items-center justify-between">
      <div>
        <div class="text-[10px] text-gray-500 mb-0.5">打卡时间</div>
        <div class="text-xs font-medium text-gray-700">{{ selectedPoint.fullDate }}</div>
      </div>
      <div class="text-right">
        <div class="text-[10px] text-gray-500 mb-0.5">体重</div>
        <div class="text-sm font-bold text-[#07C160]">{{ selectedPoint.weight }} kg</div>
      </div>
      <div v-if="selectedPoint.change !== null" class="text-right">
        <div class="text-[10px] text-gray-500 mb-0.5">较上次</div>
        <div :class="['text-sm font-bold', selectedPoint.change < 0 ? 'text-[#07C160]' : selectedPoint.change > 0 ? 'text-orange-500' : 'text-gray-500']">
          {{ selectedPoint.change > 0 ? '+' : '' }}{{ selectedPoint.change }} kg
        </div>
      </div>
    </div>

    <!-- Hint text -->
    <p v-if="selectedPoint === null && records.length >= 2" class="text-center text-[10px] text-gray-400 mt-2">滑动或点击曲线查看详细数据</p>
  </Card>
</template>
