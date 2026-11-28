import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';

// Throwaway user and workspace only: everything is deleted and recounted in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);
if (!hasEnv) {
  console.warn('[bug-transition-concurrency] SKIPPED ENTIRELY: needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
setDefaultTimeout(60_000);

const RPC = 'bunkai_transition_bug_status';
const PREFIX = `bk2709-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Bk2709-${crypto.randomUUID()}`;
const PAIRS = 30;
const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];
const seededBugIds: string[] = [];

interface Fixture { userId: string, workspaceId: string, projectId: string, moduleId: string, callers: [SupabaseClient, SupabaseClient] }
let fixture: Fixture | null = null;

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function need(): Fixture {
  if (!fixture) {
    throw new Error('[bug-transition-concurrency] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[bug-transition-concurrency] seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) { throw error; }
  return client;
}

async function seedBugs(count: number): Promise<string[]> {
  const rows = must(await service().from('bugs').insert(Array.from({ length: count }, (_, i) => ({
    workspace_id: need().workspaceId,
    project_id: need().projectId,
    module_id: need().moduleId,
    title: `${PREFIX} bug ${i}`,
    severity: 'P3',
    steps_to_reproduce: '1. open',
    evidence_urls: [],
    created_by: need().userId,
  }))).select('id'), 'bugs');
  const ids = rows.map((r: { id: string }) => r.id);
  seededBugIds.push(...ids);
  return ids;
}

async function statusEvents(bugIds: string[]): Promise<Map<string, number>> {
  const rows = must(await service().from('activity_log').select('entity_id').eq('entity_type', 'bug').eq('action', 'bug.status_changed').in('entity_id', bugIds), 'events') as Array<{ entity_id: string }>;
  const counts = new Map(bugIds.map(id => [id, 0]));
  for (const r of rows) { counts.set(r.entity_id, (counts.get(r.entity_id) ?? 0) + 1); }
  return counts;
}

describeOrSkip('BK-2709: two concurrent transitions of one Bug (database)', () => {
  beforeAll(async () => {
    const db = service();
    const email = `${PREFIX}-member@bunkai.test`;
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) { throw error ?? new Error('Failed to create a BK-2709 test user.'); }
    createdUserIds.push(data.user.id);
    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-ws`, name: `${PREFIX} ws`, owner_user_id: data.user.id, plan: 'cloud' }).select('id').single(), 'workspace');
    createdWorkspaceIds.push(ws.id as string);
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: data.user.id, role: 'owner', status: 'active' }).select('user_id'), 'membership');
    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} p` }).select('id').single(), 'project');
    const mod = must(await db.from('modules').insert({ project_id: project.id, path: `${PREFIX}-m`, name: `${PREFIX} m` }).select('id').single(), 'module');
    fixture = {
      userId: data.user.id,
      workspaceId: ws.id as string,
      projectId: project.id as string,
      moduleId: mod.id as string,
      callers: [await signedIn(email), await signedIn(email)],
    };
  }, 120_000);

  afterAll(async () => {
    const db = service();
    for (const id of createdWorkspaceIds) {
      await db.from('workspaces').delete().eq('id', id);
    }
    const failedUsers: string[] = [];
    for (const id of createdUserIds) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) { failedUsers.push(id); }
    }
    const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    const { count: bugsLeft } = await db.from('bugs').select('id', { count: 'exact', head: true }).like('title', `${PREFIX}%`);
    const { count: eventsLeft } = seededBugIds.length === 0
      ? { count: 0 }
      : await db.from('activity_log').select('id', { count: 'exact', head: true }).eq('entity_type', 'bug').in('entity_id', seededBugIds);
    console.log(`[bug-transition-concurrency] cleanup: ${workspacesLeft} workspaces, ${bugsLeft} Bugs, ${eventsLeft} events, ${failedUsers.length} users left`);
    if (workspacesLeft !== 0 || bugsLeft !== 0 || eventsLeft !== 0 || failedUsers.length > 0) {
      throw new Error(`[bug-transition-concurrency] cleanup left ${workspacesLeft} workspaces, ${bugsLeft} Bugs, ${eventsLeft} events and ${failedUsers.length} users behind.`);
    }
  }, 120_000);

  it('records one change and one Activity entry, and the second caller gets the backward refusal', async () => {
    const bugIds = await seedBugs(PAIRS);
    const [a, b] = need().callers;
    const outcomes: Array<{ bugId: string, codes: string[] }> = [];
    for (const bugId of bugIds) {
      const results = await Promise.all([
        a.rpc(RPC, { p_bug_id: bugId, p_new_status: 'in_progress' }),
        b.rpc(RPC, { p_bug_id: bugId, p_new_status: 'in_progress' }),
      ]);
      outcomes.push({ bugId, codes: results.map(r => r.error?.code ?? 'ok').sort() });
    }
    const events = await statusEvents(bugIds);
    const doubled = outcomes.filter(o => o.codes.join(',') === 'ok,ok').length;
    const doubleLogged = [...events.values()].filter(n => n > 1).length;
    console.log(`[bug-transition-concurrency] ${PAIRS} pairs: ${doubled} with two successes, ${doubleLogged} with two Activity entries`);
    expect(outcomes.map(o => o.codes)).toEqual(bugIds.map(() => ['45311', 'ok']));
    expect([...events.values()]).toEqual(bugIds.map(() => 1));
    const rows = must(await service().from('bugs').select('status').in('id', bugIds), 'status read') as Array<{ status: string }>;
    expect(rows.map(r => r.status)).toEqual(bugIds.map(() => 'in_progress'));
  }, 120_000);
});
