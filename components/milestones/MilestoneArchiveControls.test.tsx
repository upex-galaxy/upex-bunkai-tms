import type { MilestoneReadiness } from '@lib/milestones/readiness-view';
import type { MilestoneDetail } from './MilestoneDetailView';
import type { MilestoneListItem } from './MilestonesListView';
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

// BK-1899 — who is offered archive and restore, and what an archived Milestone
// shows, on the server render of the list and of the Milestone's own screen
// (AC-01 to AC-04 and the refined Viewer scenario). The router double is ONE
// object for the whole file (Bunkai rule GUARDED-TESTS). No browser is involved,
// so this is NOT live-UI evidence.

const ROUTER = { push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER, usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const { MilestoneDetailView } = await import('./MilestoneDetailView');
const { MilestonesListView } = await import('./MilestonesListView');

const TODAY = '2026-11-15';
const READINESS: MilestoneReadiness = {
  milestone_id: 'm1',
  plan_count: 1,
  member_count: 2,
  passed_pct: 50,
  counts: { passed: 1, failed: 1, aborted: 0, in_progress: 0, not_run: 0 },
  plans: [{ plan_id: 'p1', name: 'Smoke', status: 'open', frozen: false, member_count: 2, passed_pct: 50, counts: { passed: 1, failed: 1, aborted: 0, in_progress: 0, not_run: 0 } }],
} as MilestoneReadiness;

function detail(archivedAt: string | null): MilestoneDetail {
  return {
    id: 'm1',
    projectId: 'proj',
    projectSlug: 'checkout',
    name: 'Release 1.0',
    targetDate: '2026-10-01',
    description: 'First release',
    creatorLabel: 'mateo@x.test',
    archivedAt,
    archivedByLabel: archivedAt ? 'mateo@x.test' : '',
  };
}

const OVERDUE = { days: 45, label: 'Overdue · 45d' };

function renderDetail(archivedAt: string | null, canEdit: boolean, overdue: typeof OVERDUE | null = null): string {
  return renderToStaticMarkup(
    <MilestoneDetailView
      milestone={detail(archivedAt)}
      canEdit={canEdit}
      readiness={READINESS}
      overdue={overdue}
      attachablePlans={[]}
      todayIso={TODAY}
    />,
  );
}

function has(html: string, testId: string): boolean {
  return html.includes(`data-testid="${testId}"`);
}

describe('MilestoneDetailView — BK-1899', () => {
  it('offers Archive next to Edit and Attach on an active Milestone, to a member', () => {
    const html = renderDetail(null, true);
    expect(has(html, 'milestone-detail-archive-button')).toBe(true);
    expect(has(html, 'milestone-detail-edit-button')).toBe(true);
    expect(has(html, 'milestone-detail-attach-button')).toBe(true);
    expect(has(html, 'milestone-detail-restore-button')).toBe(false);
    expect(has(html, 'milestone-detail-archived-badge')).toBe(false);
  });

  it('leaves Restore as the only change on an archived Milestone, keeping readiness and plans visible', () => {
    const html = renderDetail('2026-11-10T12:00:00Z', true);
    expect(has(html, 'milestone-detail-restore-button')).toBe(true);
    expect(has(html, 'milestone-detail-archive-button')).toBe(false);
    expect(has(html, 'milestone-detail-edit-button')).toBe(false);
    expect(has(html, 'milestone-detail-attach-button')).toBe(false);
    expect(html).not.toContain('Detach');
    expect(has(html, 'milestone-detail-archived-badge')).toBe(true);
    expect(has(html, 'milestone-detail-archived-note')).toBe(true);
    expect(html).toContain('This milestone is archived. It is read-only until it is restored.');
    expect(html).toContain('Archived by mateo@x.test');
    // The date fact stays: "N days past target", never Overdue.
    expect(html).toContain('45 days past target');
    expect(html).toContain('Smoke');
  });

  it('never shows an archived Milestone as overdue, even when handed an overdue state', () => {
    const active = renderDetail(null, true, OVERDUE);
    expect(has(active, 'milestone-detail-overdue-badge')).toBe(true);
    expect(has(active, 'milestone-detail-overdue-note')).toBe(true);
    const archived = renderDetail('2026-11-10T12:00:00Z', true, OVERDUE);
    expect(has(archived, 'milestone-detail-overdue-badge')).toBe(false);
    expect(has(archived, 'milestone-detail-overdue-note')).toBe(false);
    expect(archived).toContain('45 days past target');
  });

  it('shows a Viewer the archived marking and no restore control', () => {
    const html = renderDetail('2026-11-10T12:00:00Z', false);
    expect(has(html, 'milestone-detail-archived-badge')).toBe(true);
    expect(has(html, 'milestone-detail-archived-note')).toBe(true);
    expect(has(html, 'milestone-detail-restore-button')).toBe(false);
    expect(has(html, 'milestone-detail-archive-button')).toBe(false);
  });

  it('never offers a Viewer archive on an active Milestone', () => {
    const html = renderDetail(null, false);
    expect(has(html, 'milestone-detail-archive-button')).toBe(false);
    expect(has(html, 'milestone-detail-restore-button')).toBe(false);
  });
});

function item(id: string, name: string, archivedAt: string | null): MilestoneListItem {
  return {
    id,
    name,
    targetDate: '2026-12-01',
    description: '',
    creatorLabel: 'mateo@x.test',
    readiness: null,
    overdue: null,
    archivedAt,
  };
}

function renderList(args: { milestones: MilestoneListItem[], canCreate: boolean, showArchived: boolean, archivedCount: number }): string {
  return renderToStaticMarkup(
    <MilestonesListView
      projectId="proj"
      projectSlug="checkout"
      milestones={args.milestones}
      canCreate={args.canCreate}
      todayIso={TODAY}
      showArchived={args.showArchived}
      archivedCount={args.archivedCount}
    />,
  );
}

describe('MilestonesListView — BK-1899', () => {
  it('gives a member an Archive control per active row and a Show archived choice', () => {
    const html = renderList({ milestones: [item('a', 'Release 2.0', null)], canCreate: true, showArchived: false, archivedCount: 1 });
    expect(has(html, 'milestone-archive-a')).toBe(true);
    expect(has(html, 'milestones-show-archived-toggle')).toBe(true);
    expect(html).toContain('href="/projects/checkout/milestones?archived=show"');
    expect(html).toContain('Show archived');
    expect(html).toContain('1 milestone');
  });

  it('marks archived rows and offers Restore on them when archived ones are shown', () => {
    const html = renderList({
      milestones: [item('a', 'Release 2.0', null), item('b', 'Release 1.0', '2026-11-10T12:00:00Z')],
      canCreate: true,
      showArchived: true,
      archivedCount: 1,
    });
    expect(has(html, 'milestone-archived-b')).toBe(true);
    expect(has(html, 'milestone-archived-a')).toBe(false);
    expect(has(html, 'milestone-restore-b')).toBe(true);
    expect(has(html, 'milestone-archive-a')).toBe(true);
    expect(html).toContain('2 milestones · 1 archived');
    expect(html).toContain('Hide archived');
    expect(html).toContain('href="/projects/checkout/milestones"');
  });

  it('never offers a Viewer archive or restore, but shows the marking', () => {
    const html = renderList({
      milestones: [item('a', 'Release 2.0', null), item('b', 'Release 1.0', '2026-11-10T12:00:00Z')],
      canCreate: false,
      showArchived: true,
      archivedCount: 1,
    });
    expect(has(html, 'milestone-archive-a')).toBe(false);
    expect(has(html, 'milestone-restore-b')).toBe(false);
    expect(has(html, 'milestone-archived-b')).toBe(true);
  });

  it('says where the Milestones are when every one is archived', () => {
    const html = renderList({ milestones: [], canCreate: true, showArchived: false, archivedCount: 2 });
    expect(has(html, 'milestones-all-archived')).toBe(true);
    expect(has(html, 'milestones-empty')).toBe(false);
    expect(html).toContain('All 2 milestones of this project are archived.');
  });

  it('drops the overdue badge and count of an archived row, even when handed an overdue state', () => {
    const html = renderList({
      milestones: [{ ...item('b', 'Release 1.0', '2026-11-10T12:00:00Z'), overdue: OVERDUE }],
      canCreate: true,
      showArchived: true,
      archivedCount: 1,
    });
    expect(has(html, 'milestone-overdue-b')).toBe(false);
    expect(has(html, 'milestones-overdue-count')).toBe(false);
  });

  it('hides the Show archived choice when the Project has nothing archived', () => {
    const html = renderList({ milestones: [item('a', 'Release 2.0', null)], canCreate: true, showArchived: false, archivedCount: 0 });
    expect(has(html, 'milestones-show-archived-toggle')).toBe(false);
  });
});
