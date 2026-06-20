import { ApiError } from '@lib/api/error-envelope';
import { mapEnvironmentRpcError } from '@lib/environments/errors';
import { describe, expect, test } from 'bun:test';

// BK-148 — the environments CRUD error mapper. The RPCs raise the environments-
// domain 452xx block (45210 environment_name_length, 45211 environment_in_use)
// plus the native 23505 (duplicate name) and 23503 (FK in-use backstop), and the
// shared 42501 (forbidden) / P0002 (not_found) gate codes.

// `mapEnvironmentRpcError` always throws; capture the ApiError so each case can
// assert code/status/message/details.
function capture(error: { code?: string, message: string }): ApiError {
  try {
    mapEnvironmentRpcError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('mapEnvironmentRpcError did not throw');
}

describe('mapEnvironmentRpcError', () => {
  test('42501 → forbidden 403 (non-disclosing)', () => {
    const err = capture({ code: '42501', message: 'forbidden' });
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  test('P0002 → not_found 404', () => {
    const err = capture({ code: 'P0002', message: 'environment_not_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ reason: 'not_found' });
  });

  test('23505 → conflict 409 with the AC-exact duplicate copy', () => {
    const err = capture({ code: '23505', message: 'duplicate key value violates unique constraint' });
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.message).toBe('An environment with this name already exists.');
    expect(err.details).toEqual({ reason: 'environment_name_taken' });
  });

  test('45210 → validation_failed 422 (name length)', () => {
    const err = capture({ code: '45210', message: 'environment_name_length' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'environment_name_length' });
  });

  test('45211 → conflict 409 with the run count parsed into the message + details', () => {
    const err = capture({ code: '45211', message: 'environment_in_use: 3 run(s) reference this environment' });
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.message).toBe('This environment is in use by 3 runs and cannot be removed.');
    expect(err.details).toEqual({ reason: 'environment_in_use', run_count: 3 });
  });

  test('45211 with a single run → singular "run" in the message', () => {
    const err = capture({ code: '45211', message: 'environment_in_use: 1 run(s) reference this environment' });
    expect(err.message).toBe('This environment is in use by 1 run and cannot be removed.');
    expect(err.details).toEqual({ reason: 'environment_in_use', run_count: 1 });
  });

  test('23503 (FK backstop) → conflict 409, in-use, no count', () => {
    const err = capture({ code: '23503', message: 'update or delete on table violates foreign key constraint' });
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.message).toBe('This environment is in use by one or more runs and cannot be removed.');
    expect(err.details).toEqual({ reason: 'environment_in_use' });
  });

  test('unknown SQLSTATE → internal_error 500 passing the message through', () => {
    const err = capture({ code: '99999', message: 'boom' });
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });
});
