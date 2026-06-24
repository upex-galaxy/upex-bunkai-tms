import type { NextRequest } from 'next/server';
import { OAUTH_STATE_COOKIE, stateMatches } from '@lib/auth/oauth-state';
import { createClient } from '@lib/supabase/server';
import { safeInternalPath } from '@lib/urls';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Auth callback for BOTH rails:
//   • magic-link OTP — Supabase redirects here with `?code=...` after the user
//     clicks the email link (no `bkstate`).
//   • OAuth (BK-3) — the provider round-trips back here with `?code=...&bkstate=...`
//     (or `?error=access_denied` on consent denial). The `bkstate` query param
//     marks the OAuth branch and is validated against the `bk_oauth_state`
//     cookie (CSRF; mismatch → 403) BEFORE the code exchange. See ADR-0008.
//
// `next` is preserved through both initiation paths and defaults to `/projects`;
// the existing redirect chain then sends a first-time user (no workspace) on to
// `/onboarding`, and a returning user stays on `/projects`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
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
