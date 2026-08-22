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
// BK-316 added an `assertSessionOnly` guard here; BK-499 lifted it into the
// route's `auth: 'cookie-only'` posture, where the gateway rejects the bearer
// rail before the handler body runs (the same move BK-497 made on the two
// token routes). The 403 message travelled verbatim into the posture's `why`,
// so this module is back to a single dependency-free export.

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
