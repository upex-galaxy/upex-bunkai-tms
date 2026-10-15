import type { Principal } from '@lib/api/principal';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-371 — route-level coverage for GET / PUT /api/v1/projects/{id}/tracker-settings.
//
// Drives the REAL exported handlers (gateway capability gate, workspace-context
// match, the live-role gate, body validation, check-on-save, error mapping).
// Only the edges that would need a live session, a database or Jira are
// substituted, with `spyOn` on the module namespace (restored after every test)
// rather than `mock.module`, which is process-wide:
//
//   - `resolveIdentity`           -> a fixed principal
//   - `checkJiraDestination`      -> a scripted outcome (and a call counter)
//   - `createAdminClient`         -> a sentinel
//   - `upsertProjectTrackerSettings` -> a scripted RPC answer (and a call recorder)
//
// This file proves the ROUTE's behaviour. It is NOT evidence about the SQL: the
// function's behaviour is proven against the real database by
// lib/tracker-settings/tracker-settings-isolation.test.ts.

void mock.module('server-only', () => ({}));

const principalModule = await import('@lib/api/principal');
const checkModule = await import('@lib/jira/project-check');
const adminModule = await import('@lib/supabase/admin');
const rpcModule = await import('@lib/supabase/rpc');
const { GET, PUT } = await import('./route');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

interface ErrorBody {
  error: { code: string, message: string, details?: Record<string, unknown> }
}

interface DbScript {
  project: { id: string, workspace_id: string } | null
  role: string | null
  // Status of the caller's membership row. Defaults to 'active'; the fake only
  // answers the role read when the route filtered on a matching status.
  memberStatus?: string
  settings: { destination_project_key: string, issue_type_name: string, enabled: boolean, updated_at: string } | null
}

// Every `.eq()` filter the routes applied, by table, for the current test.
let eqLog: { table: string, column: string, value: unknown }[] = [];

// A caller-client double answering the three reads the routes make. Any other
// table throws, so a handler that wandered further fails loudly. The role read is
// answered ONLY when the route filtered on this user, this workspace and a status
// equal to the membership's status, so dropping a filter changes the outcome.
function fakeDb(script: DbScript): Principal['db'] {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const answerFor = (): unknown => {
        if (table === 'projects') { return script.project; }
        if (table === 'project_tracker_settings') { return script.settings; }
        if (table === 'workspace_members') {
          const matches = filters.user_id === USER_ID
            && filters.workspace_id === WORKSPACE_ID
            && filters.status === (script.memberStatus ?? 'active');
          return script.role === null || !matches ? null : { role: script.role };
        }
        throw new Error(`unexpected table access: ${table}`);
      };
      if (!['projects', 'project_tracker_settings', 'workspace_members'].includes(table)) {
        throw new Error(`unexpected table access: ${table}`);
      }
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: unknown) => {
        filters[column] = value;
        eqLog.push({ table, column, value });
        return chain;
      };
      chain.maybeSingle = async () => ({ data: answerFor(), error: null });
      return chain;
    },
  } as unknown as Principal['db'];
}

function principal(args: { via?: 'cookie' | 'bearer', scopes?: string[], workspaceId?: string | null, script: Partial<DbScript> }): Principal {
  return {
    userId: USER_ID,
    workspaceId: args.workspaceId ?? null,
    capabilities: args.scopes ?? ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'],
    via: args.via ?? 'cookie',
    tokenId: args.via === 'bearer' ? 'tok_test' : null,
    db: fakeDb({
      project: { id: PROJECT_ID, workspace_id: WORKSPACE_ID },
      role: 'admin',
      settings: null,
      ...args.script,
    }),
  };
}

