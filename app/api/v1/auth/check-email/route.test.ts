import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-743 — rate limit on the email-existence check. The Supabase admin client
// is replaced by an in-memory fake that implements the two RPCs with the same
// contract as the SQL (sliding windows, consume-only-when-allowed); the REAL
// route handler, limiter and error envelope run. The SQL itself is covered by
// `lib/auth/rate-limit.db.test.ts`.
void mock.module('server-only', () => ({}));
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-test-key';

const hits = new Map<string, number[]>();
let storeDown = false;
const directoryLookups: string[] = [];
const DIRECTORY: Record<string, { email_exists: boolean, email_confirmed: boolean }> = {
  'verified@x.com': { email_exists: true, email_confirmed: true },
  'unverified@x.com': { email_exists: true, email_confirmed: false },
};

function consume(key: string, windows: Array<{ window_seconds: number, max: number }>) {
  const now = Date.now();
  const list = hits.get(key) ?? [];
  let retry = 0;
  for (const w of windows) {
    const inWin = list.filter(t => t > now - w.window_seconds * 1000);
    if (inWin.length >= w.max) {
      retry = Math.max(retry, Math.max(1, Math.ceil((Math.min(...inWin) + w.window_seconds * 1000 - now) / 1000)));
    }
  }
  if (retry > 0) {
    return { allowed: false, retry_after_seconds: retry };
  }
  hits.set(key, [...list, now]);
  return { allowed: true };
}

void mock.module('@lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'bunkai_rate_limit_consume') {
        if (storeDown) {
          return { data: null, error: { message: 'down' } };
        }
        return { data: consume(args.p_key as string, args.p_windows as never), error: null };
      }
      directoryLookups.push(args.p_email as string);
      const row = DIRECTORY[args.p_email as string];
      return { data: row ? [row] : [], error: null };
    },
  }),
}));

const { POST } = await import('./route');

function req(body: unknown, ip = '203.0.113.7', raw = false): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/check-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': ip },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function refusal(res: Response) {
  const json = await res.json() as { error: { code: string, message: string, details: unknown, request_id?: string } };
  const { request_id: _requestId, ...error } = json.error;
  return { status: res.status, retryAfter: res.headers.get('retry-after'), error };
}

beforeEach(() => {
  hits.clear();
  storeDown = false;
  directoryLookups.length = 0;
});

describe('BK-743 — check-email rate limit', () => {
  it('answers a typo-then-retry normally', async () => {
    expect((await POST(req({ email: 'verified@x.com' }))).status).toBe(200);
    expect((await POST(req({ email: 'verifed@x.com' }))).status).toBe(200);
  });

  it('allows the 10th check in a minute and refuses the 11th with a wait hint', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(req({ email: `u${i}@x.com` }))).status).toBe(200);
    }
    const r = await refusal(await POST(req({ email: 'u11@x.com' })));
    expect(r.status).toBe(429);
    expect(r.error.code).toBe('rate_limited');
    expect(Number(r.retryAfter)).toBeGreaterThan(0);
    expect((r.error.details as { retry_after_seconds: number }).retry_after_seconds).toBe(Number(r.retryAfter));
  });

  it('refuses the 61st check within the hour even when each minute stays in budget', async () => {
    const now = Date.now();
    // Seed 60 hits spread over the past hour, none in the last minute.
    const { digestSource, rateLimitKey } = await import('@lib/auth/rate-limit');
    const k = rateLimitKey({ scope: 'source', identifier: digestSource('203.0.113.7'), step: 'check-email' });
    hits.set(k, Array.from({ length: 60 }, (_, i) => now - 120_000 - i * 50_000));
    const r = await refusal(await POST(req({ email: 'a@x.com' })));
    expect(r.status).toBe(429);
    expect(r.error.code).toBe('rate_limited');
    expect(Number(r.retryAfter)).toBeGreaterThan(0);
  });

  it('refuses identically for verified, unverified, unknown and malformed addresses, without a directory lookup', async () => {
    for (let i = 0; i < 10; i++) {
      await POST(req({ email: `u${i}@x.com` }));
    }
    directoryLookups.length = 0;
    const results = [];
    for (const email of ['verified@x.com', 'unverified@x.com', 'nobody@x.com', 'not-an-email']) {
      results.push(await refusal(await POST(req({ email }))));
    }
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
    expect(directoryLookups).toEqual([]);
  });

  it('counts malformed and unparseable submissions against the budget', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await POST(req({ email: 'bad' }))).status).toBe(422);
    }
    for (let i = 0; i < 5; i++) {
      expect((await POST(req('{not json', '203.0.113.7', true))).status).toBe(400);
    }
    expect((await POST(req({ email: 'verified@x.com' }))).status).toBe(429);
  });

  it('does not throttle a different source', async () => {
    for (let i = 0; i < 11; i++) {
      await POST(req({ email: `u${i}@x.com` }));
    }
    expect((await POST(req({ email: 'verified@x.com' }, '198.51.100.9'))).status).toBe(200);
  });

  it('ignores a caller-supplied x-forwarded-for (cannot reset own budget)', async () => {
    for (let i = 0; i < 10; i++) {
      await POST(req({ email: `u${i}@x.com` }));
    }
    const spoofed = new NextRequest('https://app.test/api/v1/auth/check-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ email: 'verified@x.com' }),
    });
    expect((await POST(spoofed)).status).toBe(429);
  });

  it('fails closed (502) when the store is unreachable', async () => {
    storeDown = true;
    const res = await POST(req({ email: 'verified@x.com' }));
    expect(res.status).toBe(502);
    expect(directoryLookups).toEqual([]);
  });
});
