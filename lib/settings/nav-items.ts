// Settings hub nav — pure data + logic (BK-87), framework-agnostic per Stack
// §10. `SettingsNav.tsx` renders these lists; extracting them here keeps the
// "which items are live vs. soon" decision unit-testable without a DOM.

import type { MemberRole } from '@lib/types';

export interface SettingsNavItem {
  id: string
  label: string
  // Real route for a shipped section. `null` marks a "coming soon" entry —
  // no href, no link, not focusable (TD10: Members/Notifications/Billing/
  // Environments stay inert nav entries; a stray deep link 404s, a known gap).
  href: string | null
  // BK-740 — roles allowed to SEE this entry. `undefined` means "everyone
  // with access to /settings" (the default for personal sections). This is a
  // NAVIGATION-visibility filter only: the server-side gate on the section's
  // own route stays the real access control, unchanged.
  roles?: readonly MemberRole[]
}

// BK-740 — mirrors `bunkai_is_workspace_admin` (migration 0005_rls_helpers.sql
// lines 52-67: `status = 'active' and role in ('admin','owner')`), the step-0
// gate of `bunkai_workspace_billing_overview`. Keeping the nav gate and the
// content gate on the same role set is what stops the two from drifting into
// a dead-end link again.
export const BILLING_NAV_ROLES: readonly MemberRole[] = ['owner', 'admin'];

export const SETTINGS_NAV_AVAILABLE: SettingsNavItem[] = [
  { id: 'account', label: 'Account', href: '/settings/account' },
  { id: 'tokens', label: 'Tokens', href: '/settings/tokens' },
  { id: 'workspaces', label: 'Workspaces', href: '/settings/workspaces' },
  // BK-213 — Notifications ships, moved out of "coming soon" (master-design-
  // plan.md §4.13: "Notifications now LIVE in the nav").
  { id: 'notifications', label: 'Notifications', href: '/settings/notifications' },
  // BK-229 — Billing ships, moved out of "coming soon" (master-design-
  // plan.md §4.15: "Billing" now LIVE in the nav").
  // BK-740 — owner/admin only. BK-229 AC9 ("Billing section is not offered to
  // her") was satisfied at the CONTENT level (the RPC's uniform null -> 404)
  // but never at the NAVIGATION level, so members saw the entry and clicked
  // into a dead end.
  { id: 'billing', label: 'Billing', href: '/settings/billing', roles: BILLING_NAV_ROLES },
];

export const SETTINGS_NAV_COMING_SOON: SettingsNavItem[] = [
  { id: 'members', label: 'Members', href: null },
  { id: 'environments', label: 'Environments', href: null },
];

// BK-740 — the available items a caller with `role` in the ACTIVE workspace
// may see. Reads `SETTINGS_NAV_AVAILABLE` directly (no injectable list) so a
// caller cannot bypass the real gate with its own array. `null`/`undefined`
// role (no active workspace, or no active membership row) sees only the
// ungated personal sections — the workspace-scoped ones would 404 anyway.
export function settingsNavItemsForRole(role: MemberRole | null | undefined): SettingsNavItem[] {
  return SETTINGS_NAV_AVAILABLE.filter(
    item => !item.roles || (role != null && item.roles.includes(role)),
  );
}

// Whether a live nav item should render `aria-current="page"` for the given
// pathname (TC-AC3). Matches the exact route or any nested sub-route.
// Coming-soon items (`href: null`) are never "active" — they are not links.
export function isSettingsNavItemActive(pathname: string, href: string | null): boolean {
  if (!href) {
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
