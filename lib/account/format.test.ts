import { formatLastActive, formatMemberSince } from '@lib/account/format';
import { describe, expect, test } from 'bun:test';

// BK-87 — Identity card date formatting (TC-AC1: identity card shows email +
// role; this covers the two supporting date fields, including the fallback
// path when `last_sign_in_at` is absent).

describe('formatMemberSince', () => {
  test('formats an ISO timestamp as a plain UTC date', () => {
    expect(formatMemberSince('2025-11-03T14:22:00.000Z')).toBe('2025-11-03');
  });

  test('null -> "Not available" fallback (no active workspace, Scenario B)', () => {
    expect(formatMemberSince(null)).toBe('Not available');
  });

  test('undefined -> "Not available" fallback', () => {
    expect(formatMemberSince(undefined)).toBe('Not available');
  });

  test('unparseable input -> "Not available" fallback, never throws', () => {
    expect(formatMemberSince('not-a-date')).toBe('Not available');
  });
});

describe('formatLastActive', () => {
  test('formats an ISO timestamp as UTC date + time', () => {
    expect(formatLastActive('2026-07-30T08:52:00.000Z')).toBe('2026-07-30 08:52 UTC');
  });

  test('null -> "Not available" fallback (lookup failed or user never signed in)', () => {
    expect(formatLastActive(null)).toBe('Not available');
  });

  test('undefined -> "Not available" fallback', () => {
    expect(formatLastActive(undefined)).toBe('Not available');
  });

  test('unparseable input -> "Not available" fallback, never throws', () => {
    expect(formatLastActive('not-a-date')).toBe('Not available');
  });
});
