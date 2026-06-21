import type { MemberRole } from '@lib/types';

// Capitalize a canonical workspace role for display (BK-86, Decision #8):
// `admin` -> "Admin", `owner` -> "Owner", etc. A null role (no active
// workspace) returns the empty-state sentinel so the caller can render the
// "No workspace yet" copy (Scenario B). Pure + framework-agnostic.
export const NO_WORKSPACE_LABEL = 'No workspace yet';

export function roleLabel(role: MemberRole | null | undefined): string {
  if (!role) {
    return NO_WORKSPACE_LABEL;
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}
