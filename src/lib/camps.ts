import type { Camp } from '../types';

/** 将 "YYYY-MM-DD" 格式化为 "M.D" */
export function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 将 "YYYY-MM-DD" 格式化为 "YYYY-MM-DD"（保留完整年月日） */
export function fmtFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 营期日期区间展示，如 "2026-08-24 — 2026-09-20"，缺日期部分回退 "--" */
export function campDateRange(camp: Camp): string {
  if (!camp.startDate && !camp.endDate) return '--';
  const s = camp.startDate ? fmtFullDate(camp.startDate) : '--';
  const e = camp.endDate ? fmtFullDate(camp.endDate) : '--';
  return `${s} — ${e}`;
}

/**
 * 最新营期定义：优先「已开营」中开营时间最晚（= 距今天最近、且已开营）的一期；
 * 若全都还没开营，则取开营时间距今天最近（即将开营）的一期；无日期则视为最早。
 */
export function latestCamp(camps: Camp[]): Camp | null {
  if (camps.length === 0) return null;
  const now = Date.now();
  const ts = (c: Camp): number | null => {
    if (!c.startDate) return null;
    const t = new Date(c.startDate).getTime();
    return isNaN(t) ? null : t;
  };
  const dated = camps.filter((c) => ts(c) != null);
  // 已开营（开营时间 ≤ 今天）的一期，取其中开营时间最晚 = 距今天最近
  const started = dated.filter((c) => ts(c)! <= now);
  if (started.length > 0) {
    return [...started].sort((a, b) => ts(b)! - ts(a)!)[0];
  }
  // 都还没开营：取开营时间距今天最近的一场
  if (dated.length > 0) {
    return [...dated].sort((a, b) => Math.abs(ts(b)! - now) - Math.abs(ts(a)! - now))[0];
  }
  // 全无日期：退回原逻辑（无 startDate 视为最早）
  return [...camps].sort((a, b) => {
    const av = ts(a) ?? -Infinity;
    const bv = ts(b) ?? -Infinity;
    return bv - av;
  })[0];
}

/** 默认展示营期：优先最新营期，兜底第一个 */
export function latestOrFirst(camps: Camp[]): Camp | null {
  return latestCamp(camps) ?? camps[0] ?? null;
}

/** 默认展示营期 id：优先最新，兜底第一个；空返回 null */
export function latestOrFirstId(camps: Camp[]): string | null {
  return latestOrFirst(camps)?.id ?? null;
}

/** 营期默认天数（无日期配置时回退值） */
export const DEFAULT_CAMP_DAYS = 28;

/**
 * 营期天数：优先由该营期配置的 startDate/endDate 计算；缺日期回退默认 28 天。
 * 口径与既有实现一致（CampReportView / store.getCampDays）：营期天数 = end - start，
 * 区间本身按起始日到结束日（如 28 天营期 start…end 相差 28）。
 */
export function campDaysOf(camp: { startDate?: string; endDate?: string } | null | undefined): number {
  if (camp?.startDate && camp?.endDate) {
    const start = new Date(camp.startDate);
    const end = new Date(camp.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) return diff;
    }
  }
  return DEFAULT_CAMP_DAYS;
}