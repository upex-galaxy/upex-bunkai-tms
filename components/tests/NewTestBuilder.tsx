'use client';

import type { AtcLibraryItem } from '@components/tests/AtcChainPicker';
import { AtcChainPicker } from '@components/tests/AtcChainPicker';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { TEST_CHAIN_UI_SOFT_CAP, TEST_TITLE_MAX } from '@lib/tests/validation';
import { cn } from '@lib/utils';
import { ChevronLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface NewTestBuilderProps {
  projectSlug: string
  // Workspace ATC library (id, slug, title, layer) — loaded server-side.
  atcs: AtcLibraryItem[]
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export function NewTestBuilder({ projectSlug, atcs }: NewTestBuilderProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [chain, setChain] = useState<AtcLibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One idempotency key per submission attempt (lazy initializer → generated
  // ONCE up front). A double-submit re-sends the same key, so the server's
  // replay snapshot guarantees exactly one Test (TC-12) — belt-and-braces with
  // pending-disable. The key rotates ONLY after a non-ok response (never
  // between double-clicks): the server hash-checks key reuse BEFORE status, so
  // an edited payload retried under a failed key would 409 forever.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const trimmedLength = title.trim().length;
  const titleValid = trimmedLength >= 1 && trimmedLength <= TEST_TITLE_MAX;
  const canSubmit = titleValid && chain.length > 0 && !submitting;

  const appendAtc = (atc: AtcLibraryItem) => {
    // UI soft cap (Decision 9) — the picker also disables its rows, this guard
    // is the state-level backstop.
    setChain(prev =>
      prev.length >= TEST_CHAIN_UI_SOFT_CAP ? prev : [...prev, atc],
    );
    if (error) { setError(null); }
  };

  const removeAt = (index: number) => {
    // Positions derive from array order, so dropping one row reindexes the
    // remainder client-side for free.
    setChain(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit) { return; }
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/tests', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          title: title.trim(),
          atc_ids: chain.map(a => a.id),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        // Server copy is rendered VERBATIM — the non-disclosure messages
        // (foreign vs nonexistent ATC are byte-identical) are frozen and must
        // never be rephrased client-side.
        setError(body.error?.message ?? 'Could not create the Test.');
        // Rotate the key so an edited retry starts a fresh idempotency row —
        // the failed row keeps the OLD payload hash and a changed payload
        // under the same key is a hard 409 server-side.
        setIdempotencyKey(crypto.randomUUID());
        setSubmitting(false);
        return;
      }

      toast.success('Test created');
      router.push(`/projects/${projectSlug}`);
      router.refresh();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0" data-testid="new-test-builder">
      {/* topbar */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-stroke-1 bg-surface-1 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            className="inline-flex size-7 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
          >
            <ChevronLeft size={13} />
          </Link>
          <span className="text-sm text-fg-2">New Test</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/projects/${projectSlug}`)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            data-testid="new-test-submit"
            onClick={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            className={cn(!canSubmit && 'cursor-not-allowed')}
          >
            <Plus size={11} />
            {submitting ? 'Creating…' : 'Create Test'}
          </Button>
        </div>
      </div>

      {/* body: title + helper, then picker/chain columns */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        <header className="flex-shrink-0">
          <p className="mb-3 text-sm text-fg-3">
            Chain ATCs from your workspace library — selection order is run order.
          </p>
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
              <span>
                Title
                <span className="ml-1 font-normal text-fg-3">required</span>
              </span>
              <span
                className={cn(
                  'font-normal normal-case tracking-normal',
                  trimmedLength > TEST_TITLE_MAX ? 'text-signal-fail' : 'text-fg-3',
                )}
              >
                {trimmedLength}
                /
                {TEST_TITLE_MAX}
              </span>
            </span>
            <Input
              autoFocus
              data-testid="new-test-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) { setError(null); }
              }}
              placeholder="Name the journey this chain verifies"
              className="h-10 text-md font-semibold"
            />
          </label>
        </header>

        <AtcChainPicker
          atcs={atcs}
          chain={chain}
          onAppend={appendAtc}
          onRemove={removeAt}
        />

        {error && (
          <p className="flex-shrink-0 text-xs text-signal-fail" data-testid="new-test-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
