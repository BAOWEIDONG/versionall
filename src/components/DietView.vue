<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, nextTick } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { celebrateCheckin, celebrateReward } from '../lib/confetti';
import { calculateStreak } from '../lib/streak';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { Checkbox as VanCheckbox, showToast } from 'vant';
import { NavBar, Card, Button, CheckinComments } from './ui';
import { Camera, X, ChevronDown, UtensilsCrossed } from 'lucide-vue-next';
import { formatDateTime } from '../lib/utils';
import { thumbUrl } from '../lib/imageThumb';
import { recordComments } from '../lib/comments';
import type { DietRecord } from '../types';
import { useDateGrouping } from '../composables/useDateGrouping';
import { useTabSwipe } from '../lib/useTabSwipe';

const MEAL_TYPES = [
  { id: 'breakfast', label: '早餐' },
  { id: 'lunch', label: '午餐' },
  { id: 'dinner', label: '晚餐' },
  { id: 'snack', label: '加餐' },
];

const store = useAppStore();

// ─── Tab 结构：打卡 / 记录 ────────────────────────
const activeTab = ref<'checkin' | 'records'>('checkin');
const sheetRoot = ref<HTMLElement | null>(null);
useTabSwipe(sheetRoot, activeTab, ['checkin', 'records']);

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

const todayStr = computed(() => format(new Date(), 'yyyy-MM-dd'));
const userDiets = computed(() => campDiet.value.filter((r) => r.studentId === store.user?.id));
const todayDiets = computed(() => userDiets.value.filter((r) => r.date.startsWith(todayStr.value)));
const uploadedMealIds = computed(() => todayDiets.value.map((r) => r.meal as string));

const availableMeals = computed(() => MEAL_TYPES.filter((m) => !uploadedMealIds.value.includes(m.id)));
const initialMeal = computed(() => (availableMeals.value.length > 0 ? availableMeals.value[0].id : ''));

const formData = ref({
  meal: initialMeal.value,
  description: '',
  isFasted: false,
  hasStaple: false,
  hasProtein: false,
  hasVegetable: false,
});

const photos = ref<string[]>([]);
const error = ref('');

const photoInputRef = ref<HTMLInputElement | null>(null);

const handlePhotoSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 3 - photos.value.length;
  try {
    // 上传前自动压缩图片（减少传输量+加载速度）
    const compressed = await Promise.all(files.slice(0, remaining).map((f) => compressImage(f)));
    const urls = await Promise.all(compressed.map((f) => uploadFile(f)));
    photos.value = [...photos.value, ...urls];
  } catch {
    showToast({ message: '照片上传失败，请重试', position: 'top', duration: 2500 });
  }
  (e.target as HTMLInputElement).value = '';
};

const removePhoto = (idx: number) => {
  photos.value = photos.value.filter((_, i) => i !== idx);
};

const checkMealTime = (mealId: string): string | null => {
  const campId = activeCampId.value;
  if (!campId) return null;
  const mealConfig = store.getMealTimeConfig(campId);
  const slot = mealConfig[mealId as keyof typeof mealConfig];
  if (!slot || !slot.enabled) return null;
  const now = format(new Date(), 'HH:mm');
  if (now < slot.start || now > slot.end) {
    return `${slot.start}~${slot.end}`;
  }
  return null;
};

const handleSubmit = () => {
  if (!formData.value.meal) {
    error.value = '今日餐次已全部打卡';
    return;
  }

  // Check meal time range
  const timeRange = checkMealTime(formData.value.meal);
  if (timeRange) {
    const mealLabel = MEAL_TYPES.find(m => m.id === formData.value.meal)?.label || '';
    error.value = `${mealLabel}打卡时间为 ${timeRange}，当前不在打卡时间区间`;
    return;
  }
  if (!formData.value.isFasted && (formData.value.description.length < 5 || formData.value.description.length > 500)) {
    error.value = '请输入5-500字的食物描述';
    return;
  }
  if (!formData.value.isFasted && photos.value.length === 0) {
    error.value = '请至少上传一张照片';
    return;
  }
  if (photos.value.length > 3) {
    error.value = '最多上传3张照片';
    return;
  }

  error.value = '';
  const submittedMeal = formData.value.meal;

  // 打卡前连续天数
  const streakBefore = calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id);

  store.addDietRecord({
    id: `diet_${Date.now()}`,
    studentId: store.user?.id || 's1',
    campId: activeCampId.value || undefined,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    meal: submittedMeal as DietRecord['meal'],
    description: formData.value.isFasted ? '未进食' : formData.value.description,
    photos: formData.value.isFasted ? [] : photos.value,
    isFasted: formData.value.isFasted,
    hasStaple: formData.value.isFasted ? false : formData.value.hasStaple,
    hasProtein: formData.value.isFasted ? false : formData.value.hasProtein,
    hasVegetable: formData.value.isFasted ? false : formData.value.hasVegetable,
  });

  // reset form
  formData.value = { meal: '', description: '', isFasted: false, hasStaple: false, hasProtein: false, hasVegetable: false };
  photos.value = [];

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
    celebrateCheckin(submittedMeal as 'breakfast' | 'lunch' | 'dinner' | 'snack');
  }

  store.justCheckedIn = true;
};

