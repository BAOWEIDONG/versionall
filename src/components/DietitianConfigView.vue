<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../store/app';
import { useDietitianCounts } from '../lib/dietitianCounts';
import { Card } from './ui';
import { Clock, Gift, Trophy, Activity, FileText, Users, ChevronRight, Settings, Package, Award, BarChart3 } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';

const store = useAppStore();

// ─── 底部 Tabbar 角标：批注=待批注数，配置=发放中心待发货数（各营养师页面共用口径） ───
const { unannotatedCount, fulfillmentPendingCount } = useDietitianCounts();
const fulfillmentPending = fulfillmentPendingCount;

interface ConfigItem {
  view: string;
  title: string;
  desc: string;
  icon: typeof Clock;
  color: string;
  badge?: number;
}

const configItems = computed<ConfigItem[]>(() => [
  // 仅督导权限账号可见：全局运营数据入口
  ...(store.user?.supervisor
    ? [{ view: 'supervisor-dashboard', title: '运营总览', desc: '营养师/教练批注情况与完成率', icon: BarChart3, color: '#1F4E79' }]
    : []),
  { view: 'account-manage', title: '账户管理', desc: '各角色手机号与营期', icon: Users, color: '#FF976A' },
  { view: 'reward-config', title: '奖品配置', desc: '连续打卡奖励阶梯与配置', icon: Gift, color: '#FF976A' },
  { view: 'fulfillment-center', title: '发放中心', desc: '发货·发放·兑换记录', icon: Package, color: '#FF976A', badge: fulfillmentPending.value > 0 ? fulfillmentPending.value : undefined },
  { view: 'activity-admin', title: '活动配置', desc: '连续打卡奖励与积分商城开关', icon: Activity, color: '#FF976A' },
  { view: 'badge-config', title: '徽章配置', desc: '趣味活动规则、徽章记录与清单导出', icon: Award, color: '#FF976A' },
  { view: 'metric-config', title: '指标配置', desc: '健康档案体检指标项', icon: FileText, color: '#FF976A' },
  { view: 'camp-summary', title: '结营统计', desc: '学员数据变化与打卡频率', icon: Trophy, color: '#FF976A' },
  { view: 'camp-stats', title: '指标变化统计', desc: '营前营后指标个人/均值对比', icon: BarChart3, color: '#FF976A' },
]);
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <div class="pt-[calc(env(safe-area-inset-top)+2.5rem)] px-6 pb-6 bg-gradient-to-b from-[#FF976A]/10 to-[#F7F8FA]">
      <div class="flex items-center space-x-3">
        <div class="h-12 w-12 rounded-xl bg-[#FF976A] flex items-center justify-center shadow-md shrink-0">
          <Settings class="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 class="text-lg font-bold text-gray-900">管理配置</h2>
          <p class="text-xs text-gray-500 mt-0.5">营期配置、奖励管理、活动设置等</p>
        </div>
      </div>
    </div>

    <div class="flex-1 px-5 pt-2">
      <div class="space-y-3">
        <Card
          v-for="item in configItems"
          :key="item.view"
          class="flex items-center justify-between p-4 cursor-pointer hover:border-[#FF976A] transition-colors border-0 shadow-sm"
          @click="store.setCurrentView(item.view as any)"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :style="{ background: item.color + '15' }">
              <component :is="item.icon" class="w-5 h-5" :style="{ color: item.color }" />
            </div>
            <div>
              <div class="text-sm font-bold text-gray-900">{{ item.title }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ item.desc }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span v-if="item.badge" class="bg-[#FF4444] text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
              {{ item.badge }}
            </span>
            <ChevronRight class="w-4 h-4 text-gray-300" />
          </div>
        </Card>
      </div>
    </div>

    <!-- Bottom Nav -->
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
