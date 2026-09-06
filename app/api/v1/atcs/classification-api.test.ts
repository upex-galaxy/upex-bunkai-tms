import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// The routes import `@lib/supabase/admin` (server-only) and `lib/api/pat` pulls
// in the same sentinel transitively; shim it so the module graph loads under
// Bun, then import the REAL exported handlers. Same convention as
// `app/api/v1/atcs/[id]/duplicate/route.test.ts`.
void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { PATCH } = await import('./[id]/route');
const { GET } = await import('./search/route');
const { mintPat } = await import('@lib/api/pat');

// BK-399 — the HTTP surface of ATC classification, exercised through the REAL
// exported handlers with a REAL Bearer PAT, the REAL Zod schemas and the REAL
// RPCs against the REAL database. Its siblings prove narrower layers:
//
//   * `lib/atcs/classification-validation.test.ts` — the schemas in isolation;
//   * `lib/atcs/errors.test.ts` — the SQLSTATE-to-envelope mapping in isolation;
//   * `lib/atcs/classification-rpc.test.ts` — the DB columns, the CHECKs, the
//     duplicate's column list, and the search narrows, at the RPC layer.
//
// What ONLY this file can prove is that the two fields survive the whole route
// call chain rather than being parsed and then dropped on the way to the RPC —
// the exact defect class the create path would have shipped — and that the
// ERROR CONTRACT holds on the path a normal caller actually takes. There are
// two such paths and they fail in different places:
//
//   (1) the ZOD path — an out-of-set value on a JSON body never reaches the
//       database. `AtcWriteBodySchema` throws a ZodError, `lib/api/handler.ts`
//       maps it to `validation_failed`, and the envelope carries 422.
//   (2) the direct-POSTGREST path — a caller that skips the route hits the
//       CHECK constraint instead and gets SQLSTATE 23514, which
//       `mapAtcRpcError` maps to the SAME `validation_failed` 422 with a
//       specific `details.reason`. That half is proven at the RPC layer in
//       `classification-rpc.test.ts`; its mapping is proven in `errors.test.ts`.
//
// Both converge on ONE code. No new `ApiErrorCode` was added, deliberately.
//
// DB-dependent + env-gated, same style as the duplicate route test: skips
// entirely when the Supabase env is absent (CI without DB creds); when the env
// IS present but no seed exists, fails loudly rather than passing silently.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const SEARCH_TOKEN = 'bk399routefixture';

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[classification-api] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

type Db = ReturnType<typeof service>;

interface Seed {
  actorUserId: string
  projectId: string
  moduleId: string
  userStoryId: string
  acIds: string[]
}

// An existing ATC supplies a (module, user story, acceptance criteria) triple
// that already satisfies the create RPC's cross-entity rules, plus a workspace
// with an active writer. Nothing existing is mutated.
async function findSeed(db: Db): Promise<Seed | null> {
  const { data: atcs } = await db
    .from('atcs')
    .select('id, project_id, module_id, user_story_id')
    .is('archived_at', null);
  const { data: projects } = await db.from('projects').select('id, workspace_id');
  const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

  const wsByProject = new Map((projects ?? []).map(p => [p.id, p.workspace_id]));
  const writers = (members ?? []).filter(
    m => m.status === 'active' && ['member', 'admin', 'owner'].includes(m.role),
  );

  for (const atc of atcs ?? []) {
    const ws = wsByProject.get(atc.project_id);
    const actor = writers.find(m => m.workspace_id === ws);
    if (!ws || !actor) { continue; }
    const { data: acs } = await db
      .from('atc_acceptance_criteria')
      .select('acceptance_criterion_id')
      .eq('atc_id', atc.id);
    const acIds = (acs ?? []).map(a => a.acceptance_criterion_id);
    if (acIds.length >= 1) {
      return {
        actorUserId: actor.user_id,
        projectId: atc.project_id,
        moduleId: atc.module_id,
        userStoryId: atc.user_story_id,
        acIds,
      };
    }
  }
  return null;
}

function writeBody(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    title: `${SEARCH_TOKEN} ${Date.now()}`,
    layer: 'API',
    steps: [{ position: 1, content: 'Given the classification route fixture' }],
    assertions: [{ content: 'Then the classification survives the route' }],
    acceptance_criterion_ids: seed.acIds,
    ...overrides,
  };
}

