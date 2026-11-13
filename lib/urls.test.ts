import { isSafeInternalPath, safeInternalPath } from '@lib/urls';
import { describe, expect, test } from 'bun:test';

// BK-1827 — the open-redirect guard behind every `next` consumer (password and
// OTP login, OAuth start + callback, magic-link form + route).
describe('safeInternalPath', () => {
  test.each([
    ['/projects', '/projects'],
    ['/settings', '/settings'],
    ['/settings/workspaces?tab=members#invites', '/settings/workspaces?tab=members#invites'],
    ['/workspaces/abc/members', '/workspaces/abc/members'],
    ['/a/../settings', '/settings'],
  ])('honours the in-app path %p', (raw, expected) => {
    expect(safeInternalPath(raw)).toBe(expected);
  });

  test.each([
    // The three QA vectors from BK-1827 (TC37).
    ['/\\example.com'],
    ['/\t/example.com'],
    ['/\\/example.com'],
    // Variants of the same normalisation class.
    ['\\\\example.com'],
    ['/\n/example.com'],
    ['/\r/example.com'],
    ['/.//example.com'],
    ['/./\\example.com'],
    // Controls the old guard already handled.
    ['//example.com'],
    ['https://example.com'],
    ['javascript:alert(1)'],
    ['example.com'],
    [''],
  ])('falls back for %p', (raw) => {
    expect(safeInternalPath(raw)).toBe('/projects');
  });

  test('falls back for null and undefined, using the caller fallback', () => {
    expect(safeInternalPath(null)).toBe('/projects');
    expect(safeInternalPath(undefined, '/onboarding')).toBe('/onboarding');
  });

  test('never returns a value a browser could resolve to another origin', () => {
    const vectors = ['/\\example.com', '/\t/example.com', '/\\/example.com', '/.//example.com', '/%2F/example.com'];
    for (const raw of vectors) {
      const resolved = new URL(safeInternalPath(raw), 'https://staging-upexbunkai.vercel.app');
      expect(resolved.origin).toBe('https://staging-upexbunkai.vercel.app');
    }
  });
});

describe('isSafeInternalPath', () => {
  test('agrees with safeInternalPath', () => {
    expect(isSafeInternalPath('/settings')).toBe(true);
    expect(isSafeInternalPath('/\\example.com')).toBe(false);
    expect(isSafeInternalPath('//example.com')).toBe(false);
  });
});
