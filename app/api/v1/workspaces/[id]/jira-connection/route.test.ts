import type { Principal } from '@lib/api/principal';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-1619 — route-level coverage for GET / PUT / DELETE
// /api/v1/workspaces/{id}/jira-connection (BK-1170).
//
// Drives the REAL exported handlers (gateway capability gate, the live-role gate,
// body validation, RPC error mapping, the public shape). Only the edges that would
// need a session or a database are substituted, with `spyOn` on the module
// namespace (restored after every test):
//
//   - `resolveIdentity`                 -> a fixed principal
//   - `createAdminClient`               -> a table double answering the metadata read
//   - `upsertWorkspaceJiraConnection`   -> a scripted RPC answer (and a call recorder)
//   - `deleteWorkspaceJiraConnection`   -> a scripted RPC answer
//
// This file proves the ROUTE. The SQL is proven against the real database by
// lib/jira/workspace-jira-connection-isolation.test.ts.

void mock.module('server-only', () => ({}));

const principalModule = await import('@lib/api/principal');
const adminModule = await import('@lib/supabase/admin');
const rpcModule = await import('@lib/supabase/rpc');
const { GET, PUT, DELETE } = await import('./route');

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const SECRET_ID = '99999999-9999-4999-8999-999999999999';
const TOKEN = 'tok_test_route_secret_value';

interface ErrorBody { error: { code: string, message: string, details?: Record<string, unknown> } }

interface Meta { site_url: string, email: string, updated_at: string, updated_by: string | null }

const META: Meta = {
  site_url: 'https://acme.atlassian.net',
  email: 'qa@acme.test',
  updated_at: '2026-11-05T10:00:00.000Z',
  updated_by: USER_ID,
};

// Caller-client double: answers only the live role read.
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

function principal(args: { role?: string | null, scopes?: string[] } = {}): Principal {
  return {
    userId: USER_ID,
    workspaceId: null,
    capabilities: args.scopes ?? ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'],
    via: 'cookie',
    tokenId: null,
    db: fakeDb(args.role === undefined ? 'admin' : args.role),
  };
}

// Admin-client double: the connection table read. It also carries a secret id the
// route must never select or echo, so a leak would show in the response.
let storedMeta: (Meta & { token_secret_id?: string }) | null;
let selectedColumns: string[];
function fakeAdmin(): unknown {
  return {
    from: (table: string) => {
      if (table !== 'workspace_jira_connections') {
        throw new Error(`unexpected table access: ${table}`);
      }
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string) => {
        selectedColumns = columns.split(',').map(c => c.trim());
        return chain;
      };
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: storedMeta, error: null });
      return chain;
    },
  };
}

