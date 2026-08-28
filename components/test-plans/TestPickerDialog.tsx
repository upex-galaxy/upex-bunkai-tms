'use client';

import { Button } from '@components/ui/button';
import { Check, FlaskConical, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

// BK-203 — the "Add tests" picker dialog (plan-detail.html:604-626): search
// the plan's own project's test library, multi-select, confirm. Overlay shape
// mirrors `BugFormDialog`'s existing modal family (fixed inset, role="dialog",
// click-outside-to-close) rather than inventing a new one. Debounce +
// AbortController pattern reused verbatim from `atc-search-filter.tsx` (BK-20).

export interface TestSearchResultItem {
  id: string
  title: string
  tags: string[]
}

interface TestPickerDialogProps {
  open: boolean
  onClose: () => void
  planId: string
  projectId: string
  // Test ids already in the plan — the picker marks them and prevents
  // re-selection (AC 3.1). Passed down rather than re-fetched: the parent
  // already holds the live member list.
  existingTestIds: Set<string>
  onAdded: (result: { added_count: number, member_count: number }) => void
}

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

const DEBOUNCE_MS = 250;
// bunkai_search_tests caps p_limit at 50 (0076:299) — request the max so a
// library with more than the RPC's own default of 20 doesn't silently
// truncate.
const SEARCH_LIMIT = 50;

export function TestPickerDialog({ open, onClose, planId, projectId, existingTestIds, onAdded }: TestPickerDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TestSearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per submission attempt, rotated only after a failed response —
  // same contract as NewTestBuilder's Test-create submit.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open) { return; }
    const trimmed = query.trim();
    if (trimmed === '') {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const run = async () => {
      try {
        const params = new URLSearchParams({ query: trimmed, project_id: projectId, limit: String(SEARCH_LIMIT) });
        const res = await fetch(`/api/v1/tests/search?${params}`, { signal: controller.signal });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body = (await res.json()) as { items: TestSearchResultItem[] };
        setResults(body.items ?? []);
      }
      catch {
        // Aborted or network error — leave the previous results in place.
      }
      finally {
        // On a keystroke that aborts an in-flight fetch, the aborted
        // promise's finally runs on a later microtask than the new effect's
        // setSearching(true) — stamping searching back to false while the
        // new search is genuinely in flight. Only the request that actually
        // finished gets to flip the flag.
        if (!controller.signal.aborted) { setSearching(false); }
      }
    };

    const timer = setTimeout(() => { void run(); }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, projectId, open]);

  if (!open) {
    return null;
  }

  const close = () => {
    if (submitting) { return; }
    setQuery('');
    setResults([]);
    setSelected(new Set());
    setError(null);
    // Unlike NewTestBuilder's Test-create submit, this dialog is NOT
    // unmounted after a successful add (it stays mounted, reused across
    // open/close cycles on the same plan page) — so the key must rotate here
    // too, not only on failure, or the next add reuses a key already marked
    // `succeeded` for a different payload and gets a spurious 409.
    setIdempotencyKey(crypto.randomUUID());
    onClose();
  };

  const toggle = (testId: string) => {
    if (existingTestIds.has(testId)) { return; }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) { next.delete(testId); }
      else { next.add(testId); }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || submitting) { return; }
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/test-plans/${planId}/tests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ test_ids: [...selected] }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? 'Could not add these tests.');
        setIdempotencyKey(crypto.randomUUID());
        setSubmitting(false);
        return;
      }

      const body = (await response.json()) as { added_count: number, member_count: number };
      setSubmitting(false);
      onAdded(body);
      close();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        data-testid="test-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add tests"
        className="flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg-1">
          <FlaskConical size={13} />
          Add tests
        </div>

        <label htmlFor="test-picker-search-input" className="mb-1.5 block text-xs text-fg-2">
          Search the project&apos;s test library
        </label>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-4" />
          <input
            id="test-picker-search-input"
            data-testid="test-picker-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by name or tag"
            autoFocus
            disabled={submitting}
            className="w-full rounded-2 border border-stroke-2 bg-surface-2 py-2 pl-7 pr-2.5 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
          />
        </div>

        <div
          data-testid="test-picker-results"
          role="group"
          aria-label="Test library results"
          className="mt-2 flex min-h-[120px] flex-1 flex-col gap-1 overflow-y-auto"
        >
          {query.trim() === '' && (
            <p className="px-1 py-2 text-xs italic text-fg-4">Type to search.</p>
          )}
          {query.trim() !== '' && !searching && results.length === 0 && (
            <p data-testid="test-picker-empty" className="px-1 py-2 text-xs italic text-fg-4">No tests match.</p>
          )}
          {results.map((test) => {
            const alreadyInPlan = existingTestIds.has(test.id);
            const isSelected = selected.has(test.id);
            return (
              <button
                key={test.id}
                type="button"
                data-testid={`test-picker-result-${test.id}`}
                disabled={alreadyInPlan || submitting}
                aria-pressed={isSelected}
                onClick={() => toggle(test.id)}
                className={`flex items-center gap-2.5 rounded-2 border px-3 py-2 text-left transition-colors ${
                  alreadyInPlan
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
                <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{test.title}</span>
                {test.tags.length > 0 && (
                  <span className="shrink-0 truncate text-2xs text-fg-3">{test.tags.join(', ')}</span>
                )}
                {alreadyInPlan && (
                  <span data-testid={`test-picker-already-in-plan-${test.id}`} className="shrink-0 text-2xs text-fg-4">
                    Already in plan
                  </span>
                )}
              </button>
            );
          })}
          {results.length === SEARCH_LIMIT && (
            <p data-testid="test-picker-truncated" className="px-1 py-2 text-2xs italic text-fg-4">
              Showing the first
              {' '}
              {SEARCH_LIMIT}
              {' '}
              matches — refine your search to narrow the results.
            </p>
          )}
        </div>

        {error && (
          <p data-testid="test-picker-error" className="m-0 mt-2 text-xs text-signal-fail">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-stroke-2 pt-3">
          <span data-testid="test-picker-count" className="flex-1 text-xs text-fg-3">
            {selected.size}
            {' selected'}
          </span>
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="test-picker-confirm"
            onClick={() => { void handleConfirm(); }}
            disabled={selected.size === 0 || submitting}
          >
            {submitting ? 'Adding…' : 'Add tests'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="test-picker-cancel"
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
