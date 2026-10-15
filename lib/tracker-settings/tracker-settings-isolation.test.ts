import type { Database } from '@lib/types/supabase';
import { upsertProjectTrackerSettings } from '@lib/supabase/rpc';
import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-371 — the mandatory ADR-0012 / rpc-authorization.md section 5 DB-integration
// guard for `bunkai_upsert_project_tracker_settings` (migration 0091). A mocked
// `db.rpc` proves nothing about a SECURITY DEFINER function, so everything below
// reaches the REAL database:
//
//  (A) GRANT — a real `authenticated` session, obtained through the app's own
//      password path as the declared `testing.automation_identity`
//      (QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD), calls the function directly.
//      It is refused with 42501 whether it spoofs `p_actor_user_id` or passes its
//      own id: the function is granted to `service_role` ONLY (T2). Only the RPC
//      PARAMETER is spoofed; no JWT is minted and no account is impersonated. A
//      control case first proves the same client can reach an RPC it legitimately
//      holds, so a green here is never an artifact of a broken client.
//
//  (B) FUNCTION BEHAVIOUR — service-role client with an EXPLICIT actor (the exact
//      contract the routes use), against a throwaway workspace seeded and torn
//      down with service-role table writes only (sanctioned: it obtains no
//      session): member / viewer refused, outsider and missing Project
//      indistinguishable (P0002), soft-deleted workspace refused, owner and admin
//      accepted, the PO Q1 predicate matrix, re-queue scoped to the Project (a
//      sibling Project and a Project in another workspace are untouched), the 409
//      confirmation count, a no-change save that touches nothing, off/on/off/on,
//      zero and large backlogs, two parallel first saves, and the table CHECK
//      backstop.
//
//  (C) ACTOR BIND at step 0 — unreachable from (A) or (B) once the grant is
//      narrowed (a session caller is refused at the permission check and a
//      service-role caller carries no `sub`). A direct Postgres connection
//      (POSTGRES_URL, read by name) sets `request.jwt.claims` inside a
//      transaction that is ALWAYS rolled back, and asserts a mismatched uid is
//      refused with P0002 while a NULL uid (the service-role rail) still passes
//      the bind.
//
// The migration is applied by the orchestrator AFTER review (Rule #20), so every
// block detects an absent function / table and SKIPS LOUDLY (a `SKIPPED:` line on
// stderr). It MUST be re-run after the apply. Missing env also skips.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

const hasEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);
const describeDb = hasEnv ? describe : describe.skip;
const describePg = hasEnv && pgUrl ? describe : describe.skip;

const RPC = 'bunkai_upsert_project_tracker_settings';
const CONTROL_RPC = 'bunkai_normalize_test_tags';
const PREFIX = `bk371-tracker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const NOBODY_UUID = '00000000-0000-0000-0000-000000000371';
const NOBODY_PROJECT_UUID = '00000000-0000-0000-0000-000000000372';
const LARGE_BACKLOG = 5000;
const LARGE_BACKLOG_BUDGET_MS = 4000;

type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Db = ReturnType<typeof service>;

interface Fixture {
  workspaceId: string
  otherWorkspaceId: string
  projectId: string
  siblingProjectId: string
  foreignProjectId: string
  moduleId: string
  siblingModuleId: string
  foreignModuleId: string
  qaUserId: string
  ownerUserId: string
}

interface RpcError { code?: string | null, message?: string | null }

function service() {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
}

function skipped(reason: string): void {
  console.warn(`SKIPPED: ${reason}`);
}

// Is the function (and table) deployed? PostgREST answers PGRST202 for an unknown
// function and 42P01 / PGRST205 for an unknown table.
async function deploymentGap(db: Db): Promise<string | null> {
  const probe = await upsertProjectTrackerSettings(db, {
    actorUserId: NOBODY_UUID,
    projectId: NOBODY_PROJECT_UUID,
    destinationProjectKey: 'QAS',
    issueTypeName: 'Bug',
    enabled: false,
  });
  if (probe.error && probe.error.code !== 'P0002') {
    return `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0091_project_tracker_settings.sql, then re-run this suite.`;
  }
  const table = await db.from('project_tracker_settings').select('project_id').limit(1);
  if (table.error) {
    return `project_tracker_settings is not deployed yet (${table.error.code ?? 'unknown'}). Apply migration 0091_project_tracker_settings.sql, then re-run this suite.`;
  }
  return null;
}

async function seedWorkspace(db: Db, ownerUserId: string, label: string) {
  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-${label}`, name: `${PREFIX}-${label}`, owner_user_id: ownerUserId })
    .select('id')
    .single();
  if (workspaceError) { throw workspaceError; }
  return workspace.id;
}

