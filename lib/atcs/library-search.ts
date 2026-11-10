// BK-440 — the ATC Library's name search. Pure helpers shared by the Active and
// Archived views. Narrowing runs in the browser over the rows the page already
// loaded: no endpoint, no request per keystroke. The `q` URL parameter is the
// contract BK-441 composes with.
// BK-441 — the facet filters (Project, Module, layer, anchor) sit next to the
// term in `AtcLibraryQuery`: one state, one URL contract (`?q=&project=&module=
// &layer=&anchor=`, empty values omitted), AND semantics across all five. The
// Module options cascade from the Project; stale values from a hand-edited URL
// fall back to "all" instead of failing (`sanitizeQuery`).

export const ATC_LIBRARY_SEARCH_PARAM = 'q';
export const ATC_LIBRARY_SEARCH_MAX = 200;
export const ATC_LIBRARY_SEARCH_DEBOUNCE_MS = 250;

export type AtcLibraryViewKey = 'active' | 'archived';

export const ATC_LIBRARY_PROJECT_PARAM = 'project';
export const ATC_LIBRARY_MODULE_PARAM = 'module';
export const ATC_LIBRARY_LAYER_PARAM = 'layer';
export const ATC_LIBRARY_ANCHOR_PARAM = 'anchor';
export const ATC_LIBRARY_LAYERS = ['UI', 'API', 'Unit'] as const;
export type AtcLibraryLayer = typeof ATC_LIBRARY_LAYERS[number];

// `project` is the Project slug (names can repeat), `module` the Module name
// (the same name in two Projects is one option when no Project is chosen),
// `layer` one of the three layers, `anchor` free text. '' = facet off.
export interface AtcLibraryQuery {
  q: string
  project: string
  module: string
  layer: '' | AtcLibraryLayer
  anchor: string
}

export const EMPTY_ATC_LIBRARY_QUERY: AtcLibraryQuery = { q: '', project: '', module: '', layer: '', anchor: '' };

// The row fields the facets read. Both the active and archived rows carry them.
export interface AtcLibraryFacetRow {
  title: string
  layer: string
  projectName: string
  projectSlug: string
  moduleName: string
  storyLabel: string
  acLabel: string | null
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

function cleanText(raw: string | null | undefined): string {
  return typeof raw === 'string' ? cleanSearchTerm(raw) : '';
}

function parseLayer(raw: string | null | undefined): '' | AtcLibraryLayer {
  const wanted = cleanText(raw).toLowerCase();
  return ATC_LIBRARY_LAYERS.find(layer => layer.toLowerCase() === wanted) ?? '';
}

// The whole query as the browser address carries it (`location.search`).
export function readQueryFromAddress(search: string): AtcLibraryQuery {
  const params = new URLSearchParams(search);
  return {
    q: cleanText(params.get(ATC_LIBRARY_SEARCH_PARAM)),
    project: cleanText(params.get(ATC_LIBRARY_PROJECT_PARAM)),
    module: cleanText(params.get(ATC_LIBRARY_MODULE_PARAM)),
    layer: parseLayer(params.get(ATC_LIBRARY_LAYER_PARAM)),
    anchor: cleanText(params.get(ATC_LIBRARY_ANCHOR_PARAM)),
  };
}

type RawParam = string | string[] | undefined;

// The same query as the server page reads it from `searchParams`: first value
// wins, absent or malformed is empty.
export function parseQueryParams(raw: Partial<Record<'q' | 'project' | 'module' | 'layer' | 'anchor', RawParam>>): AtcLibraryQuery {
  const first = (value: RawParam) => (Array.isArray(value) ? value[0] : value);
  return {
    q: cleanText(first(raw.q)),
    project: cleanText(first(raw.project)),
    module: cleanText(first(raw.module)),
    layer: parseLayer(first(raw.layer)),
    anchor: cleanText(first(raw.anchor)),
  };
}

export function queryKey(query: AtcLibraryQuery): string {
  return JSON.stringify([query.q, query.project, query.module, query.layer, query.anchor]);
}

// A narrowing is active when any of the five parts is set.
export function hasActiveQuery(query: AtcLibraryQuery): boolean {
  return query.q !== '' || hasActiveFacets(query);
}

export function hasActiveFacets(query: AtcLibraryQuery): boolean {
  return query.project !== '' || query.module !== '' || query.layer !== '' || query.anchor !== '';
}

export interface AtcLibraryFacetOptions {
  projects: { slug: string, name: string }[]
  modules: string[]
}

// Options come from the rows the caller's RLS-scoped read returned: nothing from
// another workspace or an archived parent can show up. Modules are the distinct
// names of the chosen Project, or of the whole workspace when none is chosen.
export function deriveFacetOptions(rows: readonly AtcLibraryFacetRow[], project: string): AtcLibraryFacetOptions {
  const projects = new Map<string, string>();
  const modules = new Set<string>();
  for (const row of rows) {
    if (!projects.has(row.projectSlug)) { projects.set(row.projectSlug, row.projectName); }
    if (project === '' || row.projectSlug === project) { modules.add(row.moduleName); }
  }
  return {
    projects: [...projects].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug)),
    modules: [...modules].sort((a, b) => a.localeCompare(b)),
  };
}

