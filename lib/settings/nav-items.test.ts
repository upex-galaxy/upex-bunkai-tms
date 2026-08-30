import type { MemberRole } from '@lib/types';
import {
  isSettingsNavItemActive,
  SETTINGS_NAV_AVAILABLE,
  SETTINGS_NAV_COMING_SOON,
  settingsNavItemsForRole,
} from '@lib/settings/nav-items';
import { describe, expect, test } from 'bun:test';

// BK-87 — Settings nav shape + active-state logic (TC-AC3: Settings reachable
// from account menu + direct URL). SettingsNav.tsx renders these lists as
// links (available) vs. non-focusable disabled entries (coming soon); this
// suite covers the pure decision, since there is no React-rendering harness
// in this repo (no .test.tsx files exist anywhere in the codebase).

describe('SETTINGS_NAV_AVAILABLE / SETTINGS_NAV_COMING_SOON', () => {
  test('every available item has a real href (renderable as a link)', () => {
    for (const item of SETTINGS_NAV_AVAILABLE) {
      expect(item.href).not.toBeNull();
    }
  });

  test('every coming-soon item has href: null (never a link, skipped by Tab)', () => {
    for (const item of SETTINGS_NAV_COMING_SOON) {
      expect(item.href).toBeNull();
    }
  });

  test('account is the first available item (hub landing target)', () => {
    expect(SETTINGS_NAV_AVAILABLE[0]?.id).toBe('account');
    expect(SETTINGS_NAV_AVAILABLE[0]?.href).toBe('/settings/account');
  });

  // BK-213 — Notifications moved from "coming soon" to "available"
  // (master-design-plan.md §4.13: "Notifications now LIVE in the nav").
  test('notifications is now available, not coming soon', () => {
    expect(SETTINGS_NAV_AVAILABLE.find(item => item.id === 'notifications')?.href).toBe('/settings/notifications');
    expect(SETTINGS_NAV_COMING_SOON.some(item => item.id === 'notifications')).toBe(false);
  });

  // BK-229 — Billing moved from "coming soon" to "available"
  // (master-design-plan.md §4.15: "Billing" now LIVE in the nav).
  test('billing is now available, not coming soon', () => {
    expect(SETTINGS_NAV_AVAILABLE.find(item => item.id === 'billing')?.href).toBe('/settings/billing');
    expect(SETTINGS_NAV_COMING_SOON.some(item => item.id === 'billing')).toBe(false);
  });
});

// BK-740 — REGRESSION. Billing shipped (BK-229) as an ungated entry in
// SETTINGS_NAV_AVAILABLE, so a workspace `member` saw the nav link, clicked
// it, and hit a dead end: `bunkai_workspace_billing_overview`'s step-0
// admin gate returns null and the route answers a uniform 404. AC9 of BK-229
// ("Billing section is not offered to her") held at the CONTENT level but
// never at the NAVIGATION level. These assertions run through the real
// exported `settingsNavItemsForRole`, which filters the real exported
// `SETTINGS_NAV_AVAILABLE` — no fixture array is injected, so the production
// data and the production filter are both under test.
describe('settingsNavItemsForRole (BK-740 — Billing nav gate)', () => {
  const ids = (role: MemberRole | null) => settingsNavItemsForRole(role).map(item => item.id);

  test('a member does NOT get the Billing entry (the reported dead end)', () => {
    expect(ids('member')).not.toContain('billing');
  });

  test('a viewer does NOT get the Billing entry', () => {
    expect(ids('viewer')).not.toContain('billing');
  });

  test('a caller with no active workspace role does NOT get the Billing entry', () => {
    expect(ids(null)).not.toContain('billing');
  });

  // The allowed set mirrors `bunkai_is_workspace_admin`
  // (0005_rls_helpers.sql: role in ('admin','owner')) — the same gate the
  // Billing RPC runs at step 0, so nav visibility and content access agree.
  test('an owner DOES get the Billing entry', () => {
    expect(ids('owner')).toContain('billing');
  });

  test('an admin DOES get the Billing entry', () => {
    expect(ids('admin')).toContain('billing');
  });

  test('the Billing entry keeps its real href for the roles that can see it', () => {
    expect(settingsNavItemsForRole('admin').find(item => item.id === 'billing')?.href)
      .toBe('/settings/billing');
  });

  test('ungated personal sections stay visible to every role, including none', () => {
    for (const role of ['owner', 'admin', 'member', 'viewer', null] as const) {
      expect(ids(role)).toEqual(expect.arrayContaining(['account', 'tokens', 'workspaces', 'notifications']));
    }
  });

  test('the gate only ever removes items — never reorders or invents them', () => {
    const full = SETTINGS_NAV_AVAILABLE.map(item => item.id);
    for (const role of ['owner', 'admin', 'member', 'viewer', null] as const) {
      expect(ids(role)).toEqual(full.filter(id => ids(role).includes(id)));
    }
    expect(ids('owner')).toEqual(full);
  });
});

describe('isSettingsNavItemActive', () => {
  test('exact route match is active', () => {
    expect(isSettingsNavItemActive('/settings/account', '/settings/account')).toBe(true);
  });

  test('nested sub-route is active (aria-current="page")', () => {
    expect(isSettingsNavItemActive('/settings/account/anything', '/settings/account')).toBe(true);
  });

  test('a different live section is not active', () => {
    expect(isSettingsNavItemActive('/settings/tokens', '/settings/account')).toBe(false);
  });

  test('coming-soon items (href: null) are never active', () => {
    expect(isSettingsNavItemActive('/settings/members', null)).toBe(false);
  });

  test('a route that merely starts with the same characters is not a false match', () => {
    expect(isSettingsNavItemActive('/settings/accountability', '/settings/account')).toBe(false);
  });
});
