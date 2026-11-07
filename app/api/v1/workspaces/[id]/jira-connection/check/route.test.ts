import type { Principal } from '@lib/api/principal';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-1619 — route-level coverage for POST
// /api/v1/workspaces/{id}/jira-connection/check (BK-1170). The real handler, with
// only the identity, the stored-credentials loader, the admin client and the Jira
// check replaced through `spyOn`. `globalThis.fetch` is spied too, to prove no
// request is ever made for a rejected body.

void mock.module('server-only', () => ({}));

const principalModule = await import('@lib/api/principal');
const checkModule = await import('@lib/jira/connection-check');
const credentialsModule = await import('@lib/jira/credentials');
const adminModule = await import('@lib/supabase/admin');
const { POST } = await import('./route');

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'tok_test_check_secret_value';
const STORED = { url: 'https://acme.atlassian.net', email: 'qa@acme.test', token: 'tok_test_stored' };

interface ErrorBody { error: { code: string, message: string, details?: Record<string, unknown> } }

function fakeDb(role: string | null): Principal['db'] {
  return {
    from: (table: string) => {
      if (table !== 'workspace_members') {
        throw new Error(`unexpected table access: ${table}`);
      }
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: role === null ? null : { role }, error: null });
      return chain;
    },
  } as unknown as Principal['db'];
}

function principal(args: { userId?: string, role?: string | null } = {}): Principal {
  return {
    userId: args.userId ?? USER_ID,
    workspaceId: null,
    capabilities: ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'],
    via: 'cookie',
    tokenId: null,
    db: fakeDb(args.role === undefined ? 'admin' : args.role),
  };
}

function request(body?: unknown, rawBody?: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/workspaces/${WORKSPACE_ID}/jira-connection/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const fullBody = (overrides: Record<string, unknown> = {}) => ({
  site_url: 'https://acme.atlassian.net',
  email: 'qa@acme.test',
  api_token: TOKEN,
  ...overrides,
});

let spies: Mock<(...args: never[]) => unknown>[] = [];
let checkSpy: Mock<(...args: never[]) => unknown>;
let fetchSpy: Mock<(...args: never[]) => unknown>;
let loadSpy: Mock<(...args: never[]) => unknown>;
let checkImpl: (...args: unknown[]) => Promise<unknown>;
let stored: typeof STORED | null;

function asPrincipal(p: Principal): void {
  spies.push(spyOn(principalModule, 'resolveIdentity').mockImplementation(async () => p) as never);
}

function callArg(spy: Mock<(...args: never[]) => unknown>, call: number, index: number): unknown {
  return (spy.mock.calls[call] as unknown as unknown[])[index];
}

beforeEach(() => {
  spies = [];
  stored = STORED;
  checkImpl = async () => ({ ok: true });
  checkSpy = spyOn(checkModule, 'checkJiraConnection').mockImplementation((async (...args: unknown[]) => checkImpl(...args)) as never) as never;
  loadSpy = spyOn(credentialsModule, 'loadWorkspaceJiraCredentials').mockImplementation((async () => stored) as never) as never;
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
    throw new Error('the network must not be reached');
  }) as never) as never;
  spies.push(
    checkSpy,
    loadSpy,
    fetchSpy,
    spyOn(adminModule, 'createAdminClient').mockImplementation((() => ({ sentinel: 'admin' })) as never) as never,
  );
});

afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
});

describe('POST jira-connection/check', () => {
  test('an empty body tests the STORED connection (200 ok)', async () => {
    asPrincipal(principal());
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reason: null });
    expect(callArg(checkSpy, 0, 0)).toEqual(STORED);
  });

  test('an empty body with nothing stored is a 200 not_connected, no Jira call', async () => {
    stored = null;
    asPrincipal(principal());
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean, reason: { kind: string } };
    expect(body.ok).toBe(false);
    expect(body.reason.kind).toBe('not_connected');
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('a full body tests the unsaved values and does not read the stored ones', async () => {
    asPrincipal(principal());
    const response = await POST(request(fullBody({ site_url: 'https://Other.atlassian.net/' })));
    expect(response.status).toBe(200);
    expect(callArg(checkSpy, 0, 0)).toEqual({ url: 'https://other.atlassian.net', email: 'qa@acme.test', token: TOKEN });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  test('a partial body is a 422 incomplete_body and nothing is checked', async () => {
    asPrincipal(principal());
    for (const partial of [{ site_url: 'https://acme.atlassian.net' }, { site_url: 'https://acme.atlassian.net', email: 'qa@acme.test' }, { api_token: TOKEN }]) {
      const response = await POST(request(partial));
      expect(response.status).toBe(422);
      expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'incomplete_body' });
    }
    expect(checkSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('an invalid site URL is a 422 and no fetch and no check ever happens', async () => {
    asPrincipal(principal());
    for (const site of ['http://acme.atlassian.net', 'https://evil.example.com', 'https://169.254.169.254', 'https://acme.atlassian.net@evil.com']) {
      const response = await POST(request(fullBody({ site_url: site })));
      expect(response.status).toBe(422);
      expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason: 'invalid_site_url' });
    }
    expect(checkSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a FAILED check is still a 200 with ok:false and the reason, never the token', async () => {
    asPrincipal(principal());
    checkImpl = async () => ({ ok: false, reason: { kind: 'unauthorized_401', message: 'Jira did not accept the email or the API token.' } });
    const response = await POST(request(fullBody()));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, reason: { kind: 'unauthorized_401', message: 'Jira did not accept the email or the API token.' } });
    expect(text).not.toContain(TOKEN);
  });

  test('a non-admin is a 403 and nothing is checked', async () => {
    asPrincipal(principal({ role: 'member' }));
    const response = await POST(request(fullBody()));
    expect(response.status).toBe(403);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('a body that is not JSON is a 400', async () => {
    asPrincipal(principal());
    expect((await POST(request(undefined, '{nope'))).status).toBe(400);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  test('a second concurrent call by the same person is a 429 check_in_progress, then the guard is released', async () => {
    asPrincipal(principal());
    let release: () => void = () => {};
    checkImpl = async () => new Promise((resolve) => {
      release = () => resolve({ ok: true });
    });

    const first = POST(request(fullBody()));
    await new Promise(resolve => setTimeout(resolve, 10));

    const second = await POST(request(fullBody()));
    expect(second.status).toBe(429);
    const body = await second.json() as ErrorBody;
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.details).toEqual({ reason: 'check_in_progress' });
    expect(checkSpy).toHaveBeenCalledTimes(1);

    release();
    expect((await first).status).toBe(200);

    checkImpl = async () => ({ ok: true });
    expect((await POST(request(fullBody()))).status).toBe(200);
  });

  test('a different person is not blocked by someone else\'s check', async () => {
    let release: () => void = () => {};
    checkImpl = async () => new Promise((resolve) => {
      release = () => resolve({ ok: true });
    });
    asPrincipal(principal());
    const first = POST(request(fullBody()));
    await new Promise(resolve => setTimeout(resolve, 10));

    spies.pop()!.mockRestore();
    asPrincipal(principal({ userId: OTHER_USER_ID }));
    checkImpl = async () => ({ ok: true });
    expect((await POST(request(fullBody()))).status).toBe(200);

    release();
    await first;
  });
});
