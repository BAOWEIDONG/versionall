<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { celebrateCheckin, celebrateReward } from '../lib/confetti';
import { calculateStreak } from '../lib/streak';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { compressVideo } from '../lib/videoCompress';
import { NavBar, Card, Button, Input, ChartRulePopup, CheckinComments } from './ui';
import { recordComments } from '../lib/comments';
import { Plus, X, Camera, Video, PlayCircle, Loader, MessageCircle, ChevronDown, Dumbbell, TrendingUp } from 'lucide-vue-next';
import { showToast } from 'vant';
import { computeExerciseTrends } from '../lib/journey';
import DailyExerciseTrend from './DailyExerciseTrend.vue';
import { formatDateTime } from '../lib/utils';
import { thumbUrl } from '../lib/imageThumb';
import { useDateGrouping } from '../composables/useDateGrouping';
import { useTabSwipe } from '../lib/useTabSwipe';

const EXERCISE_TYPES = ['跑步', '游泳', '力量训练', '瑜伽', '快走', '骑行', '其他'];

/** 主观强度配置 — 颜色从冷到暖，描述参考 RPE (Rating of Perceived Exertion) 自感用力程度量表 */
const INTENSITY_CONFIG = [
  { level: 1, label: '很轻松',   color: '#3B82F6', lightBg: '#EFF6FF', description: '散步般轻松，能正常对话和唱歌，几乎不喘',   example: '如：慢走、拉伸放松' },
  { level: 2, label: '轻松',     color: '#10B981', lightBg: '#ECFDF5', description: '轻微出汗，可以正常聊天，呼吸略微加快',     example: '如：快走、轻松骑行' },
  { level: 3, label: '适中',     color: '#F59E0B', lightBg: '#FFFBEB', description: '微喘但能说话，燃脂黄金区间，适合日常锻炼', example: '如：慢跑、游泳、健身操' },
  { level: 4, label: '较累',     color: '#F97316', lightBg: '#FFF7ED', description: '呼吸明显加快，能说短句，身体发热出汗',     example: '如：快跑、力量训练、爬楼梯' },
  { level: 5, label: '非常吃力', color: '#EF4444', lightBg: '#FEF2F2', description: '呼吸急促只能说几个字，大汗淋漓，短暂即可', example: '如：跳绳、有氧操、快速爬坡' },
] as const;

type ActivityItem = {
  id: string;
  type: string;
  customType: string;
  duration: string;
  intensity: number;
};

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

const userExercises = computed(() => campEx.value.filter((r) => r.studentId === store.user?.id));

// 所有历史记录按日期分组
const allHistory = computed(() => [...userExercises.value].sort((a, b) => b.date.localeCompare(a.date)));
const { grouped: groupedHistory, toggleDate, isExpanded } = useDateGrouping(allHistory, { defaultExpandToday: false });

// 运动周趋势（规则见 journey.ts computeExerciseTrends 头部文档注释）
const exerciseTrends = computed(() => computeExerciseTrends(campEx.value, store.user?.id));

// 全部运动统计（不限时间范围，包含所有历史记录）
const totalExerciseCount = computed(() => userExercises.value.length);
const totalExerciseDuration = computed(() => userExercises.value.reduce((sum, r) => sum + r.duration, 0));
const qualifiedExerciseCount = computed(() => userExercises.value.filter(r => r.duration >= 40).length);
const avgExerciseDuration = computed(() => totalExerciseCount.value > 0 ? Math.round(totalExerciseDuration.value / totalExerciseCount.value) : 0);

const activities = ref<ActivityItem[]>([
  { id: Date.now().toString(), type: '跑步', customType: '', duration: '', intensity: 3 },
]);
const notes = ref('');
const photos = ref<string[]>([]);

// Media upload: 'photo' or 'video' - mutually exclusive
const mediaType = ref<'photo' | 'video'>('photo');
const videoUrls = ref<string[]>([]);
const videoCompressing = ref(false);
const compressProgress = ref(0);

const photoInputRef = ref<HTMLInputElement | null>(null);
const videoInputRef = ref<HTMLInputElement | null>(null);

const MAX_VIDEOS = 5;