async function seedProject(db: Db, workspaceId: string, label: string) {
  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: workspaceId, slug: `${PREFIX}-${label}`, name: `${PREFIX} ${label}` })
    .select('id')
    .single();
  if (projectError) { throw projectError; }
  const { data: module, error: moduleError } = await db
    .from('modules')
    .insert({ project_id: project.id, path: `${PREFIX}-${label}-module`, name: `${PREFIX} ${label} module` })
    .select('id')
    .single();
  if (moduleError) { throw moduleError; }
  return { projectId: project.id, moduleId: module.id };
}

async function seedBug(
  db: Db,
  args: { workspaceId: string, projectId: string, moduleId: string, status: string, syncState?: string, externalKey?: string, createdBy: string },
) {
  const { data, error } = await db
    .from('bugs')
    .insert({
      workspace_id: args.workspaceId,
      project_id: args.projectId,
      module_id: args.moduleId,
      title: `${PREFIX} bug ${args.status} ${args.syncState ?? 'na'}`,
      severity: 'P3',
      status: args.status,
      created_by: args.createdBy,
      ...(args.syncState
        ? { sync_state: args.syncState, sync_attempts: 4, sync_last_error: args.syncState === 'failed' ? '400 Bad Request' : null }
        : {}),
      ...(args.externalKey ? { external_issue_key: args.externalKey } : {}),
    })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id;
}

async function bugState(db: Db, id: string) {
  const { data, error } = await db
    .from('bugs')
    .select('sync_state, sync_attempts, sync_last_error, sync_next_attempt_at, external_issue_key, updated_at')
    .eq('id', id)
    .single();
  if (error) { throw error; }
  return data;
}

// Gives (or removes) the QA identity's role in the fixture workspace; every test
// sets what it needs, so tests are independent of execution order.
async function setQaRole(db: Db, fixture: Fixture, role: Role | null) {
  await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', fixture.qaUserId);
  if (role === null) { return; }
  const { error } = await db
    .from('workspace_members')
    .insert({ workspace_id: fixture.workspaceId, user_id: fixture.qaUserId, role, status: 'active' });
  if (error) { throw error; }
}

async function settingsRows(db: Db, projectId: string) {
  const { data, error } = await db.from('project_tracker_settings').select('*').eq('project_id', projectId);
  if (error) { throw error; }
  return data;
}

async function auditCount(db: Db, projectId: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('id')
    .eq('entity_id', projectId)
    .eq('action', 'tracker_settings.updated');
  if (error) { throw error; }
  return data.length;
}

// Every re-queue test works on its OWN Project, so Bugs seeded by one test can
// never change the candidate count of another.
async function freshProject(db: Db, fixture: Fixture, label: string) {
  const project = await seedProject(db, fixture.workspaceId, `${label}-${Math.random().toString(36).slice(2, 7)}`);
  return {
    projectId: project.projectId,
    bug: async (status: string, extra: { syncState?: string, externalKey?: string } = {}) => seedBug(db, {
      workspaceId: fixture.workspaceId,
      projectId: project.projectId,
      moduleId: project.moduleId,
      createdBy: fixture.ownerUserId,
      status,
      ...extra,
    }),
  };
}

