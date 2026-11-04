'use client';

import type { AtcArchivedRow } from '@lib/atcs/library';
import { AtcLibraryErrorBlock, LayerChip } from '@components/atcs/AtcLibraryView';
import { Button } from '@components/ui/button';
import { formatActivityTime } from '@lib/activity/view';
import { restoreAtc } from '@lib/atcs/archive-client';
import { RESTORE_FAILURE_COPY, restoreToastMessage } from '@lib/atcs/restore-copy';
import { Archive, ArchiveRestore, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

// BK-571 — `/atcs?view=archived`: what has been archived on its own, with who
// and when, and a Restore for someone who can write. The rows are read
// server-side by `app/(app)/atcs/page.tsx`; a restore calls the API and then
// re-runs that read through `router.refresh()`. Same table grammar as the active
// view (`AtcLibraryView`), so the two read as one screen in two states.

interface AtcArchivedLibraryViewProps {
  rows: AtcArchivedRow[]
  error: string | null
  canWrite: boolean
}

export const ATC_ARCHIVED_EMPTY_TITLE = 'Nothing has been archived';
export const ATC_ARCHIVED_EMPTY_BODY = 'No ATC in this workspace has been archived. This is not an error.';

export function AtcArchivedLibraryView({ rows, error, canWrite }: AtcArchivedLibraryViewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});

  const refresh = () => { startTransition(() => { router.refresh(); }); };

  const restore = async (row: AtcArchivedRow) => {
    if (restoringId !== null) { return; }
    setRestoringId(row.id);
    setFailures(({ [row.id]: _cleared, ...rest }) => rest);
    const result = await restoreAtc(row.id);
    setRestoringId(null);
    if (!result.ok) {
      setFailures(prev => ({ ...prev, [row.id]: result.errorMessage }));
      return;
    }
    toast.success(restoreToastMessage(result.title ?? row.title, result.heldByParent));
    refresh();
  };

  if (error !== null) {
    return <AtcLibraryErrorBlock error={error} onRetry={refresh} />;
  }

  if (rows.length === 0) {
    return (
      <div data-testid="atc-archived-empty" className="m-6 flex flex-col items-center gap-2 rounded-3 border border-dashed border-stroke-2 px-6 py-12 text-center">
        <Archive size={20} className="text-fg-4" aria-hidden />
        <p className="text-sm font-semibold text-fg-1">{ATC_ARCHIVED_EMPTY_TITLE}</p>
        <p className="max-w-md text-xs text-fg-3">{ATC_ARCHIVED_EMPTY_BODY}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table data-testid="atc-archived-table" className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface-1">
          <tr className="border-b border-stroke-2 text-2xs font-semibold uppercase tracking-wider text-fg-3">
            <th scope="col" className="px-6 py-2 font-semibold">ATC</th>
            <th scope="col" className="px-3 py-2 font-semibold">Name</th>
            <th scope="col" className="px-3 py-2 font-semibold">Project</th>
            <th scope="col" className="px-3 py-2 font-semibold">Module</th>
            <th scope="col" className="px-3 py-2 font-semibold">Layer</th>
            <th scope="col" className="px-3 py-2 font-semibold">Anchor</th>
            <th scope="col" className="px-3 py-2 font-semibold">Archived</th>
            <th scope="col" className="px-6 py-2"><span className="sr-only">Restore</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const failure = failures[row.id];
            const restoring = restoringId === row.id;
            return (
              <tr
                key={row.id}
                data-testid="atc-archived-row"
                className="border-b border-stroke-1 align-top text-sm hover:bg-surface-2"
              >
                <td className="px-6 py-1.5 font-mono text-xs text-fg-0" title={row.slug}>
                  <span className="flex flex-col items-start gap-1">
                    <span>{row.code}</span>
                    <span className="status-chip" data-status="skipped" data-testid="atc-archived-badge">Archived</span>
                  </span>
                </td>
                <td className="max-w-[320px] px-3 py-1.5 text-fg-0">
                  <Link
                    href={`/projects/${row.projectSlug}/atcs/${row.id}`}
                    className="block truncate hover:text-accent"
                    title={row.title}
                  >
                    {row.title}
                  </Link>
                  {row.notes.map(note => (
                    <span key={note} data-testid="atc-archived-note" className="block text-xs text-fg-3">{note}</span>
                  ))}
                  {failure !== undefined && (
                    <span role="alert" data-testid="atc-archived-restore-error" className="mt-1 block text-xs text-signal-fail">
                      <span className="block font-semibold">{RESTORE_FAILURE_COPY}</span>
                      <span className="block font-mono text-fg-3">{failure}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-fg-1">{row.projectName}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-fg-2">{row.moduleName}</td>
                <td className="px-3 py-1.5"><LayerChip layer={row.layer} /></td>
                <td className="max-w-[240px] px-3 py-1.5 font-mono text-xs text-fg-2">
                  <span className="block truncate" title={row.storyLabel}>{row.storyLabel}</span>
                  <span className="block truncate text-fg-3" title={row.acLabel ?? undefined}>
                    {row.acLabel ?? 'No criterion'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-fg-2">
                  <span className="block text-fg-1" data-testid="atc-archived-by">{row.archivedByLabel}</span>
                  <span className="block font-mono text-fg-3" data-testid="atc-archived-at">{formatActivityTime(row.archivedAt)}</span>
                </td>
                <td className="px-6 py-1.5 text-right">
                  {canWrite && (
                    <Button
                      type="button"
                      size="sm"
                      data-testid="atc-restore"
                      aria-label={`Restore ${row.title}`}
                      disabled={restoringId !== null}
                      onClick={() => { void restore(row); }}
                    >
                      {failure !== undefined && !restoring ? <RefreshCw size={12} aria-hidden /> : <ArchiveRestore size={12} aria-hidden />}
                      {restoring ? 'Restoring…' : failure !== undefined ? 'Retry' : 'Restore'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
