<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { Button as VanButton } from 'vant';
import { cn } from '../../lib/utils';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}>(), {
  variant: 'primary',
  size: 'md',
});

const attrs = useAttrs();

const variants: Record<string, string> = {
  primary: 'bg-[#07C160] text-white hover:bg-[#06ad56] active:bg-[#05964a] shadow-sm',
  secondary: 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 active:bg-gray-100',
  outline: 'border border-gray-300 text-gray-700 bg-transparent hover:bg-gray-50',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
};

const sizes: Record<string, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-base rounded-xl',
  lg: 'h-12 px-6 text-lg rounded-full font-medium',
};

const rootClass = computed(() =>
  cn(
    'custom-button inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] whitespace-nowrap border-0',
    variants[props.variant],
    sizes[props.size],
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
  <VanButton type="default" :class="rootClass" v-bind="passthrough">
    <slot />
  </VanButton>
</template>