async function resetProject(db: Db, projectId: string) {
  await db.from('project_tracker_settings').delete().eq('project_id', projectId);
}

describeDb('BK-371 (A) — the settings function is unreachable from a real authenticated session', () => {
  let session: ReturnType<typeof createClient<Database>> | null = null;
  let skipReason: string | null = null;

  beforeAll(async () => {
    const gap = await deploymentGap(service());
    if (gap) { skipReason = gap; return; }
    const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (error || !data.session) {
      skipReason = `QA_E2E login failed (${error?.message ?? 'no session returned'}).`;
      return;
    }
    session = client;
  });

  afterAll(async () => {
    await session?.auth.signOut();
    session = null;
  });

  it('control: the session client is a genuine authenticated caller', async () => {
    if (skipReason) { return skipped(skipReason); }
    const { error } = await session!.rpc(CONTROL_RPC, { p_tags: ['Smoke'] });
    expect(error).toBeNull();
  });

  it('refuses a spoofed actor id with 42501 permission denied', async () => {
    if (skipReason) { return skipped(skipReason); }
    const { data, error } = await upsertProjectTrackerSettings(session!, {
      actorUserId: NOBODY_UUID,
      projectId: NOBODY_PROJECT_UUID,
      destinationProjectKey: 'QAS',
      issueTypeName: 'Bug',
      enabled: true,
    });
    expect(data).toBeNull();
    expect((error as RpcError).code).toBe('42501');
    expect((error as RpcError).message ?? '').toMatch(/permission denied/i);
  });

  it('refuses the session\'s own id too: the grant, not the body, is what refuses (AC-4.6)', async () => {
    if (skipReason) { return skipped(skipReason); }
    const { data: userData } = await session!.auth.getUser();
    const { data, error } = await upsertProjectTrackerSettings(session!, {
      actorUserId: userData.user!.id,
      projectId: NOBODY_PROJECT_UUID,
      destinationProjectKey: 'QAS',
      issueTypeName: 'Bug',
      enabled: false,
    });
    expect(data).toBeNull();
    expect((error as RpcError).code).toBe('42501');
  });
});

