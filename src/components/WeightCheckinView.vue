<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { celebrateCheckin, celebrateReward } from '../lib/confetti';
import { calculateStreak } from '../lib/streak';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { NavBar, Button, Card, ChartRulePopup, CheckinComments } from './ui';
import { recordComments } from '../lib/comments';
import { Scale, TrendingUp, TrendingDown, Minus, Camera, X, ChevronDown, Target, Pencil } from 'lucide-vue-next';
import { showToast } from 'vant';
import { formatDateTime } from '../lib/utils';
import { thumbUrl } from '../lib/imageThumb';
import { useDateGrouping } from '../composables/useDateGrouping';
import { useTabSwipe } from '../lib/useTabSwipe';

const store = useAppStore();

// ─── Tab 结构：打卡 / 趋势 / 记录 ────────────────────────
const activeTab = ref<'checkin' | 'trend' | 'records'>('checkin');
const sheetRoot = ref<HTMLElement | null>(null);
useTabSwipe(sheetRoot, activeTab, ['checkin', 'trend', 'records']);

// ─── 营期切换（多期时显示） ──────────────────────────────
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

// 按营期过滤打卡记录
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campRewardTiers = computed(() => activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers);

const weight = ref('');
const photos = ref<string[]>([]);
const photoInputRef = ref<HTMLInputElement | null>(null);

// 照片上传区折叠（默认收起，减少视觉干扰）
const showPhotoUpload = ref(true);

// 目标体重
const targetWeight = ref(store.user?.targetWeight ? String(store.user.targetWeight) : '');
const editingTarget = ref(false);
const saveTarget = () => {
  const v = parseFloat(targetWeight.value);
  if (!isNaN(v) && v > 20 && v < 300 && store.user) {
    store.setUser({ ...store.user, targetWeight: parseFloat(v.toFixed(1)) });
  } else if (targetWeight.value === '' && store.user) {
    const u = { ...store.user };
    delete u.targetWeight;
    store.setUser(u);
  }
  editingTarget.value = false;
};

const handlePhotoSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 6 - photos.value.length;
  try {
    const compressed = await Promise.all(files.slice(0, remaining).map((f) => compressImage(f)));
    const urls = await Promise.all(compressed.map((f) => uploadFile(f)));
    photos.value = [...photos.value, ...urls];
  } catch {
    showToast({ message: '照片上传失败，请重试', position: 'top', duration: 2500 });
  }
  (e.target as HTMLInputElement).value = '';
};

const removePhoto = (index: number) => {
  photos.value = photos.value.filter((_, i) => i !== index);
};

// 刚提交打卡后跳过 watch 回填，避免输入框被覆盖
const justSubmitted = ref(false);

watch(
  [() => campWt.value, () => store.user],
  () => {
    if (justSubmitted.value) {
      justSubmitted.value = false;
      return;
    }
    const myRecords = campWt.value.filter((r) => r.studentId === store.user?.id);
    if (myRecords.length > 0) {
      const latest = [...myRecords].sort((a, b) => b.date.localeCompare(a.date))[0];
      weight.value = latest.weight.toString();
    } else if (store.user?.weight) {
      weight.value = store.user.weight.toString();
    }
  },
  { immediate: true },
);

const handleSubmit = () => {
  const val = parseFloat(weight.value);
  if (isNaN(val) || val <= 0 || val > 300) {
    showToast({ message: '请输入合理的体重数值（例如: 65.5）', position: 'top', duration: 2500 });
    return;
  }
  if (photos.value.length === 0) {
    showToast({ message: '请上传体重打卡照片', position: 'top', duration: 2500 });
    return;
  }

  justSubmitted.value = true;

  // 打卡前连续天数
  const streakBefore = calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id);

  store.addWeightRecord({
    id: `w_${Date.now()}`,
    studentId: store.user?.id || 's1',
    campId: activeCampId.value || undefined,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    weight: parseFloat(val.toFixed(1)),
    photos: photos.value.length > 0 ? photos.value : undefined,
  });

  // 仅当连续天数增长且匹配档位且未领取时，触发奖励庆祝
  const streakAfter = calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id);
  const tierMatched = streakAfter.currentStreak > streakBefore.currentStreak
    ? campRewardTiers.value.find(t => t.requiredDays === streakAfter.currentStreak)
    : undefined;
  const claims = activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims;
  const alreadyClaimed = tierMatched
    ? claims.some(c => c.tierId === tierMatched.id && c.studentId === store.user?.id)
    : false;
  if (tierMatched && !alreadyClaimed) {
    celebrateReward(tierMatched.name);
  } else {
    celebrateCheckin('weight');
  }

  store.justCheckedIn = true;
  weight.value = '';
  photos.value = [];
  showPhotoUpload.value = false;
};

