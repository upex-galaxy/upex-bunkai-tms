import type { JiraCredentials } from './project-check';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it, mock } from 'bun:test';

// `project-check` reads the deployment credential through `@lib/env`, which pulls
// in `server-only`; shim it so the module graph loads under Bun (same convention
// as lib/billing/checkout.test.ts). Every test injects its own credentials and
// `fetch`, so the real env is never consulted.
void mock.module('server-only', () => ({}));
const { checkJiraDestination } = await import('./project-check');

// BK-371 — AC-2.x. The connection check against a stubbed `fetch`: every reason
// kind, the encoded path, zero requests for malformed input, and no credential,
// host or e-mail in any message.

const SECRET_TOKEN = 'tok-SECRET-0123456789';
const SECRET_EMAIL = 'robot-owner@secret-corp.example';
const SECRET_HOST = 'acme-secret-host.atlassian.net';
const credentials: JiraCredentials = {
  url: `https://${SECRET_HOST}`,
  email: SECRET_EMAIL,
  token: SECRET_TOKEN,
};

interface Call { url: string, init: RequestInit }

function stubFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const status = (code: number) => new Response('internal body that must never surface', { status: code });

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  return undefined;
}

function run(
  respond: (call: Call) => Response | Promise<Response>,
  args: { projectKey?: string, issueTypeName?: string } = {},
  deps: { credentials?: JiraCredentials | null, timeoutMs?: number } = {},
) {
  const stub = stubFetch(respond);
  const result = checkJiraDestination(
    { projectKey: args.projectKey ?? 'QAS', issueTypeName: args.issueTypeName ?? 'Bug' },
    { fetch: stub.fn, credentials, ...deps },
  );
  return { result, calls: stub.calls };
}

