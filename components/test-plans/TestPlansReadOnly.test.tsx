import type { TestPlanDetail } from './TestPlanDetailView';
import type { TestPlanListItem } from './TestPlansListView';
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

const ROUTER = { push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER, usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const { TestPlanDetailView } = await import('./TestPlanDetailView');
const { TestPlansListView } = await import('./TestPlansListView');

const PLAN: TestPlanDetail = {
  id: 'p1',
  projectId: 'proj',
  projectSlug: 'checkout',
  name: 'Smoke',
  description: '',
  goal: '',
  status: 'open',
  creatorLabel: 'mateo@x.test',
  createdAtLabel: '2026-11-01',
  verdict: null,
  summary: null,
  closedByLabel: '',
  closedAtIso: null,
};
const CLOSED: TestPlanDetail = { ...PLAN, status: 'closed', verdict: 'passed', closedByLabel: 'mateo@x.test', closedAtIso: '2026-11-10T12:00:00Z' };
const MEMBER = { id: 't1', title: 'Checkout happy path', tags: [], archivedAt: null, addedByLabel: 'mateo@x.test' };

const ITEM: TestPlanListItem = {
  id: 'p1',
  name: 'Smoke',
  description: '',
  goal: '',
  status: 'open',
  testCount: 1,
  progress: null,
  verdict: null,
  creatorLabel: 'mateo@x.test',
};

function has(html: string, testId: string): boolean {
  return html.includes(`data-testid="${testId}"`);
}

function renderDetail(args: { canEdit: boolean, readOnly: boolean, plan?: TestPlanDetail, tests?: typeof MEMBER[] }): string {
  return renderToStaticMarkup(
    <TestPlanDetailView
      testPlan={args.plan ?? PLAN}
      initialTests={args.tests ?? [MEMBER]}
      progress={null}
      canEdit={args.canEdit}
      canClose={args.canEdit}
      readOnly={args.readOnly}
    />,
  );
}

function renderList(args: { canCreate: boolean, readOnly: boolean, testPlans?: TestPlanListItem[] }): string {
  return renderToStaticMarkup(
    <TestPlansListView
      projectId="proj"
      projectSlug="checkout"
      testPlans={args.testPlans ?? [ITEM]}
      canCreate={args.canCreate}
      readOnly={args.readOnly}
    />,
  );
}

describe('TestPlansListView on a read-only project (BK-2541)', () => {
  it('hides New plan from a member and says the project is read-only', () => {
    const html = renderList({ canCreate: true, readOnly: true });
    expect(has(html, 'test-plans-new-button')).toBe(false);
    expect(has(html, 'test-plans-read-only-note')).toBe(true);
    expect(html).toContain('This project is read-only.');
    expect(has(html, 'test-plans-viewer-note')).toBe(false);
  });

  it('hides Create first plan on an empty list', () => {
    const html = renderList({ canCreate: true, readOnly: true, testPlans: [] });
    expect(has(html, 'test-plans-empty-new-button')).toBe(false);
    expect(html).toContain('No test plan has been created for this project yet.');
  });

  it('leaves a writable project as before', () => {
    const html = renderList({ canCreate: true, readOnly: false });
    expect(has(html, 'test-plans-new-button')).toBe(true);
    expect(has(html, 'test-plans-read-only-note')).toBe(false);
  });
});

describe('TestPlanDetailView on a read-only project (BK-2541)', () => {
  it('hides Add tests, Close and Edit but keeps Remove, which the server allows', () => {
    const html = renderDetail({ canEdit: true, readOnly: true });
    expect(has(html, 'test-plan-detail-add-tests-button')).toBe(false);
    expect(has(html, 'test-plan-detail-close-button')).toBe(false);
    expect(has(html, 'test-plan-detail-edit-button')).toBe(false);
    expect(has(html, 'test-plan-test-remove-t1')).toBe(true);
    expect(has(html, 'test-plan-detail-read-only-note')).toBe(true);
    expect(has(html, 'test-plan-detail-viewer-note')).toBe(false);
  });

  it('does not invite adding tests to an empty plan', () => {
    const html = renderDetail({ canEdit: true, readOnly: true, tests: [] });
    expect(html).toContain('No tests have been added to this plan yet.');
  });

  it('hides Reopen on a closed plan', () => {
    const html = renderDetail({ canEdit: true, readOnly: true, plan: CLOSED });
    expect(has(html, 'test-plan-closed-banner')).toBe(true);
    expect(has(html, 'test-plan-reopen-button')).toBe(false);
  });

  it('never offers a viewer Remove on a read-only project', () => {
    const html = renderDetail({ canEdit: false, readOnly: true });
    expect(has(html, 'test-plan-test-remove-t1')).toBe(false);
    expect(has(html, 'test-plan-detail-read-only-note')).toBe(true);
  });

  it('leaves a writable project as before', () => {
    const html = renderDetail({ canEdit: true, readOnly: false });
    expect(has(html, 'test-plan-detail-add-tests-button')).toBe(true);
    expect(has(html, 'test-plan-detail-close-button')).toBe(true);
    expect(has(html, 'test-plan-detail-edit-button')).toBe(true);
    expect(has(html, 'test-plan-test-remove-t1')).toBe(true);
    const closed = renderDetail({ canEdit: true, readOnly: false, plan: CLOSED });
    expect(has(closed, 'test-plan-reopen-button')).toBe(true);
  });
});
