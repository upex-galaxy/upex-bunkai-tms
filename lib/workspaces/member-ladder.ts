// BK-572 — the workspace membership ladder (ADR-0022), shared by the removal
// route and the members screen. The database enforces the same rule on its
// own (migration 0114: RLS + bunkai_remove_workspace_member); this module only
// decides what the route refuses early and which rows the screen offers
// Remove on. Framework-agnostic: no React, no Next imports.

const ROLE_RANK: Record<string, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export function roleRank(role: string | null | undefined): number {
  return (role && ROLE_RANK[role]) || 0;
}

// A caller may remove a target whose role does not outrank theirs, and only
// an Admin or Owner removes anyone. Unknown roles are never removable.
export function canRemoveRole(callerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  return roleRank(callerRole) >= ROLE_RANK.admin && roleRank(targetRole) > 0 && roleRank(targetRole) <= roleRank(callerRole);
}

// The screen's rule for one row: the ladder, never the caller's own row
// (self-removal is Leave), and only active memberships.
export function canRemoveMember(params: {
  callerId: string
  callerRole: string | null | undefined
  target: { user_id: string, role: string, status: string }
}): boolean {
  return params.target.user_id !== params.callerId
    && params.target.status === 'active'
    && canRemoveRole(params.callerRole, params.target.role);
}
