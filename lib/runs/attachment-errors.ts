import { ApiError } from '@lib/api/error-envelope';
import { EVIDENCE_MESSAGES } from '@lib/storage/evidence-policy';

// BK-593 - map a run step attachment RPC error (Postgres SQLSTATE) to the canonical API
// envelope. The RPCs raise the runs-domain 452xx block (45216 attachment_run_closed, 45217
// attachment_limit_exceeded with the reason in the error HINT, 45218 attachment_pending_expired,
// 45219 attachment_not_removable) plus the standard 42501 (a viewer may not write) and P0002
// (missing, foreign workspace, no session: non-disclosing). The mapper always throws
// (`: never`), so the route's `if (error) mapAttachmentRpcError(error)` is exhaustive.

export function mapAttachmentRpcError(error: { code?: string, message: string, hint?: string | null }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Init raises run_step_not_found, commit and remove raise attachment_not_found. Both
      // are the same 404 to the caller; only the noun differs.
      throw new ApiError('not_found', error.message === 'run_step_not_found' ? 'Run step not found.' : 'Attachment not found.', {
        details: { reason: 'not_found' },
      });
    case '45216':
      // The first terminal outcome wins: a Run that closed first refuses the late upload.
      throw new ApiError('conflict', 'This run is already closed and cannot accept evidence changes.', {
        details: { reason: 'run_not_open' },
      });
    case '45217':
      throw limitExceeded(error.hint ?? null);
    case '45218':
      throw new ApiError('conflict', 'This upload expired. Start a new upload.', {
        details: { reason: 'pending_expired' },
      });
    case '45219':
      throw new ApiError('forbidden', 'Only the person who attached this image can remove it.', {
        details: { reason: 'not_uploader' },
      });
    case '22023':
      // The route validates first; this fires only for a direct (non-HTTP) RPC caller.
      throw new ApiError('validation_failed', 'The attachment details are not valid.', {
        details: { reason: 'invalid_attachment' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

function limitExceeded(hint: string | null): ApiError {
  switch (hint) {
    case 'step_count':
    case 'step_bytes':
      return new ApiError('attachment_limit_exceeded', EVIDENCE_MESSAGES.step_quota, { details: { reason: hint } });
    case 'run_bytes':
      return new ApiError('attachment_limit_exceeded', EVIDENCE_MESSAGES.run_quota, { details: { reason: hint } });
    default:
      // file_bytes (size outside 1 byte..10 MiB): the route answers 413/422 first.
      return new ApiError('attachment_limit_exceeded', EVIDENCE_MESSAGES.too_large, { details: { reason: 'file_bytes' } });
  }
}