const switchMediaType = (type: 'photo' | 'video') => {
  if (mediaType.value === type) return;
  mediaType.value = type;
  if (type === 'photo') {
    videoUrls.value = [];
  } else {
    photos.value = [];
  }
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

const handleVideoSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = MAX_VIDEOS - videoUrls.value.length;
  if (remaining <= 0) {
    showToast({ message: `最多上传 ${MAX_VIDEOS} 个视频`, position: 'top', duration: 2500 });
    (e.target as HTMLInputElement).value = '';
    return;
  }
  const toUpload = files.slice(0, remaining);
  videoCompressing.value = true;
  compressProgress.value = 0;

  try {
    const urls = await Promise.all(
      toUpload.map(async (file, idx) => {
        const compressed = await compressVideo(file, 15, (p) => {
          const base = idx / toUpload.length;
          const span = 1 / toUpload.length;
          compressProgress.value = Math.round((base + p * span) * 100);
        });
        return uploadFile(compressed);
      }),
    );
    videoUrls.value = [...videoUrls.value, ...urls];
  } catch {
    showToast({ message: '视频处理失败，请重试', position: 'top', duration: 2500 });
  } finally {
    videoCompressing.value = false;
    compressProgress.value = 0;
    (e.target as HTMLInputElement).value = '';
  }
};

const removeVideo = (index: number) => {
  videoUrls.value = videoUrls.value.filter((_, i) => i !== index);
};

const handleAddActivity = () => {
  activities.value.push({ id: Date.now().toString(), type: '力量训练', customType: '', duration: '', intensity: 3 });
};

const handleRemoveActivity = (id: string) => {
  if (activities.value.length > 1) {
    activities.value = activities.value.filter((a) => a.id !== id);
  }
};

const updateActivity = (id: string, field: keyof ActivityItem, value: any) => {
  activities.value = activities.value.map((a) => (a.id === id ? { ...a, [field]: value } : a));
};

const getIntensityConfig = (level: number) => INTENSITY_CONFIG[level - 1] || INTENSITY_CONFIG[2];

// Burst animation state - tracks which button was just clicked for ripple effect
const burstKey = ref('');
const burstId = ref(0);
let burstTimer: ReturnType<typeof setTimeout> | null = null;

const triggerBurst = (activityId: string, level: number) => {
  burstKey.value = `${activityId}-${level}`;
  burstId.value++;
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = setTimeout(() => {
    burstKey.value = '';
  }, 700);
};

const handleIntensityClick = (activityId: string, level: number) => {
  // If a swipe just ended, skip the click to avoid double-trigger
  if (swipeJustEnded.value) {
    swipeJustEnded.value = false;
    return;
  }
  updateActivity(activityId, 'intensity', level);
  triggerBurst(activityId, level);
};

// 滑块点击：根据点击位置计算强度等级
const handleSliderClick = (e: MouseEvent, activityId: string) => {
  if (swipeJustEnded.value) {
    swipeJustEnded.value = false;
    return;
  }
  const level = getLevelFromTouchX(e.clientX, e.currentTarget as HTMLElement);
  updateActivity(activityId, 'intensity', level);
  triggerBurst(activityId, level);
};

// ---- Swipe/Slide support for intensity selector ----
const touchStartX = ref(0);
const touchStartY = ref(0);
const isSwiping = ref(false);
const swipeJustEnded = ref(false); // flag to suppress click after swipe

const getLevelFromTouchX = (clientX: number, bar: HTMLElement): number => {
  const rect = bar.getBoundingClientRect();
  const relX = clientX - rect.left;
  const stepWidth = rect.width / 5;
  const idx = Math.floor(relX / stepWidth);
  return Math.max(1, Math.min(5, idx + 1));
};

const handleTouchStart = (e: TouchEvent) => {
  const touch = e.touches[0];
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  isSwiping.value = false;
};

const handleTouchMove = (e: TouchEvent, activityId: string) => {
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX.value;
  const dy = touch.clientY - touchStartY.value;
  // Only treat as swipe if horizontal movement dominates and exceeds threshold
  if (!isSwiping.value) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isSwiping.value = true;
    } else {
      return; // don't preventDefault for vertical scroll
    }
  }
  e.preventDefault(); // prevent scrolling during horizontal swipe
  const level = getLevelFromTouchX(touch.clientX, e.currentTarget as HTMLElement);
  const activity = activities.value.find((a) => a.id === activityId);
  if (activity && activity.intensity !== level) {
    updateActivity(activityId, 'intensity', level);
  }
};

