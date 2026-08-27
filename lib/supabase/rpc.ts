import type { Database, Json } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// Typed wrappers around our `bunkai_*` RPCs. Keeps call-sites short and
// guarantees argument names stay in sync with the migration files. Each
// wrapper returns the `{ data, error }` shape Postgrest already produces so
// callers can branch on `error` uniformly.

type Client = SupabaseClient<Database>;

export interface BootstrapWorkspaceArgs {
  slug: string
  name: string
}

export async function bootstrapWorkspace(supabase: Client, args: BootstrapWorkspaceArgs) {
  return supabase.rpc('bunkai_bootstrap_workspace', {
    p_slug: args.slug,
    p_name: args.name,
  });
}

// BK-90 (Slice A) — self-service "leave workspace". The SECURITY DEFINER RPC
// (migration 0044) atomically validates active membership, applies the
// last-membership + count-based sole-owner guards, deletes the caller's
// workspace_members row, and soft-revokes their workspace-scoped PATs.
export interface LeaveWorkspaceArgs {
  workspaceId: string
}

export async function leaveWorkspace(supabase: Client, args: LeaveWorkspaceArgs) {
  return supabase.rpc('bunkai_leave_workspace', {
    p_workspace_id: args.workspaceId,
  });
}

// BK-21 unified the web editor's save onto bunkai_update_atc (the canonical
// edit RPC), so the legacy bunkai_save_atc wrapper (SECURITY INVOKER, no event
// emission) is no longer called from app code. The DB function is retained
// (migration 0007, append-only) but has no TS wrapper.

// BK-18 — ATC create/edit via the SECURITY DEFINER RPCs. These take the
// resolved actor user id explicitly (PAT callers have no auth.uid()) and the
// RPC gates workspace membership against it. They return the composed ATC json
// (header + ordered steps/assertions + acceptance_criterion_ids).

export interface AtcStepInput {
  position?: number
  content: string
  input_data?: string | null
  expected?: string | null
}

export interface AtcAssertionInput {
  content: string
}

export interface CreateAtcArgs {
  actorUserId: string
  moduleId: string
  userStoryId: string
  title: string
  layer: string
  tags: string[]
  steps: AtcStepInput[]
  assertions: AtcAssertionInput[]
  acIds: string[]
}

export async function createAtc(supabase: Client, args: CreateAtcArgs) {
  return supabase.rpc('bunkai_create_atc', {
    p_actor_user_id: args.actorUserId,
    p_module_id: args.moduleId,
    p_user_story_id: args.userStoryId,
    p_title: args.title,
    p_layer: args.layer,
    p_tags: args.tags,
    p_steps: args.steps as unknown as Json,
    p_assertions: args.assertions as unknown as Json,
    p_ac_ids: args.acIds,
  });
}

export interface UpdateAtcArgs {
  actorUserId: string
  atcId: string
  ifMatch: number | null
  title: string
  layer: string
  tags: string[]
  steps: AtcStepInput[]
  assertions: AtcAssertionInput[]
  acIds: string[]
}

export async function updateAtc(supabase: Client, args: UpdateAtcArgs) {
  return supabase.rpc('bunkai_update_atc', {
    p_actor_user_id: args.actorUserId,
    p_atc_id: args.atcId,
    // The RPC param is `int` (typed non-null) but accepts NULL to skip the
    // If-Match version guard. supabase-js serializes null → SQL NULL.
    p_if_match: args.ifMatch as number,
    p_title: args.title,
    p_layer: args.layer,
    p_tags: args.tags,
    p_steps: args.steps as unknown as Json,
    p_assertions: args.assertions as unknown as Json,
    p_ac_ids: args.acIds,
  });
}

export async function getAtc(supabase: Client, args: { actorUserId: string, atcId: string }) {
  return supabase.rpc('bunkai_get_atc', {
    p_actor_user_id: args.actorUserId,
    p_atc_id: args.atcId,
  });
}

// BK-23 — deep-copy an ATC (header + ordered steps/assertions + AC bindings)
// into a new ATC with a fresh slug and version = 1. `title` is optional; when
// omitted the RPC defaults the copy's title to `<source> (copy)`. Same
// explicit-actor contract as the other ATC wrappers; returns the composed json
// of the NEW ATC.
export async function duplicateAtc(
  supabase: Client,
  args: { actorUserId: string, sourceAtcId: string, title?: string },
) {
  return supabase.rpc('bunkai_duplicate_atc', {
    p_actor_user_id: args.actorUserId,
    p_source_atc_id: args.sourceAtcId,
    p_title: args.title ?? undefined,
  });
}

// BK-20 — project-scoped ATC full-text search. The SECURITY DEFINER RPC takes
// the resolved actor explicitly (PAT callers have no auth.uid()) and restricts
// the result set to the actor's active workspace memberships — any caller scope
// is ignored — AND to the single project the caller names (projectId, required).
// A project the actor can't reach yields zero rows. Returns a jsonb array of
// lightweight rows (id/slug/title/layer/status/module_path), ranked relevance ×
// recency, capped by p_limit.
export interface SearchAtcsArgs {
  actorUserId: string
  query: string
  projectId: string
  moduleId?: string | null
  layer?: string | null
  limit?: number
}