// ---- Weight trend chart ----
const sortedRecords = computed(() =>
  [...campWt.value]
    .filter((r) => r.studentId === store.user?.id)
    .sort((a, b) => a.date.localeCompare(b.date))
);

// 按日期分组的历史记录
const reversedRecords = computed(() => [...sortedRecords.value].reverse());
const { grouped: groupedHistory, toggleDate, isExpanded } = useDateGrouping(reversedRecords, { defaultExpandToday: false });

// 学员展开未读批注所在日期分组 → 该分组内批注标记为已读（真正看到才算已读）
const markGroupCommentsRead = (date: string) => {
  const group = groupedHistory.value.find((g) => g.date === date);
  if (!group) return;
  group.records.forEach((r) => {
    if (r.dietitianComment && !r.commentRead) {
      store.updateWeightRecord(r.id, { commentRead: true });
    }
  });
};

const handleToggleDate = (date: string) => {
  const willExpand = !isExpanded(date);
  toggleDate(date);
  if (willExpand) markGroupCommentsRead(date);
};
// 已展开分组内新入批注也自动标已读（否则红点残留到下次收起再展开才消失）
watch(groupedHistory, () => {
  groupedHistory.value.forEach((g) => {
    if (!isExpanded(g.date)) return;
    g.records.forEach((r) => {
      if (r.dietitianComment && !r.commentRead) store.updateWeightRecord(r.id, { commentRead: true });
    });
  });
});

// 记录 Tab 默认全部收起：未读批注在展开其日期分组时才标记已读（真正看到才算已读）

// 手势改命令式绑定（Vue 压缩器会错绑模板 passive touch 事件致滑动失灵，见 feedback-tab-swipe-prod-build）
const chartSvgRef = ref<SVGSVGElement | null>(null);
const onChartTouchStart = (e: TouchEvent) => {
  e.stopPropagation(); // 原模板 @touchstart.stop：阻隔冒泡，避免触发 useTabSwipe 换 tab
  handleChartTouchStart(e);
};
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

// 消息中心跳转：切到记录Tab，自动展开目标日期并滚动到对应记录
onMounted(() => {
  if (store.selectedDateStr) {
    const targetDate = store.selectedDateStr;
    store.setSelectedDateStr(null);
    activeTab.value = 'records';
    if (!isExpanded(targetDate)) toggleDate(targetDate);
    markGroupCommentsRead(targetDate);
    // 双 nextTick 确保 DOM 展开渲染完成后再滚动
    nextTick(() => {
      nextTick(() => {
        const el = document.getElementById(`weight-group-${targetDate}`);
        if (el) el.scrollIntoView({ block: 'start' });
      });
    });
  }
});

const weightStats = computed(() => {
  const recs = sortedRecords.value;
  if (recs.length === 0) return null;
  const weights = recs.map(r => r.weight);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const change = parseFloat((last - first).toFixed(1));
  return {
    first, last, change,
    min: Math.min(...weights),
    max: Math.max(...weights),
    count: weights.length,
  };
});

// Chart geometry
const CW = 320, CH = 180;
const PL = 36, PR = 14, PT = 14, PB = 26;
const PW = CW - PL - PR;
const PH = CH - PT - PB;

const chartPoints = computed(() => {
  const recs = sortedRecords.value;
  if (recs.length === 0) return [];
  const weights = recs.map(r => r.weight);
  // 目标体重也纳入 Y 轴范围，保证目标线可见
  const target = store.user?.targetWeight;
  if (target) weights.push(target);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const pad = range * 0.2;
  const yMin = minW - pad;
  const yMax = maxW + pad;

  return recs.map((r, i) => {
    const x = recs.length === 1
      ? PL + PW / 2
      : PL + (i / (recs.length - 1)) * PW;
    const y = PT + PH - ((r.weight - yMin) / (yMax - yMin)) * PH;
    return { x, y, weight: r.weight, label: format(new Date(r.date.replace(' ', 'T')), 'M/d'), recordId: r.id, hasComment: !!r.dietitianComment, unread: !!r.dietitianComment && !r.commentRead };
  });
});

