import { AtcDuplicateBodySchema, defaultCopyTitle } from '@lib/atcs/validation';
import { describe, expect, test } from 'bun:test';

// BK-23 — unit coverage for the duplicate body schema (optional title, 3–200)
// and the `(copy)` default-title helper.

describe('atcDuplicateBodySchema', () => {
  test('accepts an empty body (title optional → default applied server-side)', () => {
    const parsed = AtcDuplicateBodySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBeUndefined();
    }
  });

  test('accepts a valid custom title', () => {
    expect(AtcDuplicateBodySchema.safeParse({ title: 'My renamed copy' }).success).toBe(true);
  });

  test('rejects a 2-char title (below min)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ title: 'AB' }).success).toBe(false);
  });

  test('accepts a 3-char title (lower boundary)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ title: 'ABC' }).success).toBe(true);
  });

  test('accepts a 200-char title (upper boundary)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ title: 'a'.repeat(200) }).success).toBe(true);
  });

  test('rejects a 201-char title (above max)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('defaultCopyTitle', () => {
  test('appends a single " (copy)" suffix', () => {
    expect(defaultCopyTitle('Login happy path')).toBe('Login happy path (copy)');
  });

  // PO-PENDING (implementation-plan §6): duplicating a copy double-suffixes — no
  // de-dup in the MVP. This test pins the current (intended) behaviour.
  test('does not de-dup an existing " (copy)" suffix', () => {
    expect(defaultCopyTitle('Login happy path (copy)')).toBe('Login happy path (copy) (copy)');
  });
});
