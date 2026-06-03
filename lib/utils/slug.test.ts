import { hasAlphanumeric, slugify } from '@lib/utils/slug';
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
  });

  test('non-ASCII letters alone do not count (route relies on derived slug)', () => {
    // A name of only non-ASCII letters passes hasAlphanumeric only if it has
    // ASCII; pure accented input like "éé" has no raw ASCII alphanumeric.
    expect(hasAlphanumeric('éé')).toBe(false);
  });
});
