<script setup lang="ts">
import { computed } from 'vue';
import { Activity, Gift, Bell, FileText } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import { useAppStore } from '../../store/app';

/**
 * 学员端底部主导航（首页/活动/消息/档案）。四个主页面 + 五个子页(积分商城/我的奖励/
 * 个人历程/个人营期报告/趣味活动)共用，杜绝手写高亮索引复制错位(曾「档案页亮活动」)。
 *
 * 当该营期「未配置活动」(积分商城关 且 连续打卡关/无奖品档)时自动去掉「活动」项，
 * 只留 首页/消息/档案 三等分。高亮索引由 anchor 锚点在「可见 tab 列表」里的位置推导，
 * 活动隐藏时索引自动收缩(首页0/消息1/档案2)，绝不漂移。
 *
 * props.anchor: 本页要高亮的 tab（语义键，非索引）。子页传其入口父 tab，如积分商城/我的
 * 奖励传 'activity-hub'；个人营期报告传 'dashboard'（高亮首页，用户口径）；个人历程传 'health-profile'。
 * 当 anchor 对应 tab 因活动隐藏而不存在(如活动隐藏时理论上不可达的活动子页)，回退高亮首页。
 */
type Anchor = 'dashboard' | 'activity-hub' | 'messages' | 'health-profile';

const props = defineProps<{
  anchor: Anchor;
  badge?: number; // 消息未读数：主页面传各自口径；当前就在消息页(anchor=messages)时不展示徽标
  printHidden?: boolean; // 打印/长图导出时隐藏底部栏(个人历程/个人营期报告用)
}>();

const store = useAppStore();

// 活动营期解析：与各视图(首页/消息/活动页)完全一致，保证 tab 显隐与活动页空态口径统一
const availableCamps = computed(() => (store.user ? store.getStudentCamps(store.user.id) : []));
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some((c) => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find((c) => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

const showActivity = computed(() => store.getHasActivity(activeCampId.value));

const ICONS: Record<Anchor, typeof Activity> = {
  dashboard: Activity,
  'activity-hub': Gift,
  messages: Bell,
  'health-profile': FileText,
};

const tabs = computed(() => {
  const list: { key: Anchor; label: string }[] = [{ key: 'dashboard', label: '首页' }];
  if (showActivity.value) list.push({ key: 'activity-hub', label: '活动' });
  list.push({ key: 'messages', label: '消息' });
  list.push({ key: 'health-profile', label: '档案' });
  return list;
});

const modelValue = computed(() => {
  const i = tabs.value.findIndex((t) => t.key === props.anchor);
  return i < 0 ? 0 : i;
});

function go(key: Anchor) {
  store.setCurrentView(key);
}
</script>

<template>
  <VanTabbar
    class="custom-tabbar"
    :class="printHidden ? 'print:hidden' : ''"
    :model-value="modelValue"
  >
    <VanTabbarItem
      v-for="t in tabs"
      :key="t.key"
      @click="go(t.key)"
      :badge="t.key === 'messages' ? badge ?? undefined : undefined"
    >
      <template #icon><component :is="ICONS[t.key]" class="h-6 w-6" /></template>
      {{ t.label }}
    </VanTabbarItem>
  </VanTabbar>
</template>