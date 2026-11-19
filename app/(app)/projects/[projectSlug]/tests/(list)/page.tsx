'use client';

import type { AutomationStatus } from '@lib/tests/automation-status';
import type { TestListSortColumn } from '@lib/tests/test-list';
import { TestsListSkeleton, TestsListView } from '@components/tests/TestsListView';
import {
  automationStatusFilterSearch,
  countByAutomationStatus,
  filterTestsByAutomationStatus,
  nextAutomationStatusFilter,
  parseAutomationStatusFilter,
} from '@lib/tests/automation-status';
import {
  filterTestsByTag,
  nextTestListSort,
  parseTestListSort,
  resolveTestListViewState,
  sortTestList,
  testListSortSearch,
} from '@lib/tests/test-list';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { useWorkbench } from '../../workbench-context';

// BK-666 — the Project Tests list, `/projects/{slug}/tests`. It renders the
// SAME `tests` array the explorer's Tests group renders (resolved once by the
// project layout, BK-620's ALL-match scoping) and the SAME toolbar tag filter
// state, so the list adds no scoping rule and no filter control of its own
// (AC-04, AC-07). The route group `(list)` scopes `loading.tsx` to this page:
// a `tests/loading.tsx` would also become the fallback of `tests/[testId]` and
// `tests/new`.

function TestsListScreen() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    projectSlug,
    tests,
    canCreate,
    testTagFilter,
    filteredTestIds,
    testTagLookupFailed,
    retryTestTagLookup,
    tagInput,
    setTagInput,
    setTestTagFilter,
  } = useWorkbench();

  const { column, direction } = parseTestListSort(searchParams);
  const sort = { column, direction };
  const automationStatus = parseAutomationStatusFilter(searchParams);
  const visible = useMemo(() => filterTestsByTag(tests, filteredTestIds), [tests, filteredTestIds]);
  // BK-227 — counts over every filter except status; the status filter applies last (AND).
  const statusCounts = useMemo(() => countByAutomationStatus(visible), [visible]);
  const statusVisible = useMemo(() => filterTestsByAutomationStatus(visible, automationStatus), [visible, automationStatus]);
  const rows = useMemo(() => sortTestList(statusVisible, { column, direction }), [statusVisible, column, direction]);
  const viewState = resolveTestListViewState({
    totalCount: tests.length,
    visibleCount: visible.length,
    appliedTag: testTagFilter,
    typedTag: tagInput,
    lookupFailed: testTagLookupFailed,
    automationStatus,
    statusVisibleCount: statusVisible.length,
  });

  // The sort rides in the address so Back from a Test restores it (AC-06); the
  // tag filter survives on its own because the workbench provider stays mounted.
  // Written with `history.replaceState`, which Next feeds into
  // `useSearchParams` without a server round trip (the workbench address mirror
  // does the same), so a quick second click on a header reverses at once.
  const onSort = (column: TestListSortColumn) => {
    const search = testListSortSearch(searchParams.toString(), nextTestListSort(sort, column));
    window.history.replaceState(null, '', `${pathname}${search}`);
  };

  const setAutomationStatus = (next: AutomationStatus | null) => {
    const search = automationStatusFilterSearch(searchParams.toString(), next);
    window.history.replaceState(null, '', `${pathname}${search}`);
  };

  // Same effect as the toolbar control's own clear button. The Clear button
  // unmounts with the no-match block, so focus moves to the tag box it cleared.
  const onClearTag = () => {
    setTagInput('');
    setTestTagFilter(null, null);
    document.querySelector<HTMLInputElement>('[data-testid="test-tag-filter"]')?.focus();
  };

  return (
    <TestsListView
      projectSlug={projectSlug}
      rows={rows}
      totalCount={tests.length}
      viewState={viewState}
      appliedTag={testTagFilter}
      sort={sort}
      canCreate={canCreate}
      onSort={onSort}
      onClearTag={onClearTag}
      onRetry={retryTestTagLookup}
      automationStatus={automationStatus}
      statusCounts={statusCounts}
      onAutomationStatus={status => setAutomationStatus(nextAutomationStatusFilter(automationStatus, status))}
      onClearAutomationStatus={() => setAutomationStatus(null)}
    />
  );
}

export default function ProjectTestsListPage() {
  // `useSearchParams()` needs a Suspense boundary (Next).
  return (
    <Suspense fallback={<TestsListSkeleton />}>
      <TestsListScreen />
    </Suspense>
  );
}
