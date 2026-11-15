'use client';

import type { CorrectableBug, CorrectionDraft } from '@lib/bugs/correction-view';
import { Button } from '@components/ui/button';
import { BUG_SEVERITY_LABEL, BUG_SEVERITY_VALUES, BUG_TITLE_MAX } from '@lib/bugs/constants';
import {
  buildCorrectionBody,
  draftFromBug,
  parseCorrectionFailure,
  titleError,
} from '@lib/bugs/correction-view';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

// BK-1835 — correct a filed defect's title, severity, description and steps
// from its detail screen (spec-only departure D68 of the master design plan).
// The trigger and the dialog reuse the filing dialog's grammar verbatim
// (`BugFormDialog.tsx`): the same fixed-inset overlay, label/field classes,
// pressed-chip severity control and Button variants. No new token.
//
// Rendered by `BugDetailView` ONLY for a member who can write; a Viewer gets
// no control at all (AC-04), and the server refuses a direct call (403).

interface BugCorrectionProps {
  bugId: string
  bug: CorrectableBug
}

export function BugCorrection({ bugId, bug }: BugCorrectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="bug-detail-correct"
        onClick={() => setOpen(true)}
      >
        <Pencil size={11} aria-hidden="true" />
        Edit
      </Button>
      {open && (
        <BugCorrectionDialog bugId={bugId} bug={bug} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

interface BugCorrectionDialogProps {
  bugId: string
  bug: CorrectableBug
  onClose: () => void
}

const FIELD_CLASS = 'w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none';

function BugCorrectionDialog({ bugId, bug, onClose }: BugCorrectionDialogProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<CorrectionDraft>(() => draftFromBug(bug));
  // The version this draft is based on. A stale refusal rebases it on the
  // current version, so saving again is a deliberate choice (P8).
  const [version, setVersion] = useState(bug.content_version);
  const [current, setCurrent] = useState<CorrectableBug | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const update = (patch: Partial<CorrectionDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    if (patch.title !== undefined && fieldError) { setFieldError(null); }
  };

  const close = () => {
    if (submitting) { return; }
    onClose();
    // After a stale refusal the screen behind still shows the old content.
    if (current || blocked) { router.refresh(); }
  };

  const save = async () => {
    if (submitting || blocked) { return; }
    const problem = titleError(draft.title);
    if (problem) {
      setFieldError(problem);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/v1/bugs/${bugId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildCorrectionBody(draft, version)),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = parseCorrectionFailure(response.status, body);
        if (failure.kind === 'stale') {
          if (failure.current) {
            setCurrent(failure.current);
            setVersion(failure.current.content_version);
          }
          else {
            // Nothing to rebase on: only Cancel (which reloads) is offered.
            setBlocked(true);
          }
        }
        setFormError(failure.message);
        setSubmitting(false);
        return;
      }
      const changed = (body as { changed?: boolean } | null)?.changed === true;
      setSubmitting(false);
      onClose();
      if (changed) {
        toast.success('Defect updated.');
        router.refresh();
      }
      else {
        toast('Nothing changed, so nothing was saved.');
        if (current) { router.refresh(); }
      }
    }
    catch {
      setFormError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        data-testid="bug-correction-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-correction-heading"
        className="max-h-full w-full max-w-[480px] overflow-y-auto rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div id="bug-correction-heading" className="mb-3 flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg-1">
          <Pencil size={13} aria-hidden="true" />
          Edit defect
        </div>

        <label htmlFor="bug-correction-title" className="mb-1.5 block text-xs text-fg-2">
          Title
        </label>
        <input
          id="bug-correction-title"
          data-testid="bug-correction-title"
          type="text"
          value={draft.title}
          onChange={e => update({ title: e.target.value })}
          maxLength={BUG_TITLE_MAX}
          autoFocus
          disabled={submitting}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'bug-correction-title-error' : undefined}
          className={FIELD_CLASS}
        />
        {fieldError && (
          <p id="bug-correction-title-error" data-testid="bug-correction-title-error" className="m-0 mt-1.5 text-xs text-signal-fail">
            {fieldError}
          </p>
        )}

        <span className="mb-1.5 mt-3 block text-xs text-fg-2">Severity</span>
        <div role="group" aria-label="Severity" className="flex items-center gap-1.5">
          {BUG_SEVERITY_VALUES.map(value => (
            <button
              key={value}
              type="button"
              data-testid={`bug-correction-severity-${value}`}
              aria-pressed={draft.severity === value}
              disabled={submitting}
              onClick={() => update({ severity: value })}
              className={`flex flex-1 items-center justify-center rounded-2 border px-2 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                draft.severity === value
                  ? 'border-accent bg-accent-soft text-fg-0'
                  : 'border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:text-fg-1'
              }`}
            >
              {value}
              {' · '}
              {BUG_SEVERITY_LABEL[value]}
            </button>
          ))}
        </div>

        <label htmlFor="bug-correction-description" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Description (optional)
        </label>
        <textarea
          id="bug-correction-description"
          data-testid="bug-correction-description"
          value={draft.description}
          onChange={e => update({ description: e.target.value })}
          rows={3}
          disabled={submitting}
          placeholder="What went wrong?"
          className={`${FIELD_CLASS} resize-y`}
        />

        <label htmlFor="bug-correction-steps" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Steps to reproduce
        </label>
        <textarea
          id="bug-correction-steps"
          data-testid="bug-correction-steps"
          value={draft.stepsToReproduce}
          onChange={e => update({ stepsToReproduce: e.target.value })}
          rows={5}
          disabled={submitting}
          className={`${FIELD_CLASS} resize-y font-mono`}
        />
        <p className="m-0 mt-1.5 text-xs text-fg-3">One step per line. Evidence, status and assignee are not changed here.</p>

        {current && (
          <div data-testid="bug-correction-current" className="mt-3 flex flex-col gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-sm text-fg-1">
            <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-fg-2">Current version</span>
            <span data-testid="bug-correction-current-title" className="font-medium text-fg-0">{current.title}</span>
            <span className="text-xs text-fg-2">
              {current.severity}
              {' · '}
              {BUG_SEVERITY_LABEL[current.severity as keyof typeof BUG_SEVERITY_LABEL] ?? current.severity}
            </span>
            {current.description && <p className="m-0 whitespace-pre-wrap text-xs text-fg-1">{current.description}</p>}
            {current.steps_to_reproduce && <p className="m-0 whitespace-pre-wrap font-mono text-xs text-fg-2">{current.steps_to_reproduce}</p>}
          </div>
        )}

        {formError && (
          <p data-testid="bug-correction-error" role="alert" className="m-0 mt-2.5 text-xs text-signal-fail">
            {formError}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="bug-correction-save"
            onClick={() => { void save(); }}
            disabled={submitting || blocked}
          >
            {submitting ? 'Saving…' : formError && !current ? 'Retry' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="bug-correction-cancel"
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
