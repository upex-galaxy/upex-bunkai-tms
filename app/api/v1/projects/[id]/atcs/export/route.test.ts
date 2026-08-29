import { ATCS_EXPORT_PAGE_SIZE } from '@lib/atcs/export-query';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-315 — GET /api/v1/projects/{id}/atcs/export, live-DB route contract.
// The CSV rendering rules themselves (RFC4180 escaping, tag join, column
// order, empty-library shape) are exhaustively covered by the pure unit
// suite `lib/atcs/csv-export.test.ts` — this file covers only what a pure
// function cannot: auth posture, RLS-scoped non-disclosure, and the actual
// HTTP response shape (status, headers, body).
//
// Same shim + import convention as `traceability/route.test.ts` (BK-329) and
// `atcs/[id]/duplicate/route.test.ts` (BK-184): shim `server-only` before
// importing the route module, which pulls in `@lib/supabase/admin`.
void mock.module('server-only', () => ({}));
// `resolveIdentity`'s cookie fallback calls `@lib/supabase/server`'s
// `createClient()`, which reads `next/headers`'s `cookies()` and throws
// outside a real Next.js request scope — this harness invokes the exported
// handler directly, not through the framework. Stubbing the SSR client
// directly (rather than just `next/headers`) also makes this test immune to
// `bun test`'s process-wide module cache: `mock.module` calls from OTHER
// test files (e.g. `actions.test.ts`'s own `@lib/supabase/server` stub) can
// otherwise leak into whichever file runs later in the same `bun test`
// process. Registering our own mock here, last, wins regardless of run
// order. `getUser()` resolving to a null user is exactly what a real
// unauthenticated cookie session produces.
void mock.module('@lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
const { GET } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof service>;

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }

async function findWritableMember(db: Db): Promise<MemberRow | null> {
  const { data: members } = await db
    .from('workspace_members')
    .select('user_id, workspace_id, role, status');
  return (members as MemberRow[] | null)?.find(
    m => m.status === 'active' && ['member', 'admin', 'owner'].includes(m.role),
  ) ?? null;
}

