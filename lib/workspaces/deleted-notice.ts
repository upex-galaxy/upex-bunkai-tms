// BK-1129 — the "workspace deleted" hand-off shared by the Run API routes, the
// Runner, and the app shell (BK-512 Scenario N3). Framework-agnostic: no
// React/Next/DB imports.
//
// The flow: a Run endpoint refuses a caller whose workspace was soft-deleted
// with a 404 carrying `details.reason = WORKSPACE_DELETED_REASON`; the Runner
// (or the Runner page on a reload) sends the caller to WORKSPACE_DELETED_LANDING;
// /home re-points them through the AC-09 resolver (`resolveActiveWorkspaceId`),
// or forwards them to onboarding when no workspace remains; the shell then
// announces the deletion and the workspace they are now in.

export const WORKSPACE_DELETED_REASON = 'workspace_deleted';
export const WORKSPACE_DELETED_MESSAGE = 'This workspace was deleted.';

// Query param value the shell reads to fire the announcement once.
export const WORKSPACE_DELETED_NOTICE = 'workspace-deleted';
export const WORKSPACE_DELETED_LANDING = `/home?notice=${WORKSPACE_DELETED_NOTICE}`;
export const WORKSPACE_DELETED_ONBOARDING = `/onboarding?notice=${WORKSPACE_DELETED_NOTICE}`;

// Same shape as the Leave / Delete toasts ("<name> is now your active
// workspace."), so a re-point reads the same however the caller got there.
export function workspaceDeletedToast(activeWorkspaceName: string | null): string {
  return activeWorkspaceName
    ? `The workspace you were in was deleted. ${activeWorkspaceName} is now your active workspace.`
    : 'The workspace you were in was deleted.';
}

// True for the Run endpoints' deleted-workspace refusal. Every other non-ok
// response (a plain not-found, a 403, a 409) keeps its existing handling.
export function isWorkspaceDeletedRefusal(status: number, body: unknown): boolean {
  if (status !== 404 || typeof body !== 'object' || body === null) {
    return false;
  }
  const details = (body as { error?: { details?: { reason?: unknown } } }).error?.details;
  return details?.reason === WORKSPACE_DELETED_REASON;
}
