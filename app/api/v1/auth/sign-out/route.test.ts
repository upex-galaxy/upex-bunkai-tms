import { createServerClient } from '@supabase/ssr';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const FAKE_ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'] as const;
const envBefore = FAKE_ENV_KEYS.map(key => [key, process.env[key]] as const);
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-test-key';
process.env.CRON_SECRET ??= 'cron-secret-test';

interface FakeState {
  user: { id: string } | null
  revokedIds: string[]
  updateError: { message: string } | null
  signOutError: { message: string } | null
  calls: string[]
  filters: string[]
}

const state: FakeState = { user: null, revokedIds: [], updateError: null, signOutError: null, calls: [], filters: [] };

function fakeQuery(table: string) {
  const builder = {
    update: (values: Record<string, unknown>) => {
      builder.ops.push(`update:${Object.keys(values).join(',')}`);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      state.filters.push(`eq:${column}=${String(value)}`);
      return builder;
    },
    is: (column: string, value: unknown) => {
      state.filters.push(`is:${column}=${String(value)}`);
      return builder;
    },
    or: (expression: string) => {
      state.filters.push(`or:${expression}`);
      return builder;
    },
    select: (columns: string) => {
      builder.ops.push(`select:${columns}`);
      return builder;
    },
    ops: [] as string[],
    then: (resolve: (value: { data: Array<{ id: string }> | null, error: { message: string } | null }) => void) => {
      state.calls.push(`${table}:${builder.ops.join('|')}`);
      resolve(state.updateError
        ? { data: null, error: state.updateError }
        : { data: state.revokedIds.map(id => ({ id })), error: null });
    },
  };
  return builder;
}

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: state.user }, error: null }),
    signOut: async ({ scope }: { scope: string }) => {
      state.calls.push(`signOut:${scope}`);
      return { error: state.signOutError };
    },
  },
  from: (table: string) => fakeQuery(table),
};

let fakesActive = false;
beforeAll(() => { fakesActive = true; });
afterAll(() => {
  fakesActive = false;
  for (const [key, value] of envBefore) {
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }
});

void mock.module('@lib/supabase/server', () => ({
  createClient: async () => fakesActive
    ? fakeClient
    : createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => [], setAll: () => {} },
      }),
}));

const { POST } = await import('./route');

interface Body { revoked_pats?: number, error?: { code?: string } }

function signOutRequest(body?: string): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  });
}

async function call(body?: string): Promise<{ status: number, json: Body }> {
  const response = await POST(signOutRequest(body));
  return { status: response.status, json: (await response.json()) as Body };
}

describe('BK-2447 POST /api/v1/auth/sign-out', () => {
  beforeEach(() => {
    state.user = { id: 'user-1' };
    state.revokedIds = ['pat-a', 'pat-b', 'pat-c'];
    state.updateError = null;
    state.signOutError = null;
    state.calls = [];
    state.filters = [];
  });

  it('ends only the calling session and touches no token when the body is empty', async () => {
    const { status, json } = await call();
    expect(status).toBe(200);
    expect(json).toEqual({ revoked_pats: 0 });
    expect(state.calls).toEqual(['signOut:local']);
  });

  it('treats {}, {"revoke_pats": false} and unknown fields as the default', async () => {
    for (const body of ['{}', '{"revoke_pats": false}', '{"revoke_pats": false, "scope": "global", "workspace_id": "A"}', '{"scope": "global"}']) {
      state.calls = [];
      const { status, json } = await call(body);
      expect(status).toBe(200);
      expect(json).toEqual({ revoked_pats: 0 });
      expect(state.calls).toEqual(['signOut:local']);
    }
  });

  it('revokes the caller\'s active tokens first, then ends every session, and reports the count', async () => {
    const { status, json } = await call('{"revoke_pats": true}');
    expect(status).toBe(200);
    expect(json).toEqual({ revoked_pats: 3 });
    expect(state.calls).toEqual(['access_tokens:update:revoked_at|select:id', 'signOut:global']);
    expect(state.filters.slice(0, 2)).toEqual(['eq:user_id=user-1', 'is:revoked_at=null']);
    expect(state.filters[2]).toMatch(/^or:expires_at\.is\.null,expires_at\.gte\."\d{4}-\d{2}-\d{2}T[\d:.]+Z"$/);
  });

  it('reports 0 and still ends every session when nothing is active', async () => {
    state.revokedIds = [];
    const { status, json } = await call('{"revoke_pats": true}');
    expect(status).toBe(200);
    expect(json).toEqual({ revoked_pats: 0 });
    expect(state.calls.at(-1)).toBe('signOut:global');
  });

  it('answers 422 for a non-boolean flag or a body that is not an object, and changes nothing', async () => {
    for (const body of ['{"revoke_pats": "true"}', '{"revoke_pats": "false"}', '{"revoke_pats": 1}', '{"revoke_pats": null}', 'null', '[true]', '"x"']) {
      const { status, json } = await call(body);
      expect(status).toBe(422);
      expect(json.error?.code).toBe('validation_failed');
    }
    expect(state.calls).toEqual([]);
  });

  it('answers 400 for malformed JSON and changes nothing', async () => {
    const { status, json } = await call('{revoke_pats');
    expect(status).toBe(400);
    expect(json.error?.code).toBe('bad_request');
    expect(state.calls).toEqual([]);
  });

  it('answers 401 with no session and changes nothing', async () => {
    state.user = null;
    const { status, json } = await call('{"revoke_pats": true}');
    expect(status).toBe(401);
    expect(json.error?.code).toBe('unauthorized');
    expect(state.calls).toEqual([]);
  });

  it('answers 500 with no count and keeps the session when the revoke fails', async () => {
    state.updateError = { message: 'db down' };
    const { status, json } = await call('{"revoke_pats": true}');
    expect(status).toBe(500);
    expect(json.error?.code).toBe('internal_error');
    expect(json.revoked_pats).toBeUndefined();
    expect(state.calls).toEqual(['access_tokens:update:revoked_at|select:id']);
  });

  it('answers 500, never 200, when ending the session fails after the revoke', async () => {
    state.signOutError = { message: 'auth down' };
    const { status, json } = await call('{"revoke_pats": true}');
    expect(status).toBe(500);
    expect(json.error?.code).toBe('internal_error');
    expect(json.revoked_pats).toBeUndefined();
    expect(state.calls).toEqual(['access_tokens:update:revoked_at|select:id', 'signOut:global']);
  });

  it('answers 500 when ending the session fails on the default path', async () => {
    state.signOutError = { message: 'auth down' };
    const { status } = await call();
    expect(status).toBe(500);
    expect(state.calls).toEqual(['signOut:local']);
  });
});
