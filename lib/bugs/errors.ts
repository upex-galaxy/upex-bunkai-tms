import { ApiError } from '@lib/api/error-envelope';

// BK-40 — map a bunkai_create_bug / bunkai_list_project_bugs RPC error
// (Postgres SQLSTATE) to the canonical API envelope. The RPCs raise the bugs-
// domain 453xx block for the domain rules; 42501/P0002 are standard
// SQLSTATEs. Mirrors lib/runs/errors.ts's switch-on-SQLSTATE shape. The mapper
// always throws (`: never`), so `if (error) mapBugRpcError(error)` is
// exhaustive — control never falls through.
export function mapBugRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Non-disclosure: a missing/foreign project OR a module outside it both
      // collapse into the SAME not_found — never leak WHICH one caused it.
      throw new ApiError('not_found', 'Project or module not found.', {
        details: { reason: 'not_found' },
      });
    case '45300':
      throw new ApiError('validation_failed', 'The module must belong to the current project.', {
        details: { reason: 'module_outside_project' },
      });
    case '45301':
      // RPC backstop — the Zod layer (lib/bugs/validation.ts) is the primary
      // guard and carries the AC-exact wording; a direct/non-HTTP RPC caller
      // lands here instead.
      throw new ApiError('validation_failed', 'Title must be between 5 and 200 characters.', {
        details: { reason: 'title_invalid' },
      });
    case '45302':
      throw new ApiError('validation_failed', 'Severity must be one of P1, P2, P3, or P4.', {
        details: { reason: 'severity_invalid' },
      });
    case '45303':
      throw new ApiError('validation_failed', 'Evidence links cannot exceed 10.', {
        details: { reason: 'evidence_limit_exceeded' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
