import type { StoryTraceabilityPayload } from '@lib/traceability/chain-view';
import { TraceabilityChainSkeleton, TraceabilityChainView } from '@components/traceability/TraceabilityChainView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { reportStoryTraceability } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ story?: string }>
}

// BK-45 — the per-story evidence chain (`/projects/[projectSlug]/traceability?story={userStoryId}`,
// route + entry-point ratified in Jira comment 12171, AI Product Owner
// decision "A4 + V1"). Sits inside the existing `[projectSlug]` layout — the
// layout's `ProjectShell` (sidebar/topbar/explorer) is already mounted, so
// this file renders ONLY the content slot, same shape as `metrics/page.tsx`
// (BK-46/47).
//
// The initial read happens server-side (fast first paint, no waterfall), the
// same SECURITY DEFINER RPC (`bunkai_report_story_traceability` via the
// `reportStoryTraceability` wrapper) the headless `GET /api/v1/projects/{id}/traceability`
// route uses — one read, one rulebook. `TraceabilityChainView` is a client
// component so the error state's Retry button can re-fetch through that same
// API route without a full page reload.
export default async function ProjectTraceabilityPage({ params, searchParams }: PageProps) {
  const { projectSlug } = await params;
  const { story: userStoryId } = await searchParams;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Suspense fallback={<TraceabilityChainSkeleton />}>
        <TraceabilitySection projectSlug={projectSlug} userStoryId={userStoryId ?? null} />
      </Suspense>
    </div>
  );
}

async function TraceabilitySection({ projectSlug, userStoryId }: { projectSlug: string, userStoryId: string | null }) {
  const supabase = await createClient();

  // Resolve `projectId` the SAME way `ProjectLayout` / `metrics/page.tsx` do
  // (BK-147): a Project slug is unique only PER WORKSPACE.
  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieActive,
    (workspaceRows ?? []).map(w => w.id),
  );
  if (!activeWorkspaceId) { notFound(); }

  // BK-50 — `name` added to both reads (previously `id`-only) so the
  // exported snapshot's "workspace / project / story identity" line (PO
  // ruling, comment 12239 §4) can be threaded down without a second
  // round trip.
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectErr || !project) { notFound(); }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', activeWorkspaceId)
    .maybeSingle();
  const workspaceName = workspace?.name ?? '';

  if (!userStoryId) {
    return (
      <TraceabilityChainView
        projectId={project.id}
        userStoryId={null}
        initialPayload={null}
        projectName={project.name}
        workspaceName={workspaceName}
      />
    );
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No session.');
    }

    const { data, error } = await reportStoryTraceability(supabase, {
      actorUserId: user.id,
      userStoryId,
    });
    if (error) {
      throw error;
    }

    return (
      <TraceabilityChainView
        projectId={project.id}
        userStoryId={userStoryId}
        initialPayload={data as unknown as StoryTraceabilityPayload}
        projectName={project.name}
        workspaceName={workspaceName}
      />
    );
  }
  catch {
    return (
      <TraceabilityChainView
        projectId={project.id}
        userStoryId={userStoryId}
        initialPayload={null}
        initialError="Could not load the evidence chain."
        projectName={project.name}
        workspaceName={workspaceName}
      />
    );
  }
}
