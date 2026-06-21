import type { MemberRole } from '@lib/types';
import type { ReactNode } from 'react';
import { AppSidebar } from '@components/layout/AppSidebar';
import { AuthProvider } from '@components/providers/auth-context';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';

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
  }

  return { workspaces: list, activeWorkspaceId, projects, userEmail: user?.email ?? null, userRole };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const shell = await getShellData();

  return (
    <AuthProvider>
      <div className="grid h-screen min-h-0 grid-cols-[224px_1fr] overflow-hidden bg-surface-0">
        <AppSidebar
          workspaces={shell.workspaces}
          activeWorkspaceId={shell.activeWorkspaceId}
          projects={shell.projects}
          userEmail={shell.userEmail}
          userRole={shell.userRole}
        />
        <div className="flex min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </AuthProvider>
  );
}
