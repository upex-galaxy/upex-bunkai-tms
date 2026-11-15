import {
  allArchivedCopy,
  archivedToast,
  archiveFailedToast,
  isShowArchived,
  milestonesListHref,
  milestonesSubline,
  overdueUnlessArchived,
  restoredToast,
  restoreFailedToast,
} from '@lib/milestones/archive-view';
import { describe, expect, test } from 'bun:test';

// BK-1899 — the copy and the small decisions behind the archived Milestones UI,
// pinned to the AI Product Owner decision on the ticket (P2, P3, P7, P11).

describe('Show archived lives in the address (P3)', () => {
  test('only ?archived=show turns it on', () => {
    expect(isShowArchived('show')).toBe(true);
    expect(isShowArchived(['show', 'x'])).toBe(true);
    expect(isShowArchived(undefined)).toBe(false);
    expect(isShowArchived('true')).toBe(false);
    expect(isShowArchived('')).toBe(false);
  });

  test('the toggle links between the default list and the list with archived ones', () => {
    expect(milestonesListHref('checkout', true)).toBe('/projects/checkout/milestones?archived=show');
    expect(milestonesListHref('checkout', false)).toBe('/projects/checkout/milestones');
  });
});

describe('the header counts what is shown (P7)', () => {
  test('the default list counts the active Milestones only', () => {
    expect(milestonesSubline({ shownCount: 1, archivedCount: 2, showArchived: false })).toBe('1 milestone');
    expect(milestonesSubline({ shownCount: 3, archivedCount: 0, showArchived: false })).toBe('3 milestones');
  });

  test('with Show archived on, the archived ones are named', () => {
    expect(milestonesSubline({ shownCount: 3, archivedCount: 2, showArchived: true })).toBe('3 milestones · 2 archived');
    expect(milestonesSubline({ shownCount: 1, archivedCount: 0, showArchived: true })).toBe('1 milestone');
  });

  test('an empty default list says where the archived ones are', () => {
    expect(allArchivedCopy(1)).toBe('The only milestone of this project is archived.');
    expect(allArchivedCopy(4)).toBe('All 4 milestones of this project are archived.');
  });
});

describe('an archived Milestone never claims to be overdue (P2)', () => {
  const overdue = { days: 3, label: 'Overdue' };
  test('drops the overdue state of an archived Milestone and keeps an active one\'s', () => {
    expect(overdueUnlessArchived(overdue, '2026-11-15T10:00:00Z')).toBeNull();
    expect(overdueUnlessArchived(overdue, null)).toBe(overdue);
    expect(overdueUnlessArchived(null, null)).toBeNull();
  });
});

describe('messages name the Milestone (P11)', () => {
  test('success and failure copy', () => {
    expect(archivedToast('Release 1.0')).toBe('Archived “Release 1.0”.');
    expect(restoredToast('Release 1.0')).toBe('Restored “Release 1.0”.');
    expect(archiveFailedToast('Release 1.0')).toBe('Could not archive “Release 1.0”. Nothing changed.');
    expect(restoreFailedToast('Release 1.0')).toBe('Could not restore “Release 1.0”. Nothing changed.');
  });
});