export async function searchAtcs(supabase: Client, args: SearchAtcsArgs) {
  return supabase.rpc('bunkai_search_atcs', {
    p_actor_user_id: args.actorUserId,
    p_query: args.query,
    p_project_id: args.projectId,
    p_module_id: args.moduleId ?? undefined,
    p_layer: args.layer ?? undefined,
    p_limit: args.limit ?? undefined,
  });
}

// BK-22 — read-only "used in N tests" report for one ATC. Same explicit-actor
// contract as the other ATC wrappers (PAT callers have no auth.uid()); the
// SECURITY DEFINER RPC resolves the ATC's workspace, gates the actor's active
// membership of it, then returns the distinct Tests that chain the ATC.
// Returns `{ count, used_in: [{ test_id, title, positions }] }`. A reachable
// ATC with no chaining Tests returns `count: 0` + `used_in: []` (not an error);
// a nonexistent / cross-workspace / archived ATC raises a uniform not_found.
export async function atcUsage(supabase: Client, args: { actorUserId: string, atcId: string }) {
  return supabase.rpc('bunkai_atc_usage', {
    p_actor_user_id: args.actorUserId,
    p_atc_id: args.atcId,
  });
}

// BK-27 — Test create via the SECURITY DEFINER RPC. Same explicit-actor
// contract as the ATC wrappers; returns the composed Test json (header +
// ordered chain steps).

export interface CreateTestArgs {
  actorUserId: string
  workspaceId: string
  title: string
  atcIds: string[]
}

export async function createTest(supabase: Client, args: CreateTestArgs) {
  return supabase.rpc('bunkai_create_test', {
    p_actor_user_id: args.actorUserId,
    p_workspace_id: args.workspaceId,
    p_title: args.title,
    p_atc_ids: args.atcIds,
  });
}

// BK-32 — read-only expanded Test view. Same explicit-actor contract as the
// other wrappers; returns the composed Test json (header + ordered chain of
// expanded ATCs).
export async function getTestExpanded(supabase: Client, args: { actorUserId: string, testId: string }) {
  return supabase.rpc('bunkai_get_test_expanded', {
    p_actor_user_id: args.actorUserId,
    p_test_id: args.testId,
  });
}

// BK-28 — reorder the ATC chain inside a Test. `stepIds` is the COMPLETE new
// order of existing test_steps.id values (a permutation). `ifMatch` is the
// optimistic-lock version token (null skips the guard). The RPC enforces set
// equality + version under FOR UPDATE, detects no-ops (no bump, no event), and
// returns the composed Test json — same explicit-actor contract as the others.
export interface ReorderTestStepsArgs {
  actorUserId: string
  testId: string
  ifMatch: number | null
  stepIds: string[]
}

export async function reorderTestSteps(supabase: Client, args: ReorderTestStepsArgs) {
  return supabase.rpc('bunkai_reorder_test_steps', {
    p_actor_user_id: args.actorUserId,
    p_test_id: args.testId,
    // The RPC param is `int` (typed non-null) but accepts NULL to skip the
    // If-Match guard. supabase-js serializes null → SQL NULL (mirrors updateAtc).
    p_if_match: args.ifMatch as number,
    p_step_ids: args.stepIds,
  });
}

// BK-33 — replace the whole tag set on a Test (PUT semantics). The SECURITY
// DEFINER RPC normalizes (trim, reserved-lowercase, dedupe), enforces the write
// gate + shape rules (count ≤ 20, len ≤ 50, comma-free), and guards the
// optimistic lock under FOR UPDATE — a no-op (set unchanged) skips the version
// bump / event. `ifMatch` null skips the guard. Returns the composed Test json
// (now carrying `tags`). Same explicit-actor contract as the other wrappers.
export interface SetTestTagsArgs {
  actorUserId: string
  testId: string
  ifMatch: number | null
  tags: string[]
}

export async function setTestTags(supabase: Client, args: SetTestTagsArgs) {
  return supabase.rpc('bunkai_set_test_tags', {
    p_actor_user_id: args.actorUserId,
    p_test_id: args.testId,
    // The RPC param is `int` (typed non-null) but accepts NULL to skip the
    // If-Match guard. supabase-js serializes null → SQL NULL (mirrors updateAtc).
    p_if_match: args.ifMatch as number,
    p_tags: args.tags,
  });
}

// BK-33 — workspace-scoped filter of Tests carrying a single tag. The SECURITY
// DEFINER RPC restricts results to the actor's active memberships (any role) —
// caller scope is ignored — and matches via a GIN `@>` containment. The lookup
// tag is normalized the SAME way stored tags are, so `Smoke` matches `smoke`.
// An unused tag returns `[]`, never a 404, never a cross-workspace leak.
// Returns a jsonb array of lightweight rows (id/title/tags/step_count).
export async function filterTestsByTag(supabase: Client, args: { actorUserId: string, tag: string }) {
  return supabase.rpc('bunkai_filter_tests_by_tag', {
    p_actor_user_id: args.actorUserId,
    p_tag: args.tag,
  });
}

// BK-34 — start a manual Run of a Test via the SECURITY DEFINER RPC. Same
// explicit-actor contract as the other wrappers; the RPC gates write-membership,
// validates the executor mode + environment + executable-steps, enforces the
// 24h same-token idempotency window, snapshots the Test's chain into
// run_atcs/run_steps, emits the run.started audit, and returns the composed Run
// json. The composed json carries a `replayed` boolean: `true` when the call hit
// an existing Run within the 24h window (HTTP 200), `false` when freshly created
// (HTTP 201).
export interface CreateRunArgs {
  actorUserId: string
  testId: string
  environmentId: string
  executorMode: string
  startToken: string
}

