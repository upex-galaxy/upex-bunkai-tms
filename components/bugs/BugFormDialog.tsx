'use client';

import type { BugSeverity } from '@lib/bugs/constants';
import { Button } from '@components/ui/button';
import { BUG_EVIDENCE_MAX, BUG_SEVERITY_VALUES, BUG_TITLE_MAX, BUG_TITLE_MIN } from '@lib/bugs/constants';
import { BUG_TITLE_MESSAGE } from '@lib/bugs/validation';
import { isValidUrl } from '@lib/utils/url';
import { Bug, Plus, X } from 'lucide-react';
import { useState } from 'react';

// BK-40 Slice 2 — the "Report bug" dialog, matching RunnerView's existing
// Abort/Finish overlay family (Technical Decision 9): a plain fixed-inset
// overlay (no native <dialog>, which blocks the page), role="dialog",
// click-outside-to-close, autoFocus on the first field. Kept as a top-level
// component (unlike Abort/Finish, which are inlined in RunnerView.tsx)
// because Slice 3's standalone "New bug" page reuses it verbatim
// (Technical Decision 11 — "one shared form component ... parameterized by
// an optional runContext prop"). Only the run-linked mode (a `runContext`
// prop) is built and wired this slice — the standalone project/module-picker
// fields Slice 3 needs are that slice's own additive work, matching this
// ticket's own "bare-bones, additive-only" slice-boundary convention
// (Technical Decision 2).

const SEVERITY_LABEL: Record<BugSeverity, string> = {
  P1: 'Critical',
  P2: 'Major',
  P3: 'Minor',
  P4: 'Trivial',
};

export interface BugRunLinkedContext {
  runStepId: string
}

export interface BugRecord {
  id: string
  [key: string]: unknown
}

interface BugCreateErrorBody {
  error?: { message?: string }
}

interface BugFormDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (bug: BugRecord) => void
  runContext: BugRunLinkedContext
  moduleLabel: string
  initialTitle: string
  initialSeverity: BugSeverity
  initialStepsToReproduce: string
  initialEvidenceUrls: string[]
}

