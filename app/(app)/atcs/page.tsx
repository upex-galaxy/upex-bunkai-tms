import type { AtcArchivedRow, AtcLibraryRow } from '@lib/atcs/library';
import { AtcArchivedLibraryView } from '@components/atcs/AtcArchivedLibraryView';
import { AtcLibrarySkeleton, AtcLibraryView, AtcLibraryViewToggle } from '@components/atcs/AtcLibraryView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { fetchArchivedAtcs, fetchAtcLibrary } from '@lib/atcs/library';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

// BK-439 — workspace-wide ATC Library. Cross-project index, lookup-and-launch
// only (search and facet filters ship in BK-440 / BK-441). BK-571 adds the
// opt-in archived view (`?view=archived`); the active view is unchanged.
interface AtcLibraryPageProps {
  searchParams: Promise<{ view?: string | string[] }>
}

const ATC_ARCHIVED_VIEW_NOTE = 'ATCs archived with their Module or User Story are not listed here. They come back when that parent is restored.';

export default async function AtcLibraryPage({ searchParams }: AtcLibraryPageProps) {
  const { view } = await searchParams;
  const archived = view === 'archived';
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stroke-2 px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg-0">ATC Library</h1>
          <p className="text-sm text-fg-2">Every ATC across the projects in this workspace.</p>
          {archived && (
            <p data-testid="atc-archived-view-note" className="mt-1 text-xs text-fg-3">{ATC_ARCHIVED_VIEW_NOTE}</p>
          )}
        </div>
        <AtcLibraryViewToggle active={archived ? 'archived' : 'active'} />
      </div>
      <Suspense key={archived ? 'archived' : 'active'} fallback={<AtcLibrarySkeleton />}>
        {archived ? <AtcArchivedLibrarySection /> : <AtcLibrarySection />}
      </Suspense>
    </div>
  );
}

// A failed read is handed to the view as its error state — it must never throw
// to the route error boundary and take the app shell with it.
async function AtcLibrarySection() {
  try {
    const supabase = await createClient();
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    const cookieStore = await cookies();
    const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    const workspaceId = resolveActiveWorkspaceId(cookieActive, (workspaces ?? []).map(w => w.id));

    // No workspace is the empty workspace, not an error.
    const rows: AtcLibraryRow[] = workspaceId === null ? [] : await fetchAtcLibrary(supabase, workspaceId);
    return <AtcLibraryView rows={rows} error={null} />;
  }
  catch (err) {
    return <AtcLibraryView rows={[]} error={err instanceof Error ? err.message : 'ATC_INDEX_FAILED'} />;
  }
}

async function AtcArchivedLibrarySection() {
  try {
    const supabase = await createClient();
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    const cookieStore = await cookies();
    const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    const workspaceId = resolveActiveWorkspaceId(cookieActive, (workspaces ?? []).map(w => w.id));

    // Restore is offered to the same roles that can write in the workspace: the
    // project layout's rule (member and above). The API stays the authority.
    let canWrite = false;
    if (workspaceId !== null) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .maybeSingle();
        canWrite = membership != null && membership.role !== 'viewer';
      }
    }

    const rows: AtcArchivedRow[] = workspaceId === null ? [] : await fetchArchivedAtcs(supabase, workspaceId);
    return <AtcArchivedLibraryView rows={rows} error={null} canWrite={canWrite} />;
  }
  catch (err) {
    return <AtcArchivedLibraryView rows={[]} error={err instanceof Error ? err.message : 'ATC_ARCHIVED_INDEX_FAILED'} canWrite={false} />;
  }
}
