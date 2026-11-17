import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countWorkspaceBugs } from '@lib/bugs/workspace-bugs';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-555 — isolation, ordering, filters, aggregates and paging of
// `bunkai_list_workspace_bugs` (migration 0132), plus the sidebar count that
// must agree with it, proven against the REAL database.
//
// The function is SECURITY INVOKER with no identity parameter (ADR-0012's
// preferred form), so isolation is Postgres RLS running as the caller. A
// service-role call bypasses RLS and would prove nothing, so every assertion
// below runs through a REAL authenticated session: the declared automation
// identity (`.agents/project.yaml` -> `testing.automation_identity`), logged in
// with `signInWithPassword` on the anon key, the app's own login path. The
// service-role client only seeds and removes fixtures.
//
// Fixture: two workspaces, IN (the identity is an active member, granted a
// throwaway Viewer membership if it was not one already) and OUT (the identity
// is not a member). IN gets two throwaway Projects, each with a module named
// "Payments" (AC-06), plus an archived module (AC-19) and a run-linked defect
// whose Run is deleted (AC-18). OUT gets one Project with one defect.
//
// Env-gated: needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL, QA_E2E_USER_PASSWORD. It
// skips loudly when they are missing, and logs + passes when the function is
// not deployed yet or seed state cannot satisfy a precondition.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);
const describeOrSkip = hasEnv ? describe : describe.skip;
if (!hasEnv) {
  console.warn('[workspace-bugs-isolation] skipped: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL, QA_E2E_USER_PASSWORD.');
}

