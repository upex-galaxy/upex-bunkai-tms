import type { Principal } from '@lib/api/principal';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-371 — route-level coverage for POST /api/v1/projects/{id}/tracker-settings/check.
// Same substitution convention as ../route.test.ts: the real handler, with only
// the identity, the DB reads and the Jira check replaced through `spyOn`.

void mock.module('server-only', () => ({}));

const principalModule = await import('@lib/api/principal');
const checkModule = await import('@lib/jira/project-check');
const { POST } = await import('./route');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555';

interface ErrorBody { error: { code: string, message: string, details?: Record<string, unknown> } }

function fakeDb(args: { project: { id: string, workspace_id: string } | null, role: string | null }): Principal['db'] {
  return {
    from: (table: string) => {
      const answer = { projects: args.project, workspace_members: args.role === null ? null : { role: args.role } }[table];
      if (answer === undefined) {
        throw new Error(`unexpected table access: ${table}`);
      }
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: answer, error: null });
      return chain;
    },
  } as unknown as Principal['db'];
}

function principal(args: { userId?: string, role?: string | null, project?: boolean, via?: 'cookie' | 'bearer', scopes?: string[], workspaceId?: string | null } = {}): Principal {
  return {
    userId: args.userId ?? USER_ID,
    workspaceId: args.workspaceId ?? null,
    capabilities: args.scopes ?? ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'],
    via: args.via ?? 'cookie',
    tokenId: args.via === 'bearer' ? 'tok_test' : null,
    db: fakeDb({
      project: args.project === false ? null : { id: PROJECT_ID, workspace_id: WORKSPACE_ID },
      role: args.role === undefined ? 'admin' : args.role,
    }),
  };
}

function request(body: unknown, rawBody?: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${PROJECT_ID}/tracker-settings/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? JSON.stringify(body),
  });
}

let spies: Mock<(...args: never[]) => unknown>[] = [];
let checkSpy: Mock<(...args: never[]) => unknown>;
let checkImpl: (...args: unknown[]) => Promise<unknown>;

function callArg(spy: Mock<(...args: never[]) => unknown>, call: number, index: number): unknown {
  return (spy.mock.calls[call] as unknown as unknown[])[index];
}

function asPrincipal(p: Principal): void {
  spies.push(spyOn(principalModule, 'resolveIdentity').mockImplementation(async () => p) as never);
}

beforeEach(() => {
  spies = [];
  checkImpl = async () => ({ ok: true, issueTypeName: 'Bug' });
  checkSpy = spyOn(checkModule, 'checkJiraDestination').mockImplementation((async (...args: unknown[]) => checkImpl(...args)) as never) as never;
  spies.push(checkSpy);
});

afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
});

describe('POST tracker-settings/check', () => {
  test('a passing check answers 200 ok with no reason (AC-2.1)', async () => {
    asPrincipal(principal());
    const response = await POST(request({ destination_project_key: 'QAS' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reason: null });
    expect(callArg(checkSpy, 0, 0)).toEqual({ projectKey: 'QAS', issueTypeName: 'Bug' });
  });

  test('a FAILED check is still a 200, carrying the kind and frozen text (AC-2.2)', async () => {
    asPrincipal(principal());
    checkImpl = async () => ({ ok: false, kind: 'issue_type_missing', message: 'Issue type Bug was not found in QAS.' });
    const response = await POST(request({ destination_project_key: 'QAS' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: { kind: 'issue_type_missing', message: 'Issue type Bug was not found in QAS.' },
    });
  });

  test('validates and normalises the typed key before any Jira call (AC-2.6)', async () => {
    asPrincipal(principal());
    await POST(request({ destination_project_key: ' qas ', issue_type_name: ' Task ' }));
    expect(callArg(checkSpy, 0, 0)).toEqual({ projectKey: 'QAS', issueTypeName: 'Task' });
  });

  test.each(['../admin', 'QA"S', 'x'.repeat(10_000), 'qa-1'])('refuses %p with 422 and sends no request to Jira (AC-2.6)', async (key) => {
    asPrincipal(principal());
    const response = await POST(request({ destination_project_key: key }));
    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'invalid_destination_key' });
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('an empty key is destination_required and sends no request', async () => {
    asPrincipal(principal());
    const response = await POST(request({ destination_project_key: '' }));
    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'destination_required' });
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test.each(['member', 'viewer'])('a %s is refused with no Jira request (AC-2.8)', async (role) => {
    asPrincipal(principal({ role }));
    const response = await POST(request({ destination_project_key: 'QAS' }));
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'admin_required' });
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('a Project RLS hides is a 404 with no Jira request (AC-4.4)', async () => {
    asPrincipal(principal({ project: false }));
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(404);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('a PAT without workspace:admin, and one scoped to another workspace, never reach Jira (AC-4.7)', async () => {
    asPrincipal(principal({ via: 'bearer', scopes: ['atc:read'], workspaceId: WORKSPACE_ID }));
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(403);
    spies.pop()!.mockRestore();
    asPrincipal(principal({ via: 'bearer', scopes: ['workspace:admin'], workspaceId: OTHER_WORKSPACE_ID }));
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(403);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('a body that is not JSON is a 400', async () => {
    asPrincipal(principal());
    expect((await POST(request(undefined, '{nope'))).status).toBe(400);
    expect(checkSpy).not.toHaveBeenCalled();
  });
});

describe('POST tracker-settings/check: one check at a time per person (Q4)', () => {
  test('a second concurrent call by the same person is a 429 check_in_progress, then the guard is released', async () => {
    asPrincipal(principal());
    let release: () => void = () => {};
    checkImpl = async () => new Promise((resolve) => {
      release = () => resolve({ ok: true, issueTypeName: 'Bug' });
    });

    const first = POST(request({ destination_project_key: 'QAS' }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 10));

    const second = await POST(request({ destination_project_key: 'QAS' }));
    expect(second.status).toBe(429);
    const body = await second.json() as ErrorBody;
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.details).toEqual({ reason: 'check_in_progress' });
    expect(checkSpy).toHaveBeenCalledTimes(1);

    release();
    expect((await first).status).toBe(200);

    checkImpl = async () => ({ ok: true, issueTypeName: 'Bug' });
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(200);
  });

  test('a different person is not blocked by someone else\'s check', async () => {
    let release: () => void = () => {};
    checkImpl = async () => new Promise((resolve) => {
      release = () => resolve({ ok: true, issueTypeName: 'Bug' });
    });
    asPrincipal(principal());
    const first = POST(request({ destination_project_key: 'QAS' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    spies.pop()!.mockRestore();
    asPrincipal(principal({ userId: OTHER_USER_ID }));
    checkImpl = async () => ({ ok: true, issueTypeName: 'Bug' });
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(200);

    release();
    await first;
  });

  test('the guard is released when the check throws, so the person is never locked out', async () => {
    asPrincipal(principal());
    checkImpl = async () => {
      throw new Error('boom');
    };
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(500);
    checkImpl = async () => ({ ok: true, issueTypeName: 'Bug' });
    expect((await POST(request({ destination_project_key: 'QAS' }))).status).toBe(200);
  });
});
