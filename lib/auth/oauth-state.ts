// Server-issued CSRF state for the OAuth sign-in flow (BK-3).
//
// Layered ON TOP of Supabase's PKCE code_verifier: the initiation route mints a
// random `state`, stores it in this httpOnly cookie, and echoes the same value
// through the provider round-trip via the `bkstate` query param on the callback
// URL. The callback rejects any mismatch with HTTP 403 before exchanging the
// code, satisfying the business rule "OAuth state MUST be validated
// server-side; mismatch → 403". See ADR-0008.

export const OAUTH_STATE_COOKIE = 'bk_oauth_state';

// Subset of the cookie options accepted by both `cookies().set()` (next/headers)
// and `NextResponse.cookies.set()`. Declared locally to avoid a fragile deep
// import from `next/dist/compiled/cookie`.
interface OAuthStateCookieOptions {
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
}

// 10 minutes — long enough for a human to clear a provider consent screen,
// short enough that a leaked/abandoned state token expires quickly.
const OAUTH_STATE_TTL_SECONDS = 600;

// 122 bits of entropy (UUID v4) is ample for a CSRF nonce.
export function generateOAuthState(): string {
  return crypto.randomUUID();
}

export function oauthStateCookieOptions(): OAuthStateCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax', // top-level GET navigation from the provider must carry it
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  };
}

// Constant-time comparison so a timing side-channel cannot leak how many
// leading characters of the issued state an attacker guessed correctly.
export function stateMatches(cookieValue: string | null | undefined, queryValue: string | null | undefined): boolean {
  if (typeof cookieValue !== 'string' || typeof queryValue !== 'string') {
    return false;
  }
  if (cookieValue.length === 0 || cookieValue.length !== queryValue.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < cookieValue.length; i++) {
    diff |= cookieValue.charCodeAt(i) ^ queryValue.charCodeAt(i);
  }
  return diff === 0;
}
