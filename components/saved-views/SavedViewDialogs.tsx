'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { countCodePoints, SAVED_VIEW_NAME_MAX } from '@lib/saved-views/constants';
import { createSubmitGuard } from '@lib/saved-views/menu-state';
import { useEffect, useMemo, useRef, useState } from 'react';

// BK-443 — the name dialog (save and rename) and the delete confirmation of the
// Saved views control. Hand-built overlay on the same convention as
// `RevokeTokenModal` / `LeaveWorkspaceModal`, with `useModalDismiss` for Escape,
// focus return and the Tab trap (AI Product Owner design decision, BK-443).

interface NameDialogProps {
  open: boolean
  title: string
  submitLabel: string
  initialName: string
  // Resolves to an error message to show inline, or null on success (the
  // caller then closes the dialog).
  onSubmit: (name: string) => Promise<string | null>
  onClose: () => void
  testId: string
}

export function SavedViewNameDialog({ open, title, submitLabel, initialName, onSubmit, onClose, testId }: NameDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A ref, not render state: two clicks in one frame read the same stale state.
  const guard = useMemo(() => createSubmitGuard(), []);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  const requestClose = () => {
    if (!submitting) { onClose(); }
  };
  useModalDismiss(open, requestClose, containerRef);

  if (!open) { return null; }

  const submit = async () => {
    if (!guard.tryEnter()) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const message = await onSubmit(name);
      if (message !== null) { setError(message); }
    }
    finally {
      guard.leave();
      setSubmitting(false);
    }
  };

  const length = countCodePoints(name.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={requestClose}>
      <div
        ref={containerRef}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        className="w-full max-w-[400px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div id={`${testId}-title`} className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-2">
          {title}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            aria-label="Saved view name"
            aria-invalid={error !== null}
            data-testid={`${testId}-input`}
            placeholder="Checkout blockers, this sprint"
          />
          <div className="mt-1 flex items-start justify-between gap-2 text-2xs">
            <span role="alert" data-testid={`${testId}-error`} className="min-h-4 text-signal-fail">{error}</span>
            <span className={length > SAVED_VIEW_NAME_MAX ? 'text-signal-fail' : 'text-fg-4'}>
              {length}
              /
              {SAVED_VIEW_NAME_MAX}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" data-testid={`${testId}-submit`} disabled={submitting}>
              {submitLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" data-testid={`${testId}-cancel`} onClick={requestClose} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteDialogProps {
  name: string | null
  onConfirm: () => Promise<string | null>
  onClose: () => void
  testId: string
}

export function SavedViewDeleteDialog({ name, onConfirm, onClose, testId }: DeleteDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const open = name !== null;

  useEffect(() => {
    if (open) { setError(null); }
  }, [open]);

  const requestClose = () => {
    if (!submitting) { onClose(); }
  };
  useModalDismiss(open, requestClose, containerRef);

  if (!open) { return null; }

  const confirm = async () => {
    setSubmitting(true);
    try {
      const message = await onConfirm();
      if (message !== null) { setError(message); }
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={requestClose}>
      <div
        ref={containerRef}
        data-testid={testId}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        className="w-full max-w-[400px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div id={`${testId}-title`} className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail">
          Delete saved view
        </div>
        <p className="m-0 text-sm text-fg-1">
          Delete
          {' '}
          <span className="font-mono text-fg-0">{name}</span>
          ? The filters currently applied stay as they are.
        </p>
        <span role="alert" data-testid={`${testId}-error`} className="mt-2 block min-h-4 text-2xs text-signal-fail">{error}</span>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="danger" size="sm" data-testid={`${testId}-confirm`} onClick={() => { void confirm(); }} disabled={submitting}>
            {submitting ? 'Deleting…' : 'Delete view'}
          </Button>
          <Button type="button" variant="ghost" size="sm" data-testid={`${testId}-cancel`} onClick={requestClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
