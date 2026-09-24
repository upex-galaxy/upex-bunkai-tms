import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-991 — DB-level regression guard for migration
// 0089_workspace_helpers_deleted_guard.sql. Required by `rpc-authorization.md`
// §5: a route test that mocks `db.rpc` proves nothing, so this drives the REAL
// SECURITY DEFINER RPCs the headless routes call, through the service-role
// client with an explicit actor (the exact contract the admin-client routes
// use: GET /tests/{id}, GET /runs/{id}, GET /atcs/{id}/usage,
// PATCH|DELETE /environments/{id}, POST /tests, POST /projects/{id}/environments).
//
// Shape: one throwaway workspace with one of each entity the defect names
// (ATC, Test, Run, Environment). The actor is an active 'owner' of it. Every
// RPC is called once while the workspace is live (control: it must succeed)
// and once after `deleted_at` is stamped (it must refuse with the SAME code
// the function already gives a non-member — P0002 on read / non-disclosing
// paths, 42501 on the member+ write helpers).
//
// REQUIRES MIGRATION 0089 APPLIED. Against a database without it, the
// "after deletion" assertions fail — that red is the defect.
//
// DB-dependent + env-gated like its siblings: without Supabase service env the
// suite SKIPS. It writes a throwaway fixture and removes it in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const PREFIX = `bk991-deleted-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Fixture {
  workspaceId: string
  actorId: string
  projectId: string
  atcId: string
  testId: string
  runId: string
  environmentId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;

async function callAll(db: ReturnType<typeof service>, f: Fixture) {
  return {
    testRead: await db.rpc('bunkai_get_test_expanded', { p_actor_user_id: f.actorId, p_test_id: f.testId }),
    runRead: await db.rpc('bunkai_get_run_expanded', { p_actor_user_id: f.actorId, p_run_id: f.runId }),
    atcUsage: await db.rpc('bunkai_atc_usage', { p_actor_user_id: f.actorId, p_atc_id: f.atcId }),
    envRename: await db.rpc('bunkai_rename_environment', {
      p_actor_user_id: f.actorId,
      p_environment_id: f.environmentId,
      p_name: `${PREFIX.slice(0, 30)} env`,
    }),
  };
}

