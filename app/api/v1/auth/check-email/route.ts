import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { z } from 'zod';

// POST /api/v1/auth/check-email — email-first routing helper (BK-166).
//
// Returns `{ exists, confirmed }` so the login UI can route an entered email to
// the right step: password (existing + confirmed), verify (existing but
// unconfirmed), or create (unknown). `signin` itself stays a uniform 401 with
// no enumeration leak; this endpoint deliberately exposes existence.
//
// ENUMERATION TRADEOFF (ADR-0005): this endpoint intentionally reveals whether
// an email is registered. The product needs email-first routing (an existing
// user must not be shown a "create account" form, and an unconfirmed user must
// be routed to verification rather than a misleading "wrong password"). This
// endpoint is NOT covered by Supabase's GoTrue auth/OTP throttling — it reads
// `auth.users` via the `public.auth_email_status` SECURITY DEFINER RPC, which
// bypasses GoTrue entirely. The accepted enumeration tradeoff's real mitigation
// is therefore an app-level rate limiter, a documented follow-up in ADR-0005
// (not yet shipped). The lookup runs ONLY with the service-role key, never
// client-side, and returns two booleans — no user id, name, or other internals
// are ever exposed.

const BodySchema = z.object({
  email: z.string().email().max(254),
});

interface AuthEmailStatusRow {
  email_exists: boolean
  email_confirmed: boolean
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email } = BodySchema.parse(payload);
  // GoTrue stores emails lowercased and authenticates case-insensitively, so we
  // normalise before the lookup — otherwise `User@x.com` would miss a stored
  // `user@x.com` and mis-route an existing user into account-creation. The RPC
  // also normalises internally; we mirror it client-side for defence in depth.
  const normalizedEmail = email.trim().toLowerCase();

  // Admin-only lookup against `auth.users` via the `public.auth_email_status`
  // SECURITY DEFINER RPC. The project does not expose the `auth` schema to
  // PostgREST, so a direct `.schema('auth')` read is impossible — the RPC is the
  // supported path (and is callable by service_role only). The generated
  // `Database` type does not model this function yet, so we cast the typed admin
  // client to a minimal `rpc` signature. Service-role key never leaves the
  // server (sourced from env, never hardcoded).
  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as {
    rpc: (
      fn: 'auth_email_status',
      args: { p_email: string },
    ) => Promise<{ data: AuthEmailStatusRow[] | null, error: { code?: string, message: string } | null }>
  }).rpc('auth_email_status', { p_email: normalizedEmail });

  if (error) {
    // PostgREST surfaces an upstream HTTP 429 as code '429' on the error. Map it
    // to the canonical rate_limited code; anything else is an upstream failure.
    // The raw upstream message is still logged server-side by the handler — we
    // return a static generic message so an unauthenticated caller never sees
    // the raw PostgREST/auth error.
    if (error.code === '429') {
      throw new ApiError('rate_limited', error.message, { status: 429 });
    }
    throw new ApiError('upstream_error', 'Could not check this email.', { status: 502 });
  }

  const row = data?.[0];
  return jsonResponse({
    exists: row?.email_exists ?? false,
    confirmed: row?.email_confirmed ?? false,
  });
}, { auth: 'public' });
