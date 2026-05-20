import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
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
const ALLOWED_SCOPES = ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'] as const;

const CreateBodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1),
  workspace_id: z.string().uuid().optional(),
  expires_in_days: z.number().int().positive().max(365).optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in to issue a token.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  const { name, scopes, workspace_id: workspaceId, expires_in_days: expiresInDays }
    = CreateBodySchema.parse(payload);

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
      user_id: user.id,
      workspace_id: workspaceId ?? null,
      name: name ?? null,
      token_prefix: tokenPrefix,
      hash,
      scopes,
      expires_at: expiresAt,
    })
    .select('id, name, scopes, workspace_id, expires_at, created_at')
    .single();

  if (error || !inserted) {
    throw new ApiError('internal_error', error?.message ?? 'Failed to create token.');
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
});

export const GET = withApiHandler(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in to list tokens.');
  }

  // RLS enforces ownership (auth.uid() = user_id) so we do not need an
  // explicit `.eq('user_id', user.id)`. Selecting every column except `hash`.
  const { data, error } = await supabase
    .from('access_tokens')
    .select(
      'id, name, scopes, workspace_id, token_prefix, expires_at, revoked_at, last_used_at, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ tokens: data ?? [] });
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
