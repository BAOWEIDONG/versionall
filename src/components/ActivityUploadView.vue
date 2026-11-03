<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { compressVideo } from '../lib/videoCompress';
import { NavBar, Card, Button, Input } from './ui';
import { Popup as VanPopup, showToast } from 'vant';
import { Camera, Video, X, ChevronDown, Check } from 'lucide-vue-next';

const store = useAppStore();

// 教练可发布的营期：来源于营养师端账号管理分配的 campIds
  // 无 campIds = 负责全部营期
  const coachCamps = computed(() => {
    const coachAccount = store.accounts.find(a => a.id === store.user?.id || a.phone === store.user?.phone);
    const ids = coachAccount?.campIds;
    if (!ids || ids.length === 0) return store.camps.filter(c => c.status === 'active');
    return store.camps.filter(c => ids.includes(c.id));
  });
  const camps = coachCamps;
const selectedCampIds = ref<string[]>([]);  // 空数组 = 全部营期
const showCampPicker = ref(false);

const campDisplayName = computed(() => {
  if (selectedCampIds.value.length === 0) return '全部营期';
  if (selectedCampIds.value.length === camps.value.length) return '全部营期';
  return selectedCampIds.value.map(id => camps.value.find(c => c.id === id)?.name || id).join('、');
});

const toggleCamp = (id: string) => {
  const idx = selectedCampIds.value.indexOf(id);
  if (idx >= 0) selectedCampIds.value.splice(idx, 1);
  else selectedCampIds.value.push(id);
};

const formData = reactive({ title: '', description: '' });
const imageFiles = ref<string[]>([]);
const videoUrls = ref<string[]>([]);
const mediaType = ref<'image' | 'video'>('image');
const error = ref('');

// ─── 编辑模式：来源 coach-dashboard 点「编辑」，预填表单 ───
const editingActivity = computed(() => store.editingActivity);
const editingId = computed(() => editingActivity.value?.id);
const isEditing = computed(() => Boolean(editingId.value));

// ★视图被 KeepAlive 缓存，setup 只在首次创建时执行——改用 watch 监听 editingActivity，
//   每次进入编辑（含从缓存激活）都重新预填；置 null（发布新活动/取消编辑）时重置表单。
watch(() => store.editingActivity, (record) => {
  if (!record) {
    formData.title = '';
    formData.description = '';
    imageFiles.value = [];
    videoUrls.value = [];
    mediaType.value = 'image';
    selectedCampIds.value = [];
    error.value = '';
    return;
  }
  formData.title = record.title || '';
  formData.description = record.description || '';
  const imgs = record.imageUrls || [];
  const vids = record.videoUrls || [];
  if (vids.length > 0) {
    mediaType.value = 'video';
    videoUrls.value = [...vids];
    imageFiles.value = [];
  } else {
    mediaType.value = 'image';
    imageFiles.value = [...imgs];
    videoUrls.value = [];
  }
  // 仅预填用户可见营期内的 id（不在可选营期的自动落入全部营期）
  selectedCampIds.value = record.campIds ? record.campIds.filter((id) => camps.value.some((c) => c.id === id)) : [];
  error.value = '';
}, { immediate: true });

const handleBack = () => {
  store.setEditingActivity(null);
  store.goBack();
};

const photoInputRef = ref<HTMLInputElement | null>(null);
const videoInputRef = ref<HTMLInputElement | null>(null);

const handlePhotoSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 5 - imageFiles.value.length;
  try {
    const urls = await Promise.all(files.slice(0, remaining).map(async (f) => uploadFile(await compressImage(f))));
    imageFiles.value = [...imageFiles.value, ...urls];
  } catch {
    showToast({ message: '图片上传失败，请重试', position: 'top', duration: 2500 });
  }
  (e.target as HTMLInputElement).value = '';
};

const handleVideoSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 5 - videoUrls.value.length;
  try {
    const urls = await Promise.all(files.slice(0, remaining).map(async (f) => uploadFile(await compressVideo(f))));
    videoUrls.value = [...videoUrls.value, ...urls];
  } catch {
    showToast({ message: '视频上传失败，请重试', position: 'top', duration: 2500 });
  }
  (e.target as HTMLInputElement).value = '';
};

const removeImage = (i: number) => { imageFiles.value = imageFiles.value.filter((_, x) => x !== i); };
const removeVideo = (i: number) => { videoUrls.value = videoUrls.value.filter((_, x) => x !== i); };

const switchType = (t: 'image' | 'video') => {
  mediaType.value = t;
  if (t === 'image') videoUrls.value = [];
  else imageFiles.value = [];
  error.value = '';
};

const handleSubmit = () => {
  if (!formData.title) { error.value = '请输入活动标题'; return; }
  if (!formData.description) { error.value = '请输入活动介绍'; return; }
  if (mediaType.value === 'image' && imageFiles.value.length === 0) { error.value = '请至少上传一张图片'; return; }
  if (mediaType.value === 'video' && videoUrls.value.length === 0) { error.value = '请至少上传一个视频'; return; }

  if (isEditing.value) {
    store.updateCoachActivity(editingId.value!, {
      title: formData.title,
      description: formData.description,
      imageUrls: mediaType.value === 'image' ? imageFiles.value : [],
      videoUrls: mediaType.value === 'video' ? videoUrls.value : [],
      campIds: selectedCampIds.value.length > 0 ? [...selectedCampIds.value] : undefined,
    });
    showToast({ message: '修改已保存', position: 'top', duration: 2000 });
  } else {
    store.addCoachActivity({
      id: `act_${Date.now()}`,
      title: formData.title,
      description: formData.description,
      imageUrls: mediaType.value === 'image' ? imageFiles.value : [],
      videoUrls: mediaType.value === 'video' ? videoUrls.value : [],
      coachName: store.user?.name || '教练',
      date: format(new Date(), 'yyyy-MM-dd'),
      campIds: selectedCampIds.value.length > 0 ? [...selectedCampIds.value] : undefined,
    });
    showToast({ message: '发布成功', position: 'top', duration: 2000 });
  }
  store.setEditingActivity(null);
  store.setCurrentView('coach-dashboard');
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe">
    <NavBar :title="isEditing ? '编辑锻炼活动' : '发布锻炼活动'" :on-back="handleBack" />

    <div class="p-4 space-y-4">
      <Card>
        <div class="space-y-4">
          <!-- 营期选择 -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">发布范围 <span class="text-red-500">*</span></label>
            <button
              @click="showCampPicker = true"
              class="w-full px-3 py-2.5 border border-gray-200 rounded-xl flex items-center justify-between text-sm bg-white hover:border-[#07C160] transition-colors"
            >
              <span :class="selectedCampIds.length > 0 ? 'text-gray-900' : 'text-gray-400'">
                {{ campDisplayName }}
              </span>
              <ChevronDown class="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">活动多媒体 <span class="text-red-500">*</span></label>

            <div class="flex bg-gray-100 p-1 rounded-lg mb-3">
              <button
                :class="['flex-1 py-1.5 text-sm font-medium rounded-md transition-colors', mediaType === 'image' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500']"
                @click="switchType('image')"
              >上传图片</button>
              <button
                :class="['flex-1 py-1.5 text-sm font-medium rounded-md transition-colors', mediaType === 'video' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500']"
                @click="switchType('video')"
              >上传视频</button>
            </div>

            <input ref="photoInputRef" type="file" accept="image/*" multiple class="hidden" @change="handlePhotoSelect" />
            <input ref="videoInputRef" type="file" accept="video/*" multiple class="hidden" @change="handleVideoSelect" />

            <div class="grid grid-cols-3 gap-2">
              <template v-if="mediaType === 'video'">
                <div v-for="(url, index) in videoUrls" :key="index" class="aspect-square rounded-xl bg-black overflow-hidden relative">
                  <video :src="url" class="w-full min-h-full object-cover cursor-pointer" preload="metadata" playsinline webkit-playsinline @click="store.openVideoPreview(url)" />
                  <button @click="removeVideo(index)" class="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 z-10">
                    <X class="w-3 h-3" />
                  </button>
                </div>
                <div
                  v-if="videoUrls.length < 5"
                  @click="videoInputRef?.click()"
                  class="aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <Video class="h-6 w-6 text-[#1677FF] mb-1" />
                  <span class="text-[10px] text-gray-400">上传视频</span>
                </div>
              </template>

              <template v-else>
                <div v-for="(url, index) in imageFiles" :key="index" class="aspect-square rounded-xl bg-gray-100 overflow-hidden relative">
                  <img loading="lazy" decoding="async" :src="url" :alt="`Preview ${index}`" class="w-full min-h-full object-cover cursor-pointer" @click="store.openImagePreview(imageFiles, index)" />
                  <button @click="removeImage(index)" class="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">
                    <X class="w-3 h-3" />
                  </button>
                </div>
                <div
                  v-if="imageFiles.length < 5"
                  @click="photoInputRef?.click()"
                  class="aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <Camera class="h-6 w-6 text-gray-400 mb-1" />
                  <span class="text-[10px] text-gray-400">上传图片</span>
                </div>
              </template>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 block">活动标题 <span class="text-red-500">*</span></label>
            <Input
              placeholder="例如：全身燃脂 HIIT"
              :value="formData.title"
              @input="formData.title = ($event.target as HTMLInputElement).value; error = ''"
            />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 block">活动介绍 <span class="text-red-500">*</span></label>
            <textarea
              placeholder="请输入详细的锻炼动作说明、注意事项及建议时长..."
              :value="formData.description"
              @input="formData.description = ($event.target as HTMLTextAreaElement).value; error = ''"
              class="w-full h-32 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20 focus:border-[#1677FF] resize-none text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </div>
      </Card>

      <div v-if="error" class="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded-lg">{{ error }}</div>

      <div class="pt-4">
        <Button
          class="w-full bg-[#1677FF] hover:bg-[#1677FF]/90 text-white shadow-lg shadow-[#1677FF]/20"
          size="lg"
          @click="handleSubmit"
        >
          {{ isEditing ? '保存修改' : '发布活动' }}
        </Button>
      </div>
    </div>

    <!-- 营期选择弹窗（多选） -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round class="custom-popup">
      <div class="p-4">
        <h3 class="text-base font-bold text-gray-900 mb-1 text-center">选择发布范围</h3>
        <p class="text-xs text-gray-400 text-center mb-4">不选 = 全部营期可见，可多选</p>
        <div class="space-y-2 max-h-60 overflow-y-auto">
          <button
            v-for="camp in camps"
            :key="camp.id"
            @click="toggleCamp(camp.id)"
            :class="['w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left flex items-center justify-between', selectedCampIds.includes(camp.id) ? 'bg-[#07C160]/10 text-[#07C160] border border-[#07C160]/30' : 'bg-gray-50 text-gray-700']"
          >
            <span>
              {{ camp.name }}
              <span class="text-[10px] text-gray-400 ml-1">{{ camp.status === 'active' ? '进行中' : '待开始' }}</span>
            </span>
            <span v-if="selectedCampIds.includes(camp.id)" class="w-5 h-5 rounded-full bg-[#07C160] flex items-center justify-center shrink-0">
              <Check class="w-3 h-3 text-white" />
            </span>
            <span v-else class="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0"></span>
          </button>
        </div>
        <div class="flex gap-3 mt-4">
          <button @click="selectedCampIds = []" class="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">
            清空（全部营期）
          </button>
          <button @click="showCampPicker = false" class="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#07C160] text-white">
            确定{{ selectedCampIds.length > 0 ? `(${selectedCampIds.length})` : '' }}
          </button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
