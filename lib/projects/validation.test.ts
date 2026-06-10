import { isReservedProjectSlug, RESERVED_PROJECT_SLUGS } from '@lib/projects/validation';
import { slugify } from '@lib/utils/slug';
import { describe, expect, test } from 'bun:test';

// The exact AC-11 list (BK-8, Dev Q8). The deep-equality guard below pins the
// exported set against silent drift in either direction.
const AC11_RESERVED = [
  'api',
  'new',
  'create',
  'edit',
  'delete',
  'settings',
  'admin',
  'null',
  'undefined',
  'true',
  'false',
  'me',
  'self',
  'health',
  'docs',
  'openapi',
  'static',
  'public',
];

describe('isReservedProjectSlug', () => {
  test.each(AC11_RESERVED)('the reserved word "%s" is rejected', (word) => {
    expect(isReservedProjectSlug(word)).toBe(true);
  });

  test('catches reserved words arriving via slugify (case / spacing / symbols)', () => {
    expect(isReservedProjectSlug(slugify('API'))).toBe(true);
    expect(slugify(' New ')).toBe('new');
    expect(isReservedProjectSlug(slugify(' New '))).toBe(true);
    expect(slugify('Settings!')).toBe('settings');
    expect(isReservedProjectSlug(slugify('Settings!'))).toBe(true);
  });

  test('near-misses are NOT reserved (exact match only)', () => {
    expect(isReservedProjectSlug('api-tests')).toBe(false);
    expect(isReservedProjectSlug('newest')).toBe(false);
    expect(isReservedProjectSlug('nullify')).toBe(false);
    expect(isReservedProjectSlug('apidocs')).toBe(false);
    expect(isReservedProjectSlug('publica')).toBe(false);
  });

  test('empty and single-char slugs are not reserved', () => {
    expect(isReservedProjectSlug('')).toBe(false);
    expect(isReservedProjectSlug('a')).toBe(false);
  });
});

describe('RESERVED_PROJECT_SLUGS', () => {
  test('contains exactly the 18 AC-11 words (parity guard)', () => {
    expect(RESERVED_PROJECT_SLUGS.size).toBe(18);
    expect([...RESERVED_PROJECT_SLUGS].sort()).toEqual([...AC11_RESERVED].sort());
  });
});
