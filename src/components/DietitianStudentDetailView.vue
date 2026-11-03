<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount, nextTick } from 'vue';
import { format } from 'date-fns';
import { useAppStore, questionnaireStorageKey } from '../store/app';
import { MOCK_METRIC_VALUES, MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { NavBar, Card, Button, ChartRulePopup, CheckinComments } from './ui';
import { recordComments } from '../lib/comments';
import WeightTrendChart from './ui/WeightTrendChart.vue';
import { UserCircle, Coffee, MessageCircle, Stethoscope, ClipboardList, AlertCircle, FileText, Activity, Scale, PlayCircle, ChevronDown, ChevronUp, Eye, Plus, Minus, Trash2, Award } from 'lucide-vue-next';
import { showToast, showConfirmDialog } from 'vant';
import { buildMedicalData, isValueOutOfRange, type MedicalCategory, type Indicator } from '../lib/medicalData';
import { formatDateTime } from '../lib/utils';
import { useDateGrouping } from '../composables/useDateGrouping';
import { computeDietScoreTrends, computeExerciseTrends } from '../lib/journey';
import ExerciseTrendCard from './ExerciseTrendCard.vue';
import { calculateDietScore, calculateExerciseScore, calculateManualScore } from '../lib/scoring';
import type { DietRecord, WeightRecord, ExerciseRecord, ManualScoreRecord } from '../types';

const MEAL_TYPES = [
  { id: 'breakfast', label: '早餐' },
  { id: 'lunch', label: '午餐' },
  { id: 'dinner', label: '晚餐' },
  { id: 'snack', label: '加餐' },
];

const store = useAppStore();
const student = computed(() => store.students.find((s) => s.id === store.selectedStudentId));

// ─── 营期：学员档案页不支持本地切换，只展示「当前营期」（由首页全局营期切换控制） ───
const studentCamps = computed(() => store.selectedStudentId ? store.getStudentCamps(store.selectedStudentId) : []);
const selectedCamp = computed(() => {
  const gid = store.selectedCampId; // 全局当前营期（首页营期切换器控制）
  if (gid && studentCamps.value.some((c) => c.id === gid)) return studentCamps.value.find((c) => c.id === gid) || null;
  // 学员不在全局当前营期时，退回其 active/第一期（仅兜底展示，不提供切换）
  return studentCamps.value.find((c) => c.status === 'active') || studentCamps.value[0] || null;
});
const selectedCampId = computed(() => selectedCamp.value?.id || '');

// 按营期+学员过滤打卡记录
const campDietRecords = computed(() => {
  if (!selectedCampId.value) return store.dietRecords;
  return store.getCampDietRecords(selectedCampId.value);
});
const campExerciseRecords = computed(() => {
  if (!selectedCampId.value) return store.exerciseRecords;
  return store.getCampExerciseRecords(selectedCampId.value);
});
const campWeightRecords = computed(() => {
  if (!selectedCampId.value) return store.weightRecords;
  return store.getCampWeightRecords(selectedCampId.value);
});

// 快捷回复模板
const DIET_TEMPLATES = [
  '搭配很均衡，继续保持！',
  '蛋白质摄入充足，很好',
  '建议增加优质蛋白，如鸡蛋、鱼虾、豆制品',
  '蔬菜量偏少，建议每餐加一份绿叶菜',
  '主食偏多，建议减半，用粗粮替代',
  '油脂偏多，建议清淡少油',
  '这一餐偏少，记得按时吃饭哦',
];
const WEIGHT_TEMPLATES = [
  '体重稳步下降，很棒！',
  '体重有波动很正常，看长期趋势',
  '减重速度偏快，注意营养均衡',
  '建议固定早晨空腹称重，数据更可比',
];
// 结营寄语模板
const MESSAGE_TEMPLATES = [
  '坚持下来很不容易，你的自律大家都看在眼里，继续加油！',
  '体重数字只是开始，希望你把这段时间养成的习惯带到以后的生活里。',
  '结营不是结束，是健康生活的起点，有任何问题随时找我。',
  '这期进步很大，下期我们继续向目标冲刺！',
];

// 结营寄语（可多条：多名营养师/教练各自撰写提交 append 不覆盖；学员端结营报告逐条展示带角色姓名；
// 后端可用 PUT /camp/message/:studentId 持久化）
const campMessageText = ref('');
const campMessageSaved = ref(false);
const showCampMessage = ref(false);
const editingMessageId = ref('');
const existingMessages = computed(() => {
  if (!store.selectedStudentId || !selectedCampId.value) return [];
  return store.getCampMessages(selectedCampId.value, store.selectedStudentId);
});
// 是否本人撰写（authorId 匹配登录账号）；非本人寄语只读，不提供编辑入口
const isMyMessage = (m: { authorId?: string }) => !!m.authorId && m.authorId === store.user?.id;
// 本人是否已发布结营寄语（每人对该学员最多发布一条；已发布则只通过上方「编辑」修改，不显示"新建"框）
const hasMyMessage = computed(() => existingMessages.value.some(isMyMessage));
const loadCampMessage = () => {
  // 打开卡片：清空编辑态。本人已发布过的只通过列表里「编辑」修改；未发布才显示"首次发布"输入框。
  campMessageText.value = '';
  editingMessageId.value = '';
};
const startEditMessage = (m: { id: string; text: string }) => {
  editingMessageId.value = m.id;
  campMessageText.value = m.text;
  showCampMessage.value = true;
};
const cancelEditMessage = () => {
  editingMessageId.value = '';
  campMessageText.value = '';
};
const saveCampMessage = () => {
  const studentId = store.selectedStudentId;
  if (!studentId) return;
  if (!selectedCampId.value) return;
  if (editingMessageId.value) {
    // 编辑本人寄语：更新该条
    store.updateCampMessage(editingMessageId.value, campMessageText.value);
  } else {
    // append 一条新寄语（记角色=营养师+authorId），不让其覆盖历史寄语
    store.addCampMessage(selectedCampId.value, studentId, campMessageText.value, 'dietitian', store.user?.name || '营养师', store.user?.id);
  }
  campMessageText.value = '';
  editingMessageId.value = '';
  campMessageSaved.value = true;
  setTimeout(() => (campMessageSaved.value = false), 2000);
};

// 报告底部「结营建议」已移除：寄语已足够，营养师/学员端均不再展示结营建议。
const activeTab = ref<'diet' | 'exercise' | 'weight' | 'medical' | 'questionnaire' | 'score'>('diet');

// Diet tab - filtered by studentId AND campId
const records = computed(() =>
  campDietRecords.value.filter((r) => r.studentId === store.selectedStudentId).sort((a, b) => b.date.localeCompare(a.date)),
);
const commentingId = ref<string | null>(null);
const commentText = ref('');
const commentScore = ref<0 | 1 | 2>(1);
const commentStaple = ref(false);
const commentProtein = ref(false);
const commentVegetable = ref(false);

// Exercise tab - filtered by studentId AND campId
const studentExercises = computed(() =>
  campExerciseRecords.value.filter((r) => r.studentId === store.selectedStudentId).sort((a, b) => b.date.localeCompare(a.date)),
);

// 趋势图计算（与学员端 DietView/ExerciseView 完全对称，内容一致；使用营期过滤后的记录）
const exerciseTrends = computed(() => computeExerciseTrends(studentExercises.value, store.selectedStudentId || undefined));
const exerciseTrendMax = computed(() => Math.max(...exerciseTrends.value.map((t) => t.totalDuration), 1));

// ─── Date grouping for diet & exercise tabs ───────────────────────────
// 营养师端默认全部展开，便于查看学员历史数据
const {
  grouped: groupedDietRecords,
  toggleDate: toggleDietDate,
  isExpanded: isDietExpanded,
} = useDateGrouping(records, { defaultExpandAll: true });

const {
  grouped: groupedExerciseRecords,
  toggleDate: toggleExerciseDate,
  isExpanded: isExerciseExpanded,
} = useDateGrouping(studentExercises, { defaultExpandAll: true });

// Weight tab - data sourced from camp-filtered weight records
const studentWeights = computed(() => {
  const id = store.selectedStudentId;
  if (!id) return [];
  return campWeightRecords.value
    .filter((r) => r.studentId === id)
    .sort((a, b) => a.date.localeCompare(b.date));
});

// ─── Weight date grouping (与运动/饮食一致，按天聚类) ───
const {
  grouped: groupedWeightRecords,
  toggleDate: toggleWeightDate,
  isExpanded: isWeightExpanded,
} = useDateGrouping(studentWeights, { defaultExpandAll: true });

const weightStats = computed(() => {
  const recs = studentWeights.value;
  if (recs.length === 0) return null;
  const weights = recs.map((r) => r.weight);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const change = parseFloat((last - first).toFixed(1));
  const changePercent = first !== 0 ? parseFloat(((change / Math.abs(first)) * 100).toFixed(1)) : null;
  return { first, last, change, changePercent, min: Math.min(...weights), max: Math.max(...weights), count: weights.length };
});

/** 获取当前记录的上一条体重记录的 weight 值（用于"较上次"变化展示） */
const getPrevWeight = (rec: WeightRecord, group: { date: string; records: WeightRecord[] }): number | null => {
  const allRecs = studentWeights.value; // 已按时间升序排列
  const idx = allRecs.findIndex(r => r.id === rec.id);
  if (idx <= 0) return null;
  return allRecs[idx - 1].weight;
};

// ─── 批注编辑锁（并发串行）：打开批注编辑器即持锁，保存/取消/离开释放，避免两人同时批注同一学员互相覆盖（先后提交） ───
const heldLocks: { type: 'diet' | 'weight' | 'exercise'; recordId: string }[] = [];
function tryAcquireLock(type: 'diet' | 'weight' | 'exercise', recordId: string): boolean {
  const res = store.tryLockAnnotation(type, recordId, store.user?.id || '', store.user?.name || '营养师');
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

// Weight comment (营养师体重批注)
const weightCommentingId = ref<string | null>(null);
const weightCommentText = ref('');

const startWeightComment = (record: WeightRecord) => {
  // 切换编辑对象时释放上一对象锁，防残留占用
  if (weightCommentingId.value && weightCommentingId.value !== record.id) releaseLock('weight', weightCommentingId.value);
  if (!tryAcquireLock('weight', record.id)) return;
  weightCommentingId.value = record.id;
  // 单一批注：预填当前共享批注（不管谁写的都是同一条，共同编辑）
  weightCommentText.value = myDietitianComment(record)?.text || '';
};
const cancelWeightComment = () => {
  if (weightCommentingId.value) releaseLock('weight', weightCommentingId.value);
  weightCommentingId.value = null;
  weightCommentText.value = '';
};
const handleSaveWeightComment = (recordId: string) => {
  store.addRecordComment('weight', recordId, {
    id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: 'dietitian',
    name: store.user?.name || '营养师',
    text: weightCommentText.value,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  });
  releaseLock('weight', recordId);
  cancelWeightComment();
};

// Weight trend SVG chart → 已抽取到 ui/WeightTrendChart.vue

// Medical tab
// Medical tab - built from dynamic metric configs + per-student mock values, gender-aware
const getStudentMetrics = (studentId?: string) => {
  if (!studentId) return MOCK_METRIC_VALUES;
  return MOCK_STUDENT_METRIC_VALUES[studentId] || MOCK_METRIC_VALUES;
};

const medicalData = ref<MedicalCategory[]>(JSON.parse(JSON.stringify(buildMedicalData(store.metricConfigs, getStudentMetrics(student.value?.id), student.value?.gender))));
const isEditingMedical = ref(false);

// Collapsible category state - default all expanded
const collapsedCats = ref<Set<string>>(new Set());
const toggleCat = (title: string) => {
  const next = new Set(collapsedCats.value);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  collapsedCats.value = next;
};

// 切换学员时重建医疗数据（不同学员有各自的指标值和性别参考范围）
watch(() => student.value?.id, () => {
  const vals = getStudentMetrics(student.value?.id);
  medicalData.value = JSON.parse(JSON.stringify(buildMedicalData(store.metricConfigs, vals, student.value?.gender)));
  loadCampMessage();
}, { immediate: true });

// 切换营期时重新加载寄语
watch(selectedCampId, () => {
  loadCampMessage();
});

// Questionnaire tab
const qData = ref<any>(null);

// 批注深链（与教练端同一套 pendingAnnotation 机制）：从待批注列表/消息进入时自动切 Tab + 滚动定位+高亮目标记录
// ★KeepAlive 双挂：onMounted 只在首次挂载跑一次，订阅详情视图被缓存后再次进入 onMounted 不再触发 → 必须 onActivated 也跑；
// 否则「第二次开始点批注不自动定位」（v27 加 KeepAlive 后回归）。首次挂载时 onActivated 也触发，第一次执行即清掉 pending，二次调用空转，安全。
const consumePendingAnnotation = () => {
  const type = store.pendingRecordType;
  if (!type) return;
  const recordId = store.pendingRecordId;
  // 映射记录类型到 Tab
  const tabMap: Record<string, 'diet' | 'exercise' | 'weight'> = {
    diet: 'diet',
    exercise: 'exercise',
    weight: 'weight',
  };
  if (tabMap[type]) {
    activeTab.value = tabMap[type];
    nextTick(() => {
      if (recordId) {
        const el = document.getElementById(`record-${recordId}`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          // 高亮闪烁
          el.classList.add('ring-2', 'ring-[#FF976A]');
          setTimeout(() => el.classList.remove('ring-2', 'ring-[#FF976A]'), 2000);
        }
      }
      // 清除 pending 状态，避免来回切换时重复触发
      store.setPendingAnnotation(null);
    });
  }
};

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

  consumePendingAnnotation();
});
onActivated(consumePendingAnnotation);