function request(method: 'GET' | 'PUT' | 'DELETE', body?: unknown, rawBody?: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/workspaces/${WORKSPACE_ID}/jira-connection`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const putBody = (overrides: Record<string, unknown> = {}) => ({
  site_url: 'https://acme.atlassian.net',
  email: 'qa@acme.test',
  api_token: TOKEN,
  ...overrides,
});

let spies: Mock<(...args: never[]) => unknown>[] = [];
let upsertSpy: Mock<(...args: never[]) => unknown>;
let deleteSpy: Mock<(...args: never[]) => unknown>;
let upsertAnswer: { data: unknown, error: { code?: string, message: string } | null };
let deleteAnswer: { data: unknown, error: { code?: string, message: string } | null };
let logged: string[];

function asPrincipal(p: Principal): void {
  spies.push(spyOn(principalModule, 'resolveIdentity').mockImplementation(async () => p) as never);
}

beforeEach(() => {
  spies = [];
  storedMeta = { ...META, token_secret_id: SECRET_ID };
  selectedColumns = [];
  logged = [];
  upsertAnswer = {
    data: { site_url: META.site_url, email: META.email, updated_at: META.updated_at, updated_by: USER_ID },
    error: null,
  };
  deleteAnswer = { data: true, error: null };
  upsertSpy = spyOn(rpcModule, 'upsertWorkspaceJiraConnection').mockImplementation((async () => upsertAnswer) as never) as never;
  deleteSpy = spyOn(rpcModule, 'deleteWorkspaceJiraConnection').mockImplementation((async () => deleteAnswer) as never) as never;
  spies.push(
    upsertSpy,
    deleteSpy,
    spyOn(adminModule, 'createAdminClient').mockImplementation((() => fakeAdmin()) as never) as never,
  );
  // Everything the process would print, to prove the token is never logged.
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    spies.push(spyOn(console, method).mockImplementation(((...args: unknown[]) => {
      logged.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }) as never) as never);
  }
});

afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
});

function callArg(spy: Mock<(...args: never[]) => unknown>, call: number, index: number): unknown {
  return (spy.mock.calls[call] as unknown as unknown[])[index];
}

describe('GET jira-connection', () => {
  test('a plain member sees only { connected: true }', async () => {
    asPrincipal(principal({ role: 'member' }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jira_connection: { connected: true } });
  });

  test('a viewer on an unconnected workspace sees { connected: false }', async () => {
    storedMeta = null;
    asPrincipal(principal({ role: 'viewer' }));
    const response = await GET(request('GET'));
    expect(await response.json()).toEqual({ jira_connection: { connected: false } });
  });

  test('an admin sees site, email and has_token, and never a token or the secret id', async () => {
    asPrincipal(principal({ role: 'admin' }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      jira_connection: {
        connected: true,
        site_url: META.site_url,
        email: META.email,
        has_token: true,
        updated_at: META.updated_at,
        updated_by: USER_ID,
      },
    });
    expect(text).not.toContain(SECRET_ID);
    expect(text).not.toContain('token_secret_id');
    expect(text).not.toContain('"token"');
    // The secret id column is never even selected.
    expect(selectedColumns).not.toContain('token_secret_id');
  });

  test('a caller who is not an active member gets the not_found 404', async () => {
    asPrincipal(principal({ role: null }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorBody).error.code).toBe('not_found');
  });
});

describe('PUT jira-connection', () => {
  test('a non-admin is a 403 admin_required and nothing reaches the RPC', async () => {
    asPrincipal(principal({ role: 'member' }));
    const response = await PUT(request('PUT', putBody()));
    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('forbidden');
    expect(body.error.details).toEqual({ reason: 'admin_required' });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  test('an invalid site URL is a 422 before any RPC', async () => {
    asPrincipal(principal());
    for (const site of ['http://acme.atlassian.net', 'https://evil.example.com', 'https://acme.atlassian.net.evil.com', 'not a url']) {
      const response = await PUT(request('PUT', putBody({ site_url: site })));
      expect(response.status).toBe(422);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.details).toEqual({ reason: 'invalid_site_url' });
    }
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  test('a malformed email and an empty token are 422s with constant copy', async () => {
    asPrincipal(principal());
    const badEmail = await PUT(request('PUT', putBody({ email: 'nope' })));
    expect(badEmail.status).toBe(422);
    expect(((await badEmail.json()) as ErrorBody).error.details).toEqual({ reason: 'invalid_email' });
    const badToken = await PUT(request('PUT', putBody({ api_token: '   ' })));
    expect(badToken.status).toBe(422);
    expect(((await badToken.json()) as ErrorBody).error.details).toEqual({ reason: 'token_required' });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  test('a body that is not JSON is a 400', async () => {
    asPrincipal(principal());
    expect((await PUT(request('PUT', undefined, '{nope'))).status).toBe(400);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  test('a save sends the normalised site, the actor from the principal and the token to the RPC only', async () => {
    asPrincipal(principal());
    const response = await PUT(request('PUT', putBody({ site_url: 'https://Acme.atlassian.net/' })));
    expect(response.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(callArg(upsertSpy, 0, 1)).toEqual({
      actorUserId: USER_ID,
      workspaceId: WORKSPACE_ID,
      siteUrl: 'https://acme.atlassian.net',
      email: 'qa@acme.test',
      apiToken: TOKEN,
    });
  });

  test('the token is in no response body and in no logged output, on success or failure', async () => {
    asPrincipal(principal());
    const ok = await PUT(request('PUT', putBody()));
    const okText = await ok.text();
    expect(ok.status).toBe(200);
    expect(JSON.parse(okText)).toEqual({
      jira_connection: { connected: true, site_url: META.site_url, email: META.email, has_token: true, updated_at: META.updated_at },
    });
    expect(okText).not.toContain(TOKEN);

    const texts: string[] = [];
    // A validation failure, an RPC refusal and an unmapped RPC failure.
    texts.push(await (await PUT(request('PUT', putBody({ email: 'nope' })))).text());
    upsertAnswer = { data: null, error: { code: '45422', message: `token_required ${TOKEN}` } };
    texts.push(await (await PUT(request('PUT', putBody()))).text());
    upsertAnswer = { data: null, error: { code: 'XX000', message: `boom ${TOKEN}` } };
    const failed = await PUT(request('PUT', putBody()));
    expect(failed.status).toBe(500);
    texts.push(await failed.text());

    for (const text of texts) {
      expect(text).not.toContain(TOKEN);
    }
    expect(logged.join('\n')).not.toContain(TOKEN);
  });

  test('RPC refusals map to constant-message envelopes', async () => {
    asPrincipal(principal());
    const cases: [string, string, number, string][] = [
      ['P0002', 'workspace_not_found', 404, 'not_found'],
      ['42501', 'forbidden', 403, 'admin_required'],
      ['45420', 'invalid_site_url', 422, 'invalid_site_url'],
      ['45421', 'invalid_email', 422, 'invalid_email'],
      ['45422', 'token_required', 422, 'token_required'],
    ];
    for (const [code, message, status, reason] of cases) {
      upsertAnswer = { data: null, error: { code, message } };
      const response = await PUT(request('PUT', putBody()));
      expect(response.status).toBe(status);
      expect(((await response.json()) as ErrorBody).error.details).toEqual({ reason });
    }
  });

  test('omitting the token sends no apiToken (email-only change)', async () => {
    asPrincipal(principal());
    const { api_token: _omit, ...withoutToken } = putBody();
    expect((await PUT(request('PUT', withoutToken))).status).toBe(200);
    expect((callArg(upsertSpy, 0, 1) as { apiToken: unknown }).apiToken).toBeNull();
  });
});

describe('DELETE jira-connection', () => {
  test('an admin gets 204 with an empty body', async () => {
    asPrincipal(principal());
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(callArg(deleteSpy, 0, 1)).toEqual({ actorUserId: USER_ID, workspaceId: WORKSPACE_ID });
  });

  test('no stored connection is a 404 not_connected', async () => {
    asPrincipal(principal());
    deleteAnswer = { data: false, error: null };
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('not_found');
    expect(body.error.details).toEqual({ reason: 'not_connected' });
  });

  test('a non-admin is a 403 and the RPC is never called', async () => {
    asPrincipal(principal({ role: 'viewer' }));
    expect((await DELETE(request('DELETE'))).status).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
