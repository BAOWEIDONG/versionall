<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { Field as VanField } from 'vant';
import { cn } from '../../lib/utils';

defineOptions({ inheritAttrs: false });

const props = defineProps<{ value?: string | number }>();
const emit = defineEmits<{ (e: 'input', event: Event): void }>();

const attrs = useAttrs();

const rootClass = computed(() => cn('custom-input', attrs.class as string | undefined));

const passthrough = computed(() => {
  const rest: Record<string, unknown> = {};
  for (const key in attrs) {
    if (key !== 'class') rest[key] = attrs[key];
  }
  return rest;
});

// 桥接 van-field 的 update:modelValue 到调用方原有的 :value / @input 模式
// （调用方仍用 @input="x = $event.target.value"），这里构造等价的 target.value
const onUpdate = (val: string | number) => {
  emit('input', { target: { value: String(val) } } as unknown as Event);
};
</script>

<template>
  <VanField
    :model-value="(props.value ?? '') as string"
    :border="false"
    :class="rootClass"
    v-bind="passthrough"
    @update:model-value="onUpdate"
  />
</template>