const RPC = 'bunkai_list_workspace_bugs';
const PREFIX = `bk555-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface Item {
  id: string
  workspace_id: string
  project_id: string
  project_slug: string | null
  project_name: string | null
  module: { id: string, name: string, path: string }
  run_id: string | null
  title: string
  severity: string
  status: string
  assignee_user_id: string | null
  created_at: string
}
interface Aggregates {
  by_severity: Record<'P1' | 'P2' | 'P3' | 'P4', number>
  by_status: Record<'open' | 'in_progress' | 'resolved' | 'closed', number>
}
interface Page {
  data: Item[]
  aggregates: Aggregates
  next_cursor: { severity: string, created_at: string, id: string } | null
}

interface Fixture {
  inWorkspaceId: string
  outWorkspaceId: string
  projectA: string
  projectB: string
  outProject: string
  // Listed IN defects, in the order the index must show them.
  ordered: string[]
  archivedBugId: string
  liveRunBugId: string
  deletedRunBugId: string
  outBugId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;
let caller: SupabaseClient | null = null;
let skipReason: string | null = null;
// Recorded as soon as it happens, so cleanup runs even when seeding fails halfway.
let grantedMembership: { workspaceId: string, userId: string } | null = null;

const BASE = Date.parse('2026-06-01T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(BASE - minutesAgo * 60_000).toISOString();

async function seedRun(db: SupabaseClient, workspaceId: string, projectId: string, userId: string, tag: string): Promise<string> {
  const { data: environment, error: environmentError } = await db
    .from('project_environments')
    .insert({ project_id: projectId, name: 'Staging' })
    .select('id')
    .single();
  if (environmentError) { throw environmentError; }
  const { data: test, error: testError } = await db
    .from('tests')
    .insert({ workspace_id: workspaceId, title: `${PREFIX} test ${tag}`, created_by: userId })
    .select('id')
    .single();
  if (testError) { throw testError; }
  const { data: run, error: runError } = await db
    .from('runs')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      test_id: test.id,
      environment_id: environment.id,
      test_title: `${PREFIX} test ${tag}`,
      status: 'failed',
      executor_mode: 'human',
      start_token: `${PREFIX}-${tag}`,
      started_at: at(30),
      finished_at: at(29),
    })
    .select('id')
    .single();
  if (runError) { throw runError; }
  return run.id as string;
}

async function seed(db: SupabaseClient, inWs: string, outWs: string, userId: string): Promise<Fixture> {
  const { data: projects, error: projectsError } = await db
    .from('projects')
    .insert([
      { workspace_id: inWs, slug: `${PREFIX}-a`, name: `${PREFIX} A` },
      { workspace_id: inWs, slug: `${PREFIX}-b`, name: `${PREFIX} B` },
      { workspace_id: outWs, slug: `${PREFIX}-out`, name: `${PREFIX} OUT` },
    ])
    .select('id, slug');
  if (projectsError) { throw projectsError; }
  const projectId = (suffix: string) => (projects ?? []).find(p => p.slug === `${PREFIX}-${suffix}`)!.id as string;
  const [projectA, projectB, outProject] = [projectId('a'), projectId('b'), projectId('out')];

  // Same module name in two Projects (AC-06), and an archived one (AC-19).
  const { data: modules, error: modulesError } = await db
    .from('modules')
    .insert([
      { project_id: projectA, path: 'payments', name: 'Payments' },
      { project_id: projectA, path: 'legacy', name: 'Legacy' },
      { project_id: projectB, path: 'payments', name: 'Payments' },
      { project_id: outProject, path: 'payments', name: 'Payments' },
    ])
    .select('id, project_id, path');
  if (modulesError) { throw modulesError; }
  const moduleId = (project: string, path: string) => (modules ?? []).find(m => m.project_id === project && m.path === path)!.id as string;

  const liveRun = await seedRun(db, inWs, projectA, userId, 'live');
  const doomedRun = await seedRun(db, inWs, projectA, userId, 'doomed');

  const rows = [
    { key: 'a1', workspace_id: inWs, project_id: projectA, module_id: moduleId(projectA, 'payments'), severity: 'P2', status: 'open', created_at: at(1), run_id: liveRun },
    { key: 'a2', workspace_id: inWs, project_id: projectA, module_id: moduleId(projectA, 'payments'), severity: 'P1', status: 'in_progress', created_at: at(2), run_id: null },
    // Same severity and same instant as a1: the tie breaks on id, descending.
    { key: 'a3', workspace_id: inWs, project_id: projectA, module_id: moduleId(projectA, 'payments'), severity: 'P2', status: 'resolved', created_at: at(1), run_id: null },
    { key: 'a4', workspace_id: inWs, project_id: projectA, module_id: moduleId(projectA, 'payments'), severity: 'P4', status: 'closed', created_at: at(3), run_id: doomedRun },
    { key: 'arch', workspace_id: inWs, project_id: projectA, module_id: moduleId(projectA, 'legacy'), severity: 'P1', status: 'open', created_at: at(0), run_id: null },
    { key: 'b1', workspace_id: inWs, project_id: projectB, module_id: moduleId(projectB, 'payments'), severity: 'P3', status: 'open', created_at: at(4), run_id: null },
    { key: 'out', workspace_id: outWs, project_id: outProject, module_id: moduleId(outProject, 'payments'), severity: 'P1', status: 'open', created_at: at(1), run_id: null },
  ];
  const { data: bugs, error: bugsError } = await db
    .from('bugs')
    .insert(rows.map(({ key, ...row }) => ({ ...row, title: `${PREFIX} bug ${key}`, created_by: userId })))
    .select('id, title');
  if (bugsError) { throw bugsError; }
  const bugId = (key: string) => (bugs ?? []).find(b => b.title === `${PREFIX} bug ${key}`)!.id as string;

  // Archive the module AFTER filing against it, then delete the Run behind a4.
  const { error: archiveError } = await db.from('modules').update({ archived_at: new Date().toISOString() }).eq('id', moduleId(projectA, 'legacy'));
  if (archiveError) { throw archiveError; }
  const { error: deleteRunError } = await db.from('runs').delete().eq('id', doomedRun);
  if (deleteRunError) { throw deleteRunError; }

  const [a1, a3] = [bugId('a1'), bugId('a3')].sort().reverse();
  return {
    inWorkspaceId: inWs,
    outWorkspaceId: outWs,
    projectA,
    projectB,
    outProject,
    ordered: [bugId('a2'), a1, a3, bugId('b1'), bugId('a4')],
    archivedBugId: bugId('arch'),
    liveRunBugId: bugId('a1'),
    deletedRunBugId: bugId('a4'),
    outBugId: bugId('out'),
  };
}

describeOrSkip('BK-555 — bunkai_list_workspace_bugs (real session, RLS as the caller)', () => {
  beforeAll(async () => {
    const db = service();

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no user'}).`;
      return;
    }
    const userId = signIn.user.id;

    const probe = await anon.rpc(RPC, { p_workspace_id: ZERO_UUID });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0132_workspace_bugs_index.sql.`;
      return;
    }

    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (workspacesError) { throw workspacesError; }
    const { data: memberships, error: membershipsError } = await db
      .from('workspace_members')
      .select('workspace_id, status')
      .eq('user_id', userId);
    if (membershipsError) { throw membershipsError; }
    const memberOf = new Set((memberships ?? []).filter(m => m.status === 'active').map(m => m.workspace_id as string));
    const anyMembership = new Set((memberships ?? []).map(m => m.workspace_id as string));
    const ids = (workspaces ?? []).map(w => w.id as string);

    const out = ids.find(id => !anyMembership.has(id));
    let inWs = ids.find(id => memberOf.has(id));
    if (!out) {
      skipReason = 'need a live workspace the QA identity does not belong to (seed state).';
      return;
    }
    if (!inWs) {
      inWs = ids.find(id => id !== out && !anyMembership.has(id));
      if (!inWs) {
        skipReason = 'need a second live workspace for the QA identity (seed state).';
        return;
      }
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: inWs, user_id: userId, role: 'viewer', status: 'active' });
      if (grantError) {
        skipReason = `could not grant a temporary membership (${grantError.message}).`;
        return;
      }
      grantedMembership = { workspaceId: inWs, userId };
    }

    fixture = await seed(db, inWs, out, userId);
    caller = anon;
  });

  // Cleans by PREFIX, not by the fixture object, so a seed that failed halfway
  // leaves nothing behind either. Bugs first (they reference runs and modules),
  // then Runs (runs.test_id is ON DELETE RESTRICT), then Projects (cascading
  // modules and environments), then Tests.
  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    await db.from('bugs').delete().like('title', `${PREFIX}%`);
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    await db.from('projects').delete().like('slug', `${PREFIX}%`);
    await db.from('tests').delete().like('title', `${PREFIX}%`);
    if (grantedMembership) {
      await db.from('workspace_members').delete().eq('workspace_id', grantedMembership.workspaceId).eq('user_id', grantedMembership.userId);
    }
  });

  async function list(args: Record<string, unknown>): Promise<Page> {
    const { data, error } = await caller!.rpc(RPC, args);
    if (error) { throw error; }
    return data as unknown as Page;
  }

  // Every row of the IN workspace under the given filters, paged to the end.
  async function listAll(args: Record<string, unknown>): Promise<{ rows: Item[], first: Page }> {
    const rows: Item[] = [];
    let first: Page | null = null;
    let cursor: Page['next_cursor'] = null;
    for (let i = 0; i < 400; i++) {
      const page = await list({
        ...args,
        p_cursor_severity: cursor?.severity,
        p_cursor_created_at: cursor?.created_at,
        p_cursor_id: cursor?.id,
      });
      first ??= page;
      rows.push(...page.data);
      cursor = page.next_cursor;
      if (cursor === null) { break; }
    }
    return { rows, first: first! };
  }

  it('orders most severe first, then most recently filed, ties on id, across Projects (AC-04, AC-07)', async () => {
    if (!fixture) { return warn(); }
    const { rows } = await listAll({ p_workspace_id: fixture.inWorkspaceId });
    const mine = rows.filter(r => r.title.startsWith(PREFIX)).map(r => r.id);
    expect(mine).toEqual(fixture.ordered);
  });

  it('each row names its own Project and full module path (AC-05, AC-06)', async () => {
    if (!fixture) { return warn(); }
    const { rows } = await listAll({ p_workspace_id: fixture.inWorkspaceId });
    const b1 = rows.find(r => r.id === fixture!.ordered[3])!;
    const a2 = rows.find(r => r.id === fixture!.ordered[0])!;
    expect(a2.project_name).toBe(`${PREFIX} A`);
    expect(a2.project_slug).toBe(`${PREFIX}-a`);
    expect(b1.project_name).toBe(`${PREFIX} B`);
    expect(a2.module.path).toBe('payments');
    expect(b1.module.path).toBe('payments');
    expect(a2.module.id).not.toBe(b1.module.id);
  });

  it('a defect on an archived module is neither listed nor counted (AC-19)', async () => {
    if (!fixture) { return warn(); }
    const { rows } = await listAll({ p_workspace_id: fixture.inWorkspaceId });
    expect(rows.some(r => r.id === fixture!.archivedBugId)).toBe(false);
    const scoped = await list({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.projectA });
    // a1..a4 are listed; the archived P1 is not counted.
    expect(scoped.aggregates.by_severity).toEqual({ P1: 1, P2: 2, P3: 0, P4: 1 });
  });

  it('a run-linked defect keeps its Run; one whose Run was deleted reads as having none (AC-18)', async () => {
    if (!fixture) { return warn(); }
    const { rows } = await listAll({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.projectA });
    expect(rows.find(r => r.id === fixture!.liveRunBugId)!.run_id).not.toBeNull();
    expect(rows.find(r => r.id === fixture!.deletedRunBugId)!.run_id).toBeNull();
  });

  it('a workspace the caller does not belong to lists and counts nothing (AC-20)', async () => {
    if (!fixture) { return warn(); }
    const page = await list({ p_workspace_id: fixture.outWorkspaceId });
    expect(page.data).toEqual([]);
    expect(page.aggregates.by_severity).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 });
    expect(page.aggregates.by_status).toEqual({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
    expect(await countWorkspaceBugs(caller as unknown as SupabaseClient<Database>, fixture.outWorkspaceId)).toBe(0);
  });

  it('a foreign Project id used as a filter on the caller\'s workspace lists nothing (AC-08)', async () => {
    if (!fixture) { return warn(); }
    const page = await list({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.outProject });
    expect(page.data).toEqual([]);
  });

  it('the sidebar count equals the unfiltered total and every row paged to the end, with no other workspace\'s defect (AC-02, AC-13, AC-20)', async () => {
    if (!fixture) { return warn(); }
    const { rows, first } = await listAll({ p_workspace_id: fixture.inWorkspaceId });
    const total = Object.values(first.aggregates.by_status).reduce((sum, n) => sum + n, 0);
    const count = await countWorkspaceBugs(caller as unknown as SupabaseClient<Database>, fixture.inWorkspaceId);
    expect(rows.some(r => r.id === fixture!.outBugId)).toBe(false);
    expect(rows.every(r => r.workspace_id === fixture!.inWorkspaceId)).toBe(true);
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
    expect(rows.length).toBe(total);
    expect(count).toBe(total);
  });

  it('filters compose (Project AND status OR AND severity OR) and the counts follow the filtered set (AC-09..AC-12)', async () => {
    if (!fixture) { return warn(); }
    const scope = { p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.projectA };
    const p2 = await list({ ...scope, p_severities: ['P2'] });
    expect(p2.data.map(r => r.id)).toEqual(fixture.ordered.slice(1, 3));
    expect(p2.aggregates.by_status).toEqual({ open: 1, in_progress: 0, resolved: 1, closed: 0 });

    const openOrClosed = await list({ ...scope, p_statuses: ['open', 'closed'] });
    expect(openOrClosed.data.map(r => r.id).sort()).toEqual([fixture.liveRunBugId, fixture.deletedRunBugId].sort());

    const nothing = await list({ ...scope, p_statuses: ['open'], p_severities: ['P1'] });
    expect(nothing.data).toEqual([]);
    expect(nothing.aggregates.by_severity).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 });

    const projectB = await list({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.projectB });
    expect(projectB.data.map(r => r.id)).toEqual([fixture.ordered[3]]);
  });

  it('pages one row at a time through ties without a gap or a repeat (AC-13)', async () => {
    if (!fixture) { return warn(); }
    const { rows } = await listAll({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.projectA, p_limit: 1 });
    expect(rows.map(r => r.id)).toEqual(fixture.ordered.filter(id => id !== fixture!.ordered[3]));
  });

  it('a partial cursor is refused, never a silent first page', async () => {
    if (!fixture) { return warn(); }
    const { error } = await caller!.rpc(RPC, { p_workspace_id: fixture.inWorkspaceId, p_cursor_severity: 'P1' });
    expect(error?.code).toBe('45308');
  });

  it('an anonymous caller cannot execute the function', async () => {
    if (!fixture) { return warn(); }
    const anonymous = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anonymous.rpc(RPC, { p_workspace_id: fixture.inWorkspaceId });
    expect(error).not.toBeNull();
  });
});

function warn() {
  console.warn(`[workspace-bugs-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
