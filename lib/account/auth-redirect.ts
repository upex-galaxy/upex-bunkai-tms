import type { AuthChangeEvent } from '@supabase/supabase-js';

// Multi-tab / multi-device sign-out reaction (BK-86, Scenario D) — and the
// initiating tab's OWN reaction (BK-176).
//
// supabase.auth broadcasts auth events to every tab via localStorage, so this
// fires in other tabs when a session is terminated elsewhere. But it ALSO
// fires, and fires FIRST, in the tab that itself called signOut(): supabase-js
// awaits every onAuthStateChange subscriber before signOut()'s own promise
// resolves (GoTrueClient#_removeSession -> _notifyAllSubscribers), so this
// handler runs before that tab's post-signOut() redirect ever executes.
//
// That ordering means a Next.js router.replace()/push() soft navigation here
// is guaranteed to race the initiating tab's own hard-navigation redirect
// (window.location.assign, per BK-3) — the soft client-side transition can
// silently fail to commit, leaving the signed-out UI on-screen until a manual
// reload (BK-176). This MUST stay a hard, full-page navigation so both tabs
// converge on the same reliable strategy. Extracted from the React provider
// so the decision is unit-testable without a DOM renderer.
export function handleAuthChangeRedirect(
  event: AuthChangeEvent,
  hardNavigate: (path: string) => void = (path) => { window.location.assign(path); },
): void {
  if (event === 'SIGNED_OUT') {
    hardNavigate('/login');
  }
}
