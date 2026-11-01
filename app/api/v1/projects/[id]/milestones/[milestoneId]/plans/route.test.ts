import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-206 — wiring of POST .../milestones/{milestoneId}/plans and
// DELETE .../plans/{testPlanId} above the RPC boundary: the project/milestone path
// check, Idempotency-Key, the SQLSTATE -> HTTP mapping and the 204 contract. The
// RPC rulebook itself is proved by lib/milestones/milestone-plans-isolation.test.ts.
// Real exported handlers, a real Bearer PAT (`mintPat`), real RPCs through the
// caller's own RLS-scoped client: no mocked stand-in.
//
// DB-dependent: skips when the Supabase env is absent or migration 0112 is not
// applied yet (the readiness function answers "does not exist"); any other
// unexpected state fails loudly.

void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { DELETE } = await import('./[testPlanId]/route');
const { mintPat } = await import('@lib/api/pat');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Db = ReturnType<typeof service>;

let deployed = false;
if (hasEnv) {
  const probe = await service().rpc('bunkai_milestones_readiness', { p_milestone_ids: [] });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') { deployed = true; }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[milestone plans route] SKIPPED: migration 0112 is not applied (${code}).`);
  }
  else {
    throw new Error(`[milestone plans route] unexpected deploy probe answer (${code}).`);
  }
}
const describeOrSkip = hasEnv && deployed ? describe : describe.skip;
const PREFIX = `bk206-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Fixture {
  workspaceId: string
  actorUserId: string
  projectId: string
  otherProjectId: string
  milestoneId: string
  planA: string
  planB: string
  otherProjectPlan: string
}
interface ErrorBody { error?: { code?: string, details?: { reason?: string } } }

let fixtureCount = 0;

async function buildFixture(db: Db): Promise<Fixture> {
  const { data: member } = await db.from('workspace_members').select('user_id').eq('status', 'active').limit(1).maybeSingle();
  const actorUserId = member?.user_id as string | undefined;
  if (!actorUserId) { throw new Error('[milestone plans route] need at least one active workspace member (seed state).'); }
  fixtureCount += 1;
  const tag = `${PREFIX}-${fixtureCount}`;

  const { data: ws, error: wsError } = await db.from('workspaces').insert({ slug: `${tag}-ws`, name: tag, owner_user_id: actorUserId, plan: 'cloud' }).select('id').single();
  if (wsError || !ws) { throw new Error(`seed workspace: ${wsError?.message}`); }
  const workspaceId = ws.id as string;
  const { error: memberError } = await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: actorUserId, role: 'member', status: 'active' });
  if (memberError) { throw new Error(`seed membership: ${memberError.message}`); }

  const { data: projects, error: projectsError } = await db.from('projects').insert([
    { workspace_id: workspaceId, slug: `${tag}-p`, name: `${tag} project` },
    { workspace_id: workspaceId, slug: `${tag}-q`, name: `${tag} other` },
  ]).select('id, slug');
  if (projectsError || !projects) { throw new Error(`seed projects: ${projectsError?.message}`); }
  const projectId = projects.find(p => (p.slug as string).endsWith('-p'))!.id as string;
  const otherProjectId = projects.find(p => (p.slug as string).endsWith('-q'))!.id as string;

  const { data: milestone, error: msError } = await db.from('milestones').insert({ workspace_id: workspaceId, project_id: projectId, name: `${tag} milestone`, target_date: '2099-01-01' }).select('id').single();
  if (msError || !milestone) { throw new Error(`seed milestone: ${msError?.message}`); }

  const { data: plans, error: plansError } = await db.from('test_plans').insert([
    { workspace_id: workspaceId, project_id: projectId, name: `${tag} plan a`, status: 'open' },
    { workspace_id: workspaceId, project_id: projectId, name: `${tag} plan b`, status: 'open' },
    { workspace_id: workspaceId, project_id: otherProjectId, name: `${tag} plan other`, status: 'open' },
  ]).select('id, name');
  if (plansError || !plans) { throw new Error(`seed plans: ${plansError?.message}`); }
  const byName = (suffix: string) => plans.find(p => (p.name as string).endsWith(suffix))!.id as string;

  return {
    workspaceId,
    actorUserId,
    projectId,
    otherProjectId,
    milestoneId: milestone.id as string,
    planA: byName('plan a'),
    planB: byName('plan b'),
    otherProjectPlan: byName('plan other'),
  };
}

function attachRequest(f: { projectId: string, milestoneId: string }, token: string, body: unknown, key?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'authorization': `Bearer ${token}` };
  if (key) { headers['Idempotency-Key'] = key; }
  return new NextRequest(`https://app.test/api/v1/projects/${f.projectId}/milestones/${f.milestoneId}/plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function detachRequest(f: { projectId: string, milestoneId: string }, planId: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${f.projectId}/milestones/${f.milestoneId}/plans/${planId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

