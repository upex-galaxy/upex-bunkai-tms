import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

// BK-667 — lifecycle of the shared create wrapper (begin -> write -> record|discard).
const calls: string[] = [];
let beginResult: unknown;
let recordShouldThrow = false;

void mock.module('server-only', () => ({}));
// `mock.module` is PROCESS-wide and never restored, so the fake must only answer
// while THIS file's tests run; otherwise every later suite that goes through the
// real middleware (BK-203 tests route, ...) silently loses Idempotency-Key
// enforcement. The original functions are copied BEFORE registering the mock
// (a live namespace would end up pointing at the mock) and used outside it.
const realIdempotency = { ...(await import('@lib/api/idempotency')) };
let fakeActive = false;
beforeAll(() => { fakeActive = true; });
afterAll(() => { fakeActive = false; });

void mock.module('@lib/api/idempotency', () => ({
  ...realIdempotency,
  beginIdempotentRequest: async (...args: Parameters<typeof realIdempotency.beginIdempotentRequest>) => {
    if (!fakeActive) { return realIdempotency.beginIdempotentRequest(...args); }
    calls.push('begin');
    return beginResult;
  },
  recordIdempotencyResult: async (...args: Parameters<typeof realIdempotency.recordIdempotencyResult>) => {
    if (!fakeActive) { return realIdempotency.recordIdempotencyResult(...args); }
    calls.push('record');
    if (recordShouldThrow) { throw new Error('store failed'); }
  },
  discardIdempotencyResult: async (...args: Parameters<typeof realIdempotency.discardIdempotencyResult>) => {
    if (!fakeActive) { return realIdempotency.discardIdempotencyResult(...args); }
    calls.push('discard');
  },
}));

const { runIdempotentCreate } = await import('./idempotent-create');

const base = {
  request: new Request('http://localhost/x', { method: 'POST' }),
  userId: 'u1',
  endpoint: 'POST /x',
  payload: { a: 1 },
};

beforeEach(() => {
  calls.length = 0;
  recordShouldThrow = false;
  beginResult = { isReplay: false, token: { rowId: 'r1' } };
});

describe('runIdempotentCreate (BK-667)', () => {
  it('replays the stored snapshot without running the write', async () => {
    beginResult = { isReplay: true, snapshot: { ok: true }, status: 201, token: {} };
    let ran = false;
    const res = await runIdempotentCreate({ ...base, execute: async () => { ran = true; return {}; } });
    expect(ran).toBe(false);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual(['begin']);
  });

  it('writes once, records the snapshot and answers 201', async () => {
    const res = await runIdempotentCreate({ ...base, execute: async () => ({ id: 1 }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1 });
    expect(calls).toEqual(['begin', 'record']);
  });

  it('discards the key and rethrows when the write fails', async () => {
    const boom = new Error('boom');
    const caught = await runIdempotentCreate({ ...base, execute: async () => { throw boom; } }).catch((e: unknown) => e);
    expect(caught).toBe(boom);
    expect(calls).toEqual(['begin', 'discard']);
  });

  it('still answers success when the snapshot cannot be stored', async () => {
    recordShouldThrow = true;
    const res = await runIdempotentCreate({ ...base, execute: async () => ({ id: 2 }) });
    expect(res.status).toBe(201);
    expect(calls).toEqual(['begin', 'record']);
  });
});
