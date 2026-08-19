import type { Capability } from '@lib/api/capabilities';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// The route modules pull `server-only` transitively (via the admin/env modules);
// shim the sentinel so the graph loads under Bun, then import the REAL exported
// handlers. Same convention as `lib/api/auth-coexistence.test.ts` and
// `app/api/v1/tokens/cookie-only-posture.test.ts`.
void mock.module('server-only', () => ({}));
const { POST: createModule } = await import('@app/api/v1/projects/[id]/modules/route');
const { GET: listUserStories } = await import('@app/api/v1/modules/[id]/user-stories/route');
const { mintPat } = await import('@lib/api/pat');

// BK-498 — capability scopes are ENFORCED on the authoring domain.
//
// BK-497 shipped the machinery: a mandatory posture union on `withApiHandler`
// and a gateway that calls `requireCapability` for `auth: 'required'`. It left
// the 22 authoring handlers parked on `auth: 'authenticated'`, which performs
// zero capability checks. This Story flips them to `atc:write` (writes) and
// `atc:read` (reads).
//
// A green `types:check` proves the posture is DECLARED. It proves nothing about
// whether a narrow token is actually stopped, so every assertion here drives a
// REAL exported handler with a REAL minted PAT and observes the database
// directly through an independent service-role client.
//
// The negative and positive cases are deliberately paired. A 403 on its own is
// also produced by a route that is simply broken, and a row-count that did not
// move is also explained by a write that never worked for anyone. Only the two
// together isolate the capability gate as the thing under test.
//
// DB-dependent + env-gated, same style as the sibling auth suites: skips when
// the Supabase env is absent (CI without DB credentials).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

type Db = SupabaseClient<Database>;

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }

function service(): Db {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
}

// Reuse an existing active member rather than seeding a workspace: the write
// under test goes through `bunkai_create_module`, which role-gates on real
// workspace membership. A synthetic user with no membership would be rejected
// by the ROLE gate and never reach the CAPABILITY gate — the suite would then
// pass for the wrong reason.
async function findWritableMember(db: Db): Promise<MemberRow | null> {
  const { data: members } = await db
    .from('workspace_members')
    .select('user_id, workspace_id, role, status');
  return (members as MemberRow[] | null)?.find(
    m => m.status === 'active' && ['member', 'admin', 'owner'].includes(m.role),
  ) ?? null;
}

