<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '../../lib/utils';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    'rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.12)] border border-black/[0.04]',
    attrs.class as string | undefined,
  ),
);

const passthrough = computed(() => {
  const rest: Record<string, unknown> = {};
  for (const key in attrs) {
    if (key !== 'class') rest[key] = attrs[key];
  }
  return rest;
});
</script>

<template>
  <div :class="rootClass" v-bind="passthrough">
    <slot />
  </div>
</template>
