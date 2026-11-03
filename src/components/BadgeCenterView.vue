<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import BadgeInfoPopup from './BadgeInfoPopup.vue';
import { Award, Medal, Trophy, Sparkles, Info, Lock, ChevronRight } from 'lucide-vue-next';
import type { BadgeCadence, BadgeConfig, BadgeRecord } from '../types';

const store = useAppStore();

const availableCamps = computed(() => (store.user ? store.getStudentCamps(store.user.id) : []));
const campId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some((c) => c.id === store.selectedCampId)) return store.selectedCampId;
  return store.pickLatestCamp(availableCamps.value)?.id || availableCamps.value[0]?.id || null;
});
const camp = computed(() => availableCamps.value.find((c) => c.id === campId.value) || null);
const uid = computed(() => store.user?.id || '');

// 统一视图：生效配置 + 已获记录 + 停用/删除后的历史记录（与营养师端同源）
const badgeView = computed(() => {
  if (!uid.value || !campId.value) return { earned: [], activeConfigs: [], historical: [] };
  return store.getStudentBadgeView(uid.value, campId.value);
});
const configs = computed(() => badgeView.value.activeConfigs);
const myBadges = computed(() => badgeView.value.earned);
const historicalBadges = computed(() => badgeView.value.historical);

const milestoneConfigs = computed(() => configs.value.filter((c) => c.category === 'milestone' && c.active !== false));
const achievementConfigs = computed(() => configs.value.filter((c) => c.category === 'achievement' && c.active !== false));
const activityConfigs = computed(() => configs.value.filter((c) => c.category === 'activity' && c.active !== false));

const earnedBadge = (cfg: BadgeConfig) => myBadges.value.some((b) => b.badgeId === cfg.id);
const earnedCountOf = (list: BadgeConfig[]) => list.filter((c) => earnedBadge(c)).length;

const counts = computed(() => ({
  total: myBadges.value.length,
  milestone: myBadges.value.filter((b) => b.category === 'milestone').length,
  achievement: myBadges.value.filter((b) => b.category === 'achievement').length,
  activity: myBadges.value.filter((b) => b.category === 'activity').length,
  historical: historicalBadges.value.length,
}));

const activityStats = computed(() => activityConfigs.value.map((cfg) => {
  const list = myBadges.value.filter((b) => b.badgeId === cfg.id);
  return { ...cfg, earned: list.length, latest: list[0]?.earnedAt || '' };
}));
const activityDetails = computed(() => myBadges.value.filter((b) => b.category === 'activity'));

const cadenceLabel = (c: BadgeCadence) => (c === 'day' ? '每日' : c === 'week' ? '每周' : '每月');

// 点击徽章查看完整规则与获得记录
const showInfo = ref(false);
const activeCfg = ref<BadgeConfig | null>(null);
const activeRecords = computed(() => {
  if (!activeCfg.value) return [] as BadgeRecord[];
  return myBadges.value.filter((b) => b.badgeId === activeCfg.value!.id);
});
const openBadge = (cfg: BadgeConfig) => {
  activeCfg.value = cfg;
  showInfo.value = true;
};
const openActivityRecord = (r: BadgeRecord) => {
  const cfg = configs.value.find((c) => c.id === r.badgeId);
  if (cfg) openBadge(cfg);
  else openHistorical(r);
};
const openHistorical = (r: BadgeRecord) => {
  activeCfg.value = {
    id: r.badgeId,
    category: r.category,
    name: r.badgeName,
    cadence: r.cadence,
    condition: 'checkin_days',
    threshold: 0,
    icon: r.icon,
    description: '该徽章活动已停用或删除，历史获得记录仍为你保留',
    active: false,
  };
  showInfo.value = true;
};

