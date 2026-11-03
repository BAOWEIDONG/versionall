<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { useCoachCounts } from '../lib/coachCounts';
import { latestOrFirstId, fmtShortDate } from '../lib/camps';
import { usePaged } from '../composables/usePaged';
import { ChevronDown, Users, UserCircle, FileText, Dumbbell, Search } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';

const store = useAppStore();
const { unannotatedCount } = useCoachCounts();

// 营期统一由首页主控切换，这里只读展示当前营期
const currentCampId = computed(() => store.selectedCampId || latestOrFirstId(store.camps) || '');
const currentCamp = computed(() => store.camps.find((c) => c.id === currentCampId.value));

// 学员信息映射（姓名 + 手机号）
const studentInfoMap = computed(() => {
  const m = new Map<string, { name: string; phone: string }>();
  store.getStudentsByCamp(currentCampId.value).forEach((s) =>
    m.set(s.id, { name: s.name, phone: s.phone }),
  );
  return m;
});

// 学员姓名或手机号搜索
const searchKeyword = ref('');
const campExerciseRecords = computed(() => store.getCampExerciseRecords(currentCampId.value));

// 退营学员与看板 active-only 口径一致：待批注列表排除
const disabledStudentIds = computed(() => new Set(store.accounts.filter((a) => a.role === 'student' && a.active === false).map((a) => a.id)));

