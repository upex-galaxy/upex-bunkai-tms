import type { AuthChangeEvent } from '@supabase/supabase-js';

// Multi-tab / multi-device sign-out reaction (BK-86, Scenario D).
//
// supabase.auth broadcasts auth events to every tab via localStorage. When a
// session is terminated anywhere, each tab receives a `SIGNED_OUT` event; this
// pure helper decides whether that event should drive a redirect to /login.
// Extracted from the React provider so the decision is unit-testable without a
// DOM renderer. `replace` is the only side-effect, injected by the caller
// (router.replace in the provider) — and it is idempotent: replacing to /login
// while already on /login is a no-op in Next's router.
export function handleAuthChangeRedirect(
  event: AuthChangeEvent,
  replace: (path: string) => void,
): void {
  if (event === 'SIGNED_OUT') {
    replace('/login');
  }
}
