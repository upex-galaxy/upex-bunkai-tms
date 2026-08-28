import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// The route imports `@lib/api/handler`, which pulls in `server-only`
// (transitively via `@lib/api/principal`); shim it so the module graph loads
// under Bun, then import the REAL exported GET/POST handlers. Same
// convention as `app/api/v1/atcs/[id]/duplicate/route.test.ts`.
void mock.module('server-only', () => ({}));
const { GET, POST } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

// BK-203 review fix (item 2) — GET/POST /api/v1/test-plans/{id}/tests had
// zero route-level coverage: the 577-line isolation suite
// (lib/test-plans/test-plan-tests-rpc-isolation.test.ts) exercises
// `bunkai_add_tests_to_plan` / `bunkai_remove_test_from_plan` /
// `bunkai_search_tests` directly, but nothing above the RPC boundary —
// Idempotency-Key wiring, `discardIdempotencyResult` on the error path,
// `mapTestPlanTestsRpcError`'s SQLSTATE -> HTTP status mapping, and the GET
// list's `resolveActivityActors` join / `added_by_email` shaping. This file
// exercises the REAL exported GET/POST handlers end-to-end (real Bearer PAT
// via `mintPat`, real Zod schema, real RPCs through the caller's own
// RLS-scoped client — the exact path the route uses), not a mocked stand-in.
//
// DB-dependent + env-gated: skips entirely when the Supabase env is absent
// (CI without DB creds); when the env IS present but seed state cannot
// satisfy a precondition, fails loudly rather than passing silently — same
// convention as the isolation suite and `duplicate/route.test.ts`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

const PREFIX = `bk203-route-wiring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[test-plans/tests route] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

type Db = ReturnType<typeof service>;

// Any pre-existing active workspace member — used only as the FK anchor for
// the throwaway workspace's owner_user_id column, mirroring the isolation
// suite's own fixture-building convention.
async function findAnyActiveMemberId(db: Db): Promise<string | null> {
  const { data } = await db.from('workspace_members').select('user_id').eq('status', 'active').limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

interface Fixture {
  workspaceId: string
  actorUserId: string
  planOpenId: string
  planClosedId: string
  addableTestId: string
}

// Each `it` mints its OWN fixture (mintFixtureAndPat is called per test, not
// shared in beforeAll) so a test's own state never leaks into a sibling — but
// that means the workspace slug must be unique PER CALL, not just per file,
// or the second test in the file collides on `workspaces_slug_key`.
let fixtureCallCount = 0;

async function buildFixture(db: Db): Promise<Fixture> {
  const ownerUserId = requirePrecondition(
    await findAnyActiveMemberId(db),
    'need at least 1 real user id among active workspace members (seed state)',
  );
  fixtureCallCount += 1;
  const slug = `${PREFIX}-${fixtureCallCount}-ws`;

  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({ slug, name: `${PREFIX} ${fixtureCallCount}`, owner_user_id: ownerUserId })
    .select('id')
    .single();
  if (wsError || !workspace) { throw new Error(`failed to seed workspace: ${wsError?.message}`); }
  const workspaceId = workspace.id as string;

  // The PAT holder must ALSO be an active member+ of the throwaway workspace
  // — the route's RPCs re-derive authorization from auth.uid() live, the PAT
  // scope alone does not carry it.
  const { error: memberError } = await db
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: ownerUserId, role: 'member', status: 'active' });
  if (memberError) { throw new Error(`failed to grant fixture membership: ${memberError.message}`); }

  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
    .select('id')
    .single();
  if (projectError || !project) { throw new Error(`failed to seed project: ${projectError?.message}`); }
  const projectId = project.id as string;

  const { data: module_, error: moduleError } = await db
    .from('modules')
    .insert({ project_id: projectId, path: `${PREFIX}-module`, name: 'Module' })
    .select('id')
    .single();
  if (moduleError || !module_) { throw new Error(`failed to seed module: ${moduleError?.message}`); }

  const { data: story, error: storyError } = await db
    .from('user_stories')
    .insert({ module_id: module_.id as string, project_id: projectId, title: `${PREFIX} story` })
    .select('id')
    .single();
  if (storyError || !story) { throw new Error(`failed to seed user story: ${storyError?.message}`); }

  const { data: atc, error: atcError } = await db
    .from('atcs')
    .insert({
      project_id: projectId,
      module_id: module_.id as string,
      user_story_id: story.id as string,
      slug: `${PREFIX}-atc`,
      title: 'ATC',
      layer: 'UI',
    })
    .select('id')
    .single();
  if (atcError || !atc) { throw new Error(`failed to seed ATC: ${atcError?.message}`); }

  const { data: test, error: testError } = await db
    .from('tests')
    .insert({ workspace_id: workspaceId, title: `${PREFIX} addable test`, created_by: ownerUserId })
    .select('id')
    .single();
  if (testError || !test) { throw new Error(`failed to seed test: ${testError?.message}`); }
  const addableTestId = test.id as string;

  const { error: stepError } = await db
    .from('test_steps')
    .insert({ test_id: addableTestId, atc_id: atc.id as string, position: 1 });
  if (stepError) { throw new Error(`failed to seed test step: ${stepError.message}`); }

  const { data: plans, error: plansError } = await db
    .from('test_plans')
    .insert([
      { workspace_id: workspaceId, project_id: projectId, name: `${PREFIX} plan open`, status: 'open' },
      { workspace_id: workspaceId, project_id: projectId, name: `${PREFIX} plan closed`, status: 'closed' },
    ])
    .select('id, name');
  if (plansError || !plans) { throw new Error(`failed to seed test plans: ${plansError?.message}`); }
  const planOpenId = plans.find(p => (p.name as string).endsWith('open'))!.id as string;
  const planClosedId = plans.find(p => (p.name as string).endsWith('closed'))!.id as string;

  return { workspaceId, actorUserId: ownerUserId, planOpenId, planClosedId, addableTestId };
}

function addTestsRequest(planId: string, token: string, body: unknown, idempotencyKey?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'authorization': `Bearer ${token}` };
  if (idempotencyKey) { headers['Idempotency-Key'] = idempotencyKey; }
  return new NextRequest(`https://app.test/api/v1/test-plans/${planId}/tests`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function listTestsRequest(planId: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/test-plans/${planId}/tests`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}