export async function createRun(supabase: Client, args: CreateRunArgs) {
  return supabase.rpc('bunkai_create_run', {
    p_actor_user_id: args.actorUserId,
    p_test_id: args.testId,
    p_environment_id: args.environmentId,
    p_executor_mode: args.executorMode,
    p_start_token: args.startToken,
  });
}

// BK-34 — read-only expanded Run view (header + ordered run_atcs + run_steps).
// Same explicit-actor contract; the SECURITY DEFINER RPC resolves the Run's
// workspace and gates the actor's active membership (any role). Powers the
// runner checklist + progress.
export async function getRunExpanded(supabase: Client, args: { actorUserId: string, runId: string }) {
  return supabase.rpc('bunkai_get_run_expanded', {
    p_actor_user_id: args.actorUserId,
    p_run_id: args.runId,
  });
}

// BK-36 — abort an in-progress Run with a reason. Same explicit-actor contract;
// the SECURITY DEFINER RPC gates member+ write access, requires status 'running'
// (else run_not_abortable), trims + bounds the reason (3..500), closes the Run as
// 'aborted' (finished_at set, version bumped) and marks every not-yet-executed
// step 'skipped' while preserving recorded results. Returns the composed Run json.
//
// `via` (BK-211/12198) — the terminal call's session kind ('cookie' | 'bearer'),
// forwarded from `principal.via` — is a channel descriptor for the run-event
// notification trigger (0066_run_event_notifications.sql), never an identity or
// scope parameter. Optional: an omitted `via` lands on the RPC's own `p_via
// default null`, which the trigger reads as non-interactive and therefore
// notifies (the safe default — a missed terminal notification is silent).
export async function abortRun(
  supabase: Client,
  args: { actorUserId: string, runId: string, reason: string, via?: 'cookie' | 'bearer' },
) {
  return supabase.rpc('bunkai_abort_run', {
    p_actor_user_id: args.actorUserId,
    p_run_id: args.runId,
    p_reason: args.reason,
    // Deliberately `?? null`, NOT `?? undefined` — see this file's own
    // `lib/supabase/rpc.test.ts` ("defaults p_via to null (not undefined)
    // when via is omitted"): landing on an explicit `null` resolves the
    // RPC's `p_via text default null` directly rather than depending on
    // PostgREST's undefined-key handling. The regenerated Database types
    // (BK-398 types regen, migration 0071) type `p_via` as merely optional
    // with no `null` in the union — Supabase's codegen represents a SQL
    // `default null` param that way regardless of whether the underlying
    // column type is genuinely nullable, which it is here (`text`, no NOT
    // NULL). The cast documents that codegen imprecision rather than
    // silently reversing the deliberate `null` behavior the test locks in.
    p_via: (args.via ?? null) as string | undefined,
  });
}

// BK-39 — finish an in-progress Run with a final verdict. Same explicit-actor
// contract; the SECURITY DEFINER RPC gates member+ write access, requires status
// 'running' (else run_not_finishable), validates the verdict (passed | failed,
// else finish_verdict_invalid), closes the Run with that verdict (finished_at set,
// version bumped) and marks every not-yet-executed step 'skipped' while preserving
// recorded results. Human / agent / ci callers pass the same gate. Returns the
// composed Run json.
//
// `via` — see abortRun's comment above; identical contract.
export async function finishRun(
  supabase: Client,
  args: { actorUserId: string, runId: string, verdict: 'passed' | 'failed', via?: 'cookie' | 'bearer' },
) {
  return supabase.rpc('bunkai_finish_run', {
    p_actor_user_id: args.actorUserId,
    p_run_id: args.runId,
    p_verdict: args.verdict,
    // Deliberately `?? null`, NOT `?? undefined` — see abortRun's comment above.
    p_via: (args.via ?? null) as string | undefined,
  });
}

// BK-35 — mark one run_steps row pass/failed/blocked via the SECURITY DEFINER
// RPC. Same explicit-actor contract; the RPC gates member+ write access,
// requires status 'running' (else run_step_marking_closed), backstops the
// status value (passed | failed | blocked only — 'pending' is never accepted,
// so a re-mark-to-pending attempt lands on the same step_status_invalid), and
// normalizes an empty/whitespace-only note/evidence_url to NULL server-side
// (Q8). UPDATEs the run_steps row in place — no history table, last-write-wins
// (AC6) — then recomputes the parent run_atcs verdict from the full current
// sibling set (AC2). Returns the composed Run json.
export async function markRunStep(
  supabase: Client,
  args: {
    actorUserId: string
    runId: string
    stepId: string
    status: 'passed' | 'failed' | 'blocked'
    note?: string | null
    evidenceUrl?: string | null
  },
) {
  return supabase.rpc('bunkai_mark_run_step', {
    p_actor_user_id: args.actorUserId,
    p_run_id: args.runId,
    p_run_step_id: args.stepId,
    p_status: args.status,
    // The RPC params are typed `text` (non-null) but accept NULL — the
    // function normalizes empty/whitespace to NULL server-side either way
    // (Q8). supabase-js serializes null -> SQL NULL (mirrors updateAtc's
    // p_if_match cast).
    p_note: (args.note ?? null) as string,
    p_evidence_url: (args.evidenceUrl ?? null) as string,
  });
}

