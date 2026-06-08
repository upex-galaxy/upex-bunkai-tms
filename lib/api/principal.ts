import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { requireBearerToken } from '@lib/api/middleware/bearer';
import { mintUserJwt } from '@lib/api/user-jwt';
import { env } from '@lib/env';
import { createClient } from '@lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import 'server-only';

// Unified identity for every authenticated /api/v1 route (see ADR-0001).
//
// Both auth methods — a browser cookie session and a Bearer PAT (`bk_pat_*`) —
// collapse into a single `Principal`. After `resolveIdentity` runs, a handler
// sees ONE shape and never branches on how the caller authenticated. The
// parity gap (a PAT that works on some routes but 401s on others) becomes
// structurally impossible because there is no second code path to forget.
//
// `principal.db` is the key: an RLS-scoped Supabase client authenticated AS the
// resolved user, identical in behaviour for cookie and bearer callers. For a
// cookie it is the SSR client (the session carries `auth.uid()`); for a PAT it
// is an anon client carrying a short-lived user-scoped JWT so `auth.uid()`
// resolves the same way. Either way, Postgres RLS stays the single source of
// authorization truth — handlers do not re-implement access checks in TS.

// Every capability a UI (cookie) session implicitly holds. A browser user is the
// principal and the UI already gates writes; a PAT carries an explicit subset in
// `access_tokens.scopes`. Keep in sync with the scopes CHECK in
// migration 0008_access_tokens.sql.
export const ALL_CAPABILITIES = ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'] as const;

export interface Principal {
  userId: string
  workspaceId: string | null
  capabilities: string[]
  via: 'cookie' | 'bearer'
  tokenId: string | null
  // RLS-scoped client authenticated AS this user. Use this for ALL data access
  // in a handler — never `createClient()` or `createAdminClient()` for
  // user-scoped reads/writes, or the cookie/PAT parity guarantee is lost.
  db: SupabaseClient<Database>
}

export async function resolveIdentity(request: NextRequest): Promise<Principal> {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');

  // Bearer first so an explicit PAT is never shadowed by a stale cookie.
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = await requireBearerToken(request);
    return {
      userId: bearer.userId,
      workspaceId: bearer.workspaceId,
      capabilities: bearer.scopes,
      via: 'bearer',
      tokenId: bearer.tokenId,
      db: await impersonatingClient(bearer.userId),
    };
  }

  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'Authentication required.');
  }
  return {
    userId: user.id,
    workspaceId: null,
    capabilities: [...ALL_CAPABILITIES],
    via: 'cookie',
    tokenId: null,
    db: ssr,
  };
}

// Throws 403 unless the principal holds the capability. Cookie sessions hold the
// full set (see ALL_CAPABILITIES), so this only constrains PAT callers in
// practice — but it is enforced uniformly for both.
export function requireCapability(principal: Principal, capability: string): void {
  if (!principal.capabilities.includes(capability)) {
    throw new ApiError('forbidden', `Missing required capability: ${capability}`);
  }
}

// Anon client carrying a per-request user JWT. PostgREST treats it as that user's
// session, so RLS applies exactly as it would for the browser. The service role
// key is never handed to PostgREST here — we authenticate AS the user, not as a
// god-mode service that bypasses RLS.
async function impersonatingClient(userId: string): Promise<SupabaseClient<Database>> {
  if (!env.SUPABASE_JWT_SECRET) {
    throw new ApiError('internal_error', 'SUPABASE_JWT_SECRET is not configured.');
  }
  const token = await mintUserJwt(userId, env.SUPABASE_JWT_SECRET);
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
