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

  it('still returns an ordinary 4xx answer to the caller', async () => {
    const api = fakeApi({ 'GET /api/v1/me': () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'no' } } }) });
    const response = await new ApiClient('https://bunkai.test', api.fetch).request('/api/v1/me', { token: 'bk_pat_x' });
    expect(response.status).toBe(401);
  });
});
