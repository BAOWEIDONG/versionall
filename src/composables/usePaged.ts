/**
 * usePaged 前端分页 composable
 *
 * 纯前端 demo（无后端）下模拟后端分页：长列表默认只渲染前 pageSize 条，
 * 滚动到底/点「加载更多」再取下一批。生产环境由后端做数据分页，前端换成分页参数即可。
 *
 * 用法：
 *   const { items, hasMore, total, loadMore, reset } = usePaged(computedRefOfFullList, 20);
 *   模板：<template v-for="it in items">…</template>，末尾 v-if="hasMore" 显示「加载更多(剩 N)」。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';

export function usePaged<T>(
  source: ComputedRef<T[]> | Ref<T[]> | (() => T[]),
  pageSize = 20,
) {
  const list = typeof source === 'function' ? computed(source) : source;
  const limit = ref(pageSize);

  const items = computed(() => list.value.slice(0, limit.value));
  const hasMore = computed(() => limit.value < list.value.length);
  const total = computed(() => list.value.length);
  const remaining = computed(() => Math.max(0, list.value.length - limit.value));

  const loadMore = () => { limit.value += pageSize; };
  const reset = () => { limit.value = pageSize; };

  return { items, hasMore, total, remaining, loadMore, reset };
}