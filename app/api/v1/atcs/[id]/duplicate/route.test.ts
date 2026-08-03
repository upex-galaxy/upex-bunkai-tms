import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// The route imports `@lib/supabase/admin` (server-only) and `lib/api/pat`
// pulls in the same sentinel transitively; shim it so the module graph loads
// under Bun, then import the REAL exported `POST` handler. Same convention as
// `app/api/v1/auth/resend/route.test.ts` (BK-181) and
// `lib/api/auth-coexistence.test.ts`.
void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

// BK-184 — "ATC Library: Duplicate: API field name mismatch — spec says
// new_title, implementation reads title". POST /api/v1/atcs/{id}/duplicate
// returned 201 with the body's title silently ignored: the route/schema read
// `title`, but FR-014 (.context/SRS/functional-specs.md) and BK-23's AC3
// ("Provide a custom title for the duplicate") both document the field as
// `new_title`. A caller following the spec always got the default
// "<source> (copy)" title, with no error signal.
//
// This exercises the REAL exported `POST` handler end-to-end (real Bearer PAT
// via `mintPat`, real Zod schema, real `bunkai_duplicate_atc` RPC through the
// admin client — the exact path the route uses), not a mocked stand-in.
// Sibling coverage: `lib/atcs/duplicate-validation.test.ts` (schema unit
// tests) and `lib/atcs/duplicate-rpc.test.ts` (DB RPC layer — untouched by
// this fix; the RPC's own `p_title` parameter name is an internal detail, not
// part of the public HTTP contract).
//
// DB-dependent + env-gated, same style as `duplicate-rpc.test.ts`: skips
// entirely when the Supabase env is absent (CI without DB creds); when the
// env IS present but no writable seed ATC exists, fails loudly rather than
// passing silently.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[duplicate route] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

type Db = ReturnType<typeof service>;

// Same writable-source lookup as duplicate-rpc.test.ts: an ATC whose
// workspace has an active member with role >= member, and that carries at
// least one step (the RPC requires a non-empty source).
async function findWritableSource(db: Db) {
  const { data: atcs } = await db.from('atcs').select('id, project_id, title').is('archived_at', null);
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
    const { count } = await db.from('atc_steps').select('atc_id', { count: 'exact', head: true }).eq('atc_id', atc.id);
    if ((count ?? 0) >= 1) {
      return { actorUserId: actor.user_id, sourceAtcId: atc.id, sourceTitle: atc.title };
    }
  }
  return null;
}

function duplicateRequest(sourceAtcId: string, token: string, body: unknown): NextRequest {
  return new NextRequest(`https://app.test/api/v1/atcs/${sourceAtcId}/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

interface DuplicateSuccessBody { atc?: { id?: string, title?: string } }
interface ErrorBody { error?: { code?: string, message?: string } }

describeOrSkip('BK-184 — POST /api/v1/atcs/{id}/duplicate honors a supplied new_title', () => {
  const createdAtcIds: string[] = [];
  const createdTokenIds: string[] = [];

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

  it('creates the duplicate with the exact new_title from the request body, not the default "(copy)" title', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable source ATC with ≥1 step');

    const pat = await mintPat({
      admin: db,
      userId: seed.actorUserId,
      name: 'bk184-duplicate-regression',
      scopes: ['atc:write'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);

    const customTitle = `BK-184 Custom Title ${Date.now()}`;
    const response = await POST(duplicateRequest(seed.sourceAtcId, pat.token, { new_title: customTitle }));
    const body = await response.json() as DuplicateSuccessBody & ErrorBody;

    expect(response.status).toBe(201);
    expect(body.error).toBeUndefined();
    if (body.atc?.id) { createdAtcIds.push(body.atc.id); }

    // The original bug: this used to equal `${seed.sourceTitle} (copy)`
    // (the default) because the route read the nonexistent `title` key and
    // silently fell back — no error, no signal, the supplied title vanished.
    expect(body.atc?.title).toBe(customTitle);
    expect(body.atc?.title).not.toBe(`${seed.sourceTitle} (copy)`);
  });

  it('still defaults to "<source> (copy)" when new_title is omitted — unaffected by the fix', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable source ATC with ≥1 step');

    const pat = await mintPat({
      admin: db,
      userId: seed.actorUserId,
      name: 'bk184-duplicate-default-regression',
      scopes: ['atc:write'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);

    const response = await POST(duplicateRequest(seed.sourceAtcId, pat.token, {}));
    const body = await response.json() as DuplicateSuccessBody & ErrorBody;

    expect(response.status).toBe(201);
    if (body.atc?.id) { createdAtcIds.push(body.atc.id); }
    expect(body.atc?.title).toBe(`${seed.sourceTitle} (copy)`);
  });
});