// 目标体重线的 Y 坐标
const targetLineY = computed(() => {
  const target = store.user?.targetWeight;
  if (!target) return null;
  const recs = sortedRecords.value;
  if (recs.length === 0) return null;
  const weights = recs.map(r => r.weight);
  weights.push(target);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const pad = range * 0.2;
  const yMin = minW - pad;
  const yMax = maxW + pad;
  return PT + PH - ((target - yMin) / (yMax - yMin)) * PH;
});

const linePath = computed(() =>
  chartPoints.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
);

const areaPath = computed(() => {
  const pts = chartPoints.value;
  if (pts.length === 0) return '';
  const baseY = PT + PH;
  return `M ${pts[0].x.toFixed(1)} ${baseY} ` +
    pts.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} Z`;
});

const yLabels = computed(() => {
  const recs = sortedRecords.value;
  if (recs.length === 0) return [];
  const weights = recs.map(r => r.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const pad = range * 0.2;
  const yMin = minW - pad;
  const yMax = maxW + pad;
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
    labels.push({ x: pts[i].x, label: pts[i].label });
  }
  const last = pts[pts.length - 1];
  if (labels.length > 0 && labels[labels.length - 1].x !== last.x) {
    labels.push({ x: last.x, label: last.label });
  }
  return labels;
});

const selectedIdx = ref<number | null>(null);
const hoveredIdx = ref<number | null>(null);
const activeIdx = computed(() => selectedIdx.value ?? hoveredIdx.value);

// 选中的数据点详情
const selectedPoint = computed(() => {
  const idx = activeIdx.value;
  if (idx === null || !chartPoints.value[idx]) return null;
  const pt = chartPoints.value[idx];
  const recs = sortedRecords.value;
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

// 图表点联动：滚动定位到对应打卡记录（并展开其所在日期分组）
const recordRefs = new Map<string, HTMLElement>();
const setRecordRef = (id: string, el: any) => {
  if (el) recordRefs.set(id, el as HTMLElement);
};
const scrollToRecord = (recordId: string) => {
  const rec = campWt.value.find((r) => r.id === recordId);
  if (!rec) return;
  activeTab.value = 'records';
  const date = rec.date.substring(0, 10);
  if (!isExpanded(date)) handleToggleDate(date);
  setTimeout(() => {
    const el = recordRefs.get(recordId);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('record-highlight');
      setTimeout(() => el.classList.remove('record-highlight'), 1600);
    }
  }, 80);
};

// 将客户端坐标转换为 SVG 坐标系下的 x
function clientToSvgX(clientX: number, svgEl: SVGSVGElement): number {
  const rect = svgEl.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * CW;
}

// 找到最近的点的索引
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

// 点击/触摸图表区域 -> 选中最近的数据点
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
</script>

<template>
  <div ref="sheetRoot" class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe">
    <NavBar title="体重打卡" :on-back="store.goBack" />

    <!-- Tab 切换：打卡 / 趋势 / 记录（液态玻璃胶囊） -->
    <div class="sticky top-14 z-20 px-4 pt-3 pb-1">
      <div class="seg-tabs">
        <button
          v-for="tab in ([{ id: 'checkin', label: '打卡' }, { id: 'trend', label: '趋势' }, { id: 'records', label: '记录' }] as const)"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['seg-tab seg-tab-blue', activeTab === tab.id ? 'active' : '']"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- ══════════ Tab 1: 打卡 ══════════ -->
    <div v-show="activeTab === 'checkin'" class="p-4 space-y-4 pb-32">
      <div class="text-center pt-2 pb-1">
        <div class="text-sm text-gray-500">记录每日体重变化，见证慢病改善</div>
      </div>

      <Card class="p-4">
        <div class="flex items-center justify-center space-x-2 border-b border-gray-200 pb-4">
          <input
            type="number"
            inputmode="decimal"
            step="0.1"
            :value="weight"
            @input="weight = ($event.target as HTMLInputElement).value"
            class="text-5xl font-light text-center text-gray-900 focus:outline-none w-40 bg-transparent"
            placeholder="0.0"
          />
          <span class="text-xl font-medium text-gray-400 pb-1">kg</span>
        </div>
      </Card>

      <!-- Photo upload (折叠) -->
      <Card class="p-4 space-y-3">
        <button @click="showPhotoUpload = !showPhotoUpload" class="w-full flex items-center justify-between">
          <span class="text-sm font-bold text-gray-700 flex items-center gap-1.5">
            <Camera class="w-4 h-4 text-gray-400" />
            打卡照片 <span class="text-[10px] text-red-500 font-normal">(必填)</span>
          </span>
          <span class="text-xs text-[#1677FF] font-medium">{{ showPhotoUpload ? '收起' : photos.length > 0 ? `已选 ${photos.length} 张` : '添加' }}</span>
        </button>
        <div v-show="showPhotoUpload">
          <input ref="photoInputRef" type="file" accept="image/*" multiple class="hidden" @change="handlePhotoSelect" />
          <div class="grid grid-cols-3 gap-2">
            <div v-for="(url, idx) in photos" :key="idx" class="aspect-square rounded-xl bg-gray-100 overflow-hidden relative animate-pop-in">
              <img loading="lazy" decoding="async" :src="url" alt="体重打卡" class="w-full min-h-full object-cover" />
              <button
                @click="removePhoto(idx)"
                class="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
            <div
              v-if="photos.length < 6"
              @click="photoInputRef?.click()"
              class="aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors active:scale-95"
            >
              <Camera class="h-6 w-6 text-gray-400 mb-1" />
              <span class="text-[10px] text-gray-400">添加图片</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 目标体重 -->
      <Card class="p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-bold text-gray-700 flex items-center gap-1.5">
            <Target class="w-4 h-4 text-[#FF976A]" />
            我的目标体重
          </span>
          <button v-if="!editingTarget" @click="editingTarget = true" class="text-xs text-[#1677FF] font-medium flex items-center gap-1">
            <Pencil class="w-3 h-3" /> {{ store.user?.targetWeight ? '修改' : '设置' }}
          </button>
        </div>
        <div v-if="editingTarget" class="flex items-center gap-2 mt-3">
          <input
            type="number"
            inputmode="decimal"
            step="0.1"
            v-model="targetWeight"
            placeholder="例如 60.0"
            class="flex-1 rounded-lg border border-gray-200 p-2.5 text-sm focus:border-[#1677FF] focus:outline-none"
          />
          <span class="text-sm text-gray-400">kg</span>
          <button @click="saveTarget" class="px-4 py-2.5 bg-[#1677FF] text-white text-sm font-bold rounded-lg active:scale-95 transition-transform">保存</button>
        </div>
        <div v-else class="mt-2">
          <div v-if="store.user?.targetWeight" class="flex items-baseline gap-2">
            <span class="text-2xl font-black text-[#FF976A]">{{ store.user.targetWeight }}</span>
            <span class="text-xs text-gray-400">kg</span>
            <span v-if="weightStats" class="text-xs text-gray-500 ml-1">还差 {{ Math.abs(parseFloat((weightStats.last - store.user.targetWeight).toFixed(1))) }} kg</span>
          </div>
          <div v-else class="text-xs text-gray-400">设置一个目标，趋势图会显示目标线，更有动力</div>
        </div>
      </Card>
    </div>

    <!-- ══════════ Tab 2: 趋势 ══════════ -->
    <div v-show="activeTab === 'trend'" class="p-4 space-y-4">
      <!-- Weight trend chart -->
      <div v-if="sortedRecords.length >= 2" class="space-y-3">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-bold text-gray-900">体重趋势</h3>
            <ChartRulePopup title="体重趋势图说明">
              <p>记录每次体重打卡的体重值，按时间顺序连成折线。</p>
              <p><span class="font-bold text-gray-900">交互：</span>点击/触摸折线图上的数据点可查看该次记录的详细信息。</p>
              <p><span class="font-bold text-gray-900">目标体重线：</span>橙色虚线表示你设置的目标体重，方便对照进度。</p>
              <p><span class="font-bold text-gray-900">批注标记：</span>数据点上的小圆点表示营养师有批注，红色=未读、蓝色=已读，点击可跳转到对应记录。</p>
              <p><span class="font-bold text-gray-900">变化量：</span>最新体重 - 首次记录体重，绿色表示体重下降、橙色表示上升。</p>
            </ChartRulePopup>
          </div>
          <div v-if="weightStats" class="flex items-center gap-1.5">
            <span class="text-[11px] text-gray-400">{{ weightStats.first }} → {{ weightStats.last }}kg</span>
            <span :class="[
              'text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5',
              weightStats.change < 0 ? 'text-[#07C160] bg-green-50' :
              weightStats.change > 0 ? 'text-orange-500 bg-orange-50' : 'text-gray-400 bg-gray-50'
            ]">
              <TrendingDown v-if="weightStats.change < 0" class="w-3 h-3" />
              <TrendingUp v-else-if="weightStats.change > 0" class="w-3 h-3" />
              <Minus v-else class="w-3 h-3" />
              {{ weightStats.change > 0 ? '+' : '' }}{{ weightStats.change }}kg
            </span>
          </div>
        </div>

        <Card class="p-4">
          <svg :viewBox="`0 0 ${CW} ${CH}`" class="w-full touch-none select-none"
               preserveAspectRatio="xMidYMid meet"
               @click="handleChartClick"
               ref="chartSvgRef">
            <defs>
              <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#1677FF" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#1677FF" stop-opacity="0" />
              </linearGradient>
              <filter id="pointGlow">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Grid lines -->
            <line v-for="(lb, i) in yLabels" :key="`g-${i}`"
                  :x1="PL" :y1="lb.y" :x2="CW - PR" :y2="lb.y"
                  stroke="#f0f0f0" stroke-width="1" />
            <!-- Y labels -->
            <text v-for="(lb, i) in yLabels" :key="`yl-${i}`"
                  :x="PL - 5" :y="lb.y + 3" text-anchor="end"
                  font-size="9" fill="#9ca3af">{{ lb.value }}</text>

            <!-- Area -->
            <path :d="areaPath" fill="url(#weightGrad)" />

            <!-- Line -->
            <path :d="linePath" fill="none" stroke="#1677FF" stroke-width="2"
                  stroke-linejoin="round" stroke-linecap="round" />

            <!-- 目标体重线 -->
            <g v-if="targetLineY !== null">
              <line :x1="PL" :y1="targetLineY" :x2="CW - PR" :y2="targetLineY"
                    stroke="#FF976A" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.8" />
              <text :x="CW - PR" :y="targetLineY - 4" text-anchor="end"
                    font-size="9" fill="#FF976A" font-weight="bold">目标 {{ store.user?.targetWeight }}kg</text>
            </g>

            <!-- Vertical guide line (active point) -->
            <line v-if="activeIdx !== null && chartPoints[activeIdx]"
                  :x1="chartPoints[activeIdx].x" :y1="PT"
                  :x2="chartPoints[activeIdx].x" :y2="PT + PH"
                  stroke="#1677FF" stroke-width="1" stroke-dasharray="3 3" opacity="0.4" />

            <!-- Points -->
            <circle v-for="(pt, i) in chartPoints" :key="`p-${i}`"
                    :cx="pt.x" :cy="pt.y"
                    :r="activeIdx === i ? 5.5 : 3.5"
                    :fill="activeIdx === i ? '#1677FF' : '#fff'"
                    :filter="activeIdx === i ? 'url(#pointGlow)' : ''"
                    :stroke="pt.unread ? '#EF4444' : '#1677FF'" stroke-width="2"
                    class="cursor-pointer transition-all"
                    @mouseenter="hoveredIdx = i"
                    @mouseleave="hoveredIdx = null" />

            <!-- 批注角标 -->
            <g v-for="(pt, i) in chartPoints.filter(p => p.hasComment)" :key="`cm-${i}`"
               class="cursor-pointer" @click.stop="scrollToRecord(pt.recordId)">
              <circle :cx="pt.x + 7" :cy="pt.y - 7" r="4.5"
                      :fill="pt.unread ? '#EF4444' : '#1677FF'"
                      stroke="#fff" stroke-width="1.2" />
              <text :x="pt.x + 7" :y="pt.y - 4.5" font-size="7" fill="#fff"
                    text-anchor="middle" font-weight="bold">评</text>
            </g>

            <!-- X labels -->
            <text v-for="(lb, i) in xLabels" :key="`xl-${i}`"
                  :x="lb.x" :y="CH - 8" text-anchor="middle"
                  font-size="9" fill="#9ca3af">{{ lb.label }}</text>

            <!-- Tooltip -->
            <g v-if="activeIdx !== null && chartPoints[activeIdx]">
              <rect :x="Math.max(PL, Math.min(CW - PR - 72, chartPoints[activeIdx].x - 36))"
                    :y="chartPoints[activeIdx].y - 38" width="72" height="28" rx="5"
                    fill="#1e293b" />
              <text :x="Math.max(PL + 36, Math.min(CW - PR - 36, chartPoints[activeIdx].x))"
                    :y="chartPoints[activeIdx].y - 24" text-anchor="middle"
                    font-size="11" fill="#fff" font-weight="bold">
                {{ chartPoints[activeIdx].weight }}kg
              </text>
              <text :x="Math.max(PL + 36, Math.min(CW - PR - 36, chartPoints[activeIdx].x))"
                    :y="chartPoints[activeIdx].y - 14" text-anchor="middle"
                    font-size="8" fill="rgba(255,255,255,0.7)">
                {{ chartPoints[activeIdx].label }}
              </text>
            </g>
          </svg>

          <!-- Selected point detail card -->
          <div v-if="selectedPoint" class="mt-3 p-3 rounded-xl bg-[#1677FF]/5 border border-[#1677FF]/10 flex items-center justify-between">
            <div>
              <div class="text-[10px] text-gray-500 mb-0.5">打卡时间</div>
              <div class="text-xs font-medium text-gray-700">{{ selectedPoint.fullDate }}</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-gray-500 mb-0.5">体重</div>
              <div class="text-sm font-bold text-[#1677FF]">{{ selectedPoint.weight }} kg</div>
            </div>
            <div v-if="selectedPoint.change !== null" class="text-right">
              <div class="text-[10px] text-gray-500 mb-0.5">较上次</div>
              <div :class="['text-sm font-bold', selectedPoint.change < 0 ? 'text-[#07C160]' : selectedPoint.change > 0 ? 'text-orange-500' : 'text-gray-500']">
                {{ selectedPoint.change > 0 ? '+' : '' }}{{ selectedPoint.change }} kg
              </div>
            </div>
            <button v-if="selectedPoint.hasComment" @click="scrollToRecord(selectedPoint.recordId)"
                    class="shrink-0 text-[10px] font-bold text-white bg-[#1677FF] px-2.5 py-1.5 rounded-full active:scale-95 transition-transform">
              查看批注
            </button>
          </div>

          <p v-if="!selectedPoint" class="text-center text-[10px] text-gray-400 mt-2">点击曲线上的点查看详细数据</p>

          <!-- Stats -->
          <div v-if="weightStats" class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
            <div class="text-center">
              <div class="text-[10px] text-gray-400 mb-0.5">最高</div>
              <div class="text-sm font-bold text-gray-700">{{ weightStats.max }}kg</div>
            </div>
            <div class="text-center">
              <div class="text-[10px] text-gray-400 mb-0.5">最低</div>
              <div class="text-sm font-bold text-gray-700">{{ weightStats.min }}kg</div>
            </div>
            <div class="text-center">
              <div class="text-[10px] text-gray-400 mb-0.5">记录</div>
              <div class="text-sm font-bold text-gray-700">{{ weightStats.count }}次</div>
            </div>
          </div>
        </Card>
      </div>

      <!-- 不足2条记录 -->
      <div v-else class="text-center py-10 bg-white rounded-2xl border border-gray-100">
        <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#1677FF]/10 flex items-center justify-center">
          <TrendingUp class="w-7 h-7 text-[#1677FF]" />
        </div>
        <div class="text-sm font-bold text-gray-700">已记录 {{ sortedRecords.length }} 次体重</div>
        <div class="text-xs text-gray-400 mt-0.5">再打卡 {{ 2 - sortedRecords.length }} 次即可生成你的专属趋势图</div>
      </div>
    </div>

    <!-- ══════════ Tab 3: 记录 ══════════ -->
    <div v-show="activeTab === 'records'" class="p-4 space-y-3">
      <div v-if="sortedRecords.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100">
        <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#1677FF]/10 flex items-center justify-center">
          <Scale class="w-7 h-7 text-[#1677FF]" />
        </div>
        <div class="text-sm font-bold text-gray-700">还没有体重记录</div>
        <div class="text-xs text-gray-400 mt-0.5">回到「打卡」页记录第一次体重</div>
      </div>
      <template v-else>
        <div v-for="group in groupedHistory" :key="group.date" :id="`weight-group-${group.date}`">
          <!-- Date header -->
          <button
            @click="handleToggleDate(group.date)"
            class="w-full flex items-center justify-between bg-white rounded-xl px-4 py-2.5 mb-2 border border-gray-100 sticky top-[104px] z-10 shadow-sm"
          >
            <div class="flex items-center gap-2">
              <span class="w-1 h-4 rounded-full bg-[#1677FF]"></span>
              <span class="text-sm font-bold text-gray-800">{{ group.label }}</span>
              <span class="text-[10px] text-gray-400">{{ group.records.length }}条记录</span>
              <span v-if="group.records.some((r) => r.dietitianComment && !r.commentRead)" class="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">新批注</span>
            </div>
            <ChevronDown
              class="w-4 h-4 text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': isExpanded(group.date) }"
            />
          </button>
          <!-- Records for this date -->
          <div v-show="isExpanded(group.date)" class="animate-pop-in">
            <Card class="p-0 overflow-hidden">
              <div class="divide-y divide-gray-50">
                <div
                  v-for="w in group.records"
                  :key="w.id"
                  :ref="(el) => setRecordRef(w.id, el)"
                  class="px-4 py-3 transition-colors duration-500 rounded-lg"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full bg-[#1677FF]/10 flex items-center justify-center text-[#1677FF]">
                        <Scale class="w-4 h-4" />
                      </div>
                      <div>
                        <div class="text-sm font-medium text-gray-900">{{ formatDateTime(w.date) }}</div>
                        <div class="text-[10px] text-gray-400">体重打卡</div>
                      </div>
                    </div>
                    <div class="text-lg font-bold text-gray-900">{{ w.weight }}<span class="text-xs font-normal text-gray-400 ml-0.5">kg</span></div>
                  </div>
                  <!-- 打卡照片 -->
                  <div v-if="w.photos && w.photos.length > 0" class="mt-2 ml-11 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <img
                      v-for="(url, idx) in w.photos"
                      :key="idx"
                      :src="thumbUrl(url)"
                      alt="体重打卡"
                      class="h-16 w-16 object-cover rounded-lg shrink-0 snap-center border border-gray-100 cursor-pointer"
                      loading="lazy"
                      decoding="async"
                      @click="store.openImagePreview(w.photos || [], idx)"
                    />
                  </div>
                  <!-- 批注 -->
                  <div v-if="w.dietitianComment" class="mt-2 ml-11 bg-[#1677FF]/5 rounded-lg p-3 border border-[#1677FF]/10">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs font-bold text-[#1677FF] flex items-center gap-1.5">
                        营养师批注
                        <span v-if="!w.commentRead" class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      </span>
                    </div>
                    <CheckinComments :comments="recordComments(w)" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </template>
    </div>

    <!-- 固定悬浮底部打卡按钮（仅打卡Tab显示） -->
    <div v-show="activeTab === 'checkin'" class="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[#F7F8FA] via-[#F7F8FA]/95 to-transparent">
      <Button class="w-full bg-[#1677FF] hover:bg-[#1677FF]/90 text-white shadow-lg shadow-[#1677FF]/30 active:scale-95 transition-transform" size="lg" @click="handleSubmit">
        完成打卡
      </Button>
    </div>
  </div>
</template>

<style scoped>
@keyframes popIn {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}
.animate-pop-in {
  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
.record-highlight {
  background-color: rgba(22, 119, 255, 0.1);
}
</style>
