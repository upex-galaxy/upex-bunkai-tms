'use client';

import { Button } from '@components/ui/button';
import { csvBlobFromResponse } from '@lib/atcs/csv-export';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// BK-315 — "Export as CSV" trigger for a Project's ATC library. A fresh fetch
// at click time (never a reuse of already-loaded workbench state), mirroring
// `TraceabilityChainView.tsx`'s BK-50 export: Blob + object URL + a
// transient, never-mounted anchor, revoked synchronously after the click.
// Disabled while the request is in flight — a one-shot action trigger, not a
// filter input (Dev Q3 ruling, Jira BK-315), matching the disable-while-loading
// pattern at `ProjectRunsReportView.tsx:495`.
//
// BK-637 — the response is turned into a Blob by `csvBlobFromResponse`, never
// by a bare `response.text()` + `new Blob(...)` here: `text()` strips the
// route's UTF-8 BOM as part of the WHATWG UTF-8 decode, and the saved file
// would then be BOM-less. The construction lives in the lib so the bytes that
// reach disk are asserted by a test rather than only by this comment.

const FALLBACK_ERROR_MESSAGE = 'Could not export the ATC library.';
const FALLBACK_FILENAME = 'atcs.csv';

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) { return null; }
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}

function triggerCsvDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportAtcsButton({ projectId }: { projectId: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) { return; }
    setExporting(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/atcs/export`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.error(body.error?.message ?? FALLBACK_ERROR_MESSAGE);
        return;
      }
      const blob = await csvBlobFromResponse(response);
      const filename = filenameFromContentDisposition(response.headers.get('content-disposition')) ?? FALLBACK_FILENAME;
      triggerCsvDownload(blob, filename);
      toast.success('ATC library exported', { description: `Saved as ${filename}.` });
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      setExporting(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      data-testid="project-export-atcs"
      onClick={() => { void handleExport(); }}
      disabled={exporting}
      aria-busy={exporting}
    >
      <Download size={11} />
      {exporting ? 'Exporting…' : 'Export as CSV'}
    </Button>
  );
}
