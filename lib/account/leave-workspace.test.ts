import { isLeaveConfirmEnabled } from '@lib/account/leave-workspace';
import { describe, expect, test } from 'bun:test';

// BK-90 Slice B — type-to-confirm gate for LeaveWorkspaceModal (Decision 4).

describe('isLeaveConfirmEnabled', () => {
  test('exact match -> enabled', () => {
    expect(isLeaveConfirmEnabled('UPEX Core', 'UPEX Core')).toBe(true);
  });

  test('partial/prefix match -> disabled', () => {
    expect(isLeaveConfirmEnabled('UPEX Cor', 'UPEX Core')).toBe(false);
  });

  test('case mismatch -> disabled (case-sensitive, not case-insensitive)', () => {
    expect(isLeaveConfirmEnabled('upex core', 'UPEX Core')).toBe(false);
  });

  test('whitespace-trimmed exact match -> enabled (only the typed value is trimmed)', () => {
    expect(isLeaveConfirmEnabled('  UPEX Core  ', 'UPEX Core')).toBe(true);
  });

  test('empty input -> disabled', () => {
    expect(isLeaveConfirmEnabled('', 'UPEX Core')).toBe(false);
  });
});
