'use client';

import type { AtcLibraryFacetRow, AtcLibraryQuery, AtcLibraryViewKey } from '@lib/atcs/library-search';
import type { ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import {
  applyQueryChange,
  ATC_LIBRARY_LAYERS,
  ATC_LIBRARY_SEARCH_DEBOUNCE_MS,
  ATC_LIBRARY_SEARCH_MAX,
  cleanSearchTerm,
  deriveFacetOptions,
  EMPTY_ATC_LIBRARY_QUERY,
  filterByQuery,
  hasActiveFacets,
  hasActiveQuery,
  libraryHref,
  noMatchTitle,
  readQueryFromAddress,
  sanitizeQuery,
  withQuery,
} from '@lib/atcs/library-search';
import { cn } from '@lib/utils';
import { Search, SearchX, X } from 'lucide-react';
import { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

// BK-440 — the ATC Library's name search. The query lives in a provider above
// the view so it survives the Retry swap and the Active/Archived toggle; the
// views narrow their loaded rows in the browser (no request per keystroke).
// The address is written with `history.replaceState` (never `router.replace`,
// which would re-run the server read), so typing adds no Back stop.
// BK-441 — the facet filters (Project, Module, layer, anchor) are part of the
// same query: one state, one address write, one "Clear all". Text inputs (name,
// anchor) debounce the address write; a select or chip writes at once. Clear
// all cancels any pending write so a late timer cannot bring the text back.

interface AtcLibrarySearchValue {
  query: AtcLibraryQuery
  term: string
  setTerm: (next: string) => void
  setFacets: (patch: Partial<AtcLibraryQuery>, rows: readonly AtcLibraryFacetRow[]) => void
  clear: () => void
  hrefFor: (view: AtcLibraryViewKey) => string
}

const AtcLibrarySearchContext = createContext<AtcLibrarySearchValue | null>(null);

function useAtcLibrarySearch(): AtcLibrarySearchValue {
  const value = useContext(AtcLibrarySearchContext);
  if (value === null) { throw new Error('AtcLibrarySearchProvider is missing'); }
  return value;
}

function writeAddress(query: AtcLibraryQuery) {
  const text = withQuery(window.location.search, query);
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${text ? `?${text}` : ''}`);
}

function sameQuery(a: AtcLibraryQuery, b: AtcLibraryQuery): boolean {
  return a.q === b.q && a.project === b.project && a.module === b.module && a.layer === b.layer && a.anchor === b.anchor;
}

export function AtcLibrarySearchProvider({ initialQuery, initialTerm, children }: { initialQuery?: AtcLibraryQuery, initialTerm?: string, children: ReactNode }) {
  const [query, setQueryState] = useState<AtcLibraryQuery>(initialQuery ?? { ...EMPTY_ATC_LIBRARY_QUERY, q: initialTerm ?? '' });
  const latest = useRef(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelWrite = () => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  };

  const commit = (next: AtcLibraryQuery, debounced: boolean) => {
    latest.current = next;
    setQueryState(next);
    cancelWrite();
    if (debounced) {
      timer.current = setTimeout(() => { timer.current = null; writeAddress(latest.current); }, ATC_LIBRARY_SEARCH_DEBOUNCE_MS);
    }
    else { writeAddress(next); }
  };

  const setTerm = (next: string) => {
    commit({ ...latest.current, q: next.slice(0, ATC_LIBRARY_SEARCH_MAX) }, true);
  };

  const setFacets = (patch: Partial<AtcLibraryQuery>, rows: readonly AtcLibraryFacetRow[]) => {
    const bounded = patch.anchor === undefined ? patch : { ...patch, anchor: patch.anchor.slice(0, ATC_LIBRARY_SEARCH_MAX) };
    // Only the anchor is typed text; every other facet is a pick.
    commit(applyQueryChange(latest.current, bounded, rows), Object.keys(patch).every(key => key === 'anchor'));
  };

  const clear = () => { commit({ ...EMPTY_ATC_LIBRARY_QUERY }, false); };

  // Back after opening a row re-mounts from the server props its history entry
  // was rendered with, while `replaceState` left the typed address in place:
  // reconcile with the address once. Mount-only by design.
  useEffect(() => {
    const fromAddress = readQueryFromAddress(window.location.search);
    if (!sameQuery(latest.current, fromAddress)) {
      latest.current = fromAddress;
      setQueryState(fromAddress);
    }
    return cancelWrite;
  }, []);

  const value = useMemo<AtcLibrarySearchValue>(() => ({
    query,
    term: query.q,
    setTerm,
    setFacets,
    clear,
    hrefFor: view => libraryHref(view, query),
  }), [query]);

  return <AtcLibrarySearchContext value={value}>{children}</AtcLibrarySearchContext>;
}

// The toggle links read the live query, so a switch never drops search or filters.
export function useAtcLibraryHref(): (view: AtcLibraryViewKey) => string {
  return useAtcLibrarySearch().hrefFor;
}

// Narrow `rows` by the deferred query: the fields never wait for the redraw.
// `active` = any narrowing in force (term or facet); `facets` = a facet is.
export function useAtcLibraryNarrowing<T extends AtcLibraryFacetRow>(rows: readonly T[]) {
  const { query } = useAtcLibrarySearch();
  const deferred = useDeferredValue(query);
  const effective = useMemo(() => sanitizeQuery(deferred, rows), [rows, deferred]);
  const visible = useMemo(() => filterByQuery(rows, effective), [rows, effective]);
  const facets = hasActiveFacets(effective);
  const term = cleanSearchTerm(effective.q);
  return { visible, active: term !== '' || facets, facets, term };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) { return false; }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function overlayIsOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null;
}

const FACET_LABEL = 'text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2';

// `rows` (the full loaded set) turns on the facet controls and feeds their
// options; without it (error, loading) only the name search shows.
export function AtcLibrarySearchField({ resultCount, rows }: { resultCount: number | null, rows?: readonly AtcLibraryFacetRow[] }) {
  const { query, setTerm, setFacets, clear } = useAtcLibrarySearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const term = query.q;

  // "/" from anywhere on this screen. `key` (not `code`) so Shift+7 on a Spanish
  // layout works. Cmd/Ctrl+K stays with the command palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.defaultPrevented || event.isComposing) { return; }
      if (event.ctrlKey || event.metaKey || event.altKey) { return; }
      if (isEditableTarget(event.target) || overlayIsOpen()) { return; }
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); };
  }, []);

  const loaded = rows !== undefined && rows.length > 0 ? rows : null;
  const effective = useMemo(() => (loaded === null ? query : sanitizeQuery(query, loaded)), [loaded, query]);
  const options = useMemo(() => (loaded === null ? null : deriveFacetOptions(loaded, effective.project)), [loaded, effective.project]);

  const clean = cleanSearchTerm(term);
  const narrowed = clean !== '' || hasActiveFacets(effective);
  const announcement = !narrowed || resultCount === null
    ? ''
    : resultCount === 0 ? 'No ATCs match the current search and filters' : `${resultCount} ${resultCount === 1 ? 'ATC matches' : 'ATCs match'}`;

  return (
    <div data-testid="atc-library-search" className="flex flex-wrap items-center gap-2 border-b border-stroke-2 px-6 py-2" role="search" aria-label="Search and filter ATCs">
      <div className="relative w-full max-w-md">
        <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <Input
          ref={inputRef}
          type="text"
          role="searchbox"
          name="atc-library-search"
          value={term}
          maxLength={ATC_LIBRARY_SEARCH_MAX}
          placeholder="Search by name"
          aria-label="Search ATCs by name"
          aria-keyshortcuts="/"
          autoComplete="off"
          spellCheck={false}
          className="pl-8"
          onChange={(event) => { setTerm(event.target.value); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) { return; }
            if (event.key === 'Enter') { event.preventDefault(); return; }
            if (event.key !== 'Escape') { return; }
            // Esc is the search field's own gesture: it clears the name only.
            if (term !== '') { setFacets({ q: '' }, []); }
            else { inputRef.current?.blur(); }
          }}
        />
      </div>
      {options !== null && (
        <>
          <Select
            aria-label="Filter by Project"
            data-testid="atc-library-filter-project"
            value={effective.project}
            onChange={(event) => { setFacets({ project: event.target.value }, loaded ?? []); }}
          >
            <option value="">All Projects</option>
            {options.projects.map(project => (
              <option key={project.slug} value={project.slug}>{project.name}</option>
            ))}
          </Select>
          <Select
            aria-label="Filter by Module"
            data-testid="atc-library-filter-module"
            value={effective.module}
            onChange={(event) => { setFacets({ module: event.target.value }, loaded ?? []); }}
          >
            <option value="">All Modules</option>
            {options.modules.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
          <div role="group" aria-labelledby="atc-library-layer-label" data-testid="atc-library-filter-layer" className="flex items-center gap-1.5">
            <span id="atc-library-layer-label" className={FACET_LABEL}>Layer</span>
            <button
              type="button"
              aria-pressed={effective.layer === ''}
              data-testid="atc-library-filter-layer-all"
              onClick={() => { setFacets({ layer: '' }, []); }}
              className={cn(
                'inline-flex h-[18px] items-center rounded-2 border px-1.5 text-2xs font-semibold transition-colors duration-token ease-token',
                effective.layer === '' ? 'border-stroke-3 bg-surface-5 text-fg-0' : 'border-stroke-2 text-fg-2 hover:bg-surface-4 hover:text-fg-1',
              )}
            >
              All layers
            </button>
            {ATC_LIBRARY_LAYERS.map((layer) => {
              const pressed = effective.layer === layer;
              return (
                <button
                  key={layer}
                  type="button"
                  aria-pressed={pressed}
                  data-testid={`atc-library-filter-layer-${layer.toLowerCase()}`}
                  data-layer={layer.toLowerCase()}
                  onClick={() => { setFacets({ layer: pressed ? '' : layer }, []); }}
                  className={cn('layer-chip transition-opacity duration-token ease-token', pressed ? 'ring-1 ring-accent' : 'opacity-60 hover:opacity-100')}
                >
                  {layer}
                </button>
              );
            })}
          </div>
          <Input
            type="text"
            name="atc-library-anchor"
            data-testid="atc-library-filter-anchor"
            value={query.anchor}
            maxLength={ATC_LIBRARY_SEARCH_MAX}
            placeholder="US-041 / AC-3"
            aria-label="Filter by User Story or Acceptance Criterion ID"
            autoComplete="off"
            spellCheck={false}
            className="w-40"
            onChange={(event) => { setFacets({ anchor: event.target.value }, []); }}
          />
        </>
      )}
      {options !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="atc-library-clear-all"
          disabled={!hasActiveQuery(query)}
          onClick={clear}
        >
          <X size={12} aria-hidden />
          Clear all
        </Button>
      )}
      <p role="status" aria-live="polite" className="sr-only" data-testid="atc-library-search-status">{announcement}</p>
    </div>
  );
}

export const NO_MATCH_FILTERED_BODY = 'Nothing in the workspace matches the current search and filters. This is not an error \u2014 the library is intact.';

// A narrowing that matches nothing: its own state, never the error block and
// never the empty-workspace copy. A name-only search keeps its BK-440 copy; as
// soon as a facet is involved the copy names search AND filters.
export function AtcLibraryNoMatch({ term, facets = false }: { term: string, facets?: boolean }) {
  const { clear } = useAtcLibrarySearch();
  return (
    <div data-testid="atc-library-no-match" className="m-6 flex flex-col items-center gap-2 rounded-3 border border-dashed border-stroke-2 px-6 py-12 text-center">
      <SearchX size={20} className="text-fg-4" aria-hidden />
      <p className="text-sm font-semibold text-fg-1">{facets ? 'No ATCs found' : noMatchTitle(term)}</p>
      <p className="max-w-md text-xs text-fg-3">{facets ? NO_MATCH_FILTERED_BODY : 'Search looks at ATC names only.'}</p>
      <Button type="button" variant="default" size="sm" data-testid="atc-library-no-match-clear" onClick={clear}>
        {facets ? 'Clear search & filters' : 'Clear search'}
      </Button>
    </div>
  );
}
