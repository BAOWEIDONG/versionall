<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card, Button } from './ui';
import { Download, Pencil, Plus, Trash2, X, Search } from 'lucide-vue-next';
import { Popup as VanPopup, showToast } from 'vant';
import type { BadgeConfig, BadgeCadence, BadgeCategory, BadgeCondition } from '../types';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { BADGE_CATEGORY_LABEL, BADGE_CADENCE_LABEL, BADGE_CONDITION_META, describeBadgeCondition } from '../lib/badgeMeta';

const store = useAppStore();

const campId = computed(() => {
  if (store.selectedCampId) return store.selectedCampId;
  const opened = store.camps.filter((c) => c.status !== 'upcoming');
  return store.pickLatestCamp(opened)?.id || null;
});
const camp = computed(() => store.camps.find((c) => c.id === campId.value) || null);
const students = computed(() => (campId.value ? store.getStudentsByCamp(campId.value) : []));

/** 预置徽章图标，供营养师直接点选（也可自定义输入） */
const EMOJI_PRESETS = [
  '🌱', '✅', '🏅', '🏆', '🎯', '🔥', '⚖️', '👑',
  '🌅', '⚡', '🎽', '💪', '🥇', '🥈', '🥉', '🌟',
  '⭐', '❤️', '📅', '📆', '🗓️', '🎖️', '🧡', '💚',
];
const nameOf = (id: string) => students.value.find((s) => s.id === id)?.name || id;
const phoneOf = (id: string) => students.value.find((s) => s.id === id)?.phone || '';

const tab = ref<'config' | 'records'>('config');
const configs = computed(() => (campId.value ? store.getBadgeConfigs(campId.value) : []));
const records = computed(() => (campId.value ? store.getCampBadgeRecords(campId.value) : []));

onMounted(() => {
  if (campId.value) store.syncBadges(campId.value);
});

const CONDITIONS_BY_CATEGORY: Record<BadgeCategory, BadgeCondition[]> = {
  milestone: ['weight_loss_percent'],
  achievement: ['streak_days', 'weight_loss_kg', 'fat_loss_kg', 'early_exercise_count', 'single_exercise_minutes', 'max_intensity', 'exercise_type_count'],
  activity: ['checkin_days', 'all_items'],
};
const conditionsOf = (c: BadgeCategory) => CONDITIONS_BY_CATEGORY[c];

// ─── 列表筛选 ───
const configFilter = ref<'all' | BadgeCategory>('all');
const filteredConfigs = computed(() => (configFilter.value === 'all' ? configs.value : configs.value.filter((c) => c.category === configFilter.value)));

// ─── 编辑配置 ───
const showEditor = ref(false);
const isNew = ref(false);
const form = reactive<BadgeConfig>({ id: '', campId: '', category: 'activity', name: '', cadence: 'day', condition: 'checkin_days', threshold: 1, icon: '🎖️', description: '', active: true });

const openNew = () => {
  Object.assign(form, { id: `b_${Date.now()}`, campId: campId.value || '', category: 'activity', name: '', cadence: 'day', condition: 'checkin_days', threshold: 1, icon: '🎖️', description: '', active: true });
  isNew.value = true;
  showEditor.value = true;
};
const openEdit = (c: BadgeConfig) => {
  Object.assign(form, { ...c });
  isNew.value = false;
  showEditor.value = true;
};
const switchCategory = (cat: BadgeCategory) => {
  form.category = cat;
  form.condition = CONDITIONS_BY_CATEGORY[cat][0];
  if (cat !== 'activity') form.cadence = 'day';
};
const save = () => {
  if (!campId.value) return;
  if (!form.name.trim()) { showToast('请填写徽章名称'); return; }
  store.upsertBadgeConfig(campId.value, { ...form, name: form.name.trim(), campId: campId.value, threshold: Math.max(0.1, Number(form.threshold) || 1) });
  store.syncBadges(campId.value);
  showEditor.value = false;
  showToast('已保存');
};
const toggle = (c: BadgeConfig) => {
  if (!campId.value) return;
  store.upsertBadgeConfig(campId.value, { ...c, active: !c.active });
  store.syncBadges(campId.value);
};
const remove = (c: BadgeConfig) => {
  if (!campId.value) return;
  if (!window.confirm(`删除徽章「${c.name}」？历史获得记录会保留。`)) return;
  store.deleteBadgeConfig(campId.value, c.id);
  store.syncBadges(campId.value);
};

