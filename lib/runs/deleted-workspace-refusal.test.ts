import { isProjectInDeletedWorkspaceOf } from '@lib/workspaces/deleted-project';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { isRunInDeletedWorkspaceOf, refuseIfRunWorkspaceDeleted } from './deleted-workspace';

// BK-1129: DB-level guard for BK-512 Scenario N3, sibling of BK-991's
// `lib/workspaces/deleted-workspace-actor-guards.test.ts`. A fake `db` cannot
// prove that the soft-delete really leaves the member's row `active`, or that
// the real mark RPC still refuses, so this drives both against the database.
//
// Shape: one throwaway workspace owned by the declared automation identity
// (`.agents/project.yaml` -> testing.automation_identity -> QA_E2E_USER_EMAIL,
// resolved through a real password sign-in), with one Run started by the real
// `bunkai_create_run`. While the workspace is live the discriminator says no.
// After `deleted_at` is stamped: the step mark is refused and records nothing,
// the discriminator says yes for the member and no for a stranger, and the
// route wrapper turns the refusal into `not_found` / `workspace_deleted`; the
// project layout's slug check (reload path) answers the same way.
//
// Env-gated like its siblings: without Supabase + automation identity env the
// suite SKIPS. The fixture is removed in a `finally`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);

const describeOrSkip = hasEnv ? describe : describe.skip;

const RAND = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8) || 'probe';
const PREFIX = `bk1129-deleted-ws-${Date.now()}-${RAND}`;
const STRANGER = '00000000-0000-0000-0000-000000000000';

interface Fixture {
  workspaceId: string
  projectId: string
  projectSlug: string
  runId: string
  stepId: string
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

async function buildFixture(db: Db, actorId: string, onWorkspace: (f: Fixture) => void): Promise<Fixture> {
  const { data: ws, error: wsError } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: actorId })
    .select('id')
    .single();
  if (wsError) { throw wsError; }
  const f: Fixture = { workspaceId: ws.id as string, projectId: '', projectSlug: `${PREFIX}-proj`, runId: '', stepId: '' };
  onWorkspace(f);

  const { error: wmError } = await db
    .from('workspace_members')
    .insert({ workspace_id: f.workspaceId, user_id: actorId, role: 'owner', status: 'active' });
  if (wmError) { throw wmError; }

  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: f.workspaceId, slug: f.projectSlug, name: `${PREFIX} proj` })
    .select('id')
    .single();
  if (projectError) { throw projectError; }
  f.projectId = project.id as string;

  const { data: mod, error: modError } = await db
    .from('modules')
    .insert({ project_id: f.projectId, path: 'bk1129', name: 'BK-1129' })
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
      title: `${PREFIX} atc`,
      layer: 'UI',
      status: 'unrun',
    })
    .select('id')
    .single();
  if (atcError) { throw atcError; }

  const { error: atcStepError } = await db
    .from('atc_steps')
    .insert({ atc_id: atc.id, position: 1, content: 'Open the page' });
  if (atcStepError) { throw atcStepError; }

  const { data: test, error: testError } = await db
    .from('tests')
    .insert({ workspace_id: f.workspaceId, title: `${PREFIX} test`, created_by: actorId })
    .select('id')
    .single();
  if (testError) { throw testError; }

  const { error: stepError } = await db
    .from('test_steps')
    .insert({ test_id: test.id, atc_id: atc.id, position: 1 });
  if (stepError) { throw stepError; }

  const { data: env, error: envError } = await db
    .from('project_environments')
    .insert({ project_id: f.projectId, name: `${RAND} env` })
    .select('id')
    .single();
  if (envError) { throw envError; }

  // The real start path, so the Run carries real run_atcs + run_steps.
  const { data: run, error: runError } = await db.rpc('bunkai_create_run', {
    p_actor_user_id: actorId,
    p_test_id: test.id,
    p_environment_id: env.id,
    p_executor_mode: 'human',
    p_start_token: `${PREFIX}-run`,
  });
  if (runError) { throw runError; }
  f.runId = (run as { id: string }).id;

  const { data: steps, error: stepsError } = await db
    .from('run_steps')
    .select('id, run_atcs!inner(run_id)')
    .eq('run_atcs.run_id', f.runId)
    .limit(1);
  if (stepsError) { throw stepsError; }
  if (!steps?.[0]) { throw new Error('bunkai_create_run produced no run_steps'); }
  f.stepId = steps[0].id as string;

  return f;
}