describeOrSkip('BK-206 — attach / detach plans route wiring', () => {
  const workspaceIds: string[] = [];
  const tokenIds: string[] = [];

  afterAll(async () => {
    const db = service();
    for (const id of workspaceIds) {
      await db.from('milestone_plans').delete().eq('workspace_id', id);
      await db.from('milestones').delete().eq('workspace_id', id);
      await db.from('test_plans').delete().eq('workspace_id', id);
      await db.from('workspaces').delete().eq('id', id);
    }
    for (const id of tokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    expect(count ?? 0).toBe(0);
  });

  async function setup() {
    const db = service();
    const fixture = await buildFixture(db);
    workspaceIds.push(fixture.workspaceId);
    const pat = await mintPat({ admin: db, userId: fixture.actorUserId, name: 'bk206-route', scopes: ['atc:read', 'atc:write'], expiresInDays: null });
    tokenIds.push(pat.id);
    return { db, fixture, token: pat.token };
  }

  async function attachedIds(db: Db, milestoneId: string): Promise<string[]> {
    const { data } = await db.from('milestone_plans').select('test_plan_id').eq('milestone_id', milestoneId);
    return ((data ?? []) as Array<{ test_plan_id: string }>).map(r => r.test_plan_id).sort();
  }

  it('attaches with 201, replays the same key and body without a second write, and rejects a reused key with another body', async () => {
    const { db, fixture, token } = await setup();
    const key = `bk206-replay-${Date.now()}`;
    const first = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA, fixture.planB] }, key));
    const firstBody = await first.json();
    expect(first.status).toBe(201);
    expect(firstBody).toEqual({ milestone_id: fixture.milestoneId, attached_count: 2, plan_count: 2 });

    const replay = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA, fixture.planB] }, key));
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstBody);
    expect(await attachedIds(db, fixture.milestoneId)).toEqual([fixture.planA, fixture.planB].sort());

    const reused = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA] }, key));
    expect(reused.status).toBe(409);
  }, 30000);

  it('maps a duplicate under a new key to 409 milestone_plan_exists, and frees the key for a corrected retry', async () => {
    const { fixture, token } = await setup();
    expect((await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA] }, `bk206-a-${Date.now()}`))).status).toBe(201);
    const key = `bk206-dup-${Date.now()}`;
    const dup = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA, fixture.planB] }, key));
    const dupBody = await dup.json() as ErrorBody;
    expect(dup.status).toBe(409);
    expect(dupBody.error?.details?.reason).toBe('milestone_plan_exists');
    const retried = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planB] }, key));
    expect(retried.status).toBe(201);
  }, 30000);

  it('maps a plan of another project to 422 plan_outside_project without echoing its id', async () => {
    const { fixture, token } = await setup();
    const res = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.otherProjectPlan] }, `bk206-outside-${Date.now()}`));
    const text = await res.text();
    expect(res.status).toBe(422);
    expect((JSON.parse(text) as ErrorBody).error?.details?.reason).toBe('plan_outside_project');
    expect(text).not.toContain(fixture.otherProjectPlan);
  }, 30000);

  it('rejects a missing Idempotency-Key with 400 and an empty selection with 422', async () => {
    const { fixture, token } = await setup();
    expect((await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA] }))).status).toBe(400);
    const empty = await POST(attachRequest(fixture, token, { test_plan_ids: [] }, `bk206-empty-${Date.now()}`));
    expect(empty.status).toBe(422);
  }, 30000);

  it('answers 404 when the milestone is not in the project of the path, on attach and on detach', async () => {
    const { db, fixture, token } = await setup();
    const wrong = { projectId: fixture.otherProjectId, milestoneId: fixture.milestoneId };
    expect((await POST(attachRequest(wrong, token, { test_plan_ids: [fixture.planA] }, `bk206-404-${Date.now()}`))).status).toBe(404);
    expect((await DELETE(detachRequest(wrong, fixture.planA, token))).status).toBe(404);
    expect(await attachedIds(db, fixture.milestoneId)).toEqual([]);
  }, 30000);

  it('detaches with 204, and answers 204 again when the plan is no longer attached', async () => {
    const { db, fixture, token } = await setup();
    expect((await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA, fixture.planB] }, `bk206-d-${Date.now()}`))).status).toBe(201);
    const first = await DELETE(detachRequest(fixture, fixture.planA, token));
    expect(first.status).toBe(204);
    expect(await first.text()).toBe('');
    expect((await DELETE(detachRequest(fixture, fixture.planA, token))).status).toBe(204);
    expect(await attachedIds(db, fixture.milestoneId)).toEqual([fixture.planB]);
  }, 30000);

  it('refuses a viewer with 403 forbidden_role on attach and detach', async () => {
    const { db, fixture, token } = await setup();
    expect((await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planA] }, `bk206-v0-${Date.now()}`))).status).toBe(201);
    await db.from('workspace_members').update({ role: 'viewer' }).eq('workspace_id', fixture.workspaceId).eq('user_id', fixture.actorUserId);
    const attach = await POST(attachRequest(fixture, token, { test_plan_ids: [fixture.planB] }, `bk206-v1-${Date.now()}`));
    expect(attach.status).toBe(403);
    expect(((await attach.json()) as ErrorBody).error?.details?.reason).toBe('forbidden_role');
    expect((await DELETE(detachRequest(fixture, fixture.planA, token))).status).toBe(403);
    expect(await attachedIds(db, fixture.milestoneId)).toEqual([fixture.planA]);
  }, 30000);
});
