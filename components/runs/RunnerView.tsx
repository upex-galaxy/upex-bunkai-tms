'use client';

import { useWorkbench } from '@app/(app)/projects/[projectSlug]/workbench-context';
import { Button } from '@components/ui/button';
import { Check, ChevronLeft, Flag, Play, Square, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// BK-34 — the manual runner view. A projection of the composed Run payload
// (`bunkai_get_run_expanded`): the snapshot chain rendered as a checklist.
// Mark-pass / mark-fail interactions are BK-35 — this build renders statuses
// read-only. BK-36 adds the Abort affordance: a running run can be aborted with
// a reason (member+), closing it and skipping the not-yet-executed steps. BK-39
// adds the symmetric Finish affordance: a running run can be finished with a
// final verdict (passed | failed, member+), closing it and skipping the
// not-yet-executed steps. Shape mirrors the GET /api/v1/runs/[id] contract.
// CLIENT component because it registers its `test_title` as the run tab's label
// via the workbench provider and owns the abort + finish modal state.

// BK-36 — frozen AC copy. Mirrors lib/runs/validation.ts so the client renders
// the agreed message without a round-trip on the short-reason case.
const ABORT_REASON_MIN = 3;
const ABORT_REASON_MAX = 500;
const ABORT_REASON_TOO_SHORT_MESSAGE = `Please give a reason of at least ${ABORT_REASON_MIN} characters`;

export type RunStatus = 'running' | 'passed' | 'failed' | 'aborted';
export type StepStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped';
// BK-39 — the two final verdicts a run can be finished with.
export type RunVerdict = 'passed' | 'failed';

export interface RunStep {
  id: string
  atc_step_id: string | null
  position: number
  content: string
  input_data: string | null
  expected: string | null
  status: StepStatus
  note: string | null
  evidence_url: string | null
  executed_at: string | null
}

export interface RunAtc {
  id: string
  atc_id: string
  position: number
  atc_title: string
  status: StepStatus
  steps: RunStep[]
}

export interface RunDetail {
  id: string
  workspace_id: string
  project_id: string
  test_id: string
  environment_id: string
  environment_name: string | null
  status: RunStatus
  abort_reason: string | null
  executor_mode: string
  executor_user_id: string | null
  test_title: string
  version: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  atc_count: number
  step_count: number
  atcs: RunAtc[]
}

interface RunnerViewProps {
  run: RunDetail
  projectSlug: string
  // BK-36 — member+ may abort; viewers get the read-only runner (no Abort button).
  canAbort?: boolean
  // BK-39 — same member+ write gate as abort; viewers get no Finish button.
  canFinish?: boolean
}

// Shared error-envelope shape for both run terminal actions (abort + finish).
interface RunActionErrorBody {
  error?: { message?: string }
}

// Map a run status to the status-chip's `data-status` token (the CSS keys differ
// from the API verbs: 'passed' -> 'pass', 'failed' -> 'fail').
function statusChipToken(status: RunStatus): string {
  switch (status) {
    case 'passed': return 'pass';
    case 'failed': return 'fail';
    case 'aborted': return 'aborted';
    case 'running': return 'running';
  }
}

// BK-39 — deterministic UTC rendering of the finish timestamp. This is a CLIENT
// component but still server-renders the first paint, so `toLocale*` would drift
// between the server + browser timezone and trip a hydration mismatch; slicing
// the ISO string is timezone-stable on both. '2026-06-25T14:32:10Z' -> '2026-06-25 14:32 UTC'.
function formatFinishedAt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function RunnerView({ run, projectSlug, canAbort = false, canFinish = false }: RunnerViewProps) {
  const { registerRunLabel } = useWorkbench();
  const router = useRouter();

  // Local view of the run so the abort response updates the UI in place (status,
  // reason, skipped steps) without waiting for the server re-render; router.refresh
  // then reconciles with the canonical read.
  const [view, setView] = useState<RunDetail>(run);

  // Abort modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [abortError, setAbortError] = useState<string | null>(null);

  // BK-39 — finish modal state. `submitting` is shared with abort: only one of the
  // two modals can be open at a time, so a single in-flight flag is sufficient.
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [verdict, setVerdict] = useState<RunVerdict | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Keep the local view in sync if the server hands down a fresh payload.
  useEffect(() => {
    setView(run);
  }, [run]);

  // Refine the run tab's placeholder label ('Run') to the test title once the
  // composed payload is in hand. `registerRunLabel` is stable + a no-op when the
  // label is unchanged, so this settles after first paint.
  useEffect(() => {
    registerRunLabel(view.id, view.test_title);
  }, [registerRunLabel, view.id, view.test_title]);

  // Progress: every snapshot step starts 'pending'; a step counts as done once
  // its status moves off 'pending'. At creation this renders 0%.
  const total = view.step_count;
  const done = view.atcs.reduce(
    (acc, atc) => acc + atc.steps.filter(s => s.status !== 'pending').length,
    0,
  );
  const pct = total ? Math.round((done / total) * 100) : 0;

  const showAbort = canAbort && view.status === 'running';
  const showFinish = canFinish && view.status === 'running';

  // BK-39 — steps still 'pending' will be marked 'skipped' on finish; surfaced in
  // the modal so the user knows what closing the run leaves behind.
  const pendingSteps = view.atcs.reduce(
    (acc, atc) => acc + atc.steps.filter(s => s.status === 'pending').length,
    0,
  );

  const openModal = () => {
    setReason('');
    setAbortError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) { return; }
    setModalOpen(false);
  };

  const handleAbort = async () => {
    if (submitting) { return; }
    // Client-side guard: render the AC-exact short-reason message without a
    // round-trip (the server enforces the same bound as the source of truth).
    const trimmed = reason.trim();
    if (trimmed.length < ABORT_REASON_MIN) {
      setAbortError(ABORT_REASON_TOO_SHORT_MESSAGE);
      return;
    }

    setSubmitting(true);
    setAbortError(null);
    try {
      const response = await fetch(`/api/v1/runs/${view.id}/abort`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as RunActionErrorBody;
        // Server copy is rendered VERBATIM (frozen AC messages, e.g. the 409
        // "This run is already closed and cannot be aborted.").
        setAbortError(body.error?.message ?? 'Could not abort the run.');
        setSubmitting(false);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { run?: RunDetail };
      if (body.run) {
        setView(body.run);
      }
      setModalOpen(false);
      setSubmitting(false);
      toast.success('Run aborted');
      router.refresh();
    }
    catch (err) {
      setAbortError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  // BK-39 — finish flow, mirroring the abort flow above.
  const openFinishModal = () => {
    setVerdict(null);
    setFinishError(null);
    setFinishModalOpen(true);
  };

  const closeFinishModal = () => {
    if (submitting) { return; }
    setFinishModalOpen(false);
  };

  const handleFinish = async () => {
    // The Confirm button is disabled until a verdict is picked (and while
    // submitting), so finishing without a verdict can't reach here; the server
    // re-validates as the source of truth, returning the AC-exact 422 copy.
    if (submitting || !verdict) { return; }

    setSubmitting(true);
    setFinishError(null);
    try {
      const response = await fetch(`/api/v1/runs/${view.id}/finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as RunActionErrorBody;
        // Server copy is rendered VERBATIM (frozen AC messages, e.g. the 409
        // "This run is already closed and cannot be finished.").
        setFinishError(body.error?.message ?? 'Could not finish the run.');
        setSubmitting(false);
        return;
      }
      // The finish route always returns the composed run on success; reflect the
      // server-stamped status + finished_at (never a client clock).
      const body = (await response.json().catch(() => ({}))) as { run?: RunDetail };
      if (body.run) {
        setView(body.run);
      }
      setFinishModalOpen(false);
      setSubmitting(false);
      toast.success('Run finished');
      router.refresh();
    }
    catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="runner-view"
      className="flex flex-1 flex-col overflow-hidden bg-surface-1"
    >
      {/* header: full-width bar, content in the same centered reading column as
          the body — mirrors TestDetailView chrome (back link + breadcrumb), with
          a status chip + environment name on the right. */}
      <div className="flex h-9 flex-shrink-0 items-center border-b border-stroke-1 px-4">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            data-testid="runner-back"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
            title="Back to project"
          >
            <ChevronLeft size={13} />
          </Link>
          <Play size={13} className="shrink-0 text-fg-3" />
          <Link
            href={`/projects/${projectSlug}`}
            className="shrink-0 text-xs text-fg-3 hover:text-fg-1 hover:underline"
          >
            Runs
          </Link>
          <span className="shrink-0 text-xs text-fg-4">/</span>
          <h1
            data-testid="runner-title"
            className="min-w-0 truncate text-sm font-semibold text-fg-0"
          >
            {view.test_title}
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              data-testid="runner-status"
              className="status-chip"
              data-status={statusChipToken(view.status)}
            >
              {view.status}
            </span>
            <span
              data-testid="runner-env"
              className="inline-flex items-center rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3"
            >
              {view.environment_name ?? 'unknown env'}
            </span>
            {/* BK-39 — Finish affordance: the positive close (member+, running
                only). Sits beside Abort; primary/accent variant (Abort is danger). */}
            {showFinish && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="runner-finish-button"
                onClick={openFinishModal}
              >
                <Flag size={11} />
                Finish run
              </Button>
            )}
            {/* BK-36 — Abort affordance: member+ only, and only while the run is
                still running (hidden on closed runs per the design spec). */}
            {showAbort && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                data-testid="runner-abort-button"
                onClick={openModal}
              >
                <Square size={11} />
                Abort
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* progress bar: a track + accent fill, with a mono "{pct}% complete" label
          and "{done}/{total} steps" count. At creation this reads 0%. */}
      <div className="flex flex-shrink-0 items-center border-b border-stroke-1 px-4 py-2">
        <div
          data-testid="runner-progress"
          data-pct={pct}
          className="mx-auto flex w-full max-w-[820px] items-center gap-3"
        >
          <div className="h-2 flex-1 overflow-hidden rounded-2 border border-stroke-2 bg-surface-2">
            <div
              className="h-full rounded-2 bg-accent transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-2xs font-medium text-fg-2">
            {pct}
            % complete
          </span>
          <span className="shrink-0 font-mono text-2xs text-fg-4">
            {done}
            /
            {total}
            {' '}
            steps
          </span>
        </div>
      </div>

      {/* BK-36 — abort reason: shown on an aborted run only (full text, plain),
          directly under the status. Non-aborted runs render no reason field. */}
      {view.status === 'aborted' && view.abort_reason && (
        <div className="flex flex-shrink-0 items-start border-b border-stroke-1 bg-surface-2 px-4 py-2">
          <div
            data-testid="runner-abort-reason"
            className="mx-auto flex w-full max-w-[820px] items-baseline gap-2"
          >
            <span className="shrink-0 font-mono text-2xs font-medium uppercase tracking-wider text-signal-fail">
              Abort reason
            </span>
            <span className="min-w-0 break-words text-xs text-fg-1">
              {view.abort_reason}
            </span>
          </div>
        </div>
      )}

      {/* BK-39 — final verdict: shown on a finished run only (passed | failed),
          mirroring the abort-reason block. The status chip already carries the
          verdict; this adds the explicit finish time, tinted with the verdict
          token color. */}
      {(view.status === 'passed' || view.status === 'failed') && (
        <div className="flex flex-shrink-0 items-start border-b border-stroke-1 bg-surface-2 px-4 py-2">
          <div
            data-testid="runner-final-verdict"
            data-verdict={view.status}
            className="mx-auto flex w-full max-w-[820px] items-baseline gap-2"
          >
            <span
              className={`shrink-0 font-mono text-2xs font-medium uppercase tracking-wider ${view.status === 'passed' ? 'text-signal-pass' : 'text-signal-fail'}`}
            >
              Final verdict
            </span>
            <span
              className={`shrink-0 text-xs font-medium ${view.status === 'passed' ? 'text-signal-pass' : 'text-signal-fail'}`}
            >
              {view.status === 'passed' ? 'Passed' : 'Failed'}
            </span>
            {view.finished_at && (
              <span className="min-w-0 break-words font-mono text-2xs text-fg-3">
                finished
                {' '}
                {formatFinishedAt(view.finished_at)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ordered snapshot chain — a pending checklist. Centered max-width column,
          aligned with the header content. */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          {view.atcs.map(atc => (
            <div
              key={atc.id}
              data-testid={`runner-atc-${atc.position}`}
              className="card flex flex-col gap-3 p-3"
            >
              {/* ATC header — position chip + title + status dot */}
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 font-mono text-2xs font-medium text-fg-3">
                  {String(atc.position).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-1">
                  {atc.atc_title}
                </span>
                <span className="dot shrink-0" data-status={atc.status} />
              </div>

              {/* step checklist — ChainedAtcCard <ol> anatomy + a per-step status
                  dot so the pending state is visible. */}
              <ol
                data-testid={`runner-steps-${atc.position}`}
                className="m-0 flex list-none flex-col overflow-hidden rounded-2 border border-stroke-2 bg-surface-2 p-0"
              >
                {atc.steps.map((s, i) => (
                  <li
                    key={s.id}
                    data-testid={`runner-step-${atc.position}-${s.position}`}
                    className={`grid grid-cols-[28px_1fr] items-stretch ${i === 0 ? '' : 'border-t border-stroke-1'}`}
                  >
                    <span className="inline-flex items-center justify-center border-r border-stroke-1 font-mono text-xs font-medium text-fg-3">
                      {String(s.position).padStart(2, '0')}
                    </span>
                    <div className="flex items-start gap-2 px-3 py-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="break-words text-[13px] text-fg-1">{s.content}</span>
                        {s.input_data != null && s.input_data !== '' && (
                          <span className="break-words font-mono text-2xs text-fg-3">
                            input:
                            {' '}
                            {s.input_data}
                          </span>
                        )}
                        {s.expected != null && s.expected !== '' && (
                          <span className="break-words font-mono text-2xs text-fg-3">
                            expected:
                            {' '}
                            {s.expected}
                          </span>
                        )}
                      </div>
                      <span className="dot mt-1 shrink-0" data-status={s.status} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* BK-36 — abort confirmation modal. Plain overlay (no native <dialog> —
          those block the page). Reason textarea (≤500), live counter, AC-exact
          short-reason message, danger Confirm. */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            data-testid="runner-abort-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Abort run"
            className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail">
              Abort run
            </div>

            <p className="m-0 mb-3 text-sm text-fg-1">
              This closes the run and skips every step not yet executed. Already
              recorded results are kept. Aborting is final.
            </p>

            <label htmlFor="runner-abort-reason-input" className="mb-1.5 block text-xs text-fg-2">
              Reason
            </label>
            <textarea
              id="runner-abort-reason-input"
              data-testid="runner-abort-reason-input"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (abortError) { setAbortError(null); }
              }}
              maxLength={ABORT_REASON_MAX}
              rows={3}
              autoFocus
              disabled={submitting}
              placeholder="Why are you aborting this run?"
              className="w-full resize-none rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
            />

            <div className="mt-1.5 flex items-center justify-between">
              {abortError
                ? (
                    <span data-testid="runner-abort-error" className="text-xs text-signal-fail">
                      {abortError}
                    </span>
                  )
                : <span />}
              <span data-testid="runner-abort-counter" className="shrink-0 font-mono text-2xs text-fg-4">
                {reason.length}
                {' / '}
                {ABORT_REASON_MAX}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                data-testid="runner-abort-confirm"
                onClick={() => { void handleAbort(); }}
                disabled={submitting}
              >
                <Square size={11} />
                {submitting ? 'Aborting…' : 'Confirm abort'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="runner-abort-cancel"
                onClick={closeModal}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* BK-39 — finish confirmation modal. Mirrors the abort overlay: a verdict
          selector (Pass | Fail, required), the pending-steps note, an error slot
          rendering server copy verbatim, and a primary Confirm gated on a pick. */}
      {finishModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeFinishModal}
        >
          <div
            data-testid="runner-finish-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Finish run"
            className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
              Finish run
            </div>

            <p className="m-0 mb-3 text-sm text-fg-1">
              This closes the run with a final verdict. Already recorded results
              are kept. Finishing is final.
            </p>

            <span id="finish-verdict-label" className="mb-1.5 block text-xs text-fg-2">
              Verdict
            </span>
            <div role="group" aria-labelledby="finish-verdict-label" className="flex items-center gap-2">
              <button
                type="button"
                data-testid="runner-finish-verdict-passed"
                aria-pressed={verdict === 'passed'}
                disabled={submitting}
                onClick={() => {
                  setVerdict('passed');
                  if (finishError) { setFinishError(null); }
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-2 border px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                  verdict === 'passed'
                    ? 'border-signal-pass bg-signal-pass-bg text-signal-pass'
                    : 'border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:text-fg-1'
                }`}
              >
                <Check size={13} />
                Pass
              </button>
              <button
                type="button"
                data-testid="runner-finish-verdict-failed"
                aria-pressed={verdict === 'failed'}
                disabled={submitting}
                onClick={() => {
                  setVerdict('failed');
                  if (finishError) { setFinishError(null); }
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-2 border px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                  verdict === 'failed'
                    ? 'border-signal-fail bg-signal-fail-bg text-signal-fail'
                    : 'border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:text-fg-1'
                }`}
              >
                <X size={13} />
                Fail
              </button>
            </div>

            {!verdict && (
              <p data-testid="runner-finish-hint" className="m-0 mt-2 text-xs text-fg-3">
                Select Pass or Fail to finish the run.
              </p>
            )}

            {pendingSteps > 0 && (
              <p
                data-testid="runner-finish-pending-note"
                className="m-0 mt-2.5 text-xs text-fg-3"
              >
                {pendingSteps}
                {' '}
                pending step
                {pendingSteps === 1 ? '' : 's'}
                {' '}
                will be marked skipped.
              </p>
            )}

            {finishError && (
              <div className="mt-2.5">
                <span data-testid="runner-finish-error" className="text-xs text-signal-fail">
                  {finishError}
                </span>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="runner-finish-confirm"
                onClick={() => { void handleFinish(); }}
                disabled={submitting || !verdict}
              >
                <Flag size={11} />
                {submitting ? 'Finishing…' : 'Finish run'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="runner-finish-cancel"
                onClick={closeFinishModal}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
