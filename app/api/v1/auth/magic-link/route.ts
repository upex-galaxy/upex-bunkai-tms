import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createClient } from '@lib/supabase/server';
import { webUrl } from '@lib/urls';
import { z } from 'zod';

const BodySchema = z.object({
  email: z.string().email(),
  // Root-relative path the user should land on after the OTP exchange.
  // Validated again in `/auth/callback` (open-redirect guard) so we can keep
  // this check loose.
  next: z
    .string()
    .min(1)
    .refine(value => value.startsWith('/') && !value.startsWith('//'), {
      message: 'next must be a root-relative path (e.g. /projects).',
    })
    .optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const body: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  const { email, next = '/projects' } = BodySchema.parse(body);
  const redirect = `${webUrl('/auth/callback')}?next=${encodeURIComponent(next)}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect },
  });

  if (error) {
    // Supabase rate-limit (HTTP 429) surfaces here. Phase F adds a real
    // rate-limit middleware in front; for now we map the upstream verbatim.
    const status = error.status ?? 502;
    throw new ApiError(
      status === 429 ? 'rate_limited' : 'upstream_error',
      error.message,
      { status },
    );
  }

  return jsonResponse({ ok: true });
});
