import { ApiError } from '@lib/api/error-envelope';

// BK-47 — map a bunkai_report_project_recovery_cycles RPC error (Postgres
// SQLSTATE) to the canonical API envelope. Mirrors lib/coverage/errors.ts
// exactly: the RPC only ever raises P0002 (missing / foreign / non-member
// Project — non-disclosure, same code for all three); anything else is
// unexpected. Always throws (`: never`), so the route's
// `if (error) mapRecoveryCycleRpcError(error)` is exhaustive.
export function mapRecoveryCycleRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new ApiError('not_found', 'Project not found.', {
        details: { reason: 'not_found' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
