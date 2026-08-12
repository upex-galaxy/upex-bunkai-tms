import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@lib/env';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import 'server-only';

// BK-400: a client used ONLY to ask GoTrue to mail a sign-in link.
//
// It deliberately does NOT use `@supabase/ssr`'s `createServerClient`, which
// hard-codes `flowType: 'pkce'`. Under PKCE, `signInWithOtp` mints a code
// verifier and parks it in a browser cookie, and the emailed link can then only
// be completed by that same browser — so opening the mail on a phone failed with
// `PKCE code verifier not found in storage`. Cross-device is the whole point of a
// magic link, so the rail moved to stateless `token_hash` verification instead
// (see `app/auth/callback/route.ts`).
//
// `flowType: 'implicit'` here means GoTrue issues a plain OTP whose `.TokenHash`
// the callback can verify from anywhere. Nothing is persisted: this client sends
// the mail and is discarded, so it must never be used to establish a session.
export function createOtpSenderClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
    },
  );
}
