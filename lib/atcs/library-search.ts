// BK-440 — the ATC Library's name search. Pure helpers shared by the Active and
// Archived views. Narrowing runs in the browser over the rows the page already
// loaded: no endpoint, no request per keystroke. The `q` URL parameter is the
// contract BK-441 (facet filters) composes with: `AtcLibraryQuery` is the one
// place a filter state would sit next to the term.

export const ATC_LIBRARY_SEARCH_PARAM = 'q';
export const ATC_LIBRARY_SEARCH_MAX = 200;
export const ATC_LIBRARY_SEARCH_DEBOUNCE_MS = 250;

export type AtcLibraryViewKey = 'active' | 'archived';

export interface AtcLibraryQuery {
  q: string
}

// Trim, then cut at the title maximum. A term that is only spaces is empty.
export function cleanSearchTerm(raw: string): string {
  return raw.trim().slice(0, ATC_LIBRARY_SEARCH_MAX).trim();
}

// Case- and accent-insensitive comparison key ("Café" and "cafe" meet).
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// `?q=` as the server page reads it: first value wins, malformed or absent is
// empty (a bad percent-encoding never reaches here as an error).
export function parseSearchParam(raw: string | string[] | undefined): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') { return ''; }
  return cleanSearchTerm(first);
}

export function readSearchFromAddress(search: string): string {
  const params = new URLSearchParams(search);
  return parseSearchParam(params.get(ATC_LIBRARY_SEARCH_PARAM) ?? undefined);
}

// Literal "contains" on the folded title. Tags and the ATC code never match.
export function filterByTitle<T extends { title: string }>(rows: readonly T[], term: string): readonly T[] {
  const needle = foldForSearch(cleanSearchTerm(term));
  if (needle === '') { return rows; }
  return rows.filter(row => foldForSearch(row.title).includes(needle));
}

// Merge the term into a query string, keeping every foreign parameter.
export function withSearchTerm(search: string, term: string): string {
  const params = new URLSearchParams(search);
  const clean = cleanSearchTerm(term);
  if (clean === '') { params.delete(ATC_LIBRARY_SEARCH_PARAM); }
  else { params.set(ATC_LIBRARY_SEARCH_PARAM, clean); }
  return params.toString();
}

// Href of a view carrying the live term (the Active/Archived toggle links).
export function libraryHref(view: AtcLibraryViewKey, term: string): string {
  const params = new URLSearchParams();
  if (view === 'archived') { params.set('view', 'archived'); }
  const clean = cleanSearchTerm(term);
  if (clean !== '') { params.set(ATC_LIBRARY_SEARCH_PARAM, clean); }
  const query = params.toString();
  return query === '' ? '/atcs' : `/atcs?${query}`;
}

export function noMatchTitle(term: string): string {
  return `No ATCs match \u201C${cleanSearchTerm(term)}\u201D`;
}
