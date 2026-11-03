<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { showConfirmDialog, showToast, Popup as VanPopup, TimePicker as VanTimePicker } from 'vant';
import { useAppStore, questionnaireStorageKey } from '../store/app';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { Button, NavBar, Card } from './ui';
import {
  UploadCloud, FileText, X, Minus, Plus,
  Moon, Dumbbell, HeartPulse, Salad, Sparkles,
  Footprints, Bike, Waves, PersonStanding, CircleDot, Volleyball, MoreHorizontal,
  ChevronRight,
} from 'lucide-vue-next';

const EXERCISE_OPTIONS = [
  { label: '跑步', icon: Footprints },
  { label: '快走', icon: PersonStanding },
  { label: '游泳', icon: Waves },
  { label: '骑行', icon: Bike },
  { label: '力量训练', icon: Dumbbell },
  { label: '瑜伽', icon: Sparkles },
  { label: '球类', icon: Volleyball },
  { label: '跳绳', icon: CircleDot },
  { label: '其他', icon: MoreHorizontal },
];

const store = useAppStore();
// 问卷本地存储键按当前学员隔离（防止新账户串用他人问卷/草稿）
const qKey = (kind: 'submitted' | 'draft') => questionnaireStorageKey(kind, store.user?.id || 'none');

// 1: 认识一下, 2: 身体小秘密, 3: 日常节奏, 4: 运动习惯, 5: 给营养师的小助手
const step = ref(1);
const error = ref('');

const formData = reactive({
  name: store.user?.name || '',
  gender: store.user?.gender || '',
  age: store.user?.age ? String(store.user.age) : '',
  height: '',
  weight: '',
  hasChronic: '',
  chronicDetails: '',
  hasSpecialDiet: '',
  specialDietDetails: '',
  hasFoodAllergy: '',
  foodAllergyDetails: '',
  wakeTime: '',
  sleepTime: '',
  sleepDuration: '7.5',
  drinkAlcohol: '',
  smoke: '',
  snack: '',
  dailyWater: '1500',
  exerciseFrequency: '3',
  exerciseTypes: [] as string[],
  exerciseDuration: '45',
  medicalReports: [] as { url: string; type: 'image' | 'pdf'; name?: string }[],
});

onMounted(() => {
  const saved = localStorage.getItem(qKey('draft'));
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.assign(formData, parsed.formData);
      step.value = parsed.step;
      showToast('已为您恢复上次进度');
    } catch (e) {
      // ignore
    }
  }
});

watch(
  [() => ({ ...formData }), step],
  () => {
    localStorage.setItem(qKey('draft'), JSON.stringify({ formData, step: step.value }));
  },
  { deep: true },
);

// ---- BMI 即时反馈（中国成人标准 WS/T 428-2013） ----
const bmi = computed(() => {
  const h = parseFloat(formData.height);
  const w = parseFloat(formData.weight);
  if (!h || !w || h < 100 || h > 250 || w < 20 || w > 300) return null;
  return w / Math.pow(h / 100, 2);
});

const bmiInfo = computed(() => {
  if (bmi.value === null) return null;
  const v = bmi.value;
  // 中国成人 BMI 分级标准（WS/T 428-2013《成人体重判定》）
  if (v < 18.5) return { text: '体重过低', color: 'text-[#1677FF]', bg: 'bg-[#1677FF]/10', tip: '你的体重偏轻，营养师会帮你科学增肌、均衡营养', range: '< 18.5' };
  if (v < 24) return { text: '体重正常', color: 'text-[#07C160]', bg: 'bg-[#07C160]/10', tip: '体型很标准！和营养师一起，练出更好的状态', range: '18.5 ~ 23.9' };
  if (v < 28) return { text: '超重', color: 'text-[#FF976A]', bg: 'bg-[#FF976A]/10', tip: '略有富余，28 天科学饮食 + 运动，一起回到最佳状态', range: '24.0 ~ 27.9' };
  return { text: '肥胖', color: 'text-red-500', bg: 'bg-red-50', tip: '别担心，北医康复医院的营养师团队会全程陪你科学管理体重', range: '≥ 28.0' };
});

