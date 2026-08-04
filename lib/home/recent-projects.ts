import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HOME_PROJECT_ACTIVITY_SCAN_LIMIT,
  HOME_RECENT_PROJECTS_LIMIT,
} from '@lib/home/constants';

// BK-257 — the workspace-level rollup behind Home's "Recent projects" widget:
// the workspace's projects ordered by most recent activity, each carrying the
// two counts the story's AC names (modules, ATCs) and its last-activity time.
//
// Shared deliberately by BOTH `/api/v1/workspaces/{id}/recent-projects` and the
// Home server component, so the widget and the endpoint can never disagree
// about a number. The server component calls this directly rather than fetching
// its own API over HTTP — same process, same RLS-scoped client, no extra hop.
//
// WHY "last activity" is composed here and not read from a column
// ---------------------------------------------------------------
// `activity_log` (0009) is the app's audit trail, but it carries NO project
// scope — no `project_id` column, and none of the ~20 RPCs that write to it put
// one in `payload` either (checked at authoring time across 0021-0055).
// Attributing an audit row to a project would mean joining `entity_id` back to
// a different table per `entity_type`, which PostgREST cannot express in one
// call. So the activity signal is read from the entities themselves, which DO
// carry `project_id` plus a maintained timestamp:
//
//   * `atcs.updated_at`     — authoring (an ATC was written or revised)
//   * `modules.created_at`  — structure (a module was added)
//   * `runs.updated_at`     — execution (a run was started, finished or aborted)
//   * `projects.created_at` — the FLOOR: a project that has never been touched
//                             still has the moment it was created. This is what
//                             keeps a brand-new, empty project visible on Home
//                             instead of silently missing from the one screen
//                             that is supposed to help you find it. That floor is
//                             also why AC3's literal "shows just that project"
//                             reading was not built — ratified as
//                             `master-design-plan.md` §5 D21(e).
//
// Two documented boundaries on that list, both schema-imposed, neither hidden:
// a module RENAME or MOVE does not advance the signal (`modules` carries no
// `updated_at`), and marking a run STEP does not either — `bunkai_mark_run_step`
// (0042) writes `run_steps` and `run_atcs` and takes a lock on `runs`, but never
// UPDATEs that row, so its `updated_at` trigger does not fire. A three-hour
// execution therefore reads as one timestamp: when the run was started.
//
// Bug activity is NOT counted. `bugs` would qualify structurally, but the
// defect surface on Home is BK-258's, and pulling it in here would make two
// widgets answer the same question from two different reads.
//
// COST SHAPE — bounded, and independent of workspace size
// ------------------------------------------------------
// Two phases, both bounded:
//   Phase A (ordering) — three capped, newest-first scans, each riding a
//     covering index added for exactly this access path (0059: `atcs
//     (project_id, updated_at desc)`, `modules (project_id, created_at desc)`,
//     `runs (workspace_id, updated_at desc)`) so the scans do not sort the
//     workspace's whole history on the app's landing page. A project whose last
//     activity falls outside the cap sorts below every project inside it, which
//     is where it belongs anyway; the only imprecision is the relative order of
//     projects that are ALL stale, and it can only ever understate staleness,
//     never invent freshness.
//   Phase B (counts) — exact `count: 'exact', head: true` reads, issued only for
//     the projects that actually make the page. Every number the member reads is
//     therefore exact, not a scan-derived floor, and the query count is O(limit)
//     rather than O(rows in the workspace).
//
// Every read runs through the caller's own client, so RLS (`projects`,
// `modules`, `atcs` in 0002/0004, `runs` in 0031) does the isolation: a forged
// workspace id yields zero rows rather than another tenant's numbers.

export interface RecentProject {
  id: string
  slug: string
  name: string
  moduleCount: number
  atcCount: number
  // ISO 8601. Never null — `projects.created_at` is the floor (see above).
  lastActivityAt: string
}

// `projects: []` means the workspace genuinely has none. A read that FAILED is
// `ok: false`, never an empty list — the caller has to tell a quiet workspace
// apart from a broken one, exactly as the Home banner and the projects index
// already do.
export type RecentProjectsResult
  = { ok: true, projects: RecentProject[] }
    | { ok: false };

interface ListRecentProjectsParams {
  workspaceId: string
  limit?: number
}

