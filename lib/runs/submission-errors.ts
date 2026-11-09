import { ApiError } from '@lib/api/error-envelope';

// BK-222 — map a bunkai_submit_automated_run RPC error (Postgres SQLSTATE) to
// the canonical API envelope. Dedicated mapper: the shared `mapRunRpcError`
// answers P0002 with "Run not found." and 42501 with the membership copy, while
// here P0002 is a missing/foreign Test (AC-9) and the offending positions or
// field arrive in the Postgres DETAIL (PostgREST `details`). Always throws.
export interface SubmissionRpcError {
  code?: string
  message: string
  details?: string | null
}

function listOf(details: string | null | undefined): number[] {
  return (details ?? '')
    .split(',')
    .map(part => Number.parseInt(part, 10))
    .filter(n => Number.isInteger(n));
}

export function mapSubmissionRpcError(error: SubmissionRpcError): never {
  const detail = error.details ?? '';
  switch (error.code) {
    case 'P0002':
      // Missing Test, a Test in another workspace and a non-member all land here
      // (AC-9): byte-identical, nothing disclosed about other workspaces.
      throw new ApiError('not_found', 'Test not found.', { details: { reason: 'test_not_found' } });
    case '42501':
      throw new ApiError('forbidden', 'You do not have permission to submit runs in this workspace.', {
        details: { reason: 'insufficient_permissions' },
      });
    case '45201': {
      const name = detail.trim();
      throw new ApiError(
        'environment_invalid',
        name
          ? `Environment "${name}" is not configured for this Test's Project.`
          : 'The environment is not configured for this Test\'s Project.',
        { details: { reason: 'environment_invalid', environment: name || null } },
      );
    }
    case '45202':
      throw new ApiError('no_executable_steps', 'This Test has no executable steps and cannot be submitted.', {
        details: { reason: 'no_executable_steps' },
      });
    case '45231':
      throw new ApiError('conflict', 'This idempotency_key was already used with a different payload.', {
        details: { reason: 'idempotency_key_conflict' },
      });
    case '45232':
      throw new ApiError(
        'validation_failed',
        'The verdict must be one of: passed, failed; each step result must be one of: pass, fail, block.',
        { details: { reason: 'vocabulary_invalid' } },
      );
    case '45233': {
      const missing = listOf(detail);
      throw new ApiError(
        'validation_failed',
        `Every chain step needs a result; missing positions: ${missing.join(', ')}.`,
        { details: { reason: 'steps_incomplete', missing_positions: missing } },
      );
    }
    case '45234':
      throw new ApiError('validation_failed', `The step positions are invalid for this Test (${detail}).`, {
        details: { reason: 'steps_invalid' },
      });
    case '45235':
      throw new ApiError('validation_failed', 'The verdict is inconsistent with the step results.', {
        details: { reason: 'verdict_inconsistent' },
      });
    case '45236':
      throw new ApiError('validation_failed', `Field out of bounds: ${detail}.`, {
        details: { reason: 'field_invalid', field: detail },
      });
    case '45237':
      throw new ApiError('unauthorized', 'The access token is not valid for this request.', {
        details: { reason: 'token_invalid' },
      });
    case '45238':
      throw new ApiError('forbidden', 'This token is not scoped to a workspace; it cannot submit runs.', {
        details: { reason: 'token_not_workspace_scoped' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