interface AddSuccessBody { added_count?: number, member_count?: number }
interface ErrorBody { error?: { code?: string, message?: string } }

describeOrSkip('BK-203 — POST/GET /api/v1/test-plans/{id}/tests wiring (Idempotency-Key, RPC error mapping)', () => {
  const createdWorkspaceIds: string[] = [];
  const createdTokenIds: string[] = [];

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    for (const id of createdWorkspaceIds) {
      await db.from('workspaces').delete().eq('id', id);
    }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
  });

  async function mintFixtureAndPat() {
    const db = service();
    const fixture = await buildFixture(db);
    createdWorkspaceIds.push(fixture.workspaceId);

    const pat = await mintPat({
      admin: db,
      userId: fixture.actorUserId,
      name: 'bk203-route-wiring',
      scopes: ['atc:read', 'atc:write'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);

    return { db, fixture, token: pat.token };
  }

  it('same Idempotency-Key + same payload replays the stored 201 snapshot — no second row is written (AC E3)', async () => {
    const { db, fixture, token } = await mintFixtureAndPat();
    const key = `bk203-e3-${Date.now()}`;
    const body = { test_ids: [fixture.addableTestId] };

    const first = await POST(addTestsRequest(fixture.planOpenId, token, body, key));
    const firstBody = await first.json() as AddSuccessBody & ErrorBody;
    expect(first.status).toBe(201);
    expect(firstBody.added_count).toBe(1);

    const second = await POST(addTestsRequest(fixture.planOpenId, token, body, key));
    const secondBody = await second.json() as AddSuccessBody & ErrorBody;
    expect(second.status).toBe(201);
    // The replayed snapshot, not a fresh RPC result — same shape, and no
    // duplicate row was inserted server-side.
    expect(secondBody).toEqual(firstBody);

    const { count } = await db
      .from('test_plan_tests')
      .select('id', { count: 'exact', head: true })
      .eq('test_plan_id', fixture.planOpenId)
      .eq('test_id', fixture.addableTestId);
    expect(count).toBe(1);
  }, 20000);

  it('same Idempotency-Key + a DIFFERENT payload is rejected 409 conflict', async () => {
    const { fixture, token } = await mintFixtureAndPat();
    const key = `bk203-conflict-${Date.now()}`;

    const first = await POST(addTestsRequest(fixture.planOpenId, token, { test_ids: [fixture.addableTestId] }, key));
    expect(first.status).toBe(201);

    // A syntactically valid but different body under the same key.
    const second = await POST(addTestsRequest(fixture.planOpenId, token, { test_ids: [fixture.addableTestId, fixture.addableTestId] }, key));
    const secondBody = await second.json() as ErrorBody;
    expect(second.status).toBe(409);
    expect(secondBody.error?.code).toBe('conflict');
  }, 20000);

  it('a failed RPC call discards the Idempotency-Key (via discardIdempotencyResult), so a corrected retry under the SAME key succeeds', async () => {
    const { fixture, token } = await mintFixtureAndPat();
    const key = `bk203-discard-retry-${Date.now()}`;

    // Closed plan -> 45603 -> mapTestPlanTestsRpcError -> 409. The route's
    // catch block must call discardIdempotencyResult so this key is not
    // stuck "pending" forever.
    const failed = await POST(addTestsRequest(fixture.planClosedId, token, { test_ids: [fixture.addableTestId] }, key));
    const failedBody = await failed.json() as ErrorBody;
    expect(failed.status).toBe(409);
    expect(failedBody.error?.code).toBe('conflict');

    // Same key, now against the OPEN plan — this only succeeds if the failed
    // attempt discarded (not left "pending") the key.
    const retried = await POST(addTestsRequest(fixture.planOpenId, token, { test_ids: [fixture.addableTestId] }, key));
    const retriedBody = await retried.json() as AddSuccessBody & ErrorBody;
    expect(retried.status).toBe(201);
    expect(retriedBody.added_count).toBe(1);
  }, 20000);

  it('a request with no Idempotency-Key header is rejected before any RPC call', async () => {
    const { fixture, token } = await mintFixtureAndPat();
    const response = await POST(addTestsRequest(fixture.planOpenId, token, { test_ids: [fixture.addableTestId] }));
    const body = await response.json() as ErrorBody;
    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  }, 20000);

  it('an empty test_ids array fails Zod validation with 422 before reaching the RPC', async () => {
    const { fixture, token } = await mintFixtureAndPat();
    const response = await POST(addTestsRequest(fixture.planOpenId, token, { test_ids: [] }, `bk203-empty-${Date.now()}`));
    const body = await response.json() as ErrorBody;
    expect(response.status).toBe(422);
    expect(body.error?.code).toBe('validation_failed');
  }, 20000);

  it('adding to a Closed plan maps 45603 -> 409 conflict through the real route', async () => {
    const { fixture, token } = await mintFixtureAndPat();
    const response = await POST(addTestsRequest(fixture.planClosedId, token, { test_ids: [fixture.addableTestId] }, `bk203-closed-${Date.now()}`));
    const body = await response.json() as ErrorBody;
    expect(response.status).toBe(409);
    expect(body.error?.code).toBe('conflict');
  }, 20000);

  it('GET lists the added test with name, tags, and added_by_email resolved via resolveActivityActors', async () => {
    const { fixture, token } = await mintFixtureAndPat();
    const add = await POST(addTestsRequest(fixture.planOpenId, token, { test_ids: [fixture.addableTestId] }, `bk203-list-${Date.now()}`));
    expect(add.status).toBe(201);

    const listResponse = await GET(listTestsRequest(fixture.planOpenId, token));
    const listBody = await listResponse.json() as { tests?: { id: string, added_by: string | null, added_by_email: string | null }[], count?: number };
    expect(listResponse.status).toBe(200);
    expect(listBody.count).toBe(1);
    const row = listBody.tests?.find(t => t.id === fixture.addableTestId);
    expect(row?.added_by).toBe(fixture.actorUserId);
    // A real email string, not the raw uuid and not left null — proves the
    // resolveActivityActors join actually ran and was shaped into the body.
    expect(row?.added_by_email).toBeTruthy();
  }, 20000);
});
