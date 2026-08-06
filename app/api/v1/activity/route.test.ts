import type { ApiErrorCode } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ACTIVITY_ALLOWED_ACTIONS } from '@lib/activity/constants';
import { decodeActivityCursor } from '@lib/activity/history-validation';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import {
  buildActivityItem,
  deriveItemLabel,
  fetchActivityPage,
  mapActivityRpcError,
  resolveActivityWorkspaceId,
} from './response';

// BK-49 (Slice 2: API) — GET /api/v1/activity. The route itself is a thin
// `withApiHandler` wrapper (no dedicated test harness for mocking
// NextRequest/ctx exists in this repo — same convention noted in
// `workspaces/[id]/membership/route.test.ts`); every branch that needs
// coverage lives in the pure/DB-parametrized functions in `./response.ts`,
// tested directly with the fake-chainable-`db` + throwing-`NEVER_DB` style
// `lib/api/pat.test.ts` established. The one exception is Risk R2
// (implementation-plan.md): "route uses `principal.db`, never
// `createAdminClient()`" is checked with a static source-text assertion
// below, since that risk is specifically about what `route.ts` imports and
// calls, not about `response.ts`'s testable functions.

const WS = '11111111-1111-1111-1111-111111111111';
const FOREIGN_WS = '99999999-9999-9999-9999-999999999999';
const USER_A = '22222222-2222-2222-2222-222222222222';
const USER_B = '33333333-3333-3333-3333-333333333333';
const ROW_1 = '44444444-4444-4444-4444-444444444444';
const ROW_2 = '55555555-5555-5555-5555-555555555555';

interface RpcResult { data: unknown, error: { code?: string, message: string } | null }
interface RpcCall { fn: string, args: unknown }

// db that throws if it is ever consulted — proves a code path short-circuits
// before touching the database (mirrors `lib/api/pat.test.ts`'s NEVER_DB).
const NEVER_DB = {
  from() { throw new Error('db.from must not be called on this path'); },
  rpc() { throw new Error('db.rpc must not be called on this path'); },
} as unknown as SupabaseClient<Database>;

