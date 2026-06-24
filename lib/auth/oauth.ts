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
export type OAuthErrorCode = 'oauth_denied' | 'oauth_state_mismatch' | 'email_exists' | 'oauth_init_failed';

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
  email_exists: {
    title: 'Account already exists',
    description: 'This email is registered via a different provider. Contact support to link accounts.',
    variant: 'destructive',
  },
  oauth_init_failed: {
    title: 'Could not start sign-in',
    description: 'The provider was unreachable. Try again, or use the magic-link option below.',
    variant: 'default',
  },
};

// Minimal shape of a Supabase auth error we classify on. Avoids importing the
// SDK type into a pure module.
interface ClassifiableError {
  code?: string | null
  message?: string | null
  status?: number | null
}

// Cross-provider same-email collision (AC-7). Supabase surfaces this when
// automatic identity linking is disabled and a second provider presents an
// email already bound to another identity. The exact code/message is
// config/version dependent, so we match defensively on the known signals and
// fall back to a generic init failure otherwise. Tunable after live E2E.
export function mapOAuthExchangeError(error: ClassifiableError | null | undefined): Extract<OAuthErrorCode, 'email_exists' | 'oauth_init_failed'> {
  if (!error) {
    return 'oauth_init_failed';
  }
  const haystack = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  const collisionSignals = ['already', 'exists', 'identity_already', 'email_exists', 'duplicate'];
  if (collisionSignals.some(signal => haystack.includes(signal))) {
    return 'email_exists';
  }
  return 'oauth_init_failed';
}
