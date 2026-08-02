import { AtcDuplicateBodySchema, defaultCopyTitle } from '@lib/atcs/validation';
import { describe, expect, test } from 'bun:test';

// BK-23 — unit coverage for the duplicate body schema (optional new_title,
// 3–200) and the `(copy)` default-title helper.
//
// BK-184 — the request field is `new_title` (matches FR-014's documented
// contract). The implementation previously read `title` instead, so a caller
// following the spec silently got the default "(copy)" title. Renamed here
// alongside the route/schema fix; a supplied `title` key is no longer a
// recognized field (extra/unknown keys are ignored by Zod's default mode,
// same as before the rename).

describe('atcDuplicateBodySchema', () => {
  test('accepts an empty body (new_title optional → default applied server-side)', () => {
    const parsed = AtcDuplicateBodySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.new_title).toBeUndefined();
    }
  });

  test('accepts a valid custom new_title', () => {
    expect(AtcDuplicateBodySchema.safeParse({ new_title: 'My renamed copy' }).success).toBe(true);
  });

  test('rejects a 2-char new_title (below min)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ new_title: 'AB' }).success).toBe(false);
  });

  test('accepts a 3-char new_title (lower boundary)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ new_title: 'ABC' }).success).toBe(true);
  });

  test('accepts a 200-char new_title (upper boundary)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ new_title: 'a'.repeat(200) }).success).toBe(true);
  });

  test('rejects a 201-char new_title (above max)', () => {
    expect(AtcDuplicateBodySchema.safeParse({ new_title: 'a'.repeat(201) }).success).toBe(false);
  });

  test('BK-184 regression: a body using the old `title` key is silently ignored, not treated as new_title', () => {
    const parsed = AtcDuplicateBodySchema.safeParse({ title: 'Should not be picked up' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.new_title).toBeUndefined();
    }
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
