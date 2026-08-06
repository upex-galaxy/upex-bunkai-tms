import { formatRelativeTime } from '@lib/notifications/relative-time';
import { describe, expect, test } from 'bun:test';

// BK-209 (Slice 3: UI) — formatRelativeTime's bucket boundaries. `now` is
// injected so every case is deterministic (no real-clock flakiness).

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');

  test('under a minute reads "just now"', () => {
    expect(formatRelativeTime('2026-08-03T11:59:30.000Z', now)).toBe('just now');
  });

  test('minutes ago', () => {
    expect(formatRelativeTime('2026-08-03T11:56:00.000Z', now)).toBe('4m ago');
    expect(formatRelativeTime('2026-08-03T11:34:00.000Z', now)).toBe('26m ago');
  });

  test('hours ago', () => {
    expect(formatRelativeTime('2026-08-03T11:00:00.000Z', now)).toBe('1h ago');
    expect(formatRelativeTime('2026-08-03T07:00:00.000Z', now)).toBe('5h ago');
  });

  test('days ago', () => {
    expect(formatRelativeTime('2026-07-28T12:00:00.000Z', now)).toBe('6d ago');
  });

  test('a future timestamp (clock skew) clamps to "just now" instead of a negative value', () => {
    expect(formatRelativeTime('2026-08-03T12:05:00.000Z', now)).toBe('just now');
  });
});
