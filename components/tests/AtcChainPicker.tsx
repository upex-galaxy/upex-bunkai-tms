'use client';

import type { AtcLayer } from '@lib/types';
import { TEST_CHAIN_UI_SOFT_CAP } from '@lib/tests/validation';
import { cn, shortSlug } from '@lib/utils';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

// Minimal projection of an ATC the builder needs: enough to render a library
// row (left column) and a chain row (right column, "Used by" anatomy from the
// mockup `project.jsx:529-546`) — never the full record.
export interface AtcLibraryItem {
  id: string
  slug: string
  title: string
  layer: AtcLayer
}

interface AtcChainPickerProps {
  // Workspace ATC library — every non-archived ATC across the workspace's
  // projects (Decision 2: Tests are workspace-scoped, ATCs are project-scoped).
  atcs: AtcLibraryItem[]
  // Ordered chain. Duplicates are legal — a chain is a sequence, not a set —
  // so the same library ATC may appear at several positions.
  chain: AtcLibraryItem[]
  onAppend: (atc: AtcLibraryItem) => void
  onRemove: (index: number) => void
}

// Two-column picker: filterable workspace library on the left (click = APPEND
// to the chain; re-click re-appends), ordered chain on the right. Selection
// order IS run order — no reorder affordance here (drag/move-up-down = BK-28).
export function AtcChainPicker({ atcs, chain, onAppend, onRemove }: AtcChainPickerProps) {
  const [query, setQuery] = useState('');

  // Same filter-input pattern as AnchoringPanel — the repo's precedent for
  // filterable lists (cmdk is in deps but unused; CommandPalette is a stub).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return atcs; }
    return atcs.filter(
      a => a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
    );
  }, [query, atcs]);

  // UI-only soft cap (Decision 9): appending stops at 100; the server imposes
  // no chain-length limit.
  const capReached = chain.length >= TEST_CHAIN_UI_SOFT_CAP;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
      {/* left: workspace ATC library */}
      <section className="flex min-h-0 flex-col">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
            ATC Library
          </span>
          <span className="text-xs text-fg-3">click to append · duplicates allowed</span>
        </div>
        <div
          data-testid="new-test-atc-picker"
          className="flex min-h-0 flex-1 flex-col rounded-3 border border-stroke-2 bg-surface-1 p-2"
        >
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter ATCs…"
            className="mb-2 h-7 w-full flex-shrink-0 rounded-2 border border-stroke-2 bg-surface-2 px-2 text-sm text-fg-1 placeholder:text-fg-4 hover:border-stroke-3 focus:border-accent focus:outline-none"
          />
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
            {filtered.map(atc => (
              <button
                key={atc.id}
                type="button"
                disabled={capReached}
                onClick={() => onAppend(atc)}
                className={cn(
                  'flex flex-shrink-0 items-center gap-2.5 rounded-2 border border-stroke-1 bg-surface-2 px-3 py-2 text-left transition-colors',
                  capReached
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:border-stroke-3 hover:bg-surface-3',
                )}
              >
                <span className="shrink-0 font-mono text-xs text-fg-3" title={atc.slug}>
                  {shortSlug(atc.slug)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{atc.title}</span>
                <span className="layer-chip shrink-0" data-layer={atc.layer.toLowerCase()}>
                  {atc.layer}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-1 text-xs italic text-fg-4">No ATCs match.</div>
            )}
          </div>
        </div>
      </section>

      {/* right: ordered chain */}
      <section className="flex min-h-0 flex-col">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
            Chain
          </span>
          <span className="font-mono text-xs text-fg-3">{chain.length}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto rounded-3 border border-stroke-2 bg-surface-1 p-2">
          {chain.length === 0 && (
            <p className="px-1 text-xs italic text-fg-4">A Test must include at least one ATC.</p>
          )}
          {chain.map((atc, i) => (
            // Chain row per the ATCDetail "Used by" anatomy: 8px 12px card,
            // bg-2, 1px stroke-2, r-2; mono id 11px fg-3. Position index is
            // display-only — positions derive from array order, so removing a
            // row reindexes the rest automatically.
            <div
              key={`${atc.id}-${i}`}
              data-testid={`new-test-chain-row-${i}`}
              className="flex flex-shrink-0 items-center gap-2.5 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2"
            >
              <span className="w-5 shrink-0 text-right font-mono text-xs text-fg-3">{i + 1}</span>
              <span className="shrink-0 font-mono text-xs text-fg-3" title={atc.slug}>
                {shortSlug(atc.slug)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{atc.title}</span>
              <span className="layer-chip shrink-0" data-layer={atc.layer.toLowerCase()}>
                {atc.layer}
              </span>
              <button
                type="button"
                data-testid={`new-test-chain-remove-${i}`}
                aria-label="Remove from chain"
                title="Remove from chain"
                onClick={() => onRemove(i)}
                className="inline-flex shrink-0 rounded-1 p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg-0"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {capReached && (
            <p className="px-1 text-xs text-fg-3">Chains are limited to 100 ATCs in the UI.</p>
          )}
        </div>
      </section>
    </div>
  );
}