// Minimal stand-in for the `db.from('workspaces').select('id').order(...)`
// chain `resolveActivityWorkspaceId`'s cookie-fallback branch calls.
function fakeWorkspacesDb(workspaceIds: string[]): SupabaseClient<Database> {
  const chain = {
    select: () => chain,
    order: async () => ({ data: workspaceIds.map(id => ({ id })), error: null }),
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

// Records every `db.rpc(fn, args)` call and answers with the configured
// fixture per function name — the seam `fetchActivityPage` calls through.
function fakeRpcDb(
  responses: { list?: RpcResult, resolve?: RpcResult },
  calls: RpcCall[] = [],
): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === 'bunkai_list_activity') {
        return responses.list ?? { data: null, error: { message: 'unconfigured: bunkai_list_activity' } };
      }
      if (fn === 'bunkai_resolve_activity_actors') {
        return responses.resolve ?? { data: null, error: { message: 'unconfigured: bunkai_resolve_activity_actors' } };
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe('resolveActivityWorkspaceId (API design step 2)', () => {
  it('an explicit workspace_id wins and never touches the db', async () => {
    const resolved = await resolveActivityWorkspaceId(NEVER_DB, {
      explicitWorkspaceId: WS,
      principal: { via: 'cookie' },
      cookieActiveWorkspaceId: null,
    });
    expect(resolved).toBe(WS);
  });

  it('a cookie session with no explicit value falls back to the active-workspace cookie', async () => {
    const db = fakeWorkspacesDb([WS, FOREIGN_WS]);
    const resolved = await resolveActivityWorkspaceId(db, {
      explicitWorkspaceId: null,
      principal: { via: 'cookie' },
      cookieActiveWorkspaceId: FOREIGN_WS,
    });
    expect(resolved).toBe(FOREIGN_WS);
  });

  it('a cookie session with no explicit value and no valid cookie falls back to the oldest visible workspace', async () => {
    const db = fakeWorkspacesDb([WS, FOREIGN_WS]);
    const resolved = await resolveActivityWorkspaceId(db, {
      explicitWorkspaceId: null,
      principal: { via: 'cookie' },
      cookieActiveWorkspaceId: null,
    });
    expect(resolved).toBe(WS);
  });

  it('a cookie session with zero visible workspaces throws validation_failed (422)', async () => {
    const db = fakeWorkspacesDb([]);
    await expectApiError(
      resolveActivityWorkspaceId(db, { explicitWorkspaceId: null, principal: { via: 'cookie' }, cookieActiveWorkspaceId: null }),
      'validation_failed',
      422,
    );
  });

  it('a Bearer/PAT caller with no explicit workspace_id is rejected WITHOUT ever querying the db (missing-workspace-for-PAT → 422)', async () => {
    await expectApiError(
      resolveActivityWorkspaceId(NEVER_DB, { explicitWorkspaceId: null, principal: { via: 'bearer' }, cookieActiveWorkspaceId: null }),
      'validation_failed',
      422,
    );
  });
});

describe('mapActivityRpcError', () => {
  it('maps activity_cursor_invalid (45214) to 400 bad_request', () => {
    try {
      mapActivityRpcError({ code: '45214', message: 'activity_cursor_invalid' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('bad_request');
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).details).toEqual({ reason: 'activity_cursor_invalid' });
    }
  });

  it('maps not_workspace_member (42501) to 403 forbidden', () => {
    try {
      mapActivityRpcError({ code: '42501', message: 'not_workspace_member' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('forbidden');
      expect((err as ApiError).status).toBe(403);
    }
  });

  it('maps an unrecognized error code to 500 internal_error', () => {
    try {
      mapActivityRpcError({ code: '99999', message: 'boom' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('internal_error');
      expect((err as ApiError).status).toBe(500);
    }
  });
});

describe('deriveItemLabel / buildActivityItem (payload projection table)', () => {
  it('module.renamed uses payload.name', () => {
    expect(deriveItemLabel({ action: 'module.renamed', entity_type: 'module', payload: { name: 'Checkout', new_path: '/checkout' } })).toBe('Checkout');
  });

  it('module.renamed falls back to "a module" when name is missing (AC1 1.5 safe fallback)', () => {
    expect(deriveItemLabel({ action: 'module.renamed', entity_type: 'module', payload: {} })).toBe('a module');
  });

  it('module.moved uses payload.new_path', () => {
    expect(deriveItemLabel({ action: 'module.moved', entity_type: 'module', payload: { new_path: '/new/path' } })).toBe('/new/path');
  });

  it('atc.created uses payload.title', () => {
    expect(deriveItemLabel({ action: 'atc.created', entity_type: 'atc', payload: { title: 'Login succeeds' } })).toBe('Login succeeds');
  });

  it('test.created uses payload.title', () => {
    expect(deriveItemLabel({ action: 'test.created', entity_type: 'test', payload: { title: 'Smoke suite' } })).toBe('Smoke suite');
  });

  it('module.description_updated always falls back generic (source payload is always {})', () => {
    expect(deriveItemLabel({ action: 'module.description_updated', entity_type: 'module', payload: {} })).toBe('a module');
  });

  it('module.archived falls back generic', () => {
    expect(deriveItemLabel({ action: 'module.archived', entity_type: 'module', payload: { modules: 2, atcs: 5 } })).toBe('a module');
  });

  it('run.finished falls back generic', () => {
    expect(deriveItemLabel({ action: 'run.finished', entity_type: 'run', payload: { verdict: 'passed' } })).toBe('a run');
  });

  it('run.aborted falls back generic', () => {
    expect(deriveItemLabel({ action: 'run.aborted', entity_type: 'run', payload: { skipped_steps: 1 } })).toBe('a run');
  });

  it('buildActivityItem populates action_label from ACTION_LABELS and passes payload through unchanged', () => {
    const item = buildActivityItem({
      row: {
        id: ROW_1,
        entity_type: 'atc',
        entity_id: 'aa000000-0000-0000-0000-000000000000',
        action: 'atc.created',
        actor_user_id: USER_A,
        created_at: '2026-07-29T11:52:00+00:00',
        payload: { title: 'Login succeeds' },
      },
      actorEmail: 'alice@example.com',
      assigneeEmail: null,
    });
    expect(item.action_label).toBe('created an ATC');
    expect(item.actor).toEqual({ user_id: USER_A, email: 'alice@example.com' });
    expect(item.item).toEqual({ label: 'Login succeeds', entity_id: 'aa000000-0000-0000-0000-000000000000' });
    expect(item.payload).toEqual({ title: 'Login succeeds' });
  });

  it('buildActivityItem never surfaces an email when actor_user_id is null, even if one was passed in by mistake', () => {
    const item = buildActivityItem({
      row: {
        id: ROW_1,
        entity_type: 'module',
        entity_id: null,
        action: 'module.archived',
        actor_user_id: null,
        created_at: '2026-07-29T11:52:00+00:00',
        payload: {},
      },
      actorEmail: 'should-not-appear@example.com',
      assigneeEmail: null,
    });
    expect(item.actor).toEqual({ user_id: null, email: null });
  });

  // BK-264 (Slice 4) — the 4 Bug-triage actions' dynamic action_label,
  // exercised at this layer (not just `resolveActionLabel` in isolation) so
  // the assignee-email wiring through `buildActivityItem`'s object param is
  // covered too.
  it('buildActivityItem renders bug.assigned with the resolved assignee email', () => {
    const item = buildActivityItem({
      row: {
        id: ROW_1,
        entity_type: 'bug',
        entity_id: 'cc000000-0000-0000-0000-000000000000',
        action: 'bug.assigned',
        actor_user_id: USER_A,
        created_at: '2026-08-03T11:52:00+00:00',
        payload: { previous_assignee_user_id: null, assignee_user_id: USER_B },
      },
      actorEmail: 'mateo.silva@example.com',
      assigneeEmail: 'sara.iglesias@example.com',
    });
    expect(item.action_label).toBe('assigned this defect to sara.iglesias@example.com');
  });

  it('buildActivityItem renders bug.status_changed to "closed" with the AC\'s special-cased copy, never "moved this defect to closed"', () => {
    const item = buildActivityItem({
      row: {
        id: ROW_1,
        entity_type: 'bug',
        entity_id: 'cc000000-0000-0000-0000-000000000000',
        action: 'bug.status_changed',
        actor_user_id: USER_A,
        created_at: '2026-08-03T11:52:00+00:00',
        payload: { previous_status: 'resolved', status: 'closed', assignee_user_id: USER_B },
      },
      actorEmail: 'elena.vargas@example.com',
      assigneeEmail: null,
    });
    expect(item.action_label).toBe('closed this defect');
  });
});

describe('fetchActivityPage (API design steps 4-6)', () => {
  it('cross-workspace isolation: a foreign workspace_id\'s RLS-emptied result stays an empty 200, and the actor resolver is never called', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({ list: { data: { items: [], next_cursor: null }, error: null } }, calls);

    const page = await fetchActivityPage(db, {
      workspaceId: FOREIGN_WS,
      limit: 30,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page).toEqual({ items: [], next_cursor: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('bunkai_list_activity');
  });

  it('always passes the full MVP allowlist explicitly (Decision 2) — never a caller-supplied or partial set', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({ list: { data: { items: [], next_cursor: null }, error: null } }, calls);

    await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    const args = calls[0].args as { p_actions: string[] };
    expect(args.p_actions).toEqual([...ACTIVITY_ALLOWED_ACTIONS]);
  });

  it('forwards limit and cursor to the RPC call args unchanged', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({ list: { data: { items: [], next_cursor: null }, error: null } }, calls);

    await fetchActivityPage(db, {
      workspaceId: WS,
      limit: 17,
      cursorCreatedAt: '2026-07-29T11:52:00+00:00',
      cursorId: ROW_1,
    });

    const args = calls[0].args as { p_workspace_id: string, p_limit: number, p_cursor_created_at: string, p_cursor_id: string };
    expect(args.p_workspace_id).toBe(WS);
    expect(args.p_limit).toBe(17);
    expect(args.p_cursor_created_at).toBe('2026-07-29T11:52:00+00:00');
    expect(args.p_cursor_id).toBe(ROW_1);
  });

  it('pagination boundary: a non-null next_cursor from the RPC round-trips through the opaque wire token', async () => {
    const db = fakeRpcDb({
      list: {
        data: { items: [], next_cursor: { created_at: '2026-07-29T11:52:00+00:00', id: ROW_2 } },
        error: null,
      },
    });

    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    expect(page.next_cursor).not.toBeNull();
    const decoded = decodeActivityCursor(page.next_cursor!);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.createdAt).toBe('2026-07-29T11:52:00+00:00');
      expect(decoded.cursor.id).toBe(ROW_2);
    }
  });

  it('pagination boundary: a null next_cursor (last page) stays null on the wire', async () => {
    const db = fakeRpcDb({ list: { data: { items: [], next_cursor: null }, error: null } });
    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });
    expect(page.next_cursor).toBeNull();
  });

  it('batch-resolves distinct non-null actor ids in one call and maps emails back onto each row', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({
      list: {
        data: {
          items: [
            { id: ROW_1, entity_type: 'atc', entity_id: null, action: 'atc.created', actor_user_id: USER_A, created_at: '2026-07-29T11:52:01+00:00', payload: { title: 'A' } },
            { id: ROW_2, entity_type: 'atc', entity_id: null, action: 'atc.created', actor_user_id: USER_A, created_at: '2026-07-29T11:52:00+00:00', payload: { title: 'B' } },
          ],
          next_cursor: null,
        },
        error: null,
      },
      resolve: { data: [{ user_id: USER_A, email: 'alice@example.com' }], error: null },
    }, calls);

    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    const resolveCalls = calls.filter(c => c.fn === 'bunkai_resolve_activity_actors');
    expect(resolveCalls).toHaveLength(1);
    expect((resolveCalls[0].args as { p_user_ids: string[] }).p_user_ids).toEqual([USER_A]);
    expect(page.items.every(item => item.actor.email === 'alice@example.com')).toBe(true);
  });

  // BK-264 (Slice 4) — a bug.assigned row's assignee_user_id must join the
  // SAME resolver batch as actor_user_id (ADR-0011: one resolver, one call),
  // never a second RPC round-trip.
  it('folds a bug.assigned row\'s assignee_user_id into the SAME actor-resolver batch, in one call', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({
      list: {
        data: {
          items: [
            {
              id: ROW_1,
              entity_type: 'bug',
              entity_id: 'cc000000-0000-0000-0000-000000000000',
              action: 'bug.assigned',
              actor_user_id: USER_A,
              created_at: '2026-08-03T11:52:00+00:00',
              payload: { previous_assignee_user_id: null, assignee_user_id: USER_B },
            },
          ],
          next_cursor: null,
        },
        error: null,
      },
      resolve: { data: [{ user_id: USER_A, email: 'mateo.silva@example.com' }, { user_id: USER_B, email: 'sara.iglesias@example.com' }], error: null },
    }, calls);

    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    const resolveCalls = calls.filter(c => c.fn === 'bunkai_resolve_activity_actors');
    expect(resolveCalls).toHaveLength(1);
    expect((resolveCalls[0].args as { p_user_ids: string[] }).p_user_ids).toEqual([USER_A, USER_B]);
    expect(page.items[0].actor.email).toBe('mateo.silva@example.com');
    expect(page.items[0].action_label).toBe('assigned this defect to sara.iglesias@example.com');
  });

  it('skips the actor-resolver RPC entirely when every row has a null actor', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({
      list: {
        data: {
          items: [{ id: ROW_1, entity_type: 'module', entity_id: null, action: 'module.archived', actor_user_id: null, created_at: '2026-07-29T11:52:00+00:00', payload: {} }],
          next_cursor: null,
        },
        error: null,
      },
    }, calls);

    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    expect(calls.some(c => c.fn === 'bunkai_resolve_activity_actors')).toBe(false);
    expect(page.items[0].actor).toEqual({ user_id: null, email: null });
  });

  it('resolves an actor missing from the actor-resolver response to a safe null email (never a crash)', async () => {
    const db = fakeRpcDb({
      list: {
        data: {
          items: [{ id: ROW_1, entity_type: 'atc', entity_id: null, action: 'atc.created', actor_user_id: USER_B, created_at: '2026-07-29T11:52:00+00:00', payload: { title: 'X' } }],
          next_cursor: null,
        },
        error: null,
      },
      // The resolver returns zero rows (e.g. a departed user) — the route must
      // not throw, must fall back to `email: null`.
      resolve: { data: [], error: null },
    });

    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });
    expect(page.items[0].actor).toEqual({ user_id: USER_B, email: null });
  });

  it('run.aborted.reason is absent from the response body (Risk R3) — the RPC\'s real projection carries skipped_steps only', async () => {
    const db = fakeRpcDb({
      list: {
        data: {
          items: [{
            id: ROW_1,
            entity_type: 'run',
            entity_id: 'bb000000-0000-0000-0000-000000000000',
            action: 'run.aborted',
            actor_user_id: USER_A,
            created_at: '2026-07-29T11:52:00+00:00',
            // Exactly what migration 0045_activity_stream.sql's `case (action)`
            // projects for run.aborted — `reason` is never selected there.
            payload: { skipped_steps: 2 },
          }],
          next_cursor: null,
        },
        error: null,
      },
      resolve: { data: [{ user_id: USER_A, email: 'alice@example.com' }], error: null },
    });

    const page = await fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    expect(Object.keys(page.items[0].payload).sort()).toEqual(['skipped_steps']);
    expect(JSON.stringify(page)).not.toMatch(/reason/i);
  });

  it('propagates a bunkai_list_activity RPC error through mapActivityRpcError', async () => {
    const db = fakeRpcDb({ list: { data: null, error: { code: '45214', message: 'activity_cursor_invalid' } } });
    await expectApiError(
      fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null }),
      'bad_request',
      400,
    );
  });

  it('propagates a bunkai_resolve_activity_actors RPC error through mapActivityRpcError', async () => {
    const db = fakeRpcDb({
      list: {
        data: {
          items: [{ id: ROW_1, entity_type: 'atc', entity_id: null, action: 'atc.created', actor_user_id: USER_A, created_at: '2026-07-29T11:52:00+00:00', payload: { title: 'A' } }],
          next_cursor: null,
        },
        error: null,
      },
      resolve: { data: null, error: { code: '42501', message: 'not_workspace_member' } },
    });
    await expectApiError(
      fetchActivityPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null }),
      'forbidden',
      403,
    );
  });
});

describe('route.ts source guard (Risk R2 — admin-client route regression)', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf-8');

  it('never imports lib/supabase/admin — the caller\'s own principal.db (getAuth) is the ONLY Supabase client this route may construct', () => {
    // A structural check, not a string-ban: the route's own comment
    // legitimately DISCUSSES createAdminClient (why not to use it here), so
    // asserting on the import path — the only way the symbol could actually
    // reach a call site — is the precise regression guard, not a substring
    // match that would also flag the explanatory comment.
    expect(source).not.toMatch(/@lib\/supabase\/admin/);
  });

  it('obtains its Supabase client from getAuth(ctx), not a fresh client construction', () => {
    expect(source).toMatch(/getAuth\(ctx\)/);
    expect(source).toMatch(/\{\s*principal,\s*db\s*\}\s*=\s*getAuth\(ctx\)/);
  });
});

async function expectApiError(promise: Promise<unknown>, code: ApiErrorCode, status: number): Promise<void> {
  try {
    await promise;
    throw new Error('expected an ApiError but none was thrown');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    expect((err as ApiError).status).toBe(status);
  }
}
