'use client';

import { Input } from '@components/ui/input';
import { Tag, X } from 'lucide-react';
import { useEffect } from 'react';
import { useWorkbench } from './workbench-context';

// BK-33 — Projects toolbar Test-tag filter, beside the ATC search filter. Type a
// tag → debounced GET /api/v1/tests?tag= (workspace-scoped) → the matching Test
// id set is written into the workbench context, which scopes the explorer's
// Tests group to those Tests. An empty / unused tag clears or empties the scope
// ("No Tests carry this tag"). Reuses only the `Input` atom + frozen §2 tokens,
// mirroring `atc-search-filter.tsx` — no new visual decisions.

const DEBOUNCE_MS = 250;
const PAGE_LIMIT = 50;

interface FilteredTestRow {
  id: string
  title: string
  tags: string[]
  step_count: number
}

export function TestTagFilter() {
  // BK-443 — the raw text lives in the workbench context (so a saved view can
  // set it and the address can mirror it); this control still owns the lookup.
  const { setTestTagFilter, tagInput: value, setTagInput: setValue } = useWorkbench();

  // Debounce the tag lookup; an empty (trimmed) value clears the filter and
  // fires no request. AbortController cancels an in-flight fetch. Keyed on the
  // input value alone (mirrors atc-search-filter); `setTestTagFilter` is stable
  // across the provider's life (project switch remounts it).
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setTestTagFilter(null, null);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        // BK-742 — the lookup is paged (max 50 per page). Follow `next_cursor`
        // until it is null so the explorer is scoped to EVERY matching Test,
        // never just the first page. Any failed page empties the scope rather
        // than presenting a partial set as the complete match.
        const ids: string[] = [];
        let cursor: string | null = null;
        do {
          const params = new URLSearchParams({ tag: trimmed, limit: String(PAGE_LIMIT) });
          if (cursor !== null) {
            params.set('cursor', cursor);
          }
          const res = await fetch(`/api/v1/tests?${params}`, { signal: controller.signal });
          if (!res.ok) {
            setTestTagFilter(trimmed, []);
            return;
          }
          const body = (await res.json()) as { items: FilteredTestRow[], next_cursor: string | null };
          for (const t of body.items ?? []) {
            ids.push(t.id);
          }
          cursor = body.next_cursor ?? null;
        } while (cursor !== null);
        setTestTagFilter(trimmed, ids);
      }
      catch {
        // Aborted or network error — leave the previous scope in place.
      }
    };

    const timer = setTimeout(() => { void run(); }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, setTestTagFilter]);

  const clear = () => {
    setValue('');
    setTestTagFilter(null, null);
  };

  return (
    <div className="relative w-44">
      <Tag
        size={12}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-4"
      />
      <Input
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Filter by tag…"
        aria-label="Filter Tests by tag"
        data-testid="test-tag-filter"
        className="pl-7 pr-7"
      />
      {value.trim() !== '' && (
        <button
          type="button"
          data-testid="test-tag-filter-clear"
          onClick={clear}
          aria-label="Clear tag filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-1"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
