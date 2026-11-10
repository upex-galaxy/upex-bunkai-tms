import type { AtcLibraryQuery } from './library-search';
import { describe, expect, test } from 'bun:test';
import {
  applyQueryChange,
  cleanSearchTerm,
  deriveFacetOptions,
  EMPTY_ATC_LIBRARY_QUERY,
  filterByQuery,
  filterByTitle,
  foldForSearch,
  hasActiveFacets,
  hasActiveQuery,
  libraryHref,
  noMatchTitle,
  parseQueryParams,
  parseSearchParam,
  queryKey,
  readQueryFromAddress,
  readSearchFromAddress,
  sanitizeQuery,
  withQuery,
  withSearchTerm,
} from './library-search';

const rows = [
  { title: 'Login with valid credentials', code: 'atc-0a1', tags: ['x'] },
  { title: 'Login rejects wrong password', code: 'atc-0a2', tags: [] },
  { title: 'Logout clears the session', code: 'atc-0a3', tags: [] },
  { title: 'Export CSV keeps 100% of rows', code: 'atc-0a4', tags: ['login'] },
  { title: 'Café menu loads', code: 'atc-0a5', tags: [] },
  { title: 'Café menu loads (copy) (copy)', code: 'atc-0a6', tags: [] },
];
const titles = (term: string) => filterByTitle(rows, term).map(r => r.title);

describe('filterByTitle', () => {
  test('narrows by a partial name after each character', () => {
    expect(titles('l')).toHaveLength(5);
    expect(titles('lo')).toHaveLength(5);
    expect(titles('log')).toEqual(['Login with valid credentials', 'Login rejects wrong password', 'Logout clears the session']);
  });
  test('ignores case, accents and surrounding spaces', () => {
    expect(titles('LOGIN')).toHaveLength(2);
    expect(titles('ogin w')).toEqual(['Login with valid credentials']);
    expect(titles('cafe')).toHaveLength(2);
    expect(titles('CAFÉ')).toHaveLength(2);
    expect(titles(' login ')).toHaveLength(2);
  });
  test('whitespace-only and empty terms return every row, in the same order', () => {
    expect(filterByTitle(rows, '   ')).toBe(rows);
    expect(filterByTitle(rows, '')).toBe(rows);
  });
  test('never matches an ATC code or a tag', () => {
    expect(titles('atc-0a1')).toEqual([]);
    expect(titles('0a1')).toEqual([]);
    expect(titles('x')).toEqual(['Export CSV keeps 100% of rows']);
    expect(titles('login')).not.toContain('Export CSV keeps 100% of rows');
  });
  test('reads special characters literally', () => {
    expect(titles('100%')).toEqual(['Export CSV keeps 100% of rows']);
    expect(titles('(copy)')).toEqual(['Café menu loads (copy) (copy)']);
    for (const t of ['_', '\\', '\'', '"', '<script>', '😀']) { expect(titles(t)).toEqual([]); }
  });
  test('keeps the input order (no relevance ranking)', () => {
    expect(titles('o').map(t => rows.findIndex(r => r.title === t))).toEqual([0, 1, 2, 3, 4, 5]);
  });
  test('cuts a term over 200 characters instead of failing', () => {
    expect(filterByTitle(rows, 'a'.repeat(500))).toEqual([]);
    expect(cleanSearchTerm('b'.repeat(500))).toHaveLength(200);
  });
});

describe('url contract', () => {
  test('first repeated value wins; absent and malformed are empty', () => {
    expect(parseSearchParam(['a', 'b'])).toBe('a');
    expect(parseSearchParam(undefined)).toBe('');
    expect(parseSearchParam('   ')).toBe('');
    expect(readSearchFromAddress('?q=a&q=b')).toBe('a');
    expect(typeof readSearchFromAddress('?q=%E0%A4%A')).toBe('string');
  });
  test('withSearchTerm keeps foreign params and drops q when empty', () => {
    expect(withSearchTerm('view=archived', 'log')).toBe('view=archived&q=log');
    expect(withSearchTerm('view=archived&q=log', '  ')).toBe('view=archived');
    expect(withSearchTerm('', '')).toBe('');
  });
  test('toggle links carry the term in both directions', () => {
    expect(libraryHref('active', '')).toBe('/atcs');
    expect(libraryHref('active', 'log in')).toBe('/atcs?q=log+in');
    expect(libraryHref('archived', 'log')).toBe('/atcs?view=archived&q=log');
  });
  test('no-match title quotes the cleaned term', () => {
    expect(noMatchTitle(' zzzxyz ')).toBe('No ATCs match \u201Czzzxyz\u201D');
    expect(foldForSearch('Café')).toBe('cafe');
  });
});

