'use client';

import type { ImportJob, ImportJobError } from '@lib/types';
import { Button } from '@components/ui/button';
import { DownloadCloud } from 'lucide-react';
import Link from 'next/link';
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
  // BK-1619 — true only for a workspace owner / admin. They get a link to
  // Settings > Jira next to the not-connected and unauthorized messages; everyone
  // else keeps the text-only "ask an owner or admin" copy. Omitted = false.
  canConfigure?: boolean
  onClose?: () => void
}

const SETTINGS_JIRA_HREF = '/settings/jira';
const JIRA_NOT_CONNECTED_ASK = 'Jira is not connected for this workspace. Ask a workspace owner or admin to connect it in Settings > Jira.';
const JIRA_NOT_CONNECTED_ADMIN = 'Jira is not connected for this workspace.';

// Job error codes that Settings > Jira can fix, and the copy shown to an owner /
// admin (who gets the link) instead of the "ask an admin" copy.
const ADMIN_FIXABLE_CODES = new Set(['jira_unauthorized', 'jira_not_connected']);
const JOB_ERROR_COPY_ADMIN: Record<string, string> = {
  jira_unauthorized: 'Jira rejected this workspace\'s credentials.',
  jira_not_connected: 'Jira is not connected for this workspace.',
};

function SettingsJiraLink() {
  return (
    <Link
      href={SETTINGS_JIRA_HREF}
      data-testid="import-settings-jira-link"
      className="font-medium text-accent underline underline-offset-2"
    >
      Open Settings &gt; Jira
    </Link>
  );
}

const JOB_ERROR_COPY: Record<string, string> = {
  jira_unauthorized: 'Jira rejected this workspace\'s credentials. An owner or admin should re-check them in Settings > Jira.',
  jira_not_connected: 'Jira is not connected for this workspace. An owner or admin can connect it in Settings > Jira.',
};

function friendlyError(body: ApiErrorBody, canConfigure: boolean): string {
  switch (body.error?.details?.reason) {
    case 'import_in_progress':
      return 'An import is already running for this project — wait for it to finish.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'jira_not_connected':
      return canConfigure ? JIRA_NOT_CONNECTED_ADMIN : JIRA_NOT_CONNECTED_ASK;
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
export function ImportFromJiraDialog({ projectId, canConfigure = false, onClose }: ImportFromJiraDialogProps) {
  const router = useRouter();
  const [jql, setJql] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The refusal that Settings > Jira can fix (not connected), to show the link.
  const [errorFixableInSettings, setErrorFixableInSettings] = useState(false);

  const status = job?.status ?? (jobId ? 'queued' : null);
  const polling = status !== null && ACTIVE.has(status);

  useEffect(() => {
    if (jobId === null || !polling) {
      return;
    }
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
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
        }
        catch {
          // Transient network error on a poll tick — ignore; the next tick retries.
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
    setErrorFixableInSettings(false);
    try {
      const res = await fetch('/api/v1/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, jql: jql.trim() }),
      });
      if (!res.ok) {
        const errorBody = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(errorBody, canConfigure));
        setErrorFixableInSettings(errorBody.error?.details?.reason === 'jira_not_connected');
        return;
      }
      const body = (await res.json()) as { import_job_id: string, status: ImportJob['status'] };
      setJobId(body.import_job_id);
      setJob(null);
    }
    catch {
      setError('Could not reach the server — check your connection and try again.');
    }
    finally {
      setSubmitting(false);
    }
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
                  onChange={(e) => { setJql(e.target.value); if (error) { setError(null); setErrorFixableInSettings(false); } }}
                  placeholder="project = ACME AND issuetype = Story"
                  rows={3}
                  className="w-full rounded-2 border border-stroke-2 bg-surface-0 px-3 py-2 font-mono text-sm text-fg-1 outline-none focus:border-accent"
                />
              </label>

              {error && (
                <p className="mb-3 text-xs text-signal-fail" data-testid="import-error">
                  {error}
                  {canConfigure && errorFixableInSettings && (
                    <>
                      {' '}
                      <SettingsJiraLink />
                    </>
                  )}
                </p>
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
                      {JOB_ERROR_COPY[e.code]
                        ? (
                            <>
                              {canConfigure && ADMIN_FIXABLE_CODES.has(e.code) ? JOB_ERROR_COPY_ADMIN[e.code] : JOB_ERROR_COPY[e.code]}
                              {canConfigure && ADMIN_FIXABLE_CODES.has(e.code) && (
                                <>
                                  {' '}
                                  <SettingsJiraLink />
                                </>
                              )}
                              {' '}
                              <span className="text-[10px] text-fg-4" data-testid="import-error-code">{e.code}</span>
                            </>
                          )
                        : (
                            <>
                              {e.code}
                              {e.message ? ` — ${e.message}` : ''}
                            </>
                          )}
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
