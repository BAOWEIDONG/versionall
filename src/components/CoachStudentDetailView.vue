<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount, nextTick } from 'vue';
import { format } from 'date-fns';
import { useAppStore, questionnaireStorageKey } from '../store/app';
import { campDateRange } from '../lib/camps';
import { MOCK_STUDENTS } from '../mock/data';
import { NavBar, Card, Button, ChartRulePopup, CheckinComments } from './ui';
import { recordComments } from '../lib/comments';
import WeightTrendChart from './ui/WeightTrendChart.vue';
import ExerciseTrendCard from './ExerciseTrendCard.vue';
import { UserCircle, Activity, Scale, MessageCircle, PlayCircle, ChevronDown, Stethoscope, ClipboardList, AlertCircle, FileText, TrendingUp } from 'lucide-vue-next';
import { Popup as VanPopup, showToast } from 'vant';
import { formatDateTime } from '../lib/utils';
import { useDateGrouping } from '../composables/useDateGrouping';
import type { ExerciseRecord } from '../types';
import { MOCK_METRIC_VALUES, MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { buildMedicalData, isValueOutOfRange, type MedicalCategory, type Indicator } from '../lib/medicalData';

const store = useAppStore();
const student = computed(() => MOCK_STUDENTS.find(s => s.id === store.selectedStudentId));

// ─── 营期切换 ───
const studentCamps = computed(() => store.selectedStudentId ? store.getStudentCamps(store.selectedStudentId) : []);
const selectedCampId = ref<string>('');
const showCampPicker = ref(false);
const selectedCamp = computed(() => studentCamps.value.find(c => c.id === selectedCampId.value) || null);

watch(() => store.selectedStudentId, (id) => {
  if (id) {
    if (store.detailSelectedCampId && studentCamps.value.some(c => c.id === store.detailSelectedCampId)) {
      // 详情流已选营期 -> 继承（不影响全局）
      selectedCampId.value = store.detailSelectedCampId;
    } else if (!store.detailSelectedCampId) {
      // 全部营期模式 -> 不选具体营期，展示全部数据（有意保留跨营合并视图，不默认回落最新一期）
      selectedCampId.value = '';
    } else {
      const campId = store.getStudentCampId(id);
      if (campId) selectedCampId.value = campId;
    }
  }
}, { immediate: true });

watch(selectedCampId, (newId) => {
  store.detailSelectedCampId = newId || null;
});

// 按营期过滤运动记录
const campExerciseRecords = computed(() => {
  if (!selectedCampId.value) return store.exerciseRecords;
  return store.getCampExerciseRecords(selectedCampId.value);
});
const campWeightRecords = computed(() => {
  if (!selectedCampId.value) return store.weightRecords;
  return store.getCampWeightRecords(selectedCampId.value);
});

const activeTab = ref<'exercise' | 'weight' | 'medical' | 'questionnaire'>('exercise');

// ─── Exercise tab ───
const studentExercises = computed(() =>
  campExerciseRecords.value
    .filter(r => r.studentId === store.selectedStudentId)
    .sort((a, b) => b.date.localeCompare(a.date))
);

const {
  grouped: groupedExerciseRecords,
  toggleDate: toggleExerciseDate,
  isExpanded: isExerciseExpanded,
} = useDateGrouping(studentExercises, { defaultExpandAll: true });

// 运动批注
const exerciseCommentingId = ref<string | null>(null);
const exerciseCommentText = ref('');
const exerciseScore = ref<0 | 1 | 2>(1);

const EXERCISE_TEMPLATES = [
  '运动强度很好，继续保持！',
  '时长达标，非常好',
  '强度偏高，注意循序渐进，避免受伤',
  '建议延长到 40 分钟以上，燃脂效果更好',
  '运动后记得拉伸放松',
];

// ─── 批注编辑锁（并发串行）：打开批注编辑器即持锁，保存/取消/离开释放，避免两人同时批注同一学员互相覆盖（先后提交） ───
const heldLocks: { type: 'diet' | 'weight' | 'exercise'; recordId: string }[] = [];
function tryAcquireLock(type: 'diet' | 'weight' | 'exercise', recordId: string): boolean {
  const res = store.tryLockAnnotation(type, recordId, store.user?.id || '', store.user?.name || '教练');
  if (!res.ok) {
    showToast(`${res.byName} 正在编辑此条批注，请稍后再试`);
    return false;
  }
  if (!heldLocks.some((h) => h.type === type && h.recordId === recordId)) heldLocks.push({ type, recordId });
  return true;
}
function releaseLock(type: 'diet' | 'weight' | 'exercise', recordId: string) {
  const i = heldLocks.findIndex((h) => h.type === type && h.recordId === recordId);
  if (i >= 0) heldLocks.splice(i, 1);
  store.releaseAnnotationLock(type, recordId);
}
function releaseAllLocks() {
  heldLocks.slice().forEach((h) => store.releaseAnnotationLock(h.type, h.recordId));
  heldLocks.length = 0;
}
onBeforeUnmount(releaseAllLocks);
onDeactivated(releaseAllLocks);

const startExerciseComment = (record: ExerciseRecord) => {
  // 切换编辑对象时释放上一对象锁，防残留占用
  if (exerciseCommentingId.value && exerciseCommentingId.value !== record.id) releaseLock('exercise', exerciseCommentingId.value);
  if (!tryAcquireLock('exercise', record.id)) return;
  exerciseCommentingId.value = record.id;
  // 单一批注：预填当前共享批注（不管谁写的都是同一条，共同编辑）
  exerciseCommentText.value = recordComments(record).find((c) => c.role === 'coach')?.text || '';
  exerciseScore.value = (record.coachScore ?? 1) as 0 | 1 | 2;
};
const cancelExerciseComment = () => {
  if (exerciseCommentingId.value) releaseLock('exercise', exerciseCommentingId.value);
  exerciseCommentingId.value = null;
  exerciseCommentText.value = '';
  exerciseScore.value = 1;
};
const handleSaveExerciseComment = (recordId: string) => {
  store.addRecordComment('exercise', recordId, {
    id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: 'coach',
    name: store.user?.name || '教练',
    text: exerciseCommentText.value,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  });
  store.updateExerciseRecord(recordId, {
    coachScore: exerciseScore.value,
    // 新批注/新评分需重置已读，学员端才会亮"新批注"并计入未读数（与营养师批注口径一致）
    commentRead: false,
  });
  releaseLock('exercise', recordId);
  cancelExerciseComment();
};

// ─── Weight tab (read-only) ───
const studentWeights = computed(() => {
  const id = store.selectedStudentId;
  if (!id) return [];
  return campWeightRecords.value
    .filter(r => r.studentId === id)
    .sort((a, b) => a.date.localeCompare(b.date));
});

const weightStats = computed(() => {
  const recs = studentWeights.value;
  if (recs.length === 0) return null;
  const weights = recs.map(r => r.weight);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const change = parseFloat((last - first).toFixed(1));
  const changePercent = first !== 0 ? parseFloat(((change / Math.abs(first)) * 100).toFixed(1)) : null;
  return { first, last, change, changePercent, min: Math.min(...weights), max: Math.max(...weights), count: weights.length };
});

// ─── Weight date grouping (按天聚类) ───
const {
  grouped: groupedWeightRecords,
  toggleDate: toggleWeightDate,
  isExpanded: isWeightExpanded,
} = useDateGrouping(studentWeights, { defaultExpandAll: true });

/** 获取当前记录的上一条体重记录的 weight 值 */
const getPrevWeight = (rec: { id: string }): number | null => {
  const allRecs = studentWeights.value;
  const idx = allRecs.findIndex(r => r.id === rec.id);
  if (idx <= 0) return null;
  return allRecs[idx - 1].weight;
};

// ─── Medical tab (read-only) ───
const getStudentMetrics = (studentId?: string) => {
  if (!studentId) return MOCK_METRIC_VALUES;
  return MOCK_STUDENT_METRIC_VALUES[studentId] || MOCK_METRIC_VALUES;
};
const medicalData = ref<MedicalCategory[]>(JSON.parse(JSON.stringify(buildMedicalData(store.metricConfigs, getStudentMetrics(student.value?.id), student.value?.gender))));
const collapsedCats = ref<Set<string>>(new Set());
const toggleCat = (title: string) => {
  const next = new Set(collapsedCats.value);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  collapsedCats.value = next;
};
// 切换学员时重建医疗数据
watch(() => student.value?.id, () => {
  const vals = getStudentMetrics(student.value?.id);
  medicalData.value = JSON.parse(JSON.stringify(buildMedicalData(store.metricConfigs, vals, student.value?.gender)));
}, { immediate: true });

// ─── Questionnaire tab (read-only) ───
const qData = ref<any>(null);
onMounted(() => {
  const saved = localStorage.getItem(questionnaireStorageKey('submitted', store.selectedStudentId || 'none')) || localStorage.getItem(questionnaireStorageKey('draft', store.selectedStudentId || 'none'));
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      qData.value = parsed.formData || parsed;
    } catch (e) {
      // ignore
    }
  }
});
const openReport = (r: any) => {
  if (r.type === 'pdf') window.open(r.url, '_blank');
  else store.openImagePreview([r.url], 0);
};
// 批注深链（与营养师同一套 pendingAnnotation 机制）：进入/返回时定位+高亮目标运动记录
const consumePendingAnnotation = () => {
  const type = store.pendingRecordType;
  const recordId = store.pendingRecordId;
  if (!type) return;
  if (type === 'exercise') activeTab.value = 'exercise';
  nextTick(() => {
    if (recordId) {
      const el = document.getElementById(`record-${recordId}`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('ring-2', 'ring-[#07C160]');
        setTimeout(() => el.classList.remove('ring-2', 'ring-[#07C160]'), 2000);
      }
    }
    store.setPendingAnnotation(null);
  });
};
onMounted(consumePendingAnnotation);
onActivated(consumePendingAnnotation);