function request(method: 'GET' | 'PUT', body?: unknown, rawBody?: string, id = PROJECT_ID): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${id}/tracker-settings`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const putBody = (overrides: Record<string, unknown> = {}) => ({
  destination_project_key: 'QAS',
  issue_type_name: 'Bug',
  enabled: false,
  ...overrides,
});

let spies: Mock<(...args: never[]) => unknown>[] = [];
let checkSpy: Mock<(...args: never[]) => unknown>;
let rpcSpy: Mock<(...args: never[]) => unknown>;
let adminSpy: Mock<(...args: never[]) => unknown>;
let rpcAnswer: { data: unknown, error: { code?: string, message: string } | null };
let checkAnswer: Awaited<ReturnType<typeof checkModule.checkJiraDestination>>;

function asPrincipal(p: Principal): void {
  spies.push(spyOn(principalModule, 'resolveIdentity').mockImplementation(async () => p) as never);
}

beforeEach(() => {
  spies = [];
  eqLog = [];
  rpcAnswer = {
    data: {
      project_id: PROJECT_ID,
      destination_project_key: 'QAS',
      issue_type_name: 'Bug',
      enabled: false,
      updated_at: '2026-10-15T10:00:00.000Z',
      requeued: 0,
    },
    error: null,
  };
  checkAnswer = { ok: true, issueTypeName: 'Bug' };
  checkSpy = spyOn(checkModule, 'checkJiraDestination').mockImplementation(async () => checkAnswer) as never;
  rpcSpy = spyOn(rpcModule, 'upsertProjectTrackerSettings').mockImplementation((async () => rpcAnswer) as never) as never;
  adminSpy = spyOn(adminModule, 'createAdminClient').mockImplementation((() => ({ sentinel: 'admin' })) as never) as never;
  spies.push(checkSpy, rpcSpy, adminSpy);
});

afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
});

function callArg(spy: Mock<(...args: never[]) => unknown>, call: number, index: number): unknown {
  return (spy.mock.calls[call] as unknown as unknown[])[index];
}

function lastRpcArgs(): Record<string, unknown> {
  return callArg(rpcSpy, rpcSpy.mock.calls.length - 1, 1) as Record<string, unknown>;
}

describe('GET tracker-settings', () => {
  test('answers the defaults for a Project that was never configured (AC-6.1)', async () => {
    asPrincipal(principal({ script: { settings: null } }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tracker_settings: { destination_project_key: null, issue_type_name: 'Bug', enabled: false, configured: false, updated_at: null },
    });
  });

  test('answers the stored values, to a viewer too (AC-4.3)', async () => {
    asPrincipal(principal({
      script: { role: 'viewer', settings: { destination_project_key: 'QAS', issue_type_name: 'Task', enabled: true, updated_at: '2026-10-15T09:00:00.000Z' } },
    }));
    const response = await GET(request('GET'));
    expect(await response.json()).toEqual({
      tracker_settings: { destination_project_key: 'QAS', issue_type_name: 'Task', enabled: true, configured: true, updated_at: '2026-10-15T09:00:00.000Z' },
    });
  });

  test('a Project RLS hides is the same 404 as a missing one (AC-4.4)', async () => {
    asPrincipal(principal({ script: { project: null } }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorBody).error.code).toBe('not_found');
  });

  test('a malformed project id is a 400', async () => {
    asPrincipal(principal({ script: {} }));
    expect((await GET(request('GET', undefined, undefined, 'not-a-uuid'))).status).toBe(400);
  });
});

describe('PUT tracker-settings: gates (no Jira call, no write before they pass)', () => {
  test('a Project RLS hides is a 404 and nothing runs (AC-4.4)', async () => {
    asPrincipal(principal({ script: { project: null } }));
    const response = await PUT(request('PUT', putBody({ enabled: true })));
    expect(response.status).toBe(404);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(adminSpy).not.toHaveBeenCalled();
  });

  test.each(['member', 'viewer'])('a %s is refused with 403 admin_required and nothing runs (AC-2.8 / 4.2)', async (role) => {
    asPrincipal(principal({ script: { role } }));
    const response = await PUT(request('PUT', putBody({ enabled: true })));
    expect(response.status).toBe(403);
    const body = await response.json() as ErrorBody;
    expect(body.error.details).toEqual({ reason: 'admin_required' });
    expect(body.error.message).toBe('You no longer have permission to change this. Reload to see the current settings.');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('the live-role read filters on this user, this workspace and an ACTIVE membership (F5)', async () => {
    asPrincipal(principal({ script: {} }));
    await PUT(request('PUT', putBody()));
    const roleFilters = eqLog.filter(entry => entry.table === 'workspace_members').map(entry => [entry.column, entry.value]);
    expect(roleFilters).toContainEqual(['user_id', USER_ID]);
    expect(roleFilters).toContainEqual(['workspace_id', WORKSPACE_ID]);
    expect(roleFilters).toContainEqual(['status', 'active']);
  });

  test('an admin whose membership is no longer active is refused, and nothing runs (F5)', async () => {
    asPrincipal(principal({ script: { role: 'admin', memberStatus: 'removed' } }));
    const response = await PUT(request('PUT', putBody({ enabled: true })));
    expect(response.status).toBe(403);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a caller with no active membership in the workspace is refused the same way', async () => {
    asPrincipal(principal({ script: { role: null } }));
    expect((await PUT(request('PUT', putBody()))).status).toBe(403);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test.each(['owner', 'admin'])('an %s reaches the write (AC-4.1)', async (role) => {
    asPrincipal(principal({ script: { role } }));
    expect((await PUT(request('PUT', putBody()))).status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  test('a PAT without workspace:admin is refused by the gateway (AC-4.7)', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['atc:read', 'atc:write'], workspaceId: WORKSPACE_ID, script: {} }));
    const response = await PUT(request('PUT', putBody()));
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.details).toMatchObject({ reason: 'missing_capability', required_capability: 'workspace:admin' });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a workspace:admin PAT of a MEMBER is refused by the live role check (AC-4.7)', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['workspace:admin'], workspaceId: WORKSPACE_ID, script: { role: 'member' } }));
    const response = await PUT(request('PUT', putBody({ enabled: true })));
    expect(response.status).toBe(403);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a PAT scoped to ANOTHER workspace is refused by the workspace-context match (AC-4.7)', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['workspace:admin'], workspaceId: OTHER_WORKSPACE_ID, script: {} }));
    const response = await PUT(request('PUT', putBody()));
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.message).toBe('This token is scoped to a different workspace.');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a PAT with no workspace binding cannot write at all', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['workspace:admin'], workspaceId: null, script: {} }));
    expect((await PUT(request('PUT', putBody()))).status).toBe(403);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a workspace-scoped admin PAT for THIS workspace works', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['workspace:admin'], workspaceId: WORKSPACE_ID, script: { role: 'admin' } }));
    expect((await PUT(request('PUT', putBody()))).status).toBe(200);
  });
});

describe('PUT tracker-settings: validation happens before Jira and before the write', () => {
  test.each([
    ['qa-1', 'invalid_destination_key'],
    ['1AB', 'invalid_destination_key'],
    ['../admin', 'invalid_destination_key'],
    ['x'.repeat(300), 'invalid_destination_key'],
    ['', 'destination_required'],
  ])('key %p is a 422 %s, with no Jira call and no side effect (AC-3.4 / 3.5)', async (key, reason) => {
    asPrincipal(principal({ script: {} }));
    const response = await PUT(request('PUT', putBody({ destination_project_key: key, enabled: true })));
    expect(response.status).toBe(422);
    const body = await response.json() as ErrorBody;
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details).toEqual({ reason });
    expect(checkSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a bad issue type is a 422 invalid_issue_type (AC-9)', async () => {
    asPrincipal(principal({ script: {} }));
    const response = await PUT(request('PUT', putBody({ issue_type_name: 'x'.repeat(61), enabled: true })));
    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'invalid_issue_type' });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a body that is not JSON is a 400', async () => {
    asPrincipal(principal({ script: {} }));
    expect((await PUT(request('PUT', undefined, '{nope'))).status).toBe(400);
  });
});

describe('PUT tracker-settings: check on save (PO Q2)', () => {
  test('a failing check blocks a sync-ON save: 422, the reason, nothing saved (AC-2.9)', async () => {
    asPrincipal(principal({ script: {} }));
    checkAnswer = { ok: false, kind: 'project_inaccessible', message: 'Bunkai cannot file issues in Jira project QAS: it does not exist or the connection has no access.' };
    const response = await PUT(request('PUT', putBody({ enabled: true })));
    expect(response.status).toBe(422);
    const body = await response.json() as ErrorBody;
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details).toEqual({
      reason: 'connection_check_failed',
      check: { kind: 'project_inaccessible', message: checkAnswer.ok ? '' : checkAnswer.message },
    });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  test('a sync-OFF save never calls Jira, even when Jira is down (AC-2.10)', async () => {
    asPrincipal(principal({ script: {} }));
    checkAnswer = { ok: false, kind: 'unreachable', message: 'Jira could not be reached. Try again in a few minutes.' };
    const response = await PUT(request('PUT', putBody({ enabled: false })));
    expect(response.status).toBe(200);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  test('a passing check stores Jira\'s own spelling of the issue type (decision C)', async () => {
    asPrincipal(principal({ script: {} }));
    checkAnswer = { ok: true, issueTypeName: 'Bug' };
    await PUT(request('PUT', putBody({ issue_type_name: ' bug ', enabled: true })));
    expect(callArg(checkSpy, 0, 0)).toEqual({ projectKey: 'QAS', issueTypeName: 'bug' });
    expect(lastRpcArgs().issueTypeName).toBe('Bug');
  });

  test('a sync-OFF save stores the trimmed text as typed (decision C)', async () => {
    asPrincipal(principal({ script: {} }));
    await PUT(request('PUT', putBody({ issue_type_name: '  bug ', enabled: false })));
    expect(lastRpcArgs().issueTypeName).toBe('bug');
  });
});

describe('PUT tracker-settings: one Jira check at a time per person (F2)', () => {
  test('a PUT whose check-on-save overlaps another check by the same person is a 429 check_in_progress and saves nothing', async () => {
    asPrincipal(principal({ script: {} }));
    let release: () => void = () => {};
    checkSpy.mockImplementation((async () => new Promise((resolve) => {
      release = () => resolve({ ok: true, issueTypeName: 'Bug' });
    })) as never);

    const first = PUT(request('PUT', putBody({ enabled: true })));
    await new Promise(resolve => setTimeout(resolve, 10));

    const second = await PUT(request('PUT', putBody({ enabled: true })));
    expect(second.status).toBe(429);
    const body = await second.json() as ErrorBody;
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.details).toEqual({ reason: 'check_in_progress' });
    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).not.toHaveBeenCalled();

    release();
    expect((await first).status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  test('a sync-OFF PUT never takes the guard, so it works while a check runs', async () => {
    asPrincipal(principal({ script: {} }));
    let release: () => void = () => {};
    checkSpy.mockImplementation((async () => new Promise((resolve) => {
      release = () => resolve({ ok: true, issueTypeName: 'Bug' });
    })) as never);
    const running = PUT(request('PUT', putBody({ enabled: true })));
    await new Promise(resolve => setTimeout(resolve, 10));

    const off = await PUT(request('PUT', putBody({ enabled: false })));
    expect(off.status).toBe(200);

    release();
    await running;
  });

  test('the guard is released when the check throws, so the next PUT goes through', async () => {
    asPrincipal(principal({ script: {} }));
    checkSpy.mockImplementation((async () => {
      throw new Error('boom');
    }) as never);
    expect((await PUT(request('PUT', putBody({ enabled: true })))).status).toBe(500);
    checkSpy.mockImplementation((async () => ({ ok: true, issueTypeName: 'Bug' })) as never);
    expect((await PUT(request('PUT', putBody({ enabled: true })))).status).toBe(200);
  });
});

describe('PUT tracker-settings: the write', () => {
  test('calls the RPC with the gateway principal as actor, never anything from the body (AC-4.6)', async () => {
    asPrincipal(principal({ script: {} }));
    await PUT(request('PUT', putBody({ actor_user_id: '99999999-9999-4999-8999-999999999999', actorUserId: 'x' })));
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(callArg(rpcSpy, 0, 0)).toEqual({ sentinel: 'admin' });
    expect(lastRpcArgs()).toEqual({
      actorUserId: USER_ID,
      projectId: PROJECT_ID,
      destinationProjectKey: 'QAS',
      issueTypeName: 'Bug',
      enabled: false,
      confirmQueueCount: null,
    });
  });

  test('normalises the key before the RPC (AC-3.3)', async () => {
    asPrincipal(principal({ script: {} }));
    await PUT(request('PUT', putBody({ destination_project_key: ' qas ' })));
    expect(lastRpcArgs().destinationProjectKey).toBe('QAS');
  });

  test('forwards the confirmation count', async () => {
    asPrincipal(principal({ script: {} }));
    await PUT(request('PUT', putBody({ enabled: true, confirm_queue_count: 7 })));
    expect(lastRpcArgs().confirmQueueCount).toBe(7);
  });

  test('answers the stored values and how many defects were queued', async () => {
    asPrincipal(principal({ script: {} }));
    rpcAnswer = {
      data: { project_id: PROJECT_ID, destination_project_key: 'QAS', issue_type_name: 'Bug', enabled: true, updated_at: '2026-10-15T11:00:00.000Z', requeued: 3 },
      error: null,
    };
    const response = await PUT(request('PUT', putBody({ enabled: true, confirm_queue_count: 3 })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tracker_settings: { destination_project_key: 'QAS', issue_type_name: 'Bug', enabled: true, configured: true, updated_at: '2026-10-15T11:00:00.000Z' },
      requeued: 3,
    });
  });

  test('passes the 409 queue confirmation through with the count (PO Q1)', async () => {
    asPrincipal(principal({ script: {} }));
    rpcAnswer = { data: null, error: { code: '45413', message: 'queue_confirmation_required: 12 defect(s) would be queued' } };
    const response = await PUT(request('PUT', putBody({ enabled: true })));
    expect(response.status).toBe(409);
    const body = await response.json() as ErrorBody;
    expect(body.error.code).toBe('conflict');
    expect(body.error.details).toEqual({ reason: 'queue_confirmation_required', queue_count: 12 });
  });

  test('a stale demotion that reaches the RPC is a 403 admin_required (AC-4.5)', async () => {
    asPrincipal(principal({ script: {} }));
    rpcAnswer = { data: null, error: { code: '42501', message: 'forbidden' } };
    const response = await PUT(request('PUT', putBody()));
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'admin_required' });
  });

  test('an unexpected database error is a 500 that does not leak the message', async () => {
    asPrincipal(principal({ script: {} }));
    rpcAnswer = { data: null, error: { code: 'XX000', message: 'connection to host secret.db failed' } };
    const response = await PUT(request('PUT', putBody()));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret.db');
  });
});
