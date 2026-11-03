<script setup lang="ts">
import { ref, computed } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { Button, Input, NavBar, Card } from './ui';
import { UploadCloud, X } from 'lucide-vue-next';

const store = useAppStore();
const weight = ref('');
const images = ref<string[]>([]);
const error = ref('');

// 营期上下文
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

const photoInputRef = ref<HTMLInputElement | null>(null);

const handleFileSelect = (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 5 - images.value.length;
  const urls = files.slice(0, remaining).map((f) => URL.createObjectURL(f));
  images.value = [...images.value, ...urls];
  (e.target as HTMLInputElement).value = '';
};

const removeImage = (idx: number) => {
  images.value = images.value.filter((_, i) => i !== idx);
};

const handleSubmit = () => {
  const w = parseFloat(weight.value);
  if (!w || w < 30 || w > 300) {
    error.value = '请输入30-300kg之间的有效体重';
    return;
  }

  store.addWeightRecord({
    id: `w_${Date.now()}`,
    studentId: store.user?.id || 's1',
    campId: activeCampId.value || undefined,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    weight: w,
  });

  store.setCurrentView('dashboard');
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-8">
    <NavBar title="数据上传" />
    <div class="p-4 space-y-4">
      <Card class="space-y-4">
        <div>
          <h3 class="font-medium text-gray-900 mb-1">体检报告上传</h3>
          <p class="text-xs text-gray-500 mb-3">支持拍照或相册选择，最多5张 (不超过10MB)</p>

          <div class="grid grid-cols-3 gap-3">
            <div v-for="(img, idx) in images" :key="idx" class="relative aspect-square rounded-lg border border-gray-100 overflow-hidden">
              <img loading="lazy" decoding="async" :src="img" alt="Report" class="w-full min-h-full object-cover" />
              <button
                @click="removeImage(idx)"
                class="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white"
              >
                <X class="w-3 h-3" />
              </button>
            </div>

            <input ref="photoInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileSelect" />
            <button
              v-if="images.length < 5"
              @click="photoInputRef?.click()"
              class="aspect-square flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-[#F7F8FA] text-gray-500 hover:bg-white"
            >
              <UploadCloud class="w-6 h-6 mb-1" />
              <span class="text-xs">点击上传</span>
            </button>
          </div>
        </div>
      </Card>

      <Card class="space-y-2">
        <label class="font-medium text-gray-900 block">当前体重录入 <span class="text-red-500">*</span></label>
        <div class="flex items-center space-x-3">
          <Input
            type="number"
            inputmode="decimal"
            placeholder="0.0"
            :value="weight"
            @input="weight = ($event.target as HTMLInputElement).value"
            class="flex-1"
          />
          <span class="text-gray-500">kg</span>
        </div>
      </Card>

      <p v-if="error" class="text-red-500 text-sm text-center">{{ error }}</p>

      <div class="pt-4">
        <Button class="w-full" size="lg" @click="handleSubmit">
          完成注册，进入首页
        </Button>
      </div>
    </div>
  </div>
</template>
