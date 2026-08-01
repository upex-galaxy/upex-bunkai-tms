import type { CoveragePayload } from '@components/coverage/ProjectCoverageView';
import type { RecoveryCycleRawPayload } from '@lib/metrics/recovery-cycle';
import { ProjectCoverageSkeleton, ProjectCoverageView } from '@components/coverage/ProjectCoverageView';
import { RecoveryCycleSection, RecoveryCycleSkeleton } from '@components/metrics/RecoveryCycleSection';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { buildRecoveryCycleReport } from '@lib/metrics/recovery-cycle';
import { reportProjectCoverage, reportProjectRecoveryCycles } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

// BK-46 — the project-wide Coverage view (`/projects/[projectSlug]/metrics`).
// Read server-side so the screen paints complete instead of waterfalling a
// client fetch after hydration (same shape as `runs/page.tsx`, BK-38). This
// route sits INSIDE the existing `[projectSlug]` layout — the layout's
// `ProjectShell` (sidebar/topbar/explorer) is already mounted, so this file
// renders ONLY the content slot.
//
// One read, one rulebook: this calls the SAME SECURITY DEFINER RPC the
// headless route uses (`bunkai_report_project_coverage` via the
// `reportProjectCoverage` wrapper) rather than fetching the app's own API
// route from a server component.
//
// Unlike the Runs Report, there is no client-side re-fetch after mount: the
// whole payload is small and bounded (Technical Decision,
// 0048_project_coverage_report.sql) and the segment filter is a pure
// client-side re-render (`ProjectCoverageView`).
//
// SHARED ROUTE with BK-47 (avalanche-2026-07 coordination flag, queue.md):
// master-design-plan.md §4.7 maps BOTH this ticket AND BK-47 ("Time to
// green") into the SAME mockup screen (`metrics-dashboard.html`) and this
// SAME route — BK-46 owns the KPI row + coverage-by-module table + no-
// coverage panel (the `<CoverageSection>` block below); BK-47 owns a
// separate recovery-cycle/time-to-green section. This file got here first,
// so it OWNS the page shell: BK-47 should add its own `<Suspense>`-wrapped
// section as a SIBLING inside the `<div className="flex flex-col gap-6">`
// wrapper below, not restructure this file's existing Coverage section.
export default async function ProjectCoveragePage({ params }: PageProps) {
  const { projectSlug } = await params;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<ProjectCoverageSkeleton />}>
        <ProjectCoverageSection projectSlug={projectSlug} />
      </Suspense>
      {/* BK-47 (Time to green): sibling section per the coordination comment
          above — same page, own component, own data fetch. */}
      <Suspense fallback={<RecoveryCycleSkeleton />}>
        <RecoveryCycleSectionServer projectSlug={projectSlug} />
      </Suspense>
    </div>
  );
}

async function ProjectCoverageSection({ projectSlug }: { projectSlug: string }) {
  const supabase = await createClient();

  // Resolve `projectId` the SAME way `ProjectLayout` / `runs/page.tsx` do
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

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectErr || !project) { notFound(); }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No session.');
    }

    const { data, error } = await reportProjectCoverage(supabase, {
      actorUserId: user.id,
      projectId: project.id,
    });
    if (error) {
      throw error;
    }

    return <ProjectCoverageView initialPayload={data as unknown as CoveragePayload} />;
  }
  catch {
    return <ProjectCoverageView initialPayload={null} initialError="Could not load the coverage report." />;
  }
}

// BK-47 — the project-wide recovery-cycle view, sibling of ProjectCoverageSection
// above. Deliberately NOT extracted into a shared "resolve projectId" helper:
// each ticket's section owns its own data fetch end to end (same reasoning
// the coordination comment gives for keeping the component files themselves
// separate) — the ~15-line workspace/project resolution block is duplicated
// on purpose, not an oversight.
async function RecoveryCycleSectionServer({ projectSlug }: { projectSlug: string }) {
  const supabase = await createClient();

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

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectErr || !project) { notFound(); }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No session.');
    }

    const { data, error } = await reportProjectRecoveryCycles(supabase, {
      actorUserId: user.id,
      projectId: project.id,
    });
    if (error) {
      throw error;
    }

    const report = buildRecoveryCycleReport(data as unknown as RecoveryCycleRawPayload, Date.now());
    return <RecoveryCycleSection initialPayload={report} />;
  }
  catch {
    return <RecoveryCycleSection initialPayload={null} initialError="Could not load the recovery-cycle report." />;
  }
}
