'use client';

import type { EvidenceRunStatus, StepAttachment } from '@lib/runs/evidence-view';
import { uploadStepEvidence } from '@lib/runs/evidence-upload';
import {
  attachmentContentPath,
  canRemoveAttachment,
  evidenceCounter,
  formatByteSize,
  resolveEvidenceControlState,
} from '@lib/runs/evidence-view';
import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { EvidenceLightbox } from './EvidenceLightbox';

// BK-593 - the Attach control of the manual runner (design plan section 4.5, "Notes & evidence
// (textarea + Attach + URL)"). Mounted per step, independent of the Pass/Fail/Block form: a file
// uploads and commits as soon as it is picked, so cancelling the mark form never loses an image
// and a failed upload never touches the step result. Visible to member+ while the Run is
// running; a finished or aborted Run shows its committed images read-only.

interface InFlight {
  key: number
  name: string
  error: string | null
}

interface StepEvidenceProps {
  runId: string
  stepId: string
  runStatus: EvidenceRunStatus
  canAttach: boolean
  attachments: StepAttachment[]
  // Removal belongs to the uploader (no admin override), while the Run is running.
  currentUserId: string
  onAdded: (attachment: StepAttachment) => void
  onRemoved: (attachmentId: string) => void
  // data-testid suffix, `{atcPosition}-{stepPosition}` like the sibling step controls.
  testSuffix: string
}

const ACCEPT = 'image/png,image/jpeg,image/webp';

