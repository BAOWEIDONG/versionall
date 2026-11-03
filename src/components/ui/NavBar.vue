<script setup lang="ts">
import { NavBar as VanNavBar } from 'vant';
import { ChevronLeft } from 'lucide-vue-next';

defineProps<{
  title: string;
  onBack?: () => void;
}>();
</script>

<template>
  <VanNavBar :title="title" :border="false" class="custom-nav sticky top-0 z-50">
    <template v-if="onBack" #left>
      <button @click="onBack" class="p-2 -ml-2 text-gray-900 hover:bg-gray-100 rounded-full transition-colors active:bg-gray-200">
        <ChevronLeft class="h-6 w-6" />
      </button>
    </template>
    <template v-if="$slots.right" #right>
      <slot name="right" />
    </template>
  </VanNavBar>
</template>
