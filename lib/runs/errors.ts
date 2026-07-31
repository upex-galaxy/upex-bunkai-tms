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
    case '45206':
      // BK-39 — the run is already closed (passed/failed/aborted). AC-exact copy.
      // 409 conflict: the request is well-formed but the run's state forbids it.
      // First-wins — a concurrent finish/abort loser re-reads a terminal status
      // and lands here.
      throw new ApiError('conflict', 'This run is already closed and cannot be finished.', {
        details: { reason: 'run_not_finishable' },
      });
    case '45207':
      // BK-39 — RPC backstop for a verdict outside passed/failed. The HTTP route's
      // Zod layer catches a missing/invalid verdict (with the AC-exact message)
      // BEFORE the RPC runs, so an API caller never reaches here; this only fires
      // for a direct (non-HTTP) RPC caller.
      throw new ApiError('validation_failed', 'A final verdict of passed or failed is required.', {
        details: { reason: 'finish_verdict_invalid' },
      });
    case '45208':
      // BK-37 — RPC backstop for a run-history outcome filter outside
      // passed/failed/aborted (notably `running`, which is not an outcome — an
      // in-progress run is never history). The route's Zod layer rejects it
      // BEFORE the RPC runs, so an API caller never reaches here; this only
      // fires for a direct (non-HTTP) RPC caller.
      throw new ApiError('validation_failed', 'The outcome filter must be one of passed, failed, or aborted.', {
        details: { reason: 'run_outcome_invalid' },
      });
    case '45209':
      // BK-37 — RPC backstop for a HALF-supplied keyset cursor (exactly one of
      // started_at / id). The keyset position is the pair, so one half is not a
      // position; the RPC raises rather than silently serving the first page.
      // The route decodes the opaque token BEFORE the RPC runs and answers 400
      // `bad_request` for anything undecodable, so an API caller never reaches
      // here; this only fires for a direct (non-HTTP) RPC caller. Same code and
      // same copy as that route-level rejection — one cursor contract, one
      // answer, wherever the bad cursor is caught.
      throw new ApiError('bad_request', 'The cursor is not a valid page token.', {
        details: { reason: 'run_cursor_invalid' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