describeDb('BK-371 (B) — bunkai_upsert_project_tracker_settings against the real database', () => {
  let fixture: Fixture | null = null;
  let skipReason: string | null = null;

  const call = async (
    db: Db,
    args: { actor: string, projectId: string, key: string, issueType?: string, enabled: boolean, confirm?: number },
  ) => upsertProjectTrackerSettings(db, {
    actorUserId: args.actor,
    projectId: args.projectId,
    destinationProjectKey: args.key,
    issueTypeName: args.issueType ?? 'Bug',
    enabled: args.enabled,
    confirmQueueCount: args.confirm ?? null,
  });

  beforeAll(async () => {
    const db = service();
    const gap = await deploymentGap(db);
    if (gap) { skipReason = gap; return; }

    const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    const qaUserId = signIn.user.id;
    await client.auth.signOut();

    const { data: members, error: membersError } = await db.from('workspace_members').select('user_id').eq('status', 'active').limit(50);
    if (membersError) { throw membersError; }
    const others = [...new Set((members ?? []).map(m => m.user_id))].filter(id => id !== qaUserId);
    if (others.length < 1) {
      skipReason = 'need one real user id other than QA_E2E among active workspace members (seed state).';
      return;
    }
    const ownerUserId = others[0];

    const workspaceId = await seedWorkspace(db, ownerUserId, 'ws');
    const otherWorkspaceId = await seedWorkspace(db, ownerUserId, 'other');
    const main = await seedProject(db, workspaceId, 'main');
    const sibling = await seedProject(db, workspaceId, 'sibling');
    const foreign = await seedProject(db, otherWorkspaceId, 'foreign');

    fixture = {
      workspaceId,
      otherWorkspaceId,
      projectId: main.projectId,
      siblingProjectId: sibling.projectId,
      foreignProjectId: foreign.projectId,
      moduleId: main.moduleId,
      siblingModuleId: sibling.moduleId,
      foreignModuleId: foreign.moduleId,
      qaUserId,
      ownerUserId,
    };
  }, 30_000);

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces cover projects, modules, bugs, settings, members.
    await db.from('workspaces').delete().in('id', [fixture.workspaceId, fixture.otherWorkspaceId]);
    await db.from('activity_log').delete().in('entity_id', [fixture.projectId, fixture.siblingProjectId, fixture.foreignProjectId]);
  });

  // ---- Authorization ------------------------------------------------------

  it('refuses a member and a viewer with 42501 and writes nothing (AC-4.2 / 4.3)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    for (const role of ['member', 'viewer'] as const) {
      await setQaRole(db, fixture, role);
      const { data, error } = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAS', enabled: true });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    }
    expect(await settingsRows(db, fixture.projectId)).toHaveLength(0);
  });

  it('answers an outsider, a missing Project and a foreign-workspace Project with the SAME P0002 (AC-4.4)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, null);

    const outsider = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAS', enabled: false });
    const missing = await call(db, { actor: fixture.ownerUserId, projectId: NOBODY_PROJECT_UUID, key: 'QAS', enabled: false });
    // An admin of the OTHER workspace asking about this workspace's Project.
    await db.from('workspace_members').delete().eq('workspace_id', fixture.otherWorkspaceId).eq('user_id', fixture.qaUserId);
    await db.from('workspace_members').insert({ workspace_id: fixture.otherWorkspaceId, user_id: fixture.qaUserId, role: 'admin', status: 'active' });
    const foreign = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAS', enabled: false });
    await db.from('workspace_members').delete().eq('workspace_id', fixture.otherWorkspaceId).eq('user_id', fixture.qaUserId);

    for (const result of [outsider, missing, foreign]) {
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('P0002');
      expect(result.error?.message).toBe('project_not_found');
    }
    expect(await settingsRows(db, fixture.projectId)).toHaveLength(0);
  });

  it('refuses an admin of a soft-deleted workspace with P0002', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, 'admin');
    await db.from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', fixture.workspaceId);
    try {
      const { data, error } = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAS', enabled: false });
      expect(data).toBeNull();
      expect(error?.code).toBe('P0002');
    }
    finally {
      await db.from('workspaces').update({ deleted_at: null }).eq('id', fixture.workspaceId);
    }
  });

  it('accepts an owner and an admin and returns the stored, normalised values (AC-4.1 / 3.3)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    for (const role of ['owner', 'admin'] as const) {
      await setQaRole(db, fixture, role);
      const { data, error } = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: ' qas ', issueType: ' Bug ', enabled: false });
      expect(error).toBeNull();
      expect(data).toMatchObject({ destination_project_key: 'QAS', issue_type_name: 'Bug', enabled: false, requeued: 0 });
    }
  });

  // ---- Validation and the table backstop ----------------------------------

  it('rejects invalid keys, a missing key and a bad issue type before any write (AC-3.x)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    await setQaRole(db, fixture, 'admin');
    const cases: [string, string, string][] = [
      ['QA-1', 'Bug', '45410'],
      ['1AB', 'Bug', '45410'],
      ['A', 'Bug', '45410'],
      ['ABCDEFGHIJK', 'Bug', '45410'],
      ['ß', 'Bug', '45410'],
      ['', 'Bug', '45411'],
      ['   ', 'Bug', '45411'],
      ['QAS', '', '45412'],
      ['QAS', 'x'.repeat(61), '45412'],
    ];
    for (const [key, issueType, code] of cases) {
      const { error } = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key, issueType, enabled: true });
      expect(error?.code).toBe(code);
    }
    expect(await settingsRows(db, fixture.projectId)).toHaveLength(0);
  });

  it('table CHECK is a backstop for any other writer (AC-3.4)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    for (const key of ['qa-1', ' QAS', 'x'.repeat(300)]) {
      const { error } = await db.from('project_tracker_settings').insert({ project_id: fixture.projectId, destination_project_key: key });
      expect(error?.code).toBe('23514');
    }
    const { error: providerError } = await db
      .from('project_tracker_settings')
      .insert({ project_id: fixture.projectId, destination_project_key: 'QAS', provider: 'github' });
    expect(providerError?.code).toBe('23514');
  });

  // ---- Persistence, defaults and replacement ------------------------------

  it('starts with no row, persists on save, replaces the key and keeps one row (AC-6 / 1 / 7)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    await setQaRole(db, fixture, 'admin');
    expect(await settingsRows(db, fixture.projectId)).toHaveLength(0);

    const first = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAS', enabled: false });
    expect(first.data).toMatchObject({ destination_project_key: 'QAS', enabled: false });
    const second = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAT', enabled: false });
    expect(second.data).toMatchObject({ destination_project_key: 'QAT' });

    const rows = await settingsRows(db, fixture.projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ destination_project_key: 'QAT', provider: 'jira_cloud', enabled: false });
  });

  it('accepts the same key on two Projects (AC-7.3)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    await resetProject(db, fixture.siblingProjectId);
    await setQaRole(db, fixture, 'admin');
    const a = await call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAS', enabled: false });
    const b = await call(db, { actor: fixture.qaUserId, projectId: fixture.siblingProjectId, key: 'QAS', enabled: false });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it('two parallel first saves never error: one row, the later write wins (AC-7.2)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await resetProject(db, fixture.projectId);
    await setQaRole(db, fixture, 'admin');
    const [a, b] = await Promise.all([
      call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAT', enabled: false }),
      call(db, { actor: fixture.qaUserId, projectId: fixture.projectId, key: 'QAU', enabled: false }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const rows = await settingsRows(db, fixture.projectId);
    expect(rows).toHaveLength(1);
    expect(['QAT', 'QAU']).toContain(rows[0].destination_project_key);
  });

  // ---- Re-queue -----------------------------------------------------------

  it('queues exactly the PO Q1 predicate, scoped to this Project (AC-5.1 / 5.3 / 5.4)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, 'admin');
    const project = await freshProject(db, fixture, 'matrix');

    const open = await project.bug('open');
    const inProgress = await project.bug('in_progress');
    const failedResolved = await project.bug('resolved', { syncState: 'failed' });
    const resolved = await project.bug('resolved');
    const closed = await project.bug('closed');
    const synced = await project.bug('open', { syncState: 'synced', externalKey: 'QAS-1' });
    const sibling = await seedBug(db, { workspaceId: fixture.workspaceId, projectId: fixture.siblingProjectId, moduleId: fixture.siblingModuleId, createdBy: fixture.ownerUserId, status: 'open' });
    const foreign = await seedBug(db, { workspaceId: fixture.otherWorkspaceId, projectId: fixture.foreignProjectId, moduleId: fixture.foreignModuleId, createdBy: fixture.ownerUserId, status: 'open' });
    const before = {
      resolved: await bugState(db, resolved),
      closed: await bugState(db, closed),
      synced: await bugState(db, synced),
      sibling: await bugState(db, sibling),
      foreign: await bugState(db, foreign),
    };

    // 3 candidates (open, in_progress, failed): the first call must be refused with N = 3.
    const refused = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: true });
    expect(refused.error?.code).toBe('45413');
    expect(refused.error?.message).toMatch(/:\s*3 defect/);
    expect(await settingsRows(db, project.projectId)).toHaveLength(0);
    expect((await bugState(db, open)).sync_state).toBe('not_applicable');

    // A wrong confirmation is refused as well.
    const wrong = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: true, confirm: 2 });
    expect(wrong.error?.code).toBe('45413');

    const accepted = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: true, confirm: 3 });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toMatchObject({ enabled: true, requeued: 3 });

    for (const id of [open, inProgress, failedResolved]) {
      const state = await bugState(db, id);
      expect(state.sync_state).toBe('pending');
      expect(state.sync_attempts).toBe(0);
      expect(state.sync_last_error).toBeNull();
      expect(state.sync_next_attempt_at).not.toBeNull();
    }
    // Never touched: resolved/closed that never tried, a synced Bug, a sibling Project, another workspace.
    expect(await bugState(db, resolved)).toEqual(before.resolved);
    expect(await bugState(db, closed)).toEqual(before.closed);
    expect(await bugState(db, synced)).toEqual(before.synced);
    expect(await bugState(db, sibling)).toEqual(before.sibling);
    expect(await bugState(db, foreign)).toEqual(before.foreign);
  });

  it('a save that changes nothing writes nothing and queues nothing (AC-5.5)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, 'admin');
    const project = await freshProject(db, fixture, 'nochange');
    const failed = await project.bug('open', { syncState: 'failed' });

    const first = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: false });
    expect(first.error).toBeNull();
    const rowBefore = (await settingsRows(db, project.projectId))[0];
    const auditBefore = await auditCount(db, project.projectId);
    const bugBefore = await bugState(db, failed);

    const again = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'qas', enabled: false });
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ requeued: 0 });
    expect((await settingsRows(db, project.projectId))[0].updated_at).toBe(rowBefore.updated_at);
    expect(await auditCount(db, project.projectId)).toBe(auditBefore);
    expect(await bugState(db, failed)).toEqual(bugBefore);
  });

  it('switching off, or changing the key while off, queues nothing (AC-5.6 / 5.7)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, 'admin');
    const project = await freshProject(db, fixture, 'off');
    const failed = await project.bug('resolved', { syncState: 'failed' });

    await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: false });
    const keyWhileOff = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAT', enabled: false });
    expect(keyWhileOff.data).toMatchObject({ destination_project_key: 'QAT', enabled: false, requeued: 0 });
    expect((await bugState(db, failed)).sync_state).toBe('failed');

    const on = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAT', enabled: true, confirm: 1 });
    expect(on.data).toMatchObject({ enabled: true, requeued: 1 });
    const off = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAT', enabled: false });
    expect(off.data).toMatchObject({ enabled: false, destination_project_key: 'QAT', requeued: 0 });
    expect((await bugState(db, failed)).sync_state).toBe('pending');
  });

  it('off, on, off, on queues the Bug once, not twice (AC-5.8)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, 'admin');
    const project = await freshProject(db, fixture, 'cycle');
    await project.bug('open');
    await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: false });

    const results = [
      await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: true, confirm: 1 }),
      await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: false }),
      await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: true }),
    ];
    expect(results.map(r => r.error)).toEqual([null, null, null]);
    expect(results.map(r => (r.data as { requeued: number }).requeued)).toEqual([1, 0, 0]);
  });

  it('a key or issue type change while ON queues failed Bugs and needs the confirmation (AC-5.2 / 5.10)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    await setQaRole(db, fixture, 'admin');
    const project = await freshProject(db, fixture, 'while-on');

    // On with nothing to queue: no confirmation is needed.
    const enable = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: true });
    expect(enable.error).toBeNull();
    const failed = await project.bug('resolved', { syncState: 'failed' });

    const keyChange = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAV', enabled: true });
    expect(keyChange.error?.code).toBe('45413');
    const confirmed = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAV', enabled: true, confirm: 1 });
    expect(confirmed.data).toMatchObject({ destination_project_key: 'QAV', requeued: 1 });
    expect((await bugState(db, failed)).sync_state).toBe('pending');

    await db.from('bugs').update({ sync_state: 'failed', sync_attempts: 2, sync_last_error: 'x' }).eq('id', failed);
    const typeChange = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAV', issueType: 'Task', enabled: true });
    expect(typeChange.error?.code).toBe('45413');
    const typeConfirmed = await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAV', issueType: 'Task', enabled: true, confirm: 1 });
    expect(typeConfirmed.data).toMatchObject({ issue_type_name: 'Task', requeued: 1 });
  });

  it('a Project with zero Bugs enables with no confirmation and reports zero queued (AC-5.9)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    const empty = await seedProject(db, fixture.workspaceId, `empty-${Math.random().toString(36).slice(2, 6)}`);
    await setQaRole(db, fixture, 'admin');
    const { data, error } = await call(db, { actor: fixture.qaUserId, projectId: empty.projectId, key: 'QAS', enabled: true });
    expect(error).toBeNull();
    expect(data).toMatchObject({ enabled: true, requeued: 0 });
  });

  it('writes one audit row per changing save, with actor, old and new values (T8)', async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    const project = await seedProject(db, fixture.workspaceId, `audit-${Math.random().toString(36).slice(2, 6)}`);
    await setQaRole(db, fixture, 'admin');
    await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAS', enabled: false });
    await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAT', enabled: false });
    await call(db, { actor: fixture.qaUserId, projectId: project.projectId, key: 'QAT', enabled: false });

    const { data, error } = await db
      .from('activity_log')
      .select('actor_user_id, entity_type, payload, created_at')
      .eq('entity_id', project.projectId)
      .eq('action', 'tracker_settings.updated')
      .order('created_at', { ascending: true });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0]).toMatchObject({ actor_user_id: fixture.qaUserId, entity_type: 'project_tracker_settings' });
    expect(data![1].payload).toMatchObject({
      old: { destination_project_key: 'QAS' },
      new: { destination_project_key: 'QAT' },
      requeued: 0,
    });
    await db.from('activity_log').delete().eq('entity_id', project.projectId);
  });

  it(`re-queues a ${LARGE_BACKLOG}-Bug backlog inside ${LARGE_BACKLOG_BUDGET_MS} ms (T5)`, async () => {
    if (!fixture) { return skipped(skipReason ?? 'no fixture'); }
    const db = service();
    const big = await seedProject(db, fixture.workspaceId, `big-${Math.random().toString(36).slice(2, 6)}`);
    await setQaRole(db, fixture, 'admin');

    const chunk = 1000;
    for (let offset = 0; offset < LARGE_BACKLOG; offset += chunk) {
      const rows = Array.from({ length: chunk }, (_, index) => ({
        workspace_id: fixture!.workspaceId,
        project_id: big.projectId,
        module_id: big.moduleId,
        title: `${PREFIX} backlog ${offset + index}`,
        severity: 'P3',
        status: 'open',
        created_by: fixture!.ownerUserId,
      }));
      const { error } = await db.from('bugs').insert(rows);
      if (error) { throw error; }
    }

    const started = performance.now();
    const { data, error } = await call(db, { actor: fixture.qaUserId, projectId: big.projectId, key: 'QAS', enabled: true, confirm: LARGE_BACKLOG });
    const elapsed = Math.round(performance.now() - started);
    console.log(`[BK-371 T5] ${LARGE_BACKLOG}-Bug re-queue took ${elapsed} ms (budget ${LARGE_BACKLOG_BUDGET_MS} ms).`);

    expect(error).toBeNull();
    expect(data).toMatchObject({ requeued: LARGE_BACKLOG });
    // Above the budget: STOP and return to the PO (T5). Do not raise this number to get green.
    expect(elapsed).toBeLessThan(LARGE_BACKLOG_BUDGET_MS);
  }, 120_000);
});

