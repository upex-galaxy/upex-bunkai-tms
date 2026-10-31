import type { MemberRole } from '@lib/types';
import type { ReactNode } from 'react';
import { ChatDock } from '@components/chat/ChatDock';
import { ChatProvider } from '@components/chat/ChatProvider';
import { AppSidebar } from '@components/layout/AppSidebar';
import { WorkspaceDeletedNotice } from '@components/layout/WorkspaceDeletedNotice';
import { AuthProvider } from '@components/providers/auth-context';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { countAtcsInWorkspace } from '@lib/atcs/library';
import { listNotifications } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

// Resolves the global-shell data server-side (workspaces, active workspace,
// its projects, signed-in email) so the AppSidebar renders without a client
// fetch waterfall. RLS narrows every select to what the caller can see.
async function getShellData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, slug, name')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));

  let projects: { id: string, slug: string, name: string }[] = [];
  let userRole: MemberRole | null = null;
  // BK-209 (Slice 3: UI) — the bell badge's initial count, read the same way
  // every other server-driven shell element here is (a direct RLS-scoped
  // query/RPC, no round-trip through the API route) so the badge paints
  // correct on first load instead of a client waterfall. `limit: 1` — only
  // `unread_count` is needed here; the full item list is fetched lazily by
  // AppSidebar the first time the panel opens.
  let unreadCount = 0;
  let atcCount: number | null = null;
  if (activeWorkspaceId) {
    const { data } = await supabase
      .from('projects')
      .select('id, slug, name')
      .eq('workspace_id', activeWorkspaceId)
      .order('created_at', { ascending: true });
    projects = data ?? [];

    // Caller's role in the active workspace, for the account menu (BK-86).
    // RLS scopes this to the caller's own membership row. Re-resolved on every
    // render, so a workspace switch (router.refresh) reflects the new role.
    if (user) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', activeWorkspaceId)
        .eq('user_id', user.id)
        .maybeSingle();
      userRole = (membership?.role as MemberRole | undefined) ?? null;
    }

    const { data: notificationsPage } = await listNotifications(supabase, { workspaceId: activeWorkspaceId, limit: 1 });
    const page = notificationsPage as { unread_count?: number } | null;
    unreadCount = page?.unread_count ?? 0;

    // BK-439 — ATC Library badge, read once per navigation (layout re-render).
    atcCount = await countAtcsInWorkspace(supabase, activeWorkspaceId);
  }

  return { workspaces: list, activeWorkspaceId, projects, userEmail: user?.email ?? null, userId: user?.id ?? null, userRole, unreadCount, atcCount };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const shell = await getShellData();
  const activeWorkspaceName = shell.workspaces.find(w => w.id === shell.activeWorkspaceId)?.name ?? null;

  return (
    <AuthProvider>
      <ChatProvider>
        {/* BK-1129 — announces a workspace deleted under an open Runner. */}
        <Suspense fallback={null}>
          <WorkspaceDeletedNotice activeWorkspaceName={activeWorkspaceName} />
        </Suspense>
        <div className="grid h-screen min-h-0 grid-cols-[224px_1fr_auto] overflow-hidden bg-surface-0">
          <AppSidebar
            workspaces={shell.workspaces}
            activeWorkspaceId={shell.activeWorkspaceId}
            projects={shell.projects}
            userEmail={shell.userEmail}
            userRole={shell.userRole}
            initialUnreadCount={shell.unreadCount}
            atcCount={shell.atcCount}
          />
          <div className="flex min-h-0 flex-col overflow-hidden">
            {children}
          </div>
          {shell.activeWorkspaceId && shell.userId && (
            <ChatDock workspaceId={shell.activeWorkspaceId} userId={shell.userId} role={shell.userRole} />
          )}
        </div>
      </ChatProvider>
    </AuthProvider>
  );
}
