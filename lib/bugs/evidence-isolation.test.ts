import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-594 - DB-integration guard for defect evidence uploads (migration
// 0131_bug_evidence_attachments.sql): `bunkai_init_bug_evidence`, `bunkai_commit_bug_evidence`,
// `bunkai_discard_bug_evidence`, `bunkai_expire_bug_evidence`, the claim inside
// `bunkai_create_bug`, the `bug_evidence_attachments` table, its frozen-row guard, its totals
// constraint trigger and its cleanup trigger.
//
// The upload writers read auth.uid(), so a mocked `db.rpc` proves nothing about them. This suite
// signs in through the app's real password path as the declared automation identity
// (`QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`), never a minted JWT. The identity's ROLE in the
// suite's own throwaway workspace is switched through the service client, and "somebody else
// uploaded it" is modelled with `created_by = null`. Service role is used ONLY for fixture
// seed, role switching, clock moves, read-back and teardown. No Storage object is ever written
// (the bytes path is covered by lib/bugs/evidence-upload.test.ts against a fake Storage).
//
// FAIL-CLOSED GATE (same as lib/runs/step-attachments-isolation.test.ts): SKIPPED only when there
// is no database environment, or when `bunkai_init_bug_evidence` does not exist (0131 not
// applied). In every other case a problem FAILS the file. Evidence only with zero skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[bug-evidence-isolation] SKIPPED ENTIRELY: no database environment. No assertion in this file ran, so nothing here is evidence about the functions.');
}

const INIT_RPC = 'bunkai_init_bug_evidence';
const COMMIT_RPC = 'bunkai_commit_bug_evidence';
const DISCARD_RPC = 'bunkai_discard_bug_evidence';
const EXPIRE_RPC = 'bunkai_expire_bug_evidence';
const CREATE_RPC = 'bunkai_create_bug';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const MIB = 1024 * 1024;

