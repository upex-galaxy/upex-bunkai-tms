import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertNoGlobalAdminScope, DEFAULT_PAT_SCOPES, mintPat } from '@lib/api/pat';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/auth/confirm — completes a verification-first sign-up (BK-166),
// and also confirms a magic-link email OTP (BK-175).
//
// Verifies the email OTP via the public `verifyOtp` path, which (on the SSR
// client) establishes the session cookies, then mints a fresh PAT in the same
// call. The response is byte-for-byte the signin shape `{ user, session, pat,
// warning }` so a CLI / agent gets both the Supabase session AND the
// long-lived Bearer token in one round trip.
//
// `type` selects which Supabase OTP flow the token belongs to: 'signup' (the
// BK-166 sign-up confirmation code, default — preserves existing callers) or
// 'email' (the BK-175 magic-link OTP issued by `signInWithOtp`).

const BodySchema = z.object({
  email: z.string().email().max(254),
  // Supabase OTP is a numeric code; this project emits 6-to-8 digits.
  token: z.string().regex(/^\d{6,8}$/, 'Verification code must be 6 to 8 digits.'),
  type: z.enum(['signup', 'email']).default('signup'),
  // Optional PAT controls — defaults give the CLI read+write+run power.
  // workspace:admin is accepted as an input value but rejected at runtime by
  // assertNoGlobalAdminScope below (ADR-0005); it cannot be minted here.
  pat_name: z.string().min(1).max(80).optional(),
  pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional(),
  pat_expires_in_days: z.number().int().positive().max(365).optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, token, type, pat_name, pat_scopes, pat_expires_in_days } = BodySchema.parse(payload);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });

  if (error?.status === 429) {
    throw new ApiError('rate_limited', error.message, { status: 429 });
  }
  if (error || !data.user || !data.session) {
    // Uniform 401 — never distinguish "no such pending signup" from "wrong code".
    throw new ApiError('unauthorized', 'Invalid or expired verification code.');
  }

  // Headless rail: default to least-privilege scopes and reject any attempt to
  // mint a global workspace:admin token here. Mirrors signin exactly — an
  // admin-scoped token must be minted explicitly via POST /api/v1/tokens
  // against a specific workspace. See ADR-0005 / ADR-0007.
  const scopes = pat_scopes ?? [...DEFAULT_PAT_SCOPES];
  assertNoGlobalAdminScope(scopes);

  const admin = createAdminClient();
  const pat = await mintPat({
    admin,
    userId: data.user.id,
    name: pat_name ?? (type === 'email' ? 'cli-magic-link-confirm' : 'cli-signup-confirm'),
    scopes,
    expiresInDays: pat_expires_in_days ?? null,
  });

  return jsonResponse({
    user: { id: data.user.id, email: data.user.email ?? null },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
    },
    pat: {
      token: pat.token,
      id: pat.id,
      name: pat.name,
      scopes: pat.scopes,
      expires_at: pat.expires_at,
    },
    warning: 'Store the PAT token now — it cannot be retrieved later.',
  });
}, { auth: 'public' });
