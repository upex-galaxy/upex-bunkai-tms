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
  let activeWorkspaceId: string | null;
  if (principal.via === 'cookie') {
    const cookieStore = await cookies();
    const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, workspaces.map(w => w.id));
  }
  else {
    activeWorkspaceId = principal.workspaceId ?? (workspaces[0]?.id ?? null);
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
    auth: {
      source: principal.via,
      scopes: principal.capabilities,
    },
  });
}, { auth: 'required' });
