import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-991: DB-level regression guard for migration
// 0089_workspace_helpers_deleted_guard.sql. Required by `rpc-authorization.md`
// §5: a route test that mocks `db.rpc` proves nothing, so this drives the REAL
// SECURITY DEFINER RPCs the headless routes call, through the service-role
// client with an explicit actor. That is the exact contract the admin-client
// routes use: GET /tests/{id}, GET /runs/{id}, GET /atcs/{id}/usage,
// PATCH|DELETE /environments/{id}, POST /tests, POST /projects/{id}/environments,
// and the ATC/Test search + tag-filter endpoints.
//
// Shape: one throwaway workspace owned by the declared automation identity
// (`.agents/project.yaml` -> testing.automation_identity -> QA_E2E_USER_EMAIL,
// resolved through a real password sign-in, never an arbitrary member). It
// holds one of each entity the defect names (ATC, Test, Run, Environment).
// Every RPC is called once while the workspace is live, as a positive
// baseline that must succeed or return the fixture row, and once after
// `deleted_at` is stamped, where it must refuse with the code the function
// already gives a non-member or return nothing.
//
// REQUIRES MIGRATION 0089 APPLIED. Against a database without it, the
// "after deletion" assertions fail; that red is the defect.
//
// DB-dependent + env-gated like its siblings: without Supabase + automation
// identity env the suite SKIPS. The throwaway fixture is removed in a
// `finally`, so it is cleaned up even when an assertion or a setup insert
// fails half-way.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);

const describeOrSkip = hasEnv ? describe : describe.skip;

const RAND = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8) || 'probe';
const PREFIX = `bk991-deleted-ws-${Date.now()}-${RAND}`;
// Distinctive search tokens: letters only so the english tsvector keeps them intact.
const ATC_TOKEN = `zebraatc${RAND}`;
const TEST_TOKEN = `zebratest${RAND}`;
const TAG = `bk991probe${RAND}`;

interface Fixture {
  workspaceId: string
  actorId: string
  projectId: string
  atcId: string
  testId: string
  runId: string
  environmentId: string
}

type Db = ReturnType<typeof service>;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function resolveAutomationUserId(): Promise<string> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  if (error || !data.user) {
    throw new Error(`automation identity sign-in failed: ${error?.message ?? 'no user'}`);
  }
  await client.auth.signOut();
  return data.user.id;
}

function ids(rows: unknown): string[] {
  return ((rows ?? []) as Array<{ id: string }>).map(r => r.id);
}

