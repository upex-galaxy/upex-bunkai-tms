import { ApiError } from '@lib/api/error-envelope';

// BK-27 — map a bunkai_create_test RPC error (Postgres SQLSTATE) to the
// canonical API envelope. The RPC raises custom 45xxx codes for the domain
// rules; 42501 is a standard SQLSTATE.
export function mapTestRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case '45120':
      throw new ApiError('chain_empty', 'A Test must include at least one ATC.', {
        details: { reason: 'chain_empty' },
      });
    case '45121':
      throw new ApiError('validation_failed', 'Title must be 200 characters or fewer.', {
        details: { reason: 'title_invalid' },
      });
    case '45122':
      // Non-disclosure (INV-3): foreign-workspace and nonexistent ATCs share
      // this byte-identical response — no details, no id echo.
      throw new ApiError('not_found', 'One or more selected ATCs are not available in this workspace.');
    default:
      throw new ApiError('internal_error', error.message);
  }
}
