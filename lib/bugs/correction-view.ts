import type { BugSeverity } from '@lib/bugs/constants';
import { BUG_SEVERITY_VALUES, BUG_TITLE_MAX, BUG_TITLE_MIN } from '@lib/bugs/constants';

// BK-1835 — pure view logic of the defect correction dialog, kept out of the
// component so it is unit-testable without a DOM. Framework-agnostic: no
// React or Next imports.

// Who is offered the correction: an active member whose role can write
// (AC-04). A Viewer, or someone with no active membership in the defect's
// workspace, is never offered it; the RPC refuses them anyway (403 / 404).
export function canCorrectDefect(role: string | null | undefined): boolean {
  return typeof role === 'string' && role !== 'viewer';
}

export interface CorrectableBug {
  title: string
  severity: string
  description: string | null
  steps_to_reproduce: string
  content_version: number
}

export interface CorrectionDraft {
  title: string
  severity: BugSeverity
  description: string
  stepsToReproduce: string
}

function asSeverity(value: string): BugSeverity {
  return (BUG_SEVERITY_VALUES as readonly string[]).includes(value) ? value as BugSeverity : 'P3';
}

export function draftFromBug(bug: CorrectableBug): CorrectionDraft {
  return {
    title: bug.title,
    severity: asSeverity(bug.severity),
    description: bug.description ?? '',
    stepsToReproduce: bug.steps_to_reproduce,
  };
}

// The filing title rule, counted the way the filing dialog and the shared
// Zod schema count it (string length), so the client never accepts a title
// the API refuses. Null when the title is acceptable.
export function titleError(title: string): string | null {
  const length = title.trim().length;
  if (length < BUG_TITLE_MIN || length > BUG_TITLE_MAX) {
    return `Title must be between ${BUG_TITLE_MIN} and ${BUG_TITLE_MAX} characters`;
  }
  return null;
}

// Every field is sent; the server decides what really changed (a title that
// differs only by surrounding spaces is not a change). Steps travel as typed,
// the way filing stores them.
export function buildCorrectionBody(draft: CorrectionDraft, expectedVersion: number) {
  return {
    expected_version: expectedVersion,
    title: draft.title.trim(),
    severity: draft.severity,
    description: draft.description.trim(),
    steps_to_reproduce: draft.stepsToReproduce,
  };
}

export type CorrectionFailure
  = | { kind: 'stale', current: CorrectableBug | null, message: string }
    | { kind: 'error', message: string };

interface ErrorEnvelope {
  error?: { message?: string, details?: unknown }
}

const STALE_MESSAGE = 'This defect changed since you opened it. The current version is shown below; your draft is kept. Save again to replace it with your draft, or cancel to keep the current version.';
const STALE_UNREADABLE_MESSAGE = 'This defect changed since you opened it and its current version could not be loaded. Cancel to reload it before correcting it again.';

// Turns a refused PATCH into what the dialog shows. A 409 carries the current
// defect (AI Product Owner P8); anything else shows the server's own message
// with a retry, never a raw status code.
export function parseCorrectionFailure(status: number, body: unknown): CorrectionFailure {
  const envelope = (body ?? {}) as ErrorEnvelope;
  if (status === 409) {
    const details = envelope.error?.details as { current?: unknown } | undefined;
    const current = isCorrectableBug(details?.current) ? details.current : null;
    return { kind: 'stale', current, message: current ? STALE_MESSAGE : STALE_UNREADABLE_MESSAGE };
  }
  const message = envelope.error?.message;
  if (status === 403) {
    return { kind: 'error', message: message ?? 'You do not have permission to correct this defect.' };
  }
  return { kind: 'error', message: message ?? 'Could not save the correction. Try again.' };
}

function isCorrectableBug(value: unknown): value is CorrectableBug {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const bug = value as Record<string, unknown>;
  return typeof bug.title === 'string'
    && typeof bug.severity === 'string'
    && (bug.description === null || typeof bug.description === 'string')
    && typeof bug.steps_to_reproduce === 'string'
    && typeof bug.content_version === 'number';
}
