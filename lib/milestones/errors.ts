import { ApiError } from '@lib/api/error-envelope';

// BK-205 — map a bunkai_*_milestone RPC error (Postgres SQLSTATE) to the
// canonical API envelope. The RPCs raise the milestones-domain 455xx block
// (45500 milestone_name_length, 45501 milestone_description_length, 45502
// milestone_target_date_past, 45503 milestone_target_date_too_far);
// case-insensitive/whitespace-collapsed name collisions surface as the
// native 23505 (unique_violation) from milestones_project_name_idx. 42501 /
// P0002 are the standard auth / not-found SQLSTATEs — P0002 covers both a
// missing project (create) and a missing/cross-workspace/non-member
// milestone (edit's non-disclosure split). The mapper always throws
// (`: never`), so the route's `if (error) mapMilestoneRpcError(error)` is
// exhaustive — control never falls through.

export function mapMilestoneRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      // Non-member, or (on create) a viewer — member+ write access is
      // required to create or edit milestones.
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Missing project (create) or missing/cross-workspace/non-member
      // milestone (edit) — uniform 404, no existence disclosure.
      throw new ApiError('not_found', 'Milestone not found.', {
        details: { reason: 'not_found' },
      });
    case '23505':
      // Case-insensitive, whitespace-collapsed duplicate name in the project.
      throw new ApiError('conflict', 'A milestone with this name already exists.', {
        details: { reason: 'milestone_name_taken' },
      });
    case '45500':
      throw new ApiError('validation_failed', 'Name must be between 1 and 100 characters.', {
        details: { reason: 'milestone_name_length' },
      });
    case '45501':
      throw new ApiError('validation_failed', 'Description must be 500 characters or fewer.', {
        details: { reason: 'milestone_description_length' },
      });
    case '45502':
      throw new ApiError('validation_failed', 'Target date must be today or later.', {
        details: { reason: 'milestone_target_date_past' },
      });
    case '45503':
      throw new ApiError('validation_failed', 'Target date must be within the next 5 years.', {
        details: { reason: 'milestone_target_date_too_far' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// BK-206 — map a bunkai_attach_plans_to_milestone / bunkai_detach_plan_from_milestone
// error (0112_milestone_plans.sql) to the API envelope. Same `: never` contract as the
// mapper above. 45505 deliberately carries no plan id: a plan outside the project, in
// another workspace or unknown is one indistinguishable answer (non-disclosure).
export function mapMilestonePlanRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'Attaching or detaching test plans requires the member role or higher.', {
        details: { reason: 'forbidden_role' },
      });
    case 'P0002':
      throw new ApiError('not_found', 'Milestone not found.', {
        details: { reason: 'not_found' },
      });
    case '45504':
    case '23505':
      throw new ApiError('conflict', 'A selected test plan is already attached to this milestone.', {
        details: { reason: 'milestone_plan_exists' },
      });
    case '45505':
      throw new ApiError('validation_failed', 'Only test plans of this milestone\'s project can be attached.', {
        details: { reason: 'plan_outside_project' },
      });
    case '45506':
      throw new ApiError('validation_failed', 'A milestone can have at most 50 attached test plans.', {
        details: { reason: 'milestone_plan_limit' },
      });
    case '22023':
      // Same answer as the route's Zod guard for an empty selection (422).
      throw new ApiError('validation_failed', 'Select at least one test plan to attach.', {
        details: { reason: 'plan_selection_empty' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
