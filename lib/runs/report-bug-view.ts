import type { BugSeverity } from '@lib/bugs/constants';
import { BUG_TITLE_MAX } from '@lib/bugs/constants';
import { isHttpUrl } from '@lib/utils/url';

// BK-40 Slice 2 — Report-bug view-state logic for the run-linked entry point
// (RunnerView.tsx's per-step "Report bug" button + BugFormDialog's initial
// field values). Framework-agnostic, pure functions only — all I/O (the POST
// /api/v1/bugs call) stays in RunnerView.tsx / BugFormDialog.tsx. Mirrors
// lib/runs/mark-step-view.ts's split.

export type ReportBugStepStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped';

// ATP-N1 — "Report bug" is only offered on a FAILED step, to a member+ actor
// (the same write tier as Abort/Finish/Mark). Structural, not a disabled
// button — mirrors resolveStepMarkControlState's showControls convention.
// The server independently re-enforces the step-status half of this rule
// (app/api/v1/bugs/route.ts's `run_step_not_failed` 422 backstop).
export interface ShouldShowReportBugButtonParams {
  canReportBug: boolean
  stepStatus: ReportBugStepStatus
}

export function shouldShowReportBugButton({ canReportBug, stepStatus }: ShouldShowReportBugButtonParams): boolean {
  return canReportBug && stepStatus === 'failed';
}

const BUG_PREFILL_DEFAULT_SEVERITY: BugSeverity = 'P3';

export interface ReportBugPrefillSource {
  atcTitle: string
  stepContent: string
  stepEvidenceUrl: string | null
}

export interface ReportBugPrefill {
  title: string
  severity: BugSeverity
  stepsToReproduce: string
  evidenceUrls: string[]
}

// ATP-P1 — the run-linked dialog opens pre-filled, never blank: a title stub
// derived from the failing ATC (no AC freezes exact wording, so this is
// editable UX convenience, not a frozen string like Abort/Finish's copy),
// P3/Minor default severity (the mockup's mid-point label, not either
// extreme), the executed step's own content as the reproduction text, and
// the step's already-captured evidence link seeded as the first evidence
// row — but ONLY when that stored value can actually pass the filing-time
// schema. The " failed" suffix guarantees at least 6 characters even for a
// (never-blank-in-practice) empty ATC title, always clearing BUG_TITLE_MIN
// — no separate floor-guard branch is reachable, so none is written.
//
// BK-500 — the evidence seed is gated by `isHttpUrl` (lib/utils/url.ts), the
// same allowlist the typed-input path already applies in
// `BugFormDialog.addEvidence` (components/bugs/BugFormDialog.tsx:102) and the
// same one the filing-time Zod schema agrees with (`z.array(z.url({ protocol:
// z.regexes.httpProtocol }))`, lib/bugs/validation.ts). Before this gate the
// seed was a bare truthiness check, so a legacy non-http(s) `evidence_url` —
// storable because filing-time validation only tightened under BK-337 (TQ5)
// and no DB CHECK constraint backfills it — was prefilled verbatim and then
// 422'd on submit, on a field the tester never typed into. Filtering here
// TIGHTENS the client to match the server; the schema is never loosened to
// admit the bad value. An unusable stored link yields an EMPTY evidence row,
// not a guaranteed rejection. The value is trimmed before it is checked AND
// seeded, so what got validated is exactly what gets posted.
export function buildReportBugPrefill({ atcTitle, stepContent, stepEvidenceUrl }: ReportBugPrefillSource): ReportBugPrefill {
  const title = `${atcTitle} failed`.trim().slice(0, BUG_TITLE_MAX);
  const seededEvidenceUrl = stepEvidenceUrl?.trim() ?? '';

  return {
    title,
    severity: BUG_PREFILL_DEFAULT_SEVERITY,
    stepsToReproduce: stepContent,
    evidenceUrls: isHttpUrl(seededEvidenceUrl) ? [seededEvidenceUrl] : [],
  };
}
