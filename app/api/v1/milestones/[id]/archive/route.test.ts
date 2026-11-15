import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-1899 — the HTTP contract of archive and restore, end to end through the real
// handlers, a real Bearer PAT and the real RPCs on the caller's own client. The
// function rulebook is proved by lib/milestones/milestone-archive-isolation.test.ts;
// this covers what only the routes own: status codes, bodies, scopes, the list
// filter and the named refusals on edit, attach and create.
//
// The PAT is minted for the declared automation identity (`QA_E2E_USER_*`,
// `.agents/project.yaml` -> `testing.automation_identity`) and expires in one day.
// DB-dependent: skips when the Supabase env is absent or migration 0130 is not
// applied yet; any other unexpected state fails loudly.

void mock.module('server-only', () => ({}));
const { POST: ARCHIVE } = await import('./route');
const { POST: RESTORE } = await import('../restore/route');
const { PATCH } = await import('../route');
const { GET: LIST, POST: CREATE } = await import('../../../projects/[id]/milestones/route');
const { POST: ATTACH } = await import('../../../projects/[id]/milestones/[milestoneId]/plans/route');
const { mintPat } = await import('@lib/api/pat');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && anonKey && serviceKey);
const TAG = '[milestone archive routes]';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Inside the create bounds (today to five years out), so the refusal comes from the name.
function soon(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 20);
  return d.toISOString().slice(0, 10);
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let deployed = false;
if (hasEnv) {
  const probe = await service().rpc('bunkai_archive_milestone', { p_milestone_id: ZERO_UUID });
  const code = probe.error?.code ?? 'no error';
  if (code === '42501') { deployed = true; }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED: migration 0130 is not applied (${code}).`);
  }
  else {
    throw new Error(`${TAG} unexpected deploy probe answer (${code}).`);
  }
}
const describeOrSkip = hasEnv && deployed ? describe : describe.skip;
const PREFIX = `bk1899-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface ErrorBody { error?: { code?: string, details?: { reason?: string, archived_name?: string | null } } }
interface ArchiveBody { milestone: { id: string, name: string, archived_at: string | null, archived_by: string | null, changed: boolean } }

describeOrSkip('BK-1899 — POST /api/v1/milestones/{id}/archive and /restore', () => {
  const workspaceIds: string[] = [];
  const tokenIds: string[] = [];
  let seq = 0;

  beforeEach(() => {
    expect.hasAssertions();
  });

  afterAll(async () => {
    const db = service();
    const failures: string[] = [];
    const attempt = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await op;
      if (error) { failures.push(`${what}: ${error.message}`); }
    };
    for (const id of tokenIds) {
      await attempt('access_token_secrets', db.from('access_token_secrets').delete().eq('token_id', id));
      await attempt('access_tokens', db.from('access_tokens').delete().eq('id', id));
    }
    for (const id of workspaceIds) {
      await attempt('milestone_plans', db.from('milestone_plans').delete().eq('workspace_id', id));
      await attempt('milestones', db.from('milestones').delete().eq('workspace_id', id));
      await attempt('test_plans', db.from('test_plans').delete().eq('workspace_id', id));
      await attempt('workspaces', db.from('workspaces').delete().eq('id', id));
    }
    const { count, error } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (error) { failures.push(`leftover count: ${error.message}`); }
    else if ((count ?? 0) !== 0) { failures.push(`${count} workspaces with prefix ${PREFIX} survived`); }
    if (failures.length > 0) {
      throw new Error(`${TAG} teardown left fixtures behind: ${failures.join('; ')}`);
    }
  }, 60000);

  async function setup() {
    if (!qaEmail || !qaPassword) {
      throw new Error(`${TAG} QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.`);
    }
    const db = service();
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) { throw new Error(`${TAG} QA_E2E login failed (${signInError?.message ?? 'no user'}).`); }
    const userId = signIn.user.id;
    const tag = `${PREFIX}-${++seq}`;
    const { data: ws, error: wsError } = await db.from('workspaces').insert({ slug: `${tag}-ws`, name: tag, owner_user_id: userId, plan: 'cloud' }).select('id').single();
    if (wsError || !ws) { throw new Error(`seed workspace: ${wsError?.message}`); }
    workspaceIds.push(ws.id as string);
    const { error: memberError } = await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'member', status: 'active' });
    if (memberError) { throw new Error(`seed membership: ${memberError.message}`); }
    const { data: project, error: projectError } = await db.from('projects').insert({ workspace_id: ws.id, slug: `${tag}-p`, name: `${tag} project` }).select('id').single();
    if (projectError || !project) { throw new Error(`seed project: ${projectError?.message}`); }
    const name = `${tag} Release 1.0`;
    const { data: ms, error: msError } = await db.from('milestones').insert({ workspace_id: ws.id, project_id: project.id, name, target_date: '2099-01-01' }).select('id').single();
    if (msError || !ms) { throw new Error(`seed milestone: ${msError?.message}`); }
    const { data: plan, error: planError } = await db.from('test_plans').insert({ workspace_id: ws.id, project_id: project.id, name: `${tag} plan`, status: 'open' }).select('id').single();
    if (planError || !plan) { throw new Error(`seed plan: ${planError?.message}`); }
    const write = await mintPat({ admin: db, userId, name: 'bk1899-route-write', scopes: ['atc:read', 'atc:write'], expiresInDays: 1 });
    const read = await mintPat({ admin: db, userId, name: 'bk1899-route-read', scopes: ['atc:read'], expiresInDays: 1 });
    tokenIds.push(write.id, read.id);
    return { db, projectId: project.id as string, milestoneId: ms.id as string, planId: plan.id as string, name, write: write.token, read: read.token };
  }

  function call(method: string, path: string, token: string, body?: unknown): NextRequest {
    return new NextRequest(`https://app.test/api/v1/${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('archives with 200 and changed true, then answers a repeat with changed false; restore mirrors it', async () => {
    const f = await setup();
    const first = await ARCHIVE(call('POST', `milestones/${f.milestoneId}/archive`, f.write));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as ArchiveBody;
    expect(firstBody.milestone.changed).toBe(true);
    expect(firstBody.milestone.name).toBe(f.name);
    expect(firstBody.milestone.archived_at).not.toBeNull();

    const repeat = await ARCHIVE(call('POST', `milestones/${f.milestoneId}/archive`, f.write));
    expect(repeat.status).toBe(200);
    expect(((await repeat.json()) as ArchiveBody).milestone.changed).toBe(false);

    const restored = await RESTORE(call('POST', `milestones/${f.milestoneId}/restore`, f.write));
    expect(restored.status).toBe(200);
    const restoredBody = await restored.json() as ArchiveBody;
    expect(restoredBody.milestone.changed).toBe(true);
    expect(restoredBody.milestone.archived_at).toBeNull();

    const again = await RESTORE(call('POST', `milestones/${f.milestoneId}/restore`, f.write));
    expect(((await again.json()) as ArchiveBody).milestone.changed).toBe(false);
  });

  it('refuses a read-only token (403), a malformed id (400) and an unknown id (404)', async () => {
    const f = await setup();
    expect((await ARCHIVE(call('POST', `milestones/${f.milestoneId}/archive`, f.read))).status).toBe(403);
    expect((await RESTORE(call('POST', `milestones/${f.milestoneId}/restore`, f.read))).status).toBe(403);
    expect((await ARCHIVE(call('POST', 'milestones/not-a-uuid/archive', f.write))).status).toBe(400);
    expect((await ARCHIVE(call('POST', `milestones/${ZERO_UUID}/archive`, f.write))).status).toBe(404);
    const { data } = await f.db.from('milestones').select('archived_at').eq('id', f.milestoneId).single();
    expect(data?.archived_at).toBeNull();
  });

  it('lists archived Milestones only with include_archived=true, carrying archived_at', async () => {
    const f = await setup();
    await ARCHIVE(call('POST', `milestones/${f.milestoneId}/archive`, f.write));

    const byDefault = await LIST(call('GET', `projects/${f.projectId}/milestones`, f.read));
    expect(byDefault.status).toBe(200);
    expect(((await byDefault.json()) as { milestones: Array<{ id: string }> }).milestones).toEqual([]);

    const withArchived = await LIST(call('GET', `projects/${f.projectId}/milestones?include_archived=true`, f.read));
    const rows = ((await withArchived.json()) as { milestones: Array<{ id: string, archived_at: string | null }> }).milestones;
    expect(rows.map(r => r.id)).toEqual([f.milestoneId]);
    expect(rows[0].archived_at).not.toBeNull();
  });

  it('answers 409 milestone_archived to an edit and an attach on an archived Milestone', async () => {
    const f = await setup();
    await ARCHIVE(call('POST', `milestones/${f.milestoneId}/archive`, f.write));

    const edit = await PATCH(call('PATCH', `milestones/${f.milestoneId}`, f.write, { name: 'Renamed', target_date: '2099-01-01', description: '' }));
    expect(edit.status).toBe(409);
    expect(((await edit.json()) as ErrorBody).error?.details?.reason).toBe('milestone_archived');

    const attach = new NextRequest(`https://app.test/api/v1/projects/${f.projectId}/milestones/${f.milestoneId}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${f.write}`, 'Idempotency-Key': `bk1899-${Date.now()}` },
      body: JSON.stringify({ test_plan_ids: [f.planId] }),
    });
    const attached = await ATTACH(attach);
    expect(attached.status).toBe(409);
    expect(((await attached.json()) as ErrorBody).error?.details?.reason).toBe('milestone_archived');
  });

  it('refuses a new Milestone named like an archived one with 409 milestone_name_archived naming it', async () => {
    const f = await setup();
    await ARCHIVE(call('POST', `milestones/${f.milestoneId}/archive`, f.write));
    const created = await CREATE(call('POST', `projects/${f.projectId}/milestones`, f.write, { name: f.name.toLowerCase(), target_date: soon() }));
    expect(created.status).toBe(409);
    const body = await created.json() as ErrorBody;
    expect(body.error?.details?.reason).toBe('milestone_name_archived');
    expect(body.error?.details?.archived_name).toBe(f.name);
  });
});