const myDietitianComment = (rec: { comments?; dietitianComment?: string; dietitianName?: string }) =>
  recordComments(rec).find((c) => c.role === 'dietitian') || null;

const startComment = (record: DietRecord) => {
  // 切换编辑对象时释放上一对象锁，防残留占用
  if (commentingId.value && commentingId.value !== record.id) releaseLock('diet', commentingId.value);
  if (!tryAcquireLock('diet', record.id)) return;
  commentingId.value = record.id;
  // 单一批注：预填当前共享批注（不管谁写的都是同一条，共同编辑）
  commentText.value = myDietitianComment(record)?.text || '';
  commentScore.value = (record.dietitianScore ?? 1) as 0 | 1 | 2;
  commentStaple.value = !!record.hasStaple;
  commentProtein.value = !!record.hasProtein;
  commentVegetable.value = !!record.hasVegetable;
};

const cancelComment = () => {
  if (commentingId.value) releaseLock('diet', commentingId.value);
  commentingId.value = null;
  commentText.value = '';
  commentScore.value = 1;
  commentStaple.value = false;
  commentProtein.value = false;
  commentVegetable.value = false;
};

const handleSaveComment = (recordId: string) => {
  store.addRecordComment('diet', recordId, {
    id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: 'dietitian',
    name: store.user?.name || '营养师',
    text: commentText.value,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  });
  store.updateDietRecord(recordId, {
    dietitianScore: commentScore.value,
    commentRead: false,
    hasStaple: commentStaple.value,
    hasProtein: commentProtein.value,
    hasVegetable: commentVegetable.value,
  });
  releaseLock('diet', recordId);
  cancelComment();
};

