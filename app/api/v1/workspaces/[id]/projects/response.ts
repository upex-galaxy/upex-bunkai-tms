import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { buildProjectLimitDetails, projectLimitMessage } from '@lib/billing/plan-limit';

// BK-992 — DB-parametrized logic for POST /api/v1/workspaces/{id}/projects,
// split out of `route.ts` so the access gate and the insert-error mapping are
// unit-testable with a fake `db` (same isolation pattern as
// `notifications/response.ts` and `membership/response.ts`).
//
// Why an explicit gate before the insert: the `bunkai_enforce_project_limit`
// trigger (migration 0077) is `BEFORE INSERT` + `security invoker`, and
// Postgres evaluates an RLS `WITH CHECK` only AFTER BEFORE-row triggers run.
// For a caller who cannot see the workspace (non-existent OR foreign), the
// trigger's plan lookup is RLS-filtered to NULL, falls into the `-1` branch
// and raises 45700 before the insert policy ever gets to raise 42501 — so the
// caller got 422 `project_limit_reached` instead of 403 `not_a_member`.
// Checking write access first, with the same helper the insert policy uses,
// restores the 403 and makes non-existent and foreign workspaces
// indistinguishable (non-disclosure).

const NOT_A_MEMBER_MESSAGE = 'You must be a member of this workspace to create a project.';

function notAMember(): ApiError {
  return new ApiError('forbidden', NOT_A_MEMBER_MESSAGE, {
    details: { reason: 'not_a_member' },
  });
}

// Throws 403 `not_a_member` unless the caller is an active member with
// role >= member of a live workspace. `bunkai_can_write_workspace` (0005,
// re-created in 0084 with the `deleted_at is null` guard) is the exact
// predicate of the projects INSERT policy and returns false for a workspace
// id that does not exist, one the caller is not a writer of, and a
// soft-deleted one — so all three get the identical 403, consistent with the
// actor helpers that 0089 (BK-991) made refuse a soft-deleted workspace
// exactly like a non-member.
export async function assertCanCreateProject(
  db: SupabaseClient<Database>,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await db.rpc('bunkai_can_write_workspace', { ws_id: workspaceId });
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (data !== true) {
    throw notAMember();
  }
}

function plainLimitError(): ApiError {
  return new ApiError('project_limit_reached', 'This workspace has reached its plan\'s project limit.', {
    details: { reason: 'project_limit_reached' },
  });
}

// Maps a Postgrest error from the `projects` insert to the house envelope.
export function mapCreateProjectError(error: { code?: string, message: string }): never {
  // SQLSTATE 23505 = unique_violation on projects(workspace_id, slug).
  if (error.code === '23505') {
    throw new ApiError('conflict', 'A project with this slug already exists in the workspace.', {
      details: { reason: 'slug_duplicate_in_workspace' },
    });
  }
  // Backstop for a race (membership revoked between the gate and the insert).
  if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
    throw notAMember();
  }
  // 45700 = bunkai_enforce_project_limit_trigger (migration 0077, BK-230):
  // the workspace's Billing Plan project cap is already at or over its
  // limit. See lib/billing/plan-tiers.ts for the ladder (Community 3,
  // Cloud 50, Enterprise unlimited). Only reachable by writers, because
  // `assertCanCreateProject` runs first. The route enriches this refusal with
  // `projectLimitReached` (BK-232); this branch is the context-free fallback.
  if (error.code === '45700') {
    throw plainLimitError();
  }
  throw new ApiError('internal_error', error.message);
}

// BK-232 — the 422 for a refused creation, enriched so the UI can explain it
// without a second round trip: the effective plan, the cap, the live count and
// who the owner is. The message is role-aware (owner: upgrade; anyone else:
// ask the owner). If the context cannot be read the plain 422 still goes out:
// a refused creation must never turn into a 500 because of the explanation.
export async function projectLimitReached(
  db: SupabaseClient<Database>,
  workspaceId: string,
): Promise<ApiError> {
  try {
    const details = await buildProjectLimitDetails(db, workspaceId);
    return new ApiError('project_limit_reached', projectLimitMessage(details), { details });
  }
  catch {
    return plainLimitError();
  }
}
