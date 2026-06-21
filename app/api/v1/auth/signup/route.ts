import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/auth/signup — headless sign-up, verification-first (BK-166).
//
// Provisions a user via the PUBLIC `auth.signUp` path, which triggers a 6-digit
// email confirmation OTP. NO auto-confirm, NO session, and NO PAT are issued
// here — the account is unusable until the caller verifies the code via
// POST /api/v1/auth/confirm (which is where the session + PAT are minted). This
// closes the auto-confirm backdoor the old admin-create flow opened.
//
// Idempotency: if the email already exists, returns 409 conflict. The caller
// should treat that as "use signin (or confirm) instead".

const BodySchema = z.object({
  email: z.string().email().max(254),
  // New accounts enforce a stronger minimum than legacy sign-in (see signin's
  // min(6) note). Sign-up + confirm both require min 8.
  password: z.string().min(8).max(128),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, password } = BodySchema.parse(payload);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const status = error.status ?? 502;
    const message = error.message.toLowerCase();
    if (status === 429) {
      throw new ApiError('rate_limited', error.message, { status });
    }
    if (message.includes('already') || message.includes('registered')) {
      // Do not echo the email back — that would leak account existence.
      throw new ApiError('conflict', 'An account with that email already exists.');
    }
    // Map upstream by status and never forward the raw upstream message.
    if (status >= 400 && status < 500) {
      throw new ApiError(
        'bad_request',
        'Sign-up could not be completed. Please check your details and try again.',
        { status: 400 },
      );
    }
    throw new ApiError('upstream_error', 'Sign-up is temporarily unavailable.');
  }

  // Supabase's public `auth.signUp` does NOT error when the email is already
  // registered — it returns 200 with an obfuscated user whose `identities`
  // array is empty (and sends no email). Detect that case and surface a 409
  // WITHOUT echoing the email, before the generic missing-user guard below.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new ApiError('conflict', 'An account with that email already exists.');
  }

  // Defensive: a successful signUp should always echo back a (still
  // unconfirmed) user. If it does not, surface it rather than report success.
  if (!data.user) {
    throw new ApiError('upstream_error', 'Sign-up did not return a user.');
  }

  return jsonResponse({ status: 'pending_confirmation', email }, { status: 202 });
}, { auth: 'public' });
