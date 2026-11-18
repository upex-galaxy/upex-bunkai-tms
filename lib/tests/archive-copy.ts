// BK-596 — the words of the Test archive confirmation and the archived state.
// Pure, framework-agnostic; unit-tested in `archive-copy.test.ts`. The shapes
// are BK-571's (reversible confirmation, a warning that names real usage and
// never blocks, a banner on the archived detail), so the product has one archive
// dialect; only the host and the nouns differ.

import { boundUsageTitles } from '@lib/atcs/archive-usage';

export const TEST_ARCHIVE_REVERSIBLE_COPY = 'Archiving is reversible: restore it any time from this Test\'s page.';
export const TEST_ARCHIVED_BANNER_COPY = 'This Test is archived. It is read-only until it is restored.';
export const TEST_ARCHIVED_BANNER_DETAIL_COPY = 'It is hidden from search, tag filters, the Tests list and the plan picker, and no new Run can start from it. Its Runs stay readable.';
export const TEST_ARCHIVE_FAILURE_COPY = 'Could not archive this Test. Nothing changed.';
export const TEST_RESTORE_FAILURE_COPY = 'Could not restore this Test. Nothing changed.';
export const TEST_RENAME_FAILURE_COPY = 'Could not rename this Test.';

// 0 -> "No Run has been recorded against this Test."
// 1 -> "1 Run has been recorded. It is kept and stays readable."
// N -> "12 Runs have been recorded. They are kept and stay readable."
export function testArchiveRunsCopy(runCount: number): string {
  if (runCount <= 0) { return 'No Run has been recorded against this Test.'; }
  return runCount === 1
    ? '1 Run has been recorded. It is kept and stays readable.'
    : `${runCount} Runs have been recorded. They are kept and stay readable.`;
}

// The Test Plans that hold the Test (PO ruling C): named, never a refusal.
export function testArchivePlansHeadline(planCount: number): string | null {
  if (planCount <= 0) { return null; }
  return planCount === 1 ? '1 Test Plan holds this Test.' : `${planCount} Test Plans hold this Test.`;
}

export const TEST_ARCHIVE_PLANS_KEEP_COPY = 'Those plans keep it, shown as archived. Nothing in them changes.';

export function boundPlanNames(names: readonly string[]) {
  return boundUsageTitles(names);
}

export function testArchivedToast(title: string): string {
  return `Archived “${title}”. Restore it from this Test's page any time.`;
}

export function testRestoredToast(title: string): string {
  return `Restored “${title}”. It is back in search, the Tests list and Run start.`;
}
