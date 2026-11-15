import { isDeleteConfirmEnabled } from '@lib/account/delete-workspace';
import { describe, expect, test } from 'bun:test';

// BK-512 AC-04 / BK-1918 — type-to-confirm gate for DeleteWorkspaceModal.
// Unlike Leave (BK-90 trims the typed value), Delete compares it EXACTLY:
// any difference from the workspace name, whitespace padding included,
// keeps the confirming action unavailable.

describe('isDeleteConfirmEnabled', () => {
  test('exact match -> enabled', () => {
    expect(isDeleteConfirmEnabled('UPEX Core', 'UPEX Core')).toBe(true);
  });

  test.each([
    ['leading space', ' UPEX Core'],
    ['trailing space', 'UPEX Core '],
    ['leading and trailing spaces', ' UPEX Core '],
    ['padded with tabs/newline', '\tUPEX Core\n'],
  ])('whitespace-padded name (%s) -> disabled', (_label, typed) => {
    expect(isDeleteConfirmEnabled(typed, 'UPEX Core')).toBe(false);
  });

  test('case mismatch -> disabled', () => {
    expect(isDeleteConfirmEnabled('upex core', 'UPEX Core')).toBe(false);
  });

  test('partial/prefix match -> disabled', () => {
    expect(isDeleteConfirmEnabled('UPEX Cor', 'UPEX Core')).toBe(false);
  });

  test('empty input -> disabled', () => {
    expect(isDeleteConfirmEnabled('', 'UPEX Core')).toBe(false);
  });
});
