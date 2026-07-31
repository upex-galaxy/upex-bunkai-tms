// Settings > Tokens display formatting (BK-88 Slice A — PO/UX Decision 3).
// Pure, framework-agnostic transforms consumed by `TokensList`. Issuance-form
// concerns (`formatExpiryChoiceDate`) are Slice B's — not implemented here.

const EXPIRING_SOON_THRESHOLD_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export interface ExpiryCell {
  label: string
  isExpiringSoon: boolean
  daysUntilExpiry: number | null
}

// `expiresAt` null -> "never", no expiry-soon treatment. A past-dated expiry
// (already expired but not revoked, a valid API state) still just renders its
// date -- no special-casing beyond the date itself, per the plan's edge cases.
export function formatExpiryCell(expiresAt: string | null, now: Date): ExpiryCell {
  if (!expiresAt) {
    return { label: 'never', isExpiringSoon: false, daysUntilExpiry: null };
  }

  const expiry = new Date(expiresAt);
  const label = expiry.toISOString().slice(0, 10);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / MS_PER_DAY);
  const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= EXPIRING_SOON_THRESHOLD_DAYS;

  return { label, isExpiringSoon, daysUntilExpiry };
}

export interface WorkspaceCell {
  label: string
  subLabel: string | null
}

// `workspaceId` null -> global token, "All workspaces". A non-null id with no
// resolved label (workspace lookup miss) still renders something identifiable
// instead of blanking the cell -- falls back to the id itself.
export function formatWorkspaceCell(workspaceId: string | null, workspaceLabel: string | null): WorkspaceCell {
  if (!workspaceId) {
    return { label: 'All workspaces', subLabel: null };
  }
  return { label: workspaceLabel ?? workspaceId, subLabel: workspaceId };
}
