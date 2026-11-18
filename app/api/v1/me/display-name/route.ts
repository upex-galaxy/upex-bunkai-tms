import type { NextRequest } from 'next/server';
import { parseDisplayName } from '@lib/account/display-name';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { writeOwnDisplayName } from './store';

// PUT    /api/v1/me/display-name — save the caller's own display name.
// DELETE /api/v1/me/display-name — remove it (BK-1949).
//
// Session-only (`auth: 'cookie-only'`): a personal access token cannot change
// identity details (Business Rule 6, ruling D3). The gateway refuses any
// Bearer PAT with 403 before the body runs, including a request that also
// carries a session cookie, because the bearer header wins in
// `resolveIdentity`.
//
// There is no user id anywhere in the request (ruling D4): the target is the
// authenticated principal, so changing another person's name is impossible by
// construction. Extra body fields are ignored. Both verbs are idempotent: the
// same value saved twice, or a removal with nothing saved, returns 200 with
// the same body (ruling D7). No activity-log row (ruling D10): the name is
// private to the account, not workspace data.

export const dynamic = 'force-dynamic';

function displayNameField(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return undefined;
  }
  return (payload as Record<string, unknown>).display_name;
}

export const PUT = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const parsed = parseDisplayName(displayNameField(payload));
  if (!parsed.ok) {
    throw new ApiError('validation_failed', parsed.message, { details: { field: 'display_name' } });
  }

  const stored = await writeOwnDisplayName(createAdminClient(), principal.userId, parsed.value);
  return jsonResponse({ display_name: stored });
}, { auth: 'cookie-only', why: 'Personal access tokens cannot change identity details. Use a browser session.' });

export const DELETE = withApiHandler(async (_request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);
  const stored = await writeOwnDisplayName(createAdminClient(), principal.userId, null);
  return jsonResponse({ display_name: stored });
}, { auth: 'cookie-only', why: 'Personal access tokens cannot change identity details. Use a browser session.' });
