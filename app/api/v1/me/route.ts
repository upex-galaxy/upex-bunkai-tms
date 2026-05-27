import type { NextRequest } from 'next/server';
import { requireAuth } from '@lib/api/auth';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { cookies } from 'next/headers';

// GET /api/v1/me — introspect the authenticated principal. Cookie session OR
// Bearer PAT (Authorization: Bearer bk_pat_*). Returns the user summary, every
// workspace they belong to, and the currently selected active_workspace_id.
//
// For Bearer callers, the workspace list is built via an explicit join through
// workspace_members because `auth.uid()` is not set in the admin client (RLS
// would return zero rows otherwise). For cookie callers we keep using the
// session-scoped client so RLS continues to be the source of truth.

export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request);

  let workspaces: Array<{
    id: string
    slug: string
    name: string
    plan: string
    owner_user_id: string
    created_at: string
  }> = [];

  if (auth.source === 'cookie') {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, slug, name, plan, owner_user_id, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      throw new ApiError('internal_error', error.message);
    }
    workspaces = data ?? [];
  }
  else {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('workspace_members')
      .select('workspace_id, status, workspaces!inner(id, slug, name, plan, owner_user_id, created_at)')
      .eq('user_id', auth.userId)
      .eq('status', 'active');
    if (error) {
      throw new ApiError('internal_error', error.message);
    }
    workspaces = (data ?? [])
      .map(r => r.workspaces as unknown as typeof workspaces[number])
      .filter((w): w is typeof workspaces[number] => Boolean(w))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // For cookie callers honour the bk_active_ws cookie; for bearer callers
  // surface the token-bound workspace_id if one was set at issuance, else
  // fall back to the oldest workspace.
  let activeWorkspaceId: string | null = null;
  if (auth.source === 'cookie') {
    const cookieStore = await cookies();
    const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    const visibleIds = new Set(workspaces.map(w => w.id));
    activeWorkspaceId = cookieActive && visibleIds.has(cookieActive)
      ? cookieActive
      : (workspaces[0]?.id ?? null);
  }
  else {
    activeWorkspaceId = auth.workspaceId ?? (workspaces[0]?.id ?? null);
  }

  // Email: cookie session has it on `user.email`. Bearer flow only knows
  // userId, so we fetch the email best-effort via the admin auth API.
  let email: string | null = null;
  if (auth.source === 'cookie') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email ?? null;
  }
  else {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.getUserById(auth.userId);
      if (!error) {
        email = data.user?.email ?? null;
      }
    }
    catch {
      email = null;
    }
  }

  return jsonResponse({
    user: { id: auth.userId, email },
    workspaces,
    active_workspace_id: activeWorkspaceId,
    auth: {
      source: auth.source,
      scopes: auth.scopes,
    },
  });
});
