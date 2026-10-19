import { ApiError } from '@lib/api/error-envelope';
import { evidenceRefusalError, mapAttachmentRpcError } from '@lib/runs/attachment-errors';
import { describe, expect, test } from 'bun:test';

// BK-593 - the attachment RPC error mapper. SQLSTATE 45216-45219 plus 42501 / P0002 / 22023.

function capture(error: { code?: string, message: string, hint?: string | null }): ApiError {
  try {
    mapAttachmentRpcError(error);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('mapAttachmentRpcError did not throw');
}

describe('mapAttachmentRpcError', () => {
  test('42501 -> forbidden 403 (a viewer may not write)', () => {
    const err = capture({ code: '42501', message: 'forbidden' });
    expect([err.code, err.status]).toEqual(['forbidden', 403]);
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  test('P0002 -> not_found 404, naming the step or the attachment, never disclosing which case', () => {
    const step = capture({ code: 'P0002', message: 'run_step_not_found' });
    expect([step.code, step.status, step.message]).toEqual(['not_found', 404, 'Run step not found.']);
    const attachment = capture({ code: 'P0002', message: 'attachment_not_found' });
    expect([attachment.status, attachment.message]).toEqual([404, 'Attachment not found.']);
    expect(attachment.details).toEqual({ reason: 'not_found' });
  });

  test('45216 -> conflict 409, reason run_not_open', () => {
    const err = capture({ code: '45216', message: 'attachment_run_closed' });
    expect([err.code, err.status]).toEqual(['conflict', 409]);
    expect(err.details).toEqual({ reason: 'run_not_open' });
  });

  test('45217 -> attachment_limit_exceeded 422 with the frozen quota copy per hint', () => {
    for (const hint of ['step_count', 'step_bytes']) {
      const err = capture({ code: '45217', message: 'attachment_limit_exceeded', hint });
      expect([err.code, err.status]).toEqual(['attachment_limit_exceeded', 422]);
      expect(err.message).toBe('This step already holds the maximum evidence (10 images or 50 MiB).');
      expect(err.details).toEqual({ reason: hint });
    }
    const run = capture({ code: '45217', message: 'attachment_limit_exceeded', hint: 'run_bytes' });
    expect(run.message).toBe('This Run already holds the maximum evidence (250 MiB).');
    expect(run.details).toEqual({ reason: 'run_bytes' });
    const file = capture({ code: '45217', message: 'attachment_limit_exceeded', hint: 'file_bytes' });
    expect(file.message).toBe('Images must be 10 MiB or smaller.');
    expect(capture({ code: '45217', message: 'attachment_limit_exceeded' }).details).toEqual({ reason: 'file_bytes' });
  });

  test('45218 -> conflict 409, reason pending_expired', () => {
    const err = capture({ code: '45218', message: 'attachment_pending_expired' });
    expect([err.code, err.status]).toEqual(['conflict', 409]);
    expect(err.details).toEqual({ reason: 'pending_expired' });
  });

  test('45219 -> forbidden 403, reason not_uploader', () => {
    const err = capture({ code: '45219', message: 'attachment_not_removable', hint: 'not_uploader' });
    expect([err.code, err.status]).toEqual(['forbidden', 403]);
    expect(err.details).toEqual({ reason: 'not_uploader' });
  });

  test('22023 -> validation_failed 422; anything else -> internal_error 500', () => {
    const invalid = capture({ code: '22023', message: 'attachment_content_type_invalid' });
    expect([invalid.code, invalid.status]).toEqual(['validation_failed', 422]);
    const other = capture({ code: 'XX000', message: 'boom' });
    expect([other.code, other.status, other.message]).toEqual(['internal_error', 500, 'boom']);
  });
});

describe('evidenceRefusalError', () => {
  test('maps each refusal to its status, envelope code and machine reason', () => {
    const cases: Array<[Parameters<typeof evidenceRefusalError>[0], number, string, string]> = [
      ['unsupported_type', 415, 'unsupported_media_type', 'unsupported_media_type'],
      ['too_large', 413, 'file_too_large', 'file_too_large'],
      ['empty', 422, 'validation_failed', 'empty_file'],
      ['invalid_image', 422, 'validation_failed', 'content_mismatch'],
      ['type_mismatch', 422, 'validation_failed', 'content_mismatch'],
      ['animated', 422, 'validation_failed', 'animated_image'],
      ['invalid_filename', 422, 'validation_failed', 'invalid_filename'],
    ];
    for (const [refusal, status, code, reason] of cases) {
      const err = evidenceRefusalError(refusal, 'copy');
      expect([err.status, err.code, err.message, err.details]).toEqual([status, code, 'copy', { reason }]);
    }
  });
});