const handleMedicalChange = (catIdx: number, itemIdx: number, field: 'beforeValue' | 'afterValue', value: string) => {
  const item: Indicator = medicalData.value[catIdx].items[itemIdx];
  (item as any)[field] = value ? Number(value) : null;
  const gender = student.value?.gender;
  if (field === 'beforeValue') {
    item.isBeforeOut = isValueOutOfRange(item.beforeValue, item.normalRange, gender);
  } else {
    item.isAfterOut = isValueOutOfRange(item.afterValue, item.normalRange, gender);
  }
};

const mealLabel = (meal: string) => MEAL_TYPES.find((m) => m.id === meal)?.label;
const scoreNum = (record: DietRecord) => record.dietitianScore ?? null;
const scoreBadgeCls = (record: DietRecord) => {
  const s = scoreNum(record);
  if (s == null) return 'bg-gray-100 text-gray-400';
  return s >= 2 ? 'bg-green-100 text-green-700' : s === 1 ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-600';
};

const openReport = (r: any) => {
  if (r.type === 'pdf') window.open(r.url, '_blank');
  else store.openImagePreview([r.url], 0);
};

// ─── 手动加减分 ──────────────────────────────────────────
const manualPoints = ref<number>(0);
const manualReason = ref('');
const manualMode = ref<'add' | 'subtract'>('add');

