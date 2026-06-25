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
export async function abortRun(
  supabase: Client,
  args: { actorUserId: string, runId: string, reason: string },
) {
  return supabase.rpc('bunkai_abort_run', {
    p_actor_user_id: args.actorUserId,
    p_run_id: args.runId,
    p_reason: args.reason,
  });
}

// BK-39 — finish an in-progress Run with a final verdict. Same explicit-actor
// contract; the SECURITY DEFINER RPC gates member+ write access, requires status
// 'running' (else run_not_finishable), validates the verdict (passed | failed,
// else finish_verdict_invalid), closes the Run with that verdict (finished_at set,
// version bumped) and marks every not-yet-executed step 'skipped' while preserving
// recorded results. Human / agent / ci callers pass the same gate. Returns the
// composed Run json.
export async function finishRun(
  supabase: Client,
  args: { actorUserId: string, runId: string, verdict: 'passed' | 'failed' },
) {
  return supabase.rpc('bunkai_finish_run', {
    p_actor_user_id: args.actorUserId,
    p_run_id: args.runId,
    p_verdict: args.verdict,
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
