import {
  isSettingsNavItemActive,
  SETTINGS_NAV_AVAILABLE,
  SETTINGS_NAV_COMING_SOON,
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
