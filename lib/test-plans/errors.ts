import { ApiError } from '@lib/api/error-envelope';

// BK-202 — map a bunkai_*_test_plan RPC error (Postgres SQLSTATE) to the
// canonical API envelope. The RPCs raise the test-plans-domain 456xx block
// (45600 test_plan_name_length, 45601 test_plan_description_length, 45602
// test_plan_goal_length, 45603 test_plan_not_open); case-insensitive /
// whitespace-collapsed name collisions surface as the native 23505
// (unique_violation) from test_plans_project_name_idx, on BOTH the create and
// the rename path (ratified T5 — one index, one rule). 42501 / P0002 are the
// standard auth / not-found SQLSTATEs — P0002 covers both a missing project
// (create) and a missing / cross-workspace / non-member plan (edit's
// non-disclosure split). The mapper always throws (`: never`), so the route's
// `if (error) mapTestPlanRpcError(error)` is exhaustive — control never falls
// through.
//
// Copy is the ratified wording from the 2026-08-14 PO + Tech Lead ruling
// (Technical Question 1): the shorter house-convention strings the sibling
// Milestone entity already ships, with "milestone" swapped for "test plan".
// The mockup's longer variant ("A plan named "X" already exists in this
// project.") was explicitly NOT chosen — the ruling names consistency across
// the app's error surface as the reason.

export function mapTestPlanRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      // Non-member, or a viewer — member+ write access is required to create
      // or edit test plans. Re-derived live inside the RPC on every call, so
      // a stale client-cached role never carries a write.
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Missing project (create) or missing / cross-workspace / non-member
      // test plan (edit) — uniform 404, no existence disclosure.
      throw new ApiError('not_found', 'Test plan not found.', {
        details: { reason: 'not_found' },
      });
    case '23505':
      // Case-insensitive, whitespace-collapsed duplicate name in the project.
      throw new ApiError('conflict', 'A test plan with this name already exists.', {
        details: { reason: 'test_plan_name_taken' },
      });
    case '45600':
      throw new ApiError('validation_failed', 'Name must be between 1 and 100 characters.', {
        details: { reason: 'test_plan_name_length' },
      });
    case '45601':
      throw new ApiError('validation_failed', 'Description must be 500 characters or fewer.', {
        details: { reason: 'test_plan_description_length' },
      });
    case '45602':
      throw new ApiError('validation_failed', 'Goal must be 100 characters or fewer.', {
        details: { reason: 'test_plan_goal_length' },
      });
    case '45603':
      // Unreachable through anything BK-202 ships — no write path can set a
      // plan to closed. Mapped anyway so the RPC's structural guard has a
      // defined API surface the moment Close (BK-207) makes it reachable.
      throw new ApiError('conflict', 'This test plan is closed and can no longer be edited.', {
        details: { reason: 'test_plan_not_open' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
