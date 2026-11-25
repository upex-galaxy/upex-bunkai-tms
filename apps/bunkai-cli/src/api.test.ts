import { describe, expect, it } from 'bun:test';
import { ApiClient } from './api';
import { CliError } from './errors';
import { fakeApi } from './testing/fakes';

// The HTTP client every command goes through (BK-1900 TL-6, review of PR 361).

describe('ApiClient — redirects', () => {
  it('never follows a redirect, so a password or PAT is not resent elsewhere', async () => {
    let seenRedirect: RequestRedirect | undefined;
    const api = fakeApi({ 'POST /api/v1/auth/signin': () => ({ status: 308, headers: { location: 'https://elsewhere.test/api/v1/auth/signin' } }) });
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      seenRedirect = init?.redirect;
      return api.fetch(input, init);
    }) as typeof fetch;
    const client = new ApiClient('http://bunkai.test', spy);

    const failure = await client.request('/api/v1/auth/signin', { method: 'POST', body: { password: 'secret-pass' } }).catch((err: unknown) => err);
    expect(seenRedirect).toBe('manual');
    expect(failure).toBeInstanceOf(CliError);
    expect((failure as CliError).message).toBe('Bunkai at http://bunkai.test answered with a redirect (308). Nothing was sent on; pass the final address with --api-url or BUNKAI_API_URL.');
    expect((failure as CliError).message).not.toContain('secret-pass');
    expect(api.requests).toHaveLength(1);
  });

  it('sends extra headers in any case without letting them replace accept or authorization', async () => {
    let sent: Record<string, string> = {};
    const api = fakeApi({ 'POST /api/v1/runs': () => ({ status: 201, body: {} }) });
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      sent = init?.headers as Record<string, string>;
      return api.fetch(input, init);
    }) as typeof fetch;
    await new ApiClient('https://bunkai.test', spy).request('/api/v1/runs', {
      method: 'POST',
      token: 'bk_pat_x',
      body: {},
      headers: { 'Idempotency-Key': 'key-12345678', 'Accept': 'text/html', 'Authorization': 'Bearer other' },
    });
    expect(sent).toEqual({
      'idempotency-key': 'key-12345678',
      'accept': 'application/json',
      'authorization': 'Bearer bk_pat_x',
      'content-type': 'application/json',
    });
  });

  it('still returns an ordinary 4xx answer to the caller', async () => {
    const api = fakeApi({ 'GET /api/v1/me': () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'no' } } }) });
    const response = await new ApiClient('https://bunkai.test', api.fetch).request('/api/v1/me', { token: 'bk_pat_x' });
    expect(response.status).toBe(401);
  });
});

describe('ApiClient — transport failures a write handles itself', () => {
  const marker = (failure: unknown) => new Error(JSON.stringify(failure));

  it('hands a 5xx to onTransportFailure with its status and request id', async () => {
    const api = fakeApi({ 'POST /api/v1/runs': () => ({ status: 503, headers: { 'x-request-id': 'req-9' } }) });
    const failure = await new ApiClient('https://bunkai.test', api.fetch)
      .request('/api/v1/runs', { method: 'POST', body: {}, onTransportFailure: marker })
      .catch((err: Error) => err);
    expect(JSON.parse((failure as Error).message)).toEqual({ kind: 'server', status: 503, requestId: 'req-9' });
  });

  it('hands a dropped connection and a timeout to onTransportFailure', async () => {
    const dropped = (async () => { throw new TypeError('socket hang up'); }) as unknown as typeof fetch;
    const lost = await new ApiClient('https://bunkai.test', dropped)
      .request('/api/v1/runs', { method: 'POST', body: {}, onTransportFailure: marker })
      .catch((err: Error) => err);
    expect(JSON.parse((lost as Error).message)).toEqual({ kind: 'unreachable' });

    const slow = (async (_: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
    })) as unknown as typeof fetch;
    const timedOut = await new ApiClient('https://bunkai.test', slow, 20)
      .request('/api/v1/runs', { method: 'POST', body: {}, onTransportFailure: marker })
      .catch((err: Error) => err);
    expect(JSON.parse((timedOut as Error).message)).toEqual({ kind: 'timeout', seconds: 0 });
  });

  it('keeps the generic messages for every other request', async () => {
    const api = fakeApi({ 'GET /api/v1/me': () => ({ status: 500 }) });
    const failure = await new ApiClient('https://bunkai.test', api.fetch).request('/api/v1/me').catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(CliError);
    expect((failure as CliError).message).toContain('Try again in a moment');
  });
});
