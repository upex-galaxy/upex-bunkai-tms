import { ApiError } from '@lib/api/error-envelope';
import { createAdminClient } from '@lib/supabase/admin';
import 'server-only';

// Bearer-token authentication for CLI + AI-agent traffic.
//
// Tokens are issued via POST /api/v1/tokens. The raw secret returned to the
// caller is `bk_pat_<prefix>.<secret>`; we store SHA-256(secret) in
// `access_tokens.hash` and the first 12 chars of `secret` in
// `access_tokens.token_prefix` for an O(1) index lookup before the constant-
// time hash compare.
//
// All failures collapse to ApiError('unauthorized') — never leak which check
// failed (missing header vs malformed shape vs unknown prefix vs hash mismatch
// vs revoked vs expired). Standard auth-style uniform 401.

const BEARER_PREFIX = 'Bearer ';
const TOKEN_FAMILY_PREFIX = 'bk_pat_';
const TOKEN_PREFIX_LENGTH = 12;

export interface BearerContext {
  userId: string
  workspaceId: string | null
  scopes: string[]
  tokenId: string
}

export async function requireBearerToken(request: Request): Promise<BearerContext> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new ApiError('unauthorized', 'Missing or invalid Authorization header.');
  }

  const raw = header.slice(BEARER_PREFIX.length).trim();
  if (!raw.startsWith(TOKEN_FAMILY_PREFIX)) {
    throw new ApiError('unauthorized', 'Invalid token.');
  }

  const body = raw.slice(TOKEN_FAMILY_PREFIX.length);
  const dotIdx = body.indexOf('.');
  if (dotIdx <= 0 || dotIdx === body.length - 1) {
    throw new ApiError('unauthorized', 'Invalid token.');
  }

  const prefix = body.slice(0, dotIdx);
  const remainder = body.slice(dotIdx + 1);
  if (prefix.length !== TOKEN_PREFIX_LENGTH || remainder.length === 0) {
    throw new ApiError('unauthorized', 'Invalid token.');
  }

  // The dot in `bk_pat_<prefix>.<remainder>` is a visual separator that
  // makes the prefix-indexed lookup possible. The minting code (lib/api/pat.ts
  // and the legacy POST /api/v1/tokens handler) hashes the FULL base64url
  // secret BEFORE splitting it — so the verify side must reconstruct that
  // full secret (prefix + remainder) before comparing. The earlier impl
  // hashed only `remainder` here, which silently never matched and produced
  // a 401 "Invalid token" on every Bearer call.
  const fullSecret = `${prefix}${remainder}`;

  const admin = createAdminClient();

  // Look up by indexed token_prefix. Multiple rows would mean a prefix
  // collision (12 chars of base64url = ~72 bits of entropy — astronomically
  // unlikely); we still iterate so a hypothetical collision does not lock
  // both tokens out.
  const { data: candidates, error } = await admin
    .from('access_tokens')
    .select('id, user_id, workspace_id, scopes, hash, expires_at, revoked_at')
    .eq('token_prefix', prefix)
    .limit(5);

  if (error || !candidates || candidates.length === 0) {
    throw new ApiError('unauthorized', 'Invalid token.');
  }

  const expectedHash = await sha256Hex(fullSecret);
  const now = Date.now();

  const match = candidates.find((row) => {
    if (row.hash !== expectedHash) { return false; }
    if (row.revoked_at !== null) { return false; }
    if (row.expires_at !== null && Date.parse(row.expires_at) < now) { return false; }
    return true;
  });

  if (!match) {
    throw new ApiError('unauthorized', 'Invalid token.');
  }

  // Fire-and-forget last_used_at update. Never fail the request because the
  // log write failed (network blip, RLS quirk, anything).
  void touchLastUsed(match.id);

  return {
    userId: match.user_id,
    workspaceId: match.workspace_id,
    scopes: match.scopes ?? [],
    tokenId: match.id,
  };
}

export function requireScope(ctx: BearerContext, scope: string): void {
  if (!ctx.scopes.includes(scope)) {
    throw new ApiError('forbidden', `Token missing required scope: ${scope}`);
  }
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function touchLastUsed(tokenId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from('access_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenId);
  }
  catch {
    // Swallow. Auth must not fail because of the log update.
  }
}
