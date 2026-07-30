import { formatRunDuration } from '@lib/runs/duration';
import { describe, expect, test } from 'bun:test';

// BK-37 — pure duration formatter for the Run history table. Covers each format
// band (seconds / minutes+seconds / hours+minutes), both band boundaries, the
// zero and null cases, and the defensive paths (unparseable input, clock skew).

const START = '2026-07-29T11:52:00.000Z';

// Build a finished_at `seconds` after START.
function after(seconds: number): string {
  return new Date(Date.parse(START) + seconds * 1000).toISOString();
}

describe('formatRunDuration', () => {
  test('returns null while the run has not finished', () => {
    expect(formatRunDuration(START, null)).toBeNull();
  });

  test('formats a zero-length duration as 0s', () => {
    expect(formatRunDuration(START, START)).toBe('0s');
  });

  test('formats a sub-minute duration as seconds only', () => {
    expect(formatRunDuration(START, after(12))).toBe('12s');
  });

  test('formats 59s (upper boundary of the seconds band)', () => {
    expect(formatRunDuration(START, after(59))).toBe('59s');
  });

  test('formats 60s as 1m 00s (lower boundary of the minutes band)', () => {
    expect(formatRunDuration(START, after(60))).toBe('1m 00s');
  });

  test('formats minutes + seconds', () => {
    expect(formatRunDuration(START, after(3 * 60 + 41))).toBe('3m 41s');
  });

  test('zero-pads the seconds half so the column stays aligned', () => {
    expect(formatRunDuration(START, after(3 * 60 + 5))).toBe('3m 05s');
  });

  test('formats 59m 59s (upper boundary of the minutes band)', () => {
    expect(formatRunDuration(START, after(59 * 60 + 59))).toBe('59m 59s');
  });

  test('formats exactly one hour as 1h 00m', () => {
    expect(formatRunDuration(START, after(3600))).toBe('1h 00m');
  });

  test('formats hours + zero-padded minutes, dropping seconds', () => {
    expect(formatRunDuration(START, after(3600 + 4 * 60 + 30))).toBe('1h 04m');
  });

  test('formats a multi-hour duration', () => {
    expect(formatRunDuration(START, after(12 * 3600 + 37 * 60))).toBe('12h 37m');
  });

  test('truncates sub-second remainders rather than rounding up', () => {
    expect(formatRunDuration(START, '2026-07-29T11:52:12.999Z')).toBe('12s');
  });

  test('floors a negative delta (clock skew) at zero', () => {
    expect(formatRunDuration(START, after(-30))).toBe('0s');
  });

  test('returns null for an unparseable started_at', () => {
    expect(formatRunDuration('not-a-date', after(30))).toBeNull();
  });

  test('returns null for an unparseable finished_at', () => {
    expect(formatRunDuration(START, 'not-a-date')).toBeNull();
  });

  test('accepts the Postgres offset serialization (+00:00, not Z)', () => {
    expect(formatRunDuration('2026-07-29T11:52:00+00:00', '2026-07-29T11:55:41+00:00')).toBe('3m 41s');
  });
});