// BK-37 — read a Test's past Runs (history), newest first. Same explicit-actor
// contract; the SECURITY DEFINER RPC resolves the Test's workspace and gates the
// actor's active membership (any role — a viewer reads), then returns ONLY
// terminal Runs (passed | failed | aborted): an in-progress Run is never history
// and is never counted. `outcome` narrows to one terminal status; pagination is
// keyset on (started_at desc, id desc) via the cursor pair, so a Run landing
// mid-scroll can neither skip nor duplicate a row. Returns
// `{ items, totals, next_cursor }` — `totals` counts ALL terminal Runs of the
// Test (all-time, independent of both the filter and paging) and `next_cursor`
// is `{ started_at, id }` of the last returned row, or null when no further page
// exists. The route owns the opaque base64 encoding of that cursor.
export interface ListTestRunsArgs {
  actorUserId: string
  testId: string
  outcome?: string | null
  limit?: number
  cursorStartedAt?: string | null
  cursorId?: string | null
}

export async function listTestRuns(supabase: Client, args: ListTestRunsArgs) {
  return supabase.rpc('bunkai_list_test_runs', {
    p_actor_user_id: args.actorUserId,
    p_test_id: args.testId,
    p_outcome: args.outcome ?? undefined,
    p_limit: args.limit ?? undefined,
    p_cursor_started_at: args.cursorStartedAt ?? undefined,
    p_cursor_id: args.cursorId ?? undefined,
  });
}

// BK-38 — read a Project's Run report: every Run of the Project, filtered by
// date range / module / status / executor (AND-composed), with pass/fail
// totals recomputed from the SAME filtered set (Business Rule #3 — a
// deliberate divergence from listTestRuns's all-time totals). Same
// explicit-actor contract as the other wrappers; the SECURITY DEFINER RPC
// resolves the Project's workspace and gates the actor's active membership
// (any role — a viewer reads). Unlike listTestRuns, rows are NOT restricted to
// terminal statuses — a currently-`running` Run is a legitimate row, it just
// cannot be the target of the `status` filter. Pagination is keyset on
// (started_at desc, id desc) via the cursor pair, reusing BK-37's mechanism.
// Returns `{ items, totals, next_cursor }` — the route owns the opaque base64
// encoding of the cursor.
export interface ReportProjectRunsArgs {
  actorUserId: string
  projectId: string
  dateFrom?: string | null
  dateTo?: string | null
  moduleId?: string | null
  status?: string[] | null
  executorMode?: string[] | null
  limit?: number
  cursorStartedAt?: string | null
  cursorId?: string | null
}

export async function reportProjectRuns(supabase: Client, args: ReportProjectRunsArgs) {
  return supabase.rpc('bunkai_report_project_runs', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
    p_date_from: args.dateFrom ?? undefined,
    p_date_to: args.dateTo ?? undefined,
    p_module_id: args.moduleId ?? undefined,
    p_status: args.status ?? undefined,
    p_executor_mode: args.executorMode ?? undefined,
    p_limit: args.limit ?? undefined,
    p_cursor_started_at: args.cursorStartedAt ?? undefined,
    p_cursor_id: args.cursorId ?? undefined,
  });
}

// BK-46 — whole-project coverage rollup (untested ACs / not-run filter /
// fully-covered modules). Same explicit-actor contract; the SECURITY DEFINER
// RPC resolves the Project's workspace and gates the actor's active
// membership (any role — a viewer reads, same as reportProjectRuns). No
// pagination, no filter params — the RPC returns the whole payload and the UI
// filters client-side. Returns `{ kpis, modules, no_coverage }`.
export interface ReportProjectCoverageArgs {
  actorUserId: string
  projectId: string
}

export async function reportProjectCoverage(supabase: Client, args: ReportProjectCoverageArgs) {
  return supabase.rpc('bunkai_report_project_coverage', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
  });
}

// BK-47 — read a Project's per-user-story recovery-cycle report (first
// failing terminal run -> first subsequent all-passing terminal run). Same
// explicit-actor contract as reportProjectRuns/reportProjectCoverage; the
// SECURITY DEFINER RPC resolves the Project's workspace and gates the
// actor's active membership (any role — a viewer reads). No pagination, no
// filters — a whole-project, unpaged read (0049_recovery_cycle_report.sql).
// Returns `{ items }` raw (no median/duration) — lib/metrics/recovery-cycle.ts
// derives everything else (Decision 3).
export interface ReportProjectRecoveryCyclesArgs {
  actorUserId: string
  projectId: string
}

export async function reportProjectRecoveryCycles(supabase: Client, args: ReportProjectRecoveryCyclesArgs) {
  return supabase.rpc('bunkai_report_project_recovery_cycles', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
  });
}

// BK-42 — read a Project's per-module defect heatmap (count over the chosen
// window + week-over-week trend). Same explicit-actor contract as
// reportProjectRuns/reportProjectCoverage/reportProjectRecoveryCycles; the
// SECURITY DEFINER RPC resolves the Project's workspace and gates the
// actor's active membership (any role — a viewer reads). No pagination — a
// whole-project, unpaged read (0052_defect_heatmap_report.sql). Returns
// `{ window, generated_at, items }` raw (no heat bucket / trend derivation)
// — lib/metrics/defect-heatmap.ts derives everything else.
export interface ReportProjectDefectHeatmapArgs {
  actorUserId: string
  projectId: string
  window: '7d' | '30d' | '90d'
}

