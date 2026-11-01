'use client';

import { Button } from '@components/ui/button';
import { Check, Layers, Search } from 'lucide-react';
import { useState } from 'react';

// BK-206 — the "Attach plans" picker (`milestones-board.html` attach-plans picker),
// built on the live `TestPickerDialog` overlay family (fixed inset, role="dialog",
// click-outside-to-close, the same result-row and footer grammar). It lists the
// project's OPEN plans (design intent, AC 1.4: a closed plan is not offered), read
// server-side with the page (no new read endpoint, D1), filtered by name on the
// client. A plan already attached is shown checked, disabled and marked "Already
// attached", so it cannot be selected twice. Confirming sends ONE request for the whole
// selection (AC 1.1) with an Idempotency-Key that survives a double click and rotates
// after every close or failure.

export interface AttachablePlan {
  id: string
  name: string
}

interface AttachPlansDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  milestoneId: string
  milestoneName: string
  plans: AttachablePlan[]
  attachedPlanIds: Set<string>
  onAttached: () => void
}

interface ApiErrorBody {
  error?: { message?: string }
}

export function AttachPlansDialog({ open, onClose, projectId, milestoneId, milestoneName, plans, attachedPlanIds, onAttached }: AttachPlansDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  if (!open) {
    return null;
  }

  const needle = query.trim().toLowerCase();
  const visible = needle === '' ? plans : plans.filter(plan => plan.name.toLowerCase().includes(needle));

  const close = () => {
    if (submitting) { return; }
    setQuery('');
    setSelected(new Set());
    setError(null);
    // The dialog stays mounted across open/close cycles, so the key rotates here too:
    // the next attach must not reuse a key already stored for another selection.
    setIdempotencyKey(crypto.randomUUID());
    onClose();
  };

  const toggle = (planId: string) => {
    if (attachedPlanIds.has(planId)) { return; }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) { next.delete(planId); }
      else { next.add(planId); }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || submitting) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/milestones/${milestoneId}/plans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ test_plan_ids: [...selected] }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? 'Could not attach these test plans.');
        setIdempotencyKey(crypto.randomUUID());
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      onAttached();
      close();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  const confirmLabel = selected.size === 0
    ? 'Attach plans'
    : `Attach ${selected.size} ${selected.size === 1 ? 'plan' : 'plans'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        data-testid="attach-plans-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Attach test plans to ${milestoneName}`}
        className="flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex min-w-0 items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg-1">
          <Layers size={13} className="shrink-0" />
          <span className="truncate">
            Attach plans to
            {' '}
            {milestoneName}
          </span>
        </div>

        <label htmlFor="attach-plans-search-input" className="mb-1.5 block text-xs text-fg-2">
          Search this project&apos;s open test plans
        </label>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-4" />
          <input
            id="attach-plans-search-input"
            data-testid="attach-plans-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by name"
            autoFocus
            disabled={submitting}
            className="w-full rounded-2 border border-stroke-2 bg-surface-2 py-2 pl-7 pr-2.5 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
          />
        </div>

        <div
          data-testid="attach-plans-results"
          role="group"
          aria-label="Test plan results"
          className="mt-2 flex min-h-[120px] flex-1 flex-col gap-1 overflow-y-auto"
        >
          {plans.length === 0 && (
            <p data-testid="attach-plans-none" className="px-1 py-2 text-xs italic text-fg-4">This project has no open test plans.</p>
          )}
          {plans.length > 0 && visible.length === 0 && (
            <p data-testid="attach-plans-empty" className="px-1 py-2 text-xs italic text-fg-4">No test plans match.</p>
          )}
          {visible.map((plan) => {
            const alreadyAttached = attachedPlanIds.has(plan.id);
            const isSelected = alreadyAttached || selected.has(plan.id);
            return (
              <button
                key={plan.id}
                type="button"
                data-testid={`attach-plans-result-${plan.id}`}
                disabled={alreadyAttached || submitting}
                aria-pressed={isSelected}
                onClick={() => toggle(plan.id)}
                className={`flex items-center gap-2.5 rounded-2 border px-3 py-2 text-left transition-colors ${
                  alreadyAttached
                    ? 'cursor-not-allowed border-stroke-1 bg-surface-2 opacity-50'
                    : isSelected
                      ? 'border-accent bg-accent-soft'
                      : 'border-stroke-1 bg-surface-2 hover:border-stroke-3 hover:bg-surface-3'
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-1 border ${
                    isSelected ? 'border-accent bg-accent text-fg-0' : 'border-stroke-3'
                  }`}
                >
                  {isSelected && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{plan.name}</span>
                {alreadyAttached && (
                  <span data-testid={`attach-plans-already-attached-${plan.id}`} className="shrink-0 text-2xs text-fg-4">
                    Already attached
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p data-testid="attach-plans-error" className="m-0 mt-2 text-xs text-signal-fail">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-stroke-2 pt-3">
          <span data-testid="attach-plans-count" className="flex-1 text-xs text-fg-3">
            {selected.size}
            {' selected'}
          </span>
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="attach-plans-confirm"
            onClick={() => { void handleConfirm(); }}
            disabled={selected.size === 0 || submitting}
          >
            {submitting ? 'Attaching…' : confirmLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="attach-plans-cancel"
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
