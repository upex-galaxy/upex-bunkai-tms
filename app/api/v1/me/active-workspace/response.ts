// BK-6 AC1 contract: the switch-workspace response carries the new workspace
// details (id, slug, name, role) so the UI does not need a follow-up GET /me.
//
// BK-118: extracted out of route.ts into its own module (no imports) so the
// response shape — and specifically the absence of the legacy `ok` /
// `active_workspace_id` keys the BK-83 fix left behind — is unit-testable in
// isolation. route.ts transitively imports `server-only` (via
// @lib/api/handler -> lib/api/principal.ts), which bun:test cannot resolve
// outside the Next.js build pipeline, so this function must live outside
// that import chain for route.test.ts to import it directly.
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