export async function reportProjectDefectHeatmap(supabase: Client, args: ReportProjectDefectHeatmapArgs) {
  return supabase.rpc('bunkai_report_project_defect_heatmap', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
    p_window: args.window,
  });
}

// BK-148 — manage a Project's environments via the SECURITY DEFINER RPCs. Same
// explicit-actor contract as the other wrappers (PAT/cookie callers resolve to a
// user id the route passes in); each RPC gates member+ write access on the
// project's workspace via bunkai_assert_actor_can_write_project, trims + length-
// guards the name (1..50), and relies on the unique (project_id, lower(name))
// index for case-insensitive uniqueness. The delete RPC pre-counts referencing
// runs and BLOCKS removal (45211, count in message) when any run references the
// env. Each returns the composed environment json (or { deleted: true } for the
// delete).

export async function createEnvironment(
  supabase: Client,
  args: { actorUserId: string, projectId: string, name: string },
) {
  return supabase.rpc('bunkai_create_environment', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
    p_name: args.name,
  });
}

export async function renameEnvironment(
  supabase: Client,
  args: { actorUserId: string, environmentId: string, name: string },
) {
  return supabase.rpc('bunkai_rename_environment', {
    p_actor_user_id: args.actorUserId,
    p_environment_id: args.environmentId,
    p_name: args.name,
  });
}

export async function deleteEnvironment(
  supabase: Client,
  args: { actorUserId: string, environmentId: string },
) {
  return supabase.rpc('bunkai_delete_environment', {
    p_actor_user_id: args.actorUserId,
    p_environment_id: args.environmentId,
  });
}

// BK-40 — file a TMS-native bug, either linked to a failed run step or
// standalone. Same explicit-actor contract as the other wrappers; the
// SECURITY DEFINER RPC re-validates member+ write access via
// bunkai_assert_actor_can_write_project, re-validates module ∈ project
// (defense in depth — the run-linked HTTP path already derived both together
// from the run), backstops title/severity/evidence-count, inserts (status
// always 'open'), emits `bug.filed`, and returns the composed bug json (header
// + nested module `{id, name, path}`). `runId`/`runStepId`/`atcId` are
// provenance-only and null for a standalone bug.
export interface CreateBugArgs {
  actorUserId: string
  projectId: string
  moduleId: string
  title: string
  severity: string
  description?: string | null
  stepsToReproduce?: string
  evidenceUrls?: string[]
  runId?: string | null
  runStepId?: string | null
  atcId?: string | null
}

export async function createBug(supabase: Client, args: CreateBugArgs) {
  return supabase.rpc('bunkai_create_bug', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
    p_module_id: args.moduleId,
    p_title: args.title,
    p_severity: args.severity,
    // The RPC param is typed `text` (non-null) but accepts NULL — normalizes
    // empty/whitespace to NULL server-side either way (mirrors markRunStep's
    // p_note/p_evidence_url cast).
    p_description: (args.description ?? null) as string,
    p_steps_to_reproduce: args.stepsToReproduce ?? '',
    p_evidence_urls: args.evidenceUrls ?? [],
    p_run_id: (args.runId ?? null) as string,
    p_run_step_id: (args.runStepId ?? null) as string,
    p_atc_id: (args.atcId ?? null) as string,
  });
}

// BK-337 — read ONE bug's full composed record (`GET /api/v1/bugs/{id}`).
// `bunkai_bug_json` (0046_bugs.sql, widened by 0070_bug_detail_composer.sql)
// is `language sql stable`, no `security definer` — it runs as the caller
// (INVOKER), so this MUST be called through the caller's own RLS-scoped
// client (never `createAdminClient()`). Returns `null` (not an error) both
// when the bug does not exist and when RLS hides it from this caller —
// `throwBugNotFound()` is the route's job on either `null` result.
export async function getBugJson(supabase: Client, bugId: string) {
  return supabase.rpc('bunkai_bug_json', { p_bug_id: bugId });
}

// BK-40 — read a Project's bugs, newest first (bare list — BK-41 adds filters
// and real pagination). Same explicit-actor contract as the other wrappers;
// the SECURITY DEFINER RPC resolves the Project's workspace and gates the
// actor's active membership (any role — a viewer reads). Returns `{ items }`,
// each item carrying a nested module `{id, name, path}` object.
export async function listProjectBugs(supabase: Client, args: { actorUserId: string, projectId: string }) {
  return supabase.rpc('bunkai_list_project_bugs', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
  });
}

// BK-41 — filtered, paginated, aggregate-bearing read of a Project's bugs
// (migration 0051_bugs_list.sql). UNLIKE `createBug`/`listProjectBugs`,
// `bunkai_list_bugs` is SECURITY INVOKER and takes NO explicit actor param —
// same shape as `listActivity` below. It runs its SELECT under the CALLING
// role, so RLS's `bugs_select_workspace_member` (0046_bugs.sql) evaluates
// against the caller's own auth.uid(). The `supabase` argument passed here
// MUST be the caller's own RLS-scoped client (`getAuth(ctx).db`) — NEVER
// `createAdminClient()`. An admin client has no authenticated auth.uid(),
// which would make that RLS check moot and reopen the exact cross-project
// leak `lib/bugs/list-isolation.test.ts` exists to prove closed.
export interface ListBugsArgs {
  projectId: string
  moduleId?: string | null
  statuses?: string[] | null
  severities?: string[] | null
  limit?: number
  cursorSeverity?: string | null
  cursorCreatedAt?: string | null
  cursorId?: string | null
}

