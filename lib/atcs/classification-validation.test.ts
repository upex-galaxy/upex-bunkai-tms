import { AtcSearchQuerySchema, parseAtcSearchParams } from '@lib/atcs/search-validation';
import {
  ATC_PRIORITIES,
  ATC_TECHNIQUES,
  AtcUpdateBodySchema,
  AtcWriteBodySchema,
} from '@lib/atcs/validation';
import { describe, expect, test } from 'bun:test';

// BK-399 — schema layer for the two optional ATC classification fields.
//
// Two contracts are asserted here, both ruled on before implementation:
//   * STRICT matching — only a byte-identical enum member is accepted. No case
//     folding, no trimming. This is the same strictness `layer` has carried
//     since BK-18 on the same payload, and it is why edge cases E1 (case
//     mismatch) and E2 (whitespace padding) stay Negative.
//   * OMISSION CLEARS — on the write body an explicit `null` and an omitted key
//     are equivalent, matching how `tags` already behaves under this endpoint's
//     documented PUT-style full replace. On the SEARCH query the same absence
//     means "no narrow" instead, so it stays `.optional()` with no default.

const VALID_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const VALID_AC_ID = '33333333-3333-4333-8333-333333333333';

function writeBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Login rejects a blank password',
    layer: 'UI',
    steps: [{ position: 1, content: 'Submit the form with an empty password' }],
    acceptance_criterion_ids: [VALID_AC_ID],
    ...overrides,
  };
}

describe('bK-399 — canonical value sets', () => {
  test('technique declares the five values in canonical order', () => {
    expect(ATC_TECHNIQUES).toEqual([
      'Equivalence Partitioning',
      'Boundary Value Analysis',
      'State Transition',
      'Decision Table',
      'Pairwise',
    ]);
  });

  test('priority declares the four values severity-descending, never alphabetical', () => {
    expect(ATC_PRIORITIES).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });
});

describe('bK-399 — AtcWriteBodySchema.technique', () => {
  test.each([...ATC_TECHNIQUES])('accepts the canonical value %s', (value) => {
    const parsed = AtcWriteBodySchema.parse(writeBody({ technique: value }));
    expect(parsed.technique).toBe(value);
  });

  test('rejects a value outside the set', () => {
    expect(AtcWriteBodySchema.safeParse(writeBody({ technique: 'Exploratory' })).success).toBe(false);
  });

  test('rejects a case-mismatched value (E1 — no case folding)', () => {
    expect(AtcWriteBodySchema.safeParse(writeBody({ technique: 'pairwise' })).success).toBe(false);
    expect(AtcWriteBodySchema.safeParse(writeBody({ technique: 'BOUNDARY VALUE ANALYSIS' })).success).toBe(false);
  });

  test('rejects a whitespace-padded value (E2 — no trimming)', () => {
    expect(AtcWriteBodySchema.safeParse(writeBody({ technique: ' Pairwise ' })).success).toBe(false);
  });

  test('accepts an explicit null (E3 — clearing back to unspecified)', () => {
    expect(AtcWriteBodySchema.parse(writeBody({ technique: null })).technique).toBeNull();
  });

  test('accepts omission and yields null (full replace — omission clears)', () => {
    expect(AtcWriteBodySchema.parse(writeBody()).technique).toBeNull();
  });
});

describe('bK-399 — AtcWriteBodySchema.priority', () => {
  test.each([...ATC_PRIORITIES])('accepts the canonical value %s', (value) => {
    const parsed = AtcWriteBodySchema.parse(writeBody({ priority: value }));
    expect(parsed.priority).toBe(value);
  });

  test('rejects a value outside the set', () => {
    expect(AtcWriteBodySchema.safeParse(writeBody({ priority: 'P1' })).success).toBe(false);
  });

  test('rejects a case-mismatched value (E1)', () => {
    expect(AtcWriteBodySchema.safeParse(writeBody({ priority: 'high' })).success).toBe(false);
  });

  test('rejects a whitespace-padded value (E2)', () => {
    expect(AtcWriteBodySchema.safeParse(writeBody({ priority: ' High ' })).success).toBe(false);
  });

  test('accepts an explicit null (E3)', () => {
    expect(AtcWriteBodySchema.parse(writeBody({ priority: null })).priority).toBeNull();
  });

  test('accepts omission and yields null', () => {
    expect(AtcWriteBodySchema.parse(writeBody()).priority).toBeNull();
  });
});

describe('bK-399 — AtcUpdateBodySchema inherits both fields', () => {
  test('carries a set technique and priority through the PATCH body', () => {
    const parsed = AtcUpdateBodySchema.parse(
      writeBody({ technique: 'Decision Table', priority: 'Medium' }),
    );
    expect(parsed.technique).toBe('Decision Table');
    expect(parsed.priority).toBe('Medium');
  });

  test('an omitted key clears on PATCH, exactly like tags', () => {
    const parsed = AtcUpdateBodySchema.parse(writeBody());
    expect(parsed.technique).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.tags).toEqual([]);
  });
});

describe('bK-399 — AtcSearchQuerySchema narrows', () => {
  test('accepts both narrows alongside the required query + project scope', () => {
    const parsed = AtcSearchQuerySchema.parse({
      query: 'login',
      project_id: VALID_PROJECT_ID,
      technique: 'Pairwise',
      priority: 'Critical',
    });
    expect(parsed.technique).toBe('Pairwise');
    expect(parsed.priority).toBe('Critical');
  });

  test('omission means NO narrow — undefined, never null', () => {
    const parsed = AtcSearchQuerySchema.parse({ query: 'login', project_id: VALID_PROJECT_ID });
    expect(parsed.technique).toBeUndefined();
    expect(parsed.priority).toBeUndefined();
  });

  test('rejects an out-of-set value', () => {
    expect(AtcSearchQuerySchema.safeParse({
      query: 'login',
      project_id: VALID_PROJECT_ID,
      technique: 'Exploratory',
    }).success).toBe(false);
  });

  test('rejects a case-mismatched value (same strictness as layer)', () => {
    expect(AtcSearchQuerySchema.safeParse({
      query: 'login',
      project_id: VALID_PROJECT_ID,
      priority: 'critical',
    }).success).toBe(false);
  });

  test('rejects a whitespace-padded value — no trim on this field', () => {
    expect(AtcSearchQuerySchema.safeParse({
      query: 'login',
      project_id: VALID_PROJECT_ID,
      technique: 'Pairwise ',
    }).success).toBe(false);
  });

  test('parseAtcSearchParams carries both narrows off the query string', () => {
    const params = new URLSearchParams({
      query: 'login',
      project_id: VALID_PROJECT_ID,
      technique: 'Decision Table',
      priority: 'Low',
    });
    const parsed = parseAtcSearchParams(params);
    expect(parsed.technique).toBe('Decision Table');
    expect(parsed.priority).toBe('Low');
  });

  test('parseAtcSearchParams rejects an empty value — no null sentinel on the API', () => {
    const params = new URLSearchParams({
      query: 'login',
      project_id: VALID_PROJECT_ID,
      technique: '',
    });
    expect(() => parseAtcSearchParams(params)).toThrow();
  });
});
