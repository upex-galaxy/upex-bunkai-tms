import { ApiError } from '@lib/api/error-envelope';
import { BUG_EVIDENCE_MESSAGES } from '@lib/bugs/constants';
import { EVIDENCE_MESSAGES } from '@lib/storage/evidence-policy';

// BK-594 - map a defect evidence upload RPC error (bunkai_init_bug_evidence,
// bunkai_commit_bug_evidence, bunkai_discard_bug_evidence; migration 0131) to the canonical
// API envelope. Same shape as lib/runs/attachment-errors.ts. The mapper always throws.
//   42501  a viewer may not attach                       -> 403
//   P0002  missing project / attachment, foreign, no session -> 404 (non-disclosing)
//   45303  the draft cap; HINT count | bytes | file_bytes -> 422 attachment_limit_exceeded
//   45317  a filed defect's evidence is frozen            -> 409
//   45318  the upload window lapsed                       -> 409
//   22023  an argument the route should have refused      -> 422
export function mapBugEvidenceRpcError(error: { code?: string, message: string, hint?: string | null }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      throw new ApiError('not_found', error.message === 'project_not_found' ? 'Project not found.' : 'Attachment not found.', {
        details: { reason: 'not_found' },
      });
    case '45303':
      throw limitExceeded(error.hint ?? null);
    case '45317':
      throw new ApiError('conflict', BUG_EVIDENCE_MESSAGES.frozen, { details: { reason: 'evidence_frozen' } });
    case '45318':
      throw new ApiError('conflict', BUG_EVIDENCE_MESSAGES.expired, { details: { reason: 'pending_expired' } });
    case '22023':
      throw new ApiError('validation_failed', 'The attachment details are not valid.', {
        details: { reason: 'invalid_attachment' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

function limitExceeded(hint: string | null): ApiError {
  switch (hint) {
    case 'count':
      return new ApiError('attachment_limit_exceeded', BUG_EVIDENCE_MESSAGES.count, { details: { reason: 'defect_count' } });
    case 'bytes':
      return new ApiError('attachment_limit_exceeded', BUG_EVIDENCE_MESSAGES.bytes, { details: { reason: 'defect_bytes' } });
    default:
      return new ApiError('attachment_limit_exceeded', EVIDENCE_MESSAGES.too_large, { details: { reason: 'file_bytes' } });
  }
}