function createModuleRequest(projectId: string, token: string, name: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${projectId}/modules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

function listUserStoriesRequest(moduleId: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/modules/${moduleId}/user-stories`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function moduleCount(db: Db, projectId: string): Promise<number> {
  const { count } = await db
    .from('modules')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  // A failed head query returns null. Assert the shape here so a caller
  // comparing before/after never compares `null === null` vacuously.
  expect(typeof count).toBe('number');
  return count as number;
}

describeOrSkip('BK-498 — capability scopes are enforced on the authoring domain', () => {
  const createdProjectIds: string[] = [];
  const createdTokenIds: string[] = [];
  let fixture: {
    projectId: string
    moduleId: string
    writeToken: string
    readToken: string
  } | null = null;
  let skipReason: string | null = null;

  async function mintFor(db: Db, userId: string, name: string, scopes: Capability[]) {
    const pat = await mintPat({ admin: db, userId, name, scopes, expiresInDays: null });
    createdTokenIds.push(pat.id);
    return pat;
  }

  beforeAll(async () => {
    const db = service();
    const writer = await findWritableMember(db);
    if (!writer) {
      skipReason = 'need an active workspace member with role >= member (seed state).';
      return;
    }

    const prefix = `bk498-cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: writer.workspace_id, slug: prefix, name: `${prefix} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    createdProjectIds.push(project.id);

    // Seeded directly so the read assertion (AC-08a) has a target that does not
    // depend on the write assertions having already run.
    const { data: seedModule, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: project.id, path: 'seed', name: 'Seed' })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    // Both tokens are minted UNBOUND (`workspace_id` null) — mintPat's default.
    // That is the AC-07 condition, asserted explicitly in its own test below.
    const writePat = await mintFor(db, writer.user_id, `${prefix}-write`, ['atc:write']);
    const readPat = await mintFor(db, writer.user_id, `${prefix}-read`, ['atc:read']);

    fixture = {
      projectId: project.id,
      moduleId: seedModule.id,
      writeToken: writePat.token,
      readToken: readPat.token,
    };
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    // Projects cascade to modules / user_stories (migrations 0002/0003), the
    // same teardown posture as the traceability regression suite.
    if (createdProjectIds.length > 0) {
      await db.from('projects').delete().in('id', createdProjectIds);
    }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
  });

  // AC-03 — a read-only token must not be able to author.
  it('rejects a POST /projects/{id}/modules from an atc:read-only PAT, and creates nothing', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }
    const db = service();

    const before = await moduleCount(db, fixture.projectId);

    const response = await createModule(
      createModuleRequest(fixture.projectId, fixture.readToken, 'bk498 denied module'),
    );

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toBe('Missing required capability: atc:write');

    // Side-effect proof: the gate ran BEFORE the handler body, so no row moved.
    // This is the assertion that survives a refactor of the error envelope.
    expect(await moduleCount(db, fixture.projectId)).toBe(before);
  });

  // AC-01 — the positive control. Without it, the assertion above is satisfied
  // by any breakage at all and proves nothing about the capability gate.
  // THIS is the real production write path: the exported handler, a real PAT,
  // the real `bunkai_create_module` RPC, and a row read back from the database.
  it('allows a POST /projects/{id}/modules from a PAT scoped exactly atc:write', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }
    const db = service();

    const name = 'bk498 allowed module';
    const response = await createModule(
      createModuleRequest(fixture.projectId, fixture.writeToken, name),
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { module?: { id?: string, name?: string } };
    expect(body.module?.name).toBe(name);

    // Independent read-back: the row genuinely exists, it was not merely a 201.
    const { data: row } = await db
      .from('modules')
      .select('id, name')
      .eq('id', body.module?.id ?? '')
      .single();
    expect(row?.name).toBe(name);
  });

  // AC-07 — an unbound token still works when the underlying user is a real
  // member. Capability and workspace binding are independent concerns; gating
  // authoring on `atc:write` must not accidentally start requiring a binding.
  it('allows an atc:write PAT with no workspace binding when the user is an active member', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }
    const db = service();

    // Prove the precondition rather than assume mintPat's default.
    const { data: tokenRows } = await db
      .from('access_tokens')
      .select('id, workspace_id')
      .in('id', createdTokenIds);
    expect((tokenRows ?? []).length).toBeGreaterThan(0);
    for (const row of tokenRows ?? []) {
      expect(row.workspace_id).toBeNull();
    }

    const response = await createModule(
      createModuleRequest(fixture.projectId, fixture.writeToken, 'bk498 unbound module'),
    );
    expect(response.status).toBe(201);
  });

  // AC-08a — the read side of the same domain. A read-scoped token must still
  // be able to read; the sweep must not have gated reads behind `atc:write`.
  it('allows GET /modules/{id}/user-stories from an atc:read PAT', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await listUserStories(
      listUserStoriesRequest(fixture.moduleId, fixture.readToken),
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { user_stories?: unknown[] };
    expect(Array.isArray(body.user_stories)).toBe(true);
  });

  // The mirror of AC-08a: a write-only token is genuinely rejected on the read.
  // This is what proves the read gate is `atc:read` specifically rather than
  // "any authenticated principal", which is the state BK-497 left behind.
  it('rejects GET /modules/{id}/user-stories from an atc:write-only PAT', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await listUserStories(
      listUserStoriesRequest(fixture.moduleId, fixture.writeToken),
    );

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toBe('Missing required capability: atc:read');
  });
});
