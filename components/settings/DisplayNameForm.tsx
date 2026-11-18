'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { DISPLAY_NAME_COPY, parseDisplayName } from '@lib/account/display-name';
import { removeDisplayName, saveDisplayName } from '@lib/account/display-name-client';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface DisplayNameFormProps {
  // The name the person saved here, or null when none is saved.
  ownName: string | null
  // The sign-in provider's name (Google `full_name`, GitHub `name`), or null.
  providerName: string | null
}

type Busy = 'save' | 'remove' | null;

// Settings > Account display name (BK-1949, spec-only, master-design-plan §5
// D73). One labelled field, Save, and a quiet "Remove my name" that asks first.
// The field starts with the own name, else the provider name, else empty
// (ruling D6): never the email guess. Validation is the same pure function the
// API runs (ruling D8), so an empty or too-long name is refused here without a
// request. A failed save keeps what was typed (AC-05).
export function DisplayNameForm({ ownName, providerName }: DisplayNameFormProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(ownName);
  const [value, setValue] = useState(ownName ?? providerName ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // React state lands after the click handler returns, so two quick presses
  // could both see `busy === null`. The ref closes that window (AC 5.2).
  const inFlight = useRef(false);

  const idle = busy === null;
  const dirty = value !== (saved ?? '');

  const edit = (next: string) => {
    setValue(next);
    setFieldError(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (inFlight.current) {
      return;
    }
    const parsed = parseDisplayName(value);
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    inFlight.current = true;
    setBusy('save');
    setFieldError(null);
    setFormError(null);
    const outcome = await saveDisplayName(parsed.value);
    inFlight.current = false;
    setBusy(null);
    switch (outcome.kind) {
      case 'saved':
        setSaved(outcome.displayName);
        setValue(outcome.displayName ?? '');
        toast.success(DISPLAY_NAME_COPY.saved);
        router.refresh();
        break;
      case 'invalid':
        setFieldError(outcome.message);
        break;
      default:
        setFormError(outcome.message);
    }
  };

  const handleRemove = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy('remove');
    setFormError(null);
    const outcome = await removeDisplayName();
    inFlight.current = false;
    setBusy(null);
    setConfirmOpen(false);
    if (outcome.kind === 'saved') {
      setSaved(null);
      setValue(providerName ?? '');
      setFieldError(null);
      toast.success(DISPLAY_NAME_COPY.removed);
      router.refresh();
      return;
    }
    setFormError(outcome.message);
  };

  return (
    <div data-testid="display-name-form" className="flex flex-col gap-1.5 border-t border-stroke-1 pt-4">
      <Label htmlFor="display-name-input">Display name</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="display-name-input"
          data-testid="display-name-input"
          value={value}
          disabled={!idle}
          autoComplete="name"
          className="min-w-0 flex-1 basis-64"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'display-name-error' : 'display-name-help'}
          onChange={event => edit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSave();
            }
          }}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          data-testid="display-name-save"
          disabled={!idle || !dirty}
          onClick={() => { void handleSave(); }}
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </Button>
        {saved !== null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="display-name-remove"
            disabled={!idle}
            onClick={() => setConfirmOpen(true)}
          >
            Remove my name
          </Button>
        )}
      </div>
      {fieldError
        ? (
            <p id="display-name-error" role="alert" data-testid="display-name-error" className="m-0 text-xs text-signal-fail">
              {fieldError}
            </p>
          )
        : (
            <p id="display-name-help" className="m-0 text-xs text-fg-3">
              The name Bunkai greets you by. Up to 80 characters.
            </p>
          )}
      {formError && (
        <p role="alert" data-testid="display-name-form-error" className="m-0 text-xs text-signal-fail">
          {formError}
        </p>
      )}
      <RemoveDisplayNameDialog
        open={confirmOpen}
        submitting={busy === 'remove'}
        onConfirm={() => { void handleRemove(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

interface RemoveDisplayNameDialogProps {
  open: boolean
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Same hand-built `alertdialog` + `useModalDismiss` as DisconnectJiraDialog.
// Cancel is focused first so Enter never removes the name by accident, and
// Cancel sends no request (E1).
function RemoveDisplayNameDialog({ open, submitting, onConfirm, onCancel }: RemoveDisplayNameDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const requestClose = () => {
    if (!submitting) {
      onCancel();
    }
  };

  useModalDismiss(open, requestClose, containerRef);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={requestClose}>
      <div
        ref={containerRef}
        data-testid="display-name-remove-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="display-name-remove-title"
        aria-describedby="display-name-remove-desc"
        className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="display-name-remove-title" className="m-0 mb-2 text-sm font-semibold text-fg-0">
          Remove your display name?
        </h3>
        <p id="display-name-remove-desc" className="m-0 text-sm text-fg-1">
          Bunkai goes back to the name from your sign-in provider, or to a name taken from your email address.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid="display-name-remove-confirm"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Removing…' : 'Remove'}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            size="sm"
            data-testid="display-name-remove-cancel"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
