import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

void mock.module('server-only', () => ({}));

// BK-248 — `POST /api/v1/tests` returned an opaque 500 "Idempotency insert
// failed" whenever the caller-supplied `workspace_id` did not reference an
// existing workspace: `beginIdempotentRequest`'s insert error branch only
// special-cased the unique-constraint violation (23505, a genuine concurrent
// retry) and mapped every OTHER Postgres error to a generic `internal_error`
// — including a foreign-key violation on `idempotency_keys.workspace_id`
// (23503), which is a client input mistake, not a server fault. The fix maps
// that specific FK violation to `validation_failed` instead. This suite also
// covers the pre-existing lifecycle (replay / conflict / reclaim) that had
// zero test coverage before this ticket.
//
// DB-integration, service-role only — no session is obtained and no identity
// is impersonated (`live-ui-identity.md` §3 does not apply: §3 governs
// obtaining a session or driving the live app, neither of which happens
// here — this middleware always runs with the service-role client in
// production too, and every user_id/workspace_id below is either a real
// seeded `workspace_members` row from this environment's own test fixtures,
// used purely as an FK value, or a deliberately nonexistent uuid; nothing
// here establishes a session or acts "as" that user). Gated on env
// presence; skips loudly (not silently) when unavailable.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasServiceEnv = Boolean(url && serviceKey);
const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const PREFIX = `bk248-idempotency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ENDPOINT = `${PREFIX}::POST /api/v1/tests`;
const NONEXISTENT_WORKSPACE_UUID = '00000000-0000-0000-0000-00000000bad1';

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// `.rejects.toMatchObject` does not deep-compare an `ApiError` instance's own
// properties reliably in bun:test — assert on the caught error directly.
async function expectApiError(
  promise: Promise<unknown>,
  expected: { code: string, status: number, message?: string },
): Promise<void> {
  try {
    await promise;
    throw new Error('expected promise to reject');
  }
  catch (err) {
    expect((err as { code?: string }).code).toBe(expected.code);
    expect((err as { status?: number }).status).toBe(expected.status);
    if (expected.message !== undefined) {
      expect((err as Error).message).toBe(expected.message);
    }
  }
}

interface MemberRow { user_id: string, workspace_id: string }

let fixture: { userId: string, workspaceId: string } | null = null;
let skipReason: string | null = null;

describeOrSkip('beginIdempotentRequest (BK-248)', () => {
  beforeAll(async () => {
    const db = service();
    const { data: members, error } = await db
      .from('workspace_members')
      .select('user_id, workspace_id')
      .eq('status', 'active')
      .limit(1);
    if (error) { throw error; }
    const anchor = (members as MemberRow[] | null)?.[0];
    if (!anchor) {
      skipReason = 'need at least one active workspace member (seed state).';
      return;
    }
    fixture = { userId: anchor.user_id, workspaceId: anchor.workspace_id };
  });

  afterAll(async () => {
    const db = service();
    await db.from('idempotency_keys').delete().like('endpoint', `${PREFIX}%`);
    // Also reap orphans from a PRIOR run of this suite that crashed before
    // its own afterAll ran (each run mints a fresh PREFIX, so a crash leaves
    // rows no later run's exact-prefix delete above will ever revisit). Age
    // gate keeps this from ever touching another CONCURRENTLY running
    // invocation's still-in-progress rows.
    await db
      .from('idempotency_keys')
      .delete()
      .like('endpoint', '%bk248-idempotency-%')
      .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  });

  it('first-time insert with a nonexistent workspace_id returns validation_failed, not internal_error', async () => {
    if (!fixture) { return warn(); }
    const { beginIdempotentRequest } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-bad-workspace` });

    await expectApiError(beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: NONEXISTENT_WORKSPACE_UUID,
      requestPayload: { title: 'x' },
    }), {
      code: 'validation_failed',
      status: 422,
      message: 'workspace_id does not reference an existing workspace.',
    });
  });

  it('first-time insert with a valid workspace_id succeeds', async () => {
    if (!fixture) { return warn(); }
    const { beginIdempotentRequest } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-happy` });

    const result = await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: { title: 'happy path' },
    });
    expect(result.isReplay).toBe(false);
  });

  it('a replay (same key + same payload, already succeeded) returns the stored snapshot', async () => {
    // Explicit timeout: 4 sequential round trips against a live, shared
    // Supabase project also serving other concurrent sessions — bun:test's
    // 5000ms default has held with margin in practice, but this test (and
    // the reclaim test below) are the two most round-trip-heavy in the
    // suite, so a wider margin costs nothing and avoids an occasional flake
    // under load rather than a real regression.
    if (!fixture) { return warn(); }
    const { beginIdempotentRequest, recordIdempotencyResult } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-replay` });
    const payload = { title: 'replay case' };

    const first = await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: payload,
    });
    if (first.isReplay) { throw new Error('expected first call to be a fresh insert'); }
    await recordIdempotencyResult(first.token, { test: { id: 'fake' } }, 201);

    const second = await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: payload,
    });
    expect(second.isReplay).toBe(true);
    if (!second.isReplay) { throw new Error('expected replay'); }
    expect(second.status).toBe(201);
    expect(second.snapshot).toEqual({ test: { id: 'fake' } });
  }, 15000);

  it('the same key reused with a DIFFERENT payload returns conflict', async () => {
    if (!fixture) { return warn(); }
    const { beginIdempotentRequest } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-mismatch` });

    await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: { title: 'version A' },
    });

    await expectApiError(beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: { title: 'version B' },
    }), { code: 'conflict', status: 409 });
  });

  it('a pending row (same key + same payload) returns conflict — in flight', async () => {
    if (!fixture) { return warn(); }
    const { beginIdempotentRequest } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-pending` });
    const payload = { title: 'still in flight' };

    await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: payload,
    });

    await expectApiError(beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: payload,
    }), { code: 'conflict', status: 409 });
  });

  it('a failed row (same key + same payload) is reclaimed for exactly one retry', async () => {
    if (!fixture) { return warn(); }
    const { beginIdempotentRequest, discardIdempotencyResult } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-retry` });
    const payload = { title: 'first attempt fails' };

    const first = await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: payload,
    });
    if (first.isReplay) { throw new Error('expected first call to be a fresh insert'); }
    await discardIdempotencyResult(first.token);

    const retry = await beginIdempotentRequest({
      headers,
      userId: fixture.userId,
      endpoint: ENDPOINT,
      workspaceId: fixture.workspaceId,
      requestPayload: payload,
    });
    expect(retry.isReplay).toBe(false);
  }, 15000);

  it('a nonexistent user_id still surfaces as internal_error (the fix is scoped to workspace_id, not every FK)', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    const headers = new Headers({ 'idempotency-key': `${PREFIX}-bad-user` });

    await expectApiError(beginIdempotentRequest({
      headers,
      userId: '00000000-0000-0000-0000-00000000bad2',
      endpoint: ENDPOINT,
      workspaceId: null,
      requestPayload: { title: 'x' },
    }), { code: 'internal_error', status: 500 });
  });
});

// The suite never fails on missing seed state — it says why and passes.
function warn() {
  console.warn(`[idempotency] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
