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

export interface SaveAtcStep {
  content: string
  input_data?: string | null
  expected?: string | null
}

export interface SaveAtcAssertion {
  content: string
}

export interface SaveAtcArgs {
  atcId: string
  title: string
  layer: string
  tags: string[]
  userStoryId: string
  steps: SaveAtcStep[]
  assertions: SaveAtcAssertion[]
  acIds: string[]
}

export async function saveAtc(supabase: Client, args: SaveAtcArgs) {
  return supabase.rpc('bunkai_save_atc', {
    p_atc_id: args.atcId,
    p_title: args.title,
    p_layer: args.layer,
    p_tags: args.tags,
    p_user_story_id: args.userStoryId,
    p_steps: args.steps as unknown as Json,
    p_assertions: args.assertions as unknown as Json,
    p_ac_ids: args.acIds,
  });
}

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
