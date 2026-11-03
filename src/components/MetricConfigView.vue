<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { Popup as VanPopup, showToast, showConfirmDialog } from 'vant';
import { Plus, Trash2, Edit3, Stethoscope, AlertTriangle, ChevronDown } from 'lucide-vue-next';
import type { MetricConfig } from '../types';

const store = useAppStore();
const showEditModal = ref(false);
const editingMetric = ref<Partial<MetricConfig> | null>(null);
const formError = ref('');

// Group configs by category for display
const groupedConfigs = computed(() => {
  const map = new Map<string, MetricConfig[]>();
  for (const config of store.metricConfigs) {
    if (!map.has(config.category)) {
      map.set(config.category, []);
    }
    map.get(config.category)!.push(config);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
});

// Existing categories for the datalist suggestions
const existingCategories = computed(() => {
  return Array.from(new Set(store.metricConfigs.map(c => c.category)));
});

// Collapsible category state - default all expanded
const collapsedCats = ref<Set<string>>(new Set());
const toggleCat = (title: string) => {
  const next = new Set(collapsedCats.value);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  collapsedCats.value = next;
};

const handleEdit = (metric?: MetricConfig) => {
  editingMetric.value = metric
    ? { ...metric }
    : { name: '', unit: '', normalRange: '', category: existingCategories.value[0] || '' };
  formError.value = '';
  showEditModal.value = true;
};

const handleDelete = (id: string, name: string) => {
  showConfirmDialog({ title: '提示', message: `确定删除指标「${name}」？` }).then(() => {
    store.deleteMetricConfig(id);
    showToast('已删除');
  });
};

const saveMetric = () => {
  if (!editingMetric.value) return;
  if (!editingMetric.value.name?.trim()) { formError.value = '请输入指标名称'; return; }
  if (!editingMetric.value.category?.trim()) { formError.value = '请输入或选择分类'; return; }

  // Check for duplicate name within same category
  const dup = store.metricConfigs.find(c =>
    c.name === editingMetric.value!.name!.trim() &&
    c.category === editingMetric.value!.category!.trim() &&
    c.id !== editingMetric.value!.id
  );
  if (dup) { formError.value = `「${editingMetric.value.category}」分类下已存在同名指标「${dup.name}」`; return; }

  if (editingMetric.value.id) {
    store.updateMetricConfig(editingMetric.value.id, {
      name: editingMetric.value.name.trim(),
      unit: editingMetric.value.unit || '',
      normalRange: editingMetric.value.normalRange?.trim() || undefined,
      category: editingMetric.value.category.trim(),
    });
  } else {
    store.addMetricConfig({
      id: `mc_${Date.now()}`,
      name: editingMetric.value.name.trim(),
      unit: editingMetric.value.unit || '',
      normalRange: editingMetric.value.normalRange?.trim() || undefined,
      category: editingMetric.value.category.trim(),
    });
  }
  showEditModal.value = false;
  showToast({ message: editingMetric.value.id ? '已保存' : '指标已添加', position: 'top', duration: 2000 });
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="指标配置" :on-back="store.goBack" />

    <div class="flex-1 p-4 space-y-4 pb-24">
      <!-- Info banner -->
      <div class="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
        <AlertTriangle class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div class="text-xs text-blue-700 leading-relaxed">
          配置学员健康档案中展示的体检指标项目。新增或修改指标后，学员端和营养师端将同步显示最新配置。
        </div>
      </div>

      <div v-if="groupedConfigs.length === 0" class="text-center py-20 text-gray-400 text-sm">
        <Stethoscope class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        暂无指标配置，请添加
      </div>

      <!-- Grouped by category -->
      <div v-for="group in groupedConfigs" :key="group.category">
        <div @click="toggleCat(group.category)" class="flex items-center gap-2 mb-2 px-1 cursor-pointer hover:bg-gray-50 py-1.5 rounded-lg transition-colors select-none">
          <Stethoscope class="w-4 h-4 text-[#1677FF]" />
          <h3 class="text-sm font-bold text-gray-900">{{ group.category }}</h3>
          <span class="text-[10px] text-gray-400">{{ group.items.length }} 项</span>
          <ChevronDown :class="['ml-auto w-4 h-4 text-gray-400 transition-transform duration-300', collapsedCats.has(group.category) ? '-rotate-90' : '']" />
        </div>

        <div v-show="!collapsedCats.has(group.category)">
          <Card v-for="metric in group.items" :key="metric.id" class="p-3 mb-2 flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-bold text-gray-900 text-sm">{{ metric.name }}</span>
                <span v-if="metric.unit" class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{{ metric.unit }}</span>
              </div>
              <div v-if="metric.normalRange" class="text-[10px] text-gray-500">
                参考区间: {{ metric.normalRange }}
              </div>
              <div v-else class="text-[10px] text-gray-400">
                无参考区间
              </div>
            </div>
            <div class="flex gap-2 shrink-0">
              <button @click="handleEdit(metric)" class="text-blue-500 p-1"><Edit3 class="w-4 h-4" /></button>
              <button @click="handleDelete(metric.id, metric.name)" class="text-red-500 p-1"><Trash2 class="w-4 h-4" /></button>
            </div>
          </Card>
        </div>
      </div>
    </div>

    <div class="sticky bottom-0 p-4 bg-white border-t border-gray-100">
      <button class="w-full py-3 rounded-xl bg-[#1677FF] text-white font-bold flex items-center justify-center gap-1" @click="handleEdit()">
        <Plus class="w-5 h-5" /> 新增指标
      </button>
    </div>

    <!-- Edit popup -->
    <VanPopup v-model:show="showEditModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5 flex flex-col" style="max-height: 90vh;" v-if="editingMetric">
        <h3 class="text-lg font-bold text-gray-900 mb-5 shrink-0">{{ editingMetric.id ? '编辑指标' : '新增指标' }}</h3>
        <div class="space-y-4 mb-6 overflow-y-auto flex-1 min-h-0">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">指标名称 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="如：空腹血糖" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" v-model="editingMetric.name" @input="formError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">单位</label>
            <input type="text" placeholder="如：mmol/L（可留空）" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" v-model="editingMetric.unit" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">参考区间</label>
            <input type="text" placeholder="如：3.9 - 6.1（非必填）" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" v-model="editingMetric.normalRange" />
            <div class="text-[10px] text-gray-400 mt-1">用于按性别自动判断是否超出范围。支持「3.9-6.1」或「男9-50 / 女7-40」格式，非数值型（如"阴性"）不自动判断</div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">分类 <span class="text-red-500">*</span></label>
            <!-- Existing categories as tappable tags -->
            <div v-if="existingCategories.length > 0" class="flex flex-wrap gap-1.5 mb-2">
              <button
                v-for="cat in existingCategories"
                :key="cat"
                type="button"
                @click="editingMetric.category = cat; formError = ''"
                :class="[
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  editingMetric.category === cat
                    ? 'bg-[#1677FF] text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                ]"
              >
                {{ cat }}
              </button>
            </div>
            <input
              type="text"
              placeholder="或输入新分类名称"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm"
              v-model="editingMetric.category"
              @input="formError = ''"
            />
          </div>
          <div v-if="formError" class="text-red-500 text-xs font-medium text-center">{{ formError }}</div>
        </div>
        <div class="flex gap-3 shrink-0">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showEditModal = false">取消</button>
          <button class="flex-[2] py-3 rounded-xl bg-[#1677FF] text-white font-bold" @click="saveMetric">保存</button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
