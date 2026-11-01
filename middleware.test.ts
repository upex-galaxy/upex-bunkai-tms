import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { isProtected, isPublic, PROTECTED_PREFIXES } from '@/middleware';

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

  // BK-255 — /home is the landing route for every signed-in member
  // (`app/page.tsx` redirects there), so the app's front door has to sit behind
  // the same edge gate as every other (app) route. The page's own getUser()
  // check is defense in depth, not the gate.
  test('/home is protected (BK-255)', () => {
    expect(isProtected('/home')).toBe(true);
  });

  test('public routes stay unprotected', () => {
    expect(isProtected('/login')).toBe(false);
    expect(isProtected('/')).toBe(false);
  });

  test('a route that merely starts with the same characters is not a false match', () => {
    expect(isProtected('/settingsomething')).toBe(false);
    expect(isProtected('/activitysomething')).toBe(false);
    expect(isProtected('/homepage')).toBe(false);
  });

  test('PROTECTED_PREFIXES includes /settings exactly once', () => {
    expect(PROTECTED_PREFIXES.filter(p => p === '/settings')).toHaveLength(1);
  });

  test('PROTECTED_PREFIXES includes /activity exactly once', () => {
    expect(PROTECTED_PREFIXES.filter(p => p === '/activity')).toHaveLength(1);
  });

  test('PROTECTED_PREFIXES includes /home exactly once', () => {
    expect(PROTECTED_PREFIXES.filter(p => p === '/home')).toHaveLength(1);
  });
});

// BK-1449 — every top-level route under the authenticated `(app)` shell sits
// behind the edge gate. `/atcs` shipped outside PROTECTED_PREFIXES and served
// its shell to signed-out visitors; this suite reads the route directories
// from disk so a new top-level (app) route cannot ship ungated again.
const APP_SHELL_DIR = join(import.meta.dir, 'app', '(app)');

// Next.js URL segments under a directory: route groups `(x)` are transparent
// (their children are URL segments of the parent), private `_x` folders and
// parallel-route `@x` slots never produce a URL segment.
function topLevelSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap((entry) => {
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
        return topLevelSegments(join(dir, entry.name));
      }
      if (entry.name.startsWith('_') || entry.name.startsWith('@')) {
        return [];
      }
      return [entry.name];
    });
}

function requiresAuth(pathname: string): boolean {
  return !isPublic(pathname) && isProtected(pathname);
}

describe('every top-level (app) route is gated (BK-1449)', () => {
  const segments = topLevelSegments(APP_SHELL_DIR);

  test('the (app) shell has top-level routes to check', () => {
    expect(segments.length).toBeGreaterThan(0);
  });

  test.each(segments)('/%s and its children require a session', (segment) => {
    // A dynamic top-level segment cannot be expressed as a prefix; it needs a
    // deliberate gate design, so it fails here instead of passing unchecked.
    expect(segment.startsWith('[')).toBe(false);
    expect(requiresAuth(`/${segment}`)).toBe(true);
    expect(requiresAuth(`/${segment}/child`)).toBe(true);
  });

  test('/atcs is protected', () => {
    expect(requiresAuth('/atcs')).toBe(true);
    expect(requiresAuth('/atcs/anything')).toBe(true);
    expect(requiresAuth('/atcsomething')).toBe(false);
  });

  test('/workspaces/<id>/members is protected', () => {
    expect(requiresAuth('/workspaces/3f9c2a1e-0000-4000-8000-000000000000/members')).toBe(true);
  });

  // `app/workspaces/[id]/restore` lives outside the (app) shell on purpose
  // (BK-512): the deletion-receipt email lands a signed-out owner there, and
  // the page itself resolves the session before offering the restore.
  test('the workspace restore landing stays public', () => {
    expect(requiresAuth('/workspaces/3f9c2a1e-0000-4000-8000-000000000000/restore')).toBe(false);
    expect(requiresAuth('/workspaces/3f9c2a1e-0000-4000-8000-000000000000/restore/')).toBe(false);
  });

  test('the restore exception does not open its neighbours', () => {
    expect(requiresAuth('/workspaces/3f9c2a1e-0000-4000-8000-000000000000/restore/extra')).toBe(true);
    expect(requiresAuth('/workspaces/a/b/restore')).toBe(true);
    expect(requiresAuth('/workspaces/restore')).toBe(true);
  });
});