const handleTouchEnd = (activityId: string) => {
  if (isSwiping.value) {
    const activity = activities.value.find((a) => a.id === activityId);
    if (activity) {
      triggerBurst(activityId, activity.intensity);
    }
    // Set flag to suppress the subsequent click event
    swipeJustEnded.value = true;
    setTimeout(() => { swipeJustEnded.value = false; }, 300);
  }
  isSwiping.value = false;
};

// 手势改命令式绑定（Vue 压缩器会错绑模板 passive touch 事件致滑动失灵，见 feedback-tab-swipe-prod-build）
// 强度滑块在 v-for 内，用函数 ref 在元素挂载时逐个绑定；元素以 activity.id 为 key，不会跨活动复用
const sliderCleanups = new Map<HTMLElement, () => void>();
const setSliderRef = (el: unknown, activityId: string) => {
  if (el instanceof HTMLElement && !sliderCleanups.has(el)) {
    const onTouchStart = (e: TouchEvent) => {
      e.stopPropagation(); // 原模板 @touchstart.stop：阻隔冒泡，避免触发 useTabSwipe 换 tab
      handleTouchStart(e);
    };
    const onTouchMove = (e: TouchEvent) => handleTouchMove(e, activityId);
    const onTouchEnd = (e: TouchEvent) => {
      e.stopPropagation(); // 原模板 @touchend.stop
      handleTouchEnd(activityId);
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // handleTouchMove 内调用 preventDefault，必须显式 passive:false
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    sliderCleanups.set(el, () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    });
  }
  // 清理已从 DOM 移除的滑块元素（活动删除时）
  for (const [node, cleanup] of sliderCleanups) {
    if (!node.isConnected) {
      cleanup();
      sliderCleanups.delete(node);
    }
  }
};
onUnmounted(() => {
  sliderCleanups.forEach((cleanup) => cleanup());
  sliderCleanups.clear();
});

// 学员展开未读批注所在日期分组 → 该分组内批注标记为已读（真正看到才算已读）
const markGroupCommentsRead = (date: string) => {
  const group = groupedHistory.value.find((g) => g.date === date);
  if (!group) return;
  group.records.forEach((r) => {
    if (r.coachComment && !r.commentRead) {
      store.updateExerciseRecord(r.id, { commentRead: true });
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
      if (r.coachComment && !r.commentRead) store.updateExerciseRecord(r.id, { commentRead: true });
    });
  });
});
// 记录 Tab 默认全部收起：未读批注在展开其日期分组时才标记已读（真正看到才算已读）

// 消息中心跳转：切到记录Tab，自动展开目标日期并滚动到对应记录
onMounted(() => {
  if (store.selectedDateStr) {
    const targetDate = store.selectedDateStr;
    store.setSelectedDateStr(null);
    activeTab.value = 'records';
    if (!isExpanded(targetDate)) toggleDate(targetDate);
    markGroupCommentsRead(targetDate);
    nextTick(() => {
      nextTick(() => {
        const el = document.getElementById(`exercise-group-${targetDate}`);
        if (el) el.scrollIntoView({ block: 'start' });
      });
    });
  }
});

const todayStr = format(new Date(), 'yyyy-MM-dd');
const todayExercise = computed(() =>
  userExercises.value.filter((r) => r.date.substring(0, 10) === todayStr)
);
const MAX_DAILY_EXERCISE = 5;
const hasReachedDailyLimit = computed(() => todayExercise.value.length >= MAX_DAILY_EXERCISE);

