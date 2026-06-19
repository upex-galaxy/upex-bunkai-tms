import { ChainedAtcCard } from '@components/tests/ChainedAtcCard';
import { ChevronLeft, GitBranch } from 'lucide-react';
import Link from 'next/link';

// BK-32 — read-only expanded Test view. Presentational server component: a pure
// projection of the composed RPC payload. STRICTLY READ-ONLY — no buttons,
// forms, drag handles, or edit/add/remove/reorder affordances anywhere (those
// are BK-28+). Shape mirrors `ExpandedTestSchema` in
// `app/api/v1/tests/[id]/route.openapi.ts`.

export interface ChainedStep {
  id: string
  position: number
  content: string
  input_data: string | null
  expected: string | null
}

export interface ChainedAssertion {
  id: string
  position: number
  content: string
}

export interface ChainedAtc {
  position: number
  step_id: string
  id: string
  slug: string
  title: string
  layer: 'UI' | 'API' | 'Unit'
  status: string
  steps: ChainedStep[]
  assertions: ChainedAssertion[]
}

export interface ExpandedTest {
  id: string
  workspace_id: string
  title: string
  created_at: string
  updated_at: string
  atc_count: number
  atcs: ChainedAtc[]
}

interface TestDetailViewProps {
  test: ExpandedTest
  projectSlug: string
}

export function TestDetailView({ test, projectSlug }: TestDetailViewProps) {
  return (
    <div
      data-testid="test-detail-view"
      className="flex flex-1 flex-col overflow-hidden bg-surface-1"
    >
      {/* header: full-width bar (border-b divider spans the pane), but its
          content sits in the SAME centered max-width column as the chain below,
          so the header and body share one centered reading column. A back link
          + breadcrumb mirror the ATC detail page chrome (way back to the project). */}
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
          <span
            data-testid="test-detail-atc-count"
            className="ml-auto inline-flex shrink-0 items-center rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3"
          >
            {test.atc_count}
            {' '}
            ATCs
          </span>
        </div>
      </div>

      {/* ordered chain of expanded ATCs (already ordered by the RPC). Centered
          max-width reading column, aligned with the centered header content. */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          {test.atcs.map(atc => (
            <ChainedAtcCard key={atc.step_id} atc={atc} projectSlug={projectSlug} />
          ))}
        </div>
      </div>
    </div>
  );
}
