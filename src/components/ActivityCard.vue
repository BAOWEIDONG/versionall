<script setup lang="ts">
import { ref, computed } from 'vue';
import { Clock, User, Play, ChevronDown } from 'lucide-vue-next';
import { useAppStore } from '../store/app';
import type { CoachActivityRecord } from '../types';

const props = defineProps<{ activity: CoachActivityRecord; editable?: boolean }>();
const emit = defineEmits<{ (e: 'edit', activity: CoachActivityRecord): void; (e: 'delete', activity: CoachActivityRecord): void }>();
const store = useAppStore();

const campLabels = computed(() => {
  const ids = props.activity.campIds;
  if (!ids || ids.length === 0) return [] as string[];
  return ids.map(id => store.camps.find(c => c.id === id)?.name || id).filter(Boolean);
});

const currentIndex = ref(0);
const scrollRef = ref<HTMLDivElement | null>(null);
const expanded = ref(false);

// 长文本判断：超过 100 字符或含换行符且超过 3 行
const isLongText = computed(() => {
  const desc = props.activity.description || '';
  return desc.length > 100 || (desc.split('\n').length > 3 && desc.length > 60);
});

// Build unified media list: { url, type }
const mediaItems = computed(() => {
  const items: { url: string; type: 'video' | 'image' }[] = [];
  if (props.activity.videoUrls) {
    props.activity.videoUrls.forEach((url) => items.push({ url, type: 'video' }));
  }
  if (props.activity.imageUrls) {
    props.activity.imageUrls.forEach((url) => items.push({ url, type: 'image' }));
  }
  return items;
});

const hasMedia = computed(() => mediaItems.value.length > 0);

const handleScroll = (e: Event) => {
  const el = e.currentTarget as HTMLDivElement;
  if (!el) return;
  const newIndex = Math.round(el.scrollLeft / el.clientWidth);
  if (newIndex !== currentIndex.value) {
    currentIndex.value = newIndex;
  }
};

const handleMediaClick = (item: { url: string; type: 'video' | 'image' }) => {
  if (item.type === 'video') {
    store.openVideoPreview(item.url);
  } else {
    const imageUrls = mediaItems.value.filter((m) => m.type === 'image').map((m) => m.url);
    const imgIdx = imageUrls.indexOf(item.url);
    store.openImagePreview(imageUrls, imgIdx >= 0 ? imgIdx : 0);
  }
};
</script>

<template>
  <div class="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 group">
    <!-- Unified media carousel: fixed h-48, object-cover for all -->
    <div v-if="hasMedia" class="relative bg-gray-100">
      <div
        ref="scrollRef"
        @scroll="handleScroll"
        class="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        <div
          v-for="(item, idx) in mediaItems"
          :key="idx"
          class="relative w-full shrink-0 snap-center h-48 cursor-pointer"
          @click="handleMediaClick(item)"
        >
          <!-- Video thumbnail -->
          <video
            v-if="item.type === 'video'"
            :src="item.url"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            playsinline
            webkit-playsinline
          />
          <!-- Image -->
          <img loading="lazy" decoding="async"
            v-else
            :src="item.url"
            :alt="`media ${idx + 1}`"
            class="w-full h-full object-cover"
          />
          <!-- Play overlay for videos -->
          <div v-if="item.type === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play class="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" />
            </div>
          </div>
        </div>
      </div>
      <!-- Multi-media indicators -->
      <template v-if="mediaItems.length > 1">
        <div class="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-medium px-2 py-1 rounded-full backdrop-blur-sm pointer-events-none">
          {{ currentIndex + 1 }}/{{ mediaItems.length }}
        </div>
        <div class="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
          <div
            v-for="(_, idx) in mediaItems"
            :key="idx"
            :class="['h-1.5 rounded-full transition-all', idx === currentIndex ? 'w-4 bg-[#07C160] shadow-sm' : 'w-1.5 bg-white/70 backdrop-blur-sm']"
          />
        </div>
      </template>
    </div>

    <!-- Content -->
    <div class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <h3 class="font-bold text-gray-900 text-lg">{{ activity.title }}</h3>
        <template v-if="campLabels.length > 0">
          <span v-for="label in campLabels" :key="label" class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#07C160]/10 text-[#07C160] shrink-0">{{ label }}</span>
        </template>
        <span v-else class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 shrink-0">全部营期</span>
      </div>
      <p :class="['text-sm text-gray-600 mb-2 whitespace-pre-wrap', isLongText && !expanded ? 'line-clamp-3' : '']">{{ activity.description }}</p>
      <button
        v-if="isLongText"
        @click="expanded = !expanded"
        class="flex items-center gap-0.5 text-xs text-[#07C160] font-medium mb-3 active:scale-95 transition-transform"
      >
        {{ expanded ? '收起' : '展开全文' }}
        <ChevronDown :class="['w-3.5 h-3.5 transition-transform', expanded ? 'rotate-180' : '']" />
      </button>
      <div v-else class="mb-4"></div>
      <div class="flex items-center text-xs text-gray-400 gap-4 font-medium border-t border-gray-50 pt-3">
        <div class="flex items-center gap-1">
          <User class="w-3.5 h-3.5" />
          <span>{{ activity.coachName }}</span>
        </div>
        <div class="flex items-center gap-1">
          <Clock class="w-3.5 h-3.5" />
          <span>发布于 {{ activity.date }}</span>
        </div>
        <div v-if="editable" class="ml-auto flex items-center gap-3">
          <button
            class="flex items-center gap-0.5 text-xs text-[#1677FF] font-medium active:scale-95 transition-transform"
            @click="emit('edit', props.activity)"
          >编辑</button>
          <button
            class="flex items-center gap-0.5 text-xs text-red-500 font-medium active:scale-95 transition-transform"
            @click="emit('delete', props.activity)"
          >删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
