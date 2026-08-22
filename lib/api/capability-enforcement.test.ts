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
const { GET: listProjectBugs } = await import('@app/api/v1/projects/[id]/bugs/route');
const { POST: createProject } = await import('@app/api/v1/workspaces/[id]/projects/route');
const { POST: switchActiveWorkspace } = await import('@app/api/v1/me/active-workspace/route');
const { DELETE: leaveWorkspaceRoute } = await import('@app/api/v1/workspaces/[id]/membership/route');
const { GET: getMe } = await import('@app/api/v1/me/route');
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

// Reuse an existing active member rather than seeding a workspace: the module
// insert at `app/api/v1/projects/[id]/modules/route.ts` is RLS-scoped through
// the caller's impersonating client, and a Postgres 42501 is mapped to a 403.
// A synthetic user with no membership would be stopped by that RLS policy and
// never reach the CAPABILITY gate — the suite would then pass for the wrong
// reason, proving only that a stranger cannot write.
async function findWritableMember(db: Db): Promise<MemberRow | null> {
  const { data: members, error } = await db
    .from('workspace_members')
    .select('user_id, workspace_id, role, status')
    .eq('status', 'active')
    .in('role', ['member', 'admin', 'owner'])
    .order('user_id')
    .limit(1);
  if (error) { throw error; }
  return (members as MemberRow[] | null)?.[0] ?? null;
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
    userId: string
    workspaceId: string
    prefix: string
  } | null = null;
  let skipReason: string | null = null;

  // `expiresInDays: 1`, never null. These are real, working credentials for a
  // real account in a SHARED database. If a run is killed before `afterAll`,
  // a non-expiring token would survive indefinitely; a 1-day token cannot.
  async function mintFor(db: Db, userId: string, name: string, scopes: Capability[]) {
    const pat = await mintPat({ admin: db, userId, name, scopes, expiresInDays: 1 });
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
      userId: writer.user_id,
      workspaceId: writer.workspace_id,
      prefix,
    };
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    // Projects cascade to modules / user_stories (migrations 0002/0003), the
    // same teardown posture as the traceability regression suite.
    //
    // Every delete is error-checked and THROWS. A silent failure here would
    // leave live credentials for a real account in a shared database, which is
    // exactly the residue this teardown exists to prevent — so a failed cleanup
    // must be loud, not swallowed.
    if (createdProjectIds.length > 0) {
      const { error } = await db.from('projects').delete().in('id', createdProjectIds);
      if (error) { throw error; }
    }
    for (const id of createdTokenIds) {
      const { error: secretError } = await db.from('access_token_secrets').delete().eq('token_id', id);
      if (secretError) { throw secretError; }
      const { error: tokenError } = await db.from('access_tokens').delete().eq('id', id);
      if (tokenError) { throw tokenError; }
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
  // the real RLS-scoped insert the route performs through the caller's
  // impersonating client, and the row read back by an independent client.
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

    // Prove the precondition rather than assume mintPat's default. Asserting
    // the exact row count first — a partial result would let the loop below
    // "pass" while silently checking only some of the tokens.
    const { data: tokenRows, error } = await db
      .from('access_tokens')
      .select('id, workspace_id')
      .in('id', createdTokenIds);
    if (error) { throw error; }
    expect(tokenRows).toHaveLength(createdTokenIds.length);
    for (const row of tokenRows ?? []) {
      expect(row.workspace_id).toBeNull();
    }

    const unboundResponse = await createModule(
      createModuleRequest(fixture.projectId, fixture.writeToken, 'bk498 unbound module'),
    );
    expect(unboundResponse.status).toBe(201);

    // The contrast that makes this test about BINDING rather than a rerun of
    // AC-01: a second atc:write PAT that IS bound to the target workspace must
    // reach the same 201. Capability and workspace binding are independent —
    // gating authoring on `atc:write` must neither start requiring a binding
    // nor start rejecting one.
    const boundPat = await mintPat({
      admin: db,
      userId: fixture.userId,
      name: `${fixture.prefix}-bound`,
      scopes: ['atc:write'],
      workspaceId: fixture.workspaceId,
      expiresInDays: 1,
    });
    createdTokenIds.push(boundPat.id);

    const { data: boundRow } = await db
      .from('access_tokens')
      .select('workspace_id')
      .eq('id', boundPat.id)
      .single();
    expect(boundRow?.workspace_id).toBe(fixture.workspaceId);

    const boundResponse = await createModule(
      createModuleRequest(fixture.projectId, boundPat.token, 'bk498 bound module'),
    );
    expect(boundResponse.status).toBe(201);
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

// BK-499 — capability scopes are ENFORCED on the read, identity and
// notification routes: the last 24 handlers the BK-497 placeholder sweep left
// on `auth: 'authenticated'`.
//
// Same discipline as the BK-498 block above. `types:check` proves the posture
// is DECLARED and `route-capability-coverage.test.ts` proves it matches the
// ratified map; neither proves a narrow token is actually stopped in front of
// the real database. Every assertion here drives a REAL exported handler with a
// REAL minted PAT and observes the result through an independent service-role
// client, and every negative is paired with the positive that rules out "this
// route is simply broken".
describeOrSkip('BK-499 — capability scopes are enforced on reads and identity routes', () => {
  const createdProjectIds: string[] = [];
  const createdTokenIds: string[] = [];
  let fixture: {
    projectId: string
    readToken: string
    writeToken: string
    executeToken: string
    workspaceId: string
    prefix: string
  } | null = null;
  let skipReason: string | null = null;

  // `expiresInDays: 1`, never null — see the BK-498 block's note. These are
  // working credentials for a real account in a SHARED database.
  async function mintFor(db: Db, userId: string, name: string, scopes: Capability[]) {
    const pat = await mintPat({ admin: db, userId, name, scopes, expiresInDays: 1 });
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

    const prefix = `bk499-cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: writer.workspace_id, slug: prefix, name: `${prefix} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    createdProjectIds.push(project.id);

    fixture = {
      projectId: project.id,
      readToken: (await mintFor(db, writer.user_id, `${prefix}-read`, ['atc:read'])).token,
      writeToken: (await mintFor(db, writer.user_id, `${prefix}-write`, ['atc:write'])).token,
      // The AC-03 token: valid, unexpired, unrevoked, and holding a real scope
      // that is simply the WRONG one. A scopeless token would be rejected for a
      // different reason and would prove nothing about the capability gate.
      executeToken: (await mintFor(db, writer.user_id, `${prefix}-exec`, ['run:execute'])).token,
      workspaceId: writer.workspace_id,
      prefix,
    };
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    // Loud, not swallowed: a silent failure here leaves live credentials for a
    // real account in a shared database.
    if (createdProjectIds.length > 0) {
      const { error } = await db.from('projects').delete().in('id', createdProjectIds);
      if (error) { throw error; }
    }
    for (const id of createdTokenIds) {
      const { error: secretError } = await db.from('access_token_secrets').delete().eq('token_id', id);
      if (secretError) { throw secretError; }
      const { error: tokenError } = await db.from('access_tokens').delete().eq('id', id);
      if (tokenError) { throw tokenError; }
    }
  });

  // AC-02 — the positive control for the read gate, on the exact endpoint the
  // Acceptance Criteria name.
  it('allows GET /projects/{id}/bugs from a PAT scoped atc:read', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await listProjectBugs(projectBugsRequest(fixture.projectId, fixture.readToken));

    expect(response.status).toBe(200);
    const body = await response.json() as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  // AC-03 — the criterion verbatim: a token scoped only `run:execute` is
  // rejected on a non-ATC read, and no data comes back.
  it('rejects GET /projects/{id}/bugs from a run:execute-only PAT, and returns no data', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await listProjectBugs(projectBugsRequest(fixture.projectId, fixture.executeToken));

    expect(response.status).toBe(403);
    const body = await response.json() as { items?: unknown[], error?: { message?: string } };
    expect(body.error?.message).toBe('Missing required capability: atc:read');
    // "And no data is returned" is half the criterion, so it is asserted rather
    // than inferred from the status code.
    expect(body.items).toBeUndefined();
  });

  // The write half of this Story's map. REAL production write path: the
  // exported handler, a real PAT, the RLS-scoped insert the route performs
  // through the caller's impersonating client, and the row read back by an
  // independent service-role client — not a fixture-seeded row.
  it('allows POST /workspaces/{id}/projects from a PAT scoped exactly atc:write', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }
    const db = service();

    const name = `${fixture.prefix} allowed project`;
    const response = await createProject(
      createProjectRequest(fixture.workspaceId, fixture.writeToken, name),
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { project?: { id?: string, name?: string } };
    expect(body.project?.name).toBe(name);
    if (body.project?.id) { createdProjectIds.push(body.project.id); }

    const { data: row } = await db
      .from('projects')
      .select('id, name')
      .eq('id', body.project?.id ?? '')
      .single();
    expect(row?.name).toBe(name);
  });

  // The negative for the same route. A 403 alone is also what a broken route
  // produces, and an unmoved row count is also explained by a write that never
  // worked for anyone — only the pair isolates the capability gate.
  it('rejects POST /workspaces/{id}/projects from an atc:read-only PAT, and creates nothing', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }
    const db = service();

    const before = await workspaceProjectCount(db, fixture.workspaceId);

    const response = await createProject(
      createProjectRequest(fixture.workspaceId, fixture.readToken, `${fixture.prefix} denied project`),
    );

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toBe('Missing required capability: atc:write');
    expect(await workspaceProjectCount(db, fixture.workspaceId)).toBe(before);
  });

  // The session-only posture, driven end-to-end. This is the distinction the
  // shift-left review flagged: the token here HOLDS a valid scope and is still
  // refused, so the failure reason is "you are a token", not "you lack a
  // scope". Asserting the exact message is what keeps those two 403s apart for
  // whoever writes the negative test case downstream.
  it('rejects POST /me/active-workspace from any Bearer PAT, regardless of scope', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await switchActiveWorkspace(
      switchWorkspaceRequest(fixture.workspaceId, fixture.readToken),
    );

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toBe(
      'Personal access tokens have no switchable active workspace. '
      + 'Pass workspace_id explicitly on each request instead.',
    );
  });

  // The other session-only route. Deliberately aimed at a workspace id that
  // does not exist: if the posture ever regressed, the handler body would run
  // `bunkai_leave_workspace` for a REAL member of a SHARED database, and a test
  // whose failure mode is destroying seed data is worse than no test. Against a
  // nonexistent id the regression surfaces as a 404 instead of this 403, which
  // fails the assertion without touching a row.
  it('rejects DELETE /workspaces/{id}/membership from any Bearer PAT, regardless of scope', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await leaveWorkspaceRoute(
      leaveWorkspaceRequest('00000000-0000-0000-0000-000000000000', fixture.readToken),
    );

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toBe(
      'Personal access tokens cannot leave a workspace. Use a browser session.',
    );
  });

  // The over-gating direction, which is the failure mode this Story's own
  // no-capability category invites: someone later "tidies" an identity route
  // onto `auth: 'required'` and every narrowly-scoped token loses the ability
  // to find out who it is. The token here holds ONLY `run:execute` — the scope
  // that is 403'd on every read above — and must still reach 200.
  it('allows GET /me from a run:execute-only PAT — identity is never scope-gated', async () => {
    if (!fixture) { throw new Error(skipReason ?? 'fixture not initialised'); }

    const response = await getMe(meRequest(fixture.executeToken));

    expect(response.status).toBe(200);
    const body = await response.json() as { user?: { id?: string } };
    expect(typeof body.user?.id).toBe('string');
  });
});

function projectBugsRequest(projectId: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${projectId}/bugs`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function createProjectRequest(workspaceId: string, token: string, name: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

function leaveWorkspaceRequest(workspaceId: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/workspaces/${workspaceId}/membership`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

function meRequest(token: string): NextRequest {
  return new NextRequest('https://app.test/api/v1/me', {
    headers: { authorization: `Bearer ${token}` },
  });
}

function switchWorkspaceRequest(workspaceId: string, token: string): NextRequest {
  return new NextRequest('https://app.test/api/v1/me/active-workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}

async function workspaceProjectCount(db: Db, workspaceId: string): Promise<number> {
  const { count } = await db
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  // Same shape guard as `moduleCount`: a failed head query returns null, and a
  // caller comparing before/after must never compare `null === null`.
  expect(typeof count).toBe('number');
  return count as number;
}