describeOrSkip('BK-991 — explicit-actor helpers refuse a soft-deleted workspace', () => {
  beforeAll(async () => {
    const db = service();

    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(1)
      .single();
    if (memberError) { throw memberError; }
    const actorId = anyMember.user_id as string;

    const { data: ws, error: wsError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: actorId })
      .select('id')
      .single();
    if (wsError) { throw wsError; }
    const workspaceId = ws.id as string;
    // Record the fixture as soon as the workspace exists so afterAll can
    // always clean up, even if a later insert throws.
    fixture = { workspaceId, actorId, projectId: '', atcId: '', testId: '', runId: '', environmentId: '' };

    const { error: wmError } = await db
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: actorId, role: 'owner', status: 'active' });
    if (wmError) { throw wmError; }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-proj`, name: `${PREFIX} proj` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    fixture.projectId = project.id as string;

    const { data: mod, error: modError } = await db
      .from('modules')
      .insert({ project_id: fixture.projectId, path: 'bk991', name: 'BK-991' })
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
        project_id: fixture.projectId,
        module_id: mod.id,
        user_story_id: story.id,
        slug: `${PREFIX}-atc`,
        title: `${PREFIX} atc`,
        layer: 'UI',
        status: 'unrun',
      })
      .select('id')
      .single();
    if (atcError) { throw atcError; }
    fixture.atcId = atc.id as string;

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: workspaceId, title: `${PREFIX} test`, created_by: actorId })
      .select('id')
      .single();
    if (testError) { throw testError; }
    fixture.testId = test.id as string;

    const { error: stepError } = await db
      .from('test_steps')
      .insert({ test_id: fixture.testId, atc_id: fixture.atcId, position: 1 });
    if (stepError) { throw stepError; }

    const { data: env, error: envError } = await db
      .from('project_environments')
      .insert({ project_id: fixture.projectId, name: `${PREFIX.slice(0, 30)} e` })
      .select('id')
      .single();
    if (envError) { throw envError; }
    fixture.environmentId = env.id as string;

    const { data: run, error: runError } = await db
      .from('runs')
      .insert({
        workspace_id: workspaceId,
        project_id: fixture.projectId,
        test_id: fixture.testId,
        environment_id: fixture.environmentId,
        status: 'running',
        executor_mode: 'human',
        executor_user_id: actorId,
        test_title: `${PREFIX} test`,
        start_token: `${PREFIX}-run`,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (runError) { throw runError; }
    fixture.runId = run.id as string;
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    const f = fixture;
    // Explicit order: test_steps RESTRICT atcs, atcs RESTRICT user_stories,
    // runs RESTRICT project_environments — so children go first.
    const cleanups: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ['runs', () => db.from('runs').delete().eq('workspace_id', f.workspaceId)],
      ['tests', () => db.from('tests').delete().eq('workspace_id', f.workspaceId)],
      ['atcs', () => db.from('atcs').delete().eq('project_id', f.projectId)],
      ['project_environments', () => db.from('project_environments').delete().eq('project_id', f.projectId)],
      ['projects', () => db.from('projects').delete().eq('workspace_id', f.workspaceId)],
      ['workspace_members', () => db.from('workspace_members').delete().eq('workspace_id', f.workspaceId)],
      ['workspaces', () => db.from('workspaces').delete().eq('id', f.workspaceId)],
    ];
    for (const [table, cleanup] of cleanups) {
      const { error } = await cleanup();
      if (error) {
        console.error(`[bk991-deleted-ws] cleanup of "${table}" failed for workspace ${f.workspaceId}: ${error.message}`);
      }
    }
  });

  it('control: every RPC succeeds while the workspace is live', async () => {
    const r = await callAll(service(), fixture!);
    expect(r.testRead.error).toBeNull();
    expect(r.runRead.error).toBeNull();
    expect(r.atcUsage.error).toBeNull();
    expect(r.envRename.error).toBeNull();
  });

  it('after soft-delete: reads and writes refuse with the non-member code, never data', async () => {
    const db = service();
    const f = fixture!;
    const { error: stampError } = await db
      .from('workspaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', f.workspaceId);
    if (stampError) { throw stampError; }

    const r = await callAll(db, f);
    // Read / non-disclosing paths -> P0002 (mapped to 404), no payload.
    expect(r.testRead.error?.code).toBe('P0002');
    expect(r.testRead.data).toBeNull();
    expect(r.runRead.error?.code).toBe('P0002');
    expect(r.runRead.data).toBeNull();
    expect(r.atcUsage.error?.code).toBe('P0002');
    expect(r.atcUsage.data).toBeNull();
    expect(r.envRename.error?.code).toBe('P0002');

    // Environment delete: 404 BEFORE the in-use guard (was 409 "in use").
    const envDelete = await db.rpc('bunkai_delete_environment', {
      p_actor_user_id: f.actorId,
      p_environment_id: f.environmentId,
    });
    expect(envDelete.error?.code).toBe('P0002');

    // Member+ write helpers -> 42501, identical to a non-member caller.
    const createTest = await db.rpc('bunkai_create_test', {
      p_actor_user_id: f.actorId,
      p_workspace_id: f.workspaceId,
      p_title: `${PREFIX} blocked`,
      p_atc_ids: [f.atcId],
    });
    expect(createTest.error?.code).toBe('42501');

    const createEnv = await db.rpc('bunkai_create_environment', {
      p_actor_user_id: f.actorId,
      p_project_id: f.projectId,
      p_name: 'bk991 blocked',
    });
    expect(createEnv.error?.code).toBe('42501');

    // Nothing was physically removed (ADR-0015: soft-delete only).
    const { data: stillThere } = await db.from('project_environments').select('id').eq('id', f.environmentId);
    expect((stillThere ?? []).length).toBe(1);
  });
});
