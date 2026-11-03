<script setup lang="ts">
import { computed, ref } from 'vue';
import { format, subDays } from 'date-fns';
import { useAppStore } from '../store/app';
import { Card } from './ui';
import { ChevronDown, Download, Users, ChevronRight, UserCheck } from 'lucide-vue-next';
import { Popup as VanPopup, showToast } from 'vant';

const store = useAppStore();

type RangeKey = 'today' | 'yesterday' | 'last7' | 'camp';
const range = ref<RangeKey>('yesterday');
const ranges: { key: RangeKey; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'last7', label: '近7天' },
  { key: 'camp', label: '营期累计' },
];

// ─── 营期 ───
const showCampPicker = ref(false);
const activeCampId = computed(() => {
  if (store.selectedCampId) return store.selectedCampId;
  const opened = store.camps.filter((c) => c.status !== 'upcoming');
  return store.pickLatestCamp(opened)?.id || store.camps[0]?.id || null;
});
const camp = computed(() => store.camps.find((c) => c.id === activeCampId.value) || null);

const todayStr = format(new Date(), 'yyyy-MM-dd');
const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

const dateRange = computed(() => {
  if (range.value === 'today') return { from: todayStr, to: todayStr };
  if (range.value === 'yesterday') return { from: yesterdayStr, to: yesterdayStr };
  if (range.value === 'last7') return { from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: todayStr };
  const from = camp.value?.startDate?.substring(0, 10) || todayStr;
  const end = camp.value?.endDate?.substring(0, 10) || todayStr;
  const to = end > todayStr ? todayStr : end;
  return { from, to: to < from ? from : to };
});

const inRange = (dateStr: string) => {
  const d = dateStr.substring(0, 10);
  return d >= dateRange.value.from && d <= dateRange.value.to;
};

// ─── 批注记录 ───
interface Annotation { name: string; date: string }
interface Entry {
  id: string;
  type: 'diet' | 'weight' | 'exercise';
  typeLabel: string;
  studentId: string;
  studentName: string;
  date: string;
  summary: string;
  ownerRole: 'dietitian' | 'coach';
  annotations: Annotation[];
}

const campStudents = computed(() => (activeCampId.value ? store.getStudentsByCamp(activeCampId.value) : []));
const studentName = (id: string) => campStudents.value.find((s) => s.id === id)?.name || id;

const annotationsOf = (rec: any, role: 'dietitian' | 'coach'): Annotation[] => {
  const list: Annotation[] = [];
  const arr = Array.isArray(rec.comments) ? rec.comments : [];
  arr.filter((c: any) => c.role === role).forEach((c: any) => list.push({ name: c.name, date: c.date }));
  if (list.length === 0) {
    if (role === 'dietitian' && rec.dietitianComment) list.push({ name: rec.dietitianName || '营养师', date: rec.dietitianCommentDate || '' });
    if (role === 'coach' && rec.coachComment) list.push({ name: rec.coachName || '教练', date: rec.coachCommentDate || '' });
  }
  return list;
};

const entries = computed<Entry[]>(() => {
  if (!activeCampId.value) return [];
  const list: Entry[] = [];
  for (const r of store.getCampDietRecords(activeCampId.value)) {
    if (!inRange(r.date)) continue;
    list.push({ id: r.id, type: 'diet', typeLabel: '饮食', studentId: r.studentId || '', studentName: studentName(r.studentId || ''), date: r.date, summary: r.description || '', ownerRole: 'dietitian', annotations: annotationsOf(r, 'dietitian') });
  }
  for (const r of store.getCampWeightRecords(activeCampId.value)) {
    if (!inRange(r.date)) continue;
    list.push({ id: r.id, type: 'weight', typeLabel: '体重', studentId: r.studentId || '', studentName: studentName(r.studentId || ''), date: r.date, summary: `${r.weight} kg`, ownerRole: 'dietitian', annotations: annotationsOf(r, 'dietitian') });
  }
  for (const r of store.getCampExerciseRecords(activeCampId.value)) {
    if (!inRange(r.date)) continue;
    list.push({ id: r.id, type: 'exercise', typeLabel: '运动', studentId: r.studentId || '', studentName: studentName(r.studentId || ''), date: r.date, summary: `${r.type} · ${r.duration} 分钟`, ownerRole: 'coach', annotations: annotationsOf(r, 'coach') });
  }
  return list;
});

const overview = computed(() => {
  const required = entries.value.length;
  const annotated = entries.value.filter((e) => e.annotations.length > 0).length;
  return { required, annotated, pending: required - annotated, rate: required ? Math.round((annotated / required) * 100) : 0 };
});

