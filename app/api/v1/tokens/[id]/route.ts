import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// DELETE /api/v1/tokens/[id] — soft-revoke the caller's token by setting
// revoked_at = now(). Session-authenticated. RLS enforces ownership
// (auth.uid() = user_id on the access_tokens table), so a forged id from
// another user simply matches zero rows → 404.
//
// We never hard-delete: the row stays in the audit trail. The bearer
// middleware rejects rows with revoked_at IS NOT NULL.

const ParamsSchema = z.object({ id: z.string().uuid() });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  // A PAT must not revoke tokens — token management is a browser-session-only
  // operation (ADR-0001 exception).
  if (principal.via === 'bearer') {
    throw new ApiError('forbidden', 'Personal access tokens cannot revoke tokens. Use a browser session.');
  }

  // Extract the [id] segment from the pathname. Shape: /api/v1/tokens/<uuid>.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const rawId = segments.at(-1) ?? '';
  const { id } = ParamsSchema.parse({ id: rawId });

  const { data, error } = await db
    .from('access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  if (!data) {
    throw new ApiError('not_found', 'Token not found or already revoked.');
  }

  return new NextResponse(null, { status: 204 });
}, { auth: 'required' });
