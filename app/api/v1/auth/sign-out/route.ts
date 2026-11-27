import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { z } from 'zod';

const BodySchema = z.object({
  revoke_pats: z.boolean().optional(),
});

const SESSION_GONE_STATUSES = new Set([401, 403, 404]);

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const { revoke_pats: revokePats = false } = BodySchema.parse(await readJsonBody(request));

  if (!revokePats) {
    const { error } = await db.auth.signOut({ scope: 'local' });
    if (error) {
      throw new ApiError('internal_error', 'The session could not be ended. Retry with the same session.');
    }
    return jsonResponse({ revoked_pats: 0 });
  }

  const revokedBefore = await revokeActivePats(db, principal.userId);
  await endEverySession(db);
  // A session alive until the global sign-out could have minted a token after the first pass.
  const revokedAfter = await revokeActivePats(db, principal.userId);
  await db.auth.signOut({ scope: 'local' });

  return jsonResponse({ revoked_pats: revokedBefore + revokedAfter });
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
    throw new ApiError('internal_error', 'Your tokens could not be revoked. Retry with the same session.');
  }
  return data?.length ?? 0;
}

// auth.signOut() reports success when this session is already gone, so a global end that ended nothing would pass.
async function endEverySession(db: SupabaseClient<Database>): Promise<void> {
  const { data: { session } } = await db.auth.getSession();
  const { error } = session
    ? await db.auth.admin.signOut(session.access_token, 'global')
    : { error: { status: 401 } };
  if (!error) {
    return;
  }
  if (SESSION_GONE_STATUSES.has(error.status ?? 0)) {
    await db.auth.signOut({ scope: 'local' });
    throw new ApiError('unauthorized', 'This session ended before every session could be signed out. Sign in again and retry.');
  }
  throw new ApiError('internal_error', 'The sessions could not be ended. Retry with the same session.');
}
