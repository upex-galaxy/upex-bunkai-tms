// BK-6 AC1 contract: the switch-workspace response carries the new workspace
// details (id, slug, name, role) so the UI does not need a follow-up GET /me.
//
// BK-118: extracted out of route.ts into its own module (no imports) so the
// response shape — and specifically the absence of the legacy `ok` /
// `active_workspace_id` keys the BK-83 fix left behind — is unit-testable in
// isolation. Testing route.ts's exported POST handler directly would also
// require mocking the withApiHandler/getAuth/Supabase query chain, which is
// disproportionate for a shape-only regression test; this module stays
// dependency-free so route.test.ts can assert the contract without that
// mocking overhead.
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