// 未批注的运动记录（coachComment 空 且 coachScore 未评）
const unannotatedItems = computed(() =>
  campExerciseRecords.value
    .filter((r) => !r.coachComment && r.coachScore == null)
    .filter((r) => !disabledStudentIds.value.has(r.studentId))
    .filter((r) => {
      const kw = searchKeyword.value.trim();
      if (!kw) return true;
      const info = studentInfoMap.value.get(r.studentId);
      return (info?.name || '').includes(kw) || (info?.phone || '').includes(kw);
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
);

// 按学员分组
const studentGroups = computed(() => {
  const groups = new Map<string, typeof unannotatedItems.value>();
  unannotatedItems.value.forEach((r) => {
    const list = groups.get(r.studentId) || [];
    list.push(r);
    groups.set(r.studentId, list);
  });
  return Array.from(groups.entries()).map(([studentId, records]) => ({
    studentId,
    studentName: studentInfoMap.value.get(studentId)?.name || `学员${studentId}`,
    studentPhone: studentInfoMap.value.get(studentId)?.phone || '',
    records,
  }));
});

// 分组分页：默认前 10 组
const { items: pagedGroups, hasMore, remaining, loadMore } = usePaged(studentGroups, 10);

// 展开/收起：默认全部展开
const expanded = ref<Set<string>>(new Set(studentGroups.value.map((g) => g.studentId)));
const isExpanded = (studentId: string) => expanded.value.has(studentId);
const toggleExpanded = (studentId: string) => {
  const next = new Set(expanded.value);
  if (next.has(studentId)) next.delete(studentId);
  else next.add(studentId);
  expanded.value = next;
};
const expandAll = () => { expanded.value = new Set(studentGroups.value.map((g) => g.studentId)); };
const collapseAll = () => { expanded.value = new Set<string>(); };

// 点击批注 → 跳转学员详情并定位到该运动记录
const openRecord = (studentId: string, recordId: string) => {
  store.setSelectedStudentId(studentId);
  store.setPendingAnnotation('exercise', recordId);
  store.setCurrentView('coach-student-detail');
};

const intentLabel = (intensity: number) =>
  (['', '很轻松', '轻松', '适中', '较累', '非常吃力'][intensity] || '适中');
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <!-- 顶部：白底标题（对标营养师，无渐变弧度） -->
    <div class="pt-[calc(env(safe-area-inset-top)+1.5rem)] px-5 pb-3 bg-white">
      <h1 class="text-lg font-bold text-gray-900">教练批注</h1>
    </div>

    <!-- 营期显示条（对标营养师样式，营期由首页主控只读展示） -->
    <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">{{ currentCamp?.name || '未选择' }} · 待批注 {{ unannotatedCount }} 条</div>
      </div>
    </div>

    <div class="px-4 mt-3 space-y-2">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input v-model="searchKeyword" type="text" placeholder="搜索学员姓名或手机号"
          class="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border border-gray-100 text-sm focus:outline-none focus:border-[#07C160]/40 shadow-sm placeholder:text-gray-300" />
      </div>
      <div class="flex justify-between items-center">
        <span class="text-[11px] text-gray-400">{{ studentGroups.length }} 名学员待批注</span>
        <div class="flex gap-2">
          <button @click="expandAll" class="text-[11px] font-bold text-[#07C160] bg-white border border-[#07C160]/30 px-2.5 py-1 rounded-full active:bg-green-50">全部展开</button>
          <button @click="collapseAll" class="text-[11px] font-bold text-[#07C160] bg-white border border-[#07C160]/30 px-2.5 py-1 rounded-full active:bg-green-50">全部收起</button>
        </div>
      </div>
    </div>

    <div class="p-4 space-y-3">
      <template v-if="studentGroups.length > 0">
        <div v-for="group in pagedGroups" :key="group.studentId" class="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button @click="toggleExpanded(group.studentId)"
            class="w-full flex items-center justify-between px-4 py-3 bg-[#07C160]/5 active:bg-[#07C160]/10 transition-colors">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <UserCircle class="w-6 h-6 text-gray-400" />
              </div>
              <div class="text-left min-w-0">
                <span class="text-sm font-bold text-gray-900 block truncate">{{ group.studentName }}</span>
                <span class="text-[10px] text-gray-400">{{ group.studentPhone || '' }}</span>
              </div>
              <span class="text-[10px] text-[#07C160] bg-[#07C160]/10 px-1.5 py-0.5 rounded-full font-bold shrink-0">{{ group.records.length }}条待批注</span>
            </div>
            <ChevronDown class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" :class="{ 'rotate-180': isExpanded(group.studentId) }" />
          </button>
          <div v-show="isExpanded(group.studentId)" class="divide-y divide-gray-50">
            <div v-for="r in group.records" :key="r.id" @click="openRecord(group.studentId, r.id)"
              class="p-3 flex gap-3 cursor-pointer active:bg-gray-50 transition-colors">
              <!-- 缩略图（对标营养师：照片或类型图标占位） -->
              <div class="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                <img loading="lazy" decoding="async" v-if="r.photos && r.photos.length > 0" :src="r.photos[0]" alt="运动" class="w-full h-full object-cover" />
                <div v-else-if="r.videoUrls && r.videoUrls.length > 0" class="w-full h-full bg-black flex items-center justify-center">
                  <Dumbbell class="w-5 h-5 text-white" />
                </div>
                <div v-else class="w-full h-full bg-[#07C160]/8 flex items-center justify-center">
                  <Dumbbell class="w-5 h-5 text-[#07C160]" />
                </div>
              </div>
              <!-- 内容 -->
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[#07C160]/10 text-[#07C160]">运动</span>
                    <span class="text-[10px] text-gray-500">{{ r.type }}</span>
                  </div>
                  <span class="text-[10px] text-gray-400">{{ fmtShortDate(r.date.split(' ')[0]) }}</span>
                </div>
                <div class="text-xs text-gray-700">{{ r.duration }}分钟 · {{ intentLabel(r.intensity) }}</div>
                <div v-if="r.notes" class="text-[10px] text-gray-400 mt-0.5 truncate">{{ r.notes }}</div>
              </div>
            </div>
          </div>
        </div>
        <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mt-2 text-xs font-bold text-[#07C160] bg-white border border-[#07C160]/30 rounded-xl active:bg-green-50">
          加载更多（还有 {{ remaining }} 名学员）
        </button>
      </template>
      <div v-else class="text-center py-14 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
        {{ searchKeyword ? '没有匹配该学员/手机号的待批注记录' : '暂无待批注记录，全部已处理！' }}
      </div>
    </div>

    <!-- 底部菜单：首页 / 批注 / 发布活动 -->
    <VanTabbar class="custom-tabbar tabbar-green" :model-value="1">
      <VanTabbarItem @click="store.setCurrentView('coach-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('activity-upload')">
        <template #icon><Dumbbell class="h-6 w-6" /></template>
        发布活动
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>