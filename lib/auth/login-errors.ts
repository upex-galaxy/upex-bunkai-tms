// The full `?error=<code>` vocabulary the /login page renders as a toast.
//
// OAuth owns its own codes (`lib/auth/oauth.ts`, BK-3 / ADR-0008); this module
// adds the email rails and merges both into the single map the toast reads, so a
// code can never be emitted by a route without a matching message existing.
//
// BK-400: that guarantee is the point. `otp_exchange_failed` was emitted by
// `/auth/callback` and consumed by nothing — a failed magic-link sign-in dropped
// the user on a bare login page with no explanation at all, while the raw
// Supabase SDK error sat unread in the query string.

import type { OAuthErrorCode } from './oauth';
import { OAUTH_ERROR_TOASTS } from './oauth';

export type MagicLinkErrorCode = 'magic_link_invalid' | 'otp_exchange_failed' | 'missing_code';

export type LoginErrorCode = OAuthErrorCode | MagicLinkErrorCode;

interface LoginToast {
  title: string
  description: string
  /** destructive → Sonner `toast.error`; default → `toast` (neutral). */
  variant: 'destructive' | 'default'
}

const MAGIC_LINK_ERROR_TOASTS: Record<MagicLinkErrorCode, LoginToast> = {
  magic_link_invalid: {
    title: 'That sign-in link no longer works',
    description:
      'Links expire quickly and can only be used once. Request a new one and open it from this device.',
    variant: 'default',
  },
  // Retained so a link issued before the BK-400 fix — or any stray PKCE
  // round-trip — still explains itself instead of failing silently.
  otp_exchange_failed: {
    title: 'That sign-in link no longer works',
    description: 'Request a new link and open it from this device.',
    variant: 'default',
  },
  missing_code: {
    title: 'Incomplete sign-in link',
    description: 'The link was missing part of its address. Request a new one.',
    variant: 'default',
  },
};

export const LOGIN_ERROR_TOASTS: Record<LoginErrorCode, LoginToast> = {
  ...OAUTH_ERROR_TOASTS,
  ...MAGIC_LINK_ERROR_TOASTS,
};
