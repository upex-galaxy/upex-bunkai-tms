import { ApiError } from '@lib/api/error-envelope';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { SAVED_VIEW_COPY } from './constants';
import { mapSavedViewDbError, parseSavedViewInput, savedViewStateRefusal } from './errors';
import { SavedViewCreateBodySchema, SavedViewPatchBodySchema } from './validation';

// BK-443 — error contract. The default branch must never leak a database
// message, and must leave one server-side log line with the real code.

function catchApiError(fn: () => unknown): ApiError {
  try {
    fn();
  }
  catch (error) {
    if (error instanceof ApiError) { return error; }
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('mapSavedViewDbError', () => {
  test('23505 -> 409 conflict saved_view_name_taken', () => {
    const e = catchApiError(() => mapSavedViewDbError({ code: '23505', message: 'duplicate key value violates unique constraint "user_view_state_name_key_idx"' }));
    expect(e.status).toBe(409);
    expect(e.code).toBe('conflict');
    expect(e.message).toBe(SAVED_VIEW_COPY.nameTaken);
    expect(e.details).toEqual({ reason: 'saved_view_name_taken' });
  });

  test('45100 -> 409 conflict saved_view_limit_reached', () => {
    const e = catchApiError(() => mapSavedViewDbError({ code: '45100', message: 'saved_view_limit_reached' }));
    expect(e.status).toBe(409);
    expect(e.message).toBe(SAVED_VIEW_COPY.limitReached);
    expect(e.details).toEqual({ reason: 'saved_view_limit_reached' });
  });

  test('42501 on create -> 404 project_not_found (no existence signal)', () => {
    const e = catchApiError(() => mapSavedViewDbError({ code: '42501', message: 'new row violates row-level security policy' }, 'create'));
    expect(e.status).toBe(404);
    expect(e.details).toEqual({ reason: 'project_not_found' });
  });

  test('42501 on a change -> 404 saved_view_not_found', () => {
    const e = catchApiError(() => mapSavedViewDbError({ code: '42501', message: 'x' }, 'change'));
    expect(e.status).toBe(404);
    expect(e.details).toEqual({ reason: 'saved_view_not_found' });
  });

  test('23514 and 45101 -> 422 saved_view_invalid', () => {
    for (const code of ['23514', '45101']) {
      const e = catchApiError(() => mapSavedViewDbError({ code, message: 'check constraint "user_view_state_name_check"' }));
      expect(e.status).toBe(422);
      expect(e.details).toEqual({ reason: 'saved_view_invalid' });
      expect(e.message).not.toContain('user_view_state');
    }
  });
});

describe('mapSavedViewDbError default branch', () => {
  let spy: ReturnType<typeof spyOn>;
  beforeEach(() => { spy = spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { spy.mockRestore(); });

  test('answers a fixed 500 and never echoes the database message', () => {
    const e = catchApiError(() => mapSavedViewDbError({ code: 'XX000', message: 'relation "user_view_state" secret detail' }));
    expect(e.status).toBe(500);
    expect(e.message).toBe(SAVED_VIEW_COPY.unavailable);
    expect(JSON.stringify(e)).not.toContain('secret detail');
  });

  test('logs exactly one structured line carrying the real code and message', () => {
    catchApiError(() => mapSavedViewDbError({ code: 'XX000', message: 'boom' }));
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
    expect(line.event).toBe('saved_views_unmapped_db_error');
    expect(line.code).toBe('XX000');
    expect(line.message).toBe('boom');
  });

  test('logs a null code when the error has none', () => {
    catchApiError(() => mapSavedViewDbError({ message: 'no code' }));
    const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
    expect(line.code).toBeNull();
  });
});

describe('parseSavedViewInput', () => {
  test('returns the parsed data', () => {
    expect(parseSavedViewInput(SavedViewCreateBodySchema, { view_kind: 'bugs', name: ' A ', state: { severity: 'P1' } }).name).toBe('A');
  });

  test('maps a name refusal to 422 with its reason', () => {
    const e = catchApiError(() => parseSavedViewInput(SavedViewCreateBodySchema, { view_kind: 'bugs', name: '', state: { severity: 'P1' } }));
    expect(e.status).toBe(422);
    expect(e.code).toBe('validation_failed');
    expect((e.details as { reason: string }).reason).toBe('name_length');
  });

  test('maps a bad view_kind to view_kind_invalid and a bad state shape to state_invalid', () => {
    const kind = catchApiError(() => parseSavedViewInput(SavedViewCreateBodySchema, { view_kind: 'x', name: 'a', state: { severity: 'P1' } }));
    expect((kind.details as { reason: string }).reason).toBe('view_kind_invalid');
    const state = catchApiError(() => parseSavedViewInput(SavedViewCreateBodySchema, { view_kind: 'bugs', name: 'a', state: 'nope' }));
    expect((state.details as { reason: string }).reason).toBe('state_invalid');
  });

  test('maps an empty PATCH to body_empty', () => {
    const e = catchApiError(() => parseSavedViewInput(SavedViewPatchBodySchema, {}));
    expect((e.details as { reason: string }).reason).toBe('body_empty');
  });
});

describe('savedViewStateRefusal', () => {
  test('carries the reason and the fixed copy', () => {
    expect(savedViewStateRefusal('state_empty').message).toBe(SAVED_VIEW_COPY.nothingToSave);
    expect(savedViewStateRefusal('date_range_inverted').details).toEqual({ reason: 'date_range_inverted' });
    expect(savedViewStateRefusal('state_invalid').status).toBe(422);
  });
});
