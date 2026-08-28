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

  test('45024 tags limit exceeded → 422 validation_failed (BK-144 RPC backstop)', () => {
    const err = caught(() => mapAtcRpcError({ code: '45024', message: 'atc_tags_limit_exceeded' }));
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'tags_limit_exceeded' });
  });

  test('unknown SQLSTATE → 500 internal_error preserving the message', () => {
    const err = caught(() => mapAtcRpcError({ code: 'XX999', message: 'boom' }));
    expect(err.code).toBe('internal_error');
    expect(err.message).toBe('boom');
  });

  // BK-622 — before this case existed, 23514 fell through to the `default`
  // branch above (like the XX999 case does), throwing `internal_error` → HTTP
  // 500 with the raw Postgres constraint text as the message. This pins the
  // real Postgres check_violation message shape for the
  // `atcs_title_min_length` constraint (0058_atc_title_min_length.sql,
  // confirmed live on the shared instance: `check (length(title) >= 3) not
  // valid` — NOT VALID still enforces on new/updated rows, only skips the
  // pre-existing-row backfill scan).
  test('BK-622: 23514 on atcs_title_min_length → 422 validation_failed, not 500', () => {
    const err = caught(() => mapAtcRpcError({
      code: '23514',
      message: 'new row for relation "atcs" violates check constraint "atcs_title_min_length"',
    }));
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'title_too_short' });
  });

  test('BK-622: 23514 message never leaks the raw Postgres constraint text to the caller', () => {
    const err = caught(() => mapAtcRpcError({
      code: '23514',
      message: 'new row for relation "atcs" violates check constraint "atcs_title_min_length"',
    }));
    expect(err.message).not.toContain('violates check constraint');
    expect(err.message).not.toContain('relation "atcs"');
  });

  test('BK-622: 23514 on an unrecognized constraint → 422 validation_failed, generic reason, no raw text', () => {
    const err = caught(() => mapAtcRpcError({
      code: '23514',
      message: 'new row for relation "atcs" violates check constraint "atcs_tags_max_10"',
    }));
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'check_constraint_violation' });
    expect(err.message).not.toContain('atcs_tags_max_10');
  });
});
