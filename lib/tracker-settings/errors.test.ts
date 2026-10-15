import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { mapTrackerSettingsRpcError } from './errors';
import { TRACKER_SETTINGS_MESSAGES } from './validation';

// BK-371 — SQLSTATE -> envelope table. The mapper always throws.

function caught(code: string | undefined, message = 'x'): ApiError {
  try {
    mapTrackerSettingsRpcError({ code, message });
  }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('mapper did not throw');
}

describe('mapTrackerSettingsRpcError', () => {
  it('maps P0002 to a 404 with no disclosure', () => {
    const error = caught('P0002', 'project_not_found');
    expect(error.status).toBe(404);
    expect(error.code).toBe('not_found');
  });

  it('maps 42501 to 403 admin_required with the frozen copy', () => {
    const error = caught('42501', 'forbidden');
    expect(error.status).toBe(403);
    expect(error.code).toBe('forbidden');
    expect(error.message).toBe('You no longer have permission to change this. Reload to see the current settings.');
    expect((error.details as { reason: string }).reason).toBe('admin_required');
  });

  it.each([
    ['45410', 'invalid_destination_key', TRACKER_SETTINGS_MESSAGES.invalid_destination_key],
    ['45411', 'destination_required', TRACKER_SETTINGS_MESSAGES.destination_required],
    ['45412', 'invalid_issue_type', TRACKER_SETTINGS_MESSAGES.invalid_issue_type],
  ])('maps %s to 422 %s', (code, reason, message) => {
    const error = caught(code);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_failed');
    expect(error.message).toBe(message);
    expect((error.details as { reason: string }).reason).toBe(reason);
  });

  it('maps 45413 to 409 carrying the queue size parsed from the message', () => {
    const error = caught('45413', 'queue_confirmation_required: 37 defect(s) would be queued');
    expect(error.status).toBe(409);
    expect(error.code).toBe('conflict');
    expect(error.details).toEqual({ reason: 'queue_confirmation_required', queue_count: 37 });
  });

  it('keeps the 409 when the count cannot be parsed, without inventing one', () => {
    const error = caught('45413', 'queue_confirmation_required');
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'queue_confirmation_required' });
  });

  it('maps 45414 to a 409 that tells the user nothing was saved', () => {
    const error = caught('45414', 'queue_count_mismatch: expected 3, queued 4');
    expect(error.status).toBe(409);
    expect((error.details as { reason: string }).reason).toBe('queue_count_mismatch');
    expect(error.message).toContain('Nothing was saved');
  });

  it('turns anything else into a 500 without leaking the database message', () => {
    const error = caught('XX000', 'relation "bugs" exploded at secret_host');
    expect(error.status).toBe(500);
    expect(error.message).not.toContain('secret_host');
    expect(caught(undefined).status).toBe(500);
  });
});
