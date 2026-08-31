import { DataExportView } from '@components/data-export/DataExportView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Settings > Data export (BK-508). Same thin-page shape as settings/billing:
// resolves the active workspace id via the cookie, hands it to the client
// view. Access control is NOT re-implemented here — assertExportAuthorized +
// RLS on the route are the single source of truth; a non-Owner caller simply
// sees the view's own error/forbidden state, same non-disclosure convention
// as BillingOverviewView.
export default async function SettingsDataExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/settings/data-export');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-1 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-fg-0">Data export</h1>
      <p className="mb-4 text-base text-fg-2">Request and download a complete export of this workspace's data.</p>
      <DataExportView workspaceId={activeWorkspaceId} />
    </div>
  );
}
