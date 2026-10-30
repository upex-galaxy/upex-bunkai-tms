import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { fill, glossary, GLOSSARY_KEYS, pickLang, STRING_KEYS, strings } from './strings.ts';

describe('pickLang (owner answer Q1)', () => {
  test.each([
    [{ LANG: 'en_US.UTF-8' }, 'en'],
    [{ LANG: 'es_AR.UTF-8' }, 'es'],
    [{ LANG: 'fr_FR.UTF-8' }, 'es'],
    [{}, 'es'],
    [{ LANG: 'C.UTF-8' }, 'es'],
    [{ LC_ALL: 'en_GB.UTF-8', LANG: 'es_ES.UTF-8' }, 'en'],
    [{ LC_ALL: 'C', LANG: 'en_US.UTF-8' }, 'en'],
    [{ LC_MESSAGES: 'es_MX', LANG: 'en_US' }, 'es'],
  ] as const)('%o -> %s', (env, lang) => {
    expect(pickLang(env)).toBe(lang);
  });
});

describe('one string table, two languages', () => {
  test('English has exactly the Spanish keys, none empty', () => {
    const en = strings('en');
    expect(Object.keys(en).sort()).toEqual([...STRING_KEYS].sort());
    for (const k of STRING_KEYS) {
      expect(strings('es')[k].length).toBeGreaterThan(0);
      expect(en[k].length).toBeGreaterThan(0);
    }
  });

  test('both glossaries have the same terms', () => {
    expect([...GLOSSARY_KEYS.en].sort()).toEqual([...GLOSSARY_KEYS.es].sort());
  });

  test('every [[term|label]] the strings or the page sources use exists in the glossary', () => {
    const sources = [
      ...Object.values(strings('es')),
      ...Object.values(strings('en')),
      readFileSync(new URL('./page/app.js', import.meta.url), 'utf8'),
    ].join('\n');
    const used = new Set([...sources.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]));
    const qmarks = [...readFileSync(new URL('./page/app.js', import.meta.url), 'utf8').matchAll(/qmark\('([a-z0-9-]+)'\)/g)].map(m => m[1]);
    for (const k of [...used, ...qmarks]) {
      expect(glossary('es')[k], `glossary es: ${k}`).toBeDefined();
      expect(glossary('en')[k], `glossary en: ${k}`).toBeDefined();
    }
  });

  test('placeholders are the same in both languages', () => {
    const vars = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const k of STRING_KEYS) { expect(vars(strings('en')[k]), k).toEqual(vars(strings('es')[k])); }
  });

  test('fill keeps an unknown placeholder visible', () => {
    expect(fill('{n} de {total} {x}', { n: 1, total: 2 })).toBe('1 de 2 {x}');
  });
});
