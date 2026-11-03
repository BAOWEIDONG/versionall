/**
 * 本机存储命名空间
 * ---------------------------------------------------------------------------
 * versionone / versiontwo / versionall 部署在同一域名（baoweidong.github.io）下，
 * localStorage 按「域名」共享，不按路径隔离。所有 key 必须带版本前缀，
 * 否则三个版本会互相污染：登录态、打卡数据、已读状态、排名快照都会串。
 *
 * 统一约定：versionall_ 前缀；新增 key 一律走 nsKey()，不要再写字面量。
 */
export const STORAGE_NS = 'versionall';

/** 生成带版本前缀的 storage key */
export function nsKey(key: string): string {
  return `${STORAGE_NS}_${key}`;
}
