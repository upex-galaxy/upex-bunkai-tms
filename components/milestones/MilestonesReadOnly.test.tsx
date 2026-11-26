import type { MilestoneReadiness } from '@lib/milestones/readiness-view';
import type { MilestoneDetail } from './MilestoneDetailView';
import type { MilestoneListItem } from './MilestonesListView';
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

const ROUTER = { push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER, usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const { MilestoneDetailView } = await import('./MilestoneDetailView');
const { MilestonesListView } = await import('./MilestonesListView');

const TODAY = '2026-11-15';
const COUNTS = { passed: 1, failed: 1, aborted: 0, in_progress: 0, not_run: 0 };
const READINESS = {
  milestone_id: 'm1',
  plan_count: 1,
  member_count: 2,
  passed_pct: 50,
  counts: COUNTS,
  plans: [{ plan_id: 'p1', name: 'Smoke', status: 'open', frozen: false, member_count: 2, passed_pct: 50, counts: COUNTS }],
} as MilestoneReadiness;
const NO_PLANS = { ...READINESS, plan_count: 0, member_count: 0, plans: [] } as MilestoneReadiness;

const MILESTONE: MilestoneDetail = {
  id: 'm1',
  projectId: 'proj',
  projectSlug: 'checkout',
  name: 'Release 1.0',
  targetDate: '2026-12-01',
  description: '',
  creatorLabel: 'mateo@x.test',
  archivedAt: null,
  archivedByLabel: '',
};

const ITEM: MilestoneListItem = {
  id: 'm1',
  name: 'Release 1.0',
  targetDate: '2026-12-01',
  description: '',
  creatorLabel: 'mateo@x.test',
  readiness: null,
  overdue: null,
  archivedAt: null,
};

function has(html: string, testId: string): boolean {
  return html.includes(`data-testid="${testId}"`);
}

function renderDetail(args: { canEdit: boolean, readOnly: boolean, readiness?: MilestoneReadiness }): string {
  return renderToStaticMarkup(
    <MilestoneDetailView
      milestone={MILESTONE}
      canEdit={args.canEdit}
      readOnly={args.readOnly}
      readiness={args.readiness ?? READINESS}
      overdue={null}
      attachablePlans={[]}
      todayIso={TODAY}
    />,
  );
}

function renderList(args: { canCreate: boolean, readOnly: boolean, milestones?: MilestoneListItem[] }): string {
  return renderToStaticMarkup(
    <MilestonesListView
      projectId="proj"
      projectSlug="checkout"
      milestones={args.milestones ?? [ITEM]}
      canCreate={args.canCreate}
      readOnly={args.readOnly}
      todayIso={TODAY}
      showArchived={false}
      archivedCount={0}
    />,
  );
}

describe('MilestonesListView on a read-only project (BK-2541)', () => {
  it('hides New milestone and Archive from a member and says the project is read-only', () => {
    const html = renderList({ canCreate: true, readOnly: true });
    expect(has(html, 'milestones-new-button')).toBe(false);
    expect(has(html, 'milestone-archive-m1')).toBe(false);
    expect(has(html, 'milestones-read-only-note')).toBe(true);
    expect(html).toContain('This project is read-only.');
    expect(has(html, 'milestones-viewer-note')).toBe(false);
  });

  it('gives a viewer the read-only note instead of the role note', () => {
    const html = renderList({ canCreate: false, readOnly: true });
    expect(has(html, 'milestones-read-only-note')).toBe(true);
    expect(has(html, 'milestones-viewer-note')).toBe(false);
  });

  it('hides the empty-state create button', () => {
    const html = renderList({ canCreate: true, readOnly: true, milestones: [] });
    expect(has(html, 'milestones-empty-new-button')).toBe(false);
    expect(html).toContain('No milestone has been created for this project yet.');
  });

  it('leaves a writable project as before', () => {
    const html = renderList({ canCreate: true, readOnly: false });
    expect(has(html, 'milestones-new-button')).toBe(true);
    expect(has(html, 'milestone-archive-m1')).toBe(true);
    expect(has(html, 'milestones-read-only-note')).toBe(false);
  });
});

describe('MilestoneDetailView on a read-only project (BK-2541)', () => {
  it('hides Edit, Archive and Attach but keeps Detach, which the server allows', () => {
    const html = renderDetail({ canEdit: true, readOnly: true });
    expect(has(html, 'milestone-detail-edit-button')).toBe(false);
    expect(has(html, 'milestone-detail-archive-button')).toBe(false);
    expect(has(html, 'milestone-detail-attach-button')).toBe(false);
    expect(has(html, 'milestone-attached-detach-p1')).toBe(true);
    expect(has(html, 'milestone-detail-read-only-note')).toBe(true);
    expect(has(html, 'milestone-detail-viewer-note')).toBe(false);
  });

  it('never offers a viewer Detach on a read-only project', () => {
    const html = renderDetail({ canEdit: false, readOnly: true });
    expect(has(html, 'milestone-attached-detach-p1')).toBe(false);
    expect(has(html, 'milestone-detail-read-only-note')).toBe(true);
  });

  it('replaces the attach button of the empty plans card with the read-only note', () => {
    const html = renderDetail({ canEdit: true, readOnly: true, readiness: NO_PLANS });
    expect(has(html, 'milestone-attached-empty-attach-button')).toBe(false);
    expect(has(html, 'milestone-attached-viewer-note')).toBe(true);
    expect(html).toContain('This project is read-only.');
  });

  it('leaves a writable project as before', () => {
    const html = renderDetail({ canEdit: true, readOnly: false });
    expect(has(html, 'milestone-detail-edit-button')).toBe(true);
    expect(has(html, 'milestone-detail-attach-button')).toBe(true);
    expect(has(html, 'milestone-attached-detach-p1')).toBe(true);
    expect(has(html, 'milestone-detail-read-only-note')).toBe(false);
  });
});