// Update selected meal if current selection becomes disabled
watch(
  [uploadedMealIds, () => formData.value.meal],
  () => {
    if (uploadedMealIds.value.includes(formData.value.meal as any) || !formData.value.meal) {
      const avail = MEAL_TYPES.filter((m) => !uploadedMealIds.value.includes(m.id as any));
      if (avail.length > 0) {
        formData.value.meal = avail[0].id;
      } else {
        formData.value.meal = '';
      }
    }
  },
);

// 所有历史记录按日期分组
const allHistory = computed(() => [...userDiets.value].sort((a, b) => b.date.localeCompare(a.date)));
const { grouped: groupedHistory, toggleDate, isExpanded } = useDateGrouping(allHistory, { defaultExpandToday: false });

// 首屏性能：历史记录按日期分组后只先渲染最近 N 组，滚动/点按钮再加载更早（减少首帧 DOM 与图片数量）
const visibleGroupCount = ref(3); // 初始渲染最近 3 天分组（每组默认收起，数据量小）
const historyVisible = computed(() => groupedHistory.value.slice(0, visibleGroupCount.value));
const hasMoreHistory = computed(() => visibleGroupCount.value < groupedHistory.value.length);
const loadMoreHistory = () => { visibleGroupCount.value += 5; };
// 跨页深链：跳转到指定日期的记录时，需把渲染上限放开到包含目标日期
function revealToDate(targetDate: string) {
  const idx = groupedHistory.value.findIndex((g) => g.date === targetDate);
  if (idx >= 0 && idx >= visibleGroupCount.value) visibleGroupCount.value = idx + 1;
}

const mealLabel = (meal: string) => MEAL_TYPES.find((m) => m.id === meal)?.label;

// 学员展开未读批注所在日期分组 → 该分组内批注标记为已读（真正看到才算已读）
const markGroupCommentsRead = (date: string) => {
  const group = groupedHistory.value.find((g) => g.date === date);
  if (!group) return;
  group.records.forEach((r) => {
    if (r.dietitianComment && !r.commentRead) {
      store.updateDietRecord(r.id, { commentRead: true });
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
      if (r.dietitianComment && !r.commentRead) store.updateDietRecord(r.id, { commentRead: true });
    });
  });
});

// 记录 Tab 默认全部收起：未读批注在用户实际展开该日期分组时才标记已读，
// 故"新批注"标识在展开前保持未读（真正看到才算已读）
void markGroupCommentsRead;

// 消息中心跳转：切到记录Tab，自动展开目标日期并滚动到对应记录
// 处理跨页跳转深链（消息中心点某条记录 → 自动滚动到该日期组）：
// KeepAlive 缓存下返回不重挂载，需在 onMounted 与 onActivated 都执行
const processPendingDeepLink = () => {
  if (store.selectedDateStr) {
    const targetDate = store.selectedDateStr;
    store.setSelectedDateStr(null);
    activeTab.value = 'records';
    revealToDate(targetDate); // 放开渲染上限，确保目标日期组已渲染
    if (!isExpanded(targetDate)) toggleDate(targetDate);
    markGroupCommentsRead(targetDate);
    nextTick(() => {
      nextTick(() => {
        const el = document.getElementById(`diet-group-${targetDate}`);
        if (el) el.scrollIntoView({ block: 'start' });
      });
    });
  }
};
onMounted(processPendingDeepLink);
onActivated(processPendingDeepLink);
</script>

