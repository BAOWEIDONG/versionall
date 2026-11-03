<script setup lang="ts">
/**
 * 图表计算规则说明按钮 + 弹窗
 *
 * 用法:
 * <ChartRulePopup title="饮食健康指数计算规则" button-text="计算规则">
 *   <p>规则文字...</p>
 * </ChartRulePopup>
 */
import { ref } from 'vue';
import { Popup as VanPopup } from 'vant';
import { Info } from 'lucide-vue-next';

defineProps<{
  title: string;
  buttonText?: string;
}>();

const show = ref(false);
</script>

<template>
  <button
    @click="show = true"
    class="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#FF976A] transition-colors shrink-0"
  >
    <Info class="w-3 h-3" />
    {{ buttonText || '计算规则' }}
  </button>

  <VanPopup
    v-model:show="show"
    position="center"
    closeable
    close-icon-position="top-right"
    class="custom-popup"
  >
    <div class="p-5 max-h-[80vh] overflow-y-auto" style="width: 88vw; max-width: 360px">
      <h3 class="font-bold text-gray-900 text-base mb-3">{{ title }}</h3>
      <div class="text-sm text-gray-700 space-y-3 leading-relaxed">
        <slot />
      </div>
    </div>
  </VanPopup>
</template>
