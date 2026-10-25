import type { AtcLibraryRow } from '@lib/atcs/library';
import { AtcLibrarySkeleton, AtcLibraryView } from '@components/atcs/AtcLibraryView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { fetchAtcLibrary } from '@lib/atcs/library';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

// BK-439 — workspace-wide ATC Library. Cross-project index, lookup-and-launch
// only (search and facet filters ship in BK-440 / BK-441).
export default function AtcLibraryPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-stroke-2 px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">ATC Library</h1>
        <p className="text-sm text-fg-2">Every ATC across the projects in this workspace.</p>
      </div>
      <Suspense fallback={<AtcLibrarySkeleton />}>
        <AtcLibrarySection />
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
