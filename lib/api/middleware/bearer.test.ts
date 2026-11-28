import { describe, expect, it, mock } from 'bun:test';

void mock.module('server-only', () => ({}));
const { bearerCredentials, requireBearerToken } = await import('@lib/api/middleware/bearer');

describe('BK-2643 bearerCredentials', () => {
  it('treats the Bearer scheme in any letter case as a Bearer attempt, with or without a token', () => {
    expect(bearerCredentials('Bearer')).toBe('');
    expect(bearerCredentials('Bearer ')).toBe('');
    expect(bearerCredentials('bearer   ')).toBe('');
    expect(bearerCredentials('BEARER')).toBe('');
    expect(bearerCredentials('Bearer bk_pat_x.y')).toBe('bk_pat_x.y');
    expect(bearerCredentials('bearer bk_pat_x.y')).toBe('bk_pat_x.y');
    expect(bearerCredentials('Bearer    bk_pat_x.y  ')).toBe('bk_pat_x.y');
    expect(bearerCredentials('Bearer\tbk_pat_x.y')).toBe('bk_pat_x.y');
    expect(bearerCredentials('Bearer a, Bearer b')).toBe('a, Bearer b');
  });

  it('returns null when no Bearer scheme was sent', () => {
    expect(bearerCredentials(null)).toBeNull();
    expect(bearerCredentials('')).toBeNull();
    expect(bearerCredentials('Basic dXNlcjpwYXNz')).toBeNull();
    expect(bearerCredentials('Bearerish token')).toBeNull();
    expect(bearerCredentials('Token Bearer')).toBeNull();
  });
});

describe('BK-2643 requireBearerToken', () => {
  async function codeFor(authorization: string): Promise<string | undefined> {
    try {
      await requireBearerToken(new Request('https://app.test/api/v1/ping', { headers: { authorization } }));
      return undefined;
    }
    catch (error) {
      return (error as { code?: string }).code;
    }
  }

  it('answers unauthorized for an empty or malformed Bearer value before any lookup', async () => {
    for (const authorization of ['Bearer ', 'Bearer', 'bearer ', 'Bearer not-a-pat', 'bearer bk_pat_short.x', 'Bearer bk_pat_']) {
      expect({ authorization, code: await codeFor(authorization) }).toEqual({ authorization, code: 'unauthorized' });
    }
  });
});
