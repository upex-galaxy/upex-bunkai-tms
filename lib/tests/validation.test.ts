import { TestCreateBodySchema } from '@lib/tests/validation';
import { describe, expect, test } from 'bun:test';

describe('TestCreateBodySchema boundaries', () => {
  // Valid v4-shaped UUIDs (version nibble 4, variant nibble 8) — zod v4 `.uuid()`
  // is strict about both, so all-same-digit fixtures would falsely fail.
  const ATC_ID = '11111111-1111-4111-8111-111111111111';
  const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
  const base = { atc_ids: [ATC_ID] };

  test('accepts a minimal valid payload', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'Cart' }).success).toBe(true);
  });

  test('trims then validates — "  Cart  " parses to "Cart"', () => {
    const parsed = TestCreateBodySchema.parse({ ...base, title: '  Cart  ' });
    expect(parsed.title).toBe('Cart');
  });

  test('rejects a whitespace-only title', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });

  test('accepts a 1-char title (lower boundary)', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'a' }).success).toBe(true);
  });

  test('accepts a 200-char title', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'a'.repeat(200) }).success).toBe(true);
  });

  test('rejects a 201-char title (upper boundary)', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'a'.repeat(201) }).success).toBe(false);
  });

  test('rejects an empty chain', () => {
    expect(TestCreateBodySchema.safeParse({ title: 'Cart', atc_ids: [] }).success).toBe(false);
  });

  test('accepts a single-ATC chain (minimum)', () => {
    expect(TestCreateBodySchema.safeParse({ title: 'Cart', atc_ids: [ATC_ID] }).success).toBe(true);
  });

  test('accepts duplicate ATC ids (sequence, not set)', () => {
    expect(TestCreateBodySchema.safeParse({ title: 'Cart', atc_ids: [ATC_ID, ATC_ID] }).success).toBe(true);
  });

  test('rejects a non-uuid ATC id', () => {
    expect(TestCreateBodySchema.safeParse({ title: 'Cart', atc_ids: ['not-a-uuid'] }).success).toBe(false);
  });

  test('accepts an omitted workspace_id', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'Cart' }).success).toBe(true);
  });

  test('accepts a uuid workspace_id', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'Cart', workspace_id: WORKSPACE_ID }).success).toBe(true);
  });

  test('rejects a non-uuid workspace_id', () => {
    expect(TestCreateBodySchema.safeParse({ ...base, title: 'Cart', workspace_id: 'not-a-uuid' }).success).toBe(false);
  });
});
