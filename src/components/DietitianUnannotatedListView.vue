<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '../store/app';
import { campDateRange, latestOrFirstId } from '../lib/camps';
import { useDietitianCounts } from '../lib/dietitianCounts';
import { usePaged } from '../composables/usePaged';
import { UserCircle, Coffee, Clock, Activity, Scale, Video, ChevronDown, FileText, Settings, Users } from 'lucide-vue-next';
import { Popup as VanPopup, Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import type { DietRecord, WeightRecord } from '../types';

const MEAL_TYPES = [
  { id: 'breakfast', label: '早餐' },
  { id: 'lunch', label: '午餐' },
  { id: 'dinner', label: '晚餐' },
  { id: 'snack', label: '加餐' },
];

type ItemType = 'diet' | 'weight';

interface UnifiedItem {
  id: string;
  type: ItemType;
  studentId: string;
  studentName: string;
  date: string;
  // diet
  meal?: string;
  description?: string;
  photos?: string[];
  // weight
  weight?: number;
  videoUrls?: string[];
}

const store = useAppStore();

// ─── 底部 Tabbar 角标：批注=待批注数，配置=发放中心待发货数（各营养师页面共用口径） ───
const { unannotatedCount, fulfillmentPendingCount } = useDietitianCounts();

// ─── 营期切换（实时读 store.selectedCampId，与教练端口径一致；KeepAlive 缓存视图不再存本地快照） ───
const selectedCampId = computed<string>({
  get: () => store.selectedCampId || latestOrFirstId(store.camps) || '',
  set: (v: string) => { store.selectedCampId = v; },
});
const showCampPicker = ref(false);
const selectedCamp = computed(() => selectedCampId.value ? store.camps.find((c) => c.id === selectedCampId.value) : null);

// 按营期过滤打卡记录
const campDietRecords = computed(() => selectedCampId.value ? store.getCampDietRecords(selectedCampId.value) : store.dietRecords);
const campWeightRecords = computed(() => selectedCampId.value ? store.getCampWeightRecords(selectedCampId.value) : store.weightRecords);

// 退营学员与两端看板口径一致：待批注列表排除（active-only）
const disabledStudentIds = computed(() => new Set(store.accounts.filter((a) => a.role === 'student' && a.active === false).map((a) => a.id)));

// 过滤标签（localStorage 持久化：营养师从学员详情返回或系统返回重载后，筛选不丢）
const PEND_FILTER_KEY = 'dietitian_pending_filter';
const storedFilter = (): ItemType | 'all' => {
  const v = localStorage.getItem(PEND_FILTER_KEY);
  return v === 'diet' || v === 'weight' ? v : 'all';
};
const activeFilter = ref<ItemType | 'all'>(storedFilter());
watch(activeFilter, (v) => localStorage.setItem(PEND_FILTER_KEY, v));

const mealLabel = (meal: string) => MEAL_TYPES.find((m) => m.id === meal)?.label;

const studentName = (id: string) => store.accounts.find((a) => a.id === id)?.name || '未知学员';

const allItems = computed<UnifiedItem[]>(() => {
  const items: UnifiedItem[] = [];

  // 饮食待批注
  campDietRecords.value
    .filter((r) => !r.dietitianComment && r.dietitianScore == null && !disabledStudentIds.value.has(r.studentId))
    .forEach((r: DietRecord) => {
      items.push({
        id: r.id,
        type: 'diet',
        studentId: r.studentId || '',
        studentName: studentName(r.studentId || ''),
        date: r.date,
        meal: mealLabel(r.meal),
        description: r.description,
        photos: r.photos,
      });
    });

  // 体重待批注（WeightRecord 无 dietitianScore 字段，仅看批注）
  campWeightRecords.value
    .filter((r) => !r.dietitianComment && !disabledStudentIds.value.has(r.studentId))
    .forEach((r: WeightRecord) => {
      items.push({
        id: r.id,
        type: 'weight',
        studentId: r.studentId || '',
        studentName: studentName(r.studentId || ''),
        date: r.date,
        weight: r.weight,
        photos: r.photos,
      });
    });


  // 按时间倒序
  return items.sort((a, b) => b.date.localeCompare(a.date));
});

const filteredItems = computed(() => {
  if (activeFilter.value === 'all') return allItems.value;
  return allItems.value.filter((i) => i.type === activeFilter.value);
});

const countByType = computed(() => ({
  diet: allItems.value.filter((i) => i.type === 'diet').length,
  weight: allItems.value.filter((i) => i.type === 'weight').length,
}));

// 按学员分组统计（基于当前筛选结果）
const studentGroups = computed(() => {
  const map = new Map<string, UnifiedItem[]>();
  filteredItems.value.forEach((item) => {
    if (!map.has(item.studentId)) map.set(item.studentId, []);
    map.get(item.studentId)!.push(item);
  });
  return Array.from(map.entries())
    .map(([studentId, items]) => ({
      student: store.accounts.find((a) => a.id === studentId),
      studentId,
      count: items.length,
      items,
    }))
    .sort((a, b) => b.count - a.count);
});
// 长列表分页：按学员分组较多时分页，默认前 10 组，更多点「加载更多」
const { items: pagedGroups, hasMore, remaining, loadMore } = usePaged(studentGroups, 10);

// 折叠状态
const expandedStudents = ref<Set<string>>(new Set());
const allExpanded = computed(() =>
  studentGroups.value.length > 0 && studentGroups.value.every(g => expandedStudents.value.has(g.studentId)),
);

function toggleStudent(studentId: string) {
  if (expandedStudents.value.has(studentId)) {
    expandedStudents.value.delete(studentId);
  } else {
    expandedStudents.value.add(studentId);
  }
  // 触发响应式更新
  expandedStudents.value = new Set(expandedStudents.value);
}

function toggleAll() {
  if (allExpanded.value) {
    expandedStudents.value = new Set();
  } else {
    expandedStudents.value = new Set(studentGroups.value.map(g => g.studentId));
  }
}

// 筛选/营期变化时默认展开第一个学员
watch([activeFilter, selectedCampId], () => {
  if (studentGroups.value.length > 0) {
    expandedStudents.value = new Set([studentGroups.value[0].studentId]);
  } else {
    expandedStudents.value = new Set();
  }
}, { immediate: true });

const openRecord = (item: UnifiedItem) => {
  store.selectedCampId = selectedCampId.value; // 同步营期到 store
  store.setSelectedStudentId(item.studentId);
  store.setPendingAnnotation(item.type, item.id);
  store.setCurrentView('dietitian-student-detail');
};

const typeConfig: Record<ItemType, { label: string; bg: string; text: string; icon: typeof Activity }> = {
  diet: { label: '饮食', bg: 'bg-[#FF976A]/10', text: 'text-[#FF976A]', icon: Coffee },
  weight: { label: '体重', bg: 'bg-[#07C160]/10', text: 'text-[#07C160]', icon: Scale },
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24">
    <div class="pt-[calc(env(safe-area-inset-top)+1.5rem)] px-5 pb-3 bg-white/30">
      <h1 class="text-lg font-bold text-gray-900">待批注</h1>
    </div>

    <!-- 营期切换 -->
    <div class="bg-white/30 px-4 py-3 flex items-center justify-between border-b border-white/40">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '全部营期' }}</div>
      </div>
      <button class="text-xs text-[#FF976A] border border-[#FF976A] px-3 py-1.5 rounded-full font-bold active:bg-orange-50" @click="showCampPicker = true">
        切换营期
      </button>
    </div>

    <div class="p-4 space-y-4">
      <!-- 统计概览 -->
      <div class="grid grid-cols-3 gap-2">
        <div
          :class="['rounded-xl p-3 text-center border transition-all cursor-pointer', activeFilter === 'diet' ? 'border-[#FF976A] bg-[#FF976A]/5' : 'border-gray-100 bg-white']"
          @click="activeFilter = activeFilter === 'diet' ? 'all' : 'diet'"
        >
          <div class="text-lg font-bold text-[#FF976A]">{{ countByType.diet }}</div>
          <div class="text-[10px] text-gray-500">饮食待批注</div>
        </div>
        <div
          :class="['rounded-xl p-3 text-center border transition-all cursor-pointer', activeFilter === 'weight' ? 'border-[#07C160] bg-[#07C160]/5' : 'border-gray-100 bg-white']"
          @click="activeFilter = activeFilter === 'weight' ? 'all' : 'weight'"
        >
          <div class="text-lg font-bold text-[#07C160]">{{ countByType.weight }}</div>
          <div class="text-[10px] text-gray-500">体重待批注</div>
        </div>
      </div>

      <!-- 按学员折叠分组列表 -->
      <div v-if="studentGroups.length > 0" class="space-y-2">
        <!-- 展开/折叠全部 -->
        <div class="flex justify-end">
          <button class="text-[11px] text-gray-500 font-medium flex items-center gap-1 active:scale-95 transition-transform" @click="toggleAll">
            <ChevronDown class="w-3 h-3" :class="allExpanded ? 'rotate-180' : ''" />
            {{ allExpanded ? '全部折叠' : '全部展开' }}
          </button>
        </div>

        <!-- 学员分组 -->
        <div
          v-for="g in pagedGroups"
          :key="g.studentId"
          class="bg-white rounded-xl border border-gray-100 overflow-hidden"
        >
          <!-- 学员头部（点击折叠/展开） -->
          <button
            class="w-full flex items-center gap-3 px-3 py-2.5 active:bg-gray-50 transition-colors"
            @click="toggleStudent(g.studentId)"
          >
            <div class="h-8 w-8 rounded-full bg-[#1677FF]/10 flex items-center justify-center text-[#1677FF] shrink-0">
              <UserCircle class="h-5 w-5" />
            </div>
            <span class="text-sm font-bold text-gray-900 flex-1 text-left">{{ g.student?.name || '未知学员' }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF976A]/10 text-[#FF976A] font-bold shrink-0">{{ g.count }}条</span>
            <ChevronDown class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" :class="expandedStudents.has(g.studentId) ? 'rotate-180' : ''" />
          </button>

          <!-- 展开内容 -->
          <div v-if="expandedStudents.has(g.studentId)" class="border-t border-gray-50 divide-y divide-gray-50">
            <div
              v-for="item in g.items"
              :key="`${item.type}-${item.id}`"
              class="p-3 flex gap-3 cursor-pointer active:bg-gray-50 transition-colors"
              @click="openRecord(item)"
            >
              <!-- 缩略图 -->
              <div class="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                <template v-if="item.type === 'diet'">
                  <img loading="lazy" decoding="async" v-if="item.photos && item.photos.length > 0" :src="item.photos[0]" alt="食物" class="w-full h-full object-cover" />
                  <Coffee v-else class="w-5 h-5 text-gray-400" />
                </template>
                <template v-else-if="item.type === 'weight'">
                  <img loading="lazy" decoding="async" v-if="item.photos && item.photos.length > 0" :src="item.photos[0]" alt="体重打卡" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full bg-[#07C160]/8 flex items-center justify-center">
                    <Scale class="w-5 h-5 text-[#07C160]" />
                  </div>
                </template>
                <template v-else>
                  <img loading="lazy" decoding="async" v-if="item.photos && item.photos.length > 0" :src="item.photos[0]" alt="运动" class="w-full h-full object-cover" />
                  <div v-else-if="item.videoUrls && item.videoUrls.length > 0" class="w-full h-full bg-black flex items-center justify-center">
                    <Video class="w-5 h-5 text-white" />
                  </div>
                  <div v-else class="w-full h-full bg-blue-50 flex items-center justify-center">
                    <Activity class="w-5 h-5 text-blue-500" />
                  </div>
                </template>
              </div>

              <!-- 内容 -->
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-0.5">
                  <div class="flex items-center gap-1.5">
                    <span :class="['text-[10px] px-1.5 py-0.5 rounded font-bold', typeConfig[item.type].bg, typeConfig[item.type].text]">
                      {{ typeConfig[item.type].label }}
                    </span>
                    <span v-if="item.type === 'diet' && item.meal" class="text-[10px] text-gray-500">{{ item.meal }}</span>
                  </div>
                  <span class="text-[10px] text-gray-400">{{ item.date.substring(5, 16) }}</span>
                </div>
                <div v-if="item.type === 'diet'" class="text-xs text-gray-700 line-clamp-1">{{ item.description }}</div>
                <div v-else-if="item.type === 'weight'" class="text-sm font-bold text-gray-900">{{ item.weight }} <span class="text-xs font-normal text-gray-400">kg</span></div>

              </div>
            </div>
          </div>
        </div>
        <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mt-2 text-xs font-bold text-[#FF976A] bg-white border border-[#FF976A]/30 rounded-xl active:bg-orange-50">
          加载更多（还有 {{ remaining }} 名学员）
        </button>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredItems.length === 0" class="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
        <Clock class="w-8 h-8 mx-auto mb-2 text-gray-300" />
        {{ activeFilter === 'all' ? '暂无待批注记录，全部已处理！' : '该类型暂无待批注记录' }}
      </div>
    </div>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <!-- 各营期 -->
          <button
            v-for="camp in store.camps"
            :key="camp.id"
            @click="selectedCampId = camp.id; store.selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
            <span
              v-if="camp.status === 'active'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600"
            >进行中</span>
            <span
              v-else-if="camp.status === 'ended'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >已结束</span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500"
            >未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>

    <!-- Bottom Nav -->
    <VanTabbar class="custom-tabbar tabbar-orange" :model-value="1">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-config')" :badge="fulfillmentPendingCount > 0 ? fulfillmentPendingCount : undefined">
        <template #icon><Settings class="h-6 w-6" /></template>
        配置
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>