function exportRequest(projectId: string, token?: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${projectId}/atcs/export`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

interface ErrorBody { error?: { code?: string, message?: string, details?: { reason?: string } } }

const NONEXISTENT_PROJECT_ID = '11111111-2222-4333-8444-555555555555';

// BK-637 defect 1 — assert the BOM on the BYTES the route puts on the wire,
// never on `await response.text()`. `text()` runs the WHATWG UTF-8 decode,
// which strips a leading BOM off a byte-backed body; the previous string-based
// assertion passed only because this harness calls the handler in-process, so
// the NextResponse body is still a JS string and Bun returns it verbatim. That
// made the assertion a statement about the fixture rather than about the
// response, and it stayed green while the browser download had no BOM at all.
const UTF8_BOM_BYTES = [0xEF, 0xBB, 0xBF];

async function bodyBytes(response: Response): Promise<number[]> {
  return [...new Uint8Array(await response.arrayBuffer())];
}

describe('BK-315 — GET /api/v1/projects/{id}/atcs/export — auth gate (no DB needed)', () => {
  it('rejects a fully unauthenticated request with 401 (AC3.4)', async () => {
    const response = await GET(exportRequest(NONEXISTENT_PROJECT_ID));
    const body = await response.json() as ErrorBody;
    expect(response.status).toBe(401);
    expect(body.error?.code).toBe('unauthorized');
  });
});

// Make a missing seed precondition VISIBLE on a DB-backed run: fail with a
// clear reason instead of logging + passing (no silent green) — same
// convention as `lib/atcs/search-isolation.test.ts`, adopted per Conductor
// review of PR #207 (MAJOR): every `it()` here used to guard on
// `if (!fixture) { return warn(); }`, which reports PASS when `beforeAll`
// never populated `fixture` — including the foreign-workspace case (AC3.1,
// the only multi-tenant assertion in this suite), which used to
// `console.warn` and return green when the seed had no second workspace. On
// a no-DB run the whole suite is already skipped via `describeOrSkip`, so
// this never fires there.
function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[atcs/export route] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

describeOrSkip('BK-315 — GET /api/v1/projects/{id}/atcs/export — live DB', () => {
  const createdProjectIds: string[] = [];
  const createdTokenIds: string[] = [];
  let fixture: {
    emptyProjectId: string
    populatedProjectId: string
    projectSlug: string
    token: string
    foreignProjectId: string | null
    overCapProjectId: string
    overCapModulePath: string
  } | null = null;

  beforeAll(async () => {
    const db = service();
    const writer = requirePrecondition(
      await findWritableMember(db),
      'need an active workspace member with role >= member',
    );

    const { data: existingProjects } = await db.from('projects').select('id, workspace_id');
    const foreignProjectId = (existingProjects ?? [])
      .find(p => p.workspace_id !== writer.workspace_id)
      ?.id ?? null;

    const prefix = `bk315-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: projects, error: projectsError } = await db
      .from('projects')
      .insert([
        { workspace_id: writer.workspace_id, slug: `${prefix}-empty`, name: `${prefix} empty` },
        { workspace_id: writer.workspace_id, slug: `${prefix}-full`, name: `${prefix} full` },
        { workspace_id: writer.workspace_id, slug: `${prefix}-overcap`, name: `${prefix} overcap` },
      ])
      .select('id, slug');
    if (projectsError) { throw projectsError; }
    const emptyProjectId = (projects ?? []).find(p => (p.slug as string).endsWith('-empty'))!.id as string;
    const populatedProjectId = (projects ?? []).find(p => (p.slug as string).endsWith('-full'))!.id as string;
    const overCapProjectId = (projects ?? []).find(p => (p.slug as string).endsWith('-overcap'))!.id as string;
    createdProjectIds.push(emptyProjectId, populatedProjectId, overCapProjectId);

    const { data: userStoryModule, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: populatedProjectId, path: 'checkout', name: 'Checkout' })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    const { data: userStory, error: storyError } = await db
      .from('user_stories')
      .insert({ module_id: userStoryModule.id, title: `${prefix} story` })
      .select('id')
      .single();
    if (storyError) { throw storyError; }

    // Special-character ATC (comma + quote in the title, a tag whose own text
    // has a comma) — proves the live route delegates to the escaping rules
    // `csv-export.test.ts` already covers, end to end, not just their inputs.
    const { error: atcError } = await db
      .from('atcs')
      .insert({
        project_id: populatedProjectId,
        module_id: userStoryModule.id,
        user_story_id: userStory.id,
        slug: `${prefix}-atc`,
        title: 'Order "fails", edge-case',
        layer: 'UI',
        version: 1,
        status: 'unrun',
        tags: ['urgent, blocker'],
      });
    if (atcError) { throw atcError; }

    // BK-637 defect 2 — a Project whose module set is one row PAST PostgREST's
    // `db-max-rows` cap, with its only ATC deliberately attached to a module
    // that sorts past that cap by id. An unpaged `select` on `modules` returns
    // the first 1000 rows with HTTP 200 and no error, so `modulePathById` is
    // missing exactly this module and the export 500s for this Project on
    // every attempt. Seeded against the real database because the cap is
    // enforced by PostgREST, not by any code a mock could stand in for.
    const overCapModuleRows = Array.from({ length: ATCS_EXPORT_PAGE_SIZE + 1 }, (_, i) => ({
      project_id: overCapProjectId,
      path: `mod-${String(i).padStart(5, '0')}`,
      name: `Module ${i}`,
    }));
    const { error: overCapModulesError } = await db.from('modules').insert(overCapModuleRows);
    if (overCapModulesError) { throw overCapModulesError; }

    // Module ids are random UUIDs, so "past the cap" is only knowable by
    // reading back in the same `order('id')` the route pages on.
    const { data: pastCapModules, error: pastCapError } = await db
      .from('modules')
      .select('id, path')
      .eq('project_id', overCapProjectId)
      .order('id', { ascending: true })
      .range(ATCS_EXPORT_PAGE_SIZE, ATCS_EXPORT_PAGE_SIZE);
    if (pastCapError) { throw pastCapError; }
    const pastCapModule = requirePrecondition(
      (pastCapModules ?? [])[0],
      `expected a module at index ${ATCS_EXPORT_PAGE_SIZE} of the over-cap Project`,
    );

    const { data: overCapStory, error: overCapStoryError } = await db
      .from('user_stories')
      .insert({ module_id: pastCapModule.id, title: `${prefix} overcap story` })
      .select('id')
      .single();
    if (overCapStoryError) { throw overCapStoryError; }

    const { error: overCapAtcError } = await db
      .from('atcs')
      .insert({
        project_id: overCapProjectId,
        module_id: pastCapModule.id,
        user_story_id: overCapStory.id,
        slug: `${prefix}-overcap-atc`,
        title: 'Exports even past the module row cap',
        layer: 'API',
        version: 1,
        status: 'unrun',
        tags: [],
      });
    if (overCapAtcError) { throw overCapAtcError; }

    const pat = await mintPat({
      admin: db,
      userId: writer.user_id,
      name: 'bk315-export-regression',
      scopes: ['atc:read'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);

    fixture = {
      emptyProjectId,
      populatedProjectId,
      projectSlug: `${prefix}-full`,
      token: pat.token,
      foreignProjectId,
      overCapProjectId,
      overCapModulePath: pastCapModule.path as string,
    };
  });

  afterAll(async () => {
    if (createdProjectIds.length === 0) { return; }
    const db = service();
    const { error } = await db.from('projects').delete().in('id', createdProjectIds);
    if (error) { throw error; }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
  });

  it('returns a header-only CSV for a Project with zero ATCs (AC2.1/2.2)', async () => {
    const { emptyProjectId, token } = requirePrecondition(fixture, 'fixture setup failed — see beforeAll');
    const response = await GET(exportRequest(emptyProjectId, token));
    const bytes = await bodyBytes(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(bytes.slice(0, 3)).toEqual(UTF8_BOM_BYTES);
    expect(new TextDecoder().decode(new Uint8Array(bytes.slice(3)))).toBe('ATC ID,Slug,Title,Module,Layer,Tags,Status\r\n');
  });

  it('returns one row per ATC with escaped Title/Tags and Content-Disposition (AC1.1, AC4.0, AC4.4)', async () => {
    const { populatedProjectId, projectSlug, token } = requirePrecondition(fixture, 'fixture setup failed — see beforeAll');
    const response = await GET(exportRequest(populatedProjectId, token));
    const bytes = await bodyBytes(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${projectSlug}-atcs.csv"`);
    expect(bytes.slice(0, 3)).toEqual(UTF8_BOM_BYTES);
    const lines = new TextDecoder().decode(new Uint8Array(bytes.slice(3))).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Order ""fails"", edge-case"');
    expect(lines[1]).toContain('"urgent, blocker"');
    expect(lines[1]).toContain(',checkout,UI,');
  });

  it(`exports a Project with more than ${ATCS_EXPORT_PAGE_SIZE} modules instead of 500ing (BK-637 defect 2)`, async () => {
    const { overCapProjectId, overCapModulePath, token } = requirePrecondition(fixture, 'fixture setup failed — see beforeAll');
    const response = await GET(exportRequest(overCapProjectId, token));
    const body = await response.text();

    expect(response.status).toBe(200);
    const lines = body.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`,${overCapModulePath},API,`);
  });

  it('returns the identical 404 not_found for a nonexistent Project id (AC3.2)', async () => {
    const { token } = requirePrecondition(fixture, 'fixture setup failed — see beforeAll');
    const response = await GET(exportRequest(NONEXISTENT_PROJECT_ID, token));
    const body = await response.json() as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe('not_found');
    expect(body.error?.details?.reason).toBe('not_found');
  });

  it('returns the identical 404 for a Project in a workspace the caller is not a member of (AC3.1)', async () => {
    const { token, foreignProjectId } = requirePrecondition(fixture, 'fixture setup failed — see beforeAll');
    const projectId = requirePrecondition(
      foreignProjectId,
      'need a Project outside the writer\'s workspace to exercise the foreign-workspace 404 (AC3.1)',
    );
    const response = await GET(exportRequest(projectId, token));
    const body = await response.json() as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe('not_found');
  });

  it('malformed {id} 400s (bad_request), never reaching the DB read', async () => {
    const { token } = requirePrecondition(fixture, 'fixture setup failed — see beforeAll');
    const response = await GET(exportRequest('not-a-uuid', token));
    const body = await response.json() as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe('bad_request');
  });
});
