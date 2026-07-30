import {
  decodeRunCursor,
  encodeRunCursor,
  parseRunHistoryParams,
  RUN_HISTORY_PAGE_SIZE,
  RunHistoryQuerySchema,
} from '@lib/runs/history-validation';
import { describe, expect, test } from 'bun:test';

// BK-37 — query-string validation + opaque cursor codec for
// GET /api/v1/tests/{id}/runs. Pure schema / parser / codec tests covering the
// outcome enum (incl. the deliberate exclusion of `running`), the page-size
// bounds, the cursor round trip, and every malformed-cursor path — a bad cursor
// must be rejected, never silently degraded into a full list.

const VALID_STARTED_AT = '2026-07-29T11:52:00+00:00';
const VALID_RUN_ID = '11111111-1111-4111-8111-111111111111';
const VALID_CURSOR = encodeRunCursor({ startedAt: VALID_STARTED_AT, id: VALID_RUN_ID });

describe('runHistoryQuerySchema', () => {
  test('accepts an empty query and applies the default page size', () => {
    const parsed = RunHistoryQuerySchema.parse({});
    expect(parsed.limit).toBe(RUN_HISTORY_PAGE_SIZE);
    expect(parsed.outcome).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('the default page size is the PO-confirmed 50', () => {
    expect(RUN_HISTORY_PAGE_SIZE).toBe(50);
  });

  test('accepts each terminal outcome', () => {
    for (const outcome of ['passed', 'failed', 'aborted'] as const) {
      expect(RunHistoryQuerySchema.parse({ outcome }).outcome).toBe(outcome);
    }
  });

  test('rejects outcome=running (an in-progress run is not an outcome)', () => {
    expect(RunHistoryQuerySchema.safeParse({ outcome: 'running' }).success).toBe(false);
  });

  test('rejects an out-of-enum outcome', () => {
    expect(RunHistoryQuerySchema.safeParse({ outcome: 'blocked' }).success).toBe(false);
  });

  test('coerces a numeric-string limit', () => {
    expect(RunHistoryQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  test('accepts limit = 50 (upper boundary)', () => {
    expect(RunHistoryQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  test('rejects limit = 51 (over the page-size cap)', () => {
    expect(RunHistoryQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  test('accepts limit = 1 (lower boundary)', () => {
    expect(RunHistoryQuerySchema.parse({ limit: '1' }).limit).toBe(1);
  });

  test('rejects limit = 0', () => {
    expect(RunHistoryQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  test('rejects a negative limit', () => {
    expect(RunHistoryQuerySchema.safeParse({ limit: '-5' }).success).toBe(false);
  });

  test('rejects a non-integer limit', () => {
    expect(RunHistoryQuerySchema.safeParse({ limit: '12.5' }).success).toBe(false);
  });

  test('accepts a cursor string', () => {
    expect(RunHistoryQuerySchema.parse({ cursor: VALID_CURSOR }).cursor).toBe(VALID_CURSOR);
  });

  test('rejects an empty cursor', () => {
    expect(RunHistoryQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('parseRunHistoryParams', () => {
  test('parses a full query string', () => {
    const params = new URLSearchParams({ outcome: 'failed', limit: '25', cursor: VALID_CURSOR });
    const parsed = parseRunHistoryParams(params);
    expect(parsed.outcome).toBe('failed');
    expect(parsed.limit).toBe(25);
    expect(parsed.cursor).toBe(VALID_CURSOR);
  });

  test('applies the default page size when limit is absent', () => {
    expect(parseRunHistoryParams(new URLSearchParams()).limit).toBe(RUN_HISTORY_PAGE_SIZE);
  });

  test('drops absent optional keys (no null leaking into outcome / cursor)', () => {
    const parsed = parseRunHistoryParams(new URLSearchParams());
    expect(parsed.outcome).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('throws on outcome=running (surfaces as ZodError → 422 envelope)', () => {
    expect(() => parseRunHistoryParams(new URLSearchParams({ outcome: 'running' }))).toThrow();
  });

  test('throws on an over-cap limit', () => {
    expect(() => parseRunHistoryParams(new URLSearchParams({ limit: '500' }))).toThrow();
  });

  test('ignores an unknown extra param (e.g. an injected workspace_id)', () => {
    const parsed = parseRunHistoryParams(new URLSearchParams({ outcome: 'passed', workspace_id: 'anything' }));
    expect(parsed.outcome).toBe('passed');
    expect((parsed as Record<string, unknown>).workspace_id).toBeUndefined();
  });
});

describe('run cursor codec', () => {
  test('round-trips a cursor', () => {
    const decoded = decodeRunCursor(encodeRunCursor({ startedAt: VALID_STARTED_AT, id: VALID_RUN_ID }));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.startedAt).toBe(VALID_STARTED_AT);
      expect(decoded.cursor.id).toBe(VALID_RUN_ID);
    }
  });

  test('round-trips the Z-suffixed timestamp variant', () => {
    const startedAt = '2026-07-29T11:52:00.123Z';
    const decoded = decodeRunCursor(encodeRunCursor({ startedAt, id: VALID_RUN_ID }));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.startedAt).toBe(startedAt);
    }
  });

  test('encodes to an opaque token that does not expose the raw values', () => {
    expect(VALID_CURSOR).not.toContain(VALID_RUN_ID);
    expect(VALID_CURSOR).not.toContain(VALID_STARTED_AT);
  });

  test('rejects a truncated cursor', () => {
    expect(decodeRunCursor(VALID_CURSOR.slice(0, 20)).ok).toBe(false);
  });

  test('rejects a non-base64 cursor', () => {
    expect(decodeRunCursor('!!!not base64!!!').ok).toBe(false);
  });

  test('rejects an empty cursor', () => {
    expect(decodeRunCursor('').ok).toBe(false);
  });

  test('rejects a cursor with too few fields', () => {
    expect(decodeRunCursor(btoa(VALID_STARTED_AT)).ok).toBe(false);
  });

  test('rejects a cursor with too many fields', () => {
    expect(decodeRunCursor(btoa(`${VALID_STARTED_AT}|${VALID_RUN_ID}|extra`)).ok).toBe(false);
  });

  test('rejects a cursor whose id is not a uuid', () => {
    expect(decodeRunCursor(btoa(`${VALID_STARTED_AT}|not-a-uuid`)).ok).toBe(false);
  });

  test('rejects a cursor whose timestamp is malformed', () => {
    expect(decodeRunCursor(btoa(`yesterday|${VALID_RUN_ID}`)).ok).toBe(false);
  });

  test('rejects a cursor whose timestamp is ISO-shaped but not a real instant', () => {
    expect(decodeRunCursor(btoa(`2026-13-45T99:99:99Z|${VALID_RUN_ID}`)).ok).toBe(false);
  });

  test('rejects a cursor with the halves swapped', () => {
    expect(decodeRunCursor(btoa(`${VALID_RUN_ID}|${VALID_STARTED_AT}`)).ok).toBe(false);
  });
});
