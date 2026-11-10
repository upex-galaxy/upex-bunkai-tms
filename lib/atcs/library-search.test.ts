import { describe, expect, test } from 'bun:test';
import { cleanSearchTerm, filterByTitle, foldForSearch, libraryHref, noMatchTitle, parseSearchParam, readSearchFromAddress, withSearchTerm } from './library-search';

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
