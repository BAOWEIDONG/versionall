<script setup lang="ts">
import { watch, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';
import { useAppStore } from '../store/app';

const store = useAppStore();

watch(
  () => store.videoPreview,
  (val) => {
    document.body.style.overflow = val ? 'hidden' : '';
  },
  { immediate: true },
);

onUnmounted(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <div
    v-if="store.videoPreview"
    class="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center backdrop-blur-sm"
    @click="store.closeVideoPreview"
  >
    <button
      @click="store.closeVideoPreview"
      class="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/20 rounded-full transition-colors z-10"
    >
      <X class="w-6 h-6" />
    </button>
    <video
      :src="store.videoPreview.url"
      class="max-w-[95vw] max-h-[90vh] object-contain"
      controls
      autoplay
      playsinline
      webkit-playsinline
      @click.stop
    />
  </div>
</template>