// ---- 步进器 ----
const adjustNumber = (field: 'sleepDuration' | 'dailyWater' | 'exerciseFrequency' | 'exerciseDuration', delta: number, min: number, max: number, stepVal: number, fallback: number) => {
  // 若当前为空（不应发生，兜底），以显示默认值为基准
  const cur = formData[field] === '' ? fallback : parseFloat(formData[field]);
  let next = (isNaN(cur) ? fallback : cur) + delta * stepVal;
  if (next < min) next = min;
  if (next > max) next = max;
  // 保留1位小数（睡眠）或整数
  formData[field] = stepVal < 1 ? String(Math.round(next * 10) / 10) : String(Math.round(next));
  error.value = '';
};

// 步进器中间数字的可编辑状态
const editingField = ref<string | null>(null);
const startEdit = (field: string) => { editingField.value = field; };
const stopEdit = () => { editingField.value = null; };

const handleNext = () => {
  error.value = '';
  if (step.value === 1) {
    if (!formData.name || !formData.gender || !formData.age || !formData.height || !formData.weight) {
      error.value = '请完善所有必填信息';
      return;
    }
    const a = parseInt(formData.age);
    if (a < 1 || a > 120) { error.value = '请输入正确的年龄'; return; }
    const h = parseFloat(formData.height);
    const w = parseFloat(formData.weight);
    if (h < 100 || h > 250) { error.value = '身高需在100-250cm之间'; return; }
    if (w < 20 || w > 300) { error.value = '体重需在20-300kg之间'; return; }
  } else if (step.value === 2) {
    if (!formData.hasChronic || !formData.hasSpecialDiet || !formData.hasFoodAllergy) {
      error.value = '请回答所有必填问题'; return;
    }
    if (formData.hasChronic === '有' && !formData.chronicDetails) { error.value = '请填写疾病名称'; return; }
    if (formData.hasSpecialDiet === '有' && !formData.specialDietDetails) { error.value = '请说明特殊饮食内容'; return; }
    if (formData.hasFoodAllergy === '有' && !formData.foodAllergyDetails) { error.value = '请列出过敏食物'; return; }
  } else if (step.value === 3) {
    if (!formData.wakeTime || !formData.sleepTime || !formData.sleepDuration || !formData.drinkAlcohol || !formData.smoke || !formData.snack || !formData.dailyWater) {
      error.value = '请回答所有必填问题'; return;
    }
    const sd = parseFloat(formData.sleepDuration);
    if (sd < 0 || sd > 24) { error.value = '睡眠时间需在0-24小时之间'; return; }
    const dw = parseInt(formData.dailyWater);
    if (dw < 0 || dw > 10000) { error.value = '饮水量需在0-10000ml之间'; return; }
  } else if (step.value === 4) {
    // 如果选了"其他"，把自定义名称同步进 exerciseTypes
    syncCustomExercise();
    if (!formData.exerciseFrequency || formData.exerciseTypes.length === 0 || !formData.exerciseDuration) {
      error.value = '请回答所有必填问题'; return;
    }
    if (formData.exerciseTypes.includes('其他')) {
      error.value = '选择了"其他"，请填写具体运动名称'; return;
    }
    const ef = parseInt(formData.exerciseFrequency);
    if (ef < 0 || ef > 21) { error.value = '每周运动频率需在0-21次之间'; return; }
    const ed = parseInt(formData.exerciseDuration);
    if (ed < 0 || ed > 600) { error.value = '每次运动时长需在0-600分钟之间'; return; }
  } else if (step.value === 5) {
    showConfirmDialog({ title: '提示', message: '提交后不可修改，确认提交？' })
      .then(() => handleSubmit())
      .catch(() => {});
    return;
  }

  step.value += 1;
  error.value = '';
};

const handlePrev = () => {
  error.value = '';
  step.value -= 1;
};

const handleSubmit = () => {
  if (store.user) {
    // 用 updateUserProfile 同步姓名/性别/年龄到 accounts + students
    store.updateUserProfile({
      name: formData.name,
      gender: formData.gender as 'male' | 'female',
      age: parseInt(formData.age),
      height: parseFloat(formData.height),
      weight: parseFloat(formData.weight),
      medicalReports: formData.medicalReports,
    });
  }

  localStorage.setItem(qKey('submitted'), JSON.stringify(formData));
  localStorage.removeItem(qKey('draft'));
  store.setQuestionnaireAnswered(true);
  store.setCurrentView('dashboard');
};

const toggleMulti = (opt: string) => {
  if (formData.exerciseTypes.includes(opt)) {
    formData.exerciseTypes = formData.exerciseTypes.filter((x) => x !== opt);
  } else {
    formData.exerciseTypes = [...formData.exerciseTypes, opt];
  }
  error.value = '';
};

// "其他"自定义运动名称
const customExercise = ref('');
const syncCustomExercise = () => {
  const val = customExercise.value.trim();
  // 清掉旧的自定义项（非预设且非"其他"）
  formData.exerciseTypes = formData.exerciseTypes.filter((x) => EXERCISE_OPTIONS.some((o) => o.label === x));
  if (formData.exerciseTypes.includes('其他') && val) {
    formData.exerciseTypes = [...formData.exerciseTypes.filter((x) => x !== '其他'), val];
  }
  error.value = '';
};

const reportInputRef = ref<HTMLInputElement | null>(null);
const handleReportSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 5 - formData.medicalReports.length;
  const newReports = await Promise.all(
    files.slice(0, remaining).map(async (f) => ({
      url: await uploadFile(await compressImage(f)),
      type: (f.type === 'application/pdf' ? 'pdf' : 'image') as 'image' | 'pdf',
      name: f.name,
    })),
  );
  formData.medicalReports = [...formData.medicalReports, ...newReports];
  (e.target as HTMLInputElement).value = '';
};

const removeReport = (idx: number) => {
  formData.medicalReports = formData.medicalReports.filter((_, i) => i !== idx);
};

const openReport = (r: any) => {
  if (r.type === 'pdf') window.open(r.url, '_blank');
  else store.openImagePreview([r.url], 0);
};

// 步进标题（去"板块"感）
const steps = [
  { key: 'basic', label: '认识一下', icon: Sparkles },
  { key: 'health', label: '身体小秘密', icon: HeartPulse },
  { key: 'lifestyle', label: '日常节奏', icon: Moon },
  { key: 'exercise', label: '运动习惯', icon: Dumbbell },
  { key: 'report', label: '营养小助手', icon: Salad },
];

// 选项大按钮（有/无、是/否）
const yesNoOptions = [
  { label: '没有', value: '无', activeClass: 'bg-[#07C160] text-white border-[#07C160]' },
  { label: '有', value: '有', activeClass: 'bg-[#FF976A] text-white border-[#FF976A]' },
];
const ynOptions = [
  { label: '否', value: '否', activeClass: 'bg-[#07C160] text-white border-[#07C160]' },
  { label: '是', value: '是', activeClass: 'bg-[#FF976A] text-white border-[#FF976A]' },
];
const freqOptions = [
  { label: '从不', value: '从不', activeClass: 'bg-[#07C160] text-white border-[#07C160]' },
  { label: '偶尔', value: '偶尔', activeClass: 'bg-[#FF976A] text-white border-[#FF976A]' },
  { label: '经常', value: '经常', activeClass: 'bg-red-500 text-white border-red-500' },
];

// 步进进度百分比（动画）
const progressPercent = computed(() => (step.value / steps.length) * 100);

// ─── 时间选择器弹窗（替代原生 input[type=time]，避免 iOS 宽度溢出）───
const showTimePicker = ref(false);
const timePickerField = ref<'wakeTime' | 'sleepTime'>('wakeTime');
const timePickerValue = ref<string[]>(['07', '00']);

function openTimePicker(field: 'wakeTime' | 'sleepTime') {
  timePickerField.value = field;
  const current = formData[field] || '';
  if (current && current.includes(':')) {
    timePickerValue.value = current.split(':');
  } else {
    timePickerValue.value = field === 'wakeTime' ? ['07', '00'] : ['23', '00'];
  }
  showTimePicker.value = true;
}

