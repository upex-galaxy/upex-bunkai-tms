import { WorkspacesList, WorkspacesListSkeleton } from '@components/settings/WorkspacesList';
import { buildWorkspaceRows, countActiveMembersByWorkspace } from '@lib/account/workspaces';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

// Settings > Workspaces (BK-89 — AC1-4). Read-only membership list: every
// workspace the caller actively belongs to, their role in each, and the
// currently active one visually marked. No leave/switch/add/invite controls
// (Out of Scope — owned by BK-90/BK-5/BK-6). Structurally mirrors
// `settings/account/page.tsx`'s `WorkspacesSection` pattern (Decision 5): a
// server component that queries Supabase directly, not via the widened
// GET /api/v1/workspaces REST endpoint, which is a separately-contracted API
// surface with its own ATP.
export default async function SettingsWorkspacesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The route layout above already guards this tree; this check is
  // unreachable in practice but keeps the page self-defensive on its own.
  if (!user) {
    redirect('/login?next=/settings/workspaces');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, slug, name')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Workspaces</h1>
        <p className="text-base text-fg-2">Every workspace you belong to, and the one you&apos;re working in right now.</p>
      </div>

      <Suspense fallback={<WorkspacesListSkeleton />}>
        <WorkspacesSection userId={user.id} activeWorkspaceId={activeWorkspaceId} />
      </Suspense>
    </div>
  );
}

// Workspace membership list (BK-89). A separate async server component (not
// the page itself) so it streams inside its own `<Suspense>` boundary above.
// Same two-query shape as `settings/account/page.tsx`'s `WorkspacesSection`
// (Decision 5 — the duplication is accepted, not shared, matching the
// existing un-shared pattern between that page and route.ts): manual JS join,
// not a PostgREST embedded-select.
//
// TD7: any failure here is caught locally and rendered as the error state —
// it must never throw up to the route's `error.tsx`.
async function WorkspacesSection({ userId, activeWorkspaceId }: { userId: string, activeWorkspaceId: string | null }) {
  try {
    const supabase = await createClient();

    const { data: memberships, error: membershipsError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });
    if (membershipsError) {
      throw membershipsError;
    }

    const workspaceIds = (memberships ?? []).map(m => m.workspace_id);

    // Active-member count spans every member of the workspace, not just rows
    // the caller's own RLS grants them, so this aggregate deliberately goes
    // through the admin client, same as `settings/account/page.tsx`. It only
    // ever returns a workspace_id (no PII), scoped to workspaces the caller
    // already belongs to.
    const [{ data: workspaceRows, error: workspacesError }, { data: memberCountRows, error: countError }] = workspaceIds.length > 0
      ? await Promise.all([
          supabase.from('workspaces').select('id, slug, name').in('id', workspaceIds),
          createAdminClient().from('workspace_members').select('workspace_id').eq('status', 'active').in('workspace_id', workspaceIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (workspacesError) {
      throw workspacesError;
    }
    if (countError) {
      throw countError;
    }

    const rows = buildWorkspaceRows({
      memberships: memberships ?? [],
      workspaces: workspaceRows ?? [],
      memberCounts: countActiveMembersByWorkspace(memberCountRows ?? []),
      activeWorkspaceId,
    });

    return <WorkspacesList workspaces={rows} />;
  }
  catch {
    return <WorkspacesList workspaces={[]} error />;
  }
}