// PostgREST puts an `.in()` list in the GET query string, so the request line
// grows by roughly 40 URL-encoded bytes per project id against a fixed gateway
// header buffer (~8 KB on Kong). `atcs` and `modules` carry no workspace column,
// so the project ids are the only way to scope them — but the list is sent in
// batches rather than inlined whole, so a workspace with hundreds of projects
// costs more round trips instead of hitting a 414 that would leave its Home
// widget permanently on the error state. `runs` needs none of this: it has its
// own `workspace_id`.
const PROJECT_ID_BATCH = 100;

function batchProjectIds(projectIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let start = 0; start < projectIds.length; start += PROJECT_ID_BATCH) {
    batches.push(projectIds.slice(start, start + PROJECT_ID_BATCH));
  }
  return batches;
}

export async function listRecentProjects(
  db: SupabaseClient<Database>,
  { workspaceId, limit = HOME_RECENT_PROJECTS_LIMIT }: ListRecentProjectsParams,
): Promise<RecentProjectsResult> {
  const { data: projects, error: projectsError } = await db
    .from('projects')
    .select('id, slug, name, created_at')
    .eq('workspace_id', workspaceId);

  if (projectsError !== null) {
    return { ok: false };
  }
  if (projects === null || projects.length === 0) {
    return { ok: true, projects: [] };
  }

  const projectIdBatches = batchProjectIds(projects.map(project => project.id));

  // Phase A — the three activity scans, in parallel. Each returns the newest
  // rows for one signal; the FIRST row seen for a project is that project's
  // latest, because the scan is already ordered newest-first. The cap applies
  // per batch, so batching can only widen the sample, never narrow it.
  const [atcActivity, moduleActivity, runActivity] = await Promise.all([
    Promise.all(projectIdBatches.map(projectIds => db
      .from('atcs')
      .select('project_id, updated_at')
      .in('project_id', projectIds)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(HOME_PROJECT_ACTIVITY_SCAN_LIMIT))),
    Promise.all(projectIdBatches.map(projectIds => db
      .from('modules')
      .select('project_id, created_at')
      .in('project_id', projectIds)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(HOME_PROJECT_ACTIVITY_SCAN_LIMIT))),
    db
      .from('runs')
      .select('project_id, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(HOME_PROJECT_ACTIVITY_SCAN_LIMIT),
  ]);

  if (
    atcActivity.some(batch => batch.error !== null)
    || moduleActivity.some(batch => batch.error !== null)
    || runActivity.error !== null
  ) {
    return { ok: false };
  }

  const latestByProject = new Map<string, string>();
  const recordLatest = (projectId: string | null, at: string | null): void => {
    if (projectId === null || at === null) {
      return;
    }
    const current = latestByProject.get(projectId);
    if (current === undefined || at > current) {
      latestByProject.set(projectId, at);
    }
  };

  for (const batch of atcActivity) {
    for (const row of batch.data ?? []) {
      recordLatest(row.project_id, row.updated_at);
    }
  }
  for (const batch of moduleActivity) {
    for (const row of batch.data ?? []) {
      recordLatest(row.project_id, row.created_at);
    }
  }
  for (const row of runActivity.data ?? []) {
    recordLatest(row.project_id, row.updated_at);
  }

  // Newest first. `created_at` is the floor, so every project has a key and the
  // sort is total. Name is the tie-break so two projects created in the same
  // transaction (workspace bootstrap) do not swap places between renders.
  const ordered = projects
    .map(project => ({
      ...project,
      lastActivityAt: latestByProject.get(project.id) ?? project.created_at,
    }))
    .sort((a, b) =>
      a.lastActivityAt === b.lastActivityAt
        ? a.name.localeCompare(b.name)
        : (a.lastActivityAt < b.lastActivityAt ? 1 : -1),
    )
    .slice(0, limit);

  // Phase B — exact counts, for the page only.
  const counted = await Promise.all(ordered.map(async (project) => {
    const [modules, atcs] = await Promise.all([
      db
        .from('modules')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .is('archived_at', null),
      db
        .from('atcs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .is('archived_at', null),
    ]);

    if (modules.error !== null || atcs.error !== null) {
      return null;
    }

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      moduleCount: modules.count ?? 0,
      atcCount: atcs.count ?? 0,
      lastActivityAt: project.lastActivityAt,
    } satisfies RecentProject;
  }));

  // One failed count fails the widget. Rendering the row with a zero would
  // assert "this project has no ATCs" to someone whose project is full.
  if (counted.includes(null)) {
    return { ok: false };
  }

  return { ok: true, projects: counted.filter(project => project !== null) };
}
