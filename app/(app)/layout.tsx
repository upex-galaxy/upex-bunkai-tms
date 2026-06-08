import type { ReactNode } from 'react';
import { AppSidebar } from '@components/layout/AppSidebar';
import { AuthProvider } from '@components/providers/auth-context';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
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
  const visibleIds = new Set(list.map(w => w.id));
  const activeWorkspaceId = cookieActive && visibleIds.has(cookieActive)
    ? cookieActive
    : (list[0]?.id ?? null);

  let projects: { id: string, slug: string, name: string }[] = [];
  if (activeWorkspaceId) {
    const { data } = await supabase
      .from('projects')
      .select('id, slug, name')
      .eq('workspace_id', activeWorkspaceId)
      .order('created_at', { ascending: true });
    projects = data ?? [];
  }

  return { workspaces: list, activeWorkspaceId, projects, userEmail: user?.email ?? null };
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
        />
        <div className="flex min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </AuthProvider>
  );
}
