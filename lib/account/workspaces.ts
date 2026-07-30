// Settings > Account workspace-list logic (BK-87 PR2) — framework-agnostic,
// pure functions only. All Supabase I/O stays in `settings/account/page.tsx`;
// this file is what makes that page's transform logic unit-testable without
// a live DB (TC-AC2/6/7).

import type { MemberRole } from '@lib/types';

export interface WorkspaceMembershipRow {
  workspace_id: string
  role: string
}

export interface WorkspaceRef {
  id: string
  slug: string
  name: string
}

export interface WorkspaceRow {
  id: string
  slug: string
  name: string
  role: MemberRole
  memberCount: number
  isActive: boolean
}

// One additional grouped-count query (TD5) returns a flat list of active
// `workspace_id` rows across every workspace the caller belongs to; this
// reduces it to a per-workspace count without a second round trip per row.
export function countActiveMembersByWorkspace(rows: { workspace_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.workspace_id] = (counts[row.workspace_id] ?? 0) + 1;
  }
  return counts;
}

interface BuildWorkspaceRowsParams {
  memberships: WorkspaceMembershipRow[]
  workspaces: WorkspaceRef[]
  memberCounts: Record<string, number>
  activeWorkspaceId: string | null
}

// Joins the widened `workspace_members` query (TD5) to the matching
// `workspaces` rows in JS, mirroring the manual-join style already used by
// `workspaces/[id]/members/page.tsx` and `atcs/[atcId]/page.tsx` in this repo
// (no PostgREST embedded-select syntax). A membership with no matching
// workspace row (shouldn't happen — FK-enforced) is skipped defensively
// rather than crashing the whole section.
export function buildWorkspaceRows({ memberships, workspaces, memberCounts, activeWorkspaceId }: BuildWorkspaceRowsParams): WorkspaceRow[] {
  const workspaceById = new Map(workspaces.map(w => [w.id, w]));
  const rows: WorkspaceRow[] = [];
  for (const membership of memberships) {
    const workspace = workspaceById.get(membership.workspace_id);
    if (!workspace) {
      continue;
    }
    rows.push({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      role: membership.role as MemberRole,
      memberCount: memberCounts[membership.workspace_id] ?? 0,
      isActive: membership.workspace_id === activeWorkspaceId,
    });
  }
  return rows;
}

export type WorkspacesViewState = 'error' | 'empty' | 'list';

// TC-AC6 (empty) / TC-AC7 (error) branch selection — error takes priority
// over an empty row count since a failed query also resolves to zero rows.
export function resolveWorkspacesViewState({ error, rowCount }: { error: boolean, rowCount: number }): WorkspacesViewState {
  if (error) {
    return 'error';
  }
  if (rowCount === 0) {
    return 'empty';
  }
  return 'list';
}