describePg('BK-371 (C) — the actor bind fires at step 0 and keeps the NULL-uid service-role rail', () => {
  let sql: SQL | null = null;
  let fixture: { workspaceId: string, projectId: string, adminId: string, otherId: string } | null = null;
  let skipReason: string | null = null;

  const ROLLBACK = 'bk371-rollback-sentinel';

  beforeAll(async () => {
    const db = service();
    const gap = await deploymentGap(db);
    if (gap) { skipReason = gap; return; }
    const { data: members } = await db.from('workspace_members').select('user_id').eq('status', 'active').limit(50);
    const ids = [...new Set((members ?? []).map(m => m.user_id))];
    if (ids.length < 2) {
      skipReason = 'need two distinct real user ids among active workspace members (seed state).';
      return;
    }
    const [adminId, otherId] = ids as [string, string];
    const workspaceId = await seedWorkspace(db, adminId, 'bind');
    await db.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', adminId);
    await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: adminId, role: 'admin', status: 'active' });
    const { projectId } = await seedProject(db, workspaceId, 'bind');
    fixture = { workspaceId, projectId, adminId, otherId };
    sql = new SQL(pgUrl!);
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
    sql = null;
    if (fixture) {
      await service().from('workspaces').delete().eq('id', fixture.workspaceId);
    }
  });

  // Runs the call with request.jwt.claims.sub = `sub` (or none) inside a
  // transaction that is ALWAYS rolled back. Returns the raised SQLSTATE and
  // message, or null when the call completed.
  async function callWithUid(sub: string | null): Promise<{ code: string | null, message: string } | null> {
    let outcome: { code: string | null, message: string } | null = null;
    try {
      await sql!.begin(async (tx) => {
        const claims = sub === null ? '' : JSON.stringify({ sub, role: 'authenticated' });
        await tx`select set_config('request.jwt.claims', ${claims}, true)`;
        try {
          await tx`select public.bunkai_upsert_project_tracker_settings(${fixture!.adminId}::uuid, ${fixture!.projectId}::uuid, 'QAS', 'Bug', false, null)`;
        }
        catch (error) {
          const err = error as { errno?: unknown, code?: unknown, message: string };
          const sqlstate = [err.errno, err.code].find(value => typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value));
          outcome = { code: typeof sqlstate === 'string' ? sqlstate : null, message: err.message };
        }
        // Always roll back: the successful path writes a settings row.
        throw new Error(ROLLBACK);
      });
    }
    catch (error) {
      if ((error as Error).message !== ROLLBACK) { throw error; }
    }
    return outcome;
  }

  it('a populated auth.uid() that differs from p_actor_user_id is refused with P0002', async () => {
    if (!fixture || !sql) { return skipped(skipReason ?? 'no fixture'); }
    const refused = await callWithUid(fixture.otherId);
    expect(refused).not.toBeNull();
    expect(refused!.code).toBe('P0002');
    expect(refused!.message).toContain('project_not_found');
  });

  it('a populated auth.uid() equal to the actor passes the bind', async () => {
    if (!fixture || !sql) { return skipped(skipReason ?? 'no fixture'); }
    expect(await callWithUid(fixture.adminId)).toBeNull();
  });

  it('a NULL auth.uid() (the service-role rail) passes the bind', async () => {
    if (!fixture || !sql) { return skipped(skipReason ?? 'no fixture'); }
    expect(await callWithUid(null)).toBeNull();
  });

  it('the bind sits BEFORE the first table read, and authenticated / anon hold no EXECUTE', async () => {
    if (!fixture || !sql) { return skipped(skipReason ?? 'no fixture'); }
    const [fn] = await sql`
      select pg_get_functiondef(p.oid) as def,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname = 'bunkai_upsert_project_tracker_settings'`;
    const def = fn.def as string;
    expect(def.indexOf('auth.uid()')).toBeGreaterThan(-1);
    expect(def.indexOf('auth.uid()')).toBeLessThan(def.indexOf('public.projects'));
    expect(fn.auth_exec).toBe(false);
    expect(fn.anon_exec).toBe(false);
    expect(fn.service_exec).toBe(true);
  });
});