onMounted(() => {
  if (campId.value) store.syncBadges(campId.value);
});
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F4F6F8] pb-10 font-sans">
    <NavBar title="我的徽章" :on-back="store.goBack" />

    <div class="px-5 pt-4 space-y-4">
      <!-- 顶部总览 -->
      <div class="rounded-2xl p-5 text-white bg-gradient-to-br from-[#07C160] to-[#04a551] shadow-lg">
        <div class="flex items-center gap-2 text-xs opacity-90">
          <Medal class="w-4 h-4" /> {{ camp?.name || '健康训练营' }} · 徽章收集
        </div>
        <div class="mt-3 flex items-end gap-1">
          <span class="text-4xl font-black">{{ counts.total }}</span>
          <span class="text-sm mb-1 opacity-90">枚徽章</span>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
          <div class="bg-white/15 rounded-xl py-2">
            <div class="text-lg font-bold">{{ counts.milestone }}<span class="text-[10px] opacity-70">/{{ milestoneConfigs.length }}</span></div>
            <div class="text-[10px] opacity-85">里程碑</div>
          </div>
          <div class="bg-white/15 rounded-xl py-2">
            <div class="text-lg font-bold">{{ counts.achievement }}<span class="text-[10px] opacity-70">/{{ achievementConfigs.length }}</span></div>
            <div class="text-[10px] opacity-85">成就</div>
          </div>
          <div class="bg-white/15 rounded-xl py-2">
            <div class="text-lg font-bold">{{ counts.activity }}</div>
            <div class="text-[10px] opacity-85">活动</div>
          </div>
        </div>
      </div>

      <!-- 里程碑徽章 -->
      <Card v-if="milestoneConfigs.length > 0">
        <h3 class="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Trophy class="w-4 h-4 text-[#FF976A]" /> 里程碑徽章
        </h3>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="c in milestoneConfigs" :key="c.id" :class="['flex items-center gap-2 p-3 rounded-xl cursor-pointer active:opacity-70', earnedBadge(c) ? 'bg-orange-50' : 'bg-gray-50']" @click="openBadge(c)">
            <div :class="['w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0', earnedBadge(c) ? 'bg-white shadow-sm' : 'bg-gray-200 grayscale opacity-60']">
              <span v-if="earnedBadge(c)">{{ c.icon }}</span>
              <Lock v-else class="w-4 h-4 text-gray-400" />
            </div>
            <div class="min-w-0 flex-1">
              <div :class="['text-xs font-bold leading-snug break-words', earnedBadge(c) ? 'text-gray-900' : 'text-gray-400']">{{ c.name }}</div>
              <div class="text-[10px] text-gray-400 leading-snug line-clamp-2">{{ c.description || '达到条件即可获得' }}</div>
            </div>
            <ChevronRight class="w-3.5 h-3.5 text-gray-300 shrink-0" />
          </div>
        </div>
      </Card>

      <!-- 成就徽章 -->
      <Card v-if="achievementConfigs.length > 0">
        <h3 class="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Award class="w-4 h-4 text-[#1677FF]" /> 成就徽章
          <span class="ml-auto text-[11px] text-gray-400 font-normal">{{ counts.achievement }}/{{ achievementConfigs.length }}</span>
        </h3>
        <p class="text-[10px] text-gray-400 mb-3">一次性达成，不重复获得</p>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="c in achievementConfigs" :key="c.id" class="flex flex-col items-center text-center p-2 rounded-xl bg-gray-50 cursor-pointer active:opacity-70" @click="openBadge(c)">
            <div :class="['w-10 h-10 rounded-full flex items-center justify-center text-xl', earnedBadge(c) ? 'bg-white shadow-sm' : 'bg-gray-200 grayscale opacity-50']">{{ c.icon }}</div>
            <div :class="['text-[11px] font-bold mt-1 leading-snug break-words line-clamp-2', earnedBadge(c) ? 'text-gray-900' : 'text-gray-400']">{{ c.name }}</div>
            <div class="text-[9px] text-gray-400 mt-0.5 line-clamp-2">{{ c.description }}</div>
          </div>
        </div>
      </Card>

      <!-- 活动徽章 -->
      <Card v-if="activityStats.length > 0">
        <h3 class="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-[#FF976A]" /> 活动徽章
          <span class="ml-auto text-[11px] text-gray-400 font-normal">共 {{ counts.activity }} 枚</span>
        </h3>
        <div class="space-y-3">
          <div v-for="c in activityStats" :key="c.id" class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 cursor-pointer active:opacity-70" @click="openBadge(c)">
            <div class="w-11 h-11 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm shrink-0">{{ c.icon }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-bold text-gray-900 leading-snug break-words">{{ c.name }}</div>
              <div class="text-[11px] text-gray-500 leading-snug line-clamp-2">{{ c.description || '达成即可获得' }}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm font-black text-[#07C160]">{{ c.earned }}<span class="text-[10px] text-gray-400 font-normal"> 枚</span></div>
              <div class="text-[10px] text-gray-400">{{ c.latest || '未获得' }}</div>
            </div>
            <ChevronRight class="w-3.5 h-3.5 text-gray-300 shrink-0" />
          </div>
        </div>
      </Card>

      <!-- 活动徽章明细 -->
      <Card v-if="activityDetails.length > 0">
        <h3 class="text-sm font-bold text-gray-900 mb-3">活动徽章明细</h3>
        <div class="space-y-2">
          <div v-for="b in activityDetails" :key="b.id" class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer active:opacity-70" @click="openActivityRecord(b)">
            <div class="w-9 h-9 rounded-full bg-[#07C160]/10 flex items-center justify-center text-xl shrink-0">{{ b.icon }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold text-gray-900">{{ b.badgeName }}</div>
              <div class="text-[10px] text-gray-400">{{ cadenceLabel(b.cadence) }} · 周期 {{ b.periodKey }} · 达成 {{ b.value }} 天</div>
            </div>
            <div class="text-[10px] text-gray-500 shrink-0">{{ b.earnedAt }}</div>
            <ChevronRight class="w-3.5 h-3.5 text-gray-300 shrink-0" />
          </div>
        </div>
      </Card>

      <!-- 历史徽章：活动停用/删除后，学员已获得的记录仍保留 -->
      <Card v-if="historicalBadges.length > 0">
        <h3 class="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Award class="w-4 h-4 text-gray-400" /> 历史徽章
          <span class="ml-auto text-[11px] text-gray-400 font-normal">{{ historicalBadges.length }} 枚</span>
        </h3>
        <p class="text-[10px] text-gray-400 mb-3">活动已停用或删除，已获得的徽章仍为你保留</p>
        <div class="space-y-2">
          <div v-for="b in historicalBadges" :key="b.id" class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer active:opacity-70" @click="openHistorical(b)">
            <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xl shrink-0">{{ b.icon }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold text-gray-900">{{ b.badgeName }}</div>
              <div class="text-[10px] text-gray-400">{{ b.periodKey === 'once' ? '一次性' : b.periodKey }} · 获得于</div>
            </div>
            <div class="text-[10px] text-gray-500 shrink-0">{{ b.earnedAt }}</div>
            <ChevronRight class="w-3.5 h-3.5 text-gray-300 shrink-0" />
          </div>
        </div>
      </Card>

      <div v-if="configs.length === 0 && historicalBadges.length === 0" class="text-center text-xs text-gray-400 py-6">当前营期暂无徽章配置</div>

      <div class="flex items-start gap-2 text-[11px] text-gray-400 px-1">
        <Info class="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>系统仅记录活动达成与徽章；实物奖励由你所在公司根据徽章清单发放。</p>
      </div>
    </div>

    <BadgeInfoPopup v-model:show="showInfo" :config="activeCfg" :records="activeRecords" :camp-name="camp?.name" />
  </div>
</template>
