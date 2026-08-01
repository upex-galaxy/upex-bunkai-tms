import {
  ACTIVITY_PAGE_SIZE,
  ActivityQuerySchema,
  decodeActivityCursor,
  encodeActivityCursor,
  parseActivityParams,
} from '@lib/activity/history-validation';
import { describe, expect, test } from 'bun:test';

// BK-49 — query-string validation + the activity-domain cursor wrapper for
// GET /api/v1/activity. Pure schema / parser / codec tests covering the
// `workspace_id` UUID gate, the page-size bounds (1..50, default 30), and the
// cursor round trip through `lib/pagination/keyset-cursor.ts`. Mirrors
// `lib/runs/history-validation.test.ts`'s structure.

const VALID_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const VALID_CREATED_AT = '2026-07-29T11:52:00+00:00';
const VALID_ROW_ID = '11111111-1111-4111-8111-111111111111';
const VALID_CURSOR = encodeActivityCursor({ createdAt: VALID_CREATED_AT, id: VALID_ROW_ID });

describe('activityQuerySchema', () => {
  test('accepts an empty query and applies the default page size', () => {
    const parsed = ActivityQuerySchema.parse({});
    expect(parsed.limit).toBe(ACTIVITY_PAGE_SIZE);
    expect(parsed.workspace_id).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('the default page size is 30 (Decision 1, implementation-plan.md)', () => {
    expect(ACTIVITY_PAGE_SIZE).toBe(30);
  });

  test('accepts a valid workspace_id UUID', () => {
    expect(ActivityQuerySchema.parse({ workspace_id: VALID_WORKSPACE_ID }).workspace_id).toBe(VALID_WORKSPACE_ID);
  });

  test('rejects a non-UUID workspace_id', () => {
    expect(ActivityQuerySchema.safeParse({ workspace_id: 'not-a-uuid' }).success).toBe(false);
  });

  test('coerces a numeric-string limit', () => {
    expect(ActivityQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  test('accepts limit = 50 (upper boundary — matches the RPC clamp)', () => {
    expect(ActivityQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  test('rejects limit = 51 (over the page-size cap)', () => {
    expect(ActivityQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  test('accepts limit = 1 (lower boundary)', () => {
    expect(ActivityQuerySchema.parse({ limit: '1' }).limit).toBe(1);
  });

  test('rejects limit = 0', () => {
    expect(ActivityQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  test('rejects a negative limit', () => {
    expect(ActivityQuerySchema.safeParse({ limit: '-5' }).success).toBe(false);
  });

  test('rejects a non-integer limit', () => {
    expect(ActivityQuerySchema.safeParse({ limit: '12.5' }).success).toBe(false);
  });

  test('accepts a cursor string', () => {
    expect(ActivityQuerySchema.parse({ cursor: VALID_CURSOR }).cursor).toBe(VALID_CURSOR);
  });

  test('rejects an empty cursor', () => {
    expect(ActivityQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('parseActivityParams', () => {
  test('parses a full query string', () => {
    const params = new URLSearchParams({ workspace_id: VALID_WORKSPACE_ID, limit: '25', cursor: VALID_CURSOR });
    const parsed = parseActivityParams(params);
    expect(parsed.workspace_id).toBe(VALID_WORKSPACE_ID);
    expect(parsed.limit).toBe(25);
    expect(parsed.cursor).toBe(VALID_CURSOR);
  });

  test('applies the default page size when limit is absent', () => {
    expect(parseActivityParams(new URLSearchParams()).limit).toBe(ACTIVITY_PAGE_SIZE);
  });

  test('drops absent optional keys (no null leaking into workspace_id / cursor)', () => {
    const parsed = parseActivityParams(new URLSearchParams());
    expect(parsed.workspace_id).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('throws on an out-of-enum-range limit', () => {
    expect(() => parseActivityParams(new URLSearchParams({ limit: '500' }))).toThrow();
  });

  test('ignores an unknown extra param', () => {
    const parsed = parseActivityParams(new URLSearchParams({ limit: '10', extra: 'anything' }));
    expect(parsed.limit).toBe(10);
    expect((parsed as Record<string, unknown>).extra).toBeUndefined();
  });
});

describe('activity cursor codec (wraps lib/pagination/keyset-cursor.ts)', () => {
  test('round-trips a cursor', () => {
    const decoded = decodeActivityCursor(encodeActivityCursor({ createdAt: VALID_CREATED_AT, id: VALID_ROW_ID }));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.createdAt).toBe(VALID_CREATED_AT);
      expect(decoded.cursor.id).toBe(VALID_ROW_ID);
    }
  });

  test('encodes to an opaque token that does not expose the raw values', () => {
    expect(VALID_CURSOR).not.toContain(VALID_ROW_ID);
    expect(VALID_CURSOR).not.toContain(VALID_CREATED_AT);
  });

  test('rejects a malformed cursor', () => {
    expect(decodeActivityCursor('!!!not a cursor!!!').ok).toBe(false);
  });

  test('rejects a cursor with the halves swapped', () => {
    expect(decodeActivityCursor(btoa(`${VALID_ROW_ID}|${VALID_CREATED_AT}`)).ok).toBe(false);
  });
});
