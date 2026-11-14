import type { EmailStatus } from '@lib/auth/signup-duplicate';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { NewPasswordSchema } from '@lib/auth/password-policy';
import { isReservedEmailDomain, RESERVED_EMAIL_DOMAIN_MESSAGE } from '@lib/auth/reserved-email-domain';
import { resolveDuplicateSignup } from '@lib/auth/signup-duplicate';
import { createAdminClient } from '@lib/supabase/admin';
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

// BK-1830: sign-up is the one auth route that must MAIL a new address before
// the account can exist, and the SMTP provider refuses 254-character
// recipients (`501 Bad recipient address syntax`; GoTrue then rolls the user
// back and answers 500). Cap sign-up one character lower so the caller gets a
// 422 that names the limit instead of a 502. The other auth routes keep 254:
// they never create an account, and accounts that long already exist.
const SIGNUP_EMAIL_MAX_LENGTH = 253;

const BodySchema = z.object({
  email: z
    .string()
    .email()
    .max(SIGNUP_EMAIL_MAX_LENGTH, {
      message: `Email must be at most ${SIGNUP_EMAIL_MAX_LENGTH} characters so the verification code can be delivered.`,
    })
    // BK-1877: a reserved domain (example.com, .test, ...) can never receive
    // the code; the mail provider refuses it and GoTrue answers 500. Same rule
    // scope as the 253 cap above: sign-up only.
    .refine(email => !isReservedEmailDomain(email), { message: RESERVED_EMAIL_DOMAIN_MESSAGE }),
  // New accounts enforce a stronger minimum than legacy sign-in (see signin's
  // min(6) note), and at most 72 bytes, the bcrypt input limit (BK-1829).
  password: NewPasswordSchema,
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, password } = BodySchema.parse(payload);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // BK-1831: a concurrent duplicate sign-up fails upstream (5xx or the
    // per-address cooldown) although the account it asked for now exists.
    // Answer like the request that won the race.
    const duplicate = await resolveDuplicateSignup(error, async () => lookupEmailStatus(email));
    if (duplicate === 'pending') {
      return jsonResponse({ status: 'pending_confirmation', email }, { status: 202 });
    }
    if (duplicate === 'confirmed') {
      throw new ApiError('conflict', 'An account with that email already exists.');
    }
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

// Same service-role lookup as POST /auth/check-email (`auth_email_status`
// RPC). GoTrue stores emails lowercased, so normalise first. null = the
// directory could not answer; the caller then keeps the normal error mapping.
async function lookupEmailStatus(email: string): Promise<EmailStatus | null> {
  const { data, error } = await createAdminClient().rpc('auth_email_status', {
    p_email: email.trim().toLowerCase(),
  });
  const row = data?.[0];
  if (error || !row) {
    return null;
  }
  return { exists: row.email_exists, confirmed: row.email_confirmed };
}
