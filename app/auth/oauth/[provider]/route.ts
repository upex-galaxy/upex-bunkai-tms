import type { NextRequest } from 'next/server';
import { isOAuthProvider } from '@lib/auth/oauth';
import { generateOAuthState, OAUTH_STATE_COOKIE, oauthStateCookieOptions } from '@lib/auth/oauth-state';
import { createClient } from '@lib/supabase/server';
import { safeInternalPath } from '@lib/urls';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// OAuth initiation (BK-3). The login buttons navigate here so the flow STARTS
// server-side — that is what lets us mint and store the CSRF `state` cookie
// before the browser ever leaves for the provider. We issue the state, ask
// Supabase for the provider authorize URL (PKCE; the SDK persists its own
// code_verifier cookie via the SSR cookie adapter), echo our state through the
// callback URL as `bkstate`, and 302 to the provider. The callback validates
// the state before exchanging the code. See ADR-0008.
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const { origin, searchParams } = new URL(request.url);
  const next = safeInternalPath(searchParams.get('next'));

  if (!isOAuthProvider(provider)) {
    return NextResponse.redirect(`${origin}/login?error=oauth_init_failed`);
  }

  const state = generateOAuthState();
  const redirectTo = `${origin}/auth/callback?bkstate=${state}&next=${encodeURIComponent(next)}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(`${origin}/login?error=oauth_init_failed`);
  }

  // Store the CSRF state. Same cookie store Supabase used for the code_verifier;
  // both ride the response (proven by the existing callback handler).
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());

  return NextResponse.redirect(data.url);
}
