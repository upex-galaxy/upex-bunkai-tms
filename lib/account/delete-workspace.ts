// Settings > Workspaces delete-confirmation gate (BK-512 AC-04, BK-1918).
// Pure, framework-agnostic so `DeleteWorkspaceModal`'s type-to-confirm match
// is unit-testable without mounting the component. Deliberately NOT the Leave
// gate (`isLeaveConfirmEnabled`, which trims the typed value per the BK-90
// mockup contract): BK-512's business rule says a partial, case-varying or
// leading/trailing-whitespace match does not unlock the deletion, so the
// typed value is compared exactly, untrimmed and case-sensitive.
export function isDeleteConfirmEnabled(typed: string, workspaceName: string): boolean {
  return typed === workspaceName;
}
