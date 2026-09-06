'use client';

import type { AtcFacetValue } from '@lib/atcs/list-filters';
import type { Atc, AtcLayer, AtcPriority, AtcTechnique } from '@lib/types';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useWorkbench } from '@app/(app)/projects/[projectSlug]/workbench-context';
import { Button } from '@components/ui/button';
import {
  ATC_FILTER_UNSPECIFIED,
  ATC_UNSPECIFIED_LABEL,
  atcListFiltersActive,
  matchesAtcListFilters,
  resolveAtcListViewState,
} from '@lib/atcs/list-filters';
import { ATC_PRIORITIES, ATC_TECHNIQUES } from '@lib/atcs/validation';
import { cn, shortSlug } from '@lib/utils';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpRight, Inbox, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface AtcTableRow extends Atc {
  module_path: string
}

interface AtcTableProps {
  atcs: AtcTableRow[]
  projectSlug: string
}

const LAYER_FILTERS: AtcLayer[] = ['UI', 'API', 'Unit'];

// BK-399 / AC-06 — the SECOND, distinct empty state. "This project has never
// had an ATC" and "this combination excludes every ATC" are different facts
// with different next actions, so they get different blocks. Copy is the AI
// Product Owner's Q4 ruling verbatim, adapted one-for-one from
// `BUGS_LIST_NO_MATCH_DESCRIPTION` with this screen's field names.
const ATC_LIST_NO_MATCH_TITLE = 'No ATCs match the current filters';
const ATC_LIST_NO_MATCH_DESCRIPTION
  = 'The combination of technique, priority and layer filters excludes every ATC in this project. This is a valid result, not an error — clear the filters to see everything again.';

// The `<select>` value round-trip. `''` is the `All …` option (facet off) and
// the sentinel is `Not specified` (match SQL NULL); anything else is the enum
// member itself, byte-for-byte.
function toFacetValue<T extends string>(raw: string): AtcFacetValue<T> {
  if (raw === '') { return null; }
  if (raw === ATC_FILTER_UNSPECIFIED) { return ATC_FILTER_UNSPECIFIED; }
  return raw as T;
}

