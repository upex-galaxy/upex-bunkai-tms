// Settings hub nav — pure data + logic (BK-87), framework-agnostic per Stack
// §10. `SettingsNav.tsx` renders these lists; extracting them here keeps the
// "which items are live vs. soon" decision unit-testable without a DOM.

export interface SettingsNavItem {
  id: string
  label: string
  // Real route for a shipped section. `null` marks a "coming soon" entry —
  // no href, no link, not focusable (TD10: Members/Notifications/Billing/
  // Environments stay inert nav entries; a stray deep link 404s, a known gap).
  href: string | null
}

export const SETTINGS_NAV_AVAILABLE: SettingsNavItem[] = [
  { id: 'account', label: 'Account', href: '/settings/account' },
  { id: 'tokens', label: 'Tokens', href: '/settings/tokens' },
  { id: 'workspaces', label: 'Workspaces', href: '/settings/workspaces' },
];

export const SETTINGS_NAV_COMING_SOON: SettingsNavItem[] = [
  { id: 'members', label: 'Members', href: null },
  { id: 'notifications', label: 'Notifications', href: null },
  { id: 'billing', label: 'Billing', href: null },
  { id: 'environments', label: 'Environments', href: null },
];

// Whether a live nav item should render `aria-current="page"` for the given
// pathname (TC-AC3). Matches the exact route or any nested sub-route.
// Coming-soon items (`href: null`) are never "active" — they are not links.
export function isSettingsNavItemActive(pathname: string, href: string | null): boolean {
  if (!href) {
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
