import type { Database } from '@lib/types/supabase';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-443 — database proof for the saved-views table (`user_view_state`, reshaped
// by migration 0093). Everything the story promises about privacy, uniqueness
// and the cap is enforced IN THE DATABASE, and this suite attacks it there:
// a mocked client would prove nothing about a policy or a trigger.
//
// There is no SECURITY DEFINER function and no identity parameter, so the
// "spoof" this suite attempts is a foreign `user_id` on a direct table write
// and a read, update or delete of another member's row. It signs in through the
// app's own password path as the automation identity declared in
// `.agents/project.yaml` (`testing.automation_identity`: QA_E2E_USER_*), never a
// minted token. The service role is used for fixture seed, verification reads
// and teardown only.
//
// FAIL-CLOSED. The suite skips in exactly two cases, both decided once at module
// level with a loud warning (a silent skip would read as green):
//   1. a required env var is missing;
//   2. migration 0093 is not applied (the `name_key` column is absent).
// Every other precondition failure (cannot sign in, no second member, a fixture
// insert refused) THROWS. A skipped run proves nothing: the compliance matrix
// must not mark the rows below `covered` unless this file actually ran green.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const identityEmail = process.env.QA_E2E_USER_EMAIL;
const identityPassword = process.env.QA_E2E_USER_PASSWORD;

const REQUIRED_ENV: Array<[string, string | undefined]> = [
  ['NEXT_PUBLIC_SUPABASE_URL', url],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ['QA_E2E_USER_EMAIL', identityEmail],
  ['QA_E2E_USER_PASSWORD', identityPassword],
];

type Db = ReturnType<typeof createClient<Database>>;

function serviceClient(): Db {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
}

const missingEnv = REQUIRED_ENV.filter(([, v]) => !v).map(([k]) => k);

// Module-level probe: is migration 0093 applied? `name_key` only exists after it.
// 42703 (undefined_column) is the one error that means "absent"; anything else
// is a real failure and throws at load, which fails the file.
let migrationApplied = false;
if (missingEnv.length === 0) {
  const { error } = await serviceClient().from('user_view_state').select('name_key').limit(1);
  if (!error) {
    migrationApplied = true;
  }
  else if (error.code !== '42703') {
    throw new Error(`BK-443 saved-views suite: unexpected probe error ${error.code}: ${error.message}`);
  }
}

const runnable = missingEnv.length === 0 && migrationApplied;
if (!runnable) {
  const why = missingEnv.length > 0
    ? `missing env: ${missingEnv.join(', ')}`
    : 'migration 0093 is not applied (user_view_state.name_key is absent)';
  console.warn(`\n[BK-443] saved-views DB suite SKIPPED — ${why}. Nothing below was executed; do not report it as covered.\n`);
}

const describeOrSkip = runnable ? describe : describe.skip;

const PREFIX = `bk443-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STATE = { severity: 'P1' };

interface Fixture {
  me: string // the signed-in automation identity
  other: string // a second real member, used only as the owner of seeded rows
  wsOwn: string
  wsForeign: string
  projectA: string // in wsOwn, `me` is an active member
  projectB: string // in wsOwn, second project (same-name-other-project case)
  projectForeign: string // in wsForeign, `me` is NOT a member
}

let service: Db;
let mine: Db; // signed in as `me`, RLS applies
let fx: Fixture;
const createdWorkspaces: string[] = [];

async function must<T>(label: string, p: PromiseLike<{ data: T, error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error || data === null || data === undefined) {
    throw new Error(`BK-443 fixture: ${label} failed: ${error?.message ?? 'no data'}`);
  }
  return data;
}

async function seedWorkspace(owner: string, tag: string, memberUserIds: string[]): Promise<string> {
  const ws = await must('workspace insert', service.from('workspaces')
    .insert({ name: `${PREFIX}-${tag}`, slug: `${PREFIX}-${tag}`, owner_user_id: owner })
    .select('id')
    .single());
  createdWorkspaces.push(ws.id);
  for (const userId of memberUserIds) {
    // A trigger may already have enrolled the owner: ignore a duplicate.
    const { error } = await service.from('workspace_members')
      .upsert({ workspace_id: ws.id, user_id: userId, role: 'owner', status: 'active' }, { onConflict: 'workspace_id,user_id' });
    if (error) { throw new Error(`BK-443 fixture: member upsert failed: ${error.message}`); }
  }
  return ws.id;
}

async function seedProject(workspaceId: string, tag: string): Promise<string> {
  const p = await must('project insert', service.from('projects')
    .insert({ workspace_id: workspaceId, name: `${PREFIX}-${tag}`, slug: `${PREFIX}-${tag}` })
    .select('id')
    .single());
  return p.id;
}

let seq = 0;
function viewName(label: string): string {
  seq += 1;
  return `${label}-${seq}`;
}

// Insert as the signed-in identity (RLS applies). `user_id` is omitted so the
// column default `auth.uid()` is exercised.
function insertMine(row: { project_id: string, view_kind?: string, name: string, state?: Database['public']['Tables']['user_view_state']['Insert']['state'] }) {
  return mine.from('user_view_state')
    .insert({ view_kind: 'bugs', state: STATE, ...row })
    .select('id, user_id, name, name_key, view_kind, project_id, state')
    .single();
}

// Seed a row for any owner with the service role (bypasses RLS on purpose).
async function seedRowFor(userId: string, projectId: string, name: string): Promise<string> {
  const row = await must('seed view', service.from('user_view_state')
    .insert({ user_id: userId, project_id: projectId, view_kind: 'bugs', name, state: STATE })
    .select('id')
    .single());
  return row.id;
}

describeOrSkip('BK-443 — saved views enforced by the database', () => {
  beforeAll(async () => {
    service = serviceClient();

    mine = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error: signInError } = await mine.auth.signInWithPassword({
      email: identityEmail!,
      password: identityPassword!,
    });
    if (signInError || !session.user) {
      throw new Error(`BK-443 suite: automation identity could not sign in: ${signInError?.message ?? 'no user'}`);
    }
    const me = session.user.id;

    // A second REAL user id (a foreign key target) from membership data. It
    // never signs in; it only owns rows the identity must not reach.
    const others = await must('second member lookup', service.from('workspace_members')
      .select('user_id')
      .neq('user_id', me)
      .limit(1));
    if (others.length === 0) {
      throw new Error('BK-443 suite: no second user exists in workspace_members to own foreign rows. Provision one; this is a precondition, not a skip.');
    }
    const other = others[0].user_id;

    const wsOwn = await seedWorkspace(me, 'own', [me]);
    const wsForeign = await seedWorkspace(other, 'foreign', [other]);
    fx = {
      me,
      other,
      wsOwn,
      wsForeign,
      projectA: await seedProject(wsOwn, 'a'),
      projectB: await seedProject(wsOwn, 'b'),
      projectForeign: await seedProject(wsForeign, 'f'),
    };
  });

  afterAll(async () => {
    if (!service) { return; }
    const failures: string[] = [];
    // Projects cascade to their saved views; workspaces cascade to projects and
    // memberships. Delete explicitly and verify, so a leak throws.
    for (const wsId of createdWorkspaces) {
      const { error } = await service.from('workspaces').delete().eq('id', wsId);
      if (error) { failures.push(`workspace ${wsId}: ${error.message}`); }
    }
    if (createdWorkspaces.length > 0) {
      const { data } = await service.from('workspaces').select('id').in('id', createdWorkspaces);
      if ((data ?? []).length > 0) { failures.push(`workspaces still present: ${data!.map(d => d.id).join(',')}`); }
    }
    await mine?.auth.signOut();
    if (failures.length > 0) {
      throw new Error(`BK-443 suite teardown left fixtures behind (prefix ${PREFIX}): ${failures.join('; ')}`);
    }
  });

  it('saves a named view for the signed-in member, defaulting user_id to auth.uid()', async () => {
    expect.hasAssertions();
    const { data, error } = await insertMine({ project_id: fx.projectA, name: viewName('Critical bugs') });
    expect(error).toBeNull();
    expect(data!.user_id).toBe(fx.me);
    expect(data!.state).toEqual(STATE);
    expect(data!.name_key).toBe(data!.name.toLowerCase());
  });

  it('survives a fresh session: a second sign-in lists the saved view', async () => {
    expect.hasAssertions();
    const name = viewName('Persisted');
    const { error } = await insertMine({ project_id: fx.projectA, view_kind: 'traceability', name, state: { result: 'fail' } });
    expect(error).toBeNull();
    const second = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await second.auth.signInWithPassword({ email: identityEmail!, password: identityPassword! });
    expect(signInError).toBeNull();
    const { data } = await second.from('user_view_state').select('name').eq('project_id', fx.projectA).eq('view_kind', 'traceability');
    expect((data ?? []).map(r => r.name)).toContain(name);
    await second.auth.signOut();
  });

  it('lists only the caller\'s own views, never another member\'s on the same project', async () => {
    expect.hasAssertions();
    const foreignId = await seedRowFor(fx.other, fx.projectA, viewName('Theirs'));
    const { data, error } = await mine.from('user_view_state').select('id, user_id').eq('project_id', fx.projectA);
    expect(error).toBeNull();
    expect((data ?? []).every(r => r.user_id === fx.me)).toBe(true);
    expect((data ?? []).map(r => r.id)).not.toContain(foreignId);
  });

  it('refuses a duplicate name on the same surface (23505)', async () => {
    expect.hasAssertions();
    const name = viewName('Failing payments');
    expect((await insertMine({ project_id: fx.projectA, name })).error).toBeNull();
    const dup = await insertMine({ project_id: fx.projectA, name });
    expect(dup.error?.code).toBe('23505');
  });

  it('refuses a name that differs only by case (23505)', async () => {
    expect.hasAssertions();
    const name = viewName('Case Sensitive');
    expect((await insertMine({ project_id: fx.projectA, name })).error).toBeNull();
    expect((await insertMine({ project_id: fx.projectA, name: name.toUpperCase() })).error?.code).toBe('23505');
  });

  it('refuses a name with leading or trailing whitespace instead of storing it (23514)', async () => {
    expect.hasAssertions();
    const padded = await insertMine({ project_id: fx.projectA, name: ` ${viewName('Padded')} ` });
    expect(padded.error?.code).toBe('23514');
  });

  it('allows the same name on another surface and in another project', async () => {
    expect.hasAssertions();
    const name = viewName('Shared name');
    expect((await insertMine({ project_id: fx.projectA, view_kind: 'bugs', name })).error).toBeNull();
    expect((await insertMine({ project_id: fx.projectA, view_kind: 'run_history', name, state: { outcome: 'failed' } })).error).toBeNull();
    expect((await insertMine({ project_id: fx.projectB, view_kind: 'bugs', name })).error).toBeNull();
  });

  it('counts name length in code points: 80 emoji pass, 81 fail', async () => {
    expect.hasAssertions();
    expect((await insertMine({ project_id: fx.projectB, view_kind: 'workbench', name: '😀'.repeat(80), state: { tag: 'x' } })).error).toBeNull();
    expect((await insertMine({ project_id: fx.projectB, view_kind: 'workbench', name: '😁'.repeat(81), state: { tag: 'x' } })).error?.code).toBe('23514');
  });

  it('refuses control characters in a name (23514)', async () => {
    expect.hasAssertions();
    expect((await insertMine({ project_id: fx.projectA, name: `${viewName('Tab')}\tx` })).error?.code).toBe('23514');
  });

  it('refuses an unknown surface, an empty state, a non-object state and an oversized state (23514)', async () => {
    expect.hasAssertions();
    expect((await insertMine({ project_id: fx.projectA, view_kind: 'dashboard', name: viewName('Kind') })).error?.code).toBe('23514');
    expect((await insertMine({ project_id: fx.projectA, name: viewName('Empty'), state: {} })).error?.code).toBe('23514');
    expect((await insertMine({ project_id: fx.projectA, name: viewName('Array'), state: [] })).error?.code).toBe('23514');
    expect((await insertMine({ project_id: fx.projectA, name: viewName('Big'), state: { tag: 'x'.repeat(4100) } })).error?.code).toBe('23514');
  });

  it('caps a surface at 25 views per member and project (45100 on the 26th)', async () => {
    expect.hasAssertions();
    for (let i = 0; i < 25; i += 1) {
      const r = await insertMine({ project_id: fx.projectB, view_kind: 'traceability', name: `cap-${i}`, state: { result: 'pass' } });
      expect(r.error).toBeNull();
    }
    const over = await insertMine({ project_id: fx.projectB, view_kind: 'traceability', name: 'cap-26', state: { result: 'pass' } });
    expect(over.error?.code).toBe('45100');
    // Rename and update stay possible at the cap.
    const { error } = await mine.from('user_view_state').update({ state: { result: 'fail' } }).eq('project_id', fx.projectB).eq('view_kind', 'traceability').eq('name', 'cap-0');
    expect(error).toBeNull();
  });

  it('holds the cap under 30 parallel inserts: exactly 25 succeed, 5 are refused', async () => {
    expect.hasAssertions();
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      insertMine({ project_id: fx.projectB, view_kind: 'run_history', name: `par-${i}`, state: { outcome: 'passed' } })));
    expect(results.filter(r => r.error === null)).toHaveLength(25);
    expect(results.filter(r => r.error?.code === '45100')).toHaveLength(5);
  });

  it('creates exactly one view from rapid parallel saves of the same name', async () => {
    expect.hasAssertions();
    const name = viewName('Double submit');
    const results = await Promise.all(Array.from({ length: 5 }, () => insertMine({ project_id: fx.projectA, name })));
    expect(results.filter(r => r.error === null)).toHaveLength(1);
    expect(results.filter(r => r.error?.code === '23505')).toHaveLength(4);
    const { data } = await service.from('user_view_state').select('id').eq('user_id', fx.me).eq('project_id', fx.projectA).eq('name', name);
    expect(data).toHaveLength(1);
  });

  it('refuses a write that names another member as the owner (42501)', async () => {
    expect.hasAssertions();
    const { error } = await mine.from('user_view_state')
      .insert({ user_id: fx.other, project_id: fx.projectA, view_kind: 'bugs', name: viewName('Spoof'), state: STATE });
    expect(error?.code).toBe('42501');
  });

  it('hides another member\'s view by id and leaves it untouched on update and delete', async () => {
    expect.hasAssertions();
    const foreignId = await seedRowFor(fx.other, fx.projectA, viewName('Theirs by id'));
    const read = await mine.from('user_view_state').select('id').eq('id', foreignId);
    expect(read.data).toEqual([]);
    const upd = await mine.from('user_view_state').update({ name: 'hijacked' }).eq('id', foreignId).select('id');
    expect(upd.data).toEqual([]);
    const del = await mine.from('user_view_state').delete().eq('id', foreignId).select('id');
    expect(del.data).toEqual([]);
    const still = await service.from('user_view_state').select('name').eq('id', foreignId).single();
    expect(still.data?.name).not.toBe('hijacked');
  });

  it('hides a view whose project is in a workspace the owner no longer belongs to, even from its owner', async () => {
    expect.hasAssertions();
    const id = await seedRowFor(fx.me, fx.projectForeign, viewName('Leftover'));
    const read = await mine.from('user_view_state').select('id').eq('id', id);
    expect(read.data).toEqual([]);
    const upd = await mine.from('user_view_state').update({ name: 'revived' }).eq('id', id).select('id');
    expect(upd.data).toEqual([]);
    const del = await mine.from('user_view_state').delete().eq('id', id).select('id');
    expect(del.data).toEqual([]);
    const still = await service.from('user_view_state').select('id').eq('id', id);
    expect(still.data).toHaveLength(1);
  });

  it('refuses to save a view into a project of a workspace the caller is not in (42501)', async () => {
    expect.hasAssertions();
    const { error } = await insertMine({ project_id: fx.projectForeign, name: viewName('Outsider') });
    expect(error?.code).toBe('42501');
  });

  it('never lets a view move to another project, surface or owner (45101)', async () => {
    expect.hasAssertions();
    const created = await insertMine({ project_id: fx.projectA, name: viewName('Fixed place') });
    const id = created.data!.id;
    const moveProject = await mine.from('user_view_state').update({ project_id: fx.projectB }).eq('id', id);
    expect(moveProject.error?.code).toBe('45101');
    const moveKind = await mine.from('user_view_state').update({ view_kind: 'workbench' }).eq('id', id);
    expect(moveKind.error?.code).toBe('45101');
    const moveOwner = await mine.from('user_view_state').update({ user_id: fx.other }).eq('id', id);
    // The policy WITH CHECK or the trigger refuses it; either way it must not succeed.
    expect(['42501', '45101']).toContain(moveOwner.error?.code ?? '');
  });

  it('renames to its own name or only its case, refuses another view\'s name, and keeps the filters', async () => {
    expect.hasAssertions();
    const a = viewName('Rename a');
    const b = viewName('Rename b');
    const created = await insertMine({ project_id: fx.projectA, name: a, state: { severity: 'P2' } });
    expect((await insertMine({ project_id: fx.projectA, name: b })).error).toBeNull();
    const id = created.data!.id;
    expect((await mine.from('user_view_state').update({ name: a }).eq('id', id)).error).toBeNull();
    expect((await mine.from('user_view_state').update({ name: a.toUpperCase() }).eq('id', id)).error).toBeNull();
    expect((await mine.from('user_view_state').update({ name: b }).eq('id', id)).error?.code).toBe('23505');
    const row = await service.from('user_view_state').select('name, state').eq('id', id).single();
    expect(row.data?.name).toBe(a.toUpperCase());
    expect(row.data?.state).toEqual({ severity: 'P2' });
  });

  it('replaces the whole state on update and bumps updated_at (last write wins, never a mix)', async () => {
    expect.hasAssertions();
    const created = await insertMine({ project_id: fx.projectA, name: viewName('Two tabs'), state: { severity: 'P1', status: 'open' } });
    const id = created.data!.id;
    const before = await service.from('user_view_state').select('updated_at').eq('id', id).single();
    await Promise.all([
      mine.from('user_view_state').update({ state: { severity: 'P3' } }).eq('id', id),
      mine.from('user_view_state').update({ state: { status: 'closed' } }).eq('id', id),
    ]);
    const after = await service.from('user_view_state').select('state, updated_at').eq('id', id).single();
    expect([{ severity: 'P3' }, { status: 'closed' }] as unknown[]).toContainEqual(after.data!.state);
    expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.data!.updated_at).getTime());
  });

  it('deletes only the targeted view', async () => {
    expect.hasAssertions();
    const keep = await insertMine({ project_id: fx.projectA, name: viewName('Keep') });
    const drop = await insertMine({ project_id: fx.projectA, name: viewName('Drop') });
    const del = await mine.from('user_view_state').delete().eq('id', drop.data!.id).select('id');
    expect(del.data).toHaveLength(1);
    const left = await mine.from('user_view_state').select('id').eq('id', keep.data!.id);
    expect(left.data).toHaveLength(1);
  });
});
