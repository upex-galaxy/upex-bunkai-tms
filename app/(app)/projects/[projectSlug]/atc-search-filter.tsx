'use client';

import { Input } from '@components/ui/input';
import { shortSlug } from '@lib/utils';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// BK-20 — Projects toolbar inline filter / autocomplete (master-design-plan
// §4.3 "Toolbar · Inline filter box"). Type → debounced GET /api/v1/atcs/search
// scoped to the active project → dropdown of matches (slug + title + layer chip
// + status dot, mirroring AtcTable row anatomy) → select navigates to the ATC.
//
// Reuses only frozen §2 tokens and existing atoms: the `Input` atom, the
// `.layer-chip` / `.dot` CSS classes, and `shortSlug`. No new visual decisions.
// Empty input performs NO request (BK-20 AC5).

interface AtcSearchResult {
  id: string
  slug: string
  title: string
  layer: 'UI' | 'API' | 'Unit'
  status: string
  module_path: string
}

interface AtcSearchFilterProps {
  projectId: string
  projectSlug: string
}

const DEBOUNCE_MS = 250;

export function AtcSearchFilter({ projectId, projectSlug }: AtcSearchFilterProps) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<AtcSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the query; an empty (trimmed) value clears results and fires no
  // request. AbortController cancels an in-flight fetch when the query changes.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      try {
        const params = new URLSearchParams({ query: trimmed, project_id: projectId });
        const res = await fetch(`/api/v1/atcs/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body = (await res.json()) as { items: AtcSearchResult[] };
        setResults(body.items ?? []);
        setOpen(true);
      }
      catch {
        // Aborted or network error — leave the previous results in place.
      }
    };

    const timer = setTimeout(() => { void run(); }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, projectId]);

  // Close the dropdown when clicking outside the filter.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative w-56">
      <Search
        size={12}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-4"
      />
      <Input
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => { if (results.length > 0) { setOpen(true); } }}
        placeholder="Filter ATCs…"
        aria-label="Filter ATCs by name, ID, or tag"
        data-testid="atc-search-filter"
        className="pl-7"
      />
      {open && (
        <div
          data-testid="atc-search-results"
          className="absolute right-0 top-full z-50 mt-1 max-h-80 w-[360px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2 border border-stroke-1 bg-surface-2 py-1 shadow-lg"
        >
          {results.length === 0
            ? (
                <p className="px-3 py-2 text-xs text-fg-4">No matching ATCs</p>
              )
            : (
                results.map(atc => (
                  <Link
                    key={atc.id}
                    href={`/projects/${projectSlug}/atcs/${atc.id}`}
                    data-testid={`atc-search-result-${atc.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-3"
                  >
                    <span className="dot" data-status={atc.status} />
                    <span className="shrink-0 font-mono text-xs text-fg-2" title={atc.slug}>
                      {shortSlug(atc.slug)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg-0">
                      {atc.title}
                    </span>
                    <span className="layer-chip shrink-0" data-layer={atc.layer.toLowerCase()}>
                      {atc.layer}
                    </span>
                  </Link>
                ))
              )}
        </div>
      )}
    </div>
  );
}