export function AtcTable({ atcs, projectSlug }: AtcTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { atcFilters, setAtcFilters, resetAtcFilters } = useWorkbench();

  // Client-side over the rows the workbench already loaded (master-design-plan
  // §5 D41 / AI Tech Lead T3). This is what makes `Not specified` filterable
  // without adding a null-sentinel query parameter to the API.
  const visibleAtcs = useMemo(
    () => atcs.filter(row => matchesAtcListFilters(row, atcFilters)),
    [atcs, atcFilters],
  );
  const filtersActive = atcListFiltersActive(atcFilters);
  const viewState = resolveAtcListViewState({
    totalCount: atcs.length,
    visibleCount: visibleAtcs.length,
    filtersActive,
  });

  const columns = useMemo<ColumnDef<AtcTableRow>[]>(() => [
    {
      accessorKey: 'slug',
      header: 'ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-fg-0" title={row.original.slug}>
          {shortSlug(row.original.slug)}
        </span>
      ),
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <Link
          href={`/projects/${projectSlug}/atcs/${row.original.id}`}
          className="flex items-center gap-2 text-sm text-fg-0 hover:text-accent"
        >
          {row.original.title}
          <ArrowUpRight size={11} className="text-fg-4" />
        </Link>
      ),
    },
    {
      accessorKey: 'layer',
      header: 'Layer',
      cell: ({ row }) => (
        <span className="layer-chip" data-layer={row.original.layer.toLowerCase()}>
          {row.original.layer}
        </span>
      ),
    },
    {
      accessorKey: 'module_path',
      header: 'Module',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-fg-2">{row.original.module_path}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="status-chip" data-status={row.original.status}>
          <span className="dot" data-status={row.original.status} />
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.map(t => (
            <span
              key={t}
              className="rounded-1 border border-stroke-1 bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg-2"
            >
              {t}
            </span>
          ))}
        </div>
      ),
    },
  ], [projectSlug]);

  const table = useReactTable({
    data: visibleAtcs,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-stroke-1 bg-surface-1 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-fg-3" data-testid="atc-list-count">{visibleAtcs.length}</span>
          {/* AC-05 — with a facet active the count is the count of what the user
              is looking at, with the project total kept in view beside it. */}
          <span className="text-fg-2">
            {filtersActive ? `of ${atcs.length} ATCs match` : 'ATCs in project'}
          </span>
        </div>
        <div className="text-xs text-fg-3">
          {atcs.length > 0
            ? 'Click a row title to open the ATC editor'
            : 'ATCs arrive with the builder next sprint'}
        </div>
      </div>

      {/* BK-399 filter strip. Lives INSIDE the table view, above the header row,
          because it only means anything here — the Topbar persists across the
          ATC / Test / run detail routes (master-design-plan §5 D41, on the D37
          precedent). Container mirrors `bugs-list-toolbar` exactly. */}
      <div className="border-b border-stroke-1 bg-surface-1 px-4 py-3">
        <div
          data-testid="atc-list-toolbar"
          className="flex flex-wrap items-end gap-4 rounded-3 border border-stroke-2 bg-surface-2 p-3 shadow-card"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Technique</span>
            <select
              data-testid="atc-list-technique-filter"
              value={atcFilters.technique ?? ''}
              onChange={e => setAtcFilters({ technique: toFacetValue<AtcTechnique>(e.target.value) })}
              className="h-8 min-w-[220px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
            >
              <option value="">All techniques</option>
              {ATC_TECHNIQUES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
              {/* Last, per the PO's Q5 ordering ruling. Matches `technique IS
                  NULL` client-side — never a query parameter. */}
              <option value={ATC_FILTER_UNSPECIFIED}>{ATC_UNSPECIFIED_LABEL}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Priority</span>
            <select
              data-testid="atc-list-priority-filter"
              value={atcFilters.priority ?? ''}
              onChange={e => setAtcFilters({ priority: toFacetValue<AtcPriority>(e.target.value) })}
              className="h-8 min-w-[160px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
            >
              <option value="">All priorities</option>
              {ATC_PRIORITIES.map(pr => (
                <option key={pr} value={pr}>{pr}</option>
              ))}
              <option value={ATC_FILTER_UNSPECIFIED}>{ATC_UNSPECIFIED_LABEL}</option>
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span id="atc-layer-filter-label" className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Layer</span>
            {/* Single-select: clicking the active chip clears it
                (RunHistoryView's outcome idiom). The frozen `.layer-chip`
                token carries the colour AND the text label — colour is never
                the only signal. */}
            <div role="group" aria-labelledby="atc-layer-filter-label" className="flex h-8 flex-wrap items-center gap-1.5">
              {LAYER_FILTERS.map((l) => {
                const pressed = atcFilters.layer === l;
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={pressed}
                    data-testid={`atc-list-filter-layer-${l.toLowerCase()}`}
                    data-layer={l.toLowerCase()}
                    onClick={() => setAtcFilters({ layer: pressed ? null : l })}
                    className={cn(
                      'layer-chip transition-opacity duration-token ease-token',
                      pressed ? 'ring-1 ring-accent' : 'opacity-60 hover:opacity-100',
                    )}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="atc-list-reset-filters"
              className="ml-auto"
              onClick={resetAtcFilters}
            >
              <X size={12} />
              Reset filters
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="sticky top-0 z-10 bg-surface-1">
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sortDir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className="border-b border-stroke-1 px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-3"
                    >
                      <button
                        type="button"
                        disabled={!canSort}
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1',
                          canSort && 'cursor-pointer hover:text-fg-0',
                        )}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortDir === 'asc' && <ArrowUp size={10} />}
                        {sortDir === 'desc' && <ArrowDown size={10} />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {viewState === 'empty-never' && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  {/* The never-had-any state. Its description is stale since
                      BK-19 shipped the builder — tracked as BK-883, deliberately
                      NOT rewritten here (surgical-changes rule). BK-399 only
                      adds the testid AC-06 needs to tell the two states apart. */}
                  <div
                    data-testid="atc-list-empty"
                    className="mx-auto flex max-w-[380px] flex-col items-center gap-1.5"
                  >
                    <p className="text-sm font-medium text-fg-2">No ATCs yet</p>
                    <p className="text-xs leading-relaxed text-fg-4">
                      Acceptance Test Cases are assembled in the ATC builder, which ships next sprint. For now, capture expected behaviour as acceptance criteria inside your user stories.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {viewState === 'empty-no-match' && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div
                    data-testid="atc-list-no-match"
                    className="mx-auto flex max-w-[46ch] flex-col items-center gap-2"
                  >
                    <Inbox size={18} className="text-fg-3" />
                    <p className="text-md font-semibold text-fg-1">{ATC_LIST_NO_MATCH_TITLE}</p>
                    <p className="text-sm leading-relaxed text-fg-3">{ATC_LIST_NO_MATCH_DESCRIPTION}</p>
                    <Button
                      type="button"
                      size="sm"
                      data-testid="atc-list-no-match-clear"
                      className="mt-1"
                      onClick={resetAtcFilters}
                    >
                      <X size={12} />
                      Clear filters
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {viewState === 'rows' && table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                className="border-b border-stroke-1 transition-colors hover:bg-surface-2"
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    className="px-3 py-2.5 align-middle"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
