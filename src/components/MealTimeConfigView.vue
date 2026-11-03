<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { Coffee, Clock } from 'lucide-vue-next';
import { showToast, Picker as VanPicker, Button as VanButton, Popup as VanPopup, TimePicker as VanTimePicker, Switch as VanSwitch } from 'vant';
import type { MealTimeConfig } from '../types';

const store = useAppStore();

const selectedCampId = ref<string>(store.camps[0]?.id || '');
const showCampPicker = ref(false);
const campColumns = computed(() => store.camps.map((c: any) => ({ text: c.name, value: c.id })));
function onCampConfirm({ selectedValues }: { selectedValues: string[] }) {
  if (selectedValues[0]) selectedCampId.value = selectedValues[0];
  showCampPicker.value = false;
}

const config = ref<MealTimeConfig>({ ...store.getMealTimeConfig(selectedCampId.value) });

watch(selectedCampId, (newId) => {
  if (newId) config.value = { ...store.getMealTimeConfig(newId) };
});

const mealLabels: Array<{ key: keyof MealTimeConfig; label: string; icon: string }> = [
  { key: 'breakfast', label: '早餐', icon: '07:00-10:00' },
  { key: 'lunch', label: '午餐', icon: '11:00-14:00' },
  { key: 'dinner', label: '晚餐', icon: '17:00-21:00' },
  { key: 'snack', label: '加餐', icon: '14:00-17:00' },
];

// ─── 时间选择器弹窗 ───
const showTimePicker = ref(false);
const timePickerTarget = ref<{ mealKey: keyof MealTimeConfig; field: 'start' | 'end' }>({ mealKey: 'breakfast', field: 'start' });
const timePickerValue = ref<string[]>(['07', '00']);

function openTimePicker(mealKey: keyof MealTimeConfig, field: 'start' | 'end') {
  timePickerTarget.value = { mealKey, field };
  const current = config.value[mealKey][field] || '';
  if (current && current.includes(':')) {
    timePickerValue.value = current.split(':');
  } else {
    timePickerValue.value = field === 'start' ? ['07', '00'] : ['10', '00'];
  }
  showTimePicker.value = true;
}

function onTimePickerConfirm({ selectedValues }: { selectedValues: string[] }) {
  const { mealKey, field } = timePickerTarget.value;
  config.value[mealKey][field] = selectedValues.join(':');
  showTimePicker.value = false;
}

const handleSave = () => {
  store.updateMealTimeConfig(selectedCampId.value, config.value);
  showToast('保存成功');
  store.goBack();
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="打卡时间配置" :on-back="store.goBack" />

    <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">{{ campColumns.find(c => c.value === selectedCampId)?.text || '请选择' }}</div>
      </div>
      <VanButton size="small" plain type="warning" @click="showCampPicker = true">切换营期</VanButton>
    </div>
    <VanPopup v-model:show="showCampPicker" position="bottom">
      <VanPicker :columns="campColumns" @confirm="onCampConfirm" @cancel="showCampPicker = false" />
    </VanPopup>

    <div class="p-4 space-y-4 pb-24">
      <div class="bg-blue-50 rounded-xl p-3 text-xs text-blue-600 flex items-start gap-2 border border-blue-100">
        <Clock class="w-4 h-4 shrink-0 mt-0.5" />
        <span>配置每餐允许打卡的时间区间。学员在区间外无法打卡，系统会提示不在打卡时间。关闭开关则该餐不限制时间。</span>
      </div>

      <Card v-for="meal in mealLabels" :key="meal.key" class="p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-[#FF976A]/10 flex items-center justify-center text-[#FF976A]">
              <Coffee class="w-4 h-4" />
            </div>
            <span class="font-bold text-gray-900 text-sm">{{ meal.label }}</span>
          </div>
          <VanSwitch :model-value="config[meal.key].enabled" @update:model-value="config[meal.key].enabled = $event" size="20" />
        </div>

        <div v-if="config[meal.key].enabled" class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-xs text-gray-500 block mb-1">开始时间</label>
            <button type="button" @click="openTimePicker(meal.key, 'start')"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#07C160] flex items-center justify-between">
              <span>{{ config[meal.key].start || '选择时间' }}</span>
              <Clock class="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>
          </div>
          <div class="text-gray-300 pt-5">~</div>
          <div class="flex-1">
            <label class="text-xs text-gray-500 block mb-1">结束时间</label>
            <button type="button" @click="openTimePicker(meal.key, 'end')"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#07C160] flex items-center justify-between">
              <span>{{ config[meal.key].end || '选择时间' }}</span>
              <Clock class="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>
          </div>
        </div>

        <div v-else class="text-xs text-gray-400 py-2">
          已关闭时间限制，学员可随时打卡
        </div>
      </Card>
    </div>

    <div class="sticky bottom-0 p-4 bg-white border-t border-gray-100">
      <button class="w-full py-3 rounded-xl bg-[#FF976A] text-white font-bold active:scale-95 transition-transform" @click="handleSave">
        保存配置
      </button>
    </div>

    <!-- 时间选择器弹窗 -->
    <VanPopup v-model:show="showTimePicker" position="bottom" round>
      <VanTimePicker
        v-model="timePickerValue"
        :title="timePickerTarget.field === 'start' ? '选择开始时间' : '选择结束时间'"
        :columns-type="['hour', 'minute']"
        @confirm="onTimePickerConfirm"
        @cancel="showTimePicker = false"
      />
    </VanPopup>
  </div>
</template>
