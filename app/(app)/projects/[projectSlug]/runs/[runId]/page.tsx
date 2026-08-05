import type { LinkedBugSummary, RunDetail } from '@components/runs/RunnerView';
import { RunnerView } from '@components/runs/RunnerView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { formatBugListRow } from '@lib/bugs/list-view';
import { getRunExpanded } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, runId: string }>
  // BK-212 Slice 2 — `bugId`, when present, is the deep-link target a bug
  // notification's href carries (lib/notifications/entity-routes.ts's `bug`
  // case). Optional and additive: the page renders exactly as it did before
  // this story whenever it is absent.
  searchParams: Promise<{ bugId?: string }>
}

// BK-34 — read-only expanded Run detail page (the manual runner). Runs are
// workspace-scoped; the read is keyed by `runId` + active-workspace membership,
// not by project (`projectSlug` is the route's display/back-link context only).
// One read, one rulebook: this page calls the SAME SECURITY DEFINER RPC the
// headless API route uses (`bunkai_get_run_expanded`), so both surfaces return
// byte-identical data. Missing / not-visible / foreign-workspace Runs all
// collapse into one safe `notFound()` (non-disclosure).
export default async function RunDetailPage({ params, searchParams }: PageProps) {
  const { projectSlug, runId } = await params;
  const { bugId } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { notFound(); }

  // Resolve the active workspace exactly as the Test detail page does, so the
  // explorer's notion of "current workspace" is respected on deep-link.
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

  const { data, error } = await getRunExpanded(supabase, {
    actorUserId: user.id,
    runId,
  });
  if (error || !data) { notFound(); }

  const run = data as unknown as RunDetail;

  // BK-40 — per-ATC module name for the "Report bug" dialog's read-only
  // Module field. `run.module_name` is only the chain-position-1 snapshot
  // (0040_run_module_snapshot.sql) — wrong whenever the Test's chain spans
  // more than one module, which the same migration's own header documents as
  // an acknowledged, normal scenario, not an edge case. A small, cheap,
  // redundant read (same "don't touch the shared layout for one page's data"
  // convention as the Module-picker query below) rather than extending the
  // shared `bunkai_run_json` composer for a single display field.
  const atcIds = run.atcs.map(atc => atc.atc_id).filter((id): id is string => id != null);
  const { data: atcModuleRows } = atcIds.length > 0
    ? await supabase.from('atcs').select('id, module_id').in('id', atcIds)
    : { data: [] as { id: string, module_id: string }[] };
  const moduleIds = Array.from(new Set((atcModuleRows ?? []).map(a => a.module_id)));
  const { data: moduleNameRows } = moduleIds.length > 0
    ? await supabase.from('modules').select('id, name').in('id', moduleIds)
    : { data: [] as { id: string, name: string }[] };
  const moduleNameById = new Map((moduleNameRows ?? []).map(m => [m.id, m.name]));
  const atcModuleNames: Record<string, string> = {};
  for (const row of atcModuleRows ?? []) {
    const name = moduleNameById.get(row.module_id);
    if (name) { atcModuleNames[row.id] = name; }
  }

  // BK-36 / BK-39 / BK-35 (Q4) / BK-40 — aborting, finishing, marking a step,
  // and reporting a bug are all member+ write actions sharing the same role
  // gate (the API's `atc:write` capability). Mirror the Test detail page's
  // role derivation: viewers see the runner read-only (no Abort/Finish/mark/
  // Report-bug affordance at all — structurally absent, not just hidden);
  // the bunkai_abort_run / bunkai_finish_run / bunkai_mark_run_step /
  // bunkai_create_bug RPCs stay the authoritative write gates regardless of
  // the UI.
  const { data: memberRow } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  const canManageRun = ['member', 'admin', 'owner'].includes(memberRow?.role ?? '');

  // BK-212 Slice 2 — resolve the deep-linked bug (if any), scoped to THIS
  // run. `bugs` RLS (bugs_select_workspace_member, 0046_bugs.sql) already
  // gates this plain read to the caller's own workspace membership, same
  // convention as the atcs/modules/workspace_members reads above. A
  // foreign/nonexistent/RLS-hidden bug id, or one whose own `run_id` does not
  // match THIS run (a stale/foreign `bugId`, never trusted blindly), both
  // degrade to no linked-bug context — the page renders exactly as it did
  // before this story, not an error.
  let linkedBug: LinkedBugSummary | null = null;
  if (bugId) {
    const { data: bugRow } = await supabase
      .from('bugs')
      .select('id, title, severity, status, run_id, run_step_id')
      .eq('id', bugId)
      .maybeSingle();
    if (bugRow && bugRow.run_id === run.id) {
      const formatted = formatBugListRow({ ...bugRow, module: null });
      linkedBug = {
        id: formatted.id,
        title: formatted.title,
        severityLabel: formatted.severityLabel,
        severityToken: formatted.severityToken,
        statusLabel: formatted.statusLabel,
        statusToken: formatted.statusToken,
        runStepId: bugRow.run_step_id,
      };
    }
  }

  return (
    <RunnerView
      run={run}
      projectSlug={projectSlug}
      canAbort={canManageRun}
      canFinish={canManageRun}
      canMark={canManageRun}
      canReportBug={canManageRun}
      atcModuleNames={atcModuleNames}
      linkedBug={linkedBug}
    />
  );
}
