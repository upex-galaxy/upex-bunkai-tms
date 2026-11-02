import type { TestListItem, TestListSort, TestListSortColumn, TestListViewState } from '@lib/tests/test-list';
import { Button, buttonVariants } from '@components/ui/button';
import {
  formatChainLength,
  formatTestCreatedDate,
  formatTestListCount,
  TEST_LIST_EMPTY_DESCRIPTION_CAN_CREATE,
  TEST_LIST_EMPTY_DESCRIPTION_READ_ONLY,
  TEST_LIST_EMPTY_TITLE,
  TEST_LIST_FAILED_DESCRIPTION,
  TEST_LIST_FAILED_TITLE,
  TEST_LIST_NO_MATCH_TITLE,
  testListNoMatchDescription,
} from '@lib/tests/test-list';
import { cn } from '@lib/utils';
import { AlertTriangle, ArrowDown, ArrowUp, GitBranch, Inbox, Plus, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';

// BK-666 — the Project Tests list (master-design-plan §4.23, §5 D57). No mockup
// draws a Tests list, so the screen is assembled from the LIVE surfaces it sits
// beside: the ATC table's header strip, sticky mono header row and tag chips
// (`AtcTable.tsx`), the ATC Library's named error with Retry and its skeleton
// (`AtcLibraryView.tsx`), and the explorer's Test glyph and chain count. Frozen
// §2 tokens only. Presentational: the container (`tests/(list)/page.tsx`) owns
// the workbench state, this only draws what `lib/tests/test-list.ts` decided.
// Sorting is not animated: it is a frequent action and rows should land at once.

export interface TestsListViewProps {
  projectSlug: string
  // Already filtered and sorted: the whole visible set, never a page of it.
  rows: TestListItem[]
  totalCount: number
  viewState: TestListViewState
  appliedTag: string | null
  sort: TestListSort
  canCreate: boolean
  onSort: (column: TestListSortColumn) => void
  onClearTag: () => void
  onRetry: () => void
}

const SORT_LABEL: Record<TestListSortColumn, string> = {
  name: 'Name',
  chain: 'Chain',
  created: 'Created',
};

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-xs text-fg-4">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span
          key={t}
          className="rounded-1 border border-stroke-1 bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg-2"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function SortHeader({
  column,
  sort,
  onSort,
  className,
}: {
  column: TestListSortColumn
  sort: TestListSort
  onSort: (column: TestListSortColumn) => void
  className?: string
}) {
  const active = sort.column === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('border-b border-stroke-1 px-3 py-2 text-left', className)}
    >
      <button
        type="button"
        data-testid={`tests-list-sort-${column}`}
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 font-mono text-xs font-semibold uppercase tracking-wider transition-colors duration-token ease-token hover:text-fg-0',
          active ? 'text-fg-1' : 'text-fg-3',
        )}
      >
        {SORT_LABEL[column]}
        {active && sort.direction === 'asc' && <ArrowUp size={10} aria-hidden />}
        {active && sort.direction === 'desc' && <ArrowDown size={10} aria-hidden />}
      </button>
    </th>
  );
}

export function TestsListSkeleton() {
  return (
    <div
      data-testid="tests-list-loading"
      aria-busy="true"
      aria-label="Loading Tests"
      className="flex flex-col gap-2 p-4"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-7 animate-pulse rounded-2 bg-surface-2" />
      ))}
    </div>
  );
}