async function buildFixture(db: Db, actorId: string, onWorkspace: (f: Fixture) => void): Promise<Fixture> {
  const { data: ws, error: wsError } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: actorId })
    .select('id')
    .single();
  if (wsError) { throw wsError; }
  const f: Fixture = { workspaceId: ws.id as string, actorId, projectId: '', atcId: '', testId: '', runId: '', environmentId: '' };
  // Hand the workspace id to the caller immediately so its `finally` can
  // clean up even if a later insert throws.
  onWorkspace(f);

  const { error: wmError } = await db
    .from('workspace_members')
    .insert({ workspace_id: f.workspaceId, user_id: actorId, role: 'owner', status: 'active' });
  if (wmError) { throw wmError; }

  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: f.workspaceId, slug: `${PREFIX}-proj`, name: `${PREFIX} proj` })
    .select('id')
    .single();
  if (projectError) { throw projectError; }
  f.projectId = project.id as string;

  const { data: mod, error: modError } = await db
    .from('modules')
    .insert({ project_id: f.projectId, path: 'bk991', name: 'BK-991' })
    .select('id')
    .single();
  if (modError) { throw modError; }

  const { data: story, error: storyError } = await db
    .from('user_stories')
    .insert({ module_id: mod.id, title: `${PREFIX} story` })
    .select('id')
    .single();
  if (storyError) { throw storyError; }

  const { data: atc, error: atcError } = await db
    .from('atcs')
    .insert({
      project_id: f.projectId,
      module_id: mod.id,
      user_story_id: story.id,
      slug: `${PREFIX}-atc`,
      title: `${ATC_TOKEN} atc`,
      layer: 'UI',
      status: 'unrun',
    })
    .select('id')
    .single();
  if (atcError) { throw atcError; }
  f.atcId = atc.id as string;

  const { data: test, error: testError } = await db
    .from('tests')
    .insert({ workspace_id: f.workspaceId, title: `${TEST_TOKEN} test`, created_by: actorId, tags: [TAG] })
    .select('id')
    .single();
  if (testError) { throw testError; }
  f.testId = test.id as string;

  const { error: stepError } = await db
    .from('test_steps')
    .insert({ test_id: f.testId, atc_id: f.atcId, position: 1 });
  if (stepError) { throw stepError; }

  const { data: env, error: envError } = await db
    .from('project_environments')
    .insert({ project_id: f.projectId, name: `${RAND} env a` })
    .select('id')
    .single();
  if (envError) { throw envError; }
  f.environmentId = env.id as string;

  const { data: run, error: runError } = await db
    .from('runs')
    .insert({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      test_id: f.testId,
      environment_id: f.environmentId,
      status: 'running',
      executor_mode: 'human',
      executor_user_id: actorId,
      test_title: `${TEST_TOKEN} test`,
      start_token: `${PREFIX}-run`,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (runError) { throw runError; }
  f.runId = run.id as string;

  return f;
}

async function cleanup(db: Db, f: Fixture) {
  // Explicit order: test_steps RESTRICT atcs, atcs RESTRICT user_stories,
  // runs RESTRICT project_environments, so children go first.
  const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
    ['runs', () => db.from('runs').delete().eq('workspace_id', f.workspaceId)],
    ['tests', () => db.from('tests').delete().eq('workspace_id', f.workspaceId)],
    ['atcs', () => db.from('atcs').delete().in('project_id', f.projectId ? [f.projectId] : [])],
    ['project_environments', () => db.from('project_environments').delete().in('project_id', f.projectId ? [f.projectId] : [])],
    ['projects', () => db.from('projects').delete().eq('workspace_id', f.workspaceId)],
    ['workspace_members', () => db.from('workspace_members').delete().eq('workspace_id', f.workspaceId)],
    ['workspaces', () => db.from('workspaces').delete().eq('id', f.workspaceId)],
  ];
  for (const [table, run] of steps) {
    const { error } = await run();
    if (error) {
      console.error(`[bk991-deleted-ws] cleanup of "${table}" failed for workspace ${f.workspaceId}: ${error.message}`);
    }
  }
}

async function searches(db: Db, f: Fixture) {
  return {
    atcs: await db.rpc('bunkai_search_atcs', { p_actor_user_id: f.actorId, p_query: ATC_TOKEN, p_project_id: f.projectId }),
    tests: await db.rpc('bunkai_search_tests', { p_actor_user_id: f.actorId, p_query: TEST_TOKEN, p_project_id: f.projectId }),
    byTag: await db.rpc('bunkai_filter_tests_by_tag', { p_actor_user_id: f.actorId, p_tag: TAG }),
  };
}

