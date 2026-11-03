<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { rankStudents } from '../lib/scoring';
import { formatDateTime } from '../lib/utils';
import { Activity, Utensils, Award } from 'lucide-vue-next';
import type { ExerciseRecord, DietRecord, ManualScoreRecord } from '../types';

const MEAL_TYPES = [
  { id: 'breakfast', label: '早餐' },
  { id: 'lunch', label: '午餐' },
  { id: 'dinner', label: '晚餐' },
  { id: 'snack', label: '加餐' },
];

const store = useAppStore();
const activeTab = ref<'diet' | 'exercise' | 'manual'>('diet');

// 按查看对象的营期过滤学员列表
const campId = computed(() => {
  const studentId = store.selectedStudentId;
  if (!studentId) return null;
  return store.getStudentCampId(studentId);
});

const campStudents = computed(() => {
  if (!campId.value) return [];
  return store.getStudentsByCamp(campId.value);
});

// 按营期过滤打卡记录
const campDiet = computed(() => campId.value ? store.getCampDietRecords(campId.value) : store.dietRecords);
const campEx = computed(() => campId.value ? store.getCampExerciseRecords(campId.value) : store.exerciseRecords);
const campManual = computed(() => campId.value ? store.getCampManualScoreRecords(campId.value) : store.manualScoreRecords);

const student = computed(() => campStudents.value.find((s) => s.id === store.selectedStudentId));

// 总榜：使用总排名数据
const rankedStudents = computed(() => {
  if (campStudents.value.length === 0) return [];
  return rankStudents(campStudents.value, campDiet.value, campEx.value, campManual.value);
});
const scoreData = computed(() => rankedStudents.value.find((s) => s.studentId === store.selectedStudentId));


const noPermission = computed(() => store.user?.role === 'student' && store.user.id !== store.selectedStudentId);

const studentDiet = computed(() => {
  if (!student.value) return [];
  const records = campDiet.value.filter((r) => r.studentId === student.value!.id);
  return records.sort((a, b) => b.date.localeCompare(a.date));
});

const studentExercise = computed(() => {
  if (!student.value) return [];
  const records = campEx.value.filter((r) => r.studentId === student.value!.id);
  return records.sort((a, b) => b.date.localeCompare(a.date));
});

const mealLabel = (meal: string) => MEAL_TYPES.find((m) => m.id === meal)?.label;

