'use client';

import { Input } from '@components/ui/input';
import { lookupTestIdsByTag } from '@lib/tests/tag-filter-lookup';
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

export function TestTagFilter() {
  // BK-443 — the raw text lives in the workbench context (so a saved view can
  // set it and the address can mirror it); this control still owns the lookup.
  const { setTestTagFilter, tagInput: value, setTagInput: setValue, tagLookupAttempt } = useWorkbench();

  // Debounce the tag lookup; an empty (trimmed) value clears the filter and
  // fires no request. AbortController cancels an in-flight fetch. Keyed on the
  // input value (mirrors atc-search-filter) and on `tagLookupAttempt`, which the
  // explorer's Retry bumps (BK-1548); `setTestTagFilter` is stable across the
  // provider's life (project switch remounts it).
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setTestTagFilter(null, null);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        // BK-742 — the lookup is paged; `lookupTestIdsByTag` follows every page.
        // BK-1548 — a failed page is a failure, never an empty match: the
        // explorer shows an error with Retry, never "No Tests carry this tag"
        // and never the unfiltered list under a filter that holds a tag.
        const result = await lookupTestIdsByTag(trimmed, controller.signal);
        if (result.status === 'failed') {
          setTestTagFilter(trimmed, [], true);
          return;
        }
        setTestTagFilter(trimmed, result.ids);
      }
      catch {
        // Aborted: a newer lookup replaced this one, or the control unmounted.
      }
    };

    const timer = setTimeout(() => { void run(); }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, setTestTagFilter, tagLookupAttempt]);

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
