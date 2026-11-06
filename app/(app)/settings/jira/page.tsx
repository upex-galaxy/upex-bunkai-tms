import type { JiraConnectionView } from '@lib/jira/connection-client';
import { JiraConnectionForm } from '@components/settings/JiraConnectionForm';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { readConnectionMeta } from '@lib/jira/connection-access';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

// Settings > Jira (BK-1170). Owner / admin only: the role is read LIVE through the
// caller's own client (row-level security), and anyone else gets the same 404 as a
// route that does not exist. The connection row is read with the admin client
// because the table has no client policy; `readConnectionMeta` never selects the
// token or its Vault id, so nothing secret can reach this page's props.
export default async function SettingsJiraPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/settings/jira');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));
  if (!activeWorkspaceId) {
    notFound();
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membership?.role !== 'owner' && membership?.role !== 'admin') {
    notFound();
  }

  const meta = await readConnectionMeta(createAdminClient(), activeWorkspaceId);
  const initial: JiraConnectionView | null = meta
    ? { siteUrl: meta.site_url, email: meta.email, updatedAt: meta.updated_at }
    : null;

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-1 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-fg-0">Jira</h1>
      <p className="mb-4 text-base text-fg-2">Connect this workspace to your Jira Cloud site for imports and defect sync.</p>
      <JiraConnectionForm workspaceId={activeWorkspaceId} initial={initial} />
    </div>
  );
}
