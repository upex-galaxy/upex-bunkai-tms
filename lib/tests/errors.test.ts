import { ApiError } from '@lib/api/error-envelope';
import { mapTestRpcError } from '@lib/tests/errors';
import { describe, expect, test } from 'bun:test';

// `mapTestRpcError` always throws; capture the ApiError so each case can
// assert code/status/message/details.
function capture(error: { code?: string, message: string }): ApiError {
  try {
    mapTestRpcError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('mapTestRpcError', () => {
  test('42501 → forbidden 403', () => {
    const err = capture({ code: '42501', message: 'forbidden' });
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
  });

  test('45120 → chain_empty 422 with exact copy', () => {
    const err = capture({ code: '45120', message: 'chain_empty' });
    expect(err.code).toBe('chain_empty');
    expect(err.status).toBe(422);
    expect(err.message).toBe('A Test must include at least one ATC.');
  });

  test('45121 → validation_failed 422 (title)', () => {
    const err = capture({ code: '45121', message: 'title_invalid' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.message).toBe('Title must be 200 characters or fewer.');
  });

  test('45122 → not_found 404 with the non-disclosing copy', () => {
    const err = capture({ code: '45122', message: 'atc_not_in_workspace' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('One or more selected ATCs are not available in this workspace.');
  });

  test('45122 carries no details (no id echo)', () => {
    const err = capture({ code: '45122', message: 'atc_not_in_workspace' });
    expect(err.details).toBeUndefined();
  });

  test('unknown SQLSTATE → internal_error 500 passing the message through', () => {
    const err = capture({ code: '99999', message: 'boom' });
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });
});