// ─── 批注类型明细 ───
const typeOverview = computed(() => {
  const defs = [
    { key: 'diet', label: '饮食', color: '#FF976A' },
    { key: 'weight', label: '体重', color: '#1677FF' },
    { key: 'exercise', label: '运动', color: '#07C160' },
  ] as const;
  return defs.map((d) => {
    const list = entries.value.filter((e) => e.type === d.key);
    const annotated = list.filter((e) => e.annotations.length > 0).length;
    return { ...d, required: list.length, annotated, pending: list.length - annotated, rate: list.length ? Math.round((annotated / list.length) * 100) : 0 };
  });
});

// ─── 人员批注量（按实际批注人，拆到类型） ───
const staffStats = computed(() => {
  const staff = store.accounts.filter((a) => a.active && (a.role === 'dietitian' || a.role === 'coach') && !a.supervisor);
  return staff.map((a) => {
    let count = 0;
    let dietCount = 0;
    let weightCount = 0;
    let exerciseCount = 0;
    let hours = 0;
    let timed = 0;
    for (const e of entries.value) {
      // 口径：一条记录只记一次工作量，归属「该记录第一条批注」的批注人
      const ann = e.annotations[0];
      if (!ann || ann.name !== a.name) continue;
      count++;
      if (e.type === 'diet') dietCount++;
      else if (e.type === 'weight') weightCount++;
      else exerciseCount++;
      if (ann.date) {
        const diff = (new Date(ann.date).getTime() - new Date(e.date).getTime()) / 3600000;
        if (Number.isFinite(diff) && diff >= 0) { hours += diff; timed++; }
      }
    }
    return { id: a.id, name: a.name, roleLabel: a.role === 'dietitian' ? '营养师' : '教练', count, dietCount, weightCount, exerciseCount, avgHours: timed ? Math.round((hours / timed) * 10) / 10 : null };
  }).sort((x, y) => y.count - x.count);
});

// ─── 学员批注覆盖 ───
const studentRows = computed(() => campStudents.value.map((s) => {
  const list = entries.value.filter((e) => e.studentId === s.id);
  const by = (t: Entry['type']) => {
    const sub = list.filter((e) => e.type === t);
    return { required: sub.length, annotated: sub.filter((e) => e.annotations.length > 0).length };
  };
  return {
    ...s,
    dietAnn: by('diet'),
    weightAnn: by('weight'),
    exerciseAnn: by('exercise'),
    unannotated: list.filter((e) => e.annotations.length === 0).length,
  };
}).sort((a, b) => b.unannotated - a.unannotated));

// ─── 覆盖学员：范围内至少有一条已被批注的学员 ───
const coveredStudents = computed(() => {
  const ids = new Set(entries.value.filter((e) => e.annotations.length > 0).map((e) => e.studentId));
  return { covered: ids.size, total: campStudents.value.length };
});

const openStudent = (id: string) => {
  store.setSelectedStudentId(id);
  store.setCurrentView('dietitian-student-detail');
};

