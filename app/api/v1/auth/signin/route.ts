import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { ALLOWED_PAT_SCOPES, mintPat } from '@lib/api/pat';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/auth/signin — headless sign-in. Accepts email + password,
// verifies against Supabase Auth, then mints a fresh PAT in the same call so
// the CLI / agent has both the Supabase session AND the long-lived Bearer
// token in one round trip. The session cookies are still set (so the same
// request that signed in can also be used from a browser context if desired).

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
  // Optional PAT controls — defaults give the CLI full read+write power.
  pat_name: z.string().min(1).max(80).optional(),
  pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional(),
  pat_expires_in_days: z.number().int().positive().max(365).optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, password, pat_name, pat_scopes, pat_expires_in_days } = BodySchema.parse(payload);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    // Uniform 401 — never leak whether the email exists vs the password is wrong.
    throw new ApiError('unauthorized', 'Invalid email or password.');
  }

  const admin = createAdminClient();
  const pat = await mintPat({
    admin,
    userId: data.user.id,
    name: pat_name ?? 'cli-signin',
    scopes: pat_scopes ?? [...ALLOWED_PAT_SCOPES],
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
});