export function StepEvidence({ runId, stepId, runStatus, canAttach, attachments, currentUserId, onAdded, onRemoved, testSuffix }: StepEvidenceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);
  const [inFlight, setInFlight] = useState<InFlight[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // Removal asks once: an image is the proof of a result, and removing it cannot be undone.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<string[]>([]);

  const control = resolveEvidenceControlState({ canAttach, runStatus, attachments });
  const uploading = inFlight.some(item => item.error === null);

  if (!control.showAttach && attachments.length === 0) {
    return null;
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) { return; }
    const picked = Array.from(files);
    if (inputRef.current) { inputRef.current.value = ''; }
    // One at a time: each upload re-checks the step quota on the server, in order.
    for (const file of picked) {
      keyRef.current += 1;
      const key = keyRef.current;
      setInFlight(list => [...list, { key, name: file.name, error: null }]);
      const outcome = await uploadStepEvidence({ file, runId, stepId });
      if (outcome.ok) {
        onAdded(outcome.attachment);
        setInFlight(list => list.filter(item => item.key !== key));
      }
      else {
        setInFlight(list => list.map(item => (item.key === key ? { ...item, error: outcome.message } : item)));
      }
    }
  };

  const dismiss = (key: number) => setInFlight(list => list.filter(item => item.key !== key));

  const handleRemove = async (attachment: StepAttachment) => {
    setRemovingId(attachment.id);
    setRemoveError(null);
    try {
      const response = await fetch(`/api/v1/runs/${runId}/steps/${stepId}/attachments/${attachment.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setRemoveError(body?.error?.message ?? 'Could not remove the image.');
        return;
      }
      setConfirmId(null);
      onRemoved(attachment.id);
    }
    catch {
      setRemoveError('Could not reach the server. The image was not removed.');
    }
    finally {
      setRemovingId(null);
    }
  };

  return (
    <div data-testid={`runner-step-evidence-panel-${testSuffix}`} className="flex flex-col gap-1.5">
      {control.showAttach && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={`runner-step-attach-${testSuffix}`}
            disabled={control.disabled || uploading}
            title={control.hint ?? undefined}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-1 border border-stroke-2 bg-surface-1 px-2 py-1 text-2xs font-medium text-fg-2 transition-colors hover:border-stroke-3 hover:text-fg-1 disabled:pointer-events-none disabled:opacity-50"
          >
            <Paperclip size={11} />
            Attach
          </button>
          <span data-testid={`runner-step-attach-count-${testSuffix}`} className="font-mono text-2xs text-fg-4">
            {evidenceCounter(attachments.length)}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            data-testid={`runner-step-attach-input-${testSuffix}`}
            onChange={(e) => { void handleFiles(e.target.files); }}
          />
        </div>
      )}

      {control.hint && (
        <p data-testid={`runner-step-attach-hint-${testSuffix}`} className="m-0 text-2xs text-fg-4">
          {control.hint}
        </p>
      )}

      {inFlight.map(item => (
        item.error === null
          ? (
              <span key={item.key} data-testid={`runner-step-attach-uploading-${testSuffix}`} className="text-2xs text-fg-3">
                Uploading
                {' '}
                {item.name}
                ...
              </span>
            )
          : (
              <span key={item.key} role="alert" data-testid={`runner-step-attach-error-${testSuffix}`} className="flex items-start gap-2 text-2xs text-signal-fail">
                <span className="min-w-0 flex-1 break-words">
                  {item.name}
                  :
                  {' '}
                  {item.error}
                </span>
                <button type="button" onClick={() => dismiss(item.key)} className="shrink-0 underline hover:text-fg-1">
                  Dismiss
                </button>
              </span>
            )
      ))}

      {removeError && (
        <span role="alert" data-testid={`runner-step-attachment-remove-error-${testSuffix}`} className="text-2xs text-signal-fail">
          {removeError}
        </span>
      )}

      {attachments.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid={`runner-step-attachments-${testSuffix}`}>
          {attachments.map((a) => {
            const removable = canRemoveAttachment({ canAttach, runStatus, attachment: a, currentUserId });
            return (
              <li key={a.id} data-testid={`runner-step-attachment-${a.id}`} className="flex w-[104px] flex-col gap-1">
                <button
                  type="button"
                  aria-label={`Open ${a.filename}`}
                  data-testid={`runner-step-attachment-open-${a.id}`}
                  onClick={() => setOpenId(a.id)}
                  className="relative flex h-[68px] w-full items-center justify-center overflow-hidden rounded-1 border border-stroke-2 bg-surface-2 hover:border-stroke-3"
                >
                  {brokenIds.includes(a.id)
                    ? <span className="px-1 text-center text-2xs text-fg-4">Preview unavailable</span>
                    : (
                        // eslint-disable-next-line @next/next/no-img-element -- the source is an authorized redirect, not a static asset next/image can optimise
                        <img
                          src={attachmentContentPath(a)}
                          alt={a.filename}
                          loading="lazy"
                          onError={() => setBrokenIds(ids => [...ids, a.id])}
                          className="h-full w-full object-cover"
                        />
                      )}
                </button>
                <span className="truncate text-2xs text-fg-3" title={a.filename}>{a.filename}</span>
                <span className="font-mono text-2xs text-fg-4">{formatByteSize(a.byte_size)}</span>
                {removable && confirmId !== a.id && (
                  <button
                    type="button"
                    aria-label={`Remove ${a.filename}`}
                    data-testid={`runner-step-attachment-remove-${a.id}`}
                    onClick={() => { setRemoveError(null); setConfirmId(a.id); }}
                    className="inline-flex items-center gap-1 self-start text-2xs text-fg-4 hover:text-signal-fail"
                  >
                    <X size={10} />
                    Remove
                  </button>
                )}
                {removable && confirmId === a.id && (
                  <span className="flex items-center gap-2 text-2xs">
                    <button
                      type="button"
                      data-testid={`runner-step-attachment-remove-confirm-${a.id}`}
                      disabled={removingId === a.id}
                      onClick={() => { void handleRemove(a); }}
                      className="font-medium text-signal-fail underline disabled:opacity-50"
                    >
                      {removingId === a.id ? 'Removing...' : 'Remove it'}
                    </button>
                    <button
                      type="button"
                      disabled={removingId === a.id}
                      onClick={() => setConfirmId(null)}
                      className="text-fg-3 underline hover:text-fg-1"
                    >
                      Keep
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {openId && (
        <EvidenceLightbox
          attachments={attachments}
          openId={openId}
          onSelect={setOpenId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
