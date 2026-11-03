/**
 * useDebounced 防抖镜像
 *
 * 高频变化的源（打卡记录数组等）映射为一个延迟更新的只读镜像，
 * 供「重计算型 computed」使用：数据连续变化时只在停顿 delay 毫秒后重算一次，
 * 避免每次提交/批注触发全端缓存页面的同步重算风暴（打卡后卡顿的根治）。
 *
 * 说明：镜像值与源内容一致，只是更新时机延后；对实时性要求极高的轻量计算请继续直接用源。
 */
import { ref, watch, type Ref, type ComputedRef, onBeforeUnmount } from 'vue';

export function useDebounced<T>(
  source: Ref<T> | ComputedRef<T> | (() => T),
  delay = 300,
): Readonly<Ref<T>> {
  const get = typeof source === 'function' ? source : () => source.value;
  const debounced = ref(get()) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = watch(
    () => get(),
    (val) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { debounced.value = val; }, delay);
    },
  );

  onBeforeUnmount(() => {
    stop();
    if (timer) clearTimeout(timer);
  });

  return debounced;
}