</script>

<template>
  <div v-if="!student" class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe">
    <NavBar title="学员详情" :on-back="store.goBack" />
    <div class="flex-1 flex items-center justify-center text-gray-500 text-sm">
      未选择学员
    </div>
  </div>

  <div v-else class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe relative font-sans">
    <NavBar :title="`${student.name} 的运动档案`" :on-back="store.goBack" />

    <!-- 学员信息 + 营期切换 -->
    <div class="bg-white px-4 pt-4 border-b border-gray-200 space-y-4">
      <Card class="flex items-center justify-between p-4 bg-[#07C160]/5 border-[#07C160]/20">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 rounded-full bg-[#07C160]/10 flex items-center justify-center text-[#07C160]">
            <UserCircle class="h-6 w-6" />
          </div>
          <div>
            <div class="text-sm font-bold text-gray-900 mb-1">{{ student.name }}</div>
            <div class="text-xs text-gray-500">
              {{ student.gender === 'male' ? '男' : '女' }} · {{ student.age }}岁 · {{ student.phone }}
            </div>
          </div>
        </div>
      </Card>

      <!-- 营期切换 -->
      <div v-if="studentCamps.length >= 1" class="bg-white px-4 py-2.5 flex items-center justify-between rounded-xl border border-gray-100 mb-4">
        <div>
          <span class="text-xs text-gray-500">当前营期：</span>
          <span class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '全部营期' }}</span>
        </div>
        <button class="text-xs text-[#07C160] border border-[#07C160] px-2.5 py-1 rounded-full font-bold active:bg-green-50" @click="showCampPicker = true">
          切换
        </button>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="bg-white px-4 border-b border-gray-200 sticky top-14 z-10">
      <div class="flex gap-4 overflow-x-auto whitespace-nowrap py-1 no-scrollbar">
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors shrink-0', activeTab === 'exercise' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'exercise'"
        >
          运动打卡
        </button>
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors shrink-0', activeTab === 'weight' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'weight'"
        >
          体重趋势
        </button>
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors shrink-0', activeTab === 'medical' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'medical'"
        >
          基础医疗
        </button>
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors shrink-0', activeTab === 'questionnaire' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'questionnaire'"
        >
          自查问卷
        </button>
      </div>
    </div>

    <!-- Exercise tab -->
    <template v-if="activeTab === 'exercise'">
      <!-- 每日运动趋势（与学员端/营养师端共享统一组件：标题+规则+统计+图） -->
      <div v-if="studentExercises.length > 0" class="px-4 mt-4">
        <ExerciseTrendCard :records="studentExercises" />
      </div>

      <div v-if="studentExercises.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100 mx-4 mt-4">
        <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#07C160]/10 flex items-center justify-center">
          <Activity class="w-7 h-7 text-[#07C160]" />
        </div>
        <div class="text-sm font-bold text-gray-700">该学员暂无运动打卡记录</div>
      </div>

      <div v-else class="px-4 mt-4 space-y-4">
        <div v-for="group in groupedExerciseRecords" :key="group.date">
          <!-- Date header -->
          <div @click="toggleExerciseDate(group.date)" class="flex items-center gap-2 px-1 py-2 cursor-pointer select-none">
            <div class="w-1 h-4 bg-[#07C160] rounded-full"></div>
            <span class="text-sm font-bold text-gray-900">{{ group.label }}</span>
            <span class="text-[10px] text-gray-400">{{ group.records.length }} 条</span>
            <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', !isExerciseExpanded(group.date) ? '-rotate-90' : '']" />
          </div>
          <div v-show="isExerciseExpanded(group.date)" class="space-y-3">
            <Card v-for="record in group.records" :key="record.id" :id="`record-${record.id}`" class="p-0 overflow-hidden transition-all duration-300">
              <div class="p-4 border-b border-gray-50">
                <div class="flex justify-between items-center mb-3">
                  <span class="text-xs text-gray-500 font-medium">{{ formatDateTime(record.date) }}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded text-[#07C160] bg-[#07C160]/10 font-bold uppercase flex items-center gap-1">
                    <Activity class="w-3 h-3" />
                    {{ record.type }}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-3 bg-gray-50 p-3 rounded-xl">
                  <div>
                    <div class="text-[10px] text-gray-500 mb-0.5">运动时长</div>
                    <div class="text-sm font-bold text-gray-900">{{ record.duration }} <span class="text-xs font-normal">分钟</span></div>
                  </div>
                  <div>
                    <div class="text-[10px] text-gray-500 mb-0.5">强度 (1-5)</div>
                    <div class="text-sm font-bold text-gray-900 flex gap-1">
                      <div v-for="v in 5" :key="v" :class="['w-2 h-3 rounded-full', v <= record.intensity ? 'bg-[#07C160]' : 'bg-gray-200']" />
                    </div>
                  </div>
                </div>

                <div v-if="record.notes" class="mb-3">
                  <p class="text-sm text-gray-900 whitespace-pre-wrap">{{ record.notes }}</p>
                </div>

                <div v-if="record.photos && record.photos.length > 0" class="flex gap-2 overflow-x-auto pb-1">
                  <img loading="lazy" decoding="async"
                    v-for="(url, idx) in record.photos"
                    :key="idx"
                    :src="url"
                    alt="运动"
                    class="h-20 w-20 object-cover rounded-lg shrink-0 border border-gray-100 cursor-pointer"
                    @click="store.openImagePreview(record.photos || [], idx)"
                  />
                </div>

                <div v-if="record.videoUrls && record.videoUrls.length > 0" class="flex gap-2 overflow-x-auto pb-1">
                  <div
                    v-for="(url, idx) in record.videoUrls"
                    :key="idx"
                    class="h-20 w-20 rounded-lg shrink-0 border border-gray-100 overflow-hidden relative bg-black cursor-pointer"
                    @click="store.openVideoPreview(url)"
                  >
                    <video :src="url" class="w-full h-full object-cover" preload="metadata" playsinline webkit-playsinline />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                      <PlayCircle class="w-6 h-6 text-white drop-shadow" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- 教练批注区域 -->
              <div class="p-4 bg-gray-50/50">
                <div v-if="exerciseCommentingId === record.id" class="space-y-3">
                  <!-- 运动打分 -->
                  <div class="flex items-center gap-3">
                    <label class="text-sm text-gray-700 font-medium">运动评分:</label>
                    <div class="flex items-center bg-gray-100 rounded-lg p-1">
                      <button
                        :class="['px-3 py-1 rounded-md text-xs font-bold transition-colors', exerciseScore === 2 ? 'bg-[#07C160] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
                        @click="exerciseScore = 2"
                      >
                        +2 (到位)
                      </button>
                      <button
                        :class="['px-3 py-1 rounded-md text-xs font-bold transition-colors', exerciseScore === 1 ? 'bg-[#FF976A] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
                        @click="exerciseScore = 1"
                      >
                        +1 (尚可)
                      </button>
                      <button
                        :class="['px-3 py-1 rounded-md text-xs font-bold transition-colors', exerciseScore === 0 ? 'bg-gray-400 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
                        @click="exerciseScore = 0"
                      >
                        0 (未达标)
                      </button>
                    </div>
                  </div>
                  <!-- 快捷回复模板 -->
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="tpl in EXERCISE_TEMPLATES"
                      :key="tpl"
                      @click="exerciseCommentText = exerciseCommentText ? exerciseCommentText + '，' + tpl : tpl"
                      class="text-[10px] px-2 py-1 rounded-full bg-[#07C160]/10 text-[#07C160] font-medium active:scale-95 transition-transform"
                    >
                      {{ tpl }}
                    </button>
                  </div>
                  <textarea
                    class="w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:border-[#07C160]"
                    rows="3"
                    placeholder="输入运动批注..."
                    :value="exerciseCommentText"
                    @input="exerciseCommentText = ($event.target as HTMLTextAreaElement).value"
                  />
                  <div class="flex justify-end gap-2">
                    <Button variant="outline" size="sm" @click="cancelExerciseComment">取消</Button>
                    <Button class="bg-[#07C160] text-white" size="sm" @click="handleSaveExerciseComment(record.id)">保存</Button>
                  </div>
                </div>
                <div v-else-if="record.coachComment || typeof record.coachScore === 'number'" class="relative group">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-[#07C160]">教练批注</span>
                      <span v-if="typeof record.coachScore === 'number'" :class="['text-[10px] px-1.5 py-0.5 rounded font-bold', record.coachScore >= 2 ? 'bg-green-100 text-green-700' : record.coachScore === 1 ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-600']">
                        +{{ record.coachScore }}
                      </span>
                    </div>
                  </div>
                  <CheckinComments :comments="recordComments(record)" />
                  <div class="flex items-center gap-2 mt-1">
                    <button @click="startExerciseComment(record)" class="text-xs text-[#07C160]">编辑</button>
                  </div>
                </div>
                <button v-else @click="startExerciseComment(record)" class="flex items-center gap-1 text-sm text-[#07C160] font-medium">
                  <MessageCircle class="w-4 h-4" />
                  添加批注
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </template>

    <!-- Weight tab (read-only) -->
    <template v-if="activeTab === 'weight'">
      <div v-if="studentWeights.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100 mx-4 mt-4">
        <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#1677FF]/10 flex items-center justify-center">
          <Scale class="w-7 h-7 text-[#1677FF]" />
        </div>
        <div class="text-sm font-bold text-gray-700">该学员暂无体重打卡记录</div>
      </div>

      <div v-else class="px-4 mt-4 space-y-4">
        <!-- Summary stats -->
        <div class="grid grid-cols-4 gap-2">
          <div class="bg-white rounded-xl p-3 text-center border border-gray-100">
            <div class="text-[10px] text-gray-500 mb-1">初始体重</div>
            <div class="text-base font-bold text-gray-900">{{ weightStats?.first }}<span class="text-[10px] font-normal text-gray-400 ml-0.5">kg</span></div>
          </div>
          <div class="bg-white rounded-xl p-3 text-center border border-gray-100">
            <div class="text-[10px] text-gray-500 mb-1">最新体重</div>
            <div class="text-base font-bold text-gray-900">{{ weightStats?.last }}<span class="text-[10px] font-normal text-gray-400 ml-0.5">kg</span></div>
          </div>
          <div :class="['rounded-xl p-3 text-center border', (weightStats?.change ?? 0) < 0 ? 'bg-[#07C160]/5 border-[#07C160]/20' : 'bg-orange-50 border-orange-200']">
            <div class="text-[10px] text-gray-500 mb-1">总变化</div>
            <div :class="['text-base font-bold', (weightStats?.change ?? 0) < 0 ? 'text-[#07C160]' : 'text-orange-500']">
              {{ weightStats && weightStats.change > 0 ? '+' : '' }}{{ weightStats?.change }}<span class="text-[10px] font-normal ml-0.5">kg</span>
            </div>
          </div>
          <div class="bg-white rounded-xl p-3 text-center border border-gray-100">
            <div class="text-[10px] text-gray-500 mb-1">打卡次数</div>
            <div class="text-base font-bold text-gray-900">{{ weightStats?.count }}<span class="text-[10px] font-normal text-gray-400 ml-0.5">次</span></div>
          </div>
        </div>

        <!-- Weight trend chart -->
        <WeightTrendChart :records="studentWeights" :gradient-id="`wg-coach-${student?.id}`" />

        <!-- Weight record history (read-only) -->
        <Card class="p-0 overflow-hidden">
          <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            <Scale class="w-4 h-4 text-[#07C160]" />
            <h3 class="font-bold text-gray-900 text-sm">体重记录</h3>
            <span class="text-[10px] text-gray-400 ml-auto">共 {{ studentWeights.length }} 条记录</span>
          </div>
          <div class="divide-y divide-gray-50">
            <div v-for="group in groupedWeightRecords" :key="group.date">
              <div @click="toggleWeightDate(group.date)" class="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                <div class="w-1 h-4 bg-[#1677FF] rounded-full"></div>
                <span class="text-sm font-bold text-gray-900">{{ group.label }}</span>
                <span class="text-[10px] text-gray-400">{{ group.records.length }} 条</span>
                <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', !isWeightExpanded(group.date) ? '-rotate-90' : '']" />
              </div>
              <div v-show="isWeightExpanded(group.date)">
                <div
                  v-for="rec in group.records"
                  :key="rec.id"
                  class="px-4 py-3"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full bg-[#07C160]/8 flex items-center justify-center text-[#07C160] shrink-0">
                        <Scale class="w-4 h-4" />
                      </div>
                      <div>
                        <div class="text-sm font-medium text-gray-900">{{ rec.weight }} kg</div>
                        <div class="text-[10px] text-gray-400">{{ formatDateTime(rec.date) }}</div>
                      </div>
                    </div>
                    <div v-if="getPrevWeight(rec) !== null" class="text-right">
                      <div :class="['text-xs font-bold', (rec.weight - getPrevWeight(rec)!) < 0 ? 'text-[#07C160]' : 'text-orange-500']">
                        {{ (rec.weight - getPrevWeight(rec)!) > 0 ? '+' : '' }}{{ (rec.weight - getPrevWeight(rec)!).toFixed(1) }} kg
                      </div>
                      <div class="text-[10px] text-gray-400">较上次</div>
                    </div>
                    <div v-else class="text-right">
                      <div class="text-[10px] text-gray-400">首次记录</div>
                    </div>
                  </div>

                  <div v-if="rec.photos && rec.photos.length > 0" class="mt-2 ml-11 flex gap-2 overflow-x-auto pb-1">
                    <img loading="lazy" decoding="async"
                      v-for="(url, pIdx) in rec.photos"
                      :key="pIdx"
                      :src="url"
                      alt="体重打卡"
                      class="h-16 w-16 object-cover rounded-lg shrink-0 border border-gray-100 cursor-pointer"
                      @click="store.openImagePreview(rec.photos || [], pIdx)"
                    />
                  </div>

                  <div v-if="rec.dietitianComment" class="mt-2 ml-11">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-xs font-bold text-[#07C160]">营养师批注</span>
                      <span v-if="rec.dietitianCommentDate" class="text-[10px] text-gray-400">{{ rec.dietitianCommentDate }}</span>
                    </div>
                    <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ rec.dietitianComment }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- Medical tab (read-only) -->
    <template v-if="activeTab === 'medical'">
      <div class="p-4 space-y-4">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <div>
            <h3 class="font-bold text-gray-900 text-sm">基础医疗数据</h3>
            <p class="text-xs text-gray-500">学员体检指标（只读）</p>
          </div>
        </div>

        <Card v-for="(cat, idx) in medicalData" :key="idx" class="p-0 overflow-hidden">
          <div @click="toggleCat(cat.title)" class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-2 cursor-pointer hover:bg-gray-100/80 transition-colors select-none">
            <Stethoscope class="w-4 h-4 text-[#1677FF]" />
            <h3 class="font-bold text-gray-900 text-sm">{{ cat.title }}</h3>
            <span class="text-[10px] text-gray-400">{{ cat.items.length }} 项</span>
            <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', collapsedCats.has(cat.title) ? '-rotate-90' : '']" />
          </div>
          <div v-show="!collapsedCats.has(cat.title)" class="divide-y divide-gray-100">
            <div v-for="(item, iIdx) in cat.items" :key="iIdx" class="p-4">
              <div class="flex justify-between items-center mb-3">
                <div class="font-medium text-gray-900 text-sm">{{ item.name }}</div>
                <div class="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                  参考: {{ item.normalRange }} {{ item.unit }}
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-gray-50 p-2 rounded flex flex-col justify-center items-center">
                  <span class="text-[10px] text-gray-500 mb-1">开营前</span>
                  <div class="text-sm w-full flex justify-center">
                    <span :class="item.isBeforeOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">
                      <span v-if="item.beforeValue === null" class="text-gray-400 font-normal">-- 未上传</span>
                      <template v-else>{{ item.beforeValue }}</template>
                    </span>
                    <span v-if="item.beforeValue !== null && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                  </div>
                </div>
                <div class="bg-[#07C160]/5 p-2 rounded flex flex-col justify-center items-center border border-[#07C160]/10">
                  <span class="text-[10px] text-[#07C160] font-medium mb-1">结营后</span>
                  <div class="text-sm w-full flex justify-center">
                    <span :class="item.isAfterOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">
                      <span v-if="item.afterValue === null" class="text-gray-400 font-normal">-- 待更新</span>
                      <template v-else>{{ item.afterValue }}</template>
                    </span>
                    <span v-if="item.afterValue !== null && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- Questionnaire tab (read-only) -->
    <template v-if="activeTab === 'questionnaire'">
      <div class="p-4 space-y-4">
        <Card>
          <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
            <FileText class="h-4 w-4 text-[#07C160]" />
            学员体检报告
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <template v-if="qData?.medicalReports && qData.medicalReports.length > 0">
              <div
                v-for="(r, idx) in qData.medicalReports"
                :key="idx"
                class="relative aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:border-[#07C160]"
                @click="openReport(r)"
              >
                <div v-if="r.type === 'pdf'" class="w-full min-h-full flex flex-col items-center justify-center bg-gray-50 text-[#07C160]">
                  <FileText class="w-8 h-8 mb-1" />
                  <span class="text-[10px] text-gray-500 truncate px-1">{{ r.name || 'PDF报告' }}</span>
                </div>
                <img loading="lazy" decoding="async" v-else :src="r.url" :alt="`报告 ${idx + 1}`" class="w-full min-h-full object-cover" />
                <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-2 truncate">
                  {{ r.type === 'pdf' ? (r.name || `体检报告_第${idx + 1}页`) : `体检报告_第${idx + 1}页` }}
                </div>
              </div>
            </template>
            <div v-else class="col-span-2 text-center text-xs text-gray-400 py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              暂无体检报告
            </div>
          </div>
        </Card>

        <Card>
          <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
            <ClipboardList class="h-4 w-4 text-[#07C160]" />
            基础与健康信息
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">身高</span><span class="text-gray-900">{{ qData?.height || '170' }} cm</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">体重</span><span class="text-gray-900">{{ qData?.weight || '65' }} kg</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">疾病史/慢性疾病</span><span class="text-gray-900">{{ qData?.hasChronic === '有' ? qData.chronicDetails : (qData?.hasChronic === '无' ? '无' : '无') }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">特殊饮食</span><span class="text-gray-900">{{ qData?.hasSpecialDiet === '有' ? qData.specialDietDetails : (qData?.hasSpecialDiet === '无' ? '无' : '无') }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">过敏史/食物过敏</span><span class="text-gray-900">{{ qData?.hasFoodAllergy === '有' ? qData.foodAllergyDetails : (qData?.hasFoodAllergy === '无' ? '无' : '无') }}</span></div>
          </div>
        </Card>

        <Card>
          <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
            <AlertCircle class="h-4 w-4 text-[#07C160]" />
            生活与运动习惯
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">作息时间</span><span class="text-gray-900">{{ qData?.sleepTime || '23:00' }} - {{ qData?.wakeTime || '07:00' }} ({{ qData?.sleepDuration || '8' }}h)</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">饮酒/吸烟</span><span class="text-gray-900">{{ qData?.drinkAlcohol || '偶尔' }} / {{ qData?.smoke || '从不' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">经常吃零食</span><span class="text-gray-900">{{ qData?.snack || '否' }}</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">日饮水量</span><span class="text-gray-900">{{ qData?.dailyWater || '2000' }} ml</span></div>
            <div class="flex justify-between border-b border-gray-50 pb-2"><span class="text-gray-500">每周运动</span><span class="text-gray-900">{{ qData?.exerciseFrequency || '3' }}次 (每次{{ qData?.exerciseDuration || '45' }}分钟)</span></div>
            <div class="flex justify-between"><span class="text-gray-500">运动类型</span><span class="text-gray-900 text-right">{{ qData?.exerciseTypes ? qData.exerciseTypes.join(', ') : '跑步, 力量训练' }}</span></div>
          </div>
        </Card>
      </div>
    </template>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round class="custom-popup">
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            @click="selectedCampId = ''; showCampPicker = false"
            :class="['w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all', !selectedCampId ? 'border-[#07C160] bg-green-50 text-[#07C160]' : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50']"
          >
            <span class="font-medium">全部营期</span>
            <span class="text-xs text-gray-400">合并显示</span>
          </button>
          <button
            v-for="camp in studentCamps"
            :key="camp.id"
            @click="selectedCampId = camp.id; showCampPicker = false"
            :class="['w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all', selectedCampId === camp.id ? 'border-[#07C160] bg-green-50 text-[#07C160]' : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50']"
          >
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
            <span v-if="camp.status === 'active'" class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">进行中</span>
            <span v-else-if="camp.status === 'ended'" class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">已结束</span>
            <span v-else class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500">未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
