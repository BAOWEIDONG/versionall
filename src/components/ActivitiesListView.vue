<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import ActivityCard from './ActivityCard.vue';

const store = useAppStore();

// 学员端：按营期过滤活动（全部营期的 + 当前营期的）
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});
const sortedActivities = computed(() =>
  [...(activeCampId.value ? store.getCampCoachActivities(activeCampId.value) : store.coachActivities)]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
);
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-safe font-sans">
    <NavBar title="锻炼活动" :on-back="store.goBack" />
    <div class="p-4 space-y-5">
      <Card v-if="sortedActivities.length === 0" class="text-center py-10 text-gray-500 text-sm">
        暂无锻炼活动
      </Card>
      <div v-else class="grid gap-5">
        <ActivityCard v-for="activity in sortedActivities" :key="activity.id" :activity="activity" />
      </div>
    </div>
  </div>
</template>