export async function listBugs(supabase: Client, args: ListBugsArgs) {
  return supabase.rpc('bunkai_list_bugs', {
    p_project_id: args.projectId,
    // Every param below is OPTIONAL on the RPC signature (`p_module_id?:
    // string`, etc — migration 0051's own `default null` params), so the
    // generated type accepts `undefined`, never `null` (mirrors
    // `searchAtcs`'s own `?? undefined` pattern for the same optional-param
    // shape) — unlike `createBug`'s NOT-null-typed-but-null-accepting params,
    // which use the `(x ?? null) as string` cast instead.
    p_module_id: args.moduleId ?? undefined,
    p_statuses: args.statuses ?? undefined,
    p_severities: args.severities ?? undefined,
    p_limit: args.limit ?? undefined,
    p_cursor_severity: args.cursorSeverity ?? undefined,
    p_cursor_created_at: args.cursorCreatedAt ?? undefined,
    p_cursor_id: args.cursorId ?? undefined,
  });
}

// BK-49 — read-only workspace activity feed (migration
// 0045_activity_stream.sql). UNLIKE every other wrapper in this file,
// bunkai_list_activity is SECURITY INVOKER and takes NO explicit actor
// param: it runs its SELECT under the CALLING role, so RLS's
// activity_log_select_workspace_member (0009_cross_cutting.sql) evaluates
// against the caller's own auth.uid(). The `supabase` argument passed here
// MUST be the caller's own RLS-scoped client (`getAuth(ctx).db`) — never
// `createAdminClient()`. An admin client has no authenticated auth.uid(),
// which would make that RLS check moot and reopen the exact cross-workspace
// leak this story exists to close (Risk R2, implementation-plan.md; see also
// `app/api/v1/activity/route.ts`'s own comment on this same call).
export interface ListActivityArgs {
  workspaceId: string
  limit?: number
  cursorCreatedAt?: string | null
  cursorId?: string | null
  actions: readonly string[]
}

export async function listActivity(supabase: Client, args: ListActivityArgs) {
  return supabase.rpc('bunkai_list_activity', {
    p_workspace_id: args.workspaceId,
    p_limit: args.limit ?? undefined,
    p_cursor_created_at: args.cursorCreatedAt ?? undefined,
    p_cursor_id: args.cursorId ?? undefined,
    p_actions: [...args.actions],
  });
}

// BK-264 — assign / reassign / unassign a bug via the SECURITY DEFINER RPC
// (migration 0054_bug_assignment_status.sql). UNLIKE createBug/listProjectBugs,
// this RPC takes NO p_actor_user_id — it reads auth.uid() directly and is
// GRANTED TO `authenticated` ONLY (no `service_role` grant). The `supabase`
// argument passed here MUST therefore be the caller's own RLS-scoped client
// (`getAuth(ctx).db`) — NEVER `createAdminClient()`, which would either fail
// outright (service_role holds no EXECUTE on this function) or, if it ever
// somehow ran, see a NULL auth.uid() and always fail the write-role gate.
// `assigneeUserId: null` unassigns; omitting the RPC arg (via `?? undefined`)
// lets Postgres apply the function's own `default null`, same shape as
// `listBugs`'s optional params.
export async function assignBug(
  supabase: Client,
  args: { bugId: string, assigneeUserId: string | null },
) {
  return supabase.rpc('bunkai_assign_bug', {
    p_bug_id: args.bugId,
    p_assignee_user_id: args.assigneeUserId ?? undefined,
  });
}

// BK-264 — advance a bug's status one lifecycle stage at a time via the
// SECURITY DEFINER RPC (migration 0054_bug_assignment_status.sql). Same
// no-p_actor_user_id / `authenticated`-only shape as assignBug above — same
// caller's-own-RLS-scoped-client requirement applies.
export async function transitionBugStatus(
  supabase: Client,
  args: { bugId: string, newStatus: string },
) {
  return supabase.rpc('bunkai_transition_bug_status', {
    p_bug_id: args.bugId,
    p_new_status: args.newStatus,
  });
}

// BK-49 — batch-resolve actor emails for one page of activity rows
// (ADR-0011). SECURITY DEFINER: asserts the CALLER's own co-membership of
// `workspaceId` in-band (auth.uid(), non-spoofable, no explicit actor param)
// before returning `email` for the requested ids. Also safe to call with the
// caller's own RLS-scoped client — no admin client needed for this RPC
// either, since it carries its own escalation internally.
export async function resolveActivityActors(
  supabase: Client,
  args: { workspaceId: string, userIds: string[] },
) {
  return supabase.rpc('bunkai_resolve_activity_actors', {
    p_workspace_id: args.workspaceId,
    p_user_ids: args.userIds,
  });
}

// BK-209 (Slice 2: API) — the caller's own notification inbox for one
// workspace, newest first + unread count (migration 0053_notifications.sql).
// `bunkai_list_notifications` is SECURITY INVOKER and takes NO explicit actor
// param: it runs its SELECT under the CALLING role, so RLS's
// notifications_select_recipient_member_retained evaluates against the
// caller's own auth.uid(). The `supabase` argument passed here MUST be the
// caller's own RLS-scoped client (`getAuth(ctx).db`) — never
// `createAdminClient()`. An admin client has no authenticated auth.uid(),
// which would make that RLS check moot (same Risk R2 shape as
// `listActivity`/`listBugs` above).
export interface ListNotificationsArgs {
  workspaceId: string
  limit?: number
  cursorCreatedAt?: string | null
  cursorId?: string | null
}

