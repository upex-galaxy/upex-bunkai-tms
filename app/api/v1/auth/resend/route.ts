import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/auth/resend — resend the sign-up email-confirmation OTP (BK-181).
//
// Dedicated resend rail for the email-verification screen's "Request a new
// code" control. Takes ONLY the email — unlike POST /api/v1/auth/signup it
// carries no password, so it can never fail signup's password-strength
// validation. That was the root cause of BK-181: the control re-called
// `/signup` with a `password` that was empty/stale on some entry paths into
// the verify step, tripping signup's Zod schema (`password: min(8)`) and
// surfacing the generic `withApiHandler` message ("Request body failed
// validation.") verbatim in the UI alert — a raw backend message, not a
// friendly resend confirmation.
//
// Calls the public `auth.resend` path (type: 'signup'), which re-sends the
// existing pending confirmation OTP without re-provisioning the account or
// touching the password at all.
//
// Anti-enumeration stance mirrors `signup`/`confirm`: errors are mapped by
// HTTP status only, never forwarding the raw upstream message, and the
// response never reveals whether the email exists or was already confirmed.

const BodySchema = z.object({
  email: z.string().email().max(254),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email } = BodySchema.parse(payload);
  // Mirror signup/check-email: GoTrue stores/authenticates emails
  // case-insensitively, so normalise before the call.
  const normalizedEmail = email.trim().toLowerCase();

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: 'signup', email: normalizedEmail });

  if (error) {
    const status = error.status ?? 502;
    if (status === 429) {
      throw new ApiError('rate_limited', error.message, { status });
    }
    // Never forward the raw upstream/Zod message — map by status only. This
    // is the exact leak BK-181 reported, so this route never echoes
    // `error.message` from anywhere upstream.
    if (status >= 400 && status < 500) {
      throw new ApiError(
        'bad_request',
        'Could not resend the verification code. Please check your details and try again.',
        { status: 400 },
      );
    }
    throw new ApiError('upstream_error', 'Resend is temporarily unavailable.');
  }

  return jsonResponse({ status: 'sent', email: normalizedEmail }, { status: 202 });
}, { auth: 'public' });