function createRequest(token: string, body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/atcs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function patchRequest(atcId: string, token: string, body: unknown): NextRequest {
  return new NextRequest(`https://app.test/api/v1/atcs/${atcId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function searchRequest(token: string, params: Record<string, string>): NextRequest {
  const search = new URLSearchParams(params).toString();
  return new NextRequest(`https://app.test/api/v1/atcs/search?${search}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}

interface AtcBody {
  atc?: { id?: string, technique?: string | null, priority?: string | null }
  version?: number
  items?: { id: string }[]
  error?: { code?: string, message?: string, details?: unknown }
}

describeOrSkip('BK-399 — ATC classification across the HTTP surface', () => {
  const createdAtcIds: string[] = [];
  const createdTokenIds: string[] = [];
  let cachedToken: string | null = null;
  let cachedSeed: Seed | null = null;

  // One PAT for the whole suite, minted for the seed's own writer. `atc:read`
  // rides along because the search narrows below hit a different route posture.
  async function auth(): Promise<{ seed: Seed, token: string }> {
    const db = service();
    if (!cachedSeed || !cachedToken) {
      cachedSeed = requirePrecondition(await findSeed(db), 'need an ATC with ≥1 AC binding in a workspace with an active writer');
      const pat = await mintPat({
        admin: db,
        userId: cachedSeed.actorUserId,
        name: 'bk399-classification-api',
        scopes: ['atc:read', 'atc:write'],
        expiresInDays: null,
      });
      createdTokenIds.push(pat.id);
      cachedToken = pat.token;
    }
    return { seed: cachedSeed, token: cachedToken };
  }

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    if (createdAtcIds.length > 0) {
      await db.from('activity_log').delete().in('entity_id', createdAtcIds);
      await db.from('atcs').delete().in('id', createdAtcIds);
    }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
  });

  it('POST /atcs carries both fields from the parsed body all the way to the stored row (T9e)', async () => {
    const { seed, token } = await auth();

    const response = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'Boundary Value Analysis',
      priority: 'High',
    })));
    const body = await response.json() as AtcBody;

    expect(response.status).toBe(201);
    if (body.atc?.id) { createdAtcIds.push(body.atc.id); }
    expect(body.atc?.technique).toBe('Boundary Value Analysis');
    expect(body.atc?.priority).toBe('High');

    // The response json is composed by re-reading the row, but assert the row
    // itself too: a create that accepted the keys and never passed them to the
    // RPC is the silent-drop defect this test exists to catch.
    const { data } = await service().from('atcs').select('technique, priority').eq('id', body.atc!.id!).single();
    expect(data?.technique).toBe('Boundary Value Analysis');
    expect(data?.priority).toBe('High');
  });

  it('PATCH /atcs/{id} sets both fields and bumps the version (AC-01 / AC-02)', async () => {
    const { seed, token } = await auth();

    const created = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
    })));
    const createdBody = await created.json() as AtcBody;
    expect(created.status).toBe(201);
    const atcId = requirePrecondition(createdBody.atc?.id, 'create must return the new ATC id');
    createdAtcIds.push(atcId);
    expect(createdBody.atc?.technique).toBeNull();

    const response = await PATCH(patchRequest(atcId, token, writeBody(seed, {
      technique: 'Decision Table',
      priority: 'Medium',
    })));
    const body = await response.json() as AtcBody;

    expect(response.status).toBe(200);
    expect(body.atc?.technique).toBe('Decision Table');
    expect(body.atc?.priority).toBe('Medium');
    expect(body.version).toBe(2);
  });

  it('PATCH /atcs/{id} clears both when the keys are omitted — full replace, like tags (E3 / T8)', async () => {
    const { seed, token } = await auth();

    const created = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'Pairwise',
      priority: 'Critical',
    })));
    const createdBody = await created.json() as AtcBody;
    const atcId = requirePrecondition(createdBody.atc?.id, 'create must return the new ATC id');
    createdAtcIds.push(atcId);

    // No technique / priority keys at all. The documented hazard of this
    // endpoint: a client that GETs, edits the title and PATCHes back without
    // echoing the classification wipes it. Same as tags, and said so in the spec.
    const response = await PATCH(patchRequest(atcId, token, writeBody(seed)));
    const body = await response.json() as AtcBody;

    expect(response.status).toBe(200);
    expect(body.atc?.technique).toBeNull();
    expect(body.atc?.priority).toBeNull();
  });

  it('PATCH /atcs/{id} with an explicit null clears too (E3)', async () => {
    const { seed, token } = await auth();

    const created = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'State Transition',
      priority: 'Low',
    })));
    const createdBody = await created.json() as AtcBody;
    const atcId = requirePrecondition(createdBody.atc?.id, 'create must return the new ATC id');
    createdAtcIds.push(atcId);

    const response = await PATCH(patchRequest(atcId, token, writeBody(seed, {
      technique: null,
      priority: null,
    })));
    const body = await response.json() as AtcBody;

    expect(response.status).toBe(200);
    expect(body.atc?.technique).toBeNull();
    expect(body.atc?.priority).toBeNull();
  });

  // ---- Error contract, the Zod half -------------------------------------
  // 422 with error.code = "validation_failed". NOT a new domain code, NOT 400.

  it('PATCH with an out-of-set technique is 422 validation_failed and leaves the row untouched (AC-01 1.2)', async () => {
    const { seed, token } = await auth();

    const created = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'Pairwise',
      priority: 'High',
    })));
    const createdBody = await created.json() as AtcBody;
    const atcId = requirePrecondition(createdBody.atc?.id, 'create must return the new ATC id');
    createdAtcIds.push(atcId);

    const response = await PATCH(patchRequest(atcId, token, writeBody(seed, {
      technique: 'Mutation Testing',
    })));
    const body = await response.json() as AtcBody;

    expect(response.status).toBe(422);
    expect(body.error?.code).toBe('validation_failed');
    // The Zod issue list names the field and the allowed set, which is why no
    // separate ATC_INVALID_TECHNIQUE code was introduced.
    expect(JSON.stringify(body.error?.details ?? [])).toContain('technique');

    const { data } = await service().from('atcs').select('technique, priority, version').eq('id', atcId).single();
    expect(data?.technique).toBe('Pairwise');
    expect(data?.priority).toBe('High');
    expect(data?.version).toBe(1);
  });

  it('POST with an out-of-set priority is 422 validation_failed, never 400 (AC-02 2.2)', async () => {
    const { seed, token } = await auth();

    const response = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      priority: 'Urgent',
    })));
    const body = await response.json() as AtcBody;

    expect(response.status).toBe(422);
    expect(body.error?.code).toBe('validation_failed');
    expect(body.atc).toBeUndefined();
  });

  it('a case-mismatched value is rejected 422, never folded (E1)', async () => {
    const { seed, token } = await auth();

    const lower = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'boundary value analysis',
    })));
    expect(lower.status).toBe(422);
    expect(((await lower.json()) as AtcBody).error?.code).toBe('validation_failed');

    const upper = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'BOUNDARY VALUE ANALYSIS',
    })));
    expect(upper.status).toBe(422);
  });

  it('a whitespace-padded value is rejected 422, never trimmed (E2)', async () => {
    const { seed, token } = await auth();

    const response = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      priority: ' High ',
    })));

    expect(response.status).toBe(422);
    expect(((await response.json()) as AtcBody).error?.code).toBe('validation_failed');
  });

  // ---- Search narrows ----------------------------------------------------

  it('GET /atcs/search narrows by ?technique= and ?priority=, ANDed with query and project_id (AC-04 / AC-05)', async () => {
    const { seed, token } = await auth();

    const first = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'Pairwise',
      priority: 'Critical',
    })));
    const firstId = requirePrecondition(((await first.json()) as AtcBody).atc?.id, 'create must return an id');
    createdAtcIds.push(firstId);

    const second = await POST(createRequest(token, writeBody(seed, {
      module_id: seed.moduleId,
      user_story_id: seed.userStoryId,
      technique: 'Decision Table',
      priority: 'Low',
    })));
    const secondId = requirePrecondition(((await second.json()) as AtcBody).atc?.id, 'create must return an id');
    createdAtcIds.push(secondId);

    async function ids(extra: Record<string, string>): Promise<string[]> {
      const response = await GET(searchRequest(token, {
        query: SEARCH_TOKEN,
        project_id: seed.projectId,
        limit: '50',
        ...extra,
      }));
      expect(response.status).toBe(200);
      const body = await response.json() as AtcBody;
      return (body.items ?? []).map(item => item.id);
    }

    // Unnarrowed, both fixtures are candidates — so an absence below is the
    // filter working, not an empty index.
    const all = await ids({});
    expect(all).toContain(firstId);
    expect(all).toContain(secondId);

    const pairwise = await ids({ technique: 'Pairwise' });
    expect(pairwise).toContain(firstId);
    expect(pairwise).not.toContain(secondId);

    const low = await ids({ priority: 'Low' });
    expect(low).toContain(secondId);
    expect(low).not.toContain(firstId);

    const combined = await ids({ technique: 'Decision Table', priority: 'Low' });
    expect(combined).toContain(secondId);
    expect(combined).not.toContain(firstId);
  });

  it('GET /atcs/search rejects an unrecognized narrow with 422 validation_failed', async () => {
    const { seed, token } = await auth();

    const response = await GET(searchRequest(token, {
      query: SEARCH_TOKEN,
      project_id: seed.projectId,
      technique: 'Exploratory',
    }));

    expect(response.status).toBe(422);
    expect(((await response.json()) as AtcBody).error?.code).toBe('validation_failed');
  });

  it('GET /atcs/search still REQUIRES query and project_id — the narrows do not make it a list endpoint (T3)', async () => {
    const { token } = await auth();

    const response = await GET(searchRequest(token, { technique: 'Pairwise' }));

    expect(response.status).toBe(422);
    expect(((await response.json()) as AtcBody).error?.code).toBe('validation_failed');
  });
});