// BK-441 — facet filters: the pure rulebook behind the toolbar.
describe('BK-441 — facet filters', () => {
  const atc = (title: string, projectSlug: string, moduleName: string, layer: string, storyLabel: string, acLabel: string | null) =>
    ({ title, projectSlug, projectName: projectSlug.toUpperCase(), moduleName, layer, storyLabel, acLabel });
  const facetRows = [
    atc('A', 'p1', 'M1', 'API', 'BK-50', 'Snapshot saved'),
    atc('B', 'p1', 'M2', 'UI', 'BK-51', null),
    atc('C', 'p2', 'M2', 'API', 'BK-50', 'Snapshot restored +1'),
    atc('D', 'p2', 'M3', 'Unit', 'US-041', 'AC-3'),
  ];
  const q = (patch: Partial<AtcLibraryQuery>): AtcLibraryQuery => ({ ...EMPTY_ATC_LIBRARY_QUERY, ...patch });
  const titles = (query: AtcLibraryQuery) => filterByQuery(facetRows, query).map(r => r.title);

  test('Project + Module + layer narrow with AND (5.1)', () => {
    expect(titles(q({ project: 'p1', module: 'M1', layer: 'API' }))).toEqual(['A']);
    expect(titles(q({ project: 'p1', module: 'M2', layer: 'API' }))).toEqual([]);
  });

  test('every partial combination intersects; an off facet restricts nothing (5.2)', () => {
    expect(titles(q({}))).toEqual(['A', 'B', 'C', 'D']);
    expect(titles(q({ project: 'p2' }))).toEqual(['C', 'D']);
    expect(titles(q({ module: 'M2' }))).toEqual(['B', 'C']);
    expect(titles(q({ layer: 'API' }))).toEqual(['A', 'C']);
    expect(titles(q({ project: 'p1', layer: 'UI' }))).toEqual(['B']);
    expect(titles(q({ module: 'M2', layer: 'API' }))).toEqual(['C']);
    expect(titles(q({ anchor: 'bk-50', layer: 'API' }))).toEqual(['A', 'C']);
  });

  test('anchor is a case-insensitive substring over story and criterion (5.5)', () => {
    expect(titles(q({ anchor: 'BK-5' }))).toEqual(['A', 'B', 'C']);
    expect(titles(q({ anchor: 'SNAPSHOT' }))).toEqual(['A', 'C']);
    expect(titles(q({ anchor: 'us-041 / ac' }))).toEqual([]);
    expect(titles(q({ anchor: 'us-041 ac-3' }))).toEqual(['D']);
    expect(titles(q({ anchor: '  ' }))).toHaveLength(4);
  });

  test('the term and the facets combine in either order (6.1, 6.2)', () => {
    const rowsNamed = [...facetRows];
    expect(filterByQuery(rowsNamed, q({ q: 'a', project: 'p1' })).map(r => r.title)).toEqual(['A']);
    expect(filterByQuery(filterByQuery(rowsNamed, q({ q: 'c' })), q({ project: 'p2' })).map(r => r.title))
      .toEqual(filterByQuery(filterByQuery(rowsNamed, q({ project: 'p2' })), q({ q: 'c' })).map(r => r.title));
  });

  test('Module options are the Project\'s own, or the deduplicated workspace set (5.3)', () => {
    expect(deriveFacetOptions(facetRows, '').modules).toEqual(['M1', 'M2', 'M3']);
    expect(deriveFacetOptions(facetRows, 'p1').modules).toEqual(['M1', 'M2']);
    expect(deriveFacetOptions(facetRows, '').projects.map(p => p.slug)).toEqual(['p1', 'p2']);
  });

  test('changing the Project keeps a Module the new Project has and resets one it lacks (5.4)', () => {
    expect(applyQueryChange(q({ project: 'p1', module: 'M1' }), { project: 'p2' }, facetRows).module).toBe('');
    expect(applyQueryChange(q({ project: 'p1', module: 'M2' }), { project: 'p2' }, facetRows).module).toBe('M2');
    expect(applyQueryChange(q({ project: 'p1', module: 'M1' }), { project: '' }, facetRows).module).toBe('M1');
    expect(applyQueryChange(q({ project: 'p1', module: 'M1' }), { layer: 'UI' }, facetRows).module).toBe('M1');
  });

  test('a same-named Module in two Projects stays separate per Project', () => {
    expect(titles(q({ project: 'p1', module: 'M2' }))).toEqual(['B']);
    expect(titles(q({ project: 'p2', module: 'M2' }))).toEqual(['C']);
  });

  test('stale Project or Module values count as "all", never as no match (E2)', () => {
    expect(sanitizeQuery(q({ project: 'gone', module: 'M1' }), facetRows)).toEqual(q({ module: 'M1' }));
    expect(sanitizeQuery(q({ project: 'gone', module: 'nope' }), facetRows)).toEqual(q({}));
    expect(sanitizeQuery(q({ project: 'p1', module: 'M3' }), facetRows)).toEqual(q({ project: 'p1' }));
    expect(sanitizeQuery(q({ project: 'p2', module: 'M3' }), facetRows)).toEqual(q({ project: 'p2', module: 'M3' }));
  });

  test('the address round-trips every part, omits empties and keeps foreign params (E1, 7.2)', () => {
    const full = q({ q: 'log in', project: 'p1', module: 'M 1', layer: 'API', anchor: 'BK-50' });
    const search = withQuery('view=archived', full);
    expect(readQueryFromAddress(search)).toEqual(full);
    expect(withQuery(search, EMPTY_ATC_LIBRARY_QUERY)).toBe('view=archived');
    expect(withQuery('', EMPTY_ATC_LIBRARY_QUERY)).toBe('');
  });

  test('an invalid layer or a bad percent-encoding reads as empty, a lower-case layer is accepted (E2)', () => {
    expect(readQueryFromAddress('?layer=E2E').layer).toBe('');
    expect(readQueryFromAddress('?layer=api').layer).toBe('API');
    expect(readQueryFromAddress('?project=%E0%A4%A&module=%').module).toBe('%');
    expect(parseQueryParams({ layer: ['Unit', 'UI'], project: undefined, anchor: ' x ' })).toEqual(q({ layer: 'Unit', anchor: 'x' }));
  });

  test('"Clear all" is available for any part, and the facet flag ignores the term', () => {
    expect(hasActiveQuery(q({}))).toBe(false);
    expect(hasActiveQuery(q({ q: 'a' }))).toBe(true);
    expect(hasActiveFacets(q({ q: 'a' }))).toBe(false);
    for (const patch of [{ project: 'p1' }, { module: 'M1' }, { layer: 'UI' as const }, { anchor: 'x' }]) {
      expect(hasActiveQuery(q(patch))).toBe(true);
    }
  });

  test('the toggle links carry every active part', () => {
    expect(libraryHref('active', q({ project: 'p1', layer: 'UI' }))).toBe('/atcs?project=p1&layer=UI');
    expect(libraryHref('archived', q({ q: 'log', anchor: 'BK-50' }))).toBe('/atcs?view=archived&q=log&anchor=BK-50');
    expect(libraryHref('archived', EMPTY_ATC_LIBRARY_QUERY)).toBe('/atcs?view=archived');
    expect(queryKey(q({ project: 'p1' }))).not.toBe(queryKey(q({ module: 'p1' })));
  });
});