/** 手动加减分记录 */
const studentManualScores = computed<ManualScoreRecord[]>(() => {
  if (!student.value) return [];
  const records = campManual.value.filter((r) => r.studentId === student.value!.id);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

/** 计算单条运动记录的积分（与 scoring.ts calculateExerciseScore 一致） */
const exercisePoints = (record: ExerciseRecord): number => {
  let pts = 0;
  if (record.duration >= 40) pts += 1;
  if (record.coachScore === 2) pts += 2;
  else if (record.coachScore === 1) pts += 1;
  return pts;
};
</script>

<template>
  <div v-if="noPermission" class="flex min-h-full flex-col bg-[#F7F8FA]">
    <NavBar title="积分明细" :on-back="store.goBack" />
    <div class="flex-1 flex justify-center items-center text-gray-500">
      无权查看他人明细
    </div>
  </div>

  <div v-else-if="!student || !scoreData" class="flex min-h-full flex-col bg-[#F7F8FA]">
    <NavBar title="积分明细" :on-back="store.goBack" />
    <div class="flex-1 flex justify-center items-center text-gray-500">
      未找到学员信息
    </div>
  </div>

  <div v-else class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe">
    <NavBar :title="`${student.name} 的积分明细`" :on-back="store.goBack" />

    <div class="bg-white p-6 border-b border-gray-100 flex justify-between items-center">
      <div>
        <div class="text-3xl font-bold text-[#FF976A]">{{ scoreData.totalScore }}</div>
        <div class="text-xs text-gray-500 mt-1">总积分</div>
      </div>
      <div class="text-right">
        <div class="text-2xl font-bold text-gray-900">第 {{ scoreData.rank }} 位</div>
        <div class="text-xs text-gray-500 mt-1">总排名</div>
      </div>
    </div>

    <div class="flex gap-4 px-4 bg-white border-b border-gray-200 sticky top-14 z-10">
      <button
        :class="['py-3 text-sm font-bold border-b-2 transition-colors flex-1', activeTab === 'diet' ? 'border-[#FF976A] text-[#FF976A]' : 'border-transparent text-gray-500 hover:text-gray-900']"
        @click="activeTab = 'diet'"
      >
        饮食积分 ({{ scoreData.dietScore }})
      </button>
      <button
        :class="['py-3 text-sm font-bold border-b-2 transition-colors flex-1', activeTab === 'exercise' ? 'border-[#07C160] text-[#07C160]' : 'border-transparent text-gray-500 hover:text-gray-900']"
        @click="activeTab = 'exercise'"
      >
        运动积分 ({{ scoreData.exerciseScore }})
      </button>
      <button
        :class="['py-3 text-sm font-bold border-b-2 transition-colors flex-1', activeTab === 'manual' ? 'border-[#0958d9] text-[#0958d9]' : 'border-transparent text-gray-500 hover:text-gray-900']"
        @click="activeTab = 'manual'"
      >
        手动调整 ({{ (scoreData as any).manualScore ?? 0 }})
      </button>
    </div>

    <div class="p-4 space-y-3">
      <template v-if="activeTab === 'diet'">
        <div v-if="studentDiet.length === 0" class="text-center py-10 text-gray-400 text-sm">
          暂无饮食记录
        </div>
        <Card v-for="record in studentDiet" v-else :key="record.id" class="p-4">
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
              <Utensils class="w-4 h-4 text-[#FF976A]" />
              <span class="text-sm font-bold text-gray-900">{{ formatDateTime(record.date) }}</span>
              <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                {{ mealLabel(record.meal) }}
              </span>
            </div>
            <div v-if="record.dietitianScore != null" :class="['font-bold', record.dietitianScore >= 2 ? 'text-[#07C160]' : record.dietitianScore === 1 ? 'text-[#FF976A]' : 'text-gray-400']">
              +{{ record.dietitianScore }}
            </div>
            <div v-else class="text-[10px] text-gray-400 font-medium px-1.5 py-0.5 bg-gray-100 rounded">待批注</div>
          </div>
          <div class="text-sm text-gray-700 whitespace-pre-wrap">{{ record.isFasted ? '未进食' : record.description }}</div>

          <div v-if="record.dietitianComment" class="mt-3 bg-gray-50 p-2 rounded text-xs text-gray-600">
            <span class="font-bold text-[#FF976A] mr-1">{{ record.dietitianName || '营养师' }}批注:</span>
            {{ record.dietitianComment }}
          </div>
        </Card>
      </template>

      <template v-if="activeTab === 'exercise'">
        <div v-if="studentExercise.length === 0" class="text-center py-10 text-gray-400 text-sm">
          暂无运动记录
        </div>
        <Card v-for="record in studentExercise" v-else :key="record.id" class="p-4">
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
              <Activity class="w-4 h-4 text-[#07C160]" />
              <span class="text-sm font-bold text-gray-900">{{ formatDateTime(record.date) }}</span>
              <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                {{ record.type }}
              </span>
            </div>
            <div :class="['font-bold', exercisePoints(record) > 0 ? 'text-[#07C160]' : 'text-gray-400']">
              +{{ exercisePoints(record) }}
            </div>
          </div>
          <div class="text-sm text-gray-700">时长: {{ record.duration }} 分钟</div>
          <div v-if="record.duration < 40" class="text-[10px] text-gray-500 mt-1 bg-gray-50 p-1 rounded inline-block">未达40分钟，不计基础分</div>
          <div v-if="record.coachScore != null" class="text-[10px] text-[#07C160] mt-1 bg-[#07C160]/5 p-1 rounded inline-block ml-1">
            教练评分: +{{ record.coachScore }} 加成
          </div>
          <div v-if="record.coachComment" class="mt-3 bg-gray-50 p-2 rounded text-xs text-gray-600">
            <span class="font-bold text-[#07C160] mr-1">{{ record.coachName || '教练' }}批注:</span>
            {{ record.coachComment }}
          </div>
        </Card>
      </template>

      <template v-if="activeTab === 'manual'">
        <div v-if="studentManualScores.length === 0" class="text-center py-10 text-gray-400 text-sm">
          暂无手动调整记录
        </div>
        <Card v-for="record in studentManualScores" v-else :key="record.id" class="p-4">
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
              <Award class="w-4 h-4 text-[#0958d9]" />
              <span class="text-sm font-bold text-gray-900">{{ formatDateTime(record.createdAt) }}</span>
            </div>
            <div :class="['font-bold', record.points >= 0 ? 'text-[#07C160]' : 'text-red-500']">
              {{ record.points >= 0 ? '+' : '' }}{{ record.points }}
            </div>
          </div>
          <div class="text-sm text-gray-700">{{ record.reason }}</div>
          <div class="text-xs text-gray-400 mt-1">操作人：{{ record.dietitianName }}</div>
        </Card>
      </template>
    </div>
  </div>
</template>