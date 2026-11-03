import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { format } from 'date-fns';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 格式化日期为友好的标签：今天 / 昨天 / M月D日 周X
 * 使用字符串比较避免时区解析问题
 */
export function formatDateLabel(dateStr: string): string {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  if (dateStr === todayStr) return '今天';
  if (dateStr === yesterdayStr) return '昨天';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

export interface DateGroup<T> {
  date: string;
  label: string;
  records: T[];
}

/**
 * 按日期分组打卡记录的通用 composable
 *
 * - 将记录按 yyyy-MM-dd 分组，按日期倒序排列
 * - 提供展开/折叠状态管理，默认仅展开当天
 * - 支持任意带 date 字段的记录类型
 *
 * @param records  响应式记录列表（ref 或 computed）
 * @param options  配置项
 *   - defaultExpandToday: 是否默认展开当天（默认 true）
 *   - defaultExpandAll:   是否默认展开全部（默认 false，优先级高于 defaultExpandToday）
 */
export function useDateGrouping<T extends { date: string }>(
  records: Ref<T[]> | ComputedRef<T[]>,
  options?: { defaultExpandToday?: boolean; defaultExpandAll?: boolean },
) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const expandAll = options?.defaultExpandAll ?? false;
  const expandToday = options?.defaultExpandToday ?? true;

  // 使用 expandedDates（展开的日期集合），而非 collapsedDates
  // 这样可以精确控制"默认仅展开当天"
  const expandedDates = ref<Set<string>>(
    new Set(expandToday ? [todayStr] : []),
  );
  // 是否全部展开（独立标记，避免往 Set 塞通配符）
  const allExpanded = ref(expandAll);

  const grouped = computed<DateGroup<T>[]>(() => {
    const map = new Map<string, T[]>();
    for (const r of records.value) {
      const d = r.date.substring(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, recs]) => ({ date, label: formatDateLabel(date), records: recs }));
  });

  const toggleDate = (date: string) => {
    if (allExpanded.value) {
      // 从"全部展开"切换到"逐个控制"：收起当前点击的日期，其余保持展开
      allExpanded.value = false;
      const allDates = grouped.value.map((g) => g.date);
      expandedDates.value = new Set(allDates.filter((d) => d !== date));
      return;
    }
    const next = new Set(expandedDates.value);
    if (next.has(date)) {
      next.delete(date);
    } else {
      next.add(date);
    }
    expandedDates.value = next;
  };

  const isExpanded = (date: string): boolean => {
    return allExpanded.value || expandedDates.value.has(date);
  };

  return { grouped, toggleDate, isExpanded, expandedDates, allExpanded };
}
