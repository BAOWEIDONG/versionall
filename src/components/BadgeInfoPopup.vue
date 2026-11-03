<script setup lang="ts">
import { computed } from 'vue';
import { Popup as VanPopup } from 'vant';
import { CheckCircle2, Lock, Award, Info } from 'lucide-vue-next';
import type { BadgeConfig, BadgeRecord } from '../types';
import { BADGE_CADENCE_LABEL, BADGE_CATEGORY_LABEL, describeBadgeCondition } from '../lib/badgeMeta';

const props = defineProps<{
  show: boolean;
  config: BadgeConfig | null;
  records: BadgeRecord[];
  campName?: string;
}>();

const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
});

const earnedCount = computed(() => props.records.length);
const latest = computed(() => props.records[0]?.earnedAt || '');
const categoryLabel = computed(() => (props.config ? BADGE_CATEGORY_LABEL[props.config.category] : ''));
const conditionText = computed(() => (props.config ? describeBadgeCondition(props.config) : ''));
</script>

<template>
  <VanPopup v-model:show="visible" position="bottom" round>
    <div v-if="config" class="p-5 pb-8">
      <div class="flex items-start gap-3">
        <div class="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center text-3xl shrink-0">{{ config.icon }}</div>
        <div class="flex-1 min-w-0">
          <div class="text-base font-black text-gray-900 leading-snug break-words">{{ config.name }}</div>
          <div class="flex items-center gap-1.5 mt-1 flex-wrap">
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#1677FF]/10 text-[#1677FF] font-bold">{{ categoryLabel }}</span>
            <span v-if="config.category === 'activity'" class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">{{ BADGE_CADENCE_LABEL[config.cadence] }}</span>
            <span v-if="earnedCount > 0" class="text-[10px] px-2 py-0.5 rounded-full bg-[#07C160]/10 text-[#07C160] font-bold flex items-center gap-0.5">
              <CheckCircle2 class="w-3 h-3" /> 已获得
            </span>
            <span v-else class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-bold flex items-center gap-0.5">
              <Lock class="w-3 h-3" /> 未获得
            </span>
          </div>
        </div>
        <button @click="visible = false" class="text-gray-400 p-1 shrink-0">✕</button>
      </div>

      <div v-if="config.description" class="mt-3 text-xs text-gray-600 leading-relaxed break-words">{{ config.description }}</div>

      <div class="mt-4 rounded-xl bg-gray-50 p-3 space-y-2">
        <div class="flex items-start gap-2">
          <Award class="w-4 h-4 text-[#FF976A] shrink-0 mt-0.5" />
          <div class="text-xs text-gray-700 leading-relaxed">
            <span class="text-gray-500">达成条件：</span>{{ conditionText }}
          </div>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500">已获得</span>
          <span class="font-bold text-gray-900">{{ earnedCount }} 枚</span>
        </div>
        <div v-if="latest" class="flex items-center justify-between text-xs">
          <span class="text-gray-500">最近获得</span>
          <span class="font-medium text-gray-700">{{ latest }}</span>
        </div>
      </div>

      <div v-if="records.length > 0" class="mt-4">
        <div class="text-xs font-bold text-gray-900 mb-2">获得记录</div>
        <div class="space-y-1.5 max-h-56 overflow-y-auto">
          <div v-for="r in records" :key="r.id" class="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-50 last:border-0">
            <span class="text-gray-600">{{ r.periodKey === 'once' ? '一次性达成' : r.periodKey }}</span>
            <span class="text-gray-400">达成 {{ r.value }}{{ config.category === 'activity' ? ' 天' : '' }} · {{ r.earnedAt }}</span>
          </div>
        </div>
      </div>

      <div class="flex items-start gap-1.5 mt-4 text-[10px] text-gray-400">
        <Info class="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>徽章由营养师按营期配置；系统仅记录达成，实物奖励由你所在公司根据徽章清单发放。</p>
      </div>
    </div>
  </VanPopup>
</template>