export function BugFormDialog({
  open,
  onClose,
  onCreated,
  runContext,
  moduleLabel,
  initialTitle,
  initialSeverity,
  initialStepsToReproduce,
  initialEvidenceUrls,
}: BugFormDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [severity, setSeverity] = useState<BugSeverity>(initialSeverity);
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState(initialStepsToReproduce);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(initialEvidenceUrls);
  const [evidenceDraft, setEvidenceDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const close = () => {
    if (submitting) { return; }
    onClose();
  };

  const addEvidence = () => {
    const trimmed = evidenceDraft.trim();
    if (!trimmed || evidenceUrls.length >= BUG_EVIDENCE_MAX) { return; }
    if (!isValidUrl(trimmed)) {
      setError('Evidence link must be a valid URL.');
      return;
    }
    setEvidenceUrls(prev => [...prev, trimmed]);
    setEvidenceDraft('');
    setError(null);
  };

  const removeEvidence = (index: number) => {
    setEvidenceUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (submitting) { return; }

    // Client-side guard, mirroring handleAbort's short-reason check —
    // immediate feedback ahead of the round trip. The RPC (via
    // BugCreateBodySchema) stays the enforcement point of record.
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < BUG_TITLE_MIN || trimmedTitle.length > BUG_TITLE_MAX) {
      setError(BUG_TITLE_MESSAGE);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/bugs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_step_id: runContext.runStepId,
          title: trimmedTitle,
          severity,
          description: description.trim() || undefined,
          steps_to_reproduce: stepsToReproduce.trim() || undefined,
          evidence_urls: evidenceUrls,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as BugCreateErrorBody;
        // Server copy rendered verbatim, same convention as handleAbort/
        // handleFinish/handleMarkSubmit.
        setError(body.error?.message ?? 'Could not file this bug.');
        setSubmitting(false);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { bug?: BugRecord };
      setSubmitting(false);
      if (body.bug) {
        onCreated(body.bug);
      }
      onClose();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        data-testid="bug-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Report bug"
        className="w-full max-w-[480px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg-1">
          <Bug size={13} />
          Report bug
        </div>

        <label htmlFor="bug-title-input" className="mb-1.5 block text-xs text-fg-2">
          Title
        </label>
        <input
          id="bug-title-input"
          data-testid="bug-title-input"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) { setError(null); }
          }}
          maxLength={BUG_TITLE_MAX}
          autoFocus
          disabled={submitting}
          className="w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
        />

        <span className="mb-1.5 mt-3 block text-xs text-fg-2">Severity</span>
        <div role="group" aria-label="Severity" className="flex items-center gap-1.5">
          {BUG_SEVERITY_VALUES.map(value => (
            <button
              key={value}
              type="button"
              data-testid={`bug-severity-${value}`}
              aria-pressed={severity === value}
              disabled={submitting}
              onClick={() => setSeverity(value)}
              className={`flex flex-1 items-center justify-center rounded-2 border px-2 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                severity === value
                  ? 'border-accent bg-accent-soft text-fg-0'
                  : 'border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:text-fg-1'
              }`}
            >
              {value}
              {' · '}
              {SEVERITY_LABEL[value]}
            </button>
          ))}
        </div>

        <label htmlFor="bug-module-input" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Module
        </label>
        {/* Read-only — server-derived from run_step_id (Technical Decision 7),
            never client-supplied. Shown for the filer's own confidence only;
            the value is display-only and is never part of the request body. */}
        <input
          id="bug-module-input"
          data-testid="bug-module-input"
          type="text"
          value={moduleLabel}
          readOnly
          disabled
          className="w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-3"
        />

        <label htmlFor="bug-description-input" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Description (optional)
        </label>
        <textarea
          id="bug-description-input"
          data-testid="bug-description-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          disabled={submitting}
          placeholder="What went wrong?"
          className="w-full resize-none rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
        />

        <label htmlFor="bug-steps-input" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Steps to reproduce
        </label>
        <textarea
          id="bug-steps-input"
          data-testid="bug-steps-input"
          value={stepsToReproduce}
          onChange={e => setStepsToReproduce(e.target.value)}
          rows={3}
          disabled={submitting}
          className="w-full resize-none rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
        />

        <div className="mb-1.5 mt-3 flex items-center justify-between">
          <span className="text-xs text-fg-2">Evidence</span>
          <span data-testid="bug-evidence-counter" className="font-mono text-2xs text-fg-4">
            {evidenceUrls.length}
            {' / '}
            {BUG_EVIDENCE_MAX}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {evidenceUrls.map((url, index) => (
            <div key={`${index}-${url}`} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2">
                {url}
              </span>
              <button
                type="button"
                data-testid={`bug-evidence-remove-${index}`}
                onClick={() => removeEvidence(index)}
                disabled={submitting}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 text-fg-3 hover:border-stroke-3 hover:text-fg-1"
                aria-label="Remove evidence link"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {evidenceUrls.length < BUG_EVIDENCE_MAX && (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                data-testid="bug-evidence-draft-input"
                value={evidenceDraft}
                onChange={(e) => {
                  setEvidenceDraft(e.target.value);
                  if (error) { setError(null); }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEvidence();
                  }
                }}
                disabled={submitting}
                placeholder="https://…"
                className="w-full min-w-0 flex-1 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="bug-evidence-add"
                onClick={addEvidence}
                disabled={submitting || !evidenceDraft.trim()}
              >
                <Plus size={11} />
              </Button>
            </div>
          )}
        </div>

        {error && (
          <p data-testid="bug-form-error" className="m-0 mt-2.5 text-xs text-signal-fail">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="bug-form-submit"
            onClick={() => { void handleSubmit(); }}
            disabled={submitting}
          >
            <Bug size={11} />
            {submitting ? 'Filing…' : 'File bug'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="bug-form-cancel"
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
