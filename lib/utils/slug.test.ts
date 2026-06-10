import { hasAlphanumeric, slugify, slugifyWithFallback } from '@lib/utils/slug';
import { describe, expect, test } from 'bun:test';

describe('slugify', () => {
  test('lowercases and kebab-cases a plain name', () => {
    expect(slugify('Checkout v2')).toBe('checkout-v2');
  });

  test('strips accents to ASCII (NFD diacritics)', () => {
    expect(slugify('Café Münchën')).toBe('cafe-munchen');
  });

  test('collapses runs of separators into a single hyphen', () => {
    expect(slugify('a   b___c!!!d')).toBe('a-b-c-d');
  });

  test('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });

  test('caps length at 40 chars with no trailing hyphen', () => {
    // 50 a's then a space then more — slice lands at 40, no dangling hyphen.
    const result = slugify(`${'a'.repeat(38)} extra words here`);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('-')).toBe(false);
  });

  test('re-trims a trailing hyphen produced by the 40-char slice', () => {
    // 40 chars of name, then a separator at position 40 would survive the
    // slice as a trailing hyphen without the post-slice re-trim.
    const name = `${'a'.repeat(40)} tail`;
    const result = slugify(name);
    expect(result).toBe('a'.repeat(40));
    expect(result.endsWith('-')).toBe(false);
  });

  test('returns empty string for symbol-only input', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  test('keeps digits', () => {
    expect(slugify('Project 123')).toBe('project-123');
  });
});

describe('hasAlphanumeric', () => {
  test('true when at least one ASCII letter or digit is present', () => {
    expect(hasAlphanumeric('hello')).toBe(true);
    expect(hasAlphanumeric('123')).toBe(true);
    expect(hasAlphanumeric('!a!')).toBe(true);
  });

  test('false for symbol-only or whitespace-only strings', () => {
    expect(hasAlphanumeric('!!!')).toBe(false);
    expect(hasAlphanumeric('   ')).toBe(false);
    expect(hasAlphanumeric('')).toBe(false);
    // Emoji are \p{So} (symbols), not letters/numbers — still rejected.
    expect(hasAlphanumeric('🚀🚀')).toBe(false);
  });

  test('Unicode letters and digits count (BK-53: CJK, Cyrillic, accented Latin)', () => {
    expect(hasAlphanumeric('éé')).toBe(true);
    expect(hasAlphanumeric('日本語プロジェクト')).toBe(true);
    expect(hasAlphanumeric('Проект')).toBe(true);
    expect(hasAlphanumeric('中文123')).toBe(true);
  });
});

describe('slugifyWithFallback', () => {
  test('passes a normal derived slug through unchanged', () => {
    expect(slugifyWithFallback('Checkout v2', 'project', 3)).toBe('checkout-v2');
  });

  test('accented Latin still transliterates — no fallback needed', () => {
    expect(slugifyWithFallback('Café Münchën', 'project', 3)).toBe('cafe-munchen');
  });

  test('a CJK name falls back to a prefixed 8-hex hash', () => {
    expect(slugifyWithFallback('日本語プロジェクト', 'project', 3)).toMatch(/^project-[0-9a-f]{8}$/);
  });

  test('the fallback is deterministic (same input twice → identical slug)', () => {
    expect(slugifyWithFallback('日本語プロジェクト', 'project', 3))
      .toBe(slugifyWithFallback('日本語プロジェクト', 'project', 3));
  });

  test('different CJK names hash to different fallbacks', () => {
    expect(slugifyWithFallback('日本語プロジェクト', 'project', 3))
      .not
      .toBe(slugifyWithFallback('中文项目', 'project', 3));
  });

  test('surrounding whitespace does not change the fallback (trim parity)', () => {
    // Preserves duplicate-name → unique-violation (23505) → 409 semantics:
    // visually identical names must produce the identical slug.
    expect(slugifyWithFallback(' 日本語 ', 'project', 3))
      .toBe(slugifyWithFallback('日本語', 'project', 3));
  });
});
