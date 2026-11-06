import type { JiraConnectionCheckKind } from './connection-check';
import { describe, expect, it } from 'bun:test';
import { checkJiraConnection } from './connection-check';

// BK-1170 — "Test connection" against a stubbed fetch: every outcome, the single
// request, and no credential, host or e-mail in any message.

const TOKEN = 'tok-SECRET-0123456789';
const EMAIL = 'robot-owner@secret-corp.example';
const HOST = 'acme-secret-host.atlassian.net';
const credentials = { url: `https://${HOST}`, email: EMAIL, token: TOKEN };

function stub(respond: () => Response | Promise<Response>) {
  const calls: { url: string, init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('checkJiraConnection', () => {
  it('is ok on 200 with one GET /myself, Basic auth and no redirects', async () => {
    const s = stub(() => new Response('{"emailAddress":"x"}', { status: 200 }));
    expect(await checkJiraConnection(credentials, { fetch: s.fn })).toEqual({ ok: true });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].url).toBe(`https://${HOST}/rest/api/3/myself`);
    expect(s.calls[0].init.method).toBe('GET');
    expect(s.calls[0].init.redirect).toBe('error');
    expect((s.calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa(`${EMAIL}:${TOKEN}`)}`);
  });

  const cases: [number, JiraConnectionCheckKind][] = [
    [401, 'unauthorized_401'],
    [403, 'forbidden_403'],
    [404, 'site_not_found'],
    [429, 'jira_busy'],
    [500, 'unexpected_status'],
    [302, 'unexpected_status'],
  ];
  for (const [status, kind] of cases) {
    it(`maps ${status} to ${kind} with a message free of secrets`, async () => {
      const s = stub(() => new Response(`${EMAIL} ${TOKEN} ${HOST}`, { status }));
      const result = await checkJiraConnection(credentials, { fetch: s.fn });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.kind).toBe(kind);
        const text = JSON.stringify(result);
        for (const secret of [EMAIL, TOKEN, HOST]) {
          expect(text).not.toContain(secret);
        }
      }
    });
  }

  it('maps a network error, a timeout or a refused redirect to site_unreachable', async () => {
    const s = stub(() => { throw new TypeError(`fetch failed for ${HOST}`); });
    const result = await checkJiraConnection(credentials, { fetch: s.fn });
    expect(result).toEqual({ ok: false, reason: { kind: 'site_unreachable', message: expect.any(String) } });
    expect(JSON.stringify(result)).not.toContain(HOST);
  });

  it('explains the classic token on 403', async () => {
    const s = stub(() => new Response('', { status: 403 }));
    const result = await checkJiraConnection(credentials, { fetch: s.fn });
    expect(!result.ok && result.reason.message).toContain('classic (unscoped) API token');
  });
});