// ─── 导出 CSV ───
const exportCsv = () => {
  const lines: string[][] = [];
  lines.push(['运营总览（批注情况）', camp.value?.name || '', `${dateRange.value.from} ~ ${dateRange.value.to}`]);
  lines.push([]);
  lines.push(['批注整体']);
  lines.push(['应批注', '已批注', '待批注', '批注率']);
  lines.push([String(overview.value.required), String(overview.value.annotated), String(overview.value.pending), `${overview.value.rate}%`]);
  lines.push([]);
  lines.push(['批注类型明细']);
  lines.push(['类型', '应批注', '已批注', '待批注', '批注率']);
  typeOverview.value.forEach((t) => lines.push([t.label, String(t.required), String(t.annotated), String(t.pending), `${t.rate}%`]));
  lines.push([]);
  lines.push(['人员批注量（按类型）']);
  lines.push(['姓名', '角色', '饮食', '体重', '运动', '合计', '平均响应(小时)']);
  staffStats.value.forEach((s) => lines.push([
    s.name, s.roleLabel,
    s.roleLabel === '营养师' ? String(s.dietCount) : '',
    s.roleLabel === '营养师' ? String(s.weightCount) : '',
    s.roleLabel === '教练' ? String(s.exerciseCount) : '',
    String(s.count), s.avgHours === null ? '' : String(s.avgHours),
  ]));
  lines.push([]);
  lines.push(['学员批注覆盖']);
  lines.push(['学员', '饮食批注/应', '体重批注/应', '运动批注/应', '待批注条数']);
  studentRows.value.forEach((s) => lines.push([
    s.name,
    `${s.dietAnn.annotated}/${s.dietAnn.required}`,
    `${s.weightAnn.annotated}/${s.weightAnn.required}`,
    `${s.exerciseAnn.annotated}/${s.exerciseAnn.required}`,
    String(s.unannotated),
  ]));
  const csv = lines.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `运营总览_批注_${camp.value?.name || ''}_${dateRange.value.from}_${dateRange.value.to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast({ message: '已导出 CSV', duration: 1500 });
};
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col pb-8 font-sans bg-[#F7F8FA]">
    <!-- 顶部 -->
    <div class="pt-[calc(env(safe-area-inset-top)+2rem)] px-5 pb-4 bg-gradient-to-b from-[#1F4E79]/10 to-[#F7F8FA]">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-black text-gray-900">运营总览</h2>
          <p class="text-[11px] text-gray-500 mt-0.5">营养师 / 教练批注情况</p>
        </div>
        <div class="flex items-center gap-1">
          <button @click="exportCsv" class="p-2 rounded-full bg-white/70 text-[#1F4E79] active:bg-white"><Download class="w-5 h-5" /></button>
          <button @click="store.goBack()" class="px-3 py-1.5 rounded-full bg-white/70 text-xs font-bold text-gray-600 active:bg-white">返回</button>
        </div>
      </div>
      <div class="flex items-center gap-2 mt-3">
        <button @click="showCampPicker = true" class="flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
          {{ camp?.name || '未选择营期' }}<ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
        <span class="text-[11px] text-gray-400">{{ dateRange.from }} ~ {{ dateRange.to }}</span>
      </div>
      <div class="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
        <button v-for="r in ranges" :key="r.key" @click="range = r.key"
          :class="['px-3 py-1.5 rounded-full text-xs font-bold shrink-0', range === r.key ? 'bg-[#1F4E79] text-white' : 'bg-white text-gray-600 border border-gray-200']">
          {{ r.label }}
        </button>
      </div>
    </div>

    <div class="px-5 space-y-4">
      <!-- 批注概览 -->
      <div class="grid grid-cols-4 gap-2">
        <Card class="p-3 text-center">
          <div class="text-lg font-black text-gray-900">{{ overview.required }}</div>
          <div class="text-[10px] text-gray-500 mt-0.5">应批注</div>
        </Card>
        <Card class="p-3 text-center">
          <div class="text-lg font-black text-[#FF976A]">{{ overview.pending }}</div>
          <div class="text-[10px] text-gray-500 mt-0.5">待批注</div>
        </Card>
        <Card class="p-3 text-center">
          <div class="text-lg font-black text-[#1F4E79]">{{ overview.rate }}%</div>
          <div class="text-[10px] text-gray-500 mt-0.5">批注率</div>
        </Card>
        <Card class="p-3 text-center">
          <div class="text-lg font-black text-[#07C160]">{{ coveredStudents.covered }}<span class="text-[11px] font-normal text-gray-400">/{{ coveredStudents.total }}</span></div>
          <div class="text-[10px] text-gray-500 mt-0.5">覆盖学员</div>
        </Card>
      </div>
      <p class="text-[10px] text-gray-400 px-1 -mt-2">
        口径：应批注=范围内饮食/体重/运动记录数；待批注=其中未被对应角色批注的记录；批注率=已批注÷应批注；平均响应=记录时间到首次批注的时长。
      </p>

      <!-- 批注类型明细 -->
      <Card class="p-4">
        <h3 class="text-sm font-bold text-gray-900 mb-2">批注类型明细</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-[11px] min-w-[340px]">
            <thead>
              <tr class="text-gray-500 border-b border-gray-100">
                <th class="text-left py-2 font-medium">类型</th>
                <th class="text-right py-2 font-medium">应批注</th>
                <th class="text-right py-2 font-medium">已批注</th>
                <th class="text-right py-2 font-medium">待批注</th>
                <th class="text-right py-2 font-medium">批注率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in typeOverview" :key="t.key" class="border-b border-gray-50 last:border-0">
                <td class="py-2 text-left">
                  <span class="inline-flex items-center gap-1.5 text-gray-800 font-medium">
                    <span class="w-2 h-2 rounded-full" :style="{ background: t.color }"></span>{{ t.label }}
                  </span>
                </td>
                <td class="py-2 text-right text-gray-700">{{ t.required }}</td>
                <td class="py-2 text-right text-[#07C160] font-bold">{{ t.annotated }}</td>
                <td class="py-2 text-right" :class="t.pending > 0 ? 'text-[#FF976A] font-bold' : 'text-gray-400'">{{ t.pending }}</td>
                <td class="py-2 text-right text-gray-700">{{ t.rate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <!-- 人员批注量 -->
      <Card class="p-4">
        <h3 class="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
          <UserCheck class="w-4 h-4 text-[#1F4E79]" /> 人员批注量（按类型）
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-[11px] min-w-[520px] freeze-first">
            <thead>
              <tr class="text-gray-500 border-b border-gray-100">
                <th class="text-left py-2 font-medium">人员</th>
                <th class="text-right py-2 font-medium">饮食</th>
                <th class="text-right py-2 font-medium">体重</th>
                <th class="text-right py-2 font-medium">运动</th>
                <th class="text-right py-2 font-medium">合计</th>
                <th class="text-right py-2 font-medium">平均响应</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in staffStats" :key="s.id" class="border-b border-gray-50 last:border-0">
                <td class="py-2 text-left">
                  <div class="text-xs font-bold text-gray-900">{{ s.name }}</div>
                  <div class="text-[9px] text-gray-400">{{ s.roleLabel }}</div>
                </td>
                <td class="py-2 text-right" :class="s.roleLabel === '营养师' ? 'text-gray-800 font-bold' : 'text-gray-300'">{{ s.roleLabel === '营养师' ? s.dietCount : '—' }}</td>
                <td class="py-2 text-right" :class="s.roleLabel === '营养师' ? 'text-gray-800 font-bold' : 'text-gray-300'">{{ s.roleLabel === '营养师' ? s.weightCount : '—' }}</td>
                <td class="py-2 text-right" :class="s.roleLabel === '教练' ? 'text-gray-800 font-bold' : 'text-gray-300'">{{ s.roleLabel === '教练' ? s.exerciseCount : '—' }}</td>
                <td class="py-2 text-right text-gray-900 font-black">{{ s.count }}</td>
                <td class="py-2 text-right text-gray-500">{{ s.avgHours === null ? '--' : s.avgHours + 'h' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="staffStats.length === 0" class="text-center text-xs text-gray-400 py-4">暂无营养师/教练账号</div>
      </Card>

      <!-- 学员批注覆盖 -->
      <Card class="p-4">
        <h3 class="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Users class="w-4 h-4 text-[#1677FF]" /> 学员批注覆盖
          <span class="ml-auto text-[10px] text-gray-400 font-normal">点击看学员详情</span>
        </h3>
        <div class="space-y-2">
          <div v-for="s in studentRows" :key="s.id" class="p-3 rounded-xl bg-gray-50 active:bg-gray-100 cursor-pointer" @click="openStudent(s.id)">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-gray-900">{{ s.name }}</span>
              <span v-if="s.unannotated > 0" class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-orange-50 text-[#FF976A] font-bold">{{ s.unannotated }} 条待批注</span>
              <span v-else class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-[#07C160]/10 text-[#07C160] font-bold">批注完成</span>
              <ChevronRight class="w-3.5 h-3.5 text-gray-300" />
            </div>
            <div class="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
              <span>饮食 <span class="font-bold text-gray-700">{{ s.dietAnn.annotated }}/{{ s.dietAnn.required }}</span></span>
              <span>体重 <span class="font-bold text-gray-700">{{ s.weightAnn.annotated }}/{{ s.weightAnn.required }}</span></span>
              <span>运动 <span class="font-bold text-gray-700">{{ s.exerciseAnn.annotated }}/{{ s.exerciseAnn.required }}</span></span>
            </div>
          </div>
          <div v-if="studentRows.length === 0" class="text-center text-xs text-gray-400 py-4">当前营期暂无学员</div>
        </div>
      </Card>
    </div>

    <!-- 营期选择 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button v-for="c in store.camps" :key="c.id" @click="store.selectedCampId = c.id; showCampPicker = false"
            :class="['w-full flex items-center justify-between px-4 py-3 rounded-xl border', activeCampId === c.id ? 'border-[#1F4E79] bg-[#1F4E79]/5 text-[#1F4E79]' : 'border-gray-200 bg-white text-gray-700']">
            <span class="font-medium">{{ c.name }}</span>
            <span class="text-[10px] text-gray-400">{{ c.status === 'active' ? '进行中' : c.status === 'ended' ? '已结束' : '未开始' }}</span>
          </button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>

<style scoped>
/* 人员批注量：首列冻结，横向滑动时姓名始终可见 */
.freeze-first th:first-child,
.freeze-first td:first-child {
  position: sticky;
  left: 0;
  background: #fff;
  z-index: 2;
  box-shadow: 1px 0 0 #f1f5f9;
}
.freeze-first thead th:first-child { z-index: 3; }

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
