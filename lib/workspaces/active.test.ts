import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { describe, expect, test } from 'bun:test';

describe('resolveActiveWorkspaceId', () => {
  test('returns the cookie value when it is in the visible set', () => {
    expect(resolveActiveWorkspaceId('ws-b', ['ws-a', 'ws-b'])).toBe('ws-b');
  });

  test('falls back to the first visible workspace when the cookie points elsewhere', () => {
    expect(resolveActiveWorkspaceId('ws-x', ['ws-a', 'ws-b'])).toBe('ws-a');
  });

  test('falls back to the first visible workspace when the cookie is absent', () => {
    expect(resolveActiveWorkspaceId(null, ['ws-a', 'ws-b'])).toBe('ws-a');
    expect(resolveActiveWorkspaceId(undefined, ['ws-a', 'ws-b'])).toBe('ws-a');
  });

  test('an empty-string cookie is treated as absent', () => {
    expect(resolveActiveWorkspaceId('', ['ws-a', 'ws-b'])).toBe('ws-a');
  });

  test('returns null when the caller has no visible workspaces', () => {
    expect(resolveActiveWorkspaceId('ws-a', [])).toBeNull();
    expect(resolveActiveWorkspaceId(null, [])).toBeNull();
  });

  test('the fallback is element [0] (callers order by created_at — oldest wins)', () => {
    expect(resolveActiveWorkspaceId(null, ['oldest', 'newer', 'newest'])).toBe('oldest');
  });
});
