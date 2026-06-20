import { ApiError } from '@lib/api/error-envelope';
import { mapRunRpcError } from '@lib/runs/errors';
import { describe, expect, test } from 'bun:test';

// BK-34 — the start-run / read-run error mapper. The RPC raises the runs-domain
// 452xx block (45200 executor_mode_invalid, 45201 environment_invalid, 45202
// no_executable_steps) plus the standard 42501 (forbidden / non-disclosure on
// create) and P0002 (not_found / non-disclosure on read).

// `mapRunRpcError` always throws; capture the ApiError so each case can assert
// code/status/message/details.
function capture(error: { code?: string, message: string }): ApiError {
  try {
    mapRunRpcError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('mapRunRpcError', () => {
  test('42501 → forbidden 403 (non-disclosing — also the missing-Test case)', () => {
    const err = capture({ code: '42501', message: 'forbidden' });
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  test('P0002 → not_found 404 (read non-disclosure)', () => {
    const err = capture({ code: 'P0002', message: 'run_not_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Run not found.');
  });

  test('45200 → validation_failed 422 (executor_mode_invalid)', () => {
    const err = capture({ code: '45200', message: 'executor_mode_invalid' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'executor_mode_invalid' });
  });

  test('45201 → environment_invalid 422 with exact copy', () => {
    const err = capture({ code: '45201', message: 'environment_invalid' });
    expect(err.code).toBe('environment_invalid');
    expect(err.status).toBe(422);
    expect(err.message).toBe('The selected environment is not configured for this Project.');
    expect(err.details).toEqual({ reason: 'environment_invalid' });
  });

  test('45202 → no_executable_steps 422 with the verbatim user message', () => {
    const err = capture({ code: '45202', message: 'no_executable_steps' });
    expect(err.code).toBe('no_executable_steps');
    expect(err.status).toBe(422);
    expect(err.message).toBe('Add at least one ATC step to this Test before starting a run.');
    expect(err.details).toEqual({ reason: 'no_executable_steps' });
  });

  test('unknown SQLSTATE → internal_error 500 passing the message through', () => {
    const err = capture({ code: '99999', message: 'boom' });
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });
});
