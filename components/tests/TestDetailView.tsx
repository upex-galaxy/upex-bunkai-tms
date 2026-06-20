import { ChainedAtcCard } from '@components/tests/ChainedAtcCard';
import { StartRunButton } from '@components/tests/StartRunButton';
import { TestReorderClient } from '@components/tests/TestReorderClient';
import { TestTagEditor } from '@components/tests/TestTagEditor';
import { ChevronLeft, GitBranch } from 'lucide-react';
import Link from 'next/link';

// BK-32 — expanded Test view. Presentational server component: a pure projection
// of the composed RPC payload. The chain is read-only EXCEPT when the viewer can
// reorder (BK-28, member+) — then the chain region is delegated to the
// interactive `TestReorderClient` (drag-reorder + Save). Shape mirrors
// `ExpandedTestSchema` in `app/api/v1/tests/[id]/route.openapi.ts`.

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
  version: number
  // BK-33 — the Test's tag set (reserved suite tags + custom tags). May be empty.
  tags: string[]
  created_at: string
  updated_at: string
  atc_count: number
  atcs: ChainedAtc[]
}

interface TestDetailViewProps {
  test: ExpandedTest
  projectSlug: string
  // BK-28 — member/admin/owner may drag-reorder the chain; viewers get the
  // read-only projection with no drag handles (affordance hidden). BK-33 reuses
  // this same member+ gate as `canEdit` for the tag editor. BK-34 reuses it to
  // gate the Start-run affordance — viewers don't start runs.
  canReorder?: boolean
  // BK-34 — the project's environments (id + name) for the Start-run picker.
  environments?: { id: string, name: string }[]
}

export function TestDetailView({ test, projectSlug, canReorder = false, environments = [] }: TestDetailViewProps) {
  const tags = test.tags ?? [];
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

      {/* BK-33 — tags row: read-only chips (AtcPreview idiom) plus, for members+,
          an inline "Edit tags" affordance that opens the TestTagEditor. Sits in
          the SAME centered reading column as the header + chain. Hidden entirely
          for a viewer with no tags (nothing to show, nothing to edit). */}
      {(tags.length > 0 || canReorder) && (
        <div className="flex flex-shrink-0 items-center border-b border-stroke-1 px-4 py-1.5">
          <div className="mx-auto flex w-full max-w-[820px] flex-wrap items-center gap-1.5">
            {tags.length > 0
              ? (
                  tags.map(t => (
                    <span
                      key={t}
                      data-testid={`test-detail-tag-${t}`}
                      className="inline-flex items-center rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-fg-2"
                    >
                      {t}
                    </span>
                  ))
                )
              : (
                  <span data-testid="test-detail-tags-empty" className="text-2xs italic text-fg-4">
                    No tags
                  </span>
                )}
            {canReorder && (
              <TestTagEditor
                testId={test.id}
                version={test.version}
                initialTags={tags}
              />
            )}
          </div>
        </div>
      )}

      {/* ordered chain of expanded ATCs (already ordered by the RPC). Centered
          max-width reading column, aligned with the centered header content. */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          {canReorder
            ? (
                // Key on id+version so a router.refresh() that brings fresh server
                // data (e.g. after a conflict reload) REMOUNTS with clean baseline
                // state instead of keeping the stale local order.
                <TestReorderClient key={`${test.id}:${test.version}`} test={test} projectSlug={projectSlug} />
              )
            : test.atcs.map(atc => (
                <ChainedAtcCard key={atc.step_id} atc={atc} projectSlug={projectSlug} />
              ))}
        </div>
      </div>
    </div>
  );
}
