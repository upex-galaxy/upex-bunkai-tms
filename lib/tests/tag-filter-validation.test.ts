import { describe, expect, it } from 'bun:test';
import {
  decodeTestTagFilterCursor,
  encodeTestTagFilterCursor,
  parseTestTagFilterParams,
  TEST_TAG_FILTER_LIMIT_DEFAULT,
  TEST_TAG_FILTER_LIMIT_MAX,
} from './tag-filter-validation';

const p = (entries: Record<string, string>) => new URLSearchParams(entries);

describe('parseTestTagFilterParams', () => {
  it('defaults limit to 20 and trims the tag', () => {
    const q = parseTestTagFilterParams(p({ tag: ' smoke ' }));
    expect(q.tag).toBe('smoke');
    expect(q.limit).toBe(TEST_TAG_FILTER_LIMIT_DEFAULT);
    expect(q.cursor).toBeUndefined();
  });

  it('accepts the ceiling and refuses above it', () => {
    expect(parseTestTagFilterParams(p({ tag: 'a', limit: String(TEST_TAG_FILTER_LIMIT_MAX) })).limit).toBe(50);
    expect(() => parseTestTagFilterParams(p({ tag: 'a', limit: '51' }))).toThrow();
    expect(() => parseTestTagFilterParams(p({ tag: 'a', limit: '500' }))).toThrow();
  });

  it('refuses zero, negative, decimal, empty and non-numeric limits', () => {
    for (const limit of ['0', '-1', '2.5', '', 'abc']) {
      expect(() => parseTestTagFilterParams(p({ tag: 'a', limit }))).toThrow();
    }
  });

  it('refuses a missing or blank tag', () => {
    expect(() => parseTestTagFilterParams(p({}))).toThrow();
    expect(() => parseTestTagFilterParams(p({ tag: '   ' }))).toThrow();
  });
});

describe('test tag filter cursor', () => {
  const cursor = { createdAt: '2026-10-01T10:00:00.123456+00:00', id: '123e4567-e89b-12d3-a456-426614174000' };

  it('round-trips', () => {
    const decoded = decodeTestTagFilterCursor(encodeTestTagFilterCursor(cursor));
    expect(decoded).toEqual({ ok: true, cursor });
  });

  it('refuses garbage, empty and truncated tokens', () => {
    const valid = encodeTestTagFilterCursor(cursor);
    for (const raw of ['!!!', 'abc', '', valid.slice(0, 10)]) {
      expect(decodeTestTagFilterCursor(raw).ok).toBe(false);
    }
  });
});