const handleSubmit = () => {
  if (hasReachedDailyLimit.value) {
    showToast({ message: `今日已完成 ${MAX_DAILY_EXERCISE} 次运动打卡，明天再来吧`, position: 'top', duration: 2500 });
    return;
  }

  for (const a of activities.value) {
    if (!a.duration) {
      showToast({ message: '请填写所有运动的时长', position: 'top', duration: 2500 });
      return;
    }
    if (a.type === '其他' && !a.customType.trim()) {
      showToast({ message: '请填写自定义运动名称', position: 'top', duration: 2500 });
      return;
    }
  }
  // 必须上传图片或视频（二选一）
  if (mediaType.value === 'photo' && photos.value.length === 0) {
    showToast({ message: '请上传至少一张运动照片，或切换到视频打卡', position: 'top', duration: 2500 });
    return;
  }
  if (mediaType.value === 'video' && videoUrls.value.length === 0) {
    showToast({ message: '请上传至少一段运动视频，或切换到图片打卡', position: 'top', duration: 2500 });
    return;
  }

  // 打卡前连续天数（判断是否因本次打卡而增长）
  const streakBefore = calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id);

  activities.value.forEach((a, index) => {
    store.addExerciseRecord({
      id: `ex_${Date.now()}_${index}`,
      studentId: store.user?.id || 's1',
      campId: activeCampId.value || undefined,
      date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      type: a.type === '其他' ? a.customType : a.type,
      duration: parseInt(a.duration),
      intensity: a.intensity,
      notes: index === 0 ? notes.value : undefined,
      photos: index === 0 && mediaType.value === 'photo' ? photos.value : undefined,
      videoUrls: index === 0 && mediaType.value === 'video' && videoUrls.value.length > 0 ? videoUrls.value : undefined,
    });
  });

  // 仅当连续天数增长且匹配奖励档位且未领取时，触发奖励庆祝
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
    celebrateCheckin('exercise');
  }
  store.justCheckedIn = true;
  activities.value = activities.value.map(a => ({ ...a, duration: '', customType: '' }));
  notes.value = '';
  photos.value = [];
  videoUrls.value = [];
};
</script>

