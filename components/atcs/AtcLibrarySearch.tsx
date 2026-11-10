'use client';

import type { AtcLibraryViewKey } from '@lib/atcs/library-search';
import type { ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import {
  ATC_LIBRARY_SEARCH_DEBOUNCE_MS,
  ATC_LIBRARY_SEARCH_MAX,
  cleanSearchTerm,
  filterByTitle,
  libraryHref,
  noMatchTitle,
  readSearchFromAddress,
  withSearchTerm,
} from '@lib/atcs/library-search';
import { Search, SearchX } from 'lucide-react';
import { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

// BK-440 — the ATC Library's name search. The term lives in a provider above
// the view so it survives the Retry swap and the Active/Archived toggle; the
// views narrow their loaded rows in the browser (no request per keystroke).
// The address is written with `history.replaceState` (never `router.replace`,
// which would re-run the server read), debounced, so typing adds no Back stop.
// BK-441's facet filters compose here: they add their own params next to `q`.

interface AtcLibrarySearchValue {
  term: string
  setTerm: (next: string) => void
  clear: () => void
  hrefFor: (view: AtcLibraryViewKey) => string
}

const AtcLibrarySearchContext = createContext<AtcLibrarySearchValue | null>(null);

function useAtcLibrarySearch(): AtcLibrarySearchValue {
  const value = useContext(AtcLibrarySearchContext);
  if (value === null) { throw new Error('AtcLibrarySearchProvider is missing'); }
  return value;
}

function writeAddress(term: string) {
  const query = withSearchTerm(window.location.search, term);
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

export function AtcLibrarySearchProvider({ initialTerm, children }: { initialTerm: string, children: ReactNode }) {
  const [term, setTermState] = useState(initialTerm);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelWrite = () => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  };

  const setTerm = (next: string) => {
    const bounded = next.slice(0, ATC_LIBRARY_SEARCH_MAX);
    setTermState(bounded);
    cancelWrite();
    timer.current = setTimeout(() => { timer.current = null; writeAddress(bounded); }, ATC_LIBRARY_SEARCH_DEBOUNCE_MS);
  };

  const clear = () => {
    cancelWrite();
    setTermState('');
    writeAddress('');
  };

  // Back after opening a row re-mounts from the server props its history entry
  // was rendered with, while `replaceState` left the typed address in place:
  // reconcile with the address once. Mount-only by design.
  useEffect(() => {
    const fromAddress = readSearchFromAddress(window.location.search);
    setTermState(prev => (prev === fromAddress ? prev : fromAddress));
    return cancelWrite;
  }, []);

  const value = useMemo<AtcLibrarySearchValue>(() => ({
    term,
    setTerm,
    clear,
    hrefFor: view => libraryHref(view, term),
  }), [term]);

  return <AtcLibrarySearchContext value={value}>{children}</AtcLibrarySearchContext>;
}

// The toggle links read the live term, so a switch never drops the search.
export function useAtcLibraryHref(): (view: AtcLibraryViewKey) => string {
  return useAtcLibrarySearch().hrefFor;
}

// Narrow `rows` by the deferred term: the field never waits for the redraw.
export function useAtcLibraryNarrowing<T extends { title: string }>(rows: readonly T[]) {
  const { term } = useAtcLibrarySearch();
  const deferred = useDeferredValue(term);
  const visible = useMemo(() => filterByTitle(rows, deferred), [rows, deferred]);
  const active = cleanSearchTerm(deferred) !== '';
  return { visible, active, term: cleanSearchTerm(deferred) };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) { return false; }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function overlayIsOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null;
}

export function AtcLibrarySearchField({ resultCount }: { resultCount: number | null }) {
  const { term, setTerm, clear } = useAtcLibrarySearch();
  const inputRef = useRef<HTMLInputElement>(null);

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

  const clean = cleanSearchTerm(term);
  const announcement = clean === '' || resultCount === null
    ? ''
    : resultCount === 0 ? `No ATCs match ${clean}` : `${resultCount} ${resultCount === 1 ? 'ATC matches' : 'ATCs match'}`;

  return (
    <div data-testid="atc-library-search" className="relative border-b border-stroke-2 px-6 py-2">
      <Search size={13} aria-hidden className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-fg-3" />
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
        className="max-w-md pl-8"
        onChange={(event) => { setTerm(event.target.value); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) { return; }
          if (event.key === 'Enter') { event.preventDefault(); return; }
          if (event.key !== 'Escape') { return; }
          if (term !== '') { clear(); }
          else { inputRef.current?.blur(); }
        }}
      />
      <p role="status" aria-live="polite" className="sr-only" data-testid="atc-library-search-status">{announcement}</p>
    </div>
  );
}

// A search that matches nothing: its own state, never the error block and never
// the empty-workspace copy.
export function AtcLibraryNoMatch({ term }: { term: string }) {
  const { clear } = useAtcLibrarySearch();
  return (
    <div data-testid="atc-library-no-match" className="m-6 flex flex-col items-center gap-2 rounded-3 border border-dashed border-stroke-2 px-6 py-12 text-center">
      <SearchX size={20} className="text-fg-4" aria-hidden />
      <p className="text-sm font-semibold text-fg-1">{noMatchTitle(term)}</p>
      <p className="max-w-md text-xs text-fg-3">Search looks at ATC names only.</p>
      <Button type="button" variant="default" size="sm" onClick={clear}>Clear search</Button>
    </div>
  );
}
