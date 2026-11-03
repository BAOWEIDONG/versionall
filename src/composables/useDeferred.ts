/**
 * useDeferred 延迟计算 hooks
 *
 * 用途：把「首次进入要同步跑全校聚合/重循环」的 computed 改成「先渲染 UI(骨架屏)，
 * 等首帧画完再用空闲时间后台算」，避免页面首进卡顿。
 *
 * 用法：
 *   const { data, done, refresh } = useDeferred(() => heavyComputed(...));
 *   模板：<template v-if="done">用 data</template> <skeleton v-else/>
 *   refresh() 可在 onActivated / 数据变化后手动重算。
 */
import { ref, shallowRef, onActivated, type Ref, type ShallowRef } from 'vue';

export function useDeferred<T>(compute: () => T): {
  data: ShallowRef<T | null>;
  done: Ref<boolean>;
  refresh: () => void;
} {
  const data = shallowRef<T | null>(null);
  const done = ref(false);
  let timer: number | ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    // 首帧后（空闲或下一 tick）再算，不阻塞首次绘制
    const cb = () => {
      data.value = compute();
      done.value = true;
    };
    const ric = (window as any).requestIdleCallback;
    if (ric) {
      timer = ric(cb, { timeout: 1200 });
    } else {
      timer = setTimeout(cb, 0);
    }
  };

  // 进入即安排计算
  onActivated(run);

  return {
    data,
    done,
    // 手动重算（重新进入时若需刷新）
    refresh: () => {
      if (timer !== undefined) {
        if (typeof timer === 'number' && (window as any).cancelIdleCallback) {
          (window as any).cancelIdleCallback(timer);
        } else {
          clearTimeout(timer as ReturnType<typeof setTimeout>);
        }
        timer = undefined;
      }
      done.value = false;
      data.value = null;
      run();
    },
  };
}