export async function listNotifications(supabase: Client, args: ListNotificationsArgs) {
  return supabase.rpc('bunkai_list_notifications', {
    p_workspace_id: args.workspaceId,
    p_limit: args.limit ?? undefined,
    p_cursor_created_at: args.cursorCreatedAt ?? undefined,
    p_cursor_id: args.cursorId ?? undefined,
  });
}

// BK-205 — create / edit a Milestone via the SECURITY DEFINER RPCs (migration
// 0064_milestones.sql). UNLIKE createEnvironment/createBug, these RPCs carry
// NO p_actor_user_id — they read auth.uid() directly and are granted to
// `authenticated` ONLY (no `service_role` grant), the same
// `bunkai_assign_bug` shape. The `supabase` argument passed here MUST
// therefore be the caller's own RLS-scoped client (`getAuth(ctx).db`) —
// NEVER `createAdminClient()`, which would either fail outright (service_role
// holds no EXECUTE on these functions) or, if it ever somehow ran, see a NULL
// auth.uid() and always fail the write-role gate.
export interface CreateMilestoneArgs {
  projectId: string
  name: string
  targetDate: string
  description?: string
}

export async function createMilestone(supabase: Client, args: CreateMilestoneArgs) {
  return supabase.rpc('bunkai_create_milestone', {
    p_project_id: args.projectId,
    p_name: args.name,
    p_target_date: args.targetDate,
    p_description: args.description ?? '',
  });
}

export interface UpdateMilestoneArgs {
  milestoneId: string
  name: string
  targetDate: string
  description?: string
}

export async function updateMilestone(supabase: Client, args: UpdateMilestoneArgs) {
  return supabase.rpc('bunkai_update_milestone', {
    p_milestone_id: args.milestoneId,
    p_name: args.name,
    p_target_date: args.targetDate,
    p_description: args.description ?? '',
  });
}

// BK-45 — read a User Story's full AC -> ATC -> Test -> Run -> Defect
// evidence chain in one round trip. Same explicit-actor contract as
// reportProjectCoverage/reportProjectRecoveryCycles/reportProjectDefectHeatmap
// (0068_story_traceability_report.sql); the SECURITY DEFINER RPC resolves
// the story's Project via module_id (never the nullable
// user_stories.project_id) and gates the actor's active workspace
// membership (any role — a viewer reads, per the PO's role-gate ruling). No
// pagination — one story's chain is small and bounded. Grain is the story,
// not the project: `bunkai_report_project_coverage` and this RPC are
// deliberately NOT interchangeable.
export interface ReportStoryTraceabilityArgs {
  actorUserId: string
  userStoryId: string
}

export async function reportStoryTraceability(supabase: Client, args: ReportStoryTraceabilityArgs) {
  return supabase.rpc('bunkai_report_story_traceability', {
    p_actor_user_id: args.actorUserId,
    p_user_story_id: args.userStoryId,
  });
}

// BK-398 — cross-entity Command Palette search. UNLIKE every other wrapper in
// this file, this RPC is SECURITY INVOKER with NO actor parameter (Jira
// comment 12406, AI Tech Lead ruling — follows the standing BK-267/BK-49
// preference for INVOKER over a DEFINER + actor-bind guard). It runs AS the
// caller, so each of its six UNION branches re-evaluates that table's own
// workspace-member RLS SELECT policy against the REAL `auth.uid()`. The
// `supabase` argument passed here MUST be the caller's own RLS-scoped client
// (`getAuth(ctx).db`) — an admin/service-role client has no `auth.uid()` and
// every branch's RLS policy silently empties, which defeats the feature
// rather than leaking anything (fails closed), but is still wrong to ship.
export interface SearchWorkspaceArgs {
  query: string
  workspaceId: string
  limit?: number
}

export async function searchWorkspace(supabase: Client, args: SearchWorkspaceArgs) {
  return supabase.rpc('bunkai_search_workspace', {
    p_query: args.query,
    p_workspace_id: args.workspaceId,
    p_limit: args.limit ?? undefined,
  });
}

// BK-229 — the Billing overview's raw read: plan key + live seat/project/
// retention counts. SAME shape as `searchWorkspace` above — SECURITY INVOKER,
// NO caller-supplied actor parameter (Jira comment 12414 TQ2, unchanged by
// the later TQ1 reversal in 12417). The step-0 admin gate lives inside the
// function itself (`bunkai_is_workspace_admin`, DEFINER, self-binds to
// `auth.uid()`), so this MUST be called through the caller's own RLS-scoped
// client (`getAuth(ctx).db`) — NEVER `createAdminClient()`, or `auth.uid()`
// is NULL and the gate always returns false, silently breaking the feature.
// Returns `null` (not an error) for a non-admin caller, an unknown
// workspace, or a workspace the caller cannot see — the route's job is to
// collapse that into a 404, never a 403.
export async function getWorkspaceBillingOverview(supabase: Client, workspaceId: string) {
  return supabase.rpc('bunkai_workspace_billing_overview', {
    p_workspace_id: workspaceId,
  });
}

