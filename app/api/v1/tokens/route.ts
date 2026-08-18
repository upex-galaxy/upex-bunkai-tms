import type { NextRequest } from 'next/server';
import { ALL_CAPABILITIES } from '@lib/api/capabilities';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertTokenIssuanceAuthorized } from '@lib/api/pat';
import { createAdminClient } from '@lib/supabase/admin';
import { z } from 'zod';

// POST /api/v1/tokens — issue a new personal access token (PAT).
// GET  /api/v1/tokens — list the caller's tokens (no secret).
//
// Issuance is session-authenticated (cookie). The caller must already be
// logged in via the web app; a PAT cannot create another PAT (chicken-and-
// egg). The raw secret `bk_pat_<prefix>.<secret>` is returned in the POST
// response body exactly once; the database only stores SHA-256(secret).
//
// Family prefix `bk_pat_` is a public marker that helps secret-scanning tools
// (GitHub, GitGuardian) flag leaked tokens. The hashed part is 32 random bytes
// base64url-encoded (~256 bits of entropy).

const TOKEN_FAMILY_PREFIX = 'bk_pat_';
const TOKEN_PREFIX_LENGTH = 12;
const SECRET_BYTES = 32;
// Single vocabulary — see `@lib/api/capabilities`. A local literal here is the
// fourth copy of the same four strings and drifts the moment one of them moves.
const ALLOWED_SCOPES = ALL_CAPABILITIES;

const CreateBodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1),
  workspace_id: z.string().uuid().optional(),
  expires_in_days: z.number().int().positive().max(365).optional(),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  const { name, scopes, workspace_id: workspaceId, expires_in_days: expiresInDays }
    = CreateBodySchema.parse(payload);

  // Role-gate the requested scopes against the caller's workspace role before
  // minting — a member must not be able to self-issue workspace:admin. See
  // ADR-0005 / BK-135.
  await assertTokenIssuanceAuthorized({
    db,
    userId: principal.userId,
    scopes,
    workspaceId: workspaceId ?? null,
  });

  const secret = generateSecret(SECRET_BYTES);
  const tokenPrefix = secret.slice(0, TOKEN_PREFIX_LENGTH);
  const hash = await sha256Hex(secret);
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  // Use the admin client so the verified user_id is set from the session
  // rather than relying on the cookie-scoped client (which would also work,
  // but the admin client keeps the insert single-purpose and explicit).
  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from('access_tokens')
    .insert({
      user_id: principal.userId,
      workspace_id: workspaceId ?? null,
      name: name ?? null,
      token_prefix: tokenPrefix,
      scopes,
      expires_at: expiresAt,
    })
    .select('id, name, scopes, workspace_id, expires_at, created_at')
    .single();

  if (error || !inserted) {
    throw new ApiError('internal_error', error?.message ?? 'Failed to create token.');
  }

  // Secret hash lives in a sibling table that QA/analytics roles cannot read.
  const { error: secretError } = await admin
    .from('access_token_secrets')
    .insert({ token_id: inserted.id, hash });

  if (secretError) {
    throw new ApiError('internal_error', secretError.message);
  }

  return jsonResponse(
    {
      id: inserted.id,
      token: `${TOKEN_FAMILY_PREFIX}${tokenPrefix}.${secret.slice(TOKEN_PREFIX_LENGTH)}`,
      name: inserted.name,
      scopes: inserted.scopes,
      workspace_id: inserted.workspace_id,
      expires_at: inserted.expires_at,
      created_at: inserted.created_at,
      warning: 'Store this token now — it cannot be retrieved later.',
    },
    { status: 201 },
  );
  // A PAT must not mint another PAT — privilege escalation / persistence risk.
  // Token issuance is a browser-session-only operation (ADR-0001 exception),
  // enforced by the gateway before the handler body runs.
}, { auth: 'cookie-only', why: 'Personal access tokens cannot issue tokens. Use a browser session.' });

// Listing is read-only and RLS-scoped to the caller's own tokens, so it is safe
// over either auth method (cookie or PAT).
export const GET = withApiHandler(async (_request: NextRequest, ctx) => {
  const { db } = getAuth(ctx);

  // RLS enforces ownership (auth.uid() = user_id) so we do not need an
  // explicit `.eq('user_id', ...)`. Selecting every column except `hash`.
  const { data, error } = await db
    .from('access_tokens')
    .select(
      'id, name, scopes, workspace_id, token_prefix, expires_at, revoked_at, last_used_at, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ tokens: data ?? [] });
}, {
  auth: 'authenticated',
  why: 'Listing is read-only and RLS-scoped to the caller\'s own tokens.',
});

function generateSecret(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
