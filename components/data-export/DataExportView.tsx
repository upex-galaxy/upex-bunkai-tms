'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface WorkspaceExport {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  expires_at: string | null
}

type DisplayState = 'loading' | 'never-requested' | 'preparing' | 'ready' | 'expired' | 'failed' | 'error';

const POLL_INTERVAL_MS = 4_000;

interface DataExportViewProps {
  workspaceId: string | null
}

// Client view for Settings > Data export (BK-508). Two regions: a persistent
// "what this covers" panel (always visible, satisfies AC-01/AC-03) and this
// status/action card driving the 7-state lifecycle. Built directly against
// the live settings/billing shell per Rule #14 — no separate mockup exists.
export function DataExportView({ workspaceId }: DataExportViewProps) {
  const [exportRow, setExportRow] = useState<WorkspaceExport | null>(null);
  const [state, setState] = useState<DisplayState>('loading');
  const [requesting, setRequesting] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const deriveState = useCallback((row: WorkspaceExport | null): DisplayState => {
    if (!row) {
      return 'never-requested';
    }
    if (row.status === 'queued' || row.status === 'running') {
      return 'preparing';
    }
    if (row.status === 'failed') {
      return 'failed';
    }
    // completed
    if (row.expires_at && new Date(row.expires_at).getTime() > Date.now()) {
      return 'ready';
    }
    return 'expired';
  }, []);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setState('error');
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/data-export`, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        setState('error');
        return;
      }
      const data = await response.json() as { export: WorkspaceExport | null };
      if (controller.signal.aborted) {
        return;
      }
      setExportRow(data.export);
      setState(deriveState(data.export));
    }
    catch {
      if (!controller.signal.aborted) {
        setState('error');
      }
    }
  }, [workspaceId, deriveState]);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  // Poll while preparing; stop once ready/failed/expired/error.
  useEffect(() => {
    if (state !== 'preparing') {
      return;
    }
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state, load]);

  const requestExport = useCallback(async () => {
    if (!workspaceId || requesting) {
      return;
    }
    setRequesting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/data-export`, { method: 'POST' });
      if (response.ok || response.status === 409) {
        await load();
      }
    }
    finally {
      setRequesting(false);
    }
  }, [workspaceId, requesting, load]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b border-stroke-1 p-4">
          <CardTitle className="text-sm font-semibold text-fg-0">What's in an export</CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-sm text-fg-2">
          <p>
            A single archive of this workspace's Projects, Modules, User Stories, Acceptance Criteria, ATCs, Tests,
            Runs, Bugs, activity, and membership — structured JSON, readable without Bunkai. No credential (Personal
            Access Token, invite link, or magic link) is ever included. Ready archives stay downloadable for 7 days.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-stroke-1 p-4">
          <CardTitle className="text-sm font-semibold text-fg-0">Export status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4">
          {state === 'loading' && <p className="text-sm text-fg-3">Loading…</p>}

          {state === 'error' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-signal-fail">Could not load the export status.</p>
              <button
                type="button"
                onClick={() => void load()}
                className="flex h-8 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-3 px-3 text-sm font-medium text-fg-1 hover:bg-surface-4"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {state === 'never-requested' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-fg-2">No export has been requested yet for this workspace.</p>
              <RequestButton onClick={() => void requestExport()} busy={requesting} label="Request export" />
            </div>
          )}

          {state === 'preparing' && exportRow && (
            <p className="text-sm text-fg-2">
              An export is being prepared, requested
              {' '}
              {new Date(exportRow.created_at).toLocaleString()}
              . This page
              updates automatically.
            </p>
          )}

          {state === 'ready' && exportRow?.expires_at && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-fg-2">
                Your export is ready. Downloadable until
                {' '}
                {new Date(exportRow.expires_at).toLocaleString()}
                .
              </p>
              <a
                href={`/api/v1/workspaces/${workspaceId}/data-export/download`}
                className="flex h-8 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-3 px-3 text-sm font-medium text-fg-1 hover:bg-surface-4"
              >
                Download archive
              </a>
            </div>
          )}

          {state === 'expired' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-fg-2">The last export has expired and is no longer downloadable.</p>
              <RequestButton onClick={() => void requestExport()} busy={requesting} label="Request a new export" />
            </div>
          )}

          {state === 'failed' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-signal-fail">The export failed to prepare.</p>
              <RequestButton onClick={() => void requestExport()} busy={requesting} label="Retry" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RequestButton({ onClick, busy, label }: { onClick: () => void, busy: boolean, label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-8 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-3 px-3 text-sm font-medium text-fg-1 hover:bg-surface-4 disabled:opacity-50"
    >
      {busy ? 'Requesting…' : label}
    </button>
  );
}
