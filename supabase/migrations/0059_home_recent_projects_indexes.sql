-- 0059_home_recent_projects_indexes.sql — BK-257: covering indexes for the
-- Home "Recent projects" ordering scans.
--
-- WHY
-- ---
-- `listRecentProjects` (lib/home/recent-projects.ts) orders a workspace's
-- projects by their most recent activity, composed from three newest-first
-- scans: `atcs.updated_at`, `modules.created_at`, `runs.updated_at`. Before
-- this migration NONE of those three sort columns was indexed:
--
--   * atcs    — atcs_project_id_idx (0004) indexes project_id alone.
--   * modules — modules_project_id_idx (0002) and the partial
--               modules_project_active_idx (0014) both index project_id alone.
--   * runs    — runs_workspace_id_idx (0031) indexes workspace_id alone; the
--               two composite run indexes (0038, 0041) lead with test_id /
--               project_id + status + started_at, none of which this scan uses.
--
-- So each scan made Postgres materialise every matching row in the workspace
-- and top-N sort it. That runs on `/home` — the post-login landing page for
-- every member (app/page.tsx routes signed-in members there) — and its cost grew
-- with the workspace's entire authoring/execution history rather than with the
-- five rows the widget displays. `runs` is the worst case: it has no archive and
-- the scan applies no status filter, so it accumulates one row per execution
-- forever.
--
-- WHAT THIS BUYS
-- --------------
-- `runs_workspace_id_updated_at_idx` is the unambiguous win: equality on the
-- leading column plus the sort column next to it is exactly the shape a btree
-- can walk in order, so the scan becomes an index-ordered LIMIT with no sort
-- node at all.
--
-- The atcs/modules pair is scanned with `project_id = ANY(<workspace's ids>)`
-- rather than a single equality, so whether the sort disappears entirely
-- depends on the server's btree ScalarArrayOp support. Either way the index
-- makes the scan index-only over just this workspace's rows — no heap fetches,
-- and a sort input bounded by the workspace instead of the table. Both are
-- partial (`archived_at is null`) because both scans filter that way and
-- archived rows are dead weight in this access path, matching the precedent
-- modules_project_active_idx (0014) already set.
--
-- Additive only: three `create index if not exists`, no DDL on any existing
-- object, no behavioural change. Re-runnable.

-- Authoring signal: newest ATC revision per project.
create index if not exists atcs_project_id_updated_at_idx
  on public.atcs (project_id, updated_at desc)
  where archived_at is null;

-- Structure signal: newest module added per project. (`modules` carries no
-- `updated_at`, so creation is the only timestamp this signal can read.)
create index if not exists modules_project_id_created_at_idx
  on public.modules (project_id, created_at desc)
  where archived_at is null;

-- Execution signal: newest run touched in the workspace.
create index if not exists runs_workspace_id_updated_at_idx
  on public.runs (workspace_id, updated_at desc);
