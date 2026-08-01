import { ApiError } from '@lib/api/error-envelope';
import { mapCoverageRpcError } from '@lib/coverage/errors';
import { describe, expect, test } from 'bun:test';

// `mapCoverageRpcError` always throws; capture the ApiError so each case can
// assert code/status/message/details.
function capture(error: { code?: string, message: string }): ApiError {
  try {
    mapCoverageRpcError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('mapCoverageRpcError', () => {
  test('P0002 → not_found 404 (missing/foreign/non-member Project, non-disclosure)', () => {
    const err = capture({ code: 'P0002', message: 'project_not_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Project not found.');
    expect(err.details).toEqual({ reason: 'not_found' });
  });

  test('unknown SQLSTATE → internal_error 500 passing the message through', () => {
    const err = capture({ code: '99999', message: 'boom' });
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });
});