const condText = (c: BadgeConfig) => describeBadgeCondition(c);

// ─── 数据可达性：当前营期有多少学员具备该条件的判定数据（避免配了但学员达不成） ───
const campRecords = computed(() => {
  if (!campId.value) return { diet: [] as any[], ex: [] as any[], wt: [] as any[] };
  return {
    diet: store.getCampDietRecords(campId.value),
    ex: store.getCampExerciseRecords(campId.value),
    wt: store.getCampWeightRecords(campId.value),
  };
});
const fatMetricId = computed(() => store.metricConfigs.find((c) => c.name.includes('脂肪量'))?.id || '');
const coverage = (condition: BadgeCondition) => {
  const total = students.value.length;
  const { diet, ex, wt } = campRecords.value;
  const hasAny = (id: string) => diet.some((r: any) => r.studentId === id) || ex.some((r: any) => r.studentId === id) || wt.some((r: any) => r.studentId === id);
  let n = 0;
  if (condition === 'checkin_days' || condition === 'all_items' || condition === 'streak_days') {
    n = students.value.filter((s) => hasAny(s.id)).length;
  } else if (condition === 'weight_loss_kg' || condition === 'weight_loss_percent') {
    n = students.value.filter((s) => wt.filter((r: any) => r.studentId === s.id).length >= 2).length;
  } else if (condition === 'fat_loss_kg') {
    const fid = fatMetricId.value;
    n = fid ? students.value.filter((s) => {
      const v = MOCK_STUDENT_METRIC_VALUES[s.id]?.[fid];
      return v && typeof v.beforeValue === 'number' && typeof v.afterValue === 'number';
    }).length : 0;
  } else {
    n = students.value.filter((s) => ex.some((r: any) => r.studentId === s.id)).length;
  }
  return { n, total };
};

// ─── 记录筛选 + 导出 ───
const recordFilter = ref<'all' | BadgeCategory>('all');
const keyword = ref('');
const filteredRecords = computed(() => {
  let list = records.value;
  if (recordFilter.value !== 'all') list = list.filter((r) => r.category === recordFilter.value);
  const k = keyword.value.trim().toLowerCase();
  if (k) list = list.filter((r) => nameOf(r.studentId).toLowerCase().includes(k) || phoneOf(r.studentId).includes(keyword.value.trim()));
  return [...list].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
});

