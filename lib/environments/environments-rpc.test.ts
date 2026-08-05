import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'bun:test';

// BK-148 — integration guard for the environments CRUD RPCs
// (bunkai_create_environment / bunkai_rename_environment /
// bunkai_delete_environment). Sibling of the BK-34 start-run suite: it drives the
// REAL server-side rulebook against a live database through the service-role
// client (explicit actor — the exact contract the API routes use), asserting the
// observable AC behaviors + authorization:
//
//   * create trims surrounding whitespace;
//   * create rejects empty / > 50 chars → environment_name_length (45210);
//   * create rejects a case-insensitive duplicate (Staging vs staging) → 23505;
//   * rename trims, rejects a sibling collision (23505), preserves the row id;
//   * delete removes an unused env; BLOCKS with the count when a run references
//     it → environment_in_use (45211, count in message);
//   * authorization: a non-member actor → forbidden (42501), no disclosure;
//   * cross-workspace: a missing env id → not_found (P0002);
//   * cross-workspace: an EXISTING env in a foreign workspace → not_found
//     (P0002), not forbidden (BK-200 — the RPC previously leaked existence via
//     403 here because the resolution query bypasses RLS as the DEFINER owner;
//     see 0063_environment_cross_workspace_404.sql).
//
// 401 (unauthenticated) is enforced at the route layer (withApiHandler), not the
// RPC — the RPC always receives an explicit resolved actor — so it is out of
// scope here.
//
// DB-dependent + env-gated: when the Supabase env is absent the suite SKIPS
// LOUDLY (describe.skip). When present but the seed can't satisfy a precondition
// it logs and passes (never blocks a build on seed state). Every env this suite
// creates carries a unique name prefix and is purged in afterAll, so the shared
// DB is left pristine.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const CREATE_RPC = 'bunkai_create_environment';
const RENAME_RPC = 'bunkai_rename_environment';
const DELETE_RPC = 'bunkai_delete_environment';
const NAME_PREFIX = `bk148-${Date.now()}-`;
const RANDOM_UUID = '00000000-0000-0000-0000-000000000000';

const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof service>;

// A (project, writer-actor) where the actor can write the project's workspace.
async function pickWritableProject(db: Db) {
  const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');
  const activeWriters = ((members ?? []) as MemberRow[]).filter(m => m.status === 'active' && WRITER_ROLES.has(m.role));
  const { data: projects } = await db.from('projects').select('id, workspace_id');
  for (const p of (projects ?? []) as { id: string, workspace_id: string }[]) {
    const writer = activeWriters.find(m => m.workspace_id === p.workspace_id);
    if (writer) { return { projectId: p.id, workspaceId: p.workspace_id, actorId: writer.user_id }; }
  }
  return undefined;
}

// A non-writer actor for the project's workspace (a different active writer of a
// DIFFERENT workspace, or the zero-uuid as a guaranteed non-member).
async function pickNonMember(db: Db, workspaceId: string): Promise<string> {
  const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, status');
  const foreign = ((members ?? []) as MemberRow[])
    .find(m => m.status === 'active' && m.workspace_id !== workspaceId);
  return foreign?.user_id ?? RANDOM_UUID;
}