/** 当前学员的手动加减分记录（按营期过滤，与排行榜一致；按时间倒序） */
const studentManualScores = computed<ManualScoreRecord[]>(() => {
  if (!student.value) return [];
  return store.manualScoreRecords
    .filter((r) => {
      if (r.studentId !== student.value!.id) return false;
      // 与排行榜保持一致：按营期过滤（无 campId 的记录也纳入，兼容历史数据）
      if (selectedCampId.value && r.campId && r.campId !== selectedCampId.value) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

/** 手动加减分合计 */
const manualScoreTotal = computed(() => calculateManualScore(studentManualScores.value));

/** 积分明细 */
const scoreBreakdown = computed(() => {
  if (!student.value) return { diet: 0, exercise: 0, manual: 0, total: 0 };
  const diet = calculateDietScore(campDietRecords.value.filter((r) => r.studentId === student.value!.id));
  const exercise = calculateExerciseScore(campExerciseRecords.value.filter((r) => r.studentId === student.value!.id));
  const manual = manualScoreTotal.value;
  return { diet, exercise, manual, total: Math.max(0, diet + exercise + manual) };
});

function handleAddManualScore() {
  if (!student.value || !manualReason.value.trim()) return;
  const points = manualMode.value === 'add' ? Math.abs(manualPoints.value) : -Math.abs(manualPoints.value);
  if (points === 0) return;
  // 扣分护栏：不允许把学员总积分扣成负数
  if (points < 0) {
    const current = scoreBreakdown.value.total;
    if (current + points < 0) {
      showToast({ message: `当前积分 ${current}，本次扣 ${-points} 将变成负数，不允许扣分`, position: 'top', duration: 2500 });
      return;
    }
  }
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dateTimeStr = `${dateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  store.addManualScoreRecord({
    id: `ms_${Date.now()}`,
    studentId: student.value.id,
    points,
    reason: manualReason.value.trim(),
    dietitianName: store.user?.name || '营养师',
    createdAt: dateTimeStr,
    date: dateStr,
    campId: selectedCampId.value || undefined,
  });
  manualPoints.value = 0;
  manualReason.value = '';
  manualMode.value = 'add';
}

function handleDeleteManualScore(id: string) {
  showConfirmDialog({
    title: '确认删除',
    message: '删除后该条加减分将回退，积分会相应变化。确认删除？',
  }).then(() => {
    store.deleteManualScoreRecord(id);
  }).catch(() => {});
}
</script>

<template>
  <div v-if="!student" class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe">
    <NavBar title="学员详情" :on-back="store.goBack" />
    <div class="flex-1 flex items-center justify-center text-gray-500 text-sm">
      未选择学员
    </div>
  </div>

  <div v-else class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe relative font-sans">
    <NavBar :title="`${student.name} 的档案`" :on-back="store.goBack" />

    <div class="bg-white px-4 pt-4 pb-4 border-b border-gray-200 space-y-4">
      <Card class="flex items-center justify-between p-4 bg-[#FF976A]/5 border-[#FF976A]/20">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 rounded-full bg-[#FF976A]/10 flex items-center justify-center text-[#FF976A]">
            <UserCircle class="h-6 w-6" />
          </div>
          <div>
            <div class="text-sm font-bold text-gray-900 mb-1">{{ student.name }}</div>
            <div class="text-xs text-gray-500">
              {{ student.gender === 'male' ? '男' : '女' }} · {{ student.age }}岁 · {{ student.phone }}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="text-[#FF976A] border-[#FF976A] shrink-0 text-xs"
          @click="store.setCurrentView('pointsDetail')"
        >
          积分与排名
        </Button>
      </Card>

      <!-- 营期：学员档案页不支持切换，只展示当前营期（切换由首页全局营期选择器控制） -->
      <div v-if="selectedCamp" class="bg-white px-4 py-2.5 flex items-center justify-between rounded-xl border border-gray-100">
        <div class="flex items-center">
          <span class="text-xs text-gray-500">当前营期：</span>
          <span class="text-sm font-medium text-gray-800">{{ selectedCamp.name }}</span>
          <span v-if="selectedCamp.status === 'active'" class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 ml-1.5">进行中</span>
          <span v-else-if="selectedCamp.status === 'ended'" class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-1.5">已结束</span>
        </div>
      </div>

      <Card class="p-0 overflow-hidden border-[#07C160]/20 bg-[#07C160]/[0.03] shadow-sm">
        <button
          @click="showCampMessage = !showCampMessage"
          class="w-full flex items-center justify-between px-4 py-3"
        >
          <div class="flex items-center gap-2">
            <MessageCircle class="w-4 h-4 text-[#07C160]" />
            <h3 class="text-sm font-bold text-gray-900">结营寄语</h3>
            <span v-if="existingMessages.length > 0" class="text-[10px] text-[#07C160] bg-[#07C160]/10 px-1.5 py-0.5 rounded">已写 {{ existingMessages.length }} 条</span>
            <span v-else class="text-[10px] text-gray-400">未填写</span>
          </div>
          <component :is="showCampMessage ? ChevronUp : ChevronDown" class="w-4 h-4 text-gray-400 transition-transform" />
        </button>
        <div v-show="showCampMessage" class="px-4 pb-4 space-y-3">
          <!-- 历史寄语列表：逐条带角色+姓名+时间；非本人写的一律只读，本人写的可「编辑」 -->
          <div v-if="existingMessages.length > 0" class="space-y-2.5">
            <div v-for="m in existingMessages" :key="m.id"
                 class="rounded-lg border border-[#07C160]/15 bg-white p-3">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#07C160]/10 text-[#07C160]">{{ m.role === 'coach' ? '教练' : '营养师' }}</span>
                <span class="text-xs font-bold text-gray-800">{{ m.authorName }}</span>
                <span class="text-[10px] text-gray-400">{{ m.createdAt }}</span>
                <button
                  v-if="isMyMessage(m)"
                  @click="startEditMessage(m)"
                  class="ml-auto text-[11px] text-[#07C160] font-semibold"
                >编辑</button>
              </div>
              <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{{ m.text }}</p>
            </div>
          </div>
          <!-- 结营寄语输入框：本人已发布过则只通过上方「编辑」修改，不显示"新建"框，保证一营一人一条 -->
          <template v-if="editingMessageId || !hasMyMessage">
            <div v-if="editingMessageId" class="flex items-center justify-between rounded-lg bg-[#07C160]/10 px-3 py-2 text-[11px] text-[#07C160]">
              <span>正在编辑你的寄语，保存将更新该条</span>
              <button @click="cancelEditMessage" class="font-semibold underline">取消编辑</button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tpl in MESSAGE_TEMPLATES"
                :key="tpl"
                class="px-2.5 py-1 rounded-full text-[11px] border border-[#07C160]/30 text-[#07C160] bg-white hover:bg-[#07C160]/5 transition-colors"
                @click="campMessageText = campMessageText ? campMessageText + tpl : tpl"
              >{{ tpl.length > 12 ? tpl.slice(0, 12) + '…' : tpl }}</button>
            </div>
            <textarea
              :value="campMessageText"
              @input="campMessageText = ($event.target as HTMLTextAreaElement).value"
              rows="3"
              maxlength="200"
              :placeholder="editingMessageId ? '修改你的结营寄语' : '首次发布你的结营寄语，将显示在学员结营报告中'"
              class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-[#07C160] focus:ring-1 focus:ring-[#07C160]/20 outline-none resize-none bg-white"
            ></textarea>
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-gray-400">{{ campMessageText.length }}/200</span>
              <button
                @click="saveCampMessage"
                :class="['px-4 py-1.5 rounded-lg text-xs font-bold transition-all', campMessageSaved ? 'bg-[#07C160]/10 text-[#07C160]' : 'bg-[#07C160] text-white active:scale-95']"
              >{{ campMessageSaved ? '已保存 ✓' : editingMessageId ? '保存修改' : '发布寄语' }}</button>
            </div>
          </template>
        </div>
      </Card>
    </div>

    <!-- Tab 栏：独立 sticky，滚动时固定在顶部 -->
    <div class="bg-white px-4 border-b border-gray-200 sticky top-14 z-10">
      <div class="flex gap-4 overflow-x-auto whitespace-nowrap py-1 no-scrollbar">
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors shrink-0', activeTab === 'diet' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'diet'"
        >
          饮食打卡
        </button>
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
          体重打卡
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
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors shrink-0', activeTab === 'score' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
          @click="activeTab = 'score'"
        >
          积分管理
        </button>
      </div>
    </div>

    <div class="p-4 space-y-4">
      <!-- Diet tab -->
      <template v-if="activeTab === 'diet'">

        <div v-if="records.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100">
          <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#FF976A]/10 flex items-center justify-center">
            <Coffee class="w-7 h-7 text-[#FF976A]" />
          </div>
          <div class="text-sm font-bold text-gray-700">该学员暂无饮食打卡记录</div>
        </div>
        <div v-else class="space-y-4">
          <div v-for="group in groupedDietRecords" :key="group.date">
            <!-- Date header -->
            <div @click="toggleDietDate(group.date)" class="flex items-center gap-2 px-1 py-2 cursor-pointer select-none sticky top-[104px] z-[5] bg-[#F7F8FA]">
              <div class="w-1 h-4 bg-[#FF976A] rounded-full"></div>
              <span class="text-sm font-bold text-gray-900">{{ group.label }}</span>
              <span class="text-[10px] text-gray-400">{{ group.records.length }} 条</span>
              <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', !isDietExpanded(group.date) ? '-rotate-90' : '']" />
            </div>
            <div v-show="isDietExpanded(group.date)" class="space-y-3">
          <Card v-for="record in group.records" :key="record.id" :id="`record-${record.id}`" class="p-0 overflow-hidden transition-all duration-300">
            <div class="p-4 border-b border-gray-50">
              <div class="flex justify-between items-center mb-3">
                <span class="text-xs text-gray-500 font-medium">{{ formatDateTime(record.date) }}</span>
                <span class="text-[10px] px-2 py-0.5 rounded text-[#FF976A] bg-[#FF976A]/10 font-bold uppercase">
                  {{ mealLabel(record.meal) }}
                </span>
              </div>

              <p class="text-sm text-gray-900 mb-3 whitespace-pre-wrap">{{ record.description }}</p>

              <!-- 餐次结构标签（营养师评定，保存后展示；未评定时不显示） -->
              <div v-if="record.hasStaple || record.hasProtein || record.hasVegetable" class="flex flex-wrap gap-1.5 mb-3">
                <span class="text-[10px] text-gray-400 self-center">已评定:</span>
                <span v-if="record.hasStaple" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">🍚 主食</span>
                <span v-if="record.hasProtein" class="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 font-medium">🥩 蛋白质</span>
                <span v-if="record.hasVegetable" class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">🥬 蔬菜</span>
              </div>

              <div class="flex gap-2 overflow-x-auto pb-1">
                <img loading="lazy" decoding="async"
                  v-for="(url, idx) in record.photos"
                  :key="idx"
                  :src="url"
                  alt="食物"
                  class="h-20 w-20 object-cover rounded-lg shrink-0 border border-gray-100 cursor-pointer"
                  @click="store.openImagePreview(record.photos || [], idx)"
                />
              </div>
            </div>

            <div class="p-4 bg-gray-50/50">
              <div v-if="commentingId === record.id" class="space-y-3">
                <div class="flex items-center gap-3">
                  <label class="text-sm text-gray-700 font-medium">该餐打分:</label>
                  <div class="flex items-center bg-gray-100 rounded-lg p-1">
                    <button
                      :class="['px-3 py-1 rounded-md text-xs font-bold transition-colors', commentScore === 2 ? 'bg-[#07C160] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
                      @click="commentScore = 2"
                    >
                      +2 (较好)
                    </button>
                    <button
                      :class="['px-3 py-1 rounded-md text-xs font-bold transition-colors', commentScore === 1 ? 'bg-[#FF976A] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
                      @click="commentScore = 1"
                    >
                      +1 (尚可)
                    </button>
                    <button
                      :class="['px-3 py-1 rounded-md text-xs font-bold transition-colors', commentScore === 0 ? 'bg-gray-400 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900']"
                      @click="commentScore = 0"
                    >
                      0 (偏离)
                    </button>
                  </div>
                </div>
                <!-- 餐次结构评定（营养师勾选，保存后学员可见） -->
                <div class="space-y-1.5">
                  <label class="text-sm text-gray-700 font-medium">餐次结构评定:</label>
                  <div class="flex gap-2">
                    <button
                      @click="commentStaple = !commentStaple"
                      :class="['flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95', commentStaple ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200']"
                    >🍚 主食</button>
                    <button
                      @click="commentProtein = !commentProtein"
                      :class="['flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95', commentProtein ? 'bg-rose-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200']"
                    >🥩 蛋白质</button>
                    <button
                      @click="commentVegetable = !commentVegetable"
                      :class="['flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95', commentVegetable ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200']"
                    >🥬 蔬菜</button>
                  </div>
                </div>
                <!-- 快捷回复模板 -->
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="tpl in DIET_TEMPLATES"
                    :key="tpl"
                    @click="commentText = commentText ? commentText + '，' + tpl : tpl"
                    class="text-[10px] px-2 py-1 rounded-full bg-[#FF976A]/10 text-[#FF976A] font-medium active:scale-95 transition-transform"
                  >
                    {{ tpl }}
                  </button>
                </div>
                <textarea
                  class="w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:border-[#FF976A]"
                  rows="3"
                  placeholder="输入专业批注..."
                  :value="commentText"
                  @input="commentText = ($event.target as HTMLTextAreaElement).value"
                  v-focus
                />
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click="cancelComment">取消</Button>
                  <Button class="bg-[#FF976A] hover:bg-[#e8855a] text-white" size="sm" @click="handleSaveComment(record.id)">保存</Button>
                </div>
              </div>
              <div v-else-if="record.dietitianComment || typeof record.dietitianScore === 'number'" class="relative group">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-[#FF976A]">批注</span>
                    <span :class="['text-[10px] px-1.5 py-0.5 rounded font-bold', scoreBadgeCls(record)]">
                      <template v-if="scoreNum(record) != null">+{{ scoreNum(record) }}</template>
                      <template v-else>未打分</template>
                    </span>
                  </div>
                </div>
                <CheckinComments :comments="recordComments(record)" />
                <div class="flex items-center gap-2 mt-2">
                  <button @click="startComment(record)" class="text-xs text-[#1677FF]">
                    编辑
                  </button>
                  <span v-if="record.dietitianComment && record.commentRead" class="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    <Eye class="w-3 h-3" />
                    学员已读未回
                  </span>
                </div>
              </div>
              <button v-else @click="startComment(record)" class="flex items-center gap-1 text-sm text-[#FF976A] font-medium">
                <MessageCircle class="w-4 h-4" />
                添加批注 (未打分，暂不计分)
              </button>
            </div>
          </Card>
            </div>
          </div>
        </div>
      </template>

      <!-- Exercise tab -->
      <template v-if="activeTab === 'exercise'">
        <!-- 每日运动趋势（共享组件：标题+规则+统计+图，与学员端一致） -->
        <ExerciseTrendCard :records="studentExercises" />

        <div v-if="studentExercises.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100">
          <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#07C160]/10 flex items-center justify-center">
            <Activity class="w-7 h-7 text-[#07C160]" />
          </div>
          <div class="text-sm font-bold text-gray-700">该学员暂无运动打卡记录</div>
        </div>
        <div v-else class="space-y-4">
          <div v-for="group in groupedExerciseRecords" :key="group.date">
            <!-- Date header -->
            <div @click="toggleExerciseDate(group.date)" class="flex items-center gap-2 px-1 py-2 cursor-pointer select-none sticky top-[104px] z-[5] bg-[#F7F8FA]">
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

            <!-- 运动批注区域（只读，批注由教练操作） -->
            <div class="p-4 bg-gray-50/50">
              <div v-if="record.coachComment" class="relative">
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
                  <span v-if="record.coachComment && record.commentRead" class="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    <Eye class="w-3 h-3" />
                    学员已读未回
                  </span>
                </div>
              </div>
              <div v-else class="text-xs text-gray-400 flex items-center gap-1">
                <MessageCircle class="w-3 h-3" />
                暂无教练批注
              </div>
            </div>
          </Card>
            </div>
          </div>
        </div>
      </template>

      <!-- Weight tab -->
      <template v-if="activeTab === 'weight'">
        <div v-if="studentWeights.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100">
          <div class="w-14 h-14 mx-auto mb-2 rounded-full bg-[#1677FF]/10 flex items-center justify-center">
            <Scale class="w-7 h-7 text-[#1677FF]" />
          </div>
          <div class="text-sm font-bold text-gray-700">该学员暂无体重打卡记录</div>
        </div>
        <div v-else class="space-y-4">
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

          <!-- Weight trend chart（抽取为独立组件） -->
          <div class="flex justify-end -mb-1">
            <ChartRulePopup title="体重趋势图展示规则" button-text="图表规则">
              <p><span class="font-bold text-gray-900">数据来源：</span>学员每次体重打卡记录，按时间升序排列</p>
              <p><span class="font-bold text-gray-900">Y轴范围：</span>自动适配数据区间，上下留白20%，确保曲线居中可见</p>
              <p><span class="font-bold text-gray-900">交互方式：</span>点击或滑动曲线可查看每个数据点的具体体重和日期</p>
              <p><span class="font-bold text-gray-900">较上次变化：</span>当前体重减去前一次打卡体重，下降为绿色，上升为橙色</p>
              <p><span class="font-bold text-gray-900">总变化：</span>最新体重减去首次打卡体重，百分比=总变化÷|初始体重|×100%</p>
              <p><span class="font-bold text-gray-900">建议：</span>固定早晨空腹称重，数据更具可比性</p>
            </ChartRulePopup>
          </div>
          <WeightTrendChart :records="studentWeights" :gradient-id="`wg-${student?.id}`" />

          <!-- Weight record history with annotation -->
          <Card class="p-0 overflow-hidden">
            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
              <Scale class="w-4 h-4 text-[#07C160]" />
              <h3 class="font-bold text-gray-900 text-sm">打卡记录与批注</h3>
              <span class="text-[10px] text-gray-400 ml-auto">共 {{ studentWeights.length }} 条记录</span>
            </div>
            <div class="divide-y divide-gray-50">
              <div v-for="group in groupedWeightRecords" :key="group.date">
                <!-- 日期分组标题 -->
                <div @click="toggleWeightDate(group.date)" class="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                  <div class="w-1 h-4 bg-[#1677FF] rounded-full"></div>
                  <span class="text-sm font-bold text-gray-900">{{ group.label }}</span>
                  <span class="text-[10px] text-gray-400">{{ group.records.length }} 条</span>
                  <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', !isWeightExpanded(group.date) ? '-rotate-90' : '']" />
                </div>
                <div v-show="isWeightExpanded(group.date)">
                  <div
                    v-for="(rec, idx) in group.records"
                    :key="rec.id"
                    :id="`record-${rec.id}`"
                    class="px-4 py-3 transition-all duration-300"
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
                      <!-- 较上次变化（同一天内多条记录时也显示） -->
                      <div v-if="getPrevWeight(rec, group) !== null" class="text-right">
                        <div :class="['text-xs font-bold', (rec.weight - getPrevWeight(rec, group)!) < 0 ? 'text-[#07C160]' : 'text-orange-500']">
                          {{ (rec.weight - getPrevWeight(rec, group)!) > 0 ? '+' : '' }}{{ (rec.weight - getPrevWeight(rec, group)!).toFixed(1) }} kg
                        </div>
                        <div class="text-[10px] text-gray-400">较上次</div>
                      </div>
                      <div v-else class="text-right">
                        <div class="text-[10px] text-gray-400">首次记录</div>
                      </div>
                    </div>

                    <!-- 体重打卡照片 -->
                    <div v-if="rec.photos && rec.photos.length > 0" class="mt-2 ml-11 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      <img loading="lazy" decoding="async"
                        v-for="(url, pIdx) in rec.photos"
                        :key="pIdx"
                        :src="url"
                        alt="体重打卡"
                        class="h-16 w-16 object-cover rounded-lg shrink-0 border border-gray-100 cursor-pointer"
                        @click="store.openImagePreview(rec.photos || [], pIdx)"
                      />
                    </div>

                    <!-- 体重批注区域 -->
                    <div class="mt-2 ml-11">
                      <div v-if="weightCommentingId === rec.id" class="space-y-2">
                        <div class="flex flex-wrap gap-1.5">
                          <button
                            v-for="tpl in WEIGHT_TEMPLATES"
                            :key="tpl"
                            @click="weightCommentText = weightCommentText ? weightCommentText + '，' + tpl : tpl"
                            class="text-[10px] px-2 py-1 rounded-full bg-[#07C160]/10 text-[#07C160] font-medium active:scale-95 transition-transform"
                          >
                            {{ tpl }}
                          </button>
                        </div>
                        <textarea
                          class="w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:border-[#07C160]"
                          rows="2"
                          placeholder="输入体重批注..."
                          :value="weightCommentText"
                          @input="weightCommentText = ($event.target as HTMLTextAreaElement).value"
                        />
                        <div class="flex justify-end gap-2">
                          <Button variant="outline" size="sm" @click="cancelWeightComment">取消</Button>
                          <Button class="bg-[#07C160] text-white" size="sm" @click="handleSaveWeightComment(rec.id)">保存</Button>
                        </div>
                      </div>
                      <div v-else-if="rec.dietitianComment" class="relative group">
                        <div class="flex items-center justify-between mb-1">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-[#07C160]">批注</span>
                          </div>
                        </div>
                        <CheckinComments :comments="recordComments(rec)" />
                        <div class="flex items-center gap-2 mt-1">
                          <button @click="startWeightComment(rec)" class="text-xs text-[#07C160]">编辑</button>
                          <span v-if="rec.dietitianComment && rec.commentRead" class="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            <Eye class="w-3 h-3" />
                            学员已读未回
                          </span>
                        </div>
                      </div>
                      <button v-else @click="startWeightComment(rec)" class="flex items-center gap-1 text-sm text-[#07C160] font-medium">
                        <MessageCircle class="w-4 h-4" />
                        添加批注
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </template>

      <!-- Medical tab -->
      <template v-if="activeTab === 'medical'">
        <div class="space-y-4">
          <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <div>
              <h3 class="font-bold text-gray-900 text-sm">医疗数据维护</h3>
              <p class="text-xs text-gray-500">协助填写和更新学员体检指标</p>
            </div>
            <Button
              size="sm"
              :variant="isEditingMedical ? 'primary' : 'outline'"
              @click="isEditingMedical = !isEditingMedical"
            >
              {{ isEditingMedical ? '完成编辑' : '编辑指标' }}
            </Button>
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
                      <input
                        v-if="isEditingMedical"
                        type="number"
                        inputmode="decimal"
                        class="w-20 text-center rounded border border-gray-200 p-1 text-sm focus:border-[#07C160] outline-none"
                        :value="item.beforeValue === null ? '' : item.beforeValue"
                        @input="handleMedicalChange(idx, iIdx, 'beforeValue', ($event.target as HTMLInputElement).value)"
                        placeholder="未检测"
                      />
                      <span v-else :class="item.isBeforeOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">
                        <span v-if="item.beforeValue === null" class="text-gray-400 font-normal">-- 未上传</span>
                        <template v-else>{{ item.beforeValue }}</template>
                      </span>
                      <span v-if="!isEditingMedical && item.beforeValue !== null && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                    </div>
                  </div>
                  <div class="bg-[#07C160]/5 p-2 rounded flex flex-col justify-center items-center border border-[#07C160]/10">
                    <span class="text-[10px] text-[#07C160] font-medium mb-1">结营后</span>
                    <div class="text-sm w-full flex justify-center">
                      <input
                        v-if="isEditingMedical"
                        type="number"
                        inputmode="decimal"
                        class="w-20 text-center rounded border border-gray-200 p-1 text-sm focus:border-[#07C160] outline-none"
                        :value="item.afterValue === null ? '' : item.afterValue"
                        @input="handleMedicalChange(idx, iIdx, 'afterValue', ($event.target as HTMLInputElement).value)"
                        placeholder="未检测"
                      />
                      <span v-else :class="item.isAfterOut ? 'text-orange-500 font-bold' : 'text-gray-900 font-medium'">
                        <span v-if="item.afterValue === null" class="text-gray-400 font-normal">-- 待更新</span>
                        <template v-else>{{ item.afterValue }}</template>
                      </span>
                      <span v-if="!isEditingMedical && item.afterValue !== null && item.unit" class="text-[10px] text-gray-500 ml-1">{{ item.unit }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </template>

      <!-- Questionnaire tab -->
      <template v-if="activeTab === 'questionnaire'">
        <div class="space-y-4">
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

      <!-- Score tab: 手动加减分 -->
      <template v-if="activeTab === 'score'">
        <div class="space-y-4">
          <!-- 积分总览 -->
          <Card>
            <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
              <Award class="h-4 w-4 text-[#07C160]" />
              积分明细
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center py-2 border-b border-gray-50">
                <span class="text-sm text-gray-500">饮食积分</span>
                <span class="text-lg font-bold text-[#07C160]">{{ scoreBreakdown.diet }}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-gray-50">
                <span class="text-sm text-gray-500">运动积分</span>
                <span class="text-lg font-bold text-[#FF976A]">{{ scoreBreakdown.exercise }}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-gray-50">
                <span class="text-sm text-gray-500">手动调整</span>
                <span class="text-lg font-bold" :class="scoreBreakdown.manual >= 0 ? 'text-blue-600' : 'text-red-500'">
                  {{ scoreBreakdown.manual >= 0 ? '+' : '' }}{{ scoreBreakdown.manual }}
                </span>
              </div>
              <div class="flex justify-between items-center pt-2">
                <span class="text-sm font-bold text-gray-900">总积分</span>
                <span class="text-2xl font-bold text-[#0958d9]">{{ scoreBreakdown.total }}</span>
              </div>
            </div>
          </Card>

          <!-- 手动加减分表单 -->
          <Card>
            <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
              <Plus class="h-4 w-4 text-[#07C160]" />
              手动补分 / 扣分
            </h3>
            <div class="space-y-3">
              <!-- 加分/扣分切换 -->
              <div class="flex gap-2">
                <button
                  :class="['flex-1 py-2.5 rounded-lg text-sm font-bold transition-all', manualMode === 'add' ? 'bg-[#07C160] text-white' : 'bg-gray-100 text-gray-500']"
                  @click="manualMode = 'add'"
                >
                  <Plus class="h-4 w-4 inline-block" /> 加分
                </button>
                <button
                  :class="['flex-1 py-2.5 rounded-lg text-sm font-bold transition-all', manualMode === 'subtract' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500']"
                  @click="manualMode = 'subtract'"
                >
                  <Minus class="h-4 w-4 inline-block" /> 扣分
                </button>
              </div>
              <!-- 分值输入 -->
              <div>
                <label class="text-xs text-gray-500 mb-1 block">分值</label>
                <input
                  v-model.number="manualPoints"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="请输入分值"
                  class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#07C160]"
                />
              </div>
              <!-- 原因输入 -->
              <div>
                <label class="text-xs text-gray-500 mb-1 block">原因说明</label>
                <textarea
                  v-model="manualReason"
                  rows="2"
                  placeholder="如：营前线下打卡补录、打卡作弊扣分等"
                  class="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#07C160] resize-none"
                />
              </div>
              <Button
                :disabled="!manualReason.trim() || manualPoints === 0"
                @click="handleAddManualScore"
                class="w-full"
              >
                确认{{ manualMode === 'add' ? '加分' : '扣分' }}
              </Button>
            </div>
          </Card>

          <!-- 手动加减分记录列表 -->
          <Card>
            <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
              <ClipboardList class="h-4 w-4 text-[#07C160]" />
              调整记录
              <span v-if="studentManualScores.length > 0" class="text-xs text-gray-400 font-normal">（{{ studentManualScores.length }}条）</span>
            </h3>
            <div v-if="studentManualScores.length === 0" class="text-center text-xs text-gray-400 py-6">
              暂无手动调整记录
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="record in studentManualScores"
                :key="record.id"
                class="flex items-start gap-3 p-3 rounded-lg bg-gray-50"
              >
                <div
                  class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  :class="record.points >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'"
                >
                  {{ record.points >= 0 ? '+' : '' }}{{ record.points }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-900">{{ record.reason }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ record.dietitianName }} · {{ record.createdAt }}
                  </p>
                </div>
                <button
                  class="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  @click="handleDeleteManualScore(record.id)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>
        </div>
      </template>
    </div>
  </div>
</template>
