import { RUN_STEP_EVIDENCE_URL_MAX, RUN_STEP_NOTE_MAX } from '@lib/runs/validation';

// BK-35 — Mark Step view-state logic: framework-agnostic, pure functions
// only. All I/O (the POST .../mark call, the Realtime subscription) stays in
// RunnerView.tsx; this file is what makes the per-step control visibility,
// the ATC verdict badge (Q1), the closed-run guard copy (Q2), and the
// member+ visibility gate (Q4) unit-testable without a browser or a live DB.
// Mirrors lib/runs/report-view.ts / history-view.ts's pattern.

// Duck-typed status unions — deliberately NOT imported from
// components/runs/RunnerView.tsx. `lib/**` never imports from
// `components/**` (mirrors lib/runs/realtime-run-channel.ts's own note);
// these are the same literal unions RunnerView.tsx exports, so its RunDetail
// values satisfy this module's params with no adapter.
export type RunStatus = 'running' | 'passed' | 'failed' | 'aborted';
export type StepStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped';
export type StepMarkStatus = 'passed' | 'failed' | 'blocked';

// Q2 (implementation-plan.md) — frozen guard copy, mirrors the abort/finish
// "already closed" template verbatim. The RPC (0042_run_step_mark.sql,
// SQLSTATE 45212) and lib/runs/errors.ts's 409 case both emit this EXACT
// string; exported here too so a viewer whose tab sees the run close
// mid-session (via the Realtime refetch) can be shown the same guard copy
// proactively, in place of the controls, rather than only on a failed POST.
export const RUN_STEP_MARKING_CLOSED_MESSAGE = 'This run is already closed and cannot accept new step results.';

// ---------------------------------------------------------------------------
// Per-step mark control visibility (Q2, Q4, AC6/Q7)
// ---------------------------------------------------------------------------

export interface StepMarkControlState {
  // Q4 — controls are structurally absent (not merely hidden) for a
  // non-member+/viewer caller: the component never renders the buttons at
  // all when this is false, mirroring RunnerView's existing
  // `{showAbort && <Button/>}` convention for canAbort/canFinish.
  showControls: boolean
  // Non-null exactly when a member+ actor WOULD see controls, but the run
  // is no longer 'running' — the component renders Q2's frozen copy in
  // place of the buttons so a second viewer understands why marking just
  // disappeared, instead of the controls silently vanishing.
  guardMessage: string | null
  // AC6/Q7 — re-marking is always allowed (last-write-wins); `pressed` only
  // reflects which option (if any) the CURRENT status already is. It never
  // disables the other two — "reject re-mark to pending" is structural (only
  // passed/failed/blocked are ever offered as buttons), not an extra
  // enabled/disabled guard on top. Mirrors the Finish modal's
  // `aria-pressed` verdict-toggle pattern already in RunnerView.tsx.
  pressed: Record<StepMarkStatus, boolean>
}

export interface ResolveStepMarkControlStateParams {
  canMark: boolean
  runStatus: RunStatus
  stepStatus: StepStatus
}

export function resolveStepMarkControlState(
  { canMark, runStatus, stepStatus }: ResolveStepMarkControlStateParams,
): StepMarkControlState {
  const pressed: Record<StepMarkStatus, boolean> = {
    passed: stepStatus === 'passed',
    failed: stepStatus === 'failed',
    blocked: stepStatus === 'blocked',
  };

  if (!canMark) {
    return { showControls: false, guardMessage: null, pressed: { passed: false, failed: false, blocked: false } };
  }

  const running = runStatus === 'running';
  return {
    showControls: running,
    guardMessage: running ? null : RUN_STEP_MARKING_CLOSED_MESSAGE,
    pressed,
  };
}

// ---------------------------------------------------------------------------
// ATC verdict badge + status dot token (Q1)
// ---------------------------------------------------------------------------

// D1 (implementation-plan.md) — `run_atcs.status = 'pending'` IS the PO's
// "unrun" state; no new enum value, no new color. `skipped` is included here
// only for TS exhaustiveness over the shared StepStatus union — the RPC's
// verdict recompute (DB-1 step 7) never assigns an ATC 'skipped' (only
// bunkai_finish_run ever sets a run_steps row to 'skipped', confirmed by
// mark-step.test.ts's own finish-interop case), so this branch is dead in
// practice but keeps the lookup total rather than partial.
const ATC_VERDICT_LABEL: Record<StepStatus, string> = {
  pending: 'Unrun',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

// The live `.status-chip[data-status]` / `.dot[data-status]` tokens
// (app/globals.css) are 'pass' | 'fail' | 'blocked' | 'skipped' | 'running' |
// 'aborted' — NOT the API's own step/ATC verbs ('passed'/'failed'/'pending').
// Mirrors the STATUS_TOKEN substitution already established in
// RunHistoryView.tsx / ProjectRunsReportView.tsx. 'pending' reuses the
// 'skipped' token verbatim — Q1's own instruction is no new color for
// "unrun"; the existing neutral/gray token already reads correctly as
// "nothing recorded here yet".
const STATUS_DOT_TOKEN: Record<StepStatus, string> = {
  pending: 'skipped',
  passed: 'pass',
  failed: 'fail',
  blocked: 'blocked',
  skipped: 'skipped',
};

export function resolveStatusDotToken(status: StepStatus): string {
  return STATUS_DOT_TOKEN[status];
}

export interface AtcVerdictBadge {
  label: string
  token: string
}

export function resolveAtcVerdictBadge(status: StepStatus): AtcVerdictBadge {
  return { label: ATC_VERDICT_LABEL[status], token: resolveStatusDotToken(status) };
}

// ---------------------------------------------------------------------------
// Mark-form client-side field validation
// ---------------------------------------------------------------------------

// Immediate, field-specific feedback ahead of the round trip — mirrors
// handleAbort's client-side short-reason check in RunnerView.tsx. The RPC
// (via RunStepMarkBodySchema, lib/runs/validation.ts) stays the enforcement
// point of record for a direct/non-UI caller; this is a UX convenience only,
// reusing the SAME bounds (RUN_STEP_NOTE_MAX / RUN_STEP_EVIDENCE_URL_MAX) so
// the two layers can never drift apart. Trims first, mirroring Q8's
// empty-to-null normalization — a whitespace-only value never trips a bound
// or the URL check.
export interface ValidateMarkStepFormParams {
  note: string
  evidenceUrl: string
}

export function validateMarkStepForm({ note, evidenceUrl }: ValidateMarkStepFormParams): string | null {
  const trimmedNote = note.trim();
  if (trimmedNote.length > RUN_STEP_NOTE_MAX) {
    return `Note must be at most ${RUN_STEP_NOTE_MAX} characters.`;
  }

  const trimmedEvidence = evidenceUrl.trim();
  if (trimmedEvidence === '') {
    return null;
  }
  if (trimmedEvidence.length > RUN_STEP_EVIDENCE_URL_MAX) {
    return `Evidence link must be at most ${RUN_STEP_EVIDENCE_URL_MAX} characters.`;
  }
  if (!isValidUrl(trimmedEvidence)) {
    return 'Evidence link must be a valid URL.';
  }
  return null;
}

function isValidUrl(value: string): boolean {
  try {
    void new URL(value);
    return true;
  }
  catch {
    return false;
  }
}
