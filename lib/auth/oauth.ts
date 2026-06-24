// OAuth provider + error vocabulary for the BK-3 sign-in flow. Pure, framework
// -agnostic helpers shared by the initiation route, the callback route, and the
// login error toast so the provider list and error codes cannot drift.

export const OAUTH_PROVIDERS = ['github', 'google'] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

// Error codes round-tripped to /login as `?error=<code>` and rendered by the
// login error toast. Kept as a const map so the route and the toast agree.
//
// Note: there is no `email_exists` code. Per the PO decision (2026-06-24) Supabase
// automatic identity linking is enabled, so a second provider presenting an
// already-registered verified email links to the same account and signs in
// seamlessly — it is not an error (AC-7). See ADR-0008.
export type OAuthErrorCode = 'oauth_denied' | 'oauth_state_mismatch' | 'oauth_init_failed';

interface OAuthToast {
  title: string
  description: string
  /** destructive → Sonner `toast.error`; default → `toast` (neutral). */
  variant: 'destructive' | 'default'
}

export const OAUTH_ERROR_TOASTS: Record<OAuthErrorCode, OAuthToast> = {
  oauth_denied: {
    title: 'Sign-in cancelled',
    description: 'You denied the consent screen. Try a different method — the magic-link option below also works.',
    variant: 'default',
  },
  oauth_state_mismatch: {
    title: 'Sign-in could not be verified',
    description: 'The sign-in request failed a security check. Please start again.',
    variant: 'destructive',
  },
  oauth_init_failed: {
    title: 'Could not start sign-in',
    description: 'The provider was unreachable. Try again, or use the magic-link option below.',
    variant: 'default',
  },
};
