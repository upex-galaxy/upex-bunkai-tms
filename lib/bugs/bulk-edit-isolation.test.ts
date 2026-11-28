import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

// BK-2098 — a mocked rpc proves nothing about a DEFINER function (ADR-0012), so
// this runs bunkai_bulk_edit_bugs (migration 0146) against the real database.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[bug-bulk-edit-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
setDefaultTimeout(60_000);
const PREFIX = `bk2098-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const RPC = 'bunkai_bulk_edit_bugs';
const FAILPOINT = 'bug_bulk_edit.before_event';
const MISSING = '00000000-0000-4000-8000-000000000000';

type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
interface Outcome { bug_id: string, title: string | null, outcome: 'changed' | 'unchanged' | 'refused', reason: string | null, status: string | null, severity: string | null, version: number | null }
interface Report { dry_run: boolean, field: string, requested: number, changed: number, unchanged: number, refused: number, outcomes: Outcome[] }

interface Fixture {
  workspaceId: string
  projectId: string
  moduleId: string
  otherProjectId: string
  otherModuleId: string
  foreignWorkspaceId: string
  foreignModuleId: string
  foreignProjectId: string
  viewerWorkspaceId: string
  viewerProjectId: string
  readOnlyWorkspaceId: string
  readOnlyProjectId: string
  readOnlyBugId: string
  qaUserId: string
  reporterId: string
  assigneeId: string
}

let fixture: Fixture | null = null;
const createdWorkspaces: string[] = [];
let qa: SupabaseClient;
let counter = 0;

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function need(): Fixture {
  if (!fixture) {
    throw new Error('[bug-bulk-edit-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[bug-bulk-edit-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

async function seedBug(opts: { status?: Status, severity?: string, version?: number, projectId?: string, moduleId?: string, workspaceId?: string, assignee?: string | null } = {}): Promise<string> {
  counter += 1;
  const row = must(await service().from('bugs').insert({
    workspace_id: opts.workspaceId ?? need().workspaceId,
    project_id: opts.projectId ?? need().projectId,
    module_id: opts.moduleId ?? need().moduleId,
    title: `${PREFIX} bug ${counter}`,
    severity: opts.severity ?? 'P3',
    steps_to_reproduce: '1. open',
    evidence_urls: [],
    created_by: need().reporterId,
    assignee_user_id: opts.assignee === undefined ? need().assigneeId : opts.assignee,
  }).select('id').single(), 'bug');
  const id = row.id as string;
  const ladder: Status[] = ['open', 'in_progress', 'resolved', 'closed'];
  for (const status of ladder.slice(1, ladder.indexOf(opts.status ?? 'open') + 1)) {
    must(await service().from('bugs').update({ status }).eq('id', id).select('id').single(), `status ${status}`);
  }
  if (opts.version && opts.version > 1) {
    must(await service().from('bugs').update({ content_version: opts.version }).eq('id', id).select('id').single(), 'content version');
  }
  return id;
}

async function bulk(items: Array<{ id: string, version?: number | null }>, field: string, change: Record<string, unknown>, opts: { actor?: string, projectId?: string, dryRun?: boolean } = {}) {
  return service().rpc(RPC, {
    p_actor_user_id: opts.actor ?? need().qaUserId,
    p_project_id: opts.projectId ?? need().projectId,
    p_items: items,
    p_field: field,
    p_change: change,
    p_dry_run: opts.dryRun ?? false,
  });
}

async function ok(items: Array<{ id: string, version?: number | null }>, field: string, change: Record<string, unknown>, opts: Parameters<typeof bulk>[3] = {}): Promise<Report> {
  const { data, error } = await bulk(items, field, change, opts);
  expect(error).toBeNull();
  return data as unknown as Report;
}

function outcomeOf(report: Report, bugId: string): Outcome {
  const found = report.outcomes.find(o => o.bug_id === bugId);
  if (!found) { throw new Error(`no outcome for ${bugId}`); }
  return found;
}

async function bug(bugId: string) {
  return must(await service().from('bugs').select('status, severity, content_version, assignee_user_id, updated_at').eq('id', bugId).single(), 'bug read');
}

async function events(bugId: string, action?: string) {
  let query = service().from('activity_log').select('id, action, actor_user_id, payload').eq('entity_type', 'bug').eq('entity_id', bugId);
  if (action) { query = query.eq('action', action); }
  return must(await query.order('created_at', { ascending: true }), 'event read') as Array<{ id: string, action: string, actor_user_id: string, payload: Record<string, unknown> }>;
}

async function notified(eventIds: string[]): Promise<string[]> {
  if (eventIds.length === 0) { return []; }
  const rows = must(await service().from('notifications').select('recipient_user_id').in('source_event_id', eventIds), 'notification read') as Array<{ recipient_user_id: string }>;
  return rows.map(r => r.recipient_user_id).sort();
}

async function writesOf(bugIds: string[]): Promise<number> {
  const rows = must(await service().from('activity_log').select('id').eq('entity_type', 'bug').in('entity_id', bugIds), 'event count') as unknown[];
  return rows.length;
}

describeOrSkip('BK-2098: bunkai_bulk_edit_bugs', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[bug-bulk-edit-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[bug-bulk-edit-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();
    const members = must(await db.from('workspace_members').select('user_id').eq('status', 'active').limit(200), 'member scan') as Array<{ user_id: string }>;
    const others = [...new Set(members.map(m => m.user_id))].filter(id => id !== qaUserId);
    if (others.length < 2) {
      throw new Error('[bug-bulk-edit-isolation] need two real users other than QA_E2E among active workspace members (seed state).');
    }
    const [reporterId, assigneeId] = others;

    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'workspace');
    createdWorkspaces.push(ws.id as string);
    must(await db.from('workspace_members').insert([
      { workspace_id: ws.id, user_id: qaUserId, role: 'owner', status: 'active' },
      { workspace_id: ws.id, user_id: reporterId, role: 'member', status: 'active' },
      { workspace_id: ws.id, user_id: assigneeId, role: 'member', status: 'active' },
    ]).select('user_id'), 'memberships');
    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} p` }).select('id').single(), 'project');
    const mod = must(await db.from('modules').insert({ project_id: project.id, path: `${PREFIX}-m`, name: `${PREFIX} m` }).select('id').single(), 'module');
    const other = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p2`, name: `${PREFIX} p2` }).select('id').single(), 'other project');
    const otherModule = must(await db.from('modules').insert({ project_id: other.id, path: `${PREFIX}-m2`, name: `${PREFIX} m2` }).select('id').single(), 'other module');

    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: reporterId }).select('id').single(), 'foreign workspace');
    createdWorkspaces.push(foreignWs.id as string);
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-fp`, name: `${PREFIX} fp` }).select('id').single(), 'foreign project');
    const foreignModule = must(await db.from('modules').insert({ project_id: foreignProject.id, path: `${PREFIX}-fm`, name: `${PREFIX} fm` }).select('id').single(), 'foreign module');

    const viewerWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-viewer`, name: `${PREFIX} viewer`, owner_user_id: reporterId }).select('id').single(), 'viewer workspace');
    createdWorkspaces.push(viewerWs.id as string);
    must(await db.from('workspace_members').insert({ workspace_id: viewerWs.id, user_id: qaUserId, role: 'viewer', status: 'active' }).select('user_id'), 'viewer membership');
    const viewerProject = must(await db.from('projects').insert({ workspace_id: viewerWs.id, slug: `${PREFIX}-vp`, name: `${PREFIX} vp` }).select('id').single(), 'viewer project');

    const roWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-ro`, name: `${PREFIX} ro`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'read-only workspace');
    createdWorkspaces.push(roWs.id as string);
    must(await db.from('workspace_members').insert({ workspace_id: roWs.id, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id'), 'read-only membership');
    const roProjects: string[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const p = must(await db.from('projects').insert({ workspace_id: roWs.id, slug: `${PREFIX}-ro${i}`, name: `RO${i}`, created_at: new Date(Date.UTC(2026, 0, i)).toISOString() }).select('id').single(), 'read-only project');
      roProjects.push(p.id as string);
    }
    const roModule = must(await db.from('modules').insert({ project_id: roProjects[0], path: `${PREFIX}-rom`, name: `${PREFIX} rom` }).select('id').single(), 'read-only module');
    const roBug = must(await db.from('bugs').insert({ workspace_id: roWs.id, project_id: roProjects[0], module_id: roModule.id, title: `${PREFIX} locked bug`, severity: 'P3', steps_to_reproduce: '1. open', evidence_urls: [], created_by: qaUserId }).select('id').single(), 'read-only bug');
    must(await db.from('workspaces').update({ plan: 'community' }).eq('id', roWs.id).select('id').single(), 'downgrade');

    fixture = {
      workspaceId: ws.id as string,
      projectId: project.id as string,
      moduleId: mod.id as string,
      otherProjectId: other.id as string,
      otherModuleId: otherModule.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      foreignProjectId: foreignProject.id as string,
      foreignModuleId: foreignModule.id as string,
      viewerWorkspaceId: viewerWs.id as string,
      viewerProjectId: viewerProject.id as string,
      readOnlyWorkspaceId: roWs.id as string,
      readOnlyProjectId: roProjects[0],
      readOnlyBugId: roBug.id as string,
      qaUserId,
      reporterId,
      assigneeId,
    };
  }, 120_000);

  afterAll(async () => {
    const db = service();
    const ids = [...createdWorkspaces];
    if (ids.length === 0) { return; }
    await db.from('bunkai_test_failpoints').delete().in('workspace_id', ids);
    for (const id of ids) {
      const { error } = await db.from('workspaces').delete().eq('id', id);
      if (error) { throw new Error(`[bug-bulk-edit-isolation] cleanup failed for workspace ${id}: ${error.message}`); }
    }
    const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).in('id', ids);
    const { count: bugsLeft } = await db.from('bugs').select('id', { count: 'exact', head: true }).like('title', `${PREFIX}%`);
    if (workspacesLeft !== 0 || bugsLeft !== 0) {
      throw new Error(`[bug-bulk-edit-isolation] cleanup left ${workspacesLeft} workspaces and ${bugsLeft} Bugs behind.`);
    }
  }, 120_000);

  it('cannot be called from a signed-in session (execute is service_role only)', async () => {
    const { error } = await qa.rpc(RPC, {
      p_actor_user_id: need().qaUserId,
      p_project_id: need().projectId,
      p_items: [{ id: MISSING }],
      p_field: 'status',
      p_change: { status: 'in_progress' },
      p_dry_run: true,
    });
    expect(error?.code).toBe('42501');
    expect(error?.message ?? '').toMatch(/permission denied/i);
  });

  it('a non-member actor and an unknown Project are the same P0002, nothing written', async () => {
    const id = await seedBug();
    const stranger = await bulk([{ id }], 'status', { status: 'in_progress' }, { actor: MISSING });
    expect(stranger.error?.code).toBe('P0002');
    const unknown = await bulk([{ id }], 'status', { status: 'in_progress' }, { projectId: MISSING });
    expect(unknown.error?.code).toBe('P0002');
    const foreign = await bulk([{ id }], 'status', { status: 'in_progress' }, { projectId: need().foreignProjectId });
    expect(foreign.error?.code).toBe('P0002');
    expect((await bug(id)).status).toBe('open');
  });

  it('a viewer gets 42501 on a real call and on a dry run', async () => {
    for (const dryRun of [false, true]) {
      const { error } = await bulk([{ id: MISSING }], 'severity', { severity: 'P1' }, { projectId: need().viewerProjectId, dryRun });
      expect(error?.code).toBe('42501');
    }
  });

  it('a read-only Project refuses the whole request with 45701, dry run included', async () => {
    for (const dryRun of [false, true]) {
      const { error } = await bulk([{ id: need().readOnlyBugId }], 'severity', { severity: 'P1' }, { projectId: need().readOnlyProjectId, dryRun });
      expect(error?.code).toBe('45701');
    }
    expect((await bug(need().readOnlyBugId)).severity).toBe('P3');
  });

  it('rejects malformed selections and changes at the request level (45319, 45320)', async () => {
    const id = await seedBug();
    const tooMany = Array.from({ length: 201 }, () => ({ id }));
    for (const items of [[], tooMany, [{ id: 'not-a-uuid' }], [{ version: 1 }], [{ id, version: 0 }], ['x']]) {
      expect((await bulk(items as Array<{ id: string }>, 'status', { status: 'in_progress' })).error?.code).toBe('45319');
    }
    for (const [field, change] of [
      ['title', { title: 'x' }],
      ['status', { status: 'done' }],
      ['severity', { severity: 'P5' }],
      ['status', { status: 'in_progress', severity: 'P1' }],
      ['status', {}],
      ['severity', { status: 'in_progress' }],
    ] as Array<[string, Record<string, unknown>]>) {
      expect((await bulk([{ id }], field, change)).error?.code).toBe('45320');
    }
    expect((await bug(id)).status).toBe('open');
    expect(await writesOf([id])).toBe(0);
  });

  it('aC01: advances open Bugs one stage, one bug.status_changed each with bulk true, nothing else moves', async () => {
    const ids = [await seedBug(), await seedBug(), await seedBug()];
    const report = await ok(ids.map(id => ({ id })), 'status', { status: 'in_progress' });
    expect(report).toMatchObject({ dry_run: false, field: 'status', requested: 3, changed: 3, unchanged: 0, refused: 0 });
    for (const id of ids) {
      expect(outcomeOf(report, id)).toMatchObject({ outcome: 'changed', reason: null, status: 'in_progress', severity: 'P3', version: 1 });
      expect(await bug(id)).toMatchObject({ status: 'in_progress', severity: 'P3', content_version: 1, assignee_user_id: need().assigneeId });
      const rows = await events(id, 'bug.status_changed');
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_user_id).toBe(need().qaUserId);
      expect(rows[0].payload).toEqual({ previous_status: 'open', status: 'in_progress', assignee_user_id: need().assigneeId, bulk: true });
    }
  });

  it('aC02 and AC03: a mixed selection changes the eligible, keeps the held and refuses skips and backward moves', async () => {
    const open = await seedBug();
    const progress = await seedBug({ status: 'in_progress' });
    const resolved = await seedBug({ status: 'resolved' });
    const closed = await seedBug({ status: 'closed' });
    const report = await ok([open, progress, resolved, closed].map(id => ({ id })), 'status', { status: 'resolved' });
    expect(report).toMatchObject({ requested: 4, changed: 1, unchanged: 1, refused: 2 });
    expect(outcomeOf(report, progress)).toMatchObject({ outcome: 'changed', status: 'resolved' });
    expect(outcomeOf(report, resolved)).toMatchObject({ outcome: 'unchanged', status: 'resolved' });
    expect(outcomeOf(report, open)).toMatchObject({ outcome: 'refused', reason: 'status_transition_skipped', status: 'open' });
    expect(outcomeOf(report, closed)).toMatchObject({ outcome: 'refused', reason: 'status_transition_backward', status: 'closed' });
    expect((await bug(open)).status).toBe('open');
    expect((await bug(closed)).status).toBe('closed');
    expect(await writesOf([open, resolved, closed])).toBe(0);

    const close = await ok([resolved, closed, await seedBug({ status: 'in_progress' })].map(id => ({ id })), 'status', { status: 'closed' });
    expect(close).toMatchObject({ changed: 1, unchanged: 1, refused: 1 });
    expect(outcomeOf(close, resolved).outcome).toBe('changed');
    expect(outcomeOf(close, closed).outcome).toBe('unchanged');
  });

  it('aC04: target open never reopens a Bug and writes nothing', async () => {
    const open = await seedBug();
    const progress = await seedBug({ status: 'in_progress' });
    const report = await ok([{ id: open }, { id: progress }], 'status', { status: 'open' });
    expect(outcomeOf(report, open).outcome).toBe('unchanged');
    expect(outcomeOf(report, progress)).toMatchObject({ outcome: 'refused', reason: 'status_transition_backward' });
    expect(await writesOf([open, progress])).toBe(0);
  });

  it('aC05: a bulk status change notifies the same recipients a single change does, never the actor', async () => {
    const single = await seedBug();
    must(await qa.rpc('bunkai_transition_bug_status', { p_bug_id: single, p_new_status: 'in_progress' }), 'single transition');
    const expected = await notified((await events(single, 'bug.status_changed')).map(e => e.id));

    const changed = await seedBug();
    const held = await seedBug({ status: 'in_progress' });
    await ok([{ id: changed }, { id: held }], 'status', { status: 'in_progress' });
    const got = await notified((await events(changed, 'bug.status_changed')).map(e => e.id));
    expect(expected.length).toBeGreaterThan(0);
    expect(got).toEqual(expected);
    expect(got).not.toContain(need().qaUserId);
    expect(await writesOf([held])).toBe(0);
  });

  it('aC06: severity reclassification bumps content_version, writes bug.corrected with bulk true and notifies nobody', async () => {
    const p1 = await seedBug({ severity: 'P1' });
    const p3 = await seedBug({ severity: 'P3' });
    const p2 = await seedBug({ severity: 'P2' });
    const report = await ok([p1, p3, p2].map(id => ({ id, version: 1 })), 'severity', { severity: 'P2' });
    expect(report).toMatchObject({ field: 'severity', changed: 2, unchanged: 1, refused: 0 });
    expect(outcomeOf(report, p1)).toMatchObject({ outcome: 'changed', severity: 'P2', version: 2, status: 'open' });
    expect(outcomeOf(report, p2)).toMatchObject({ outcome: 'unchanged', severity: 'P2', version: 1 });
    expect(await bug(p1)).toMatchObject({ severity: 'P2', content_version: 2, status: 'open', assignee_user_id: need().assigneeId });
    const rows = await events(p3, 'bug.corrected');
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ title: expect.stringContaining(PREFIX), changes: { severity: { from: 'P3', to: 'P2' } }, bulk: true });
    expect(await notified(rows.map(r => r.id))).toEqual([]);
  });

  it('aC07: closed Bugs and Bugs on an archived Module are evaluated like any other', async () => {
    const closed = await seedBug({ status: 'closed', severity: 'P3' });
    const archivedModule = must(await service().from('modules').insert({ project_id: need().projectId, path: `${PREFIX}-archived`, name: `${PREFIX} archived` }).select('id').single(), 'archived module');
    const onArchived = await seedBug({ moduleId: archivedModule.id as string });
    must(await service().from('modules').update({ archived_at: new Date().toISOString() }).eq('id', archivedModule.id).select('id').single(), 'archive module');
    const report = await ok([{ id: closed }, { id: onArchived }], 'severity', { severity: 'P4' });
    expect(report.changed).toBe(2);
  });

  it('aC08 and AC09: a stale severity edit is refused; a no-op wins over the stale check and moves nothing', async () => {
    const stale = await seedBug({ severity: 'P3', version: 2 });
    const report = await ok([{ id: stale, version: 1 }], 'severity', { severity: 'P1' });
    expect(outcomeOf(report, stale)).toMatchObject({ outcome: 'refused', reason: 'stale_version', severity: 'P3', version: 2 });
    expect(await bug(stale)).toMatchObject({ severity: 'P3', content_version: 2 });

    const before = await bug(stale);
    const noop = await ok([{ id: stale, version: 1 }], 'severity', { severity: 'P3' });
    expect(outcomeOf(noop, stale).outcome).toBe('unchanged');
    expect(await bug(stale)).toEqual(before);
    expect(await writesOf([stale])).toBe(0);
  });

  it('aC10: no version overwrites severity; a version sent with status is ignored', async () => {
    const id = await seedBug({ severity: 'P3', version: 3 });
    expect(outcomeOf(await ok([{ id }], 'severity', { severity: 'P1' }), id)).toMatchObject({ outcome: 'changed', version: 4 });
    expect(outcomeOf(await ok([{ id, version: 1 }], 'status', { status: 'in_progress' }), id)).toMatchObject({ outcome: 'changed', status: 'in_progress', version: 4 });
  });

  it('aC11: a dry run reports what the real call does and writes nothing', async () => {
    const ids = [await seedBug(), await seedBug({ status: 'in_progress' }), await seedBug({ status: 'closed' })];
    const before = await Promise.all(ids.map(bug));
    const preview = await ok(ids.map(id => ({ id })), 'status', { status: 'in_progress' }, { dryRun: true });
    expect(preview.dry_run).toBe(true);
    expect(await Promise.all(ids.map(bug))).toEqual(before);
    expect(await writesOf(ids)).toBe(0);
    const real = await ok(ids.map(id => ({ id })), 'status', { status: 'in_progress' });
    expect({ ...preview, dry_run: false }).toEqual(real);
  });

  it('aC12: a Bug of another Project, another workspace or no Bug at all is not_found with null fields', async () => {
    const mine = await seedBug();
    const otherProject = await seedBug({ projectId: need().otherProjectId, moduleId: need().otherModuleId });
    const foreign = await seedBug({ workspaceId: need().foreignWorkspaceId, projectId: need().foreignProjectId, moduleId: need().foreignModuleId, assignee: null });
    const report = await ok([mine, otherProject, foreign, MISSING].map(id => ({ id })), 'severity', { severity: 'P1' });
    expect(outcomeOf(report, mine).outcome).toBe('changed');
    for (const id of [otherProject, foreign, MISSING]) {
      expect(outcomeOf(report, id)).toEqual({ bug_id: id, title: null, outcome: 'refused', reason: 'not_found', status: null, severity: null, version: null });
    }
    expect((await bug(otherProject)).severity).toBe('P3');
    expect((await bug(foreign)).severity).toBe('P3');
  });

  it('aC14: a repeated id is evaluated once with the lowest version sent', async () => {
    const id = await seedBug({ severity: 'P3', version: 2 });
    const report = await ok([{ id, version: 2 }, { id, version: 1 }, { id }], 'severity', { severity: 'P1' });
    expect(report.requested).toBe(1);
    expect(outcomeOf(report, id)).toMatchObject({ outcome: 'refused', reason: 'stale_version' });
  });

  it('aC17: one failing write is write_failed with no event, the others commit', async () => {
    const ids = [await seedBug(), await seedBug(), await seedBug()];
    must(await service().from('bunkai_test_failpoints').insert({ name: `${FAILPOINT}:${ids[1]}`, workspace_id: need().workspaceId }).select('name'), 'failpoint');
    try {
      const report = await ok(ids.map(id => ({ id })), 'status', { status: 'in_progress' });
      expect(report).toMatchObject({ changed: 2, refused: 1 });
      expect(outcomeOf(report, ids[1])).toMatchObject({ outcome: 'refused', reason: 'write_failed', status: 'open' });
      expect((await bug(ids[1])).status).toBe('open');
      expect(await events(ids[1])).toHaveLength(0);
      expect((await bug(ids[0])).status).toBe('in_progress');
      expect((await bug(ids[2])).status).toBe('in_progress');
    }
    finally {
      await service().from('bunkai_test_failpoints').delete().eq('workspace_id', need().workspaceId);
    }
  });

  it('a write gate lost mid-call aborts the whole call and rolls back the Bugs already changed', async () => {
    const ids = [await seedBug(), await seedBug(), await seedBug()].sort();
    must(await service().from('bunkai_test_failpoints').insert({ name: `bug_bulk_edit.forbidden:${ids[2]}`, workspace_id: need().workspaceId }).select('name'), 'forbidden failpoint');
    try {
      const { data, error } = await bulk(ids.map(id => ({ id })), 'status', { status: 'in_progress' });
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
      for (const id of ids) {
        expect((await bug(id)).status).toBe('open');
      }
      expect(await writesOf(ids)).toBe(0);
    }
    finally {
      await service().from('bunkai_test_failpoints').delete().eq('workspace_id', need().workspaceId);
    }
  });

  it('parallel bulk edits on the same Bugs change each Bug exactly once', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 30; i += 1) { ids.push(await seedBug()); }
    const reports = await Promise.all([
      ok(ids.map(id => ({ id })), 'status', { status: 'in_progress' }),
      ok([...ids].reverse().map(id => ({ id })), 'status', { status: 'in_progress' }),
      ok(ids.map(id => ({ id })), 'status', { status: 'in_progress' }),
    ]);
    expect(reports.reduce((sum, r) => sum + r.changed, 0)).toBe(30);
    expect(reports.reduce((sum, r) => sum + r.unchanged, 0)).toBe(60);
    for (const id of ids) {
      expect(await events(id, 'bug.status_changed')).toHaveLength(1);
    }
  });

  it('t6: the Project list returns content_version on every row', async () => {
    const id = await seedBug({ version: 5 });
    const { data, error } = await qa.rpc('bunkai_list_bugs', { p_project_id: need().projectId, p_limit: 50 });
    expect(error).toBeNull();
    const rows = (data as { data: Array<{ id: string, content_version: number }> }).data;
    expect(rows.find(r => r.id === id)?.content_version).toBe(5);
  });
});
