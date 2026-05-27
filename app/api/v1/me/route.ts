import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { cookies } from 'next/headers';

// GET /api/v1/me — introspect the authenticated principal. Returns the user
// summary, every workspace they belong to, and the currently selected
// `active_workspace_id` (driven by the `bk_active_ws` cookie). The CLI uses
// this as its "who am I" probe; the browser hits it from WorkspaceSwitcher.

export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('id, slug, name, plan, owner_user_id, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const visibleIds = new Set((workspaces ?? []).map(w => w.id));
  const activeWorkspaceId = cookieActive && visibleIds.has(cookieActive)
    ? cookieActive
    : ((workspaces ?? [])[0]?.id ?? null);

  return jsonResponse({
    user: { id: user.id, email: user.email ?? null },
    workspaces: workspaces ?? [],
    active_workspace_id: activeWorkspaceId,
  });
});