const exportCsv = () => {
  const header = ['学员', '手机号', '营期', '徽章', '分类', '周期', '获得时间', '达成值'];
  const lines = filteredRecords.value.map((r) => [
    nameOf(r.studentId), phoneOf(r.studentId), camp.value?.name || '', r.badgeName,
    BADGE_CATEGORY_LABEL[r.category], r.periodKey === 'once' ? '一次性' : r.periodKey, r.earnedAt, String(r.value),
  ]);
  const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `徽章清单_${camp.value?.name || ''}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-10 font-sans">
    <NavBar title="徽章配置" :on-back="store.goBack">
      <template #right>
        <button v-if="tab === 'records'" @click="exportCsv" class="text-[#FF976A] p-2 rounded-full hover:bg-orange-50">
          <Download class="w-5 h-5" />
        </button>
      </template>
    </NavBar>

    <div class="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
      <div class="text-xs text-gray-500">当前营期 · <span class="font-medium text-gray-800">{{ camp?.name || '未选择' }}</span></div>
      <span class="text-[11px] text-gray-400">{{ records.length }} 条徽章记录</span>
    </div>

    <div class="p-4 space-y-4">
      <div class="flex bg-gray-100 p-1 rounded-xl">
        <button :class="['flex-1 py-2 text-sm font-bold rounded-lg', tab === 'config' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500']" @click="tab = 'config'">徽章配置</button>
        <button :class="['flex-1 py-2 text-sm font-bold rounded-lg', tab === 'records' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500']" @click="tab = 'records'">获得记录</button>
      </div>

      <!-- 配置 -->
      <template v-if="tab === 'config'">
        <Button class="w-full bg-[#FF976A] text-white" @click="openNew">
          <Plus class="w-4 h-4 mr-1" /> 新增徽章
        </Button>

        <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button v-for="t in [{ k: 'all', l: '全部' }, { k: 'milestone', l: '里程碑' }, { k: 'achievement', l: '成就' }, { k: 'activity', l: '活动' }]" :key="t.k"
            @click="configFilter = t.k as any"
            :class="['px-3 py-1.5 rounded-full text-xs font-bold shrink-0', configFilter === t.k ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-600']">
            {{ t.l }}
          </button>
        </div>

        <Card v-for="c in filteredConfigs" :key="c.id" class="p-4">
          <div class="flex items-start gap-3">
            <div class="w-11 h-11 rounded-full bg-orange-50 flex items-center justify-center text-2xl shrink-0">{{ c.icon }}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-bold text-gray-900 truncate">{{ c.name }}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-[#1677FF]/10 text-[#1677FF]">{{ BADGE_CATEGORY_LABEL[c.category] }}</span>
                <span :class="['text-[9px] px-1.5 py-0.5 rounded-full font-bold', c.active ? 'bg-[#07C160]/10 text-[#07C160]' : 'bg-gray-100 text-gray-400']">{{ c.active ? '已启用' : '已停用' }}</span>
              </div>
              <div class="text-[11px] text-gray-500 mt-0.5">
                <template v-if="c.category === 'activity'">{{ BADGE_CADENCE_LABEL[c.cadence] }} · </template>{{ condText(c) }}
              </div>
              <div class="text-[10px] mt-0.5" :class="coverage(c.condition).n === 0 ? 'text-red-500 font-medium' : 'text-gray-400'">
                可判定 {{ coverage(c.condition).n }}/{{ coverage(c.condition).total }} 人<template v-if="coverage(c.condition).n === 0">（本营期无对应数据，学员暂无法达成）</template>
              </div>
              <div v-if="c.description" class="text-[10px] text-gray-400 mt-0.5 truncate">{{ c.description }}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button @click="openEdit(c)" class="p-1.5 text-gray-400 active:text-gray-700"><Pencil class="w-4 h-4" /></button>
              <button @click="remove(c)" class="p-1.5 text-gray-400 active:text-red-500"><Trash2 class="w-4 h-4" /></button>
            </div>
          </div>
          <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
            <span class="text-[11px] text-gray-400">共 {{ records.filter(r => r.badgeId === c.id).length }} 枚已被学员获得</span>
            <button :class="['text-[11px] font-bold px-3 py-1 rounded-full', c.active ? 'bg-gray-100 text-gray-600' : 'bg-[#07C160]/10 text-[#07C160]']" @click="toggle(c)">
              {{ c.active ? '停用' : '启用' }}
            </button>
          </div>
        </Card>
        <div v-if="filteredConfigs.length === 0" class="text-center text-xs text-gray-400 py-6">暂无徽章，点击上方新增</div>
      </template>

      <!-- 记录 -->
      <template v-else>
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button v-for="t in [{ k: 'all', l: '全部' }, { k: 'milestone', l: '里程碑' }, { k: 'achievement', l: '成就' }, { k: 'activity', l: '活动' }]" :key="t.k"
            @click="recordFilter = t.k as any"
            :class="['px-3 py-1.5 rounded-full text-xs font-bold shrink-0', recordFilter === t.k ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-600']">
            {{ t.l }}
          </button>
        </div>
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input v-model="keyword" placeholder="搜索学员姓名或手机号" class="w-full pl-9 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none" />
        </div>
        <Card class="p-0 overflow-hidden">
          <div v-for="r in filteredRecords" :key="r.id" class="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
            <div class="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center text-xl shrink-0">{{ r.icon }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold text-gray-900">{{ nameOf(r.studentId) }} · {{ r.badgeName }}</div>
              <div class="text-[10px] text-gray-400">{{ BADGE_CATEGORY_LABEL[r.category] }} · {{ r.periodKey === 'once' ? '一次性' : r.periodKey }} · 达成 {{ r.value }}</div>
            </div>
            <span class="text-[10px] text-gray-500 shrink-0">{{ r.earnedAt }}</span>
          </div>
          <div v-if="filteredRecords.length === 0" class="text-center text-xs text-gray-400 py-8">暂无记录</div>
        </Card>
        <p class="text-[10px] text-gray-400 px-1">导出的是当前筛选结果，供学员所在公司发放实物奖励使用。</p>
      </template>
    </div>

    <!-- 编辑弹窗 -->
    <VanPopup v-model:show="showEditor" position="bottom" round>
      <div class="p-4 space-y-3 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-gray-900">{{ isNew ? '新增徽章' : '编辑徽章' }}</h3>
          <button @click="showEditor = false" class="p-1 text-gray-400"><X class="w-5 h-5" /></button>
        </div>

        <div>
          <label class="text-xs text-gray-500">分类</label>
          <div class="flex gap-1.5 mt-1">
            <button v-for="c in [{ k: 'milestone', l: '里程碑' }, { k: 'achievement', l: '成就' }, { k: 'activity', l: '活动' }]" :key="c.k"
              @click="switchCategory(c.k as BadgeCategory)"
              :class="['flex-1 py-2 rounded-xl text-xs font-bold', form.category === c.k ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-600']">
              {{ c.l }}
            </button>
          </div>
        </div>

        <div>
          <label class="text-xs text-gray-500">徽章名称</label>
          <input v-model="form.name" placeholder="如：本周满勤 / 连续 7 天" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>

        <div>
          <label class="text-xs text-gray-500">图标（选择或自定义）</label>
          <div class="grid grid-cols-8 gap-1.5 mt-1">
            <button v-for="e in EMOJI_PRESETS" :key="e" type="button" @click="form.icon = e"
              :class="['aspect-square rounded-lg flex items-center justify-center text-lg border transition-colors', form.icon === e ? 'border-[#FF976A] bg-orange-50' : 'border-gray-200 bg-white']">
              {{ e }}
            </button>
          </div>
          <input v-model="form.icon" placeholder="也可输入自定义 emoji" class="w-full mt-2 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>

        <div v-if="form.category === 'activity'">
          <label class="text-xs text-gray-500">周期</label>
          <select v-model="form.cadence" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            <option value="day">每日</option>
            <option value="week">每周</option>
            <option value="month">每月</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-gray-500">达成条件</label>
            <select v-model="form.condition" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
              <option v-for="c in conditionsOf(form.category)" :key="c" :value="c">{{ BADGE_CONDITION_META[c].label }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500">达成值（{{ BADGE_CONDITION_META[form.condition]?.unit }}）</label>
            <input v-model.number="form.threshold" type="number" min="0.1" step="0.1" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
          </div>
        </div>

        <div class="text-[10px]" :class="coverage(form.condition).n === 0 ? 'text-red-500' : 'text-gray-400'">
          该条件在本营期可判定 {{ coverage(form.condition).n }}/{{ coverage(form.condition).total }} 名学员<template v-if="coverage(form.condition).n === 0">，当前无对应数据，学员无法达成</template>
        </div>

        <div>
          <label class="text-xs text-gray-500">说明（可选）</label>
          <input v-model="form.description" placeholder="如：一周内打卡满 3 天" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>

        <Button class="w-full bg-[#FF976A] text-white" @click="save">保存</Button>
      </div>
    </VanPopup>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
