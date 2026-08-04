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
//   * `modules.created_at`  — structure (a module was added; `modules` has no
//                             `updated_at` column, so renames/moves are invisible
//                             to this signal — see the AC note in the PR)
//   * `runs.updated_at`     — execution (a run was started, stepped or finished)
//   * `projects.created_at` — the FLOOR: a project that has never been touched
//                             still has the moment it was created. This is what
//                             keeps a brand-new, empty project visible on Home
//                             instead of silently missing from the one screen
//                             that is supposed to help you find it.
//
// Bug activity is NOT counted. `bugs` would qualify structurally, but the
// defect surface on Home is BK-258's, and pulling it in here would make two
// widgets answer the same question from two different reads.
//
// COST SHAPE — bounded, and independent of workspace size
// ------------------------------------------------------
// Two phases, both bounded:
//   Phase A (ordering) — three capped, newest-first scans. A project whose last
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

  const projectIds = projects.map(project => project.id);

  // Phase A — the three activity scans, in parallel. Each returns the workspace's
  // newest rows for one signal; the FIRST row seen for a project is that
  // project's latest, because the scan is already ordered newest-first.
  const [atcActivity, moduleActivity, runActivity] = await Promise.all([
    db
      .from('atcs')
      .select('project_id, updated_at')
      .in('project_id', projectIds)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(HOME_PROJECT_ACTIVITY_SCAN_LIMIT),
    db
      .from('modules')
      .select('project_id, created_at')
      .in('project_id', projectIds)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(HOME_PROJECT_ACTIVITY_SCAN_LIMIT),
    db
      .from('runs')
      .select('project_id, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(HOME_PROJECT_ACTIVITY_SCAN_LIMIT),
  ]);

  if (
    atcActivity.error !== null
    || moduleActivity.error !== null
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

  for (const row of atcActivity.data ?? []) {
    recordLatest(row.project_id, row.updated_at);
  }
  for (const row of moduleActivity.data ?? []) {
    recordLatest(row.project_id, row.created_at);
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