describeOrSkip('BK-991: explicit-actor RPCs refuse a soft-deleted workspace', () => {
  it('live workspace: every RPC works; soft-deleted: every RPC refuses or returns nothing', async () => {
    const db = service();
    const actorId = await resolveAutomationUserId();
    let fixture: Fixture | null = null;

    try {
      const f = await buildFixture(db, actorId, (partial) => { fixture = partial; });

      // ---- Positive baseline (workspace live) -----------------------------
      const testRead = await db.rpc('bunkai_get_test_expanded', { p_actor_user_id: actorId, p_test_id: f.testId });
      expect(testRead.error).toBeNull();
      const runRead = await db.rpc('bunkai_get_run_expanded', { p_actor_user_id: actorId, p_run_id: f.runId });
      expect(runRead.error).toBeNull();
      const usage = await db.rpc('bunkai_atc_usage', { p_actor_user_id: actorId, p_atc_id: f.atcId });
      expect(usage.error).toBeNull();
      const rename = await db.rpc('bunkai_rename_environment', {
        p_actor_user_id: actorId,
        p_environment_id: f.environmentId,
        p_name: `${RAND} env b`,
      });
      expect(rename.error).toBeNull();
      const created = await db.rpc('bunkai_create_test', {
        p_actor_user_id: actorId,
        p_workspace_id: f.workspaceId,
        p_title: `${PREFIX} baseline`,
        p_atc_ids: [f.atcId],
      });
      expect(created.error).toBeNull();
      const createdEnv = await db.rpc('bunkai_create_environment', {
        p_actor_user_id: actorId,
        p_project_id: f.projectId,
        p_name: `${RAND} env c`,
      });
      expect(createdEnv.error).toBeNull();

      const live = await searches(db, f);
      expect(live.atcs.error).toBeNull();
      expect(ids(live.atcs.data)).toContain(f.atcId);
      expect(live.tests.error).toBeNull();
      expect(ids(live.tests.data)).toContain(f.testId);
      expect(live.byTag.error).toBeNull();
      expect(ids(live.byTag.data)).toContain(f.testId);

      // ---- Soft-delete the workspace --------------------------------------
      const { error: stampError } = await db
        .from('workspaces')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', f.workspaceId);
      if (stampError) { throw stampError; }

      // Read / non-disclosing paths -> P0002 (mapped to 404), no payload.
      const testGone = await db.rpc('bunkai_get_test_expanded', { p_actor_user_id: actorId, p_test_id: f.testId });
      expect(testGone.error?.code).toBe('P0002');
      expect(testGone.data).toBeNull();
      const runGone = await db.rpc('bunkai_get_run_expanded', { p_actor_user_id: actorId, p_run_id: f.runId });
      expect(runGone.error?.code).toBe('P0002');
      expect(runGone.data).toBeNull();
      const usageGone = await db.rpc('bunkai_atc_usage', { p_actor_user_id: actorId, p_atc_id: f.atcId });
      expect(usageGone.error?.code).toBe('P0002');
      expect(usageGone.data).toBeNull();
      const renameGone = await db.rpc('bunkai_rename_environment', {
        p_actor_user_id: actorId,
        p_environment_id: f.environmentId,
        p_name: `${RAND} env d`,
      });
      expect(renameGone.error?.code).toBe('P0002');

      // Environment delete: 404 BEFORE the in-use guard (was 409 "in use").
      const deleteGone = await db.rpc('bunkai_delete_environment', {
        p_actor_user_id: actorId,
        p_environment_id: f.environmentId,
      });
      expect(deleteGone.error?.code).toBe('P0002');

      // Member+ write helpers -> 42501, identical to a non-member caller.
      const createGone = await db.rpc('bunkai_create_test', {
        p_actor_user_id: actorId,
        p_workspace_id: f.workspaceId,
        p_title: `${PREFIX} blocked`,
        p_atc_ids: [f.atcId],
      });
      expect(createGone.error?.code).toBe('42501');
      const createEnvGone = await db.rpc('bunkai_create_environment', {
        p_actor_user_id: actorId,
        p_project_id: f.projectId,
        p_name: `${RAND} env e`,
      });
      expect(createEnvGone.error?.code).toBe('42501');

      // Search + tag filter: the deleted workspace's rows are gone.
      const gone = await searches(db, f);
      expect(gone.atcs.error).toBeNull();
      expect(ids(gone.atcs.data)).not.toContain(f.atcId);
      expect(gone.tests.error).toBeNull();
      expect(ids(gone.tests.data)).not.toContain(f.testId);
      expect(gone.byTag.error).toBeNull();
      expect(ids(gone.byTag.data)).not.toContain(f.testId);

      // Nothing was physically removed (ADR-0015: soft-delete only).
      const { data: stillThere } = await db.from('project_environments').select('id').eq('id', f.environmentId);
      expect((stillThere ?? []).length).toBe(1);
    }
    finally {
      if (fixture) {
        await cleanup(db, fixture);
      }
    }
  }, 60_000);
});
