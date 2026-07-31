import { describe, expect, test } from 'bun:test';
import { isProtected, PROTECTED_PREFIXES } from '@/middleware';

// BK-87 — auth-guard gate for /settings (TC-AC4: unauthenticated access
// redirects to /login?next=<path>). middleware.ts runs this check before any
// React render; this suite proves /settings joined the protected list without
// disturbing the pre-existing /projects and /onboarding gates.

describe('isProtected', () => {
  test('/settings is protected (BK-87)', () => {
    expect(isProtected('/settings')).toBe(true);
  });

  test('nested /settings routes are protected', () => {
    expect(isProtected('/settings/account')).toBe(true);
    expect(isProtected('/settings/tokens')).toBe(true);
    expect(isProtected('/settings/workspaces')).toBe(true);
  });

  test('pre-existing gates are unchanged', () => {
    expect(isProtected('/projects')).toBe(true);
    expect(isProtected('/onboarding')).toBe(true);
  });

  test('/activity is protected (BK-49)', () => {
    expect(isProtected('/activity')).toBe(true);
  });

  test('public routes stay unprotected', () => {
    expect(isProtected('/login')).toBe(false);
    expect(isProtected('/')).toBe(false);
  });

  test('a route that merely starts with the same characters is not a false match', () => {
    expect(isProtected('/settingsomething')).toBe(false);
    expect(isProtected('/activitysomething')).toBe(false);
  });

  test('PROTECTED_PREFIXES includes /settings exactly once', () => {
    expect(PROTECTED_PREFIXES.filter(p => p === '/settings')).toHaveLength(1);
  });

  test('PROTECTED_PREFIXES includes /activity exactly once', () => {
    expect(PROTECTED_PREFIXES.filter(p => p === '/activity')).toHaveLength(1);
  });
});
