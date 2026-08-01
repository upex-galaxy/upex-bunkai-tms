'use client';

import type { BugRecord } from '@components/bugs/BugFormDialog';
import type { BugListRowInput } from '@lib/bugs/list-view';
import { BugFormDialog } from '@components/bugs/BugFormDialog';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import {
  BUG_LIST_EMPTY_DESCRIPTION,
  BUG_LIST_EMPTY_TITLE,
  formatBugListRow,
  resolveBugListViewState,
} from '@lib/bugs/list-view';
import { Bug, ListX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// BK-40 Slice 3 — the standalone "Bug Reports" list (`/projects/[projectSlug]/
// bugs`): a bare, unfiltered, newest-first, single-page table plus a "New bug"
// button (Technical Decision 2 — filters/counts/heatmap are BK-41/BK-42's
// additive work on this SAME route, not built here). No client-side refetch
// exists: the first (and only) page is read server-side by `page.tsx`; a
// successful create prepends the new row locally rather than re-querying.
// Mirrors `RunHistoryView.tsx`'s table shell, trimmed to this ticket's
// bare-bones scope (no filter strip, no totals, no "load older").

export interface BugsListViewProps {
  projectId: string
  modules: { id: string, name: string }[]
  // Same member+ (not-viewer) gate as ProjectLayout's own `canCreate` and
  // RunnerView's `canReportBug` — a viewer sees the list read-only, no "New
  // bug" button at all (structurally absent, not merely hidden).
  canCreateBug: boolean
  initialBugs: BugListRowInput[]
  // Set when the SERVER-side read failed; there is no client-side retry path
  // (Technical Decision 2 — this route has no client refetch of any kind),
  // so this renders the error state as-is. Reloading the page re-runs the
  // server read.
  initialError?: string | null
}

export function BugsListView({ projectId, modules, canCreateBug, initialBugs, initialError = null }: BugsListViewProps) {
  const [bugs, setBugs] = useState<BugListRowInput[]>(initialBugs);
  // `error` starts from the server-side read's own outcome but is NOT frozen
  // there — there is no client-side retry path for the read itself (Technical
  // Decision 2), but a successful create is proof the API/DB path works, so it
  // clears the error rather than leaving a stale "could not load" banner
  // permanently covering a list a create just proved was reachable.
  const [error, setError] = useState<string | null>(initialError);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = bugs.map(formatBugListRow);
  const state = error !== null ? 'error' : resolveBugListViewState(rows.length);

  const handleCreated = (bug: BugRecord) => {
    // The route's own response shape (`bunkai_bug_json`) satisfies
    // `BugListRowInput` structurally — same composed payload, just read
    // through a wider type at the create call site.
    setBugs(prev => [bug as unknown as BugListRowInput, ...prev]);
    setError(null);
    toast.success('Bug filed');
  };

  return (
    <div data-testid="bugs-list-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-fg-0">Bug Reports</h1>
            {canCreateBug && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="bugs-list-new-button"
                onClick={() => setCreateOpen(true)}
              >
                <Bug size={11} />
                New bug
              </Button>
            )}
          </div>

          <Card className="overflow-hidden">
            {state === 'error' && (
              <div data-testid="bugs-list-error" className="flex flex-col items-start gap-2 p-4">
                <p className="text-sm text-fg-2">{error}</p>
              </div>
            )}

            {state === 'empty' && (
              <div
                data-testid="bugs-list-empty"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <ListX size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{BUG_LIST_EMPTY_TITLE}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{BUG_LIST_EMPTY_DESCRIPTION}</span>
              </div>
            )}

            {state === 'rows' && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Bug', 'Title', 'Module', 'Severity', 'Status', 'Run'].map(column => (
                        <th
                          key={column}
                          scope="col"
                          className="whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody data-testid="bugs-list-rows">
                    {rows.map(row => (
                      <tr
                        key={row.id}
                        data-testid={`bugs-list-row-${row.id}`}
                        className="transition-colors duration-token ease-token hover:bg-surface-3"
                      >
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <span className="font-mono text-xs font-medium text-fg-0" title={row.id}>
                            {row.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="max-w-[280px] truncate border-t border-stroke-1 px-3 py-1.5 text-sm text-fg-1">
                          {row.title}
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <span className="font-mono text-xs text-fg-2">{row.modulePath}</span>
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <span className="status-chip" data-status={row.severityToken}>
                            <span className="dot" data-status={row.severityToken} />
                            {row.severity}
                            {' · '}
                            {row.severityLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <span className="status-chip" data-status={row.statusToken}>
                            <span className="dot" data-status={row.statusToken} />
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                          <span className="font-mono text-xs text-fg-2">{row.runLinkLabel}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {createOpen && (
        <BugFormDialog
          open
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          context={{ mode: 'standalone', projectId, modules }}
          initialTitle=""
          initialSeverity="P3"
          initialStepsToReproduce=""
          initialEvidenceUrls={[]}
        />
      )}
    </div>
  );
}

// Suspense fallback for `bugs/page.tsx`'s async section, following the
// `RunHistorySkeleton` precedent: a static skeleton not gated by the same
// async read as the real table, so it paints immediately.
export function BugsListSkeleton() {
  return (
    <div data-testid="bugs-list-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3" aria-hidden="true">
          <div className="h-7 w-40 animate-status-pulse rounded-2 bg-surface-3" />
          <Card className="flex flex-col gap-2 p-4">
            <div className="h-3 w-full animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-5/6 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-4/6 animate-status-pulse rounded-1 bg-surface-3" />
          </Card>
        </div>
      </div>
    </div>
  );
}
