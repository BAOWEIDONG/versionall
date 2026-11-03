import { computed } from 'vue';
import { useAppStore } from '../store/app';
import { latestOrFirstId } from './camps';

/**
 * 教练端底部 Tabbar 角标（各教练页面共用，口径一致）：
 * - unannotatedCount：「批注」tab 的待批注运动记录数 = 当前营期下未批注(coachComment 为空且 coachScore 为 null)的运动记录数
 */
export function useCoachCounts() {
  const store = useAppStore();
  // 统一取所选营期（未选则回落最近一期）
  const campId = computed(() => store.selectedCampId || latestOrFirstId(store.camps) || '');
  // 退营学员：与待批注列表 active-only 口径一致，角标不统计（否则出现清不掉的死计数）
  const disabledStudentIds = computed(() => new Set(store.accounts.filter((a) => a.role === 'student' && a.active === false).map((a) => a.id)));

  const unannotatedCount = computed(() => {
    if (!campId.value) return 0;
    return store
      .getCampExerciseRecords(campId.value)
      .filter((r) => !r.coachComment && r.coachScore == null && !disabledStudentIds.value.has(r.studentId)).length;
  });

  return { unannotatedCount };
}