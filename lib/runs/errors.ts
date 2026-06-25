import { ApiError } from '@lib/api/error-envelope';

// BK-34 — map a bunkai_create_run / bunkai_get_run_expanded RPC error (Postgres
// SQLSTATE) to the canonical API envelope. The RPC raises the runs-domain 452xx
// block for the domain rules; 42501/P0002 are standard SQLSTATEs. The mapper
// always throws (`: never`), so the route's `if (error) mapRunRpcError(error)` is
// exhaustive — control never falls through.
export function mapRunRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      // Non-disclosure: a non-member must not learn the Test exists. Foreign /
      // nonexistent Tests collapse to this same 403 (the RPC raises 42501 for
      // both the missing-Test and the non-member cases).
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Read path (bunkai_get_run_expanded): missing / foreign / non-member Run
      // all return a byte-identical 404 — no existence disclosure.
      throw new ApiError('not_found', 'Run not found.', {
        details: { reason: 'not_found' },
      });
    case '45200':
      // The Zod layer guards executor_mode shape too; this is the under-RPC
      // backstop (e.g. a PAT caller sending an out-of-range mode).
      throw new ApiError('validation_failed', 'Executor mode must be one of human, agent, or ci.', {
        details: { reason: 'executor_mode_invalid' },
      });
    case '45201':
      throw new ApiError('environment_invalid', 'The selected environment is not configured for this Project.', {
        details: { reason: 'environment_invalid' },
      });
    case '45202':
      throw new ApiError('no_executable_steps', 'Add at least one ATC step to this Test before starting a run.', {
        details: { reason: 'no_executable_steps' },
      });
    case '45204':
      // BK-36 — the run is already closed (passed/failed/aborted). AC3-exact copy.
      // 409 conflict: the request is well-formed but the run's state forbids it.
      throw new ApiError('conflict', 'This run is already closed and cannot be aborted.', {
        details: { reason: 'run_not_abortable' },
      });
    case '45205':
      // BK-36 — RPC backstop for a reason outside 3..500. The HTTP route's Zod
      // layer catches BOTH bounds (too-short with the AC-exact message, too-long
      // with its own) BEFORE the RPC runs, so an API caller never reaches here;
      // this only fires for a direct (non-HTTP) RPC caller. Keep the message
      // length-agnostic so it is correct for either bound.
      throw new ApiError('validation_failed', 'The reason must be between 3 and 500 characters.', {
        details: { reason: 'abort_reason_invalid' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