let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(INIT_RPC, { p_project_id: ZERO_UUID, p_draft_id: ZERO_UUID, p_filename: 'probe.png', p_content_type: 'image/png', p_byte_size: 1 });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[bug-evidence-isolation] SKIPPED ENTIRELY: ${INIT_RPC} is not deployed (${code}). Apply migration 0131_bug_evidence_attachments.sql.`);
  }
  else {
    throw new Error(`[bug-evidence-isolation] unexpected answer from the ${INIT_RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;

const PREFIX = `bk594-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SEED_TIMEOUT = 60_000;

type Role = 'viewer' | 'member' | 'admin' | 'owner';
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  moduleId: string
  foreignProjectId: string
  foreignModuleId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[bug-evidence-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

let fixture: Fixture | null = null;
let qa: ReturnType<typeof service>;
const createdWorkspaceIds: string[] = [];

function need(): Fixture {
  if (!fixture) {
    throw new Error('[bug-evidence-isolation] the fixture was not seeded; refusing to pass.');
  }
  return fixture;
}

describeOrSkip('BK-594 - defect evidence uploads against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[bug-evidence-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    const db = service();
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[bug-evidence-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    const ownWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'own workspace');
    createdWorkspaceIds.push(ownWs.id as string);
    must(await db.from('workspace_members').insert({ workspace_id: ownWs.id, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'own membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'foreign workspace');
    createdWorkspaceIds.push(foreignWs.id as string);

    const project = must(await db.from('projects').insert({ workspace_id: ownWs.id, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const ownModule = must(await db.from('modules').insert({ project_id: project.id, path: `${PREFIX}-m`, name: `${PREFIX} module` }).select('id').single(), 'module');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const foreignModule = must(await db.from('modules').insert({ project_id: foreignProject.id, path: `${PREFIX}-fm`, name: `${PREFIX} foreign module` }).select('id').single(), 'foreign module');

    fixture = {
      workspaceId: ownWs.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      qaUserId,
      projectId: project.id as string,
      moduleId: ownModule.id as string,
      foreignProjectId: foreignProject.id as string,
      foreignModuleId: foreignModule.id as string,
    };
  }, SEED_TIMEOUT);

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    const failures: string[] = [];
    // The workspace delete cascades projects, modules, defects and uploads; the uploads' AFTER
    // DELETE trigger then enqueues their paths, which carry no foreign key: removed by prefix.
    const ws = await db.from('workspaces').delete().in('id', createdWorkspaceIds);
    if (ws.error) { failures.push(`workspaces: ${ws.error.message}`); }
    for (const id of createdWorkspaceIds) {
      const q = await db.from('storage_cleanup_queue').delete().like('path', `${id}/%`);
      if (q.error) { failures.push(`storage_cleanup_queue: ${q.error.message}`); }
    }
    const left = await db.from('bug_evidence_attachments').select('id', { count: 'exact', head: true }).in('workspace_id', createdWorkspaceIds);
    if ((left.count ?? 0) > 0) { failures.push(`bug_evidence_attachments: ${left.count} rows left`); }
    for (const id of createdWorkspaceIds) {
      const queued = await db.from('storage_cleanup_queue').select('id', { count: 'exact', head: true }).like('path', `${id}/%`);
      if ((queued.count ?? 0) > 0) { failures.push(`storage_cleanup_queue: ${queued.count} rows left`); }
    }
    if (failures.length > 0) {
      throw new Error(`[bug-evidence-isolation] teardown left fixtures behind (${PREFIX}): ${failures.join('; ')}`);
    }
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- helpers
  let seq = 0;

  async function asRole<T>(role: Role, fn: () => Promise<T>): Promise<T> {
    const f = need();
    const db = service();
    must(await db.from('workspace_members').update({ role }).eq('workspace_id', f.workspaceId).eq('user_id', f.qaUserId).select('user_id'), `role ${role}`);
    try {
      return await fn();
    }
    finally {
      must(await db.from('workspace_members').update({ role: 'owner' }).eq('workspace_id', f.workspaceId).eq('user_id', f.qaUserId).select('user_id'), 'role restore');
    }
  }

  function draft(): string {
    return crypto.randomUUID();
  }

  async function init(opts: { draftId: string, size?: number, projectId?: string, type?: string, filename?: string }) {
    const f = need();
    return qa.rpc(INIT_RPC, {
      p_project_id: opts.projectId ?? f.projectId,
      p_draft_id: opts.draftId,
      p_filename: opts.filename ?? 'shot.png',
      p_content_type: opts.type ?? 'image/png',
      p_byte_size: opts.size ?? 1000,
    });
  }

  async function upload(draftId: string, size = 1000): Promise<string> {
    const started = await init({ draftId, size });
    if (started.error) { throw new Error(`init failed: ${started.error.code} ${started.error.message}`); }
    const id = (started.data as { attachment: { id: string } }).attachment.id;
    const done = await qa.rpc(COMMIT_RPC, { p_attachment_id: id, p_byte_size: size });
    if (done.error) { throw new Error(`commit failed: ${done.error.code} ${done.error.message}`); }
    return id;
  }

  async function file(opts: { ids?: string[], order?: number[] | null, links?: string[], title?: string } = {}) {
    const f = need();
    return qa.rpc(CREATE_RPC, {
      p_actor_user_id: f.qaUserId,
      p_project_id: f.projectId,
      p_module_id: f.moduleId,
      p_title: opts.title ?? `${PREFIX} defect ${++seq}`,
      p_severity: 'P3',
      p_description: null as unknown as string,
      p_steps_to_reproduce: '',
      p_evidence_urls: opts.links ?? [],
      p_run_id: null as unknown as string,
      p_run_step_id: null as unknown as string,
      p_atc_id: null as unknown as string,
      p_evidence_attachment_ids: opts.ids ?? [],
      p_evidence_order: (opts.order ?? null) as unknown as number[],
    });
  }

  async function row(id: string) {
    return must(await service().from('bug_evidence_attachments').select('*').eq('id', id).single(), `read ${id}`);
  }

  async function bugCountByTitle(title: string): Promise<number> {
    const { count } = await service().from('bugs').select('id', { count: 'exact', head: true }).eq('title', title);
    return count ?? 0;
  }

  // ------------------------------------------------------------------ init
  it('init writes a pending row on a server-chosen path, owned by the caller, invisible to every reader', async () => {
    const f = need();
    const started = await init({ draftId: draft(), filename: '<img src=x onerror=alert(1)>.png' });
    expect(started.error).toBeNull();
    const out = started.data as { attachment: { id: string, status: string, filename: string }, storage_path: string };
    expect(out.attachment.status).toBe('pending');
    expect(out.storage_path).toBe(`${f.workspaceId}/bug/${f.projectId}/${out.attachment.id}`);
    expect(out.attachment.filename).toBe('<img src=x onerror=alert(1)>.png');
    const stored = await row(out.attachment.id);
    expect(stored.created_by).toBe(f.qaUserId);
    expect(Date.parse(stored.expires_at as string) - Date.parse(stored.created_at as string)).toBe(3 * 60 * 60 * 1000);
    const visible = await qa.from('bug_evidence_attachments').select('id').eq('id', out.attachment.id);
    expect(visible.data).toEqual([]);
  });

  it('init refuses a foreign or missing project (P0002), a viewer (42501), a bad type (22023) and 10 MiB + 1 (45303)', async () => {
    const f = need();
    expect((await init({ draftId: draft(), projectId: f.foreignProjectId })).error?.code).toBe('P0002');
    expect((await init({ draftId: draft(), projectId: ZERO_UUID })).error?.code).toBe('P0002');
    const viewer = await asRole('viewer', async () => init({ draftId: draft() }));
    expect(viewer.error?.code).toBe('42501');
    expect((await init({ draftId: draft(), type: 'image/gif' })).error?.code).toBe('22023');
    const big = await init({ draftId: draft(), size: 10 * MIB + 1 });
    expect([big.error?.code, big.error?.hint]).toEqual(['45303', 'file_bytes']);
    expect((await init({ draftId: draft(), size: 10 * MIB })).error).toBeNull();
  });

  it('caps one draft at 10 live uploads and 50 MiB, inclusive; another draft is independent (AC-05, AC-20)', async () => {
    const a = draft();
    for (let i = 0; i < 10; i += 1) {
      expect((await init({ draftId: a, size: 10 })).error).toBeNull();
    }
    const eleventh = await init({ draftId: a, size: 10 });
    expect([eleventh.error?.code, eleventh.error?.hint]).toEqual(['45303', 'count']);
    expect((await init({ draftId: draft(), size: 10 })).error).toBeNull();

    const b = draft();
    for (let i = 0; i < 5; i += 1) {
      expect((await init({ draftId: b, size: 10 * MIB })).error).toBeNull();
    }
    const over = await init({ draftId: b, size: 1 });
    expect([over.error?.code, over.error?.hint]).toEqual(['45303', 'bytes']);
  });

  // ---------------------------------------------------------------- commit
  it('commit flips pending to committed with the actual size, is idempotent, and still hides the row', async () => {
    const started = await init({ draftId: draft(), size: 5000 });
    const id = (started.data as { attachment: { id: string } }).attachment.id;
    const first = await qa.rpc(COMMIT_RPC, { p_attachment_id: id, p_byte_size: 4321 });
    expect(first.error).toBeNull();
    expect((first.data as { attachment: { status: string, byte_size: number } }).attachment).toMatchObject({ status: 'committed', byte_size: 4321 });
    const again = await qa.rpc(COMMIT_RPC, { p_attachment_id: id, p_byte_size: 9 });
    expect((again.data as { attachment: { byte_size: number } }).attachment.byte_size).toBe(4321);
    expect((await qa.from('bug_evidence_attachments').select('id').eq('id', id)).data).toEqual([]);
  });

  it('commit answers P0002 for somebody else\'s upload and 45318 after the window', async () => {
    const db = service();
    const other = (await init({ draftId: draft() })).data as { attachment: { id: string } };
    must(await db.from('bug_evidence_attachments').update({ created_by: null }).eq('id', other.attachment.id).select('id'), 'orphan');
    expect((await qa.rpc(COMMIT_RPC, { p_attachment_id: other.attachment.id, p_byte_size: 1 })).error?.code).toBe('P0002');

    const late = (await init({ draftId: draft() })).data as { attachment: { id: string } };
    must(await db.from('bug_evidence_attachments').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', late.attachment.id).select('id'), 'expire');
    expect((await qa.rpc(COMMIT_RPC, { p_attachment_id: late.attachment.id, p_byte_size: 1 })).error?.code).toBe('45318');
  });

  // ----------------------------------------------------------------- claim
  it('filing claims the uploads at their positions; the record lists them; members can read them (AC-01, AC-09)', async () => {
    const d = draft();
    const a = await upload(d, 2 * MIB);
    const b = await upload(d, 3 * MIB);
    const filed = await file({ ids: [a, b], order: [0, 2], links: ['https://example.com/log'] });
    expect(filed.error).toBeNull();
    const bug = filed.data as { id: string, evidence_urls: string[], evidence_attachments: Array<{ id: string, position: number }> };
    expect(bug.evidence_urls).toEqual(['https://example.com/log']);
    expect(bug.evidence_attachments.map(x => [x.id, x.position])).toEqual([[a, 0], [b, 2]]);
    const claimed = await row(a);
    expect([claimed.bug_id, claimed.expires_at]).toEqual([bug.id, null]);
    const visible = await qa.from('bug_evidence_attachments').select('id').eq('bug_id', bug.id);
    expect((visible.data ?? []).map(r => r.id).sort()).toEqual([a, b].sort());
    // a Viewer reads too (Workspace-level access, AC-17)
    const asViewer = await asRole('viewer', async () => (await qa.from('bug_evidence_attachments').select('id').eq('bug_id', bug.id)).data ?? []);
    expect(asViewer).toHaveLength(2);
  });

  it('without an order the uploads follow the links', async () => {
    const id = await upload(draft());
    const filed = await file({ ids: [id], links: ['https://example.com/a', 'https://example.com/b'] });
    expect((filed.data as { evidence_attachments: Array<{ position: number }> }).evidence_attachments[0]?.position).toBe(2);
  });

  it('refuses the eleventh item whatever the mix, and creates nothing (AC-03, AC-19)', async () => {
    const d1 = draft();
    const seven = [];
    for (let i = 0; i < 7; i += 1) { seven.push(await upload(d1, 10)); }
    const links = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`);
    const cases: Array<{ links: string[], ids: string[] }> = [
      { links: links(4), ids: seven },
      { links: links(10), ids: seven.slice(0, 1) },
      { links: links(11), ids: [] },
    ];
    for (const c of cases) {
      const title = `${PREFIX} eleventh ${++seq}`;
      const refused = await file({ links: c.links, ids: c.ids, title });
      expect(refused.error?.code).toBe('45303');
      expect(await bugCountByTitle(title)).toBe(0);
    }
    expect((await row(seven[0])).bug_id).toBeNull();
  });

  it('accepts exactly 50 MiB of images on one defect and refuses one byte more, across drafts (AC-05)', async () => {
    const d1 = draft();
    const d2 = draft();
    const exact = [
      await upload(d1, 10 * MIB),
      await upload(d1, 10 * MIB),
      await upload(d1, 10 * MIB),
      await upload(d2, 10 * MIB),
      await upload(d2, 10 * MIB),
    ];
    expect((await file({ ids: exact })).error).toBeNull();

    const d3 = draft();
    const d4 = draft();
    const over = [
      await upload(d3, 10 * MIB),
      await upload(d3, 10 * MIB),
      await upload(d3, 10 * MIB),
      await upload(d4, 10 * MIB),
      await upload(d4, 10 * MIB),
      await upload(d4, 1),
    ];
    const title = `${PREFIX} bytes ${++seq}`;
    const refused = await file({ ids: over, title });
    expect([refused.error?.code, refused.error?.hint]).toEqual(['45303', 'bytes']);
    expect(await bugCountByTitle(title)).toBe(0);
  });

  it('refuses a foreign, pending, somebody else\'s, expired or already claimed upload with one code (AC-24)', async () => {
    const db = service();
    const pending = ((await init({ draftId: draft() })).data as { attachment: { id: string } }).attachment.id;
    const others = await upload(draft());
    must(await db.from('bug_evidence_attachments').update({ created_by: null }).eq('id', others).select('id'), 'orphan');
    const expired = await upload(draft());
    must(await db.from('bug_evidence_attachments').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expired).select('id'), 'expire');
    const claimedOnce = await upload(draft());
    expect((await file({ ids: [claimedOnce] })).error).toBeNull();
    for (const id of [pending, others, expired, claimedOnce, ZERO_UUID]) {
      const title = `${PREFIX} foreign ${++seq}`;
      expect((await file({ ids: [id], title })).error?.code).toBe('45315');
      expect(await bugCountByTitle(title)).toBe(0);
    }
  });

  it('refuses an upload of another Project of the same Workspace', async () => {
    const f = need();
    const db = service();
    const second = must(await db.from('projects').insert({ workspace_id: f.workspaceId, slug: `${PREFIX}-p2`, name: `${PREFIX} p2` }).select('id').single(), 'second project');
    const started = await init({ draftId: draft(), projectId: second.id as string });
    const id = (started.data as { attachment: { id: string } }).attachment.id;
    await qa.rpc(COMMIT_RPC, { p_attachment_id: id, p_byte_size: 1000 });
    expect((await file({ ids: [id] })).error?.code).toBe('45315');
  });

  it('refuses an invalid order (45316) and a viewer filing with images (42501)', async () => {
    const id = await upload(draft());
    expect((await file({ ids: [id], order: [5] })).error?.code).toBe('45316');
    expect((await file({ ids: [id], order: [0, 1] })).error?.code).toBe('45316');
    const viewer = await asRole('viewer', async () => file({ ids: [id] }));
    expect(viewer.error?.code).toBe('42501');
    expect((await row(id)).bug_id).toBeNull();
  });

  it('two filings racing for the same upload: exactly one defect gets it (AC-18)', async () => {
    const id = await upload(draft());
    const [a, b] = await Promise.all([file({ ids: [id] }), file({ ids: [id] })]);
    const outcomes = [a.error?.code ?? 'ok', b.error?.code ?? 'ok'].sort();
    expect(outcomes).toEqual(['45315', 'ok']);
  });

  // ---------------------------------------------------------------- frozen
  it('a claimed row is frozen: discard is refused and a direct change is refused (AC-11)', async () => {
    const id = await upload(draft());
    expect((await file({ ids: [id] })).error).toBeNull();
    expect((await qa.rpc(DISCARD_RPC, { p_attachment_id: id })).error?.code).toBe('45317');
    const moved = await service().from('bug_evidence_attachments').update({ position: 5 }).eq('id', id);
    expect(moved.error?.code).toBe('45317');
  });

  it('the constraint trigger re-checks the total on a direct insert of a claimed row (AC-19)', async () => {
    const f = need();
    const filed = await file({ links: Array.from({ length: 10 }, (_, i) => `https://example.com/t${i}`) });
    const bugId = (filed.data as { id: string }).id;
    const inserted = await service().from('bug_evidence_attachments').insert({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      draft_id: draft(),
      bug_id: bugId,
      position: 9,
      storage_path: `${f.workspaceId}/bug/${f.projectId}/${crypto.randomUUID()}`,
      original_filename: 'x.png',
      content_type: 'image/png',
      byte_size: 1,
      status: 'committed',
      created_by: f.qaUserId,
      committed_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    });
    expect(inserted.error?.code).toBe('45303');
  });

  it('no client role can write the table directly', async () => {
    const f = need();
    const direct = await qa.from('bug_evidence_attachments').insert({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      draft_id: draft(),
      storage_path: `${f.workspaceId}/bug/${f.projectId}/${crypto.randomUUID()}`,
      original_filename: 'x.png',
      content_type: 'image/png',
      byte_size: 1,
      expires_at: new Date(Date.now() + 1000000).toISOString(),
    });
    expect(direct.error).not.toBeNull();
  });

  // --------------------------------------------------- discard and cleanup
  it('discard removes an unfiled upload and queues its object in run-evidence', async () => {
    const f = need();
    const id = await upload(draft());
    const gone = await qa.rpc(DISCARD_RPC, { p_attachment_id: id });
    expect(gone.error).toBeNull();
    const path = `${f.workspaceId}/bug/${f.projectId}/${id}`;
    const queued = must(await service().from('storage_cleanup_queue').select('bucket, reason').eq('path', path), 'queue read');
    expect(queued).toEqual([{ bucket: 'run-evidence', reason: 'bug_evidence_unclaimed' }]);
  });

  it('the sweep helper expires only unclaimed rows past their window, and only service_role may run it (AC-23)', async () => {
    const db = service();
    const stale = await upload(draft());
    const fresh = await upload(draft());
    const filedId = await upload(draft());
    expect((await file({ ids: [filedId] })).error).toBeNull();
    must(await db.from('bug_evidence_attachments').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', stale).select('id'), 'expire');
    expect((await qa.rpc(EXPIRE_RPC, { p_limit: 500 })).error).not.toBeNull();
    const swept = await db.rpc(EXPIRE_RPC, { p_limit: 500 });
    expect(swept.error).toBeNull();
    expect((swept.data as number) >= 1).toBe(true);
    expect((await db.from('bug_evidence_attachments').select('id').eq('id', stale)).data).toEqual([]);
    expect((await row(fresh)).id).toBe(fresh);
    expect((await row(filedId)).bug_id).not.toBeNull();
  });

  // ------------------------------------------------------------- isolation
  it('evidence is unreadable outside the Workspace and while it is soft-deleted, readable after restore (AC-06, AC-21)', async () => {
    const f = need();
    const db = service();
    const id = await upload(draft());
    const bugId = ((await file({ ids: [id] })).data as { id: string }).id;
    // A claimed row of a Workspace the identity does not belong to is invisible to it, even by id.
    const foreignBug = must(await db.from('bugs').insert({ workspace_id: f.foreignWorkspaceId, project_id: f.foreignProjectId, module_id: f.foreignModuleId, title: `${PREFIX} foreign bug`, severity: 'P3' }).select('id').single(), 'foreign bug');
    const foreignAttachment = must(await db.from('bug_evidence_attachments').insert({
      workspace_id: f.foreignWorkspaceId,
      project_id: f.foreignProjectId,
      draft_id: draft(),
      bug_id: foreignBug.id,
      position: 0,
      storage_path: `${f.foreignWorkspaceId}/bug/${f.foreignProjectId}/${crypto.randomUUID()}`,
      original_filename: 'evidence.png',
      content_type: 'image/png',
      byte_size: 1,
      status: 'committed',
      committed_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    }).select('id').single(), 'foreign attachment');
    expect((await qa.from('bug_evidence_attachments').select('id').eq('id', foreignAttachment.id)).data).toEqual([]);
    must(await db.from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', f.workspaceId).select('id'), 'soft delete');
    try {
      expect((await qa.from('bug_evidence_attachments').select('id').eq('bug_id', bugId)).data).toEqual([]);
    }
    finally {
      must(await db.from('workspaces').update({ deleted_at: null }).eq('id', f.workspaceId).select('id'), 'restore');
    }
    expect((await qa.from('bug_evidence_attachments').select('id').eq('bug_id', bugId)).data).toHaveLength(1);
  });

  it('a links-only filing behaves exactly as before 0131 (AC-08, AC-10)', async () => {
    const links = await file({ links: ['https://example.com/video.mp4'] });
    expect(links.error).toBeNull();
    expect((links.data as { evidence_attachments: unknown[] }).evidence_attachments).toEqual([]);
    const none = await file();
    expect((none.data as { evidence_urls: string[] }).evidence_urls).toEqual([]);
  });
});
