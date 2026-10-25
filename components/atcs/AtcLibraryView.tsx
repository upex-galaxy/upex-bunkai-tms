'use client';

import type { AtcLibraryRow } from '@lib/atcs/library';
import { Button } from '@components/ui/button';
import { resolveAtcLibraryViewState } from '@lib/atcs/library';
import { AlertTriangle, ArrowUpRight, Library, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

// BK-439 — global ATC Library (`/atcs`, master-design-plan §4.9). A
// lookup-and-launch surface: no search, no filters, no in-place editor. The
// rows are read server-side by `app/(app)/atcs/page.tsx`; Retry re-runs that
// read through `router.refresh()`.

interface AtcLibraryViewProps {
  rows: AtcLibraryRow[]
  error: string | null
}

export const ATC_LIBRARY_ERROR_COPY = 'Couldn\u2019t load ATCs.';

function LayerChip({ layer }: { layer: string }) {
  return (
    <span className="layer-chip" data-layer={layer.toLowerCase()}>
      {layer}
    </span>
  );
}

export function AtcLibraryView({ rows, error }: AtcLibraryViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const retry = () => { startTransition(() => { router.refresh(); }); };

  const open = (row: AtcLibraryRow) => {
    toast(`Opening ${row.code} in ${row.projectName}`);
    router.push(`/projects/${row.projectSlug}/atcs/${row.id}`);
  };

  if (pending) { return <AtcLibrarySkeleton />; }

  if (error !== null) {
    return (
      <div role="alert" data-testid="atc-library-error" className="m-6 flex items-start gap-3 rounded-3 border border-fail/40 bg-surface-1 p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-fail" aria-hidden />
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm font-semibold text-fg-0">{ATC_LIBRARY_ERROR_COPY}</p>
          <p className="font-mono text-xs text-fg-3">{error}</p>
          <div>
            <Button type="button" variant="default" size="sm" onClick={retry}>
              <RefreshCw size={12} aria-hidden />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (resolveAtcLibraryViewState(rows.length) === 'empty') {
    return (
      <div data-testid="atc-library-empty" className="m-6 flex flex-col items-center gap-2 rounded-3 border border-dashed border-stroke-2 px-6 py-12 text-center">
        <Library size={20} className="text-fg-4" aria-hidden />
        <p className="text-sm font-semibold text-fg-1">No ATCs found</p>
        <p className="max-w-md text-xs text-fg-3">
          This workspace has no ATCs yet. This is not an error — ATCs you create inside a Project will be indexed here.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table data-testid="atc-library-table" className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface-1">
          <tr className="border-b border-stroke-2 text-2xs font-semibold uppercase tracking-wider text-fg-3">
            <th scope="col" className="px-6 py-2 font-semibold">ATC</th>
            <th scope="col" className="px-3 py-2 font-semibold">Name</th>
            <th scope="col" className="px-3 py-2 font-semibold">Project</th>
            <th scope="col" className="px-3 py-2 font-semibold">Module</th>
            <th scope="col" className="px-3 py-2 font-semibold">Layer</th>
            <th scope="col" className="px-3 py-2 font-semibold">Anchor</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Used in</th>
            <th scope="col" className="px-6 py-2"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              data-testid="atc-library-row"
              className="border-b border-stroke-1 text-sm hover:bg-surface-2"
            >
              <td className="px-6 py-1.5 font-mono text-xs text-fg-0" title={row.slug}>{row.code}</td>
              <td className="max-w-[320px] truncate px-3 py-1.5 text-fg-0" title={row.title}>{row.title}</td>
              <td className="px-3 py-1.5 text-fg-1">{row.projectName}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-fg-2">{row.moduleName}</td>
              <td className="px-3 py-1.5"><LayerChip layer={row.layer} /></td>
              <td className="max-w-[240px] px-3 py-1.5 font-mono text-xs text-fg-2">
                <span className="block truncate" title={row.storyLabel}>{row.storyLabel}</span>
                <span className="block truncate text-fg-3" title={row.acLabel ?? undefined}>
                  {row.acLabel ?? 'No criterion'}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs text-fg-2">
                {`used in ${row.usedInTests} ${row.usedInTests === 1 ? 'test' : 'tests'}`}
              </td>
              <td className="px-6 py-1.5 text-right">
                <button
                  type="button"
                  onClick={() => { open(row); }}
                  aria-label={`Open ${row.code} in ${row.projectName}`}
                  className="inline-flex items-center gap-1 rounded-2 px-2 py-1 text-xs text-fg-2 hover:bg-surface-3 hover:text-accent"
                >
                  Open
                  <ArrowUpRight size={11} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AtcLibrarySkeleton() {
  return (
    <div data-testid="atc-library-loading" aria-busy="true" aria-label="Loading ATCs" className="flex flex-col gap-2 p-6">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-7 animate-pulse rounded-2 bg-surface-2" />
      ))}
    </div>
  );
}
