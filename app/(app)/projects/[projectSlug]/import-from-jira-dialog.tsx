'use client';

import type { ImportJob, ImportJobError } from '@lib/types';
import { Button } from '@components/ui/button';
import { DownloadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string }
  }
}

interface ImportFromJiraDialogProps {
  projectId: string
  onClose?: () => void
}

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'import_in_progress':
      return 'An import is already running for this project — wait for it to finish.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This project no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not start the import.';
  }
}

const ACTIVE = new Set(['queued', 'running']);

// Import-from-Jira dialog (BK-17): enter a JQL, start an async job, then poll the
// job row every 2 s and show live status / counts / per-issue errors. Refreshes
// the tree when the import completes so the imported stories appear.
export function ImportFromJiraDialog({ projectId, onClose }: ImportFromJiraDialogProps) {
  const router = useRouter();
  const [jql, setJql] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = job?.status ?? (jobId ? 'queued' : null);
  const polling = status !== null && ACTIVE.has(status);

  useEffect(() => {
    if (jobId === null || !polling) {
      return;
    }
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/v1/imports/${jobId}`);
        if (!res.ok || cancelled) {
          return;
        }
        const body = (await res.json()) as { import_job: ImportJob };
        setJob(body.import_job);
        if (body.import_job.status === 'completed') {
          router.refresh();
          toast.success('Import completed');
        }
        else if (body.import_job.status === 'failed') {
          toast.error('Import failed');
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, polling, router]);

  async function start() {
    if (jql.trim().length === 0 || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/v1/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, jql: jql.trim() }),
    });
    if (!res.ok) {
      setError(friendlyError((await res.json().catch(() => ({}))) as ApiErrorBody));
      setSubmitting(false);
      return;
    }
    const body = (await res.json()) as { import_job_id: string, status: ImportJob['status'] };
    setJobId(body.import_job_id);
    setJob(null);
    setSubmitting(false);
  }

  const errors: ImportJobError[] = job?.errors ?? [];

  return (
    <div
      data-testid="import-from-jira-dialog"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-1 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
        Import from Jira
      </div>
      <p className="mb-4 text-sm text-fg-2">
        Pull issues into this project by JQL. Stories are matched to Modules by component name; unmatched issues land in
        {' '}
        <span className="font-mono text-fg-1">Inbox</span>
        . Re-running the same query is safe (idempotent).
      </p>

      {jobId === null
        ? (
            <>
              <label className="mb-3 block">
                <span className="mb-1.5 block text-xs font-medium text-fg-2">JQL</span>
                <textarea
                  autoFocus
                  data-testid="import-jql"
                  value={jql}
                  onChange={(e) => { setJql(e.target.value); if (error) { setError(null); } }}
                  placeholder="project = ACME AND issuetype = Story"
                  rows={3}
                  className="w-full rounded-2 border border-stroke-2 bg-surface-0 px-3 py-2 font-mono text-sm text-fg-1 outline-none focus:border-accent"
                />
              </label>

              {error && (
                <p className="mb-3 text-xs text-signal-fail" data-testid="import-error">{error}</p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  data-testid="import-start"
                  variant="primary"
                  size="sm"
                  onClick={() => { void start(); }}
                  disabled={jql.trim().length === 0 || submitting}
                >
                  <DownloadCloud size={13} />
                  {submitting ? 'Starting…' : 'Start import'}
                </Button>
                {onClose && (
                  <Button type="button" data-testid="import-cancel" variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )
        : (
            <div data-testid="import-status">
              <div className="mb-3 flex items-center gap-3 rounded-2 border border-stroke-1 bg-surface-2 px-3 py-2">
                <span
                  data-testid="import-status-badge"
                  data-status={status ?? ''}
                  className={
                    status === 'completed'
                      ? 'rounded-1 bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-accent'
                      : status === 'failed'
                        ? 'rounded-1 px-2 py-0.5 font-mono text-xs font-semibold text-signal-fail'
                        : 'rounded-1 px-2 py-0.5 font-mono text-xs font-semibold text-signal-blocked'
                  }
                >
                  {status}
                </span>
                {polling && <span className="text-xs text-fg-4">Working… polling for progress.</span>}
              </div>

              <dl className="mb-3 grid grid-cols-4 gap-2 text-center">
                <Stat label="Imported" value={job?.imported_count ?? 0} testId="import-count-imported" />
                <Stat label="Created" value={job?.created_count ?? 0} testId="import-count-created" />
                <Stat label="Updated" value={job?.updated_count ?? 0} testId="import-count-updated" />
                <Stat label="Skipped" value={job?.skipped_count ?? 0} testId="import-count-skipped" />
              </dl>

              {errors.length > 0 && (
                <div className="mb-3 max-h-32 overflow-auto rounded-2 border border-stroke-1 bg-surface-0 p-2" data-testid="import-errors">
                  {errors.map((e, i) => (
                    <p key={`${e.jira_key ?? 'job'}-${i}`} className="font-mono text-xs text-signal-fail">
                      {e.jira_key ? `${e.jira_key}: ` : ''}
                      {e.code}
                      {e.message ? ` — ${e.message}` : ''}
                    </p>
                  ))}
                </div>
              )}

              {onClose && (
                <Button type="button" data-testid="import-close" variant="ghost" size="sm" onClick={onClose}>
                  {polling ? 'Close (keeps running)' : 'Close'}
                </Button>
              )}
            </div>
          )}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string, value: number, testId: string }) {
  return (
    <div className="rounded-2 border border-stroke-1 bg-surface-2 py-2">
      <div className="font-mono text-base font-semibold text-fg-0" data-testid={testId}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-fg-4">{label}</div>
    </div>
  );
}
