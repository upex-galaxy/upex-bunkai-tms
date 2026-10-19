import { EVIDENCE_MESSAGES, EVIDENCE_STEP_MAX_BYTES, EVIDENCE_STEP_MAX_COUNT } from '@lib/storage/evidence-policy';

// BK-593 - evidence view-state for the manual runner: framework-agnostic, pure functions only.
// All I/O (the upload requests, the file picker) stays in the components; this file is what
// makes the control visibility, the quota hint and the remove rule unit-testable without a
// browser. Mirrors lib/runs/mark-step-view.ts.

// Duck-typed: the same literals RunnerView exports, not imported from components/**.
export type EvidenceRunStatus = 'running' | 'passed' | 'failed' | 'aborted';

// The public attachment shape served by GET /runs/{id}/attachments (metadata only).
export interface StepAttachment {
  id: string
  run_id: string
  run_step_id: string
  filename: string
  content_type: string
  byte_size: number
  status: string
  created_by: string | null
  created_at: string
  committed_at: string | null
}

export interface EvidenceControlState {
  showAttach: boolean
  disabled: boolean
  hint: string | null
}

// Attach is member+ (the page derives canAttach from the role) and only while the Run is
// running: a finished or aborted Run keeps its evidence exactly as it is. Any step status
// accepts evidence, a still-pending one included. At the per-step quota the control stays
// visible but disabled, with the reason, instead of failing after a pick.
export function resolveEvidenceControlState(
  { canAttach, runStatus, attachments }: { canAttach: boolean, runStatus: EvidenceRunStatus, attachments: StepAttachment[] },
): EvidenceControlState {
  if (!canAttach || runStatus !== 'running') {
    return { showAttach: false, disabled: false, hint: null };
  }
  const bytes = attachments.reduce((sum, a) => sum + a.byte_size, 0);
  const full = attachments.length >= EVIDENCE_STEP_MAX_COUNT || bytes >= EVIDENCE_STEP_MAX_BYTES;
  return { showAttach: true, disabled: full, hint: full ? EVIDENCE_MESSAGES.step_quota : null };
}

// Removal belongs to the person who attached the image (no admin override), while running.
export function canRemoveAttachment(
  { canAttach, runStatus, attachment, currentUserId }: { canAttach: boolean, runStatus: EvidenceRunStatus, attachment: StepAttachment, currentUserId: string },
): boolean {
  return canAttach
    && runStatus === 'running'
    && attachment.created_by !== null
    && attachment.created_by === currentUserId;
}

export function groupAttachmentsByStep(attachments: StepAttachment[]): Record<string, StepAttachment[]> {
  const grouped: Record<string, StepAttachment[]> = {};
  for (const attachment of attachments) {
    (grouped[attachment.run_step_id] ??= []).push(attachment);
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  }
  return grouped;
}

// The authorized route answers 302 to a 60 second signed URL: an <img src> can use it as is and
// no URL is ever stored.
export function attachmentContentPath(a: { run_id: string, run_step_id: string, id: string }): string {
  return `/api/v1/runs/${a.run_id}/steps/${a.run_step_id}/attachments/${a.id}/content`;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${trim(bytes / 1024)} KiB`; }
  return `${trim(bytes / (1024 * 1024))} MiB`;
}

function trim(value: number): string {
  return String(Number.parseFloat(value.toFixed(1)));
}

export function evidenceCounter(count: number): string {
  return `${count} / ${EVIDENCE_STEP_MAX_COUNT}`;
}
