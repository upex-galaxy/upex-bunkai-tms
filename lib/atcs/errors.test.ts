import type { ApiError } from '@lib/api/error-envelope';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { describe, expect, test } from 'bun:test';

// BK-21 architect checklist: unit tests for version skew (409) and insufficient
// role (403) on the ATC edit path. mapAtcRpcError translates the bunkai_update_atc
// RPC's Postgres SQLSTATEs into the canonical API envelope; it always throws.

function caught(run: () => never): ApiError {
  try {
    run();
  }
  catch (err) {
    return err as ApiError;
  }
  throw new Error('mapAtcRpcError did not throw');
}

describe('mapAtcRpcError', () => {
  test('45022 version skew → 409 conflict with parsed current_version', () => {
    const err = caught(() => mapAtcRpcError({ code: '45022', message: 'version_conflict:4' }));
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ reason: 'version_conflict', current_version: 4 });
  });

  test('45022 without an embedded version → 409 conflict, no current_version', () => {
    const err = caught(() => mapAtcRpcError({ code: '45022', message: 'version_conflict' }));
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ reason: 'version_conflict' });
  });

  test('42501 insufficient role → 403 forbidden', () => {
    const err = caught(() => mapAtcRpcError({ code: '42501', message: 'forbidden' }));
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  test('P0002 missing/archived/cross-workspace ATC → 404 not_found', () => {
    const err = caught(() => mapAtcRpcError({ code: 'P0002', message: 'atc_not_found' }));
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
  });

  test('45020 AC outside user story → 422 ac_outside_user_story', () => {
    const err = caught(() => mapAtcRpcError({ code: '45020', message: 'ac_outside_user_story' }));
    expect(err.code).toBe('ac_outside_user_story');
    expect(err.status).toBe(422);
  });

  test('unknown SQLSTATE → 500 internal_error preserving the message', () => {
    const err = caught(() => mapAtcRpcError({ code: 'XX999', message: 'boom' }));
    expect(err.code).toBe('internal_error');
    expect(err.message).toBe('boom');
  });
});
