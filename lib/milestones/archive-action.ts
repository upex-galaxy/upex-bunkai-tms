import type { MilestoneArchiveAction, MilestoneArchiveResult } from '@lib/milestones/archive-client';
import {
  alreadyActiveToast,
  alreadyArchivedToast,
  ARCHIVE_FORBIDDEN_COPY,
  archivedToast,
  archiveFailedToast,
  milestonesListHref,
  restoredToast,
  restoreFailedToast,
} from '@lib/milestones/archive-view';

// BK-1899 — what one click on Archive or Restore does, with its effects injected
// so it is testable without a component or a browser (AC-04 "a failed archive
// tells me what went wrong"). The button owns only the pending state and the
// in-flight guard.

interface ToastAction { label: string, onClick: () => void }
export interface ArchiveActionDeps {
  request: (milestoneId: string, action: MilestoneArchiveAction) => Promise<MilestoneArchiveResult>
  success: (message: string, options?: { action?: ToastAction }) => void
  error: (message: string, options?: { description?: string, action?: ToastAction }) => void
  push: (href: string) => void
  refresh: () => void
}

export interface ArchiveActionTarget {
  milestoneId: string
  name: string
  archived: boolean
  projectSlug: string
}

// Returns the result so the caller can tell success from failure. On failure
// nothing is refreshed: the Milestone stays exactly where it was, and the error
// offers Try again (which calls `retry`), except a refusal by role, which a
// retry can never fix.
export async function runArchiveAction(target: ArchiveActionTarget, deps: ArchiveActionDeps, retry: () => void): Promise<MilestoneArchiveResult> {
  const action: MilestoneArchiveAction = target.archived ? 'restore' : 'archive';
  const result = await deps.request(target.milestoneId, action);
  if (!result.ok) {
    if (result.forbidden) {
      deps.error(ARCHIVE_FORBIDDEN_COPY);
      return result;
    }
    deps.error(target.archived ? restoreFailedToast(target.name) : archiveFailedToast(target.name), {
      description: result.errorMessage,
      action: { label: 'Try again', onClick: retry },
    });
    return result;
  }
  if (target.archived) {
    deps.success(result.changed ? restoredToast(target.name) : alreadyActiveToast(target.name));
  }
  else {
    deps.success(result.changed ? archivedToast(target.name) : alreadyArchivedToast(target.name), {
      action: { label: 'Show archived', onClick: () => { deps.push(milestonesListHref(target.projectSlug, true)); } },
    });
  }
  deps.refresh();
  return result;
}