<template>
  <div ref="sheetRoot" class="flex min-h-full flex-col bg-[#F7F8FA] pb-8 font-sans">
    <NavBar title="运动打卡" :on-back="store.goBack" />

    <!-- Tab 切换：打卡 / 趋势 / 记录（液态玻璃胶囊） -->
    <div class="sticky top-14 z-20 px-4 pt-3 pb-1">
      <div class="seg-tabs">
        <button
          v-for="tab in ([{ id: 'checkin', label: '打卡' }, { id: 'trend', label: '趋势' }, { id: 'records', label: '记录' }] as const)"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['seg-tab seg-tab-green', activeTab === tab.id ? 'active' : '']"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- ══════════ Tab 1: 打卡 ══════════ -->
    <div v-show="activeTab === 'checkin'" class="p-4 space-y-4 pb-32">
      <!-- 今日已达上限提示 -->
      <div v-if="hasReachedDailyLimit" class="rounded-xl bg-[#07C160]/8 border border-[#07C160]/20 p-3 flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-[#07C160]/15 flex items-center justify-center shrink-0">
          <Dumbbell class="w-4 h-4 text-[#07C160]" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-bold text-[#07C160]">今日运动打卡已达上限</div>
          <div class="text-[11px] text-gray-500">每天最多 {{ MAX_DAILY_EXERCISE }} 次运动打卡，明天再来吧</div>
        </div>
        <button @click="activeTab = 'records'" class="text-xs font-bold text-[#07C160] bg-white px-3 py-1.5 rounded-full active:scale-95 transition-transform shrink-0">查看记录</button>
      </div>
      <div v-if="hasReachedDailyLimit" class="h-0"></div>

      <Card v-for="(activity, index) in activities" :key="activity.id" class="space-y-5 relative pt-8 shadow-sm" :class="{ 'opacity-50 pointer-events-none': hasReachedDailyLimit }">
        <button
          v-if="activities.length > 1"
          class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors p-1"
          @click="handleRemoveActivity(activity.id)"
        >
          <X class="w-5 h-5" />
        </button>

        <div class="absolute top-0 left-0 bg-[#07C160]/10 text-[#07C160] px-3 py-1 rounded-br-lg font-bold text-xs">
          运动项 {{ index + 1 }}
        </div>

        <div class="space-y-3">
          <label class="text-sm font-bold text-gray-900 block">运动类型</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in EXERCISE_TYPES"
              :key="type"
              @click="updateActivity(activity.id, 'type', type)"
              :class="['px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95', activity.type === type ? 'bg-[#07C160] text-white shadow-sm scale-105' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
            >
              {{ type }}
            </button>
          </div>
        </div>

        <div v-if="activity.type === '其他'" class="space-y-2 animate-pop-in">
          <label class="text-sm font-bold text-gray-900 block">自定义运动名称 <span class="text-red-500">*</span></label>
          <Input
            type="text"
            placeholder="例如：普拉提、爬山"
            :value="activity.customType"
            @input="updateActivity(activity.id, 'customType', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-900 block">运动时长 (分钟) <span class="text-red-500">*</span></label>
          <!-- 快捷选择 -->
          <div class="flex gap-2">
            <button
              v-for="d in [15, 30, 45, 60]"
              :key="d"
              @click="updateActivity(activity.id, 'duration', String(d))"
              :class="['flex-1 py-2 rounded-lg text-sm font-bold transition-all active:scale-95', activity.duration === String(d) ? 'bg-[#07C160] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
            >
              {{ d }}
            </button>
          </div>
          <Input
            type="number"
            inputmode="numeric"
            placeholder="或手动输入时长，例如 30"
            :value="activity.duration"
            @input="updateActivity(activity.id, 'duration', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="text-sm font-bold text-gray-900 block">主观强度</label>
            <span class="text-xs text-gray-400">RPE 自感用力程度</span>
          </div>

          <!-- Intensity gradient slider -->
          <div class="relative py-3">
            <!-- 滑块触摸区 -->
            <div
              class="relative mx-3 py-3 cursor-pointer touch-pan-y"
              @click="handleSliderClick($event, activity.id)"
              :ref="(el) => setSliderRef(el, activity.id)"
            >
              <!-- 渐变轨道 -->
              <div
                class="relative h-2.5 rounded-full"
                style="background: linear-gradient(to right, #3B82F6 0%, #10B981 25%, #F59E0B 50%, #F97316 75%, #EF4444 100%);"
              >
                <!-- 刻度点 -->
                <div
                  v-for="config in INTENSITY_CONFIG"
                  :key="'dot-' + config.level"
                  class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/50 pointer-events-none"
                  :style="{ left: `${(config.level - 1) / 4 * 100}%` }"
                ></div>

                <!-- 滑块 thumb -->
                <div
                  class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full border-[3px] border-white transition-all duration-300 pointer-events-none flex items-center justify-center z-10"
                  :style="{
                    left: `${(activity.intensity - 1) / 4 * 100}%`,
                    backgroundColor: getIntensityConfig(activity.intensity).color,
                    boxShadow: `0 2px 12px ${getIntensityConfig(activity.intensity).color}60`
                  }"
                >
                  <span class="text-[10px] font-black text-white">{{ activity.intensity }}</span>
                  <!-- 爆裂动画 -->
                  <span
                    v-if="burstKey === `${activity.id}-${activity.intensity}`"
                    :key="`${burstId}-r1`"
                    class="absolute inset-0 rounded-full pointer-events-none"
                    :style="{ animation: `burst-${activity.intensity} 0.6s ease-out forwards`, backgroundColor: getIntensityConfig(activity.intensity).color }"
                  ></span>
                  <span
                    v-if="burstKey === `${activity.id}-${activity.intensity}` && activity.intensity >= 4"
                    :key="`${burstId}-r2`"
                    class="absolute inset-0 rounded-full pointer-events-none"
                    :style="{ animation: `burst-${activity.intensity}-outer 0.6s ease-out 0.12s forwards`, backgroundColor: getIntensityConfig(activity.intensity).color }"
                  ></span>
                </div>
              </div>
            </div>

            <!-- 强度标签 -->
            <div class="flex justify-between mx-3 mt-1">
              <span
                v-for="config in INTENSITY_CONFIG"
                :key="'label-' + config.level"
                :class="['text-[10px] font-bold transition-colors duration-200', activity.intensity === config.level ? '' : 'text-gray-400']"
                :style="activity.intensity === config.level ? { color: config.color } : {}"
              >
                {{ config.label }}
              </span>
            </div>

            <p class="text-center text-[10px] text-gray-400 mt-1">点击或滑动选择强度</p>
          </div>
          <!-- Intensity description card -->
          <transition name="desc-fade" mode="out-in">
            <div
              :key="activity.intensity"
              class="rounded-xl p-3 border transition-colors duration-300"
              :style="{ backgroundColor: getIntensityConfig(activity.intensity).lightBg, borderColor: getIntensityConfig(activity.intensity).color + '25' }"
            >
              <div class="flex items-center gap-2 mb-1.5">
                <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: getIntensityConfig(activity.intensity).color }"></div>
                <span class="text-sm font-bold" :style="{ color: getIntensityConfig(activity.intensity).color }">
                  {{ getIntensityConfig(activity.intensity).label }}
                </span>
                <span class="text-[10px] text-gray-400 font-medium">Lv.{{ activity.intensity }}</span>
              </div>
              <p class="text-xs text-gray-600 leading-relaxed">{{ getIntensityConfig(activity.intensity).description }}</p>
              <p class="text-[10px] text-gray-400 mt-1">{{ getIntensityConfig(activity.intensity).example }}</p>
            </div>
          </transition>
        </div>
      </Card>

      <button
        @click="handleAddActivity"
        class="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 flex items-center justify-center gap-2 hover:border-[#07C160] hover:text-[#07C160] transition-all font-medium bg-white active:scale-[0.98]"
      >
        <Plus class="w-5 h-5" />
        添加运动项
      </button>

      <Card class="space-y-4 shadow-sm">
        <!-- Media type toggle -->
        <div>
          <div class="flex gap-2 mb-3">
            <button
              @click="switchMediaType('photo')"
              :class="['flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95', mediaType === 'photo' ? 'bg-[#07C160] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200']"
            >
              <Camera class="w-4 h-4" />
              图片打卡
            </button>
            <button
              @click="switchMediaType('video')"
              :class="['flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95', mediaType === 'video' ? 'bg-[#07C160] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200']"
            >
              <Video class="w-4 h-4" />
              视频打卡
            </button>
          </div>
          <p class="text-[10px] text-red-500 text-center">图片和视频二选一上传（必填）</p>
        </div>

        <!-- Photo upload -->
        <div v-if="mediaType === 'photo'">
          <label class="text-sm font-bold text-gray-900 block mb-2">运动照片 (最多 6 张)</label>
          <input ref="photoInputRef" type="file" accept="image/*" multiple class="hidden" @change="handlePhotoSelect" />
          <div class="grid grid-cols-3 gap-2">
            <div v-for="(url, idx) in photos" :key="idx" class="aspect-square rounded-xl bg-gray-100 overflow-hidden relative animate-pop-in">
              <img loading="lazy" decoding="async" :src="url" alt="运动打卡" class="w-full min-h-full object-cover" />
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

        <!-- Video upload -->
        <div v-if="mediaType === 'video'">
          <label class="text-sm font-bold text-gray-900 block mb-2">运动视频 (最多 {{ MAX_VIDEOS }} 个)</label>
          <input ref="videoInputRef" type="file" accept="video/*" multiple class="hidden" @change="handleVideoSelect" />

          <div v-if="videoCompressing" class="aspect-video rounded-xl border-2 border-[#07C160]/30 bg-[#07C160]/5 flex flex-col items-center justify-center gap-3">
            <Loader class="h-8 w-8 text-[#07C160] animate-spin" />
            <span class="text-sm text-[#07C160] font-medium">正在处理视频 {{ compressProgress }}%</span>
            <span class="text-[10px] text-gray-400">请耐心等待</span>
          </div>

          <div v-else class="grid grid-cols-3 gap-2">
            <div
              v-for="(url, idx) in videoUrls"
              :key="idx"
              class="aspect-square rounded-xl bg-black overflow-hidden relative animate-pop-in"
            >
              <video
                :src="url"
                class="w-full min-h-full object-cover cursor-pointer"
                preload="metadata"
                playsinline
                webkit-playsinline
                @click="store.openVideoPreview(url)"
              />
              <button
                @click="removeVideo(idx)"
                class="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 z-10"
              >
                <X class="w-3 h-3" />
              </button>
              <span class="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                {{ idx + 1 }}/{{ MAX_VIDEOS }}
              </span>
            </div>

            <div
              v-if="videoUrls.length < MAX_VIDEOS"
              @click="videoInputRef?.click()"
              class="aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors active:scale-95"
            >
              <Video class="h-6 w-6 text-[#07C160] mb-1" />
              <span class="text-[10px] text-gray-400">上传视频</span>
            </div>
          </div>

          <p v-if="videoUrls.length > 0" class="text-[10px] text-gray-400 mt-2">点击视频可预览，已上传 {{ videoUrls.length }}/{{ MAX_VIDEOS }} 个</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-900 block">综合备注 (选填)</label>
          <textarea
            class="w-full rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#07C160] bg-gray-50 focus:bg-white transition-colors"
            rows="3"
            placeholder="记录一下今天整体的运动感受吧~"
            :value="notes"
            @input="notes = ($event.target as HTMLTextAreaElement).value"
          />
        </div>
      </Card>

    </div>

    <!-- ══════════ Tab 2: 趋势 ══════════ -->
    <div v-show="activeTab === 'trend'" class="p-4 space-y-4">
      <Card v-if="exerciseTrends.length > 0" class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
            <TrendingUp class="h-4 w-4 text-[#07C160]" />
            每日运动趋势
          </h3>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-400">单位：分钟</span>
            <ChartRulePopup title="运动趋势计算规则">
              <p><span class="font-bold text-gray-900">每日总时长：</span>该日所有运动记录的 duration 之和（分钟），同一日多次运动分别相加。</p>
              <p><span class="font-bold text-gray-900">平均强度：</span>该日记录 intensity 的算术平均值（RPE 1-5），无记录显示"--"。</p>
              <p><span class="font-bold text-gray-900">打卡次数：</span>该日运动记录条数，同一天多次运动分别计数。</p>
              <p><span class="font-bold text-gray-900">达标（≥40min）：</span>单次运动时长≥40分钟的记录数。与积分规则一致--每日完成单次40分钟以上运动即可计分。</p>
              <p><span class="font-bold text-gray-900">交互：</span>点击某根柱形查看当天记录；在图上左右滑动可切换前一天/后一天。</p>
            </ChartRulePopup>
          </div>
        </div>

        <DailyExerciseTrend :records="userExercises" />

        <!-- 全部运动统计 -->
        <div class="pt-3 border-t border-gray-50 space-y-2">
          <div class="text-[10px] text-gray-400">全部运动统计：</div>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="bg-gray-50 rounded-lg py-2">
              <div class="text-sm font-bold text-gray-900">{{ totalExerciseCount }}</div>
              <div class="text-[9px] text-gray-500">总次数</div>
            </div>
            <div class="bg-[#07C160]/5 rounded-lg py-2">
              <div class="text-sm font-bold text-[#07C160]">{{ totalExerciseDuration }}</div>
              <div class="text-[9px] text-gray-500">总时长(分)</div>
            </div>
            <div class="bg-[#FF976A]/5 rounded-lg py-2">
              <div class="text-sm font-bold text-[#FF976A]">{{ qualifiedExerciseCount }}</div>
              <div class="text-[9px] text-gray-500">达标(≥40min)</div>
            </div>
            <div class="bg-blue-50 rounded-lg py-2">
              <div class="text-sm font-bold text-blue-600">{{ avgExerciseDuration }}</div>
              <div class="text-[9px] text-gray-500">平均(分/次)</div>
            </div>
          </div>
        </div>
      </Card>
      <div v-else class="text-center py-10 bg-white rounded-2xl border border-gray-100">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-[#07C160]/10 flex items-center justify-center">
          <TrendingUp class="w-8 h-8 text-[#07C160]" />
        </div>
        <div class="text-sm font-bold text-gray-700 mb-1">还没有运动数据</div>
        <div class="text-xs text-gray-400">完成打卡后生成每日运动趋势</div>
      </div>
    </div>

    <!-- ══════════ Tab 3: 记录 ══════════ -->
    <div v-show="activeTab === 'records'" class="p-4 space-y-4">
      <div v-if="groupedHistory.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100 animate-pop-in">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-[#07C160]/10 flex items-center justify-center">
          <Dumbbell class="w-8 h-8 text-[#07C160]" />
        </div>
        <div class="text-sm font-bold text-gray-700 mb-1">还没有运动记录</div>
        <div class="text-xs text-gray-400 mb-4">完成今天的第一次运动打卡吧</div>
        <button @click="activeTab = 'checkin'; activities[0].duration = '30'" class="text-xs font-bold text-[#07C160] bg-[#07C160]/10 px-4 py-2 rounded-full active:scale-95 transition-transform">从 30 分钟开始 →</button>
      </div>
      <div v-else class="space-y-4">
        <div v-for="group in groupedHistory" :key="group.date" :id="`exercise-group-${group.date}`">
          <!-- Date header -->
          <button
            @click="handleToggleDate(group.date)"
            class="w-full flex items-center justify-between bg-white rounded-xl px-4 py-2.5 mb-2 border border-gray-100 sticky top-[104px] z-10 shadow-sm"
          >
            <div class="flex items-center gap-2">
              <span class="w-1 h-4 rounded-full bg-[#07C160]"></span>
              <span class="text-sm font-bold text-gray-800">{{ group.label }}</span>
              <span class="text-[10px] text-gray-400">{{ group.records.length }}条记录</span>
              <span v-if="group.records.some((r) => r.coachComment && !r.commentRead)" class="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">新批注</span>
            </div>
            <ChevronDown
              class="w-4 h-4 text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': isExpanded(group.date) }"
            />
          </button>
          <!-- Records for this date -->
          <div v-show="isExpanded(group.date)" class="space-y-4 animate-pop-in">
            <Card v-for="record in group.records" :key="record.id" class="p-0 overflow-hidden">
              <div class="p-4 border-b border-gray-50">
                <div class="flex justify-between items-center mb-3">
                  <span class="text-xs text-gray-500 font-medium">{{ formatDateTime(record.date) }}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded text-[#07C160] bg-[#07C160]/10 font-bold uppercase">
                    {{ record.type }}
                  </span>
                </div>

                <div class="flex justify-between mb-2">
                  <span class="text-sm font-medium text-gray-900">时长: {{ record.duration }} 分钟</span>
                  <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        :style="{ backgroundColor: getIntensityConfig(record.intensity).lightBg, color: getIntensityConfig(record.intensity).color }">
                    <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: getIntensityConfig(record.intensity).color }"></span>
                    {{ getIntensityConfig(record.intensity).label }}
                  </span>
                </div>

                <p v-if="record.notes" class="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{{ record.notes }}</p>

                <div v-if="record.photos && record.photos.length > 0" class="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <img
                    v-for="(url, idx) in record.photos"
                    :key="idx"
                    :src="thumbUrl(url)"
                    alt="运动"
                    class="h-20 w-20 object-cover rounded-lg shrink-0 snap-center border border-gray-100 cursor-pointer"
                    loading="lazy"
                    decoding="async"
                    @click="store.openImagePreview(record.photos || [], idx)"
                  />
                </div>

                <div v-if="record.videoUrls && record.videoUrls.length > 0" class="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <div
                    v-for="(url, idx) in record.videoUrls"
                    :key="idx"
                    class="h-20 w-20 rounded-lg shrink-0 snap-center border border-gray-100 overflow-hidden relative bg-black cursor-pointer"
                    @click="store.openVideoPreview(url)"
                  >
                    <video :src="url" class="w-full h-full object-cover" preload="metadata" playsinline webkit-playsinline />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                      <PlayCircle class="w-6 h-6 text-white drop-shadow" />
                    </div>
                  </div>
                </div>

                <div v-if="record.coachComment" class="mt-3 p-2.5 rounded-lg bg-[#07C160]/5 border border-[#07C160]/10">
                  <div class="flex items-center gap-1.5 mb-1">
                    <MessageCircle class="w-3 h-3 text-[#07C160]" />
                    <span class="text-[11px] font-bold text-[#07C160]">教练批注</span>
                    <span v-if="record.coachScore === 2" class="text-[10px] font-bold text-white bg-[#07C160] px-1.5 py-0.5 rounded">+2</span>
                    <span v-else-if="record.coachScore === 1" class="text-[10px] font-bold text-white bg-[#FF976A] px-1.5 py-0.5 rounded">+1</span>
                    <span v-else-if="record.coachScore === 0" class="text-[10px] font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded">0</span>
                    <span v-if="!record.commentRead" class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  </div>
                  <CheckinComments :comments="recordComments(record)" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>

    <!-- 固定悬浮底部打卡按钮（仅打卡Tab显示） -->
    <div v-show="activeTab === 'checkin' && !hasReachedDailyLimit" class="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[#F7F8FA] via-[#F7F8FA]/95 to-transparent">
      <Button class="w-full shadow-lg shadow-[#07C160]/30 active:scale-95 transition-transform" size="lg" @click="handleSubmit">
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

/* Intensity burst animations - scale grows with intensity level */
@keyframes burst-1 { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes burst-2 { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes burst-3 { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(2.3); opacity: 0; } }
@keyframes burst-4 { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(2.7); opacity: 0; } }
@keyframes burst-5 { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(3.2); opacity: 0; } }
/* Second outer ring for level 4-5 - even larger, creates layered explosion effect */
@keyframes burst-4-outer { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(3.8); opacity: 0; } }
@keyframes burst-5-outer { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(4.5); opacity: 0; } }

/* Description card transition */
.desc-fade-enter-active, .desc-fade-leave-active {
  transition: all 0.25s ease;
}
.desc-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.desc-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.animate-pop-in {
  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
</style>
