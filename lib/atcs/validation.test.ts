import { AtcCreateBodySchema, AtcUpdateBodySchema, stepPositionsError } from '@lib/atcs/validation';
import { describe, expect, test } from 'bun:test';

describe('stepPositionsError', () => {
  test('accepts contiguous 1..N', () => {
    expect(stepPositionsError([{ position: 1 }, { position: 2 }, { position: 3 }])).toBeNull();
  });

  test('accepts strictly increasing from 1 with gaps', () => {
    expect(stepPositionsError([{ position: 1 }, { position: 2 }, { position: 5 }])).toBeNull();
  });

  test('rejects out-of-order [1,3,2] and lists the offender (N6)', () => {
    expect(stepPositionsError([{ position: 1 }, { position: 3 }, { position: 2 }])).toEqual({
      reason: 'steps_position_invalid',
      positions: [2],
    });
  });

  test('rejects not starting at 1 [2,3,4] (N7)', () => {
    expect(stepPositionsError([{ position: 2 }, { position: 3 }, { position: 4 }])).toEqual({
      reason: 'steps_position_invalid',
      positions: [2],
    });
  });

  test('rejects non-integer positions', () => {
    expect(stepPositionsError([{ position: 1.5 }])).toEqual({
      reason: 'steps_position_invalid',
      positions: [1.5],
    });
  });

  test('rejects duplicate positions (not strictly increasing)', () => {
    expect(stepPositionsError([{ position: 1 }, { position: 1 }])).toEqual({
      reason: 'steps_position_invalid',
      positions: [1],
    });
  });
});

describe('atcCreateBodySchema boundaries', () => {
  // Valid v4-shaped UUIDs (version nibble 4, variant nibble 8) — zod v4 `.uuid()`
  // is strict about both, so all-same-digit fixtures would falsely fail.
  const base = {
    module_id: '11111111-1111-4111-8111-111111111111',
    user_story_id: '22222222-2222-4222-8222-222222222222',
    acceptance_criterion_ids: ['33333333-3333-4333-8333-333333333333'],
    layer: 'UI' as const,
    steps: [{ position: 1, content: 'step' }],
  };

  test('accepts a minimal valid payload', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid' }).success).toBe(true);
  });

  test('rejects a 2-char title (B1)', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'AB' }).success).toBe(false);
  });

  test('accepts a 3-char title (lower boundary)', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'ABC' }).success).toBe(true);
  });

  test('rejects a 201-char title (upper boundary)', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'a'.repeat(201) }).success).toBe(false);
  });

  test('accepts a 200-char title', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'a'.repeat(200) }).success).toBe(true);
  });

  // BK-622 — validation must run on the TRIMMED title, matching what the
  // route persists (`body.title.trim()`). Before the fix, `.min()` ran on the
  // raw 6-char string, so this passed Zod and only failed later at the DB
  // CHECK constraint (23514), surfacing as a 500 instead of a 422.
  test('BK-622: rejects "  ab  " — 6 raw chars, but trims to 2 (below the floor)', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: '  ab  ' }).success).toBe(false);
  });

  test('BK-622: accepts "  abc  " — trims to exactly 3 — and stores it trimmed', () => {
    const parsed = AtcCreateBodySchema.safeParse({ ...base, title: '  abc  ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe('abc');
    }
  });

  test('rejects empty steps (B2)', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid', steps: [] }).success).toBe(false);
  });

  test('rejects empty acceptance_criterion_ids', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid', acceptance_criterion_ids: [] }).success).toBe(false);
  });

  test('rejects 11 tags', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  test('accepts 10 tags', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid', tags: Array.from({ length: 10 }, (_, i) => `t${i}`) }).success).toBe(true);
  });

  test('rejects an out-of-enum layer', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid', layer: 'E2E' }).success).toBe(false);
  });

  test('rejects step content over 2KB', () => {
    expect(AtcCreateBodySchema.safeParse({ ...base, title: 'Valid', steps: [{ position: 1, content: 'a'.repeat(2049) }] }).success).toBe(false);
  });
});

describe('atcUpdateBodySchema title trim (BK-622, PATCH entry point)', () => {
  const base = {
    acceptance_criterion_ids: ['33333333-3333-4333-8333-333333333333'],
    layer: 'UI' as const,
    steps: [{ position: 1, content: 'step' }],
  };

  test('rejects "  ab  " on PATCH the same as on create', () => {
    expect(AtcUpdateBodySchema.safeParse({ ...base, title: '  ab  ' }).success).toBe(false);
  });

  test('accepts "  abc  " on PATCH and trims it', () => {
    const parsed = AtcUpdateBodySchema.safeParse({ ...base, title: '  abc  ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe('abc');
    }
  });
});