describe('checkJiraDestination: outcomes', () => {
  it('passes when the type exists, returning Jira\'s own spelling (AC-2.1, decision C)', async () => {
    const { result, calls } = run(() => json({ issueTypes: [{ name: 'Task' }, { name: 'Bug' }] }));
    expect(await result).toEqual({ ok: true, issueTypeName: 'Bug' });
    expect(calls).toHaveLength(1);
  });

  it('matches the type case-insensitively after trimming and returns the stored spelling', async () => {
    const { result } = run(() => json({ issueTypes: [{ name: 'Bug' }] }), { issueTypeName: '  bUG ' });
    expect(await result).toEqual({ ok: true, issueTypeName: 'Bug' });
  });

  it('reads the `values` shape as well as `issueTypes`', async () => {
    const { result } = run(() => json({ values: [{ name: 'Epic' }] }), { issueTypeName: 'Epic' });
    expect(await result).toEqual({ ok: true, issueTypeName: 'Epic' });
  });

  it('issue_type_missing names the type and key with the frozen copy (AC-2.1 fourth proof)', async () => {
    const { result } = run(() => json({ issueTypes: [{ name: 'Task' }] }), { projectKey: 'QAS', issueTypeName: 'Bug' });
    expect(await result).toEqual({ ok: false, kind: 'issue_type_missing', message: 'Issue type Bug was not found in QAS.' });
  });

  it('an empty list is issue_type_missing, not a pass', async () => {
    const { result } = run(() => json({ issueTypes: [] }));
    expect((await result).ok).toBe(false);
    expect(await result).toMatchObject({ kind: 'issue_type_missing' });
  });

  it('a truncated page that lacks the type degrades to unreachable instead of guessing', async () => {
    const { result } = run(() => json({ issueTypes: [{ name: 'Task' }], total: 400 }));
    expect(await result).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('401 is credential_rejected (AC-2.3)', async () => {
    const { result } = run(() => status(401));
    expect(await result).toEqual({ ok: false, kind: 'credential_rejected', message: 'Jira did not accept the Bunkai connection.' });
  });

  it('404 and 403 give the SAME project_inaccessible result, so existence is not disclosed (AC-2.2)', async () => {
    const notFound = await run(() => status(404), { projectKey: 'ZZNOPE9' }).result;
    const forbidden = await run(() => status(403), { projectKey: 'ZZNOPE9' }).result;
    expect(notFound).toEqual(forbidden);
    expect(notFound).toEqual({
      ok: false,
      kind: 'project_inaccessible',
      message: 'Bunkai cannot file issues in Jira project ZZNOPE9: it does not exist or the connection has no access.',
    });
  });

  it('429 is jira_busy and is never waited out', async () => {
    const started = Date.now();
    const { result, calls } = run(() => new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
    expect(await result).toMatchObject({ ok: false, kind: 'jira_busy' });
    expect(calls).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it.each([500, 502, 503, 400, 302])('status %p is unreachable (AC-2.4)', async (code) => {
    const { result, calls } = run(() => status(code));
    expect(await result).toEqual({ ok: false, kind: 'unreachable', message: 'Jira could not be reached. Try again in a few minutes.' });
    expect(calls).toHaveLength(1);
  });

  it('a network error is unreachable', async () => {
    const { result } = run(() => {
      throw new TypeError('fetch failed');
    });
    expect(await result).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('a request that outlives the time budget aborts as unreachable and the call returns (AC-2.4)', async () => {
    const started = Date.now();
    const { result } = run(
      async ({ init }) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
      {},
      { timeoutMs: 40 },
    );
    expect(await result).toMatchObject({ ok: false, kind: 'unreachable' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it.each([null, 'not json', { somethingElse: [] }, { issueTypes: 'nope' }])('an unknown body shape (%p) degrades to unreachable, never to a pass', async (body) => {
    const { result } = run(() => (typeof body === 'string' ? new Response(body, { status: 200 }) : json(body)));
    expect(await result).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('with no credential it answers not_set_up without any request (AC-2.5)', async () => {
    const { result, calls } = run(() => json({}), {}, { credentials: null });
    expect(await result).toEqual({ ok: false, kind: 'not_set_up', message: 'Jira is not set up on this deployment.' });
    expect(calls).toHaveLength(0);
  });
});

describe('checkJiraDestination: the request it builds', () => {
  it('is a single GET against the createmeta issue types path with the key encoded', async () => {
    const { result, calls } = run(() => json({ issueTypes: [{ name: 'Bug' }] }), { projectKey: 'A1_B' });
    await result;
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.init.method).toBe('GET');
    expect(call.url).toBe(`https://${SECRET_HOST}/rest/api/3/issue/createmeta/A1_B/issuetypes?maxResults=200`);
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(call.init.redirect).toBe('error');
  });

  it('tolerates a trailing slash on the configured host', async () => {
    const { result, calls } = run(() => json({ issueTypes: [{ name: 'Bug' }] }), {}, { credentials: { ...credentials, url: `https://${SECRET_HOST}/` } });
    await result;
    expect(calls[0].url.startsWith(`https://${SECRET_HOST}/rest/api/3/`)).toBe(true);
  });

  it.each(['../admin', 'QA"S', 'qa-1', 'QA S', 'x'.repeat(10_000), ''])('sends NO request for the malformed key %p (AC-2.6)', async (key) => {
    const { result, calls } = run(() => json({ issueTypes: [{ name: 'Bug' }] }), { projectKey: key });
    expect(await rejection(result)).toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);
  });

  it.each(['', '   ', 'x'.repeat(61)])('sends NO request for the invalid issue type %p', async (issueTypeName) => {
    const { result, calls } = run(() => json({ issueTypes: [] }), { issueTypeName });
    expect(await rejection(result)).toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);
  });
});

describe('checkJiraDestination: no secret reaches a result (AC-2.3 / 2.5)', () => {
  const secrets = [SECRET_TOKEN, SECRET_EMAIL, SECRET_HOST, 'internal body', btoa(`${SECRET_EMAIL}:${SECRET_TOKEN}`)];

  it.each([401, 403, 404, 429, 500, 503])('status %p result carries none of the credential, host, e-mail or response body', async (code) => {
    const outcome = JSON.stringify(await run(() => status(code)).result);
    for (const secret of secrets) {
      expect(outcome).not.toContain(secret);
    }
  });

  it('a network error whose message names the host does not leak it', async () => {
    const outcome = JSON.stringify(await run(() => {
      throw new TypeError(`getaddrinfo ENOTFOUND ${SECRET_HOST} (token ${SECRET_TOKEN})`);
    }).result);
    for (const secret of secrets) {
      expect(outcome).not.toContain(secret);
    }
  });

  it('the missing-credential result names no variable', async () => {
    const outcome = JSON.stringify(await run(() => json({}), {}, { credentials: null }).result);
    expect(outcome).not.toMatch(/ATLASSIAN/);
  });
});
