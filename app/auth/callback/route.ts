import type { NextRequest } from 'next/server';
import { createClient } from '@lib/supabase/server';
import { NextResponse } from 'next/server';

// Magic-link OTP exchange handler. Supabase redirects here with `?code=...`
// after the user clicks the email link. On success we redirect to `next`
// (default `/projects`); on any failure we bounce back to `/login` with an
// error flag the form can render.
//
// The `next` parameter is preserved through `signInWithOtp` in
// `app/(auth)/login/page.tsx` and round-trips through the email link.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/projects';

  // Disallow open redirects — `next` must be an in-app, root-relative path.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/projects';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=otp_exchange_failed&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
