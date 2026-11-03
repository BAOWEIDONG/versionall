<script setup lang="ts">
/**
 * 性别卡通头像
 * 根据性别显示不同头像图片（PNG）
 */
import avatarMale from '../../assets/avatar-male.png';
import avatarFemale from '../../assets/avatar-female.png';

defineProps<{
  gender?: 'male' | 'female';
}>();
</script>

<template>
  <img loading="lazy" decoding="async" v-if="gender === 'male'" :src="avatarMale" alt="头像" class="w-full h-full object-cover rounded-full" />
  <img loading="lazy" decoding="async" v-else :src="avatarFemale" alt="头像" class="w-full h-full object-cover rounded-full" />
</template>
