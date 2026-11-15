// BK-1899 — the copy and the small decisions behind archiving a Milestone, kept out
// of the components so they are testable without rendering. Every string here is
// ratified by the AI Product Owner decision on BK-1899 (P2, P3, P4, P7, P11, P12).

// P3 — Show archived lives in the page address, so a reload, the back button and a
// shared link keep it, and a fresh visit to Milestones starts on the default list.
export const SHOW_ARCHIVED_PARAM = 'archived';
export const SHOW_ARCHIVED_VALUE = 'show';

export function isShowArchived(value: string | string[] | undefined): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  return first === SHOW_ARCHIVED_VALUE;
}

export function milestonesListHref(projectSlug: string, showArchived: boolean): string {
  const base = `/projects/${projectSlug}/milestones`;
  return showArchived ? `${base}?${SHOW_ARCHIVED_PARAM}=${SHOW_ARCHIVED_VALUE}` : base;
}

// P7 — the header counts the Milestones in the list as shown. With Show archived
// on, the archived ones are named next to it.
export function milestonesSubline(args: { shownCount: number, archivedCount: number, showArchived: boolean }): string {
  const noun = args.shownCount === 1 ? 'milestone' : 'milestones';
  const head = `${args.shownCount} ${noun}`;
  if (!args.showArchived || args.archivedCount === 0) { return head; }
  return `${head} · ${args.archivedCount} archived`;
}

// P4 — the label beside the name, and the one line on the Milestone's own screen.
export const ARCHIVED_LABEL = 'Archived';
export const ARCHIVED_NOTE = 'This milestone is archived. It is read-only until it is restored.';

// The default list is empty but the Project has archived Milestones: say where they are.
export function allArchivedCopy(archivedCount: number): string {
  return archivedCount === 1
    ? 'The only milestone of this project is archived.'
    : `All ${archivedCount} milestones of this project are archived.`;
}

// P11 — one click archives; the message names the Milestone. A failure keeps it
// where it was and offers Try again.
export function archivedToast(name: string): string {
  return `Archived “${name}”.`;
}

export function restoredToast(name: string): string {
  return `Restored “${name}”.`;
}

export function archiveFailedToast(name: string): string {
  return `Could not archive “${name}”. Nothing changed.`;
}

export function restoreFailedToast(name: string): string {
  return `Could not restore “${name}”. Nothing changed.`;
}

export const ARCHIVE_FORBIDDEN_COPY = 'Archiving and restoring milestones require the member role or higher.';

// P2 — an archived Milestone never claims to be overdue. The neutral countdown chip
// keeps stating the date fact; the overdue badge, the note and the count are dropped.
export function overdueUnlessArchived<T>(overdue: T | null, archivedAt: string | null): T | null {
  return archivedAt ? null : overdue;
}

// The call found the Milestone already in the state it asked for (a teammate got
// there first): say so instead of claiming the change (P8).
export function alreadyArchivedToast(name: string): string {
  return `“${name}” was already archived.`;
}

export function alreadyActiveToast(name: string): string {
  return `“${name}” is already active.`;
}