// What actually narrows: a Project or Module the rows do not know (a stale or
// hand-edited URL) counts as "all", never as an error and never as "no match".
export function sanitizeQuery(query: AtcLibraryQuery, rows: readonly AtcLibraryFacetRow[]): AtcLibraryQuery {
  const { projects } = deriveFacetOptions(rows, '');
  const project = projects.some(p => p.slug === query.project) ? query.project : '';
  const { modules } = deriveFacetOptions(rows, project);
  return { ...query, project, module: modules.includes(query.module) ? query.module : '' };
}

// A facet change from the UI. Changing or clearing the Project keeps the Module
// only when the new scope also has it, otherwise the Module returns to "all".
export function applyQueryChange(
  query: AtcLibraryQuery,
  patch: Partial<AtcLibraryQuery>,
  rows: readonly AtcLibraryFacetRow[],
): AtcLibraryQuery {
  const next = { ...query, ...patch };
  if (patch.project === undefined) { return next; }
  const { modules } = deriveFacetOptions(rows, next.project);
  return modules.includes(next.module) ? next : { ...next, module: '' };
}

// AND across the term and every active facet; an off facet never restricts.
export function filterByQuery<T extends AtcLibraryFacetRow>(rows: readonly T[], query: AtcLibraryQuery): readonly T[] {
  const byTitle = filterByTitle(rows, query.q);
  const anchor = foldForSearch(cleanSearchTerm(query.anchor));
  if (!hasActiveFacets(query)) { return byTitle; }
  return byTitle.filter(row =>
    (query.project === '' || row.projectSlug === query.project)
    && (query.module === '' || row.moduleName === query.module)
    && (query.layer === '' || row.layer === query.layer)
    && (anchor === '' || foldForSearch(`${row.storyLabel} ${row.acLabel ?? ''}`).includes(anchor)),
  );
}

// Literal "contains" on the folded title. Tags and the ATC code never match.
export function filterByTitle<T extends { title: string }>(rows: readonly T[], term: string): readonly T[] {
  const needle = foldForSearch(cleanSearchTerm(term));
  if (needle === '') { return rows; }
  return rows.filter(row => foldForSearch(row.title).includes(needle));
}

function setOrDelete(params: URLSearchParams, name: string, value: string) {
  if (value === '') { params.delete(name); }
  else { params.set(name, value); }
}

// Merge the whole query into a query string, keeping every foreign parameter.
export function withQuery(search: string, query: AtcLibraryQuery): string {
  const params = new URLSearchParams(search);
  setOrDelete(params, ATC_LIBRARY_SEARCH_PARAM, cleanSearchTerm(query.q));
  setOrDelete(params, ATC_LIBRARY_PROJECT_PARAM, query.project);
  setOrDelete(params, ATC_LIBRARY_MODULE_PARAM, query.module);
  setOrDelete(params, ATC_LIBRARY_LAYER_PARAM, query.layer);
  setOrDelete(params, ATC_LIBRARY_ANCHOR_PARAM, cleanSearchTerm(query.anchor));
  return params.toString();
}

// Merge the term alone (BK-440 contract, kept).
export function withSearchTerm(search: string, term: string): string {
  return withQuery(search, { ...readQueryFromAddress(search), q: term });
}

// Href of a view carrying the live query (the Active/Archived toggle links).
export function libraryHref(view: AtcLibraryViewKey, query: AtcLibraryQuery | string): string {
  const live = typeof query === 'string' ? { ...EMPTY_ATC_LIBRARY_QUERY, q: query } : query;
  const params = new URLSearchParams(withQuery('', live));
  if (view === 'archived') { return `/atcs?${new URLSearchParams([['view', 'archived'], ...params]).toString()}`; }
  const text = params.toString();
  return text === '' ? '/atcs' : `/atcs?${text}`;
}

export function noMatchTitle(term: string): string {
  return `No ATCs match \u201C${cleanSearchTerm(term)}\u201D`;
}
