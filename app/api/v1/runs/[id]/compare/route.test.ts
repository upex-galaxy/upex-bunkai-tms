import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { COMPARE_LOAD_ERROR } from '@lib/runs/compare-view';
import { describe, expect, it, spyOn } from 'bun:test';
import { COMPARE_FAILURE_MESSAGE, extractCompareRunId, fetchRunComparison, isUuid } from './response';

// BK-442 — GET /api/v1/runs/{id}/compare. The route itself is a thin
// `withApiHandler` wrapper (no harness for mocking NextRequest/ctx exists in this
// repo — see `activity/route.test.ts`); every branch that needs coverage lives in
// `./response.ts` and is tested with a fake `db` that records `db.rpc(fn, args)`.
// The one property that is about what `route.ts` imports and calls (the caller's
// own client, never the admin client) is checked with a static source assertion.
// The real database behaviour is `lib/runs/compare-isolation.test.ts`.

const RUN_ID = '11111111-2222-3333-4444-555555555555';
const LOG = { requestId: 'req-1', method: 'GET', path: `/api/v1/runs/${RUN_ID}/compare` };

interface RpcResult { data: unknown, error: { code?: string, message: string } | null }
interface RpcCall { fn: string, args: unknown }

function fakeDb(result: RpcResult, calls: RpcCall[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result;
    },
  } as unknown as SupabaseClient<Database>;
}

const HEADER = {
  id: RUN_ID,
  status: 'passed',
  started_at: '2026-10-02T09:00:00+00:00',
  finished_at: '2026-10-02T09:25:00+00:00',
  environment_id: 'env-1',
  environment_name: 'Staging',
  executor_mode: 'human',
  abort_reason: null,
  total_steps: 2,
  skipped_steps: 0,
};
const BASE = { test: { id: 't', title: 'T' }, environment: { id: 'env-1', name: 'Staging' }, run: HEADER };
const COMPARED = {
  ...BASE,
  state: 'compared',
  previous: { ...HEADER, id: 'prev' },
  counts: { new_failure: 0, still_failing: 0, newly_fixed: 0, unchanged_pass: 2, not_comparable: 0, shared: 2, added: 0, removed: 0 },
  nothing_changed: true,
  no_common_steps: false,
  rows: [],
};

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the promise to reject');
}

describe('extractCompareRunId / isUuid', () => {
  it('takes the segment before `compare`', () => {
    expect(extractCompareRunId(`/api/v1/runs/${RUN_ID}/compare`)).toBe(RUN_ID);
    expect(extractCompareRunId(`/api/v1/runs/${RUN_ID}/compare/`)).toBe(RUN_ID);
  });

  it('answers empty (and so 400) for a path that has no id', () => {
    expect(isUuid(extractCompareRunId('/compare'))).toBe(false);
  });

  it('accepts a UUID and rejects anything else', () => {
    expect(isUuid(RUN_ID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(`${RUN_ID}x`)).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('fetchRunComparison', () => {
  it('answers with the same fixed text the screen shows on a failed load (one error copy)', () => {
    expect(COMPARE_FAILURE_MESSAGE).toBe(COMPARE_LOAD_ERROR);
    expect(COMPARE_FAILURE_MESSAGE).toBe('Could not compare these runs.');
  });

  it('calls bunkai_compare_run with the Run id and NO identity parameter', async () => {
    const calls: RpcCall[] = [];
    await fetchRunComparison(fakeDb({ data: COMPARED, error: null }, calls), RUN_ID, LOG);
    expect(calls).toEqual([{ fn: 'bunkai_compare_run', args: { p_run_id: RUN_ID } }]);
  });

  it('passes each of the four documented states through as data (every one is a 200)', async () => {
    for (const payload of [
      COMPARED,
      { ...BASE, state: 'no_previous', previous: null },
      { ...BASE, state: 'in_progress', previous: null, run: { ...HEADER, status: 'running', finished_at: null } },
      { ...BASE, state: 'unreliable', previous: { ...HEADER, id: 'prev' } },
    ]) {
      const result = await fetchRunComparison(fakeDb({ data: payload, error: null }), RUN_ID, LOG);
      expect(result.state).toBe(payload.state as typeof result.state);
    }
  });

  it('maps P0002 (missing, foreign, non-member, no session) to the same 404 GET /runs/{id} gives', async () => {
    const error = await rejection(fetchRunComparison(fakeDb({ data: null, error: { code: 'P0002', message: 'run_not_found' } }), RUN_ID, LOG));
    expect(error.code).toBe('not_found');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Run not found.');
  });

  it('logs an unmapped database error server-side as {code, message} and returns fixed text', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const secret = 'permission denied for table run_steps (internal detail)';
      const error = await rejection(fetchRunComparison(fakeDb({ data: null, error: { code: '42501', message: secret } }), RUN_ID, LOG));
      expect(error.code).toBe('internal_error');
      expect(error.message).toBe(COMPARE_FAILURE_MESSAGE);
      expect(error.message).not.toContain('run_steps');

      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
      expect(line).toMatchObject({ level: 'error', request_id: 'req-1', method: 'GET', path: LOG.path, error_code: '42501', message: secret });
    }
    finally {
      spy.mockRestore();
    }
  });

  it('treats a payload that is not one of the four states as a failed load, with fixed text', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const bad of [null, 'x', {}, { ...COMPARED, state: 'surprise' }, { ...COMPARED, counts: undefined }]) {
        const error = await rejection(fetchRunComparison(fakeDb({ data: bad, error: null }), RUN_ID, LOG));
        expect(error.code).toBe('internal_error');
        expect(error.message).toBe(COMPARE_FAILURE_MESSAGE);
      }
      expect(spy).toHaveBeenCalledTimes(5);
    }
    finally {
      spy.mockRestore();
    }
  });
});

describe('route.ts wiring (static: this is about what the route imports and calls)', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
  const code = source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

  it('reads on the caller\'s own client from getAuth(ctx) and never imports the admin client', () => {
    expect(code).toContain('getAuth(ctx)');
    expect(code).toContain('fetchRunComparison(db,');
    expect(code).not.toContain('createAdminClient');
    expect(code).not.toContain('@lib/supabase/admin');
  });

  it('requires a signed-in caller with the atc:read capability', () => {
    expect(code).toContain('auth: \'required\'');
    expect(code).toContain('requires: [\'atc:read\']');
  });

  it('rejects a malformed id with 400 before any read', () => {
    expect(code.indexOf('isUuid(runId)')).toBeGreaterThan(-1);
    expect(code.indexOf('isUuid(runId)')).toBeLessThan(code.indexOf('fetchRunComparison(db'));
    expect(code).toContain('\'bad_request\'');
  });
});
