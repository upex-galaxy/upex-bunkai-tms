import type { SubmissionCaller } from '@lib/runs/submit-automated-run';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it, mock } from 'bun:test';

void mock.module('server-only', () => ({}));
const { executeRunSubmission } = await import('@lib/runs/submit-automated-run');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';
const WS_ID = '33333333-3333-4333-8333-333333333333';
const TEST_ID = '44444444-4444-4444-8444-444444444444';

interface RpcCall { fn: string, args: Record<string, unknown> }

// Referentially stable fake: one rpc spy per caller, answering the queued result.
function caller(
  result: { data: unknown, error: { code?: string, message: string, details?: string | null } | null },
  overrides: Partial<SubmissionCaller> = {},
): { principal: SubmissionCaller, calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return result;
    },
  } as unknown as SubmissionCaller['db'];
  return {
    principal: { userId: USER_ID, workspaceId: WS_ID, via: 'bearer', tokenId: TOKEN_ID, db, ...overrides },
    calls,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    test_id: TEST_ID,
    environment: 'Staging',
    verdict: 'passed',
    duration_seconds: 92,
    steps: [{ position: 1, result: 'pass' }, { position: 2, result: 'pass' }],
    evidence_urls: ['https://ci.example.com/run/1'],
    idempotency_key: 'ci-01',
    ...overrides,
  };
}

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('expected a rejection');
}

describe('executeRunSubmission', () => {
  it('AC-1: a created run answers 201 with the { run } envelope and calls the RPC with the token and actor', async () => {
    const run = { id: 'r1', status: 'passed', replayed: false };
    const { principal, calls } = caller({ data: run, error: null });

    const result = await executeRunSubmission(principal, payload());

    expect(result.status).toBe(201);
    expect(result.body).toEqual({ run });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe('bunkai_submit_automated_run');
    expect(calls[0]?.args).toMatchObject({
      p_actor_user_id: USER_ID,
      p_token_id: TOKEN_ID,
      p_test_id: TEST_ID,
      p_environment_name: 'Staging',
      p_verdict: 'passed',
      p_duration_seconds: 92,
      p_idempotency_key: 'ci-01',
    });
  });

  it('AC-2: a replayed run answers 200', async () => {
    const { principal } = caller({ data: { id: 'r1', replayed: true }, error: null });
    expect((await executeRunSubmission(principal, payload())).status).toBe(200);
  });

  it('AC-3: the RPC key conflict (45231) answers 409', async () => {
    const { principal } = caller({ data: null, error: { code: '45231', message: 'submission_key_conflict' } });
    const err = await rejection(executeRunSubmission(principal, payload()));
    expect(err.status).toBe(409);
  });

  it('AC-4: missing positions come back named (422)', async () => {
    const { principal } = caller({ data: null, error: { code: '45233', message: 'x', details: '3,4' } });
    const err = await rejection(executeRunSubmission(principal, payload()));
    expect(err.status).toBe(422);
    expect(err.message).toContain('3, 4');
  });

  it('AC-7: a viewer (42501 from the RPC) answers 403', async () => {
    const { principal } = caller({ data: null, error: { code: '42501', message: 'forbidden' } });
    expect((await rejection(executeRunSubmission(principal, payload()))).status).toBe(403);
  });

  it('AC-8: an unknown environment is named (422)', async () => {
    const { principal } = caller({ data: null, error: { code: '45201', message: 'x', details: 'Nightly' } });
    const err = await rejection(executeRunSubmission(principal, payload({ environment: 'Nightly' })));
    expect(err.status).toBe(422);
    expect(err.message).toContain('Nightly');
  });

  it('AC-9: a missing or foreign Test (P0002) answers 404', async () => {
    const { principal } = caller({ data: null, error: { code: 'P0002', message: 'test_not_found' } });
    const err = await rejection(executeRunSubmission(principal, payload()));
    expect(err.status).toBe(404);
    expect(err.message).toBe('Test not found.');
  });

  it('a cookie session is refused before any database call', async () => {
    const { principal, calls } = caller({ data: {}, error: null }, { via: 'cookie', tokenId: null });
    const err = await rejection(executeRunSubmission(principal, payload()));
    expect(err.status).toBe(403);
    expect(err.details).toMatchObject({ reason: 'token_required' });
    expect(calls).toHaveLength(0);
  });

  it('a token that is not bound to a workspace is refused before any database call', async () => {
    const { principal, calls } = caller({ data: {}, error: null }, { workspaceId: null });
    const err = await rejection(executeRunSubmission(principal, payload()));
    expect(err.status).toBe(403);
    expect(err.details).toMatchObject({ reason: 'token_not_workspace_scoped' });
    expect(calls).toHaveLength(0);
  });

  it('AC-5/AC-6: an invalid body is rejected before the RPC runs and nothing is recorded', async () => {
    const { principal, calls } = caller({ data: {}, error: null });
    expect((await rejection(executeRunSubmission(principal, payload({ verdict: 'success' })))).status).toBe(422);
    expect((await rejection(executeRunSubmission(principal, payload({ steps: [{ position: 1, result: 'fail' }] })))).status).toBe(422);
    expect(calls).toHaveLength(0);
  });
});
