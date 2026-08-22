import type { Principal } from '@lib/api/principal';
import type { MemberRole } from '@lib/types';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';

// GET /api/v1/me — introspect the authenticated principal. Cookie session OR
// Bearer PAT (Authorization: Bearer bk_pat_*). Returns the user summary, every
// workspace they belong to, and the currently selected active_workspace_id.
//
// Both auth methods go through the unified gateway (ADR-0001): `db` is an
// RLS-scoped client authenticated AS the caller, so the workspace list is a
// single query that filters identically for cookie and PAT — no per-method join.

export const dynamic = 'force-dynamic';

// Resolve which workspace is "active" for the caller (BK-316). Extracted out
// of the handler body — same reason and same isolation style as
// `resolveRunWorkspaceId` in `runs/route.ts:24-44`: no dedicated
// NextRequest/ctx test harness exists in this repo, so the branch that a
// regression must pin down needs to be a plain, unit-testable function.
// Pure (no DB, no `cookies()` call inside) rather than DB-parametrized like
// `resolveRunWorkspaceId` — GET /api/v1/me always fetches the full
// `workspaces` list for the response body regardless of auth method, so
// there is no lazy-query case to model here; this only ever picks an id out
// of the list the caller already has.
export function resolveMeActiveWorkspaceId(
  principal: Pick<Principal, 'workspaceId' | 'via'>,
  cookieActive: string | null,
  visibleWorkspaceIds: readonly string[],
): string | null {
  if (principal.via === 'cookie') {
    return resolveActiveWorkspaceId(cookieActive, visibleWorkspaceIds);
  }
  // Bearer: surface the token-bound workspace_id if one was set at issuance
  // (POST /api/v1/tokens with a workspace_id), else fall back to the oldest
  // visible workspace. Tokens minted at POST /api/v1/auth/signin carry
  // `workspace_id: null` (lib/api/pat.ts's `mintPat` — the documented,
  // intended shape for a headless global token, migration
  // 0008_access_tokens.sql), so this fallback is the common case for
  // CLI/agent traffic, not a rare edge.
  return principal.workspaceId ?? (visibleWorkspaceIds[0] ?? null);
}

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const { data, error } = await db
    .from('workspaces')
    .select('id, slug, name, plan, owner_user_id, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  const workspaces = data ?? [];

  // For cookie callers honour the bk_active_ws cookie; for bearer callers
  // surface the token-bound workspace_id if one was set at issuance, else
  // fall back to the oldest workspace.
  const cookieActive = principal.via === 'cookie'
    ? ((await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null)
    : null;
  const activeWorkspaceId = resolveMeActiveWorkspaceId(principal, cookieActive, workspaces.map(w => w.id));

  // Resolve the caller's role in the active workspace (BK-86). One uniform
  // RLS-scoped read of the caller's OWN membership row — identical for cookie
  // and bearer (ADR-0001: `principal.userId` is set on both paths). Null when
  // there is no active workspace (no-workspace empty state, Scenario B).
  let activeWorkspaceRole: MemberRole | null = null;
  if (activeWorkspaceId) {
    const { data: membership } = await db
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', principal.userId)
      .maybeSingle();
    activeWorkspaceRole = (membership?.role as MemberRole | undefined) ?? null;
  }

  // Email lives in auth.users (not exposed through PostgREST), so fetch it
  // best-effort via the admin auth API for both auth methods.
  let email: string | null = null;
  try {
    const { data: lookup, error: lookupError } = await createAdminClient()
      .auth
      .admin
      .getUserById(principal.userId);
    if (!lookupError) {
      email = lookup.user?.email ?? null;
    }
  }
  catch {
    email = null;
  }

  return jsonResponse({
    user: { id: principal.userId, email },
    workspaces,
    active_workspace_id: activeWorkspaceId,
    active_workspace_role: activeWorkspaceRole,
    auth: {
      source: principal.via,
      scopes: principal.capabilities,
    },
  });
}, {
  auth: 'authenticated',
  why: 'Identity probe — a token must be able to resolve who it is and which workspaces it can see before it can hold any scope-gated conversation.',
});
