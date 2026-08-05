import type { NotificationRpcRow } from '@app/api/v1/workspaces/[id]/notifications/response';

// BK-209 (review fix) — buckets the already-sorted (newest-first, per
// `bunkai_list_notifications`'s `order by created_at desc, id desc`) notification
// list into day groups for the panel, per business-rules.md's design intent
// ("items grouped by day (Today, Yesterday, then dates)") and the refined
// AC1 scenario ("notifications are grouped by day as Today, Yesterday, then
// calendar dates"). Calendar-day boundaries read the recipient's local
// calendar day (`Date`'s local getters) — safe here because, like
// relative-time.ts, NotificationsPanel is 'use client' and fetches after
// mount, never part of the server-rendered first paint, so there is no
// hydration-mismatch risk (unlike RunnerView/ActivityView's deterministic-UTC
// timestamps).
//
// `now` is injectable, mirroring `formatRelativeTime`'s "inject the clock,
// don't fake globals" posture — keeps this unit-testable without faking the
// system clock.

export interface NotificationDayGroup {
  label: string
  items: NotificationRpcRow[]
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatCalendarDate(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function resolveDayLabel(iso: string, todayStart: number): string {
  const itemDate = new Date(iso);
  const dayDiff = Math.round((todayStart - startOfLocalDay(itemDate)) / DAY_MS);

  if (dayDiff === 0) {
    return 'Today';
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  return formatCalendarDate(itemDate);
}

// Buckets `items` (already sorted newest-first) into day groups. Preserves
// order: newest group first, items within a group keep their incoming
// (newest-first) order — relies on the caller's sort guarantee, so same-day
// items are always contiguous and never need re-sorting here.
export function groupNotificationsByDay(
  items: readonly NotificationRpcRow[],
  now: Date = new Date(),
): NotificationDayGroup[] {
  const todayStart = startOfLocalDay(now);
  const groups: NotificationDayGroup[] = [];

  for (const item of items) {
    const label = resolveDayLabel(item.created_at, todayStart);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup !== undefined && lastGroup.label === label) {
      lastGroup.items.push(item);
    }
    else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}
