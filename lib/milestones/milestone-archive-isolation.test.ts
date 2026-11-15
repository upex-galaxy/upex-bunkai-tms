import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-1899 — DB-integration guard for archiving and restoring a Milestone
// (migration 0130_milestone_archive_restore.sql): `bunkai_archive_milestone`,
// `bunkai_restore_milestone`, the `milestones_guard_archive` trigger, the
// archived refusals copied into edit / attach / detach, the archived-name
// refusal on create / edit, and the two new Activity Stream events.
//
// The writers are SECURITY DEFINER with no identity parameter: a mocked
// `db.rpc` proves nothing about them. This suite signs in through the app's real
// password path as the declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, `.agents/project.yaml` -> `testing.automation_identity`).
// Service-role is used ONLY for fixture seed, role flips, independent read-back
// and teardown.
//
// FAIL-CLOSED GATE (the milestone-plans-isolation contract). The file is SKIPPED,
// with a loud warning, in exactly two cases: no database environment at all, or
// the database answers that `bunkai_archive_milestone` does not exist (0130 not
// applied). Every other problem FAILS the suite. A run counts as evidence only if
// its output shows zero skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const TAG = '[milestone-archive-isolation]';
const ARCHIVE_RPC = 'bunkai_archive_milestone';
const RESTORE_RPC = 'bunkai_restore_milestone';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran.`);
}

// A deployed archive function refuses the service role (EXECUTE revoked, 42501).
// "Function does not exist" is the one legitimate reason to skip.
let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(ARCHIVE_RPC, { p_milestone_id: ZERO_UUID });
  const code = probe.error?.code ?? 'no error';
  if (code === '42501') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED ENTIRELY: ${ARCHIVE_RPC} is not deployed (${code}). Apply migration 0130_milestone_archive_restore.sql. No assertion in this file ran.`);
  }
  else {
    throw new Error(`${TAG} unexpected answer from the ${ARCHIVE_RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}). Expected 42501 (deployed) or 42883/PGRST202 (not deployed).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;
const PREFIX = `bk1899-msarchive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface ArchiveJson { id: string, name: string, archived_at: string | null, archived_by: string | null, changed: boolean }
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  foreignProjectId: string
  envId: string
}
function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Client = ReturnType<typeof service>;
type Seeded = Record<string, unknown> & { id: string };

function must(result: { data: unknown, error: { message: string } | null }, what: string): Seeded {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${TAG} fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data as Seeded;
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

let fixture: Fixture | null = null;
let qa: Client;
const createdWorkspaceIds: string[] = [];

function need(): Fixture {
  if (!fixture) {
    throw new Error(`${TAG} the fixture was not seeded (see the beforeAll failure above); refusing to pass.`);
  }
  return fixture;
}

describeOrSkip('BK-1899 — archive and restore a Milestone against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error(`${TAG} QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.`);
    }
    const db = service();
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`${TAG} QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    // The identity is a member of the first workspace and of nothing in the second.
    const ownWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'own workspace');
    createdWorkspaceIds.push(ownWs.id);
    must(await db.from('workspace_members').insert({ workspace_id: ownWs.id, user_id: qaUserId, role: 'member', status: 'active' }).select('user_id').single(), 'own membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'foreign workspace');
    createdWorkspaceIds.push(foreignWs.id);

    const project = must(await db.from('projects').insert({ workspace_id: ownWs.id, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const env = must(await db.from('project_environments').insert({ project_id: project.id, name: 'Staging' }).select('id').single(), 'environment');

    fixture = {
      workspaceId: ownWs.id,
      foreignWorkspaceId: foreignWs.id,
      qaUserId,
      projectId: project.id,
      foreignProjectId: foreignProject.id,
      envId: env.id,
    };
  });

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    const ws = createdWorkspaceIds;
    const failures: string[] = [];
    const attempt = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await op;
      if (error) { failures.push(`${what}: ${error.message}`); }
    };
    await attempt('runs', db.from('runs').delete().in('workspace_id', ws));
    await attempt('milestone_plans', db.from('milestone_plans').delete().in('workspace_id', ws));
    await attempt('milestones', db.from('milestones').delete().in('workspace_id', ws));
    await attempt('test_plans', db.from('test_plans').delete().in('workspace_id', ws));
    await attempt('tests', db.from('tests').delete().in('workspace_id', ws));
    await attempt('projects', db.from('projects').delete().in('workspace_id', ws));
    await attempt('workspace_members', db.from('workspace_members').delete().in('workspace_id', ws));
    await attempt('workspaces', db.from('workspaces').delete().in('id', ws));
    const { count, error } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (error) { failures.push(`leftover count: ${error.message}`); }
    else if ((count ?? 0) !== 0) { failures.push(`${count} workspaces with prefix ${PREFIX} survived`); }
    if (failures.length > 0) {
      throw new Error(`${TAG} teardown left fixtures behind (${PREFIX}): ${failures.join('; ')}`);
    }
  }, 60000);

  // ---------------------------------------------------------------- helpers
  let counter = 0;

  async function newMilestone(opts: { foreign?: boolean, targetDate?: string, name?: string } = {}): Promise<string> {
    const f = need();
    const row = must(await service().from('milestones').insert({
      workspace_id: opts.foreign ? f.foreignWorkspaceId : f.workspaceId,
      project_id: opts.foreign ? f.foreignProjectId : f.projectId,
      name: opts.name ?? `${PREFIX} milestone ${++counter}`,
      target_date: opts.targetDate ?? isoDate(30),
      description: 'Scope of the release',
      created_by: f.qaUserId,
    }).select('id').single(), 'milestone');
    return row.id;
  }

  // A plan with one member test whose Run is still in progress, attached to the
  // milestone. Returns the ids the untouched-state checks read back.
  async function planWithRunningRun(milestoneId: string): Promise<{ planId: string, testId: string, runId: string }> {
    const f = need();
    const db = service();
    const plan = must(await db.from('test_plans').insert({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      name: `${PREFIX} plan ${++counter}`,
      status: 'open',
      created_by: f.qaUserId,
    }).select('id').single(), 'plan');
    const test = must(await db.from('tests').insert({ workspace_id: f.workspaceId, title: `${PREFIX} test ${++counter}`, created_by: f.qaUserId }).select('id').single(), 'test');
    must(await db.from('test_plan_tests').insert({ test_plan_id: plan.id, test_id: test.id, added_by: f.qaUserId }).select('id').single(), 'plan member');
    const run = must(await db.from('runs').insert({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      test_id: test.id,
      environment_id: f.envId,
      status: 'running',
      executor_mode: 'human',
      start_token: `${PREFIX}-${++counter}`,
      test_title: `${PREFIX} title`,
      started_at: new Date().toISOString(),
    }).select('id').single(), 'running run');
    must(await db.from('milestone_plans').insert({ workspace_id: f.workspaceId, milestone_id: milestoneId, test_plan_id: plan.id, added_by: f.qaUserId }).select('id').single(), 'membership');
    return { planId: plan.id, testId: test.id, runId: run.id };
  }

  async function archive(milestoneId: string, client: Client = qa) {
    return client.rpc(ARCHIVE_RPC, { p_milestone_id: milestoneId });
  }

  async function restore(milestoneId: string, client: Client = qa) {
    return client.rpc(RESTORE_RPC, { p_milestone_id: milestoneId });
  }

  async function row(milestoneId: string) {
    const { data, error } = await service()
      .from('milestones')
      .select('id, name, target_date, description, archived_at, archived_by, updated_at')
      .eq('id', milestoneId)
      .single();
    if (error) { throw error; }
    return data as { id: string, name: string, target_date: string, description: string, archived_at: string | null, archived_by: string | null, updated_at: string };
  }

  async function events(milestoneId: string, action: string) {
    const { data, error } = await service()
      .from('activity_log')
      .select('actor_user_id, payload')
      .eq('entity_type', 'milestone')
      .eq('entity_id', milestoneId)
      .eq('action', action);
    if (error) { throw error; }
    return (data ?? []) as Array<{ actor_user_id: string | null, payload: Record<string, unknown> }>;
  }

  async function setRole(role: 'viewer' | 'member') {
    const f = need();
    const { error } = await service().from('workspace_members').update({ role }).eq('workspace_id', f.workspaceId).eq('user_id', f.qaUserId);
    if (error) { throw error; }
  }

  async function snapshot(ids: { planId: string, testId: string, runId: string }, milestoneId: string) {
    const db = service();
    const [plan, test, run, members, planTests] = await Promise.all([
      db.from('test_plans').select('*').eq('id', ids.planId).single(),
      db.from('tests').select('*').eq('id', ids.testId).single(),
      db.from('runs').select('*').eq('id', ids.runId).single(),
      db.from('milestone_plans').select('*').eq('milestone_id', milestoneId).order('id'),
      db.from('test_plan_tests').select('*').eq('test_plan_id', ids.planId).order('id'),
    ]);
    for (const r of [plan, test, run, members, planTests]) {
      if (r.error) { throw r.error; }
    }
    return JSON.stringify([plan.data, test.data, run.data, members.data, planTests.data]);
  }

  // ---------------------------------------------------------------- archive
  it('archives an active Milestone: one event naming the caller and the Milestone, nothing it groups changes, a running Run keeps running', async () => {
    const f = need();
    const ms = await newMilestone();
    const ids = await planWithRunningRun(ms);
    const before = await snapshot(ids, ms);

    const { data, error } = await archive(ms);
    expect(error).toBeNull();
    const result = data as unknown as ArchiveJson;
    expect(result.changed).toBe(true);
    expect(result.archived_by).toBe(f.qaUserId);
    expect(result.archived_at).not.toBeNull();

    const stored = await row(ms);
    expect(stored.archived_at).not.toBeNull();
    expect(stored.archived_by).toBe(f.qaUserId);
    const archivedEvents = await events(ms, 'milestone.archived');
    expect(archivedEvents).toHaveLength(1);
    expect(archivedEvents[0].actor_user_id).toBe(f.qaUserId);
    expect(archivedEvents[0].payload).toEqual({ name: stored.name });

    expect(await snapshot(ids, ms)).toBe(before);
    const { data: runRow } = await service().from('runs').select('status, finished_at').eq('id', ids.runId).single();
    expect(runRow).toEqual({ status: 'running', finished_at: null });
  });

  it('archiving an archived Milestone changes nothing and writes no second event', async () => {
    const ms = await newMilestone();
    expect((await archive(ms)).error).toBeNull();
    const first = await row(ms);

    const { data, error } = await archive(ms);
    expect(error).toBeNull();
    expect((data as unknown as ArchiveJson).changed).toBe(false);
    const second = await row(ms);
    expect(second.archived_at).toBe(first.archived_at);
    expect(second.updated_at).toBe(first.updated_at);
    expect(await events(ms, 'milestone.archived')).toHaveLength(1);
  });

  // ---------------------------------------------------------------- restore
  it('restores a past-dated archived Milestone exactly as it was, Test Plans included, with one event', async () => {
    const f = need();
    const ms = await newMilestone({ targetDate: isoDate(-40) });
    const ids = await planWithRunningRun(ms);
    const before = await row(ms);
    expect((await archive(ms)).error).toBeNull();

    const { data, error } = await restore(ms);
    expect(error).toBeNull();
    expect((data as unknown as ArchiveJson).changed).toBe(true);
    const after = await row(ms);
    expect(after.archived_at).toBeNull();
    expect(after.archived_by).toBeNull();
    expect({ name: after.name, target_date: after.target_date, description: after.description })
      .toEqual({ name: before.name, target_date: before.target_date, description: before.description });
    const { data: members } = await service().from('milestone_plans').select('test_plan_id').eq('milestone_id', ms);
    expect(members).toEqual([{ test_plan_id: ids.planId }]);
    const restoredEvents = await events(ms, 'milestone.restored');
    expect(restoredEvents).toHaveLength(1);
    expect(restoredEvents[0].actor_user_id).toBe(f.qaUserId);
    expect(restoredEvents[0].payload).toEqual({ name: before.name });
  });

  it('restoring an active Milestone changes nothing and writes no event', async () => {
    const ms = await newMilestone();
    const before = await row(ms);
    const { data, error } = await restore(ms);
    expect(error).toBeNull();
    expect((data as unknown as ArchiveJson).changed).toBe(false);
    expect((await row(ms)).updated_at).toBe(before.updated_at);
    expect(await events(ms, 'milestone.restored')).toHaveLength(0);
  });

  // ---------------------------------------------------------------- who may act
  it('refuses a Viewer both actions (42501), leaving the Milestone and the history untouched', async () => {
    const active = await newMilestone();
    const archived = await newMilestone();
    expect((await archive(archived)).error).toBeNull();
    await setRole('viewer');
    try {
      expect((await archive(active)).error?.code).toBe('42501');
      expect((await restore(archived)).error?.code).toBe('42501');
    }
    finally {
      await setRole('member');
    }
    expect((await row(active)).archived_at).toBeNull();
    expect((await row(archived)).archived_at).not.toBeNull();
    expect(await events(active, 'milestone.archived')).toHaveLength(0);
    expect(await events(archived, 'milestone.restored')).toHaveLength(0);
  });

  it('answers not found (P0002) for a Milestone of another workspace and for an unknown id', async () => {
    const foreign = await newMilestone({ foreign: true });
    expect((await archive(foreign)).error?.code).toBe('P0002');
    expect((await restore(foreign)).error?.code).toBe('P0002');
    expect((await archive(ZERO_UUID)).error?.code).toBe('P0002');
    expect((await restore(ZERO_UUID)).error?.code).toBe('P0002');
    expect((await row(foreign)).archived_at).toBeNull();
  });

  it('fails closed without a session: the service role and anon hold no EXECUTE', async () => {
    const ms = await newMilestone();
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    expect((await archive(ms, service())).error?.code).toBe('42501');
    expect((await restore(ms, service())).error?.code).toBe('42501');
    expect((await archive(ms, anon)).error?.code).toBe('42501');
    expect((await restore(ms, anon)).error?.code).toBe('42501');
    expect((await row(ms)).archived_at).toBeNull();
  });

  // ---------------------------------------------------------------- read-only
  it('keeps an archived Milestone read-only: edit, attach and detach answer 45507 and change nothing', async () => {
    const f = need();
    const ms = await newMilestone();
    const ids = await planWithRunningRun(ms);
    const extra = must(await service().from('test_plans').insert({ workspace_id: f.workspaceId, project_id: f.projectId, name: `${PREFIX} extra ${++counter}`, status: 'open', created_by: f.qaUserId }).select('id').single(), 'extra plan');
    expect((await archive(ms)).error).toBeNull();
    const before = await row(ms);

    const edit = await qa.rpc('bunkai_update_milestone', { p_milestone_id: ms, p_name: 'Renamed', p_target_date: before.target_date, p_description: '' });
    expect(edit.error?.code).toBe('45507');
    const attach = await qa.rpc('bunkai_attach_plans_to_milestone', { p_milestone_id: ms, p_test_plan_ids: [extra.id] });
    expect(attach.error?.code).toBe('45507');
    const detach = await qa.rpc('bunkai_detach_plan_from_milestone', { p_milestone_id: ms, p_test_plan_id: ids.planId });
    expect(detach.error?.code).toBe('45507');

    const after = await row(ms);
    expect(after).toEqual(before);
    const { data: members } = await service().from('milestone_plans').select('test_plan_id').eq('milestone_id', ms);
    expect(members).toEqual([{ test_plan_id: ids.planId }]);
  });

  it('closes the PostgREST door: a session cannot write the archive columns, nor edit an archived row through the table', async () => {
    const f = need();
    const active = await newMilestone();
    const archived = await newMilestone();
    expect((await archive(archived)).error).toBeNull();
    const archivedBefore = await row(archived);

    const forge = await qa.from('milestones').update({ archived_at: new Date().toISOString(), archived_by: f.qaUserId }).eq('id', active);
    expect(forge.error?.code).toBe('42501');
    const unarchive = await qa.from('milestones').update({ archived_at: null }).eq('id', archived);
    expect(unarchive.error?.code).toBe('42501');
    const rename = await qa.from('milestones').update({ name: `${PREFIX} sneaky` }).eq('id', archived);
    expect(rename.error?.code).toBe('45507');
    const insert = await qa.from('milestones').insert({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      name: `${PREFIX} born archived`,
      target_date: isoDate(10),
      archived_at: new Date().toISOString(),
    });
    expect(insert.error?.code).toBe('42501');

    expect((await row(active)).archived_at).toBeNull();
    expect(await row(archived)).toEqual(archivedBefore);
  });

  // ---------------------------------------------------------------- the name stays reserved
  it('keeps an archived Milestone\'s name: create and rename onto it answer 45508 naming it, regardless of case and spacing', async () => {
    const f = need();
    const name = `${PREFIX} Release 1.0`;
    const held = await newMilestone({ name });
    expect((await archive(held)).error).toBeNull();
    const variant = `  ${name.toLowerCase().replace(' release', '   release')} `;

    const created = await qa.rpc('bunkai_create_milestone', { p_project_id: f.projectId, p_name: variant, p_target_date: isoDate(20), p_description: '' });
    expect(created.error?.code).toBe('45508');
    expect(created.error?.details).toBe(name);

    const other = await newMilestone();
    const renamed = await qa.rpc('bunkai_update_milestone', { p_milestone_id: other, p_name: variant, p_target_date: isoDate(30), p_description: '' });
    expect(renamed.error?.code).toBe('45508');
    expect(renamed.error?.details).toBe(name);

    // Restoring it can never collide: the slot was held the whole time.
    expect((await restore(held)).error).toBeNull();
    const clash = await qa.rpc('bunkai_create_milestone', { p_project_id: f.projectId, p_name: variant, p_target_date: isoDate(20), p_description: '' });
    expect(clash.error?.code).toBe('23505');
  });

  // ---------------------------------------------------------------- Activity Stream
  it('lists one archive and one restore entry in the workspace Activity Stream, named, through the allowlist backstop', async () => {
    const f = need();
    const name = `${PREFIX} feed ${++counter}`;
    const ms = await newMilestone({ name });
    expect((await archive(ms)).error).toBeNull();
    expect((await restore(ms)).error).toBeNull();

    const { data, error } = await qa.rpc('bunkai_list_activity', { p_workspace_id: f.workspaceId, p_limit: 50 });
    expect(error).toBeNull();
    const items = (data as unknown as { items: Array<{ entity_id: string, action: string, actor_user_id: string, payload: Record<string, unknown> }> }).items.filter(item => item.entity_id === ms);
    expect(items.map(item => item.action).sort()).toEqual(['milestone.archived', 'milestone.restored']);
    for (const item of items) {
      expect(item.actor_user_id).toBe(f.qaUserId);
      expect(item.payload).toEqual({ name });
    }
  });

  // ---------------------------------------------------------------- privileges
  it('keeps the new writers away from anon, the service role and the read-only QA role (privileges)', async () => {
    const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
    if (!pgUrl) {
      throw new Error(`${TAG} POSTGRES_URL(_NON_POOLING) is missing, so the function privileges cannot be checked; refusing to pass.`);
    }
    const sql = new SQL(pgUrl);
    try {
      const rows = await sql`
        select p.proname,
               p.prosecdef as definer,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
               has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
               has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec,
               case when exists (select 1 from pg_roles where rolname = 'qa_inspector_ro')
                    then has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE')
                    else false end as qa_ro_exec
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname in (${ARCHIVE_RPC}, ${RESTORE_RPC}, 'bunkai_guard_milestone_archive',
                             'bunkai_attach_plans_to_milestone', 'bunkai_detach_plan_from_milestone')`;
      expect(rows.length).toBe(5);
      for (const r of rows) {
        expect(r.anon_exec).toBe(false);
        expect(r.qa_ro_exec).toBe(false);
        if (r.proname === 'bunkai_guard_milestone_archive') {
          expect(r.auth_exec).toBe(false);
          continue;
        }
        expect(r.definer).toBe(true);
        expect(r.auth_exec).toBe(true);
        if (r.proname === ARCHIVE_RPC || r.proname === RESTORE_RPC) {
          expect(r.service_exec).toBe(false);
        }
      }
    }
    finally {
      await sql.end();
    }
  });
});