export function TestsListView({
  projectSlug,
  rows,
  totalCount,
  viewState,
  appliedTag,
  sort,
  canCreate,
  onSort,
  onClearTag,
  onRetry,
}: TestsListViewProps) {
  // While a lookup is pending or failed there is no truthful count to show.
  const showCount = viewState !== 'pending' && viewState !== 'failed';

  return (
    <div data-testid="tests-list" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-stroke-1 bg-surface-1 px-4 py-2">
        <h1 className="m-0 flex items-center gap-2 text-sm font-medium text-fg-1">
          <GitBranch size={13} className="text-fg-3" aria-hidden />
          Tests
          {showCount && (
            <span className="font-normal text-fg-3" data-testid="tests-list-count">
              {formatTestListCount(rows.length, totalCount, appliedTag)}
            </span>
          )}
        </h1>
        {viewState === 'rows' && (
          <p className="m-0 hidden text-xs text-fg-3 sm:block">
            Filter with the tag box above. Click a Test to open its chain.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {viewState === 'pending' && <TestsListSkeleton />}

        {viewState === 'failed' && (
          <div
            role="alert"
            data-testid="tests-list-error"
            className="m-4 flex items-start gap-3 rounded-3 border border-fail/40 bg-surface-1 p-4"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-fail" aria-hidden />
            <div className="flex flex-1 flex-col gap-2">
              <p className="m-0 text-sm font-semibold text-fg-0">{TEST_LIST_FAILED_TITLE}</p>
              <p className="m-0 text-xs text-fg-3">{TEST_LIST_FAILED_DESCRIPTION}</p>
              <div>
                <Button type="button" size="sm" data-testid="tests-list-retry" onClick={onRetry}>
                  <RefreshCw size={12} aria-hidden />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {viewState === 'empty-never' && (
          <div
            data-testid="tests-list-empty"
            className="m-4 flex flex-col items-center gap-2 rounded-3 border border-dashed border-stroke-2 px-6 py-12 text-center"
          >
            <GitBranch size={20} className="text-fg-4" aria-hidden />
            <p className="m-0 text-sm font-semibold text-fg-1">{TEST_LIST_EMPTY_TITLE}</p>
            <p className="m-0 max-w-md text-xs leading-relaxed text-fg-3">
              {canCreate ? TEST_LIST_EMPTY_DESCRIPTION_CAN_CREATE : TEST_LIST_EMPTY_DESCRIPTION_READ_ONLY}
            </p>
            {canCreate && (
              <Link
                href={`/projects/${projectSlug}/tests/new`}
                className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'mt-1')}
                data-testid="tests-list-empty-new-test"
              >
                <Plus size={11} aria-hidden />
                New Test
              </Link>
            )}
          </div>
        )}

        {viewState === 'empty-no-match' && appliedTag !== null && (
          <div
            data-testid="tests-list-no-match"
            className="mx-auto flex max-w-[46ch] flex-col items-center gap-2 px-4 py-12 text-center"
          >
            <Inbox size={18} className="text-fg-3" aria-hidden />
            <p className="m-0 text-md font-semibold text-fg-1">{TEST_LIST_NO_MATCH_TITLE}</p>
            <p className="m-0 text-sm leading-relaxed text-fg-3">{testListNoMatchDescription(appliedTag, totalCount)}</p>
            <Button type="button" size="sm" data-testid="tests-list-no-match-clear" className="mt-1" onClick={onClearTag}>
              <X size={12} aria-hidden />
              Clear tag
            </Button>
          </div>
        )}

        {viewState === 'rows' && (
          <table data-testid="tests-list-table" className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr>
                <SortHeader column="name" sort={sort} onSort={onSort} />
                <SortHeader column="chain" sort={sort} onSort={onSort} className="w-24" />
                <th
                  scope="col"
                  className="hidden border-b border-stroke-1 px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-3 sm:table-cell"
                >
                  Tags
                </th>
                <SortHeader column="created" sort={sort} onSort={onSort} className="hidden w-32 sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {rows.map(test => (
                <tr
                  key={test.id}
                  data-testid={`tests-list-row-${test.id}`}
                  className="border-b border-stroke-1 transition-colors duration-token ease-token hover:bg-surface-2"
                >
                  <td className="max-w-0 px-3 py-2 align-middle">
                    <Link
                      href={`/projects/${projectSlug}/tests/${test.id}`}
                      data-testid={`tests-list-open-${test.id}`}
                      className="flex min-w-0 items-center gap-2 text-fg-0 hover:text-accent"
                      title={test.title}
                    >
                      <GitBranch size={12} className="shrink-0 text-fg-3" aria-hidden />
                      <span className="min-w-0 truncate">{test.title}</span>
                    </Link>
                    {/* Phone width: the Tags and Created columns fold into a
                        second line under the name (D57), so every AC-03 field
                        stays readable without sideways scrolling. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 sm:hidden">
                      {test.tags.length > 0 && <TagChips tags={test.tags} />}
                      <span className="font-mono text-2xs text-fg-3">{formatTestCreatedDate(test.created_at)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs text-fg-2 sm:align-middle">
                    {formatChainLength(test.step_count)}
                  </td>
                  <td className="hidden max-w-[280px] px-3 py-2 align-middle sm:table-cell">
                    <TagChips tags={test.tags} />
                  </td>
                  <td
                    className="hidden whitespace-nowrap px-3 py-2 align-middle font-mono text-xs text-fg-3 sm:table-cell"
                    title={test.created_at}
                  >
                    {formatTestCreatedDate(test.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
