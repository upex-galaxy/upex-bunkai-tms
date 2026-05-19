'use client';

import type { Atc } from '@lib/types';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { cn } from '@lib/utils';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface AtcTableRow extends Atc {
  module_path: string
}

interface AtcTableProps {
  atcs: AtcTableRow[]
  projectSlug: string
}

export function AtcTable({ atcs, projectSlug }: AtcTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<AtcTableRow>[]>(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-fg-0">{row.original.id}</span>
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
    data: atcs,
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
          <span className="font-mono text-fg-3">{atcs.length}</span>
          <span className="text-fg-2">ATCs in project</span>
        </div>
        <div className="text-xs text-fg-3">
          Click a row title to open the ATC editor
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
            {table.getRowModel().rows.map(row => (
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
