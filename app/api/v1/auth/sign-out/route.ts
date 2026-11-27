import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { z } from 'zod';

const BodySchema = z.object({
  revoke_pats: z.boolean().optional(),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const { revoke_pats: revokePats = false } = BodySchema.parse(await readJsonBody(request));

  const revokedPats = revokePats ? await revokeActivePats(db, principal.userId) : 0;

  const { error } = await db.auth.signOut({ scope: revokePats ? 'global' : 'local' });
  if (error) {
    throw new ApiError('internal_error', 'The session could not be ended. Retry with the same session.');
  }

  return jsonResponse({ revoked_pats: revokedPats });
}, { auth: 'cookie-only', why: 'Sign-out ends a browser session. A personal access token cannot sign itself out.' });

async function readJsonBody(request: NextRequest): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim() === '') {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
}

async function revokeActivePats(db: SupabaseClient<Database>, userId: string): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('access_tokens')
    .update({ revoked_at: now })
    .eq('user_id', userId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gte."${now}"`)
    .select('id');

  if (error) {
    throw new ApiError('internal_error', 'Your tokens could not be revoked. Nothing was changed; retry with the same session.');
  }
  return data?.length ?? 0;
}
