import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { ALLOWED_PAT_SCOPES, mintPat } from '@lib/api/pat';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/auth/signup — headless sign-up. Provisions a user with
// email + password and `email_confirm: true` so QA / CLI flows do not need to
// click a confirmation email. Immediately signs the new user in + mints a
// PAT so the caller can proceed without a second round trip.
//
// Idempotency: if the email already exists, returns 409 conflict. The caller
// should treat that as "use signin instead".

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
  pat_name: z.string().min(1).max(80).optional(),
  pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional(),
  pat_expires_in_days: z.number().int().positive().max(365).optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, password, pat_name, pat_scopes, pat_expires_in_days } = BodySchema.parse(payload);

  const admin = createAdminClient();

  // Create via the admin API so we can force email_confirm. The regular
  // `auth.signUp` path triggers a confirmation email; we do not want that
  // for headless QA users.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const message = createError?.message ?? 'Failed to create user.';
    if (message.toLowerCase().includes('already')) {
      throw new ApiError('conflict', `A user with email ${email} already exists.`);
    }
    throw new ApiError('upstream_error', message);
  }

  // Sign the new user in via the regular client to populate the session
  // cookies on the response (in case the caller follows up from a browser).
  const supabase = await createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (sessionError || !sessionData.session) {
    throw new ApiError('internal_error', sessionError?.message ?? 'Sign-in after signup failed.');
  }

  const pat = await mintPat({
    admin,
    userId: created.user.id,
    name: pat_name ?? 'cli-signup',
    scopes: pat_scopes ?? [...ALLOWED_PAT_SCOPES],
    expiresInDays: pat_expires_in_days ?? null,
  });

  return jsonResponse(
    {
      user: { id: created.user.id, email: created.user.email ?? null },
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at,
        token_type: sessionData.session.token_type,
      },
      pat: {
        token: pat.token,
        id: pat.id,
        name: pat.name,
        scopes: pat.scopes,
        expires_at: pat.expires_at,
      },
      warning: 'Store the PAT token now — it cannot be retrieved later.',
    },
    { status: 201 },
  );
});
