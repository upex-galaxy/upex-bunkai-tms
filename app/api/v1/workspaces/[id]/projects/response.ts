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
    throw await refusalFor(db, workspaceId);
  }
}

// BK-2091: a Viewer already knows it is a member, so naming its role discloses nothing.
async function refusalFor(db: SupabaseClient<Database>, workspaceId: string): Promise<ApiError> {
  const { data, error } = await db.rpc('bunkai_is_workspace_member', { ws_id: workspaceId });
  if (error) {
    return new ApiError('internal_error', error.message);
  }
  if (data !== true) {
    return notAMember();
  }
  return new ApiError('forbidden', 'Creating a project requires the member role or higher.', {
    details: { reason: 'forbidden_role' },
  });
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

// BK-1900 — GET /api/v1/workspaces/{id}/projects. The read the Bunkai CLI uses
// to turn `--project checkout-v2` into a Project id, and to tell "Project not
// found" apart from "No ATCs found" (the ATC search answers `[]` for both).
//
// `db` MUST be the caller's own RLS-scoped client (`getAuth(ctx).db`), never
// the admin client: `projects_select_workspace_member` (0005, `deleted_at is
// null` guard since 0084) is the whole authorization, so a foreign, unknown or
// soft-deleted workspace selects nothing and answers the same empty list as a
// workspace with no projects (non-disclosure).

export const PROJECT_SLUG_MAX = 100;

export interface ProjectSummary {
  id: string
  slug: string
  name: string
  created_at: string
}

// `?slug=` is optional. Present but blank, or longer than any slug can be, is
// a caller mistake: refuse it instead of silently listing everything.
export function parseProjectSlugFilter(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const slug = raw.trim();
  if (slug.length === 0 || slug.length > PROJECT_SLUG_MAX) {
    throw new ApiError('validation_failed', `slug must be 1 to ${PROJECT_SLUG_MAX} characters when given.`, {
      details: { reason: 'slug_invalid' },
    });
  }
  return slug;
}

export async function listWorkspaceProjects(
  db: SupabaseClient<Database>,
  args: { workspaceId: string, slug: string | null },
): Promise<ProjectSummary[]> {
  let query = db
    .from('projects')
    .select('id, slug, name, created_at')
    .eq('workspace_id', args.workspaceId);
  if (args.slug !== null) {
    query = query.eq('slug', args.slug);
  }
  const { data, error } = await query.order('name', { ascending: true });
  // A failed read must never leave as `[]`: that is the answer for a
  // workspace with no projects, and the CLI would print "Project not found".
  if (error) {
    throw new ApiError('internal_error', 'The workspace\'s projects could not be read.');
  }
  return data ?? [];
}
