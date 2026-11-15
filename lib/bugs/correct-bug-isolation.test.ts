import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-1835 — DB-integration guard for `bunkai_correct_bug` (migration
// 0129_bug_content_correction.sql), the test ADR-0012 / rpc-authorization.md
// §5 require against the real database (a mocked `db.rpc` proves nothing
// about the function). Same throwaway-workspace fixture as
// `transition-bug-status-isolation.test.ts` (same authorization shape: no
// actor parameter, `authenticated`-only grant, so every call runs through the
// real QA_E2E session).
//
// Covers:
//   (a) a non-member gets the same not-found as a missing defect;
//   (b) a Viewer is refused with the distinct forbidden, content unchanged;
//   (c) a stale version is refused (45314), content unchanged;
//   (d) a save that changes nothing (title differing only by surrounding
//       spaces, same severity) writes nothing and adds no activity row;
//   (e) two fields changed at once leave ONE `bug.corrected` row with both
//       previous/new pairs, bump content_version, and leave status, assignee
//       and provenance untouched; the feed projects the pairs;
//   (f) a closed defect is correctable and stays closed;
//   (g) a title outside 5..200 code points is refused (45301).
//
// DB-dependent and fully env-gated (service and real login). Skips loudly when
// its env is missing, and logs and passes when the migration is not applied
// yet or seed state cannot satisfy a precondition.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const RPC = 'bunkai_correct_bug';
const PREFIX = `bk1835-correct-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface Fixture {
  workspaceId: string
  projectId: string
  moduleId: string
  ownerUserId: string
  qaUserId: string
}

interface CorrectArgs {
  p_bug_id: string
  p_expected_version: number
  p_title?: string
  p_severity?: string
  p_description?: string
  p_steps_to_reproduce?: string
}

interface CorrectResult {
  bug: { title: string, severity: string, description: string | null, steps_to_reproduce: string, status: string, content_version: number }
  changed: boolean
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;
let anon: ReturnType<typeof service> | null = null;
let skipReason: string | null = null;

async function correct(args: CorrectArgs) {
  return anon!.rpc(RPC, args);
}

async function seedBug(db: ReturnType<typeof service>, values: { title: string, severity?: string, status?: string, description?: string | null, steps?: string }) {
  const { data, error } = await db
    .from('bugs')
    .insert({
      workspace_id: fixture!.workspaceId,
      project_id: fixture!.projectId,
      module_id: fixture!.moduleId,
      title: values.title,
      severity: values.severity ?? 'P3',
      status: values.status ?? 'open',
      description: values.description ?? null,
      steps_to_reproduce: values.steps ?? '1. open\n2. click',
      evidence_urls: ['https://example.com/evidence.png'],
      created_by: fixture!.ownerUserId,
    })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id as string;
}

async function readBug(db: ReturnType<typeof service>, bugId: string) {
  const { data, error } = await db
    .from('bugs')
    .select('title, severity, description, steps_to_reproduce, status, assignee_user_id, module_id, run_id, evidence_urls, content_version')
    .eq('id', bugId)
    .single();
  if (error) { throw error; }
  return data;
}

async function correctedRows(db: ReturnType<typeof service>, bugId: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('actor_user_id, action, payload')
    .eq('entity_type', 'bug')
    .eq('entity_id', bugId)
    .eq('action', 'bug.corrected');
  if (error) { throw error; }
  return (data ?? []) as unknown as Array<{ actor_user_id: string, payload: { title: string, changes: Record<string, { from: unknown, to: unknown }> } }>;
}

async function withQaRole<T>(role: 'viewer' | 'member', fn: () => Promise<T>): Promise<T> {
  const db = service();
  const { error } = await db
    .from('workspace_members')
    .insert({ workspace_id: fixture!.workspaceId, user_id: fixture!.qaUserId, role, status: 'active' });
  if (error) { throw error; }
  try {
    return await fn();
  }
  finally {
    await db.from('workspace_members').delete().eq('workspace_id', fixture!.workspaceId).eq('user_id', fixture!.qaUserId);
  }
}

describeOrSkip('BK-1835 — bunkai_correct_bug isolation (authorization, staleness, no-op, one audit row)', () => {
  beforeAll(async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.session || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    anon = client;
    const qaUserId = signIn.user.id;

    // Deployment probe: a missing defect always answers P0002.
    const probe = await anon.rpc(RPC, { p_bug_id: ZERO_UUID, p_expected_version: 1 });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0129_bug_content_correction.sql.`;
      return;
    }

    const db = service();
    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    const ownerUserId = [...new Set((members ?? []).map(m => m.user_id as string))].find(id => id !== qaUserId);
    if (!ownerUserId) {
      skipReason = 'need one real user id other than QA_E2E among active workspace members (seed state).';
      return;
    }

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspace.id as string, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    const { data: module, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: project.id as string, path: `${PREFIX}-module`, name: `${PREFIX} module` })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    fixture = {
      workspaceId: workspace.id as string,
      projectId: project.id as string,
      moduleId: module.id as string,
      ownerUserId,
      qaUserId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    // Deleting the throwaway workspace cascades to its project, module,
    // defects, members and activity rows.
    await service().from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) a non-member gets the same not-found as a missing defect', async () => {
    if (!fixture || !anon) { return warn(); }
    const bugId = await seedBug(service(), { title: `${PREFIX} non-member` });
    const { data, error } = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: 'A new title here' });
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
    expect((await readBug(service(), bugId)).title).toBe(`${PREFIX} non-member`);
  });

  it('(b) a Viewer is refused with forbidden and the defect keeps its content', async () => {
    if (!fixture || !anon) { return warn(); }
    const bugId = await seedBug(service(), { title: `${PREFIX} viewer` });
    await withQaRole('viewer', async () => {
      const { data, error } = await correct({ p_bug_id: bugId, p_expected_version: 1, p_severity: 'P1' });
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
    });
    const row = await readBug(service(), bugId);
    expect(row.severity).toBe('P3');
    expect(row.content_version).toBe(1);
  });

  it('(c) a save from a stale version is refused and changes nothing', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    const bugId = await seedBug(db, { title: `${PREFIX} stale` });
    await withQaRole('member', async () => {
      const first = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: `${PREFIX} stale, teammate fix` });
      expect(first.error).toBeNull();
      expect((first.data as unknown as CorrectResult).bug.content_version).toBe(2);

      const second = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: `${PREFIX} stale, my older fix` });
      expect(second.error?.code).toBe('45314');
      expect(second.data).toBeNull();
    });
    const row = await readBug(db, bugId);
    expect(row.title).toBe(`${PREFIX} stale, teammate fix`);
    expect(row.content_version).toBe(2);
    expect(await correctedRows(db, bugId)).toHaveLength(1);
  });

  it('(d) a title that differs only by surrounding spaces is not a change: nothing written, no activity row', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    const bugId = await seedBug(db, { title: `${PREFIX} no-op`, description: 'Same text' });
    await withQaRole('member', async () => {
      const { data, error } = await correct({
        p_bug_id: bugId,
        p_expected_version: 1,
        p_title: `  ${PREFIX} no-op  `,
        p_severity: 'P3',
        p_description: ' Same text ',
        p_steps_to_reproduce: '1. open\n2. click',
      });
      expect(error).toBeNull();
      expect((data as unknown as CorrectResult).changed).toBe(false);
    });
    const row = await readBug(db, bugId);
    expect(row.content_version).toBe(1);
    expect(await correctedRows(db, bugId)).toHaveLength(0);
  });

  it('(e) two fields changed at once leave one entry with both pairs and keep lifecycle and provenance', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    const bugId = await seedBug(db, { title: `${PREFIX} checkout does nothing`, status: 'in_progress' });
    const before = await readBug(db, bugId);
    await withQaRole('member', async () => {
      const { data, error } = await correct({
        p_bug_id: bugId,
        p_expected_version: 1,
        p_title: `${PREFIX} checkout does nothing on the second click`,
        p_severity: 'P2',
      });
      expect(error).toBeNull();
      const result = data as unknown as CorrectResult;
      expect(result.changed).toBe(true);
      expect(result.bug.severity).toBe('P2');
      expect(result.bug.content_version).toBe(2);
    });

    const after = await readBug(db, bugId);
    expect(after.status).toBe('in_progress');
    expect(after.assignee_user_id).toBe(before.assignee_user_id);
    expect(after.module_id).toBe(before.module_id);
    expect(after.run_id).toBe(before.run_id);
    expect(after.evidence_urls).toEqual(before.evidence_urls);
    expect(after.steps_to_reproduce).toBe(before.steps_to_reproduce);

    const rows = await correctedRows(db, bugId);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(fixture.qaUserId);
    expect(rows[0].payload.changes.severity).toEqual({ from: 'P3', to: 'P2' });
    expect(rows[0].payload.changes.title).toEqual({
      from: `${PREFIX} checkout does nothing`,
      to: `${PREFIX} checkout does nothing on the second click`,
    });
    expect(Object.keys(rows[0].payload.changes).sort()).toEqual(['severity', 'title']);

    // The feed projects the pairs and the changed field names only.
    await withQaRole('member', async () => {
      const { data, error } = await anon!.rpc('bunkai_list_activity', {
        p_workspace_id: fixture!.workspaceId,
        p_actions: ['bug.corrected'],
      });
      expect(error).toBeNull();
      const items = (data as unknown as { items: Array<{ entity_id: string, payload: Record<string, unknown> }> }).items;
      const item = items.find(i => i.entity_id === bugId);
      expect(item?.payload.changed_fields).toEqual(['severity', 'title']);
      expect(item?.payload.severity_change).toEqual({ from: 'P3', to: 'P2' });
      expect(item?.payload).not.toHaveProperty('changes');
    });
  });

  it('(f) a closed defect is correctable and stays closed', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    const bugId = await seedBug(db, { title: `${PREFIX} closed one`, status: 'closed' });
    await withQaRole('member', async () => {
      const { error } = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: `${PREFIX} closed one, typo fixed` });
      expect(error).toBeNull();
    });
    const row = await readBug(db, bugId);
    expect(row.title).toBe(`${PREFIX} closed one, typo fixed`);
    expect(row.status).toBe('closed');
  });

  it('(g) a title outside 5..200 characters is refused with the filing code', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    const bugId = await seedBug(db, { title: `${PREFIX} bounds` });
    await withQaRole('member', async () => {
      const short = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: '   abc   ' });
      expect(short.error?.code).toBe('45301');
      const long = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: 'x'.repeat(201) });
      expect(long.error?.code).toBe('45301');
      const exact = await correct({ p_bug_id: bugId, p_expected_version: 1, p_title: 'y'.repeat(200) });
      expect(exact.error).toBeNull();
    });
    expect((await readBug(db, bugId)).title).toBe('y'.repeat(200));
  });
});

function warn() {
  console.warn(`[correct-bug-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
