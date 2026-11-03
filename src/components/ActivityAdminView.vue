<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore, type ActivityConfig } from '../store/app';
import { NavBar, Card } from './ui';
import { showToast } from 'vant';
import { Settings, Coins, Flame, Users, FileText } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup, Switch as VanSwitch } from 'vant';
import { campDateRange, latestOrFirstId } from '../lib/camps';
import { useDietitianCounts } from '../lib/dietitianCounts';

const store = useAppStore();
// 底部 Tabbar 角标：批注=待批注数，配置=发放中心待发货数（各营养师页面共用口径）
const { unannotatedCount, fulfillmentPendingCount } = useDietitianCounts();

/**
 * 活动配置（营养师端）
 * 仅保留两个活动开关：积分商城 + 连续打卡奖励。
 * 关闭后学员端即时隐藏对应模块，已发放奖励与已累计积分不受影响。
 */
// ─── 营期切换（默认最新营期） ───
const selectedCampId = ref<string>(latestOrFirstId(store.camps) || '');
const showCampPicker = ref(false);
const selectedCamp = computed(() => store.camps.find((c) => c.id === selectedCampId.value) || null);

// 活动开关（按选中营期独立配置）
const activityConfig = computed(() => store.getActivityConfig(selectedCampId.value));
// 模板中沿用 cfg 简称
const cfg = activityConfig;

/** 更新当前营期的活动开关 */
function updateActivityConfigSafe(key: 'pointsMall' | 'checkinStreak', value: boolean) {
  if (!selectedCampId.value) {
    showToast('请先选择营期');
    return;
  }
  const updates: Partial<ActivityConfig> = {};
  updates[key] = value;
  store.updateActivityConfig(selectedCampId.value, updates);
}

/** 营期选择：同步本地与全局 selectedCampId */
function onCampPick(id: string) {
  selectedCampId.value = id;
  store.selectedCampId = id;
  showCampPicker.value = false;
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="活动配置" :on-back="store.goBack" />

    <!-- 营期切换 -->
    <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">
          {{ selectedCamp?.name || '未选择' }}
          <span v-if="selectedCamp" class="text-[10px] text-gray-400 ml-1">{{ campDateRange(selectedCamp) }}</span>
        </div>
      </div>
      <button class="text-xs text-[#FF976A] border border-[#FF976A] px-3 py-1.5 rounded-full font-bold active:bg-orange-50" @click="showCampPicker = true">
        切换营期
      </button>
    </div>

    <div class="p-4 space-y-4">
      <!-- 活动开关 -->
      <Card class="space-y-3">
        <h3 class="font-bold text-gray-900 text-sm flex items-center gap-2 border-b pb-2">
          <Settings class="h-4 w-4 text-[#FF976A]" />
          活动开关
        </h3>
        <p class="text-[10px] text-gray-400">关闭后学员端将隐藏对应活动模块</p>

        <!-- 积分商城 -->
        <div class="flex items-center justify-between py-2 border-t border-gray-50">
          <div class="flex items-center gap-2">
            <Coins class="h-4 w-4 text-[#FF6B35]" />
            <div>
              <div class="text-sm font-bold text-gray-900">积分商城</div>
              <div class="text-[10px] text-gray-400">学员用排行榜积分兑换商品</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.pointsMall" @update:model-value="updateActivityConfigSafe('pointsMall', $event)" size="22" />
        </div>

        <!-- 连续打卡奖励 -->
        <div class="flex items-center justify-between py-2 border-t border-gray-50">
          <div class="flex items-center gap-2">
            <Flame class="h-4 w-4 text-[#07C160]" />
            <div>
              <div class="text-sm font-bold text-gray-900">连续打卡奖励</div>
              <div class="text-[10px] text-gray-400">学员连续达标领取阶梯奖励</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.checkinStreak" @update:model-value="updateActivityConfigSafe('checkinStreak', $event)" size="22" />
        </div>
      </Card>

      <!-- 说明 -->
      <div class="text-center py-3">
        <p class="text-[10px] text-gray-300">积分商城与连续打卡奖励的开关独立配置 · 关闭后学员端即时隐藏对应模块，已发放奖励 / 已累计积分不受影响</p>
      </div>
    </div>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in store.camps"
            :key="camp.id"
            @click="onCampPick(camp.id)"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div class="flex-1 text-left">
              <div class="font-medium">{{ camp.name }}</div>
              <div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div>
            </div>
            <span
              v-if="camp.status === 'active'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600"
            >进行中</span>
            <span
              v-else-if="camp.status === 'ended'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >已结束</span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500"
            >未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>

    <VanTabbar class="custom-tabbar tabbar-orange" :model-value="2">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-unannotated-list')" :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem :badge="fulfillmentPendingCount > 0 ? fulfillmentPendingCount : undefined">
        <template #icon><Settings class="h-6 w-6" /></template>
        配置
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>