function onTimePickerConfirm({ selectedValues }: { selectedValues: string[] }) {
  formData[timePickerField.value] = selectedValues.join(':');
  showTimePicker.value = false;
  error.value = '';
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe relative">
    <NavBar title="入营小问卷" />

    <div class="p-4 flex-1 flex flex-col space-y-4 pb-32">
      <!-- 顶部：问候 + 进度 -->
      <div class="flex items-center justify-between px-1">
        <div>
          <div class="text-xs text-gray-400">花 2 分钟，让营养师更懂你</div>
        </div>
        <div class="text-xs font-bold text-[#07C160]">{{ step }}/{{ steps.length }}</div>
      </div>

      <!-- 动画进度条 -->
      <div class="mb-1">
        <div class="flex justify-between text-[10px] text-gray-400 mb-2">
          <div
            v-for="(s, idx) in steps"
            :key="s.key"
            :class="['flex-1 text-center transition-colors duration-300', step === idx + 1 ? 'font-bold text-[#07C160]' : step > idx + 1 ? 'text-[#07C160]' : '']"
          >
            {{ s.label }}
          </div>
        </div>
        <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-[#07C160] to-[#06b558] rounded-full transition-all duration-500 ease-out"
            :style="{ width: `${progressPercent}%` }"
          ></div>
        </div>
      </div>

      <!-- ============ Step 1: 认识一下 ============ -->
      <transition name="step-fade" mode="out-in">
      <Card v-if="step === 1" key="s1" class="space-y-5 flex-1">
        <div>
          <h3 class="font-bold text-gray-900 text-lg">先认识一下你</h3>
          <p class="text-xs text-gray-400 mt-1">这些基础信息会用来计算你的专属健康数据</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1.5">怎么称呼你 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="请输入真实姓名" class="w-full rounded-xl border border-gray-200 p-3.5 focus:border-[#07C160] focus:outline-none focus:ring-2 focus:ring-[#07C160]/10 transition-all" :value="formData.name" @input="formData.name = ($event.target as HTMLInputElement).value; error = ''" />
          </div>

          <!-- 性别大卡片 -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">性别 <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-2 gap-3">
              <button
                @click="formData.gender = 'male'; error = ''"
                :class="['py-4 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all active:scale-95', formData.gender === 'male' ? 'bg-[#07C160]/10 border-[#07C160] text-[#07C160]' : 'bg-white border-gray-200 text-gray-500']"
              >
                <span class="text-3xl">👨</span>
                <span class="text-sm font-bold">男</span>
              </button>
              <button
                @click="formData.gender = 'female'; error = ''"
                :class="['py-4 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all active:scale-95', formData.gender === 'female' ? 'bg-[#FF976A]/10 border-[#FF976A] text-[#FF976A]' : 'bg-white border-gray-200 text-gray-500']"
              >
                <span class="text-3xl">👩</span>
                <span class="text-sm font-bold">女</span>
              </button>
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1.5">年龄 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="例如: 32" class="w-full rounded-xl border border-gray-200 p-3.5 focus:border-[#07C160] focus:outline-none focus:ring-2 focus:ring-[#07C160]/10 transition-all" :value="formData.age" @input="formData.age = ($event.target as HTMLInputElement).value; error = ''" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1.5">身高 (cm) <span class="text-red-500">*</span></label>
              <input type="number" inputmode="decimal" placeholder="170" class="w-full rounded-xl border border-gray-200 p-3.5 focus:border-[#07C160] focus:outline-none focus:ring-2 focus:ring-[#07C160]/10 transition-all" :value="formData.height" @input="formData.height = ($event.target as HTMLInputElement).value; error = ''" />
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1.5">体重 (kg) <span class="text-red-500">*</span></label>
              <input type="number" inputmode="decimal" placeholder="65.5" class="w-full rounded-xl border border-gray-200 p-3.5 focus:border-[#07C160] focus:outline-none focus:ring-2 focus:ring-[#07C160]/10 transition-all" :value="formData.weight" @input="formData.weight = ($event.target as HTMLInputElement).value; error = ''" />
            </div>
          </div>

          <!-- BMI 即时反馈（中国成人标准 WS/T 428-2013） -->
          <transition name="step-fade">
            <div v-if="bmiInfo" class="rounded-2xl p-4 flex items-start gap-3 border border-gray-100" :class="bmiInfo.bg">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs text-gray-500">你的 BMI</span>
                  <span class="text-xl font-black" :class="bmiInfo.color">{{ bmi!.toFixed(1) }}</span>
                  <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-white" :class="bmiInfo.color">{{ bmiInfo.text }}</span>
                </div>
                <p class="text-xs text-gray-600 leading-relaxed mb-2">{{ bmiInfo.tip }}</p>
                <!-- 中国成人 BMI 参考范围 -->
                <div class="flex gap-1.5 text-[10px] flex-wrap">
                  <span class="px-1.5 py-0.5 rounded bg-white/70" :class="bmiInfo.text === '体重过低' ? 'font-bold text-[#1677FF]' : 'text-gray-400'">过低 &lt;18.5</span>
                  <span class="px-1.5 py-0.5 rounded bg-white/70" :class="bmiInfo.text === '体重正常' ? 'font-bold text-[#07C160]' : 'text-gray-400'">正常 18.5~23.9</span>
                  <span class="px-1.5 py-0.5 rounded bg-white/70" :class="bmiInfo.text === '超重' ? 'font-bold text-[#FF976A]' : 'text-gray-400'">超重 24.0~27.9</span>
                  <span class="px-1.5 py-0.5 rounded bg-white/70" :class="bmiInfo.text === '肥胖' ? 'font-bold text-red-500' : 'text-gray-400'">肥胖 ≥28.0</span>
                </div>
              </div>
            </div>
          </transition>

          <div>
            <label class="text-sm text-gray-400 block mb-1.5">联系方式</label>
            <div class="p-3.5 bg-gray-50 rounded-xl text-gray-900">{{ store.user?.phone || '138****0000' }}</div>
          </div>
        </div>
      </Card>

      <!-- ============ Step 2: 身体小秘密 ============ -->
      <Card v-else-if="step === 2" key="s2" class="space-y-6 flex-1">
        <div>
          <h3 class="font-bold text-gray-900 text-lg">聊聊你的身体</h3>
          <p class="text-xs text-gray-400 mt-1">这些信息只有营养师能看到，用来保障你的健康安全</p>
        </div>

        <div v-for="q in [
            { key: 'hasChronic', detailKey: 'chronicDetails', label: '有慢性疾病或病史吗？', placeholder: '请填写疾病名称，如：高血压、糖尿病' },
            { key: 'hasSpecialDiet', detailKey: 'specialDietDetails', label: '平时有特殊饮食要求吗？', placeholder: '请说明特殊饮食内容，如：素食、低盐' },
            { key: 'hasFoodAllergy', detailKey: 'foodAllergyDetails', label: '有食物过敏吗？', placeholder: '请列出过敏食物，如：海鲜、花生' },
          ]" :key="q.key" class="space-y-2.5">
          <label class="text-sm font-medium text-gray-700 block">{{ q.label }} <span class="text-red-500">*</span></label>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="opt in yesNoOptions"
              :key="opt.value"
              @click="(formData as any)[q.key] = opt.value; error = ''"
              :class="['py-3 rounded-xl border-2 text-sm font-bold transition-all active:scale-95', (formData as any)[q.key] === opt.value ? opt.activeClass : 'bg-white border-gray-200 text-gray-500']"
            >
              {{ opt.label }}
            </button>
          </div>
          <transition name="step-fade">
            <input
              v-if="(formData as any)[q.key] === '有'"
              type="text"
              :placeholder="q.placeholder"
              class="w-full rounded-xl border border-gray-200 p-3.5 focus:border-[#07C160] focus:outline-none focus:ring-2 focus:ring-[#07C160]/10"
              :value="(formData as any)[q.detailKey]"
              @input="(formData as any)[q.detailKey] = ($event.target as HTMLInputElement).value; error = ''"
            />
          </transition>
        </div>
      </Card>

      <!-- ============ Step 3: 日常节奏 ============ -->
      <Card v-else-if="step === 3" key="s3" class="space-y-6 flex-1">
        <div>
          <h3 class="font-bold text-gray-900 text-lg">你的日常节奏</h3>
          <p class="text-xs text-gray-400 mt-1">作息和习惯对体重管理影响很大，如实填写就好</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="min-w-0">
            <label class="text-sm font-medium text-gray-700 block mb-1.5">几点起床 <span class="text-red-500">*</span></label>
            <button type="button" @click="openTimePicker('wakeTime')"
              class="w-full px-2 py-2 rounded-xl border border-gray-200 text-sm focus:border-[#07C160] outline-none flex items-center justify-between">
              <span :class="formData.wakeTime ? 'text-gray-900' : 'text-gray-400'">{{ formData.wakeTime || '选择时间' }}</span>
              <ChevronRight class="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>
          </div>
          <div class="min-w-0">
            <label class="text-sm font-medium text-gray-700 block mb-1.5">几点睡觉 <span class="text-red-500">*</span></label>
            <button type="button" @click="openTimePicker('sleepTime')"
              class="w-full px-2 py-2 rounded-xl border border-gray-200 text-sm focus:border-[#07C160] outline-none flex items-center justify-between">
              <span :class="formData.sleepTime ? 'text-gray-900' : 'text-gray-400'">{{ formData.sleepTime || '选择时间' }}</span>
              <ChevronRight class="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>
          </div>
        </div>

        <!-- 睡眠时长步进器 -->
        <div>
          <label class="text-sm font-medium text-gray-700 block mb-1.5">平均每天睡多久 <span class="text-red-500">*</span></label>
          <div class="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            <button @click="adjustNumber('sleepDuration', -1, 0, 24, 0.5, 7.5)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Minus class="w-5 h-5 text-gray-600" />
            </button>
            <div class="flex-1 text-center" @click="startEdit('sleepDuration')">
              <input
                v-if="editingField === 'sleepDuration'"
                type="number" inputmode="decimal" step="0.5" min="0" max="24"
                v-model="formData.sleepDuration"
                @blur="stopEdit"
                v-focus
                class="w-24 text-3xl font-black text-gray-900 text-center bg-white rounded-lg border border-[#07C160] focus:outline-none py-1"
              />
              <template v-else>
                <span class="text-3xl font-black text-gray-900">{{ formData.sleepDuration }}</span>
                <span class="text-sm text-gray-400 ml-1">小时</span>
              </template>
            </div>
            <button @click="adjustNumber('sleepDuration', 1, 0, 24, 0.5, 7.5)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Plus class="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <!-- 饮水量步进器 -->
        <div>
          <label class="text-sm font-medium text-gray-700 block mb-1.5">每天喝多少水 <span class="text-red-500">*</span></label>
          <div class="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            <button @click="adjustNumber('dailyWater', -1, 0, 10000, 250, 1500)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Minus class="w-5 h-5 text-gray-600" />
            </button>
            <div class="flex-1 text-center" @click="startEdit('dailyWater')">
              <input
                v-if="editingField === 'dailyWater'"
                type="number" inputmode="numeric" step="100" min="0" max="10000"
                v-model="formData.dailyWater"
                @blur="stopEdit"
                v-focus
                class="w-28 text-3xl font-black text-[#1677FF] text-center bg-white rounded-lg border border-[#1677FF] focus:outline-none py-1"
              />
              <template v-else>
                <span class="text-3xl font-black text-[#1677FF]">{{ formData.dailyWater }}</span>
                <span class="text-sm text-gray-400 ml-1">ml</span>
                <div class="text-[10px] text-gray-400 mt-0.5">约 {{ Math.round((parseInt(formData.dailyWater || '1500')) / 250) }} 杯</div>
              </template>
            </div>
            <button @click="adjustNumber('dailyWater', 1, 0, 10000, 250, 1500)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Plus class="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div v-for="q in [
            { key: 'drinkAlcohol', label: '平时饮酒吗？', options: freqOptions },
            { key: 'smoke', label: '平时吸烟吗？', options: freqOptions },
            { key: 'snack', label: '经常吃零食吗？', options: ynOptions },
          ]" :key="q.key" class="space-y-2.5">
          <label class="text-sm font-medium text-gray-700 block">{{ q.label }} <span class="text-red-500">*</span></label>
          <div class="flex gap-2.5">
            <button
              v-for="opt in q.options"
              :key="opt.value"
              @click="(formData as any)[q.key] = opt.value; error = ''"
              :class="['flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all active:scale-95', (formData as any)[q.key] === opt.value ? opt.activeClass : 'bg-white border-gray-200 text-gray-500']"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </Card>

      <!-- ============ Step 4: 运动习惯 ============ -->
      <Card v-else-if="step === 4" key="s4" class="space-y-6 flex-1">
        <div>
          <h3 class="font-bold text-gray-900 text-lg">你的运动习惯</h3>
          <p class="text-xs text-gray-400 mt-1">别担心，不运动也能参加，营养师会帮你从零开始</p>
        </div>

        <!-- 每周运动频率 -->
        <div>
          <label class="text-sm font-medium text-gray-700 block mb-1.5">每周运动几次 <span class="text-red-500">*</span></label>
          <div class="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            <button @click="adjustNumber('exerciseFrequency', -1, 0, 21, 1, 3)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Minus class="w-5 h-5 text-gray-600" />
            </button>
            <div class="flex-1 text-center" @click="startEdit('exerciseFrequency')">
              <input
                v-if="editingField === 'exerciseFrequency'"
                type="number" inputmode="numeric" step="1" min="0" max="21"
                v-model="formData.exerciseFrequency"
                @blur="stopEdit"
                v-focus
                class="w-24 text-3xl font-black text-[#07C160] text-center bg-white rounded-lg border border-[#07C160] focus:outline-none py-1"
              />
              <template v-else>
                <span class="text-3xl font-black text-[#07C160]">{{ formData.exerciseFrequency }}</span>
                <span class="text-sm text-gray-400 ml-1">次/周</span>
              </template>
            </div>
            <button @click="adjustNumber('exerciseFrequency', 1, 0, 21, 1, 3)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Plus class="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <!-- 每次时长 -->
        <div>
          <label class="text-sm font-medium text-gray-700 block mb-1.5">每次大概运动多久 <span class="text-red-500">*</span></label>
          <div class="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            <button @click="adjustNumber('exerciseDuration', -1, 0, 600, 15, 45)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Minus class="w-5 h-5 text-gray-600" />
            </button>
            <div class="flex-1 text-center" @click="startEdit('exerciseDuration')">
              <input
                v-if="editingField === 'exerciseDuration'"
                type="number" inputmode="numeric" step="5" min="0" max="600"
                v-model="formData.exerciseDuration"
                @blur="stopEdit"
                v-focus
                class="w-24 text-3xl font-black text-[#FF976A] text-center bg-white rounded-lg border border-[#FF976A] focus:outline-none py-1"
              />
              <template v-else>
                <span class="text-3xl font-black text-[#FF976A]">{{ formData.exerciseDuration }}</span>
                <span class="text-sm text-gray-400 ml-1">分钟</span>
              </template>
            </div>
            <button @click="adjustNumber('exerciseDuration', 1, 0, 600, 15, 45)" class="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <Plus class="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <!-- 运动类型图标网格 -->
        <div>
          <label class="text-sm font-medium text-gray-700 block mb-2">平时喜欢做什么运动 <span class="text-red-500">*</span></label>
          <div class="grid grid-cols-3 gap-2.5">
            <button
              v-for="opt in EXERCISE_OPTIONS"
              :key="opt.label"
              @click="toggleMulti(opt.label)"
              :class="['py-3.5 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all active:scale-95', formData.exerciseTypes.includes(opt.label) || (opt.label === '其他' && formData.exerciseTypes.some((x) => !EXERCISE_OPTIONS.some((o) => o.label === x))) ? 'bg-[#07C160]/10 border-[#07C160] text-[#07C160]' : 'bg-white border-gray-200 text-gray-500']"
            >
              <component :is="opt.icon" class="w-6 h-6" />
              <span class="text-xs font-bold">{{ opt.label }}</span>
            </button>
          </div>
          <!-- 选"其他"时的自定义输入 -->
          <transition name="step-fade">
            <div v-if="formData.exerciseTypes.includes('其他')" class="mt-3">
              <input
                type="text"
                v-model="customExercise"
                @input="error = ''"
                placeholder="请输入具体运动名称，如：爬山、普拉提、羽毛球"
                class="w-full rounded-xl border border-gray-200 p-3.5 focus:border-[#07C160] focus:outline-none focus:ring-2 focus:ring-[#07C160]/10"
              />
              <p class="text-[10px] text-gray-400 mt-1.5">填写后会显示在你的个人档案里</p>
            </div>
          </transition>
        </div>
      </Card>

      <!-- ============ Step 5: 给营养师的小助手 + 画像摘要 ============ -->
      <div v-else-if="step === 5" key="s5" class="space-y-5 flex-1">
        <!-- 健康画像摘要 -->
        <Card class="bg-gradient-to-br from-[#07C160]/5 to-teal-50 border-[#07C160]/20">
          <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-[#07C160]" />
            你的健康画像
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-1 bg-white rounded-full text-xs font-bold text-gray-700 border border-gray-100">{{ formData.gender === 'male' ? '👨' : '👩' }} {{ formData.age || '--' }}岁</span>
              <span v-if="bmiInfo" class="px-2.5 py-1 bg-white rounded-full text-xs font-bold border border-gray-100" :class="bmiInfo.color">BMI {{ bmi!.toFixed(1) }} · {{ bmiInfo.text }}</span>
              <span class="px-2.5 py-1 bg-white rounded-full text-xs font-bold text-gray-700 border border-gray-100">每周运动 {{ formData.exerciseFrequency || 0 }} 次</span>
            </div>
            <p class="text-xs text-gray-500 leading-relaxed pt-1">
              {{ formData.exerciseTypes.filter((x) => x !== '其他').length > 0 ? `喜欢 ${formData.exerciseTypes.filter((x) => x !== '其他').slice(0, 3).join('、')}${formData.exerciseTypes.filter((x) => x !== '其他').length > 3 ? ' 等' : ''}，` : '' }}每天睡 {{ formData.sleepDuration || '--' }} 小时，喝 {{ formData.dailyWater || '--' }}ml 水。营养师已经了解你啦，接下来 28 天一起加油！
            </p>
          </div>
        </Card>

        <Card class="space-y-4">
          <div>
            <h3 class="font-bold text-gray-900">给营养师的小助手</h3>
            <p class="text-xs text-gray-400 mt-1 leading-relaxed">
              选填。上传最近的体检报告，营养师能为你定制更精准的方案；没有也不影响参营。
            </p>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="(r, idx) in formData.medicalReports"
              :key="idx"
              class="relative aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 group cursor-pointer"
              @click="openReport(r)"
            >
              <div v-if="r.type === 'pdf'" class="w-full min-h-full flex flex-col items-center justify-center bg-gray-50 text-[#07C160]">
                <FileText class="w-8 h-8 mb-1" />
                <span class="text-[10px] text-gray-500 truncate px-1">{{ r.name || 'PDF报告' }}</span>
              </div>
              <img loading="lazy" decoding="async" v-else :src="r.url" :alt="`报告 ${idx + 1}`" class="w-full min-h-full object-cover" />
              <button @click.stop="removeReport(idx)" class="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white hover:bg-black/70">
                <X class="w-3 h-3" />
              </button>
              <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 truncate">
                {{ r.type === 'pdf' ? (r.name || `体检报告_${idx + 1}`) : `体检报告_${idx + 1}` }}
              </div>
            </div>

            <button
              v-if="formData.medicalReports.length < 5"
              @click="reportInputRef?.click()"
              class="aspect-[3/4] flex flex-col items-center justify-center rounded-lg border border-dashed border-[#07C160]/40 bg-[#07C160]/5 text-[#07C160] hover:bg-[#07C160]/10 transition-colors"
            >
              <UploadCloud class="w-6 h-6 mb-1" />
              <span class="text-[10px]">添加文件</span>
            </button>
          </div>
          <input ref="reportInputRef" type="file" accept="image/*,application/pdf" multiple class="hidden" @change="handleReportSelect" />
          <p class="text-[10px] text-gray-400">支持 JPG/PNG/PDF，最多 5 份，单份不超过 10MB</p>
        </Card>
      </div>
      </transition>

      <p v-if="error" class="text-red-500 text-sm text-center animate-shake">{{ error }}</p>
    </div>

    <!-- 固定底部导航按钮 -->
    <div class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div class="max-w-md mx-auto flex gap-3">
        <Button v-if="step > 1" class="flex-1 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" @click="handlePrev">
          上一步
        </Button>
        <Button class="flex-1 bg-[#07C160] hover:bg-[#07C160]/90 text-white" @click="handleNext">
          {{ step === 5 ? '完成，开启我的健康之旅' : '下一步' }}
        </Button>
      </div>
    </div>

    <!-- 时间选择器弹窗 -->
    <VanPopup v-model:show="showTimePicker" position="bottom" round>
      <VanTimePicker
        v-model="timePickerValue"
        :title="timePickerField === 'wakeTime' ? '选择起床时间' : '选择睡觉时间'"
        :columns-type="['hour', 'minute']"
        @confirm="onTimePickerConfirm"
        @cancel="showTimePicker = false"
      />
    </VanPopup>
  </div>
</template>

<style scoped>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
.step-fade-enter-active, .step-fade-leave-active {
  transition: all 0.3s ease;
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
