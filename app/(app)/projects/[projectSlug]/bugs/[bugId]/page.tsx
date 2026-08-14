import type { BugDetailInput } from '@lib/bugs/detail-view';
import { BugDetailView } from '@components/bugs/BugDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { getBugJson, resolveActivityActors } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string, bugId: string }>
}

// BK-337 — the read-only defect detail record
// (`/projects/[projectSlug]/bugs/[bugId]`). Clones `bugs/page.tsx:41-61`'s
// workspace-then-slug resolution (two `notFound()` calls), reads the bug
// through the caller's OWN RLS-scoped client (never `createAdminClient()` —
// `bunkai_bug_json` is SECURITY INVOKER), then re-checks the resolved
// Project against the bug's OWN `project_id` (TQ3 / Scenario E-3) — the URL's
// `projectSlug` is never trusted blindly, since RLS alone gates by workspace,
// not by project.
export default async function BugDetailPage({ params }: PageProps) {
  const { projectSlug, bugId } = await params;

  return (
    <Suspense fallback={<BugDetailSkeleton />}>
      <BugDetailSection projectSlug={projectSlug} bugId={bugId} />
    </Suspense>
  );
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

async function BugDetailSection({ projectSlug, bugId }: { projectSlug: string, bugId: string }) {
  // Scenario E-2 — a malformed id renders the SAME not-found surface as an
  // unknown one; no distinct "bad request" page exists in this shell (that
  // shape is API-only, per TQ3).
  if (!isUuid(bugId)) {
    notFound();
  }

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

  // `bunkai_bug_json` returns null both for "does not exist" and for
  // "exists, but RLS hides it from this caller" (Scenario E-1's
  // non-disclosure boundary) — both render the SAME not-found page.
  const { data: bugData, error: bugError } = await getBugJson(supabase, bugId);
  if (bugError) { notFound(); }
  if (!bugData) { notFound(); }
  const bug = bugData as unknown as BugDetailInput;

  // TQ3 (Scenario E-3) — the URL asserts this bug belongs to `projectSlug`.
  // A well-formed id in a DIFFERENT project within the SAME workspace would
  // otherwise render, since RLS only gates at the workspace boundary. This
  // re-check can only ever NARROW the answer, never widen it.
  const bugProjectId = (bug as unknown as { project_id: string }).project_id;
  if (bugProjectId !== project.id) { notFound(); }

  // AC1.1 ("Filed by {name}") + E-6 (assignee) — both resolved the SAME way
  // GET /api/v1/activity / GET /api/v1/bugs already resolve actor/assignee
  // display info (`bunkai_resolve_activity_actors`, ADR-0011), keyed on the
  // BUG'S OWN `workspace_id` (never the cookie's active workspace) — a
  // multi-workspace member can legitimately have `activeWorkspaceId` point
  // elsewhere while still holding a real membership in the bug's own
  // workspace. Both ids are resolved in ONE call — the reporter is
  // guaranteed to appear as the `bug.filed` activity actor (bunkai_create_bug
  // writes `actor_user_id = p_actor_user_id = created_by`), but an assignee
  // who was never the actor on any event for this bug resolves with a null
  // email (0047_activity_actor_resolve_scope.sql's provenance filter,
  // deliberately not relaxed) — the UI's Unassigned/"Assigned" fallback
  // absorbs that, expected rather than a bug.
  const bugWorkspaceId = (bug as unknown as { workspace_id: string }).workspace_id;
  const assigneeUserId = (bug as unknown as { assignee_user_id: string | null }).assignee_user_id;
  const reporterUserId = (bug as unknown as { created_by: string | null }).created_by;
  const actorIds = [...new Set([assigneeUserId, reporterUserId].filter((id): id is string => id !== null))];
  const emailById = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: resolvedActors } = await resolveActivityActors(supabase, {
      workspaceId: bugWorkspaceId,
      userIds: actorIds,
    });
    for (const actor of resolvedActors ?? []) {
      emailById.set(actor.user_id, actor.email);
    }
  }
  const assigneeEmail = assigneeUserId ? (emailById.get(assigneeUserId) ?? null) : null;
  const reporterEmail = reporterUserId ? (emailById.get(reporterUserId) ?? null) : null;

  return (
    <BugDetailView
      bug={bug}
      assigneeEmail={assigneeEmail}
      reporterEmail={reporterEmail}
      projectSlug={projectSlug}
    />
  );
}

export function BugDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy="true" data-testid="bug-detail-skeleton">
      <div className="h-8 w-2/3 animate-pulse rounded-2 bg-surface-3" />
      <div className="h-4 w-1/3 animate-pulse rounded-2 bg-surface-3" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="h-32 animate-pulse rounded-3 bg-surface-2" />
          <div className="h-40 animate-pulse rounded-3 bg-surface-2" />
          <div className="h-24 animate-pulse rounded-3 bg-surface-2" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-48 animate-pulse rounded-3 bg-surface-2" />
          <div className="h-32 animate-pulse rounded-3 bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
