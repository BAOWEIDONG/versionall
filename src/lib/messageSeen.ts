/**
 * 学员端消息中心「已读追踪」持久化。
 *
 * 语义：
 * - `ranks`：各营期上次访问时的排名（排名动态未读 = 排名相对该记录发生变化）。
 * - `lastSystemSeenAt`：学员最近一次查看消息中心的起点时刻(epoch ms)。系统通知(奖励领取/兑换/发货)
 *   的事件时间晚于该时刻才可能未读——这是跨页面「消息 Tab 角标」与消息页内「系统通知」红点共用的基线。
 * - `readNotif`：已点开读过的系统通知 id(self 阵列)。点开某条系统通知即加入，仅读不新增清零；
 *   系统通知未读 = 事件晚于 lastSystemSeenAt 基线 且 该通知 id 不在 readNotif 中。
 *
 * userId 内聚：结构为 { [userId]: { ranks, lastSystemSeenAt, readNotif } }。
 */
export const MSG_SEEN_KEY = 'camp_msg_seen';

export interface MsgSeenState {
  /** 按营期记录上次查看时的排名 */
  ranks: Record<string, number>;
  /** 最近一次查看消息中心的时间基线(epoch ms)；0 = 从未查看（首见时既有系统通知均未读） */
  lastSystemSeenAt: number;
  /** 已点开读过的系统通知 id（读一条加一条，不因只看列表而清零） */
  readNotif: string[];
}

export function loadMsgSeenState(userId: string): MsgSeenState {
  if (!userId) return { ranks: {}, lastSystemSeenAt: 0, readNotif: [] };
  try {
    const raw = localStorage.getItem(MSG_SEEN_KEY);
    if (!raw) return { ranks: {}, lastSystemSeenAt: 0, readNotif: [] };
    const all = JSON.parse(raw);
    const s = all[userId] || {};
    return {
      ranks: s.ranks || {},
      lastSystemSeenAt: (s.lastSystemSeenAt as number) || 0,
      readNotif: Array.isArray(s.readNotif) ? s.readNotif : [],
    };
  } catch {
    return { ranks: {}, lastSystemSeenAt: 0, readNotif: [] };
  }
}

export function saveMsgSeenState(userId: string, next: Partial<MsgSeenState>) {
  if (!userId) return;
  try {
    const raw = localStorage.getItem(MSG_SEEN_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const prev = all[userId] || { ranks: {}, lastSystemSeenAt: 0, readNotif: [] };
    all[userId] = {
      ranks: next.ranks ?? prev.ranks,
      lastSystemSeenAt: next.lastSystemSeenAt ?? prev.lastSystemSeenAt,
      readNotif: next.readNotif ?? (prev.readNotif || []),
    };
    localStorage.setItem(MSG_SEEN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * 系统通知（奖励领取/发货、积分兑换/发货）是否未读：事件时间晚于最近查看起点 且 该通知未被点开读过。
 * 不同于批注消息( commentRead 字段)，系统通知无记录级已读，用「时间基线 + 单条读记」双条件判。
 */
export function systemMsgUnread(seen: MsgSeenState, dateStr: string | undefined | null, notifId?: string): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t) || t <= seen.lastSystemSeenAt) return false;
  if (notifId && seen.readNotif?.includes(notifId)) return false;
  return true;
}