import type { NotificationRpcRow } from '@app/api/v1/workspaces/[id]/notifications/response';
import { groupNotificationsByDay } from '@lib/notifications/group-by-day';
import { describe, expect, test } from 'bun:test';

// BK-209 (review fix) — `groupNotificationsByDay`'s day-bucketing boundaries.
// `now` is injected so every case is deterministic (no real-clock flakiness),
// mirroring relative-time.test.ts's own approach.

function makeNotification(overrides: Partial<NotificationRpcRow> & { id: string, created_at: string }): NotificationRpcRow {
  return {
    workspace_id: 'ws-1',
    event_type: 'run.finished',
    entity_type: 'run',
    entity_id: 'run-1',
    payload: {},
    read_at: null,
    entity_available: true,
    ...overrides,
  };
}

describe('groupNotificationsByDay', () => {
  // Local midday anchor for "now" — keeps Today/Yesterday boundaries
  // unambiguous regardless of the host machine's timezone offset.
  const now = new Date(2026, 7, 3, 12, 0, 0);

  test('empty input returns no groups', () => {
    expect(groupNotificationsByDay([], now)).toEqual([]);
  });

  test('same-day items are grouped under "Today"', () => {
    const items = [
      makeNotification({ id: 'a', created_at: new Date(2026, 7, 3, 11, 0, 0).toISOString() }),
      makeNotification({ id: 'b', created_at: new Date(2026, 7, 3, 8, 0, 0).toISOString() }),
    ];

    const groups = groupNotificationsByDay(items, now);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].items.map(i => i.id)).toEqual(['a', 'b']);
  });

  test('yesterday\'s items are grouped under "Yesterday"', () => {
    const items = [
      makeNotification({ id: 'c', created_at: new Date(2026, 7, 2, 9, 0, 0).toISOString() }),
    ];

    const groups = groupNotificationsByDay(items, now);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Yesterday');
  });

  test('older items get a calendar-date label ("Mon D")', () => {
    const items = [
      makeNotification({ id: 'd', created_at: new Date(2026, 6, 28, 9, 0, 0).toISOString() }),
    ];

    const groups = groupNotificationsByDay(items, now);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Jul 28');
  });

  test('groups newest-first, preserving each item\'s incoming order within its group', () => {
    const items = [
      makeNotification({ id: 'today-1', created_at: new Date(2026, 7, 3, 10, 0, 0).toISOString() }),
      makeNotification({ id: 'yesterday-1', created_at: new Date(2026, 7, 2, 20, 0, 0).toISOString() }),
      makeNotification({ id: 'yesterday-2', created_at: new Date(2026, 7, 2, 9, 0, 0).toISOString() }),
      makeNotification({ id: 'older-1', created_at: new Date(2026, 6, 28, 12, 0, 0).toISOString() }),
    ];

    const groups = groupNotificationsByDay(items, now);

    expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday', 'Jul 28']);
    expect(groups[1].items.map(i => i.id)).toEqual(['yesterday-1', 'yesterday-2']);
  });

  test('boundary: local midnight today is "Today", 23:59:59.999 the prior day is "Yesterday"', () => {
    const items = [
      makeNotification({ id: 'midnight-today', created_at: new Date(2026, 7, 3, 0, 0, 0, 0).toISOString() }),
      makeNotification({ id: 'end-of-yesterday', created_at: new Date(2026, 7, 2, 23, 59, 59, 999).toISOString() }),
    ];

    const groups = groupNotificationsByDay(items, now);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ label: 'Today', items: [items[0]] });
    expect(groups[1]).toEqual({ label: 'Yesterday', items: [items[1]] });
  });
});
