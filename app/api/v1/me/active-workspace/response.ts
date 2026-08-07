// BK-6 AC1 contract: the switch-workspace response carries the new workspace
// details (id, slug, name, role) so the UI does not need a follow-up GET /me.
//
// BK-118: extracted out of route.ts into its own module so the response
// shape — and specifically the absence of the legacy `ok` /
// `active_workspace_id` keys the BK-83 fix left behind — is unit-testable in
// isolation. Testing route.ts's exported POST handler directly would also
// require mocking the withApiHandler/getAuth/Supabase query chain, which is
// disproportionate for a shape-only regression test.
//
// BK-316 added `assertSessionOnly` here for the same reason: it needs
// `ApiError`, so `buildActiveWorkspaceResponse` is no longer the only export,
// but the module still takes no route-handler-only dependencies (no
// NextRequest/ctx) — same isolation style as
// `workspaces/[id]/membership/response.ts`'s `assertSessionOnly`.
import type { Principal } from '@lib/api/principal';
import { ApiError } from '@lib/api/error-envelope';

export interface ActiveWorkspaceResponse {
  id: string
  slug: string
  name: string
  role: string | null
}

export function buildActiveWorkspaceResponse(params: ActiveWorkspaceResponse): ActiveWorkspaceResponse {
  return {
    id: params.id,
    slug: params.slug,
    name: params.name,
    role: params.role,
  };
}

// A PAT has no cookie session to rotate — POST /api/v1/me/active-workspace
// only ever set the `bk_active_ws` cookie, which GET /api/v1/me's bearer
// branch never reads (it resolves `principal.workspaceId ?? workspaces[0]`
// instead). Returning 200 for an operation that cannot take effect on that
// rail is the defect (BK-316): reject the bearer rail outright, mirroring
// `DELETE /api/v1/workspaces/{id}/membership`'s exact bearer-rejection
// precedent in this same directory tree.
export function assertSessionOnly(principal: Pick<Principal, 'via'>): void {
  if (principal.via === 'bearer') {
    throw new ApiError(
      'forbidden',
      'Personal access tokens have no switchable active workspace. Pass workspace_id explicitly on each request instead.',
    );
  }
}