// BK-202 — create / edit a Test Plan via the SECURITY DEFINER RPCs (migration
// 0073_test_plans.sql). Same contract as the Milestone pair: NO
// p_actor_user_id — they read auth.uid() directly (ADR-0012 satisfied by
// parameter removal, not by a guard). The `supabase` argument passed here
// MUST therefore be the caller's own RLS-scoped client (`getAuth(ctx).db`) —
// NEVER `createAdminClient()`, whose auth.uid() is NULL and would fail the
// write-role gate on every call.
//
// There is deliberately no `deleteTestPlan`: ratified T4 (2026-08-14) makes
// Close the sole exit from Open, epic-wide, and the migration ships no DELETE
// policy and no delete RPC to back one.
export interface CreateTestPlanArgs {
  projectId: string
  name: string
  description?: string
  goal?: string
}

export async function createTestPlan(supabase: Client, args: CreateTestPlanArgs) {
  return supabase.rpc('bunkai_create_test_plan', {
    p_project_id: args.projectId,
    p_name: args.name,
    p_description: args.description ?? '',
    p_goal: args.goal ?? '',
  });
}

export interface UpdateTestPlanArgs {
  testPlanId: string
  name: string
  description?: string
  goal?: string
}

export async function updateTestPlan(supabase: Client, args: UpdateTestPlanArgs) {
  return supabase.rpc('bunkai_update_test_plan', {
    p_test_plan_id: args.testPlanId,
    p_name: args.name,
    p_description: args.description ?? '',
    p_goal: args.goal ?? '',
  });
}

// BK-230 — webhook-only. The caller MUST be createAdminClient() (migration
// 0077's own comment: the webhook request carries no Supabase session, so
// this RPC is SECURITY DEFINER and granted to service_role only — passing
// the caller's RLS-scoped client here would fail with a permission error).
export interface ApplyBillingCheckoutWebhookEventArgs {
  stripeEventId: string
  stripeEventType: string
  stripeCheckoutSessionId: string
  // Review item 2/1 (PR #208): the row is looked up by clientReferenceId
  // FIRST (our own billing_checkout_sessions.id, round-tripped through
  // Stripe), falling back to stripeCheckoutSessionId. paymentStatus gates
  // whether a completed/async_payment_succeeded event actually flips the
  // plan (only on 'paid' — see migration 0077's RPC comment for the BLOCKER
  // this closes). stripeCustomerId/stripeSubscriptionId are captured for
  // review item 4 (BK-231 will need them; this is the only moment they are
  // free to record).
  clientReferenceId: string | null
  paymentStatus: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

export async function applyBillingCheckoutWebhookEvent(supabase: Client, args: ApplyBillingCheckoutWebhookEventArgs) {
  return supabase.rpc('bunkai_apply_billing_checkout_webhook_event', {
    p_stripe_event_id: args.stripeEventId,
    p_stripe_event_type: args.stripeEventType,
    p_stripe_checkout_session_id: args.stripeCheckoutSessionId,
    // The generated Args type marks these `string` (Supabase's type
    // generator does not infer nullability for a plpgsql text param with no
    // DEFAULT), but the SQL body genuinely accepts and relies on NULL for
    // each of these (nullif/coalesce/`is distinct from`) — a real `null`
    // reaches Postgres fine over the wire; only the compile-time type is
    // wrong. Same cast shape as `p_steps`/`p_assertions` above.
    p_client_reference_id: args.clientReferenceId as unknown as string,
    p_payment_status: args.paymentStatus as unknown as string,
    p_stripe_customer_id: args.stripeCustomerId as unknown as string,
    p_stripe_subscription_id: args.stripeSubscriptionId as unknown as string,
  });
}

// BK-203 — Test Plan membership. Both mutating wrappers carry NO
// actor/scope argument (auth.uid() is read internally by the RPC, same
// posture as createTestPlan/updateTestPlan above) — call them ONLY through
// the caller's own RLS-scoped client, never `createAdminClient()`.
export interface AddTestsToPlanArgs {
  testPlanId: string
  testIds: string[]
}

export async function addTestsToPlan(supabase: Client, args: AddTestsToPlanArgs) {
  return supabase.rpc('bunkai_add_tests_to_plan', {
    p_test_plan_id: args.testPlanId,
    p_test_ids: args.testIds,
  });
}

export interface RemoveTestFromPlanArgs {
  testPlanId: string
  testId: string
}

export async function removeTestFromPlan(supabase: Client, args: RemoveTestFromPlanArgs) {
  return supabase.rpc('bunkai_remove_test_from_plan', {
    p_test_plan_id: args.testPlanId,
    p_test_id: args.testId,
  });
}

// BK-203 — Test library search for the add-tests picker. Explicit actor +
// admin client (mirrors searchAtcs/filterTestsByTag above): search endpoints
// in this codebase consistently take an explicit actor, unlike the no-actor
// test_plans mutation RPCs.
export interface SearchTestsArgs {
  actorUserId: string
  query: string
  projectId: string
  limit?: number
}

export async function searchTests(supabase: Client, args: SearchTestsArgs) {
  return supabase.rpc('bunkai_search_tests', {
    p_actor_user_id: args.actorUserId,
    p_query: args.query,
    p_project_id: args.projectId,
    p_limit: args.limit ?? undefined,
  });
}