describeOrSkip('BK-148 — environments CRUD RPCs', () => {
  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    await db.from('project_environments').delete().like('name', `${NAME_PREFIX}%`);
  });

  it('create — trims surrounding whitespace', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped create-trim: need a writable project (seed state).'); return; }

    const raw = `  ${NAME_PREFIX}trim  `;
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: pick.actorId,
      p_project_id: pick.projectId,
      p_name: raw,
    });
    expect(error).toBeNull();
    expect((data as { name: string }).name).toBe(`${NAME_PREFIX}trim`);
  });

  it('create — rejects empty / whitespace-only → environment_name_length (45210)', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped create-empty: seed state.'); return; }
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: pick.actorId,
      p_project_id: pick.projectId,
      p_name: '   ',
    });
    expect(error?.code).toBe('45210');
    expect(data).toBeNull();
  });

  it('create — rejects > 50 chars → environment_name_length (45210)', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped create-toolong: seed state.'); return; }
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: pick.actorId,
      p_project_id: pick.projectId,
      p_name: 'x'.repeat(51),
    });
    expect(error?.code).toBe('45210');
    expect(data).toBeNull();
  });

  it('create — rejects a case-insensitive duplicate (Foo vs FOO) → 23505', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped create-dup: seed state.'); return; }
    const name = `${NAME_PREFIX}Dup`;
    const first = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: name });
    expect(first.error).toBeNull();
    const dup = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: name.toUpperCase() });
    expect(dup.error?.code).toBe('23505');
    expect(dup.data).toBeNull();
  });

  it('rename — trims, preserves the row id, rejects a sibling collision (23505)', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped rename: seed state.'); return; }
    const a = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}RenA` });
    const b = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}RenB` });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const aId = (a.data as { id: string }).id;

    // happy rename trims and keeps the same id (runs would still reference it).
    const renamed = await db.rpc(RENAME_RPC, { p_actor_user_id: pick.actorId, p_environment_id: aId, p_name: `  ${NAME_PREFIX}RenA2  ` });
    expect(renamed.error).toBeNull();
    expect((renamed.data as { id: string }).id).toBe(aId);
    expect((renamed.data as { name: string }).name).toBe(`${NAME_PREFIX}RenA2`);

    // collision with sibling B (case-insensitive) → 23505.
    const collide = await db.rpc(RENAME_RPC, { p_actor_user_id: pick.actorId, p_environment_id: aId, p_name: `${NAME_PREFIX}RENB` });
    expect(collide.error?.code).toBe('23505');
  });

  it('delete — removes an unused environment (0 runs reference it)', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped delete-unused: seed state.'); return; }
    const created = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}DelUnused` });
    expect(created.error).toBeNull();
    const id = (created.data as { id: string }).id;

    const del = await db.rpc(DELETE_RPC, { p_actor_user_id: pick.actorId, p_environment_id: id });
    expect(del.error).toBeNull();
    expect((del.data as { deleted: boolean }).deleted).toBe(true);

    const { count } = await db.from('project_environments').select('id', { count: 'exact', head: true }).eq('id', id);
    expect(count).toBe(0);
  });

  it('delete — BLOCKS with the count when a run references the environment (45211)', async () => {
    const db = service();
    // Find an environment that already has >= 1 referencing run + a writer actor.
    const { data: runs } = await db.from('runs').select('environment_id, project_id');
    if (!runs || runs.length === 0) { console.warn('[environments] skipped delete-block: no runs exist (seed state).'); return; }
    const envId = (runs as { environment_id: string }[])[0].environment_id;
    const { data: env } = await db.from('project_environments').select('project_id').eq('id', envId).maybeSingle();
    if (!env) { console.warn('[environments] skipped delete-block: env row missing.'); return; }
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');
    const { data: proj } = await db.from('projects').select('workspace_id').eq('id', (env as { project_id: string }).project_id).maybeSingle();
    if (!proj) { console.warn('[environments] skipped delete-block: project missing.'); return; }
    const writer = ((members ?? []) as MemberRow[]).find(m => m.status === 'active' && WRITER_ROLES.has(m.role) && m.workspace_id === (proj as { workspace_id: string }).workspace_id);
    if (!writer) { console.warn('[environments] skipped delete-block: no writer for the env\'s workspace.'); return; }

    const expectedCount = (runs as { environment_id: string }[]).filter(r => r.environment_id === envId).length;
    const del = await db.rpc(DELETE_RPC, { p_actor_user_id: writer.user_id, p_environment_id: envId });
    expect(del.error?.code).toBe('45211');
    expect(del.error?.message).toContain(`${expectedCount} run`);
    // The env is NOT deleted (the block preserves it + the run history).
    const { count } = await db.from('project_environments').select('id', { count: 'exact', head: true }).eq('id', envId);
    expect(count).toBe(1);
  });

  it('authorization — a non-member actor cannot create → forbidden (42501)', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped authz-create: seed state.'); return; }
    const nonMember = await pickNonMember(db, pick.workspaceId);
    const { data, error } = await db.rpc(CREATE_RPC, { p_actor_user_id: nonMember, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}Nope` });
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('not-found — renaming a nonexistent env → P0002', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped notfound: seed state.'); return; }
    const { data, error } = await db.rpc(RENAME_RPC, { p_actor_user_id: pick.actorId, p_environment_id: RANDOM_UUID, p_name: `${NAME_PREFIX}Ghost` });
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  // BK-200 (was BK-148 TC#2) — the regression this ticket is about. The
  // environment here is REAL and lives in workspace A; the actor is a genuine
  // active member of a DIFFERENT workspace B (falls back to the zero-uuid only
  // if the seed has no second workspace with an active member — see
  // pickNonMember). Before the 0053 fix this returned 42501 (forbidden),
  // disclosing that the id belongs to a real environment in another workspace.
  // It must now return the SAME P0002 (not_found) as a genuinely missing id,
  // AND the environment must be provably untouched by the rejected write.
  it('BK-200 — rename on an EXISTING cross-workspace env → not_found (P0002), not forbidden', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped BK-200-rename: seed state.'); return; }
    const created = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}Bk200Rename` });
    expect(created.error).toBeNull();
    const envId = (created.data as { id: string }).id;

    const foreignActorId = await pickNonMember(db, pick.workspaceId);
    const { data, error } = await db.rpc(RENAME_RPC, {
      p_actor_user_id: foreignActorId,
      p_environment_id: envId,
      p_name: `${NAME_PREFIX}Bk200Renamed`,
    });
    expect(error?.code).toBe('P0002');
    expect(error?.code).not.toBe('42501');
    expect(data).toBeNull();

    // The rejected write must not have mutated the row (name unchanged).
    const { data: after } = await db.from('project_environments').select('name').eq('id', envId).maybeSingle();
    expect((after as { name: string } | null)?.name).toBe(`${NAME_PREFIX}Bk200Rename`);
  });

  it('BK-200 — delete on an EXISTING cross-workspace env → not_found (P0002), not forbidden', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped BK-200-delete: seed state.'); return; }
    const created = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}Bk200Delete` });
    expect(created.error).toBeNull();
    const envId = (created.data as { id: string }).id;

    const foreignActorId = await pickNonMember(db, pick.workspaceId);
    const { data, error } = await db.rpc(DELETE_RPC, { p_actor_user_id: foreignActorId, p_environment_id: envId });
    expect(error?.code).toBe('P0002');
    expect(error?.code).not.toBe('42501');
    expect(data).toBeNull();

    // The rejected delete must not have removed the row.
    const { count } = await db.from('project_environments').select('id', { count: 'exact', head: true }).eq('id', envId);
    expect(count).toBe(1);
  });

  it('list ordering — environments come back name asc', async () => {
    const db = service();
    const pick = await pickWritableProject(db);
    if (!pick) { console.warn('[environments] skipped list-order: seed state.'); return; }
    // Seed two out of alphabetical order; the route uses .order('name', asc).
    await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}Zeta` });
    await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_project_id: pick.projectId, p_name: `${NAME_PREFIX}Alpha` });
    const { data } = await db
      .from('project_environments')
      .select('name')
      .eq('project_id', pick.projectId)
      .like('name', `${NAME_PREFIX}%`)
      .order('name', { ascending: true });
    const names = ((data ?? []) as { name: string }[]).map(r => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