<template>
  <div ref="sheetRoot" class="flex min-h-full flex-col bg-[#F7F8FA] pb-8">
    <NavBar title="饮食打卡" :on-back="store.goBack" />

    <!-- Tab 切换：打卡 / 记录（液态玻璃胶囊） -->
    <div class="sticky top-14 z-20 px-4 pt-3 pb-1">
      <div class="seg-tabs">
        <button
          v-for="tab in ([{ id: 'checkin', label: '打卡' }, { id: 'records', label: '记录' }] as const)"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['seg-tab seg-tab-orange', activeTab === tab.id ? 'active' : '']"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- ══════════ Tab 1: 打卡 ══════════ -->
    <div v-show="activeTab === 'checkin'" class="p-4 space-y-6 pb-32">
      <Card class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 block">选择餐次</label>
          <div class="flex gap-2">
            <button
              v-for="m in MEAL_TYPES"
              :key="m.id"
              :disabled="uploadedMealIds.includes(m.id)"
              @click="formData.meal = m.id"
              :class="['flex-1 py-2 rounded-lg text-sm transition-all font-medium active:scale-95', uploadedMealIds.includes(m.id) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : formData.meal === m.id ? 'bg-[#FF976A] text-white shadow-sm scale-105' : 'bg-white text-gray-700 border border-gray-200']"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-gray-700">食物描述 <span v-if="!formData.isFasted" class="text-red-500">*</span></label>
            <VanCheckbox :model-value="formData.isFasted" @update:model-value="(v: boolean) => { formData.isFasted = v; formData.description = ''; error = ''; }" class="custom-checkbox cb-orange">
              <span class="text-sm font-medium text-gray-700">未进食</span>
            </VanCheckbox>
          </div>
          <div v-if="formData.isFasted" class="bg-yellow-50 text-yellow-700 p-2 text-xs rounded-lg mt-2 animate-pop-in">
            记得按时吃饭哦，营养师会担心你的～
          </div>
          <div v-if="!formData.isFasted" class="relative">
            <textarea
              placeholder="请详细描述您的餐食，包含食物种类和大概份量 (5-500字)"
              :value="formData.description"
              @input="formData.description = ($event.target as HTMLTextAreaElement).value; error = ''"
              class="w-full h-24 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF976A]/20 focus:border-[#FF976A] resize-none text-sm text-gray-900 placeholder:text-gray-400"
              maxlength="500"
            />
            <div class="absolute bottom-2 right-2 text-xs text-gray-400">
              {{ formData.description.length }}/500
            </div>
          </div>
        </div>

        <div v-if="!formData.isFasted" class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="text-sm font-medium text-gray-700 block">拍照记录 <span class="text-red-500">*</span></label>
            <input ref="photoInputRef" type="file" accept="image/*" multiple class="hidden" @change="handlePhotoSelect" />
            <span class="text-xs text-gray-400">{{ photos.length }}/3 张</span>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div v-for="(url, idx) in photos" :key="idx" class="relative aspect-square rounded-lg overflow-hidden border border-gray-100 animate-pop-in">
              <img loading="lazy" decoding="async" :src="url" :alt="`上传的照片 ${idx + 1}`" class="w-full min-h-full object-cover" />
              <button
                @click="removePhoto(idx)"
                class="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white hover:bg-black/70"
              >
                <X class="w-3 h-3" />
              </button>
            </div>

            <button
              v-if="photos.length < 3"
              @click="photoInputRef?.click()"
              class="aspect-square flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:bg-white transition-colors active:scale-95"
            >
              <Camera class="w-6 h-6 mb-1 text-gray-400" />
              <span class="text-[10px]">添加照片</span>
            </button>
          </div>
        </div>

        <div v-if="error" class="text-red-500 text-sm text-center animate-shake">{{ error }}</div>
      </Card>
    </div>

    <!-- ══════════ Tab 2: 记录 ══════════ -->
    <div v-show="activeTab === 'records'" class="p-4 space-y-3">
      <div v-if="groupedHistory.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100 animate-pop-in">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-[#FF976A]/10 flex items-center justify-center">
          <UtensilsCrossed class="w-8 h-8 text-[#FF976A]" />
        </div>
        <div class="text-sm font-bold text-gray-700 mb-1">还没有饮食记录</div>
        <div class="text-xs text-gray-400">拍下今天的第一餐，让营养师帮你把关</div>
      </div>
      <div v-else class="space-y-4">
        <div v-for="group in historyVisible" :key="group.date" :id="`diet-group-${group.date}`">
          <!-- Date header -->
          <button
            @click="handleToggleDate(group.date)"
            class="w-full flex items-center justify-between bg-white rounded-xl px-4 py-2.5 mb-2 border border-gray-100 sticky top-[104px] z-10 shadow-sm"
          >
            <div class="flex items-center gap-2">
              <span class="w-1 h-4 rounded-full bg-[#FF976A]"></span>
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
          <div v-show="isExpanded(group.date)" class="space-y-4 animate-pop-in">
            <Card v-for="record in group.records" :key="record.id" class="p-0 overflow-hidden">
              <div class="p-4 border-b border-gray-50">
                <div class="flex justify-between items-center mb-3">
                  <span class="text-xs text-gray-500 font-medium">{{ formatDateTime(record.date) }}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded text-[#FF976A] bg-[#FF976A]/10 font-bold uppercase">
                    {{ mealLabel(record.meal) }}
                  </span>
                </div>

                <p class="text-sm text-gray-900 mb-3 whitespace-pre-wrap">{{ record.description }}</p>

                <!-- 营养师评定的餐次结构标签 -->
                <div v-if="record.hasStaple || record.hasProtein || record.hasVegetable" class="flex flex-wrap gap-1.5 mb-3">
                  <span class="text-[10px] text-gray-400 self-center">营养师评定:</span>
                  <span v-if="record.hasStaple" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">🍚 主食</span>
                  <span v-if="record.hasProtein" class="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 font-medium">🥩 蛋白质</span>
                  <span v-if="record.hasVegetable" class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">🥬 蔬菜</span>
                </div>

                <div class="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <img
                    v-for="(url, idx) in record.photos"
                    :key="idx"
                    :src="thumbUrl(url)"
                    alt="食物"
                    class="h-20 w-20 object-cover rounded-lg shrink-0 snap-center border border-gray-100 cursor-pointer"
                    loading="lazy"
                    decoding="async"
                    @click="store.openImagePreview(record.photos || [], idx)"
                  />
                </div>
              </div>

              <div v-if="record.dietitianComment || typeof record.dietitianScore === 'number'" class="bg-[#07C160]/5 p-4 relative">
                <div class="absolute top-0 left-0 w-1 min-h-full bg-[#07C160]"></div>
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="text-xs font-bold text-[#07C160]">营养师批注</span>
                  <span v-if="record.dietitianScore === 2" class="text-[10px] font-bold text-white bg-[#07C160] px-1.5 py-0.5 rounded">+2</span>
                  <span v-else-if="record.dietitianScore === 1" class="text-[10px] font-bold text-white bg-[#FF976A] px-1.5 py-0.5 rounded">+1</span>
                  <span v-else-if="record.dietitianScore === 0" class="text-[10px] font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded">0</span>
                  <span v-if="record.dietitianComment && !record.commentRead" class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                </div>
                <CheckinComments :comments="recordComments(record)" />
              </div>
            </Card>
          </div>
        </div>
        <!-- 更早记录分片加载（首屏少渲染，减少图片/DOM；下滑加载更早） -->
        <button
          v-if="hasMoreHistory"
          @click="loadMoreHistory"
          class="w-full py-2.5 mt-3 text-xs font-bold text-[#FF976A] bg-white border border-[#FF976A]/30 rounded-xl active:bg-orange-50"
        >
          加载更早的记录（{{ groupedHistory.length - historyVisible.length }} 天未加载）
        </button>
      </div>
    </div>

    <!-- 固定悬浮底部打卡按钮（仅打卡Tab显示） -->
    <div v-show="activeTab === 'checkin'" class="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[#F7F8FA] via-[#F7F8FA]/95 to-transparent">
      <Button
        class="w-full bg-[#FF976A] hover:bg-[#e8855a] active:bg-[#d97746] disabled:bg-[#FF976A]/50 text-white shadow-lg shadow-[#FF976A]/30 active:scale-95 transition-transform"
        size="lg"
        @click="handleSubmit"
        :disabled="!formData.meal"
      >
        {{ formData.meal ? '提交打卡' : '今日已全部打卡' }}
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
</style>
