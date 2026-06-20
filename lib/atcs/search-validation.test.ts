import { AtcSearchQuerySchema, parseAtcSearchParams } from '@lib/atcs/search-validation';
import { describe, expect, test } from 'bun:test';

// BK-20 — query-string validation for GET /api/v1/atcs/search. Pure schema +
// param-parser tests covering AC5 (empty query rejected), the required project
// scope (product decision), SG2/SG3 (limit default 20, cap 50, <1 rejected),
// SG4 (layer enum), and the valid combos.

const VALID_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const VALID_MODULE_ID = '11111111-1111-4111-8111-111111111111';

describe('atcSearchQuerySchema', () => {
  test('accepts a minimal valid query with the default limit', () => {
    const parsed = AtcSearchQuerySchema.parse({ query: 'login', project_id: VALID_PROJECT_ID });
    expect(parsed.query).toBe('login');
    expect(parsed.project_id).toBe(VALID_PROJECT_ID);
    expect(parsed.limit).toBe(20);
    expect(parsed.module_id).toBeUndefined();
    expect(parsed.layer).toBeUndefined();
  });

  test('trims the query (AC5 — whitespace padding allowed, content required)', () => {
    expect(AtcSearchQuerySchema.parse({ query: '  login  ', project_id: VALID_PROJECT_ID }).query).toBe('login');
  });

  test('rejects an empty query (AC5)', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: '', project_id: VALID_PROJECT_ID }).success).toBe(false);
  });

  test('rejects a whitespace-only query (AC5)', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: '   ', project_id: VALID_PROJECT_ID }).success).toBe(false);
  });

  test('rejects an absent query', () => {
    expect(AtcSearchQuerySchema.safeParse({ project_id: VALID_PROJECT_ID }).success).toBe(false);
  });

  test('rejects an absent project_id (project scope is required)', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'login' }).success).toBe(false);
  });

  test('rejects a malformed project_id', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'login', project_id: 'not-a-uuid' }).success).toBe(false);
  });

  test('accepts a valid project_id uuid', () => {
    expect(AtcSearchQuerySchema.parse({ query: 'login', project_id: VALID_PROJECT_ID }).project_id).toBe(VALID_PROJECT_ID);
  });

  test('coerces a numeric-string limit (SG2)', () => {
    expect(AtcSearchQuerySchema.parse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '5' }).limit).toBe(5);
  });

  test('accepts limit = 50 (upper boundary, SG3)', () => {
    expect(AtcSearchQuerySchema.parse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '50' }).limit).toBe(50);
  });

  test('rejects limit = 51 (over cap, SG3)', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '51' }).success).toBe(false);
  });

  test('accepts limit = 1 (lower boundary)', () => {
    expect(AtcSearchQuerySchema.parse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '1' }).limit).toBe(1);
  });

  test('rejects limit = 0', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '0' }).success).toBe(false);
  });

  test('rejects a negative limit', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '-3' }).success).toBe(false);
  });

  test('rejects a non-integer limit', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'x', project_id: VALID_PROJECT_ID, limit: '2.5' }).success).toBe(false);
  });

  test('accepts each valid layer (SG4)', () => {
    for (const layer of ['UI', 'API', 'Unit'] as const) {
      expect(AtcSearchQuerySchema.parse({ query: 'x', project_id: VALID_PROJECT_ID, layer }).layer).toBe(layer);
    }
  });

  test('rejects an out-of-enum layer (SG4)', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'x', project_id: VALID_PROJECT_ID, layer: 'E2E' }).success).toBe(false);
  });

  test('accepts a valid module_id uuid (AC3)', () => {
    expect(AtcSearchQuerySchema.parse({ query: 'x', project_id: VALID_PROJECT_ID, module_id: VALID_MODULE_ID }).module_id).toBe(VALID_MODULE_ID);
  });

  test('rejects a malformed module_id', () => {
    expect(AtcSearchQuerySchema.safeParse({ query: 'x', project_id: VALID_PROJECT_ID, module_id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('parseAtcSearchParams', () => {
  test('parses a full query string with all params', () => {
    const params = new URLSearchParams({
      query: 'checkout flow',
      project_id: VALID_PROJECT_ID,
      module_id: VALID_MODULE_ID,
      layer: 'API',
      limit: '10',
    });
    const parsed = parseAtcSearchParams(params);
    expect(parsed.query).toBe('checkout flow');
    expect(parsed.project_id).toBe(VALID_PROJECT_ID);
    expect(parsed.module_id).toBe(VALID_MODULE_ID);
    expect(parsed.layer).toBe('API');
    expect(parsed.limit).toBe(10);
  });

  test('applies the default limit when limit is absent', () => {
    expect(parseAtcSearchParams(new URLSearchParams({ query: 'x', project_id: VALID_PROJECT_ID })).limit).toBe(20);
  });

  test('drops absent optional keys (no null leaking into module_id)', () => {
    expect(parseAtcSearchParams(new URLSearchParams({ query: 'x', project_id: VALID_PROJECT_ID })).module_id).toBeUndefined();
  });

  test('throws on an empty query (AC5 — surfaces as ZodError → 422 envelope)', () => {
    expect(() => parseAtcSearchParams(new URLSearchParams({ query: '', project_id: VALID_PROJECT_ID }))).toThrow();
  });

  test('throws on a missing project_id (required scope → 422 envelope)', () => {
    expect(() => parseAtcSearchParams(new URLSearchParams({ query: 'x' }))).toThrow();
  });

  test('ignores an unknown extra param (e.g. an injected workspace_id, S6.2)', () => {
    const params = new URLSearchParams({ query: 'x', project_id: VALID_PROJECT_ID, workspace_id: 'anything' });
    const parsed = parseAtcSearchParams(params);
    expect(parsed.query).toBe('x');
    expect((parsed as Record<string, unknown>).workspace_id).toBeUndefined();
  });
});
