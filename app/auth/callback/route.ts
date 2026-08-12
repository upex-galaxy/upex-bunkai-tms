import type { EmailOtpType } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { OAUTH_STATE_COOKIE, stateMatches } from '@lib/auth/oauth-state';
import { createClient } from '@lib/supabase/server';
import { safeInternalPath } from '@lib/urls';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Auth callback for BOTH rails:
//   • magic-link — Supabase redirects here with `?token_hash=...&type=magiclink`
//     after the user clicks the email link (no `bkstate`). Verified statelessly,
//     so the link works from any device. See the BK-400 note below.
//   • OAuth (BK-3) — the provider round-trips back here with `?code=...&bkstate=...`
//     (or `?error=access_denied` on consent denial). The `bkstate` query param
//     marks the OAuth branch and is validated against the `bk_oauth_state`
//     cookie (CSRF; mismatch → 403) BEFORE the code exchange. See ADR-0008.
//
// `next` is preserved through both initiation paths and defaults to `/projects`;
// the existing redirect chain then sends a first-time user (no workspace) on to
// `/onboarding`, and a returning user stays on `/projects`.

// BK-400: email-link types we accept for stateless verification. Anything else
// is refused rather than passed through to GoTrue, so a crafted `?type=` cannot
// widen this route beyond the email rails it is meant to serve.
const VERIFIABLE_OTP_TYPES = new Set<EmailOtpType>([
  'magiclink',
  'email',
  'signup',
  'invite',
  'recovery',
]);

function asVerifiableOtpType(value: string | null): EmailOtpType | null {
  return value !== null && VERIFIABLE_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const safeNext = safeInternalPath(searchParams.get('next'));

  // --- OAuth-only signals -------------------------------------------------
  const oauthState = searchParams.get('bkstate');
  const providerError = searchParams.get('error');

  // Provider-side failure (consent denied, or provider error before any code).
  // Checked first because a denied consent arrives with no `code`.
  if (providerError) {
    const code_ = providerError === 'access_denied' ? 'oauth_denied' : 'oauth_init_failed';
    return NextResponse.redirect(`${origin}/login?error=${code_}`);
  }

  // OAuth branch: validate the CSRF state token before doing anything else.
  if (oauthState !== null) {
    const cookieStore = await cookies();
    const issuedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? null;
    // One-time use: drop the cookie regardless of the outcome.
    cookieStore.delete(OAUTH_STATE_COOKIE);
    if (!stateMatches(issuedState, oauthState)) {
      return NextResponse.json({ code: 'OAUTH_STATE_MISMATCH' }, { status: 403 });
    }
  }

  // --- Magic-link rail (BK-400) -------------------------------------------
  // Stateless verification: `verifyOtp` posts the hash straight to GoTrue and
  // gets a session back, so nothing has to be remembered in this browser. That
  // is what makes the emailed link work on a phone when it was requested on a
  // laptop — the case the previous PKCE `exchangeCodeForSession` could never
  // serve, because it needed a code verifier cookie only the requesting browser
  // ever had.
  if (tokenHash) {
    const otpType = asVerifiableOtpType(searchParams.get('type'));
    if (!otpType) {
      return NextResponse.redirect(`${origin}/login?error=magic_link_invalid`);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });

    if (error) {
      // Expired, already used, or tampered with. All three are indistinguishable
      // to the user and all three mean "ask for a new link", so they share one
      // code — and unlike the raw SDK message this route used to leak into the
      // query string, this one is actually rendered (see `login-errors.ts`).
      return NextResponse.redirect(`${origin}/login?error=magic_link_invalid`);
    }

    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // OAuth exchange failures surface a graceful init error (AC-9). Same-email
    // cross-provider sign-ins are NOT an error — Supabase auto-links them (AC-7).
    // The magic-link rail keeps its original error flag.
    if (oauthState !== null) {
      return NextResponse.redirect(`${origin}/login?error=oauth_init_failed`);
    }
    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=otp_exchange_failed&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
