import { ApiError } from '@lib/api/error-envelope';
import { mapTestFilterError, mapTestRpcError, mapTestTagsError } from '@lib/tests/errors';
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

  test('P0002 → not_found 404 (BK-32 expanded read)', () => {
    const err = capture({ code: 'P0002', message: 'no_data_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Test not found.');
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

// BK-33 — the tags-write error mapper. Reuses 42501 / P0002 / 45125, plus the
// new 45126 (tags_invalid → 422).
function captureTags(error: { code?: string, message: string }): ApiError {
  try {
    mapTestTagsError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('mapTestTagsError', () => {
  test('42501 → forbidden 403', () => {
    const err = captureTags({ code: '42501', message: 'forbidden' });
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
  });

  test('P0002 → not_found 404', () => {
    const err = captureTags({ code: 'P0002', message: 'no_data_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
  });

  test('45126 → validation_failed 422 (tags_invalid)', () => {
    const err = captureTags({ code: '45126', message: 'tags_invalid' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'tags_invalid' });
  });

  test('45125 → conflict 409 echoing current_version from the message', () => {
    const err = captureTags({ code: '45125', message: 'version_conflict:7' });
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ reason: 'version_conflict', current_version: 7 });
  });

  test('45125 without a parseable version omits current_version', () => {
    const err = captureTags({ code: '45125', message: 'version_conflict' });
    expect(err.code).toBe('conflict');
    expect(err.details).toEqual({ reason: 'version_conflict' });
  });

  test('unknown SQLSTATE → internal_error 500 passing the message through', () => {
    const err = captureTags({ code: '99999', message: 'boom' });
    expect(err.code).toBe('internal_error');
    expect(err.message).toBe('boom');
  });
});

// BK-33 — the tag-filter error mapper. The read-only filter RPC carries no
// domain SQLSTATEs, so EVERY error maps to a generic internal_error WITHOUT
// leaking the raw RPC/SQL message into the response.
function captureFilter(error: { code?: string, message: string }): ApiError {
  try {
    mapTestFilterError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('mapTestFilterError', () => {
  test('any RPC error → internal_error 500 with a generic message', () => {
    const err = captureFilter({ code: '42P01', message: 'relation "tests" does not exist' });
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Failed to filter Tests by tag.');
  });

  test('never embeds the raw RPC/SQL message in the response', () => {
    const raw = 'duplicate key value violates unique constraint "secret_internal_idx"';
    const err = captureFilter({ message: raw });
    expect(err.message).not.toContain(raw);
    expect(err.message).not.toContain('constraint');
  });
});
