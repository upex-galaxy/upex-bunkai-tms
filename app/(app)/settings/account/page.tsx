import type { MemberRole } from '@lib/types';
import { IdentityCard } from '@components/settings/IdentityCard';
import { WorkspacesList, WorkspacesListSkeleton } from '@components/settings/WorkspacesList';
import { buildWorkspaceRows, countActiveMembersByWorkspace } from '@lib/account/workspaces';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

// Settings > Account (BK-87 — TC-AC1, TC-AC3 from PR1; TC-AC2/6/7 from PR2).
// Identity and the workspace list are two independent async sections (TD7):
// identity is awaited directly below so it renders with the rest of the
// page, while the workspace list is its own async server component
// (`WorkspacesSection`) inside a dedicated `<Suspense>` boundary further
// down, so a slow or failing workspace query can never block or blank the
// identity card next to it.
export default async function SettingsAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The route layout above already guards this tree; this check is
  // unreachable in practice but keeps the page self-defensive on its own.
  if (!user) {
    redirect('/login?next=/settings/account');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, slug, name')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));
  const activeWorkspace = list.find(w => w.id === activeWorkspaceId) ?? null;

  // Caller's role + joined_at in the active workspace (TD4) — same
  // cookie-driven resolution + membership read (app)/layout.tsx's
  // getShellData() already runs, widened by one column (joined_at).
  let role: MemberRole | null = null;
  let memberSince: string | null = null;
  if (activeWorkspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, joined_at')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    role = (membership?.role as MemberRole | undefined) ?? null;
    memberSince = membership?.joined_at ?? null;
  }

  // Email + last_sign_in_at live in auth.users (not exposed via PostgREST) —
  // the exact admin-lookup pattern GET /api/v1/me already runs. Best-effort:
  // a failed lookup still renders the page with the session's own email.
  let email = user.email ?? null;
  let lastActive: string | null = null;
  try {
    const { data: lookup, error } = await createAdminClient().auth.admin.getUserById(user.id);
    if (!error) {
      email = lookup.user?.email ?? email;
      lastActive = lookup.user?.last_sign_in_at ?? null;
    }
  }
  catch {
    // Silent fallback: keep the session's email, no last-active reading.
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Account</h1>
        <p className="text-base text-fg-2">Your identity and workspaces in Bunkai.</p>
      </div>

      <IdentityCard
        email={email}
        role={role}
        workspaceName={activeWorkspace?.name ?? null}
        workspaceSlug={activeWorkspace?.slug ?? null}
        memberSince={memberSince}
        lastActive={lastActive}
      />

      <Suspense fallback={<WorkspacesListSkeleton />}>
        <WorkspacesSection userId={user.id} activeWorkspaceId={activeWorkspaceId} />
      </Suspense>
    </div>
  );
}

// Workspace membership list (BK-87 PR2 — TC-AC2, TC-AC6, TC-AC7). A separate
// async server component (not the page itself) so it streams inside its own
// `<Suspense>` boundary above, independent of the identity fetch. The query
// shape reuses `onboarding/page.tsx`'s active-membership check (TD5), widened
// from `.limit(1)` to all rows, joined to `workspaces` and to one grouped
// member-count query — manual JS join, matching this repo's existing
// convention (see `workspaces/[id]/members/page.tsx`, `atcs/[atcId]/page.tsx`)
// rather than a PostgREST embedded-select string.
//
// TD7: any failure here is caught locally and rendered as the error state —
// it must never throw up to the route's `error.tsx`, which would also take
// down the already-rendered `IdentityCard`.
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

    // The active-member count spans every member of the workspace, not just
    // rows the caller's own RLS grants them (workspace_members RLS only
    // exposes other members' rows to admin/owner callers) — so this one
    // aggregate deliberately goes through the admin client, same as the
    // identity lookup above. It only ever returns a workspace_id (no PII),
    // scoped to workspaces the caller already belongs to.
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
