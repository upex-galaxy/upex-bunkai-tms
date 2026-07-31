import type { ReactNode } from 'react';
import { StartRunButton } from '@components/tests/StartRunButton';
import { TestDetailTabs } from '@components/tests/TestDetailTabs';
import { loadTestDetail } from '@lib/tests/load-test-detail';
import { ChevronLeft, GitBranch } from 'lucide-react';
import Link from 'next/link';

interface LayoutProps {
  children: ReactNode
  params: Promise<{ projectSlug: string, testId: string }>
}

// BK-37 — the Test-detail shell. Owns the chrome that is the SAME on every tab
// (back link + breadcrumb + Start run + ATC count) and the tab strip below it,
// so switching tabs re-renders only the tab's own content. The header markup
// moved here verbatim from `TestDetailView` — same elements, same classes, same
// `data-testid`s, so nothing about the Steps tab changes visually.
//
// The read is `loadTestDetail`, a React `cache()`-wrapped loader shared with
// each tab's page: one `bunkai_get_test_expanded` call per request, not two.
// Its `notFound()` semantics (missing / not-visible / foreign-workspace Test)
// are unchanged and now guard the whole route group.
export default async function TestDetailLayout({ children, params }: LayoutProps) {
  const { projectSlug, testId } = await params;
  const { test, canReorder, environments } = await loadTestDetail(projectSlug, testId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-surface-1">
      {/* header: full-width bar (border-b divider spans the pane), but its
          content sits in the SAME centered max-width column as the tabs and the
          tab content below, so the whole screen shares one reading column. A
          back link + breadcrumb mirror the ATC detail page chrome (way back to
          the project). */}
      <div className="flex h-9 flex-shrink-0 items-center border-b border-stroke-1 px-4">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            data-testid="test-detail-back"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
            title="Back to project"
          >
            <ChevronLeft size={13} />
          </Link>
          <GitBranch size={13} className="shrink-0 text-fg-3" />
          <Link
            href={`/projects/${projectSlug}`}
            className="shrink-0 text-xs text-fg-3 hover:text-fg-1 hover:underline"
          >
            Tests
          </Link>
          <span className="shrink-0 text-xs text-fg-4">/</span>
          <h1
            data-testid="test-detail-title"
            className="min-w-0 truncate text-sm font-semibold text-fg-0"
          >
            {test.title}
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {canReorder && (
              <StartRunButton
                testId={test.id}
                projectSlug={projectSlug}
                environments={environments}
              />
            )}
            <span
              data-testid="test-detail-atc-count"
              className="inline-flex shrink-0 items-center rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3"
            >
              {test.atc_count}
              {' '}
              ATCs
            </span>
          </div>
        </div>
      </div>

      <TestDetailTabs projectSlug={projectSlug} testId={testId} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
