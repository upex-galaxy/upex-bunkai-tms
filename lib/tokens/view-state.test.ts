import { resolveTokensViewState } from '@lib/tokens/view-state';
import { describe, expect, test } from 'bun:test';

// BK-88 Slice A — token list view-state resolver (AC5: revoked tokens stay
// visible in the `list` state; AC7: retriable error; AC8: empty state guides
// first issuance). Mirrors `lib/account/workspaces.test.ts`'s coverage shape.

describe('resolveTokensViewState', () => {
  test('an error takes priority, even with a non-zero row count', () => {
    expect(resolveTokensViewState({ error: true, rowCount: 3 })).toBe('error');
  });

  test('zero rows with no error -> empty state', () => {
    expect(resolveTokensViewState({ error: false, rowCount: 0 })).toBe('empty');
  });

  test('one or more rows with no error -> list state', () => {
    expect(resolveTokensViewState({ error: false, rowCount: 1 })).toBe('list');
  });

  test('an error with zero rows still resolves to error, not empty', () => {
    expect(resolveTokensViewState({ error: true, rowCount: 0 })).toBe('error');
  });
});
