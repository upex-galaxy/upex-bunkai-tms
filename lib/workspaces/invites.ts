// Framework-agnostic invite-acceptance helpers (BK-62). No React/Next/DB
// imports — usable from the route handlers and unit tests alike. Failure
// reasons use the hybrid-error `details.reason` vocabulary.

export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner';

// Privilege order used to decide whether accepting an invite would demote the
// caller. Mirrors the CHECK constraint on workspace_members.role (0001).
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export type InviteAcceptAction = 'upsert' | 'reject_already_member';

interface ExistingMembership {
  role: string
  status: string
}

// Decide what accepting an invite may do to the caller's membership row.
// An accept must NEVER demote: if the caller already holds an active
// membership with an equal or higher role, the accept is rejected (the invite
// should not have existed — BK-60 blocks issuing it). A higher-role invite is
// a legitimate promotion, and a non-active row (e.g. status='invited') is
// activated with the invite's role.
export function inviteAcceptAction(
  existing: ExistingMembership | null,
  inviteRole: WorkspaceRole,
): InviteAcceptAction {
  if (!existing || existing.status !== 'active') {
    return 'upsert';
  }
  const existingRank = ROLE_RANK[existing.role as WorkspaceRole] ?? 0;
  if (ROLE_RANK[inviteRole] > existingRank) {
    return 'upsert';
  }
  return 'reject_already_member';
}