async function cleanup(db: Db, f: Fixture) {
  // Same explicit order as the BK-991 suite: runs RESTRICT project_environments,
  // test_steps RESTRICT atcs, so children go first.
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
      console.error(`[bk1129-deleted-ws] cleanup of "${table}" failed for workspace ${f.workspaceId}: ${error.message}`);
    }
  }
}

describeOrSkip('BK-1129: a Run in a soft-deleted workspace is refused as workspace_deleted', () => {
  it('live: no signal; soft-deleted: mark refused, nothing recorded, member told, stranger not', async () => {
    const db = service();
    const actorId = await resolveAutomationUserId();
    let fixture: Fixture | null = null;

    try {
      const f = await buildFixture(db, actorId, (partial) => { fixture = partial; });

      // ---- Live workspace: the discriminator never fires ------------------
      expect(await isRunInDeletedWorkspaceOf(db, { runId: f.runId, userId: actorId })).toBe(false);
      expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: f.projectSlug, userId: actorId })).toBe(false);

      // ---- The Owner deletes the workspace (ADR-0015 soft-delete) ----------
      const { error: deleteError } = await db
        .from('workspaces')
        .update({ deleted_at: new Date().toISOString(), deletion_requested_by: actorId })
        .eq('id', f.workspaceId);
      expect(deleteError).toBeNull();

      // The real write RPC still refuses (BK-991) and records nothing (N3).
      const mark = await db.rpc('bunkai_mark_run_step', {
        p_actor_user_id: actorId,
        p_run_id: f.runId,
        p_run_step_id: f.stepId,
        p_status: 'passed',
        p_note: '',
        p_evidence_url: '',
      });
      expect(mark.error?.code).toBe('42501');
      const { data: step } = await db.from('run_steps').select('status').eq('id', f.stepId).single();
      expect(step?.status).toBe('pending');

      // The read RPC refuses too.
      const read = await db.rpc('bunkai_get_run_expanded', { p_actor_user_id: actorId, p_run_id: f.runId });
      expect(read.error).not.toBeNull();

      // The member is told; a stranger is not.
      expect(await isRunInDeletedWorkspaceOf(db, { runId: f.runId, userId: actorId })).toBe(true);
      expect(await isRunInDeletedWorkspaceOf(db, { runId: f.runId, userId: STRANGER })).toBe(false);
      // The project layout's reload check, same discriminator by slug.
      expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: f.projectSlug, userId: actorId })).toBe(true);
      expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: f.projectSlug, userId: STRANGER })).toBe(false);

      let refusal: { code?: string, status?: number, details?: unknown } | null = null;
      try {
        await refuseIfRunWorkspaceDeleted(db, { error: mark.error!, runId: f.runId, userId: actorId });
      }
      catch (err) {
        refusal = err as { code?: string, status?: number, details?: unknown };
      }
      expect(refusal?.code).toBe('not_found');
      expect(refusal?.status).toBe(404);
      expect(refusal?.details).toEqual({ reason: 'workspace_deleted' });

      // A stranger hitting the same Run keeps the RPC's own refusal.
      await refuseIfRunWorkspaceDeleted(db, { error: mark.error!, runId: f.runId, userId: STRANGER });
    }
    finally {
      if (fixture) {
        await cleanup(db, fixture);
      }
    }
  }, 30_000);
});
