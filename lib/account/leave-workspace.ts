// Settings > Workspaces leave-confirmation gate (BK-90 Slice B, Decision 4).
// Pure, framework-agnostic so `LeaveWorkspaceModal`'s type-to-confirm match
// is unit-testable without mounting the component. Mirrors the mockup's exact
// gate (settings-workspaces.html:945-948):
//   lvConfirm.disabled = !rowToLeave || lvInput.value.trim() !== rowToLeave.getAttribute('data-ws');
// Only the typed value is trimmed -- the workspace name itself is compared
// as-is, and the match is case-sensitive (not a case-insensitive compare).
export function isLeaveConfirmEnabled(typed: string, workspaceName: string): boolean {
  return typed.trim() === workspaceName;
}
