import { ApiError } from '@lib/api/error-envelope';

// BK-148 — map a bunkai_*_environment RPC error (Postgres SQLSTATE) to the
// canonical API envelope. The RPCs raise the environments-domain 452xx block
// (45210 environment_name_length, 45211 environment_in_use); case-insensitive
// name collisions surface as the native 23505 (unique_violation) from the
// project_environments_project_name_idx index; the runs.environment_id FK
// ON DELETE RESTRICT is the defensive backstop (23503) for the in-use guard.
// 42501 / P0002 are the standard auth / not-found SQLSTATEs from the shared
// bunkai_assert_actor_can_write_project gate. The mapper always throws
// (`: never`), so the route's `if (error) mapEnvironmentRpcError(error)` is
// exhaustive — control never falls through.

// Parse the referencing-run count out of the 45211 RPC message
// ('environment_in_use: N run(s) reference this environment'). Returns null when
// the message does not carry a count (defensive — e.g. the 23503 FK backstop).
function parseRunCount(message: string): number | null {
  const match = /:\s*(\d+)\s+run/.exec(message);
  if (!match) { return null; }
  const n = Number.parseInt(match[1] ?? '', 10);
  // Defense-in-depth: the RPC's `if v_run_count > 0` guard only raises 45211 for
  // counts >= 1, so a 0 can never reach here — but if it ever did, treat it as
  // null so inUseMessage() falls back to the generic in-use copy instead of
  // emitting a nonsensical "0 run(s)" message.
  if (Number.isFinite(n) && n > 0) { return n; }
  return null;
}

// Build the AC-exact in-use block message, embedding the count when known.
function inUseMessage(count: number | null): string {
  if (count === null) {
    return 'This environment is in use by one or more runs and cannot be removed.';
  }
  return `This environment is in use by ${count} run${count === 1 ? '' : 's'} and cannot be removed.`;
}

export function mapEnvironmentRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      // Non-member (or a non-disclosing missing-project) — member+ write access
      // is required to manage environments.
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Missing / cross-workspace project or environment — uniform 404, no
      // existence disclosure.
      throw new ApiError('not_found', 'Environment not found.', {
        details: { reason: 'not_found' },
      });
    case '23505':
      // Case-insensitive duplicate name within the project.
      throw new ApiError('conflict', 'An environment with this name already exists.', {
        details: { reason: 'environment_name_taken' },
      });
    case '45210':
      // Name empty or > 50 chars after trim (the Zod layer guards this too; this
      // is the under-RPC backstop).
      throw new ApiError('validation_failed', 'Name must be between 1 and 50 characters.', {
        details: { reason: 'environment_name_length' },
      });
    case '45211':
    case '23503': {
      // Delete-guard: a run references this environment. 45211 is the pre-counted
      // raise (message carries the count); 23503 is the FK backstop (no count).
      const count = error.code === '45211' ? parseRunCount(error.message) : null;
      throw new ApiError('conflict', inUseMessage(count), {
        details: { reason: 'environment_in_use', ...(count !== null ? { run_count: count } : {}) },
      });
    }
    default:
      throw new ApiError('internal_error', error.message);
  }
}
