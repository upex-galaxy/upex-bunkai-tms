import type { SubmissionRpcError } from '@lib/runs/submission-errors';
import { ApiError } from '@lib/api/error-envelope';
import { mapSubmissionRpcError } from '@lib/runs/submission-errors';
import { describe, expect, test } from 'bun:test';

function capture(error: SubmissionRpcError): ApiError {
  try {
    mapSubmissionRpcError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('expected the mapper to throw');
}

describe('mapSubmissionRpcError', () => {
  test('AC-9: P0002 is a 404 about the Test and nothing else', () => {
    const err = capture({ code: 'P0002', message: 'test_not_found' });
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('Test not found.');
  });

  test('AC-7: 42501 is a 403', () => {
    const err = capture({ code: '42501', message: 'forbidden' });
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'insufficient_permissions' });
  });

  test('AC-8: 45201 names the unknown environment', () => {
    const err = capture({ code: '45201', message: 'environment_invalid', details: 'Nightly' });
    expect(err.status).toBe(422);
    expect(err.code).toBe('environment_invalid');
    expect(err.message).toContain('"Nightly"');
  });

  test('AC-4: 45233 lists the missing positions', () => {
    const err = capture({ code: '45233', message: 'submission_steps_incomplete', details: '3,4' });
    expect(err.status).toBe(422);
    expect(err.message).toContain('3, 4');
    expect(err.details).toMatchObject({ reason: 'steps_incomplete', missing_positions: [3, 4] });
  });

  test('AC-3: 45231 is a 409 conflict', () => {
    const err = capture({ code: '45231', message: 'submission_key_conflict' });
    expect(err.status).toBe(409);
    expect(err.code).toBe('conflict');
  });

  test('the token codes: 45237 is 401, 45238 is 403', () => {
    expect(capture({ code: '45237', message: 'x' }).status).toBe(401);
    expect(capture({ code: '45238', message: 'x' }).status).toBe(403);
  });

  test('the rest of the 452xx backstops are 422', () => {
    for (const code of ['45202', '45232', '45234', '45235', '45236']) {
      expect(capture({ code, message: 'x', details: 'd' }).status).toBe(422);
    }
  });

  test('anything else is a 500 carrying the message', () => {
    const err = capture({ code: 'XX000', message: 'boom' });
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });
});
