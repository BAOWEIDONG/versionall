<script setup lang="ts">
import { ref, computed } from 'vue';
import { showToast } from 'vant';
import { useAppStore } from '../store/app';
import { metricValuesFor } from '../mock/data';
import { latestOrFirstId } from '../lib/camps';
import { NavBar, Card } from './ui';
import { Download } from 'lucide-vue-next';

// 与指标配置一致的 key；仅统计有营前+营后数值的指标
const INDICATORS = [
  { key: 'mc_body_weight', name: '体重(kg)', isIncreaseGood: false },
  { key: 'mc_body_fat', name: '脂肪量(kg)', isIncreaseGood: false },
  { key: 'mc_body_skeletal', name: '骨骼肌(kg)', isIncreaseGood: true },
  { key: 'mc_body_visceral', name: '内脏脂肪面积(cm²)', isIncreaseGood: false },
  { key: 'mc_bs_fasting', name: '空腹血糖(mmol/L)', isIncreaseGood: false },
  { key: 'mc_bl_tg', name: '甘油三酯(mmol/L)', isIncreaseGood: false },
];

const store = useAppStore();
const activeTab = ref<'individual' | 'average'>('average');

const campId = computed(() => store.selectedCampId || latestOrFirstId(store.camps));
const camp = computed(() => store.camps.find((c) => c.id === campId.value) || null);
const students = computed(() => (campId.value ? store.getStudentsByCamp(campId.value) : []));

const exportData = () => showToast('数据已导出');

/** 只保留营前、营后都有数值的学员；进行中营期（无复测）自然为空 */
const studentChanges = computed(() =>
  students.value.map((stu) => {
    const vals = metricValuesFor(stu.id, campId.value);
    const changes: Record<string, number> = {};
    let has = false;
    INDICATORS.forEach((ind) => {
      const b = Number((vals as any)[ind.key]?.beforeValue);
      const a = Number((vals as any)[ind.key]?.afterValue);
      if ((vals as any)[ind.key]?.beforeValue != null && (vals as any)[ind.key]?.afterValue != null && Number.isFinite(b) && Number.isFinite(a)) {
        changes[ind.key] = Number((a - b).toFixed(2));
        has = true;
      }
    });
    return has ? { name: stu.name, changes } : null;
  }).filter((x): x is { name: string; changes: Record<string, number> } => !!x),
);

const averageChanges = computed(() => {
  const avg: Record<string, number | null> = {};
  INDICATORS.forEach((ind) => {
    const list = studentChanges.value.map((sc) => sc.changes[ind.key]).filter((v) => typeof v === 'number');
    avg[ind.key] = list.length ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2)) : null;
  });
  return avg;
});

const changeMeta = (val: number | null | undefined, isIncreaseGood: boolean) => {
  if (val === null || val === undefined || Number.isNaN(val)) return { cls: 'text-gray-300', text: '--' };
  if (val === 0) return { cls: 'text-gray-500', text: '0' };
  const isIncrease = val > 0;
  const isGood = isIncrease ? isIncreaseGood : !isIncreaseGood;
  const strVal = val > 0 ? `+${val}` : `${val}`;
  return { cls: isGood ? 'text-[#07C160] font-bold' : 'text-red-500 font-bold', text: strVal };
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe">
    <NavBar title="结营数据统计" :on-back="store.goBack">
      <template #right>
        <button class="p-2 text-gray-500 hover:text-gray-900" @click="exportData">
          <Download class="w-5 h-5" />
        </button>
      </template>
    </NavBar>

    <div class="bg-white px-4 border-b border-gray-200">
      <div class="flex gap-6">
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors', activeTab === 'average' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500']"
          @click="activeTab = 'average'"
        >
          全员平均变化量
        </button>
        <button
          :class="['py-3 text-sm font-bold border-b-2 transition-colors', activeTab === 'individual' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500']"
          @click="activeTab = 'individual'"
        >
          个人指标变化量
        </button>
      </div>
    </div>

    <div class="p-4 flex-1">
      <Card class="p-0 overflow-hidden bg-white border border-gray-200">
        <div v-if="activeTab === 'average'">
          <div class="p-4 bg-gray-50 border-b border-gray-200">
            <h3 class="font-bold text-gray-900 text-sm mb-1">训练营整体改善效果</h3>
            <p class="text-xs text-gray-500">基于 {{ studentChanges.length }} 名有营前/营后复测数据的学员（{{ camp?.name || '当前营期' }}）</p>
            <div class="flex gap-4 mt-3 text-xs">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-[#07C160]"></span>改善方向</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span>恶化方向</span>
            </div>
          </div>
          <div v-if="studentChanges.length === 0" class="p-6 text-center text-xs text-gray-400">
            当前营期尚无结营复测数据{{ camp ? '（' + camp.name + '进行中）' : '' }}，复测录入后这里会自动生成对比。
          </div>
          <div v-else class="divide-y divide-gray-100">
            <div v-for="ind in INDICATORS" :key="ind.key" class="flex justify-between items-center p-4 hover:bg-gray-50">
              <span class="text-sm font-medium text-gray-900">{{ ind.name }}</span>
              <div class="text-base text-right w-24">
                <span :class="changeMeta(averageChanges[ind.key], ind.isIncreaseGood).cls">{{ changeMeta(averageChanges[ind.key], ind.isIncreaseGood).text }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="overflow-x-auto">
          <div class="p-4 bg-gray-50 border-b border-gray-200">
            <h3 class="font-bold text-gray-900 text-sm mb-1">学员个人改善明细</h3>
            <p class="text-xs text-gray-500">左右滑动查看更多指标（结营后 - 开营前）</p>
          </div>
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead class="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th class="p-3 font-medium sticky left-0 bg-gray-50 border-r border-gray-200">学员姓名</th>
                <th v-for="ind in INDICATORS" :key="ind.key" class="p-3 font-medium text-center">{{ ind.name }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="studentChanges.length === 0"><td :colspan="INDICATORS.length + 1" class="p-6 text-center text-xs text-gray-400">当前营期尚无结营复测数据</td></tr>
              <tr v-for="(sc, idx) in studentChanges" :key="idx" class="hover:bg-gray-50">
                <td class="p-3 font-bold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                  {{ sc.name }}
                </td>
                <td v-for="ind in INDICATORS" :key="ind.key" class="p-3 text-center">
                  <span :class="changeMeta(sc.changes[ind.key], ind.isIncreaseGood).cls">{{ changeMeta(sc.changes[ind.key], ind.isIncreaseGood).text }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>
</template>
