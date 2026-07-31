// BK-89 — dependency-free pure module, mirroring
// `app/api/v1/me/active-workspace/response.ts`'s isolation pattern so the
// join logic is unit-testable without mocking `withApiHandler`/Supabase.

export interface WorkspaceMembershipRole {
  workspace_id: string
  role: string
}

export interface WorkspaceRecord {
  id: string
  slug: string
  name: string
  owner_user_id: string
  plan: string
  created_at: string
}

export interface WorkspaceWithRole extends WorkspaceRecord {
  role: string | null
}

// Manual JS-side join (not a PostgREST embedded-select), matching the
// convention this repo already uses in lib/account/workspaces.ts and the
// pattern BK-87 PR2 shipped for its own workspace list.
export function mergeWorkspaceRoles(
  workspaces: WorkspaceRecord[],
  memberships: WorkspaceMembershipRole[],
): WorkspaceWithRole[] {
  const roleByWorkspaceId = new Map(memberships.map(m => [m.workspace_id, m.role]));
  return workspaces.map(ws => ({ ...ws, role: roleByWorkspaceId.get(ws.id) ?? null }));
}
