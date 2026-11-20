import {
  decodeRunCursor,
  encodeRunCursor,
  parseReportParams,
  REPORT_PAGE_SIZE,
  ReportQuerySchema,
} from '@lib/runs/report-validation';
import { describe, expect, test } from 'bun:test';

// BK-38 — query-string validation for GET /api/v1/projects/{id}/runs/report.
// Pure schema / parser tests covering the date-range boundary rejection, the
// two repeatable enum filters (incl. the deliberate exclusion of `running`
// from `status`), the page-size bounds, and the round trip of a cursor minted
// by the UNMODIFIED codec this module re-exports from `history-validation.ts`
// (BK-37) — no second cursor codec is introduced here.

const VALID_STARTED_AT = '2026-07-29T11:52:00+00:00';
const VALID_RUN_ID = '11111111-1111-4111-8111-111111111111';
const VALID_MODULE_ID = '22222222-2222-4222-8222-222222222222';
const VALID_CURSOR = encodeRunCursor({ startedAt: VALID_STARTED_AT, id: VALID_RUN_ID });

describe('reportQuerySchema', () => {
  test('accepts an empty query and applies the default page size', () => {
    const parsed = ReportQuerySchema.parse({});
    expect(parsed.limit).toBe(REPORT_PAGE_SIZE);
    expect(parsed.date_from).toBeUndefined();
    expect(parsed.date_to).toBeUndefined();
    expect(parsed.module_id).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.executor).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('the default page size is 50', () => {
    expect(REPORT_PAGE_SIZE).toBe(50);
  });

  test('accepts a valid full query', () => {
    const parsed = ReportQuerySchema.parse({
      date_from: '2026-07-01',
      date_to: '2026-07-31',
      module_id: VALID_MODULE_ID,
      status: ['passed', 'failed'],
      executor: ['human', 'agent'],
      limit: '25',
      cursor: VALID_CURSOR,
    });
    expect(parsed.date_from).toBe('2026-07-01');
    expect(parsed.date_to).toBe('2026-07-31');
    expect(parsed.module_id).toBe(VALID_MODULE_ID);
    expect(parsed.status).toEqual(['passed', 'failed']);
    expect(parsed.executor).toEqual(['human', 'agent']);
    expect(parsed.limit).toBe(25);
    expect(parsed.cursor).toBe(VALID_CURSOR);
  });

  test('accepts date_from and date_to on the same day (a single-day range)', () => {
    const parsed = ReportQuerySchema.parse({ date_from: '2026-07-15', date_to: '2026-07-15' });
    expect(parsed.date_from).toBe('2026-07-15');
    expect(parsed.date_to).toBe('2026-07-15');
  });

  test('accepts date_from alone', () => {
    expect(ReportQuerySchema.safeParse({ date_from: '2026-07-01' }).success).toBe(true);
  });

  test('accepts date_to alone', () => {
    expect(ReportQuerySchema.safeParse({ date_to: '2026-07-31' }).success).toBe(true);
  });

  test('rejects date_to earlier than date_from', () => {
    const result = ReportQuerySchema.safeParse({ date_from: '2026-07-31', date_to: '2026-07-01' });
    expect(result.success).toBe(false);
  });

  test('rejects a malformed date_from (not YYYY-MM-DD)', () => {
    expect(ReportQuerySchema.safeParse({ date_from: '07/01/2026' }).success).toBe(false);
  });

  test('rejects a malformed date_to (not YYYY-MM-DD)', () => {
    expect(ReportQuerySchema.safeParse({ date_to: '2026-7-31' }).success).toBe(false);
  });

  // BK-1990 — right shape, impossible date: rejected here (422 at the route)
  // instead of reaching the RPC's ::date cast as a 500 with database text.
  for (const field of ['date_from', 'date_to'] as const) {
    for (const value of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-02-29', '2026-04-31', '2026-06-00', '0000-01-01']) {
      test(`rejects ${field}=${value} as an impossible calendar date, naming the field`, () => {
        const result = ReportQuerySchema.safeParse({ [field]: value });
        expect(result.success).toBe(false);
        expect(result.error?.issues).toHaveLength(1);
        expect(result.error?.issues[0].path).toEqual([field]);
        expect(result.error?.issues[0].message).toBe(`${field} must be a valid calendar date.`);
      });
    }
  }

  test('accepts real leap days and month ends', () => {
    for (const value of ['2028-02-29', '2000-02-29', '2026-02-28', '2026-01-31', '2026-04-30', '2026-12-31', '0001-01-01']) {
      expect(ReportQuerySchema.safeParse({ date_from: value, date_to: value }).success).toBe(true);
    }
    expect(ReportQuerySchema.safeParse({ date_from: '1900-02-29' }).success).toBe(false);
  });

  test('a wrong shape reports only the format issue, as before', () => {
    const result = ReportQuerySchema.safeParse({ date_from: '18-11-2026' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.message)).toEqual(['date_from must be in YYYY-MM-DD format.']);
  });

  test('parseReportParams throws the same ZodError shape for an impossible date in the query string', () => {
    expect(() => parseReportParams(new URLSearchParams('date_to=2026-13-45'))).toThrow('date_to must be a valid calendar date.');
  });

  test('rejects a non-uuid module_id', () => {
    expect(ReportQuerySchema.safeParse({ module_id: 'not-a-uuid' }).success).toBe(false);
  });

  test('accepts each status value', () => {
    for (const status of ['passed', 'failed', 'aborted'] as const) {
      expect(ReportQuerySchema.parse({ status: [status] }).status).toEqual([status]);
    }
  });

  test('rejects status=running (an in-progress Run is not a filter target)', () => {
    expect(ReportQuerySchema.safeParse({ status: ['running'] }).success).toBe(false);
  });

  test('rejects an out-of-enum status', () => {
    expect(ReportQuerySchema.safeParse({ status: ['blocked'] }).success).toBe(false);
  });

  test('rejects a status array with one valid and one invalid value', () => {
    expect(ReportQuerySchema.safeParse({ status: ['passed', 'running'] }).success).toBe(false);
  });

  test('accepts each executor value', () => {
    for (const executor of ['human', 'agent', 'ci'] as const) {
      expect(ReportQuerySchema.parse({ executor: [executor] }).executor).toEqual([executor]);
    }
  });

  test('rejects an out-of-enum executor', () => {
    expect(ReportQuerySchema.safeParse({ executor: ['robot'] }).success).toBe(false);
  });

  test('coerces a numeric-string limit', () => {
    expect(ReportQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  test('accepts limit = 50 (upper boundary)', () => {
    expect(ReportQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  test('rejects limit = 51 (over the page-size cap)', () => {
    expect(ReportQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  test('accepts limit = 1 (lower boundary)', () => {
    expect(ReportQuerySchema.parse({ limit: '1' }).limit).toBe(1);
  });

  test('rejects limit = 0', () => {
    expect(ReportQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  test('rejects a negative limit', () => {
    expect(ReportQuerySchema.safeParse({ limit: '-5' }).success).toBe(false);
  });

  test('rejects a non-integer limit', () => {
    expect(ReportQuerySchema.safeParse({ limit: '12.5' }).success).toBe(false);
  });

  test('accepts a cursor string', () => {
    expect(ReportQuerySchema.parse({ cursor: VALID_CURSOR }).cursor).toBe(VALID_CURSOR);
  });

  test('rejects an empty cursor', () => {
    expect(ReportQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('parseReportParams', () => {
  test('parses a full query string, including repeated status/executor keys', () => {
    const params = new URLSearchParams();
    params.set('date_from', '2026-07-01');
    params.set('date_to', '2026-07-31');
    params.set('module_id', VALID_MODULE_ID);
    params.append('status', 'passed');
    params.append('status', 'failed');
    params.append('executor', 'human');
    params.set('limit', '10');
    params.set('cursor', VALID_CURSOR);

    const parsed = parseReportParams(params);
    expect(parsed.date_from).toBe('2026-07-01');
    expect(parsed.date_to).toBe('2026-07-31');
    expect(parsed.module_id).toBe(VALID_MODULE_ID);
    expect(parsed.status).toEqual(['passed', 'failed']);
    expect(parsed.executor).toEqual(['human']);
    expect(parsed.limit).toBe(10);
    expect(parsed.cursor).toBe(VALID_CURSOR);
  });

  test('applies the default page size when limit is absent', () => {
    expect(parseReportParams(new URLSearchParams()).limit).toBe(REPORT_PAGE_SIZE);
  });

  test('drops absent optional keys instead of leaking null', () => {
    const parsed = parseReportParams(new URLSearchParams());
    expect(parsed.date_from).toBeUndefined();
    expect(parsed.date_to).toBeUndefined();
    expect(parsed.module_id).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.executor).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('omits status/executor entirely when no repeated key was sent (not an empty array)', () => {
    // An empty array would mean "match nothing"; an absent filter must mean
    // "match everything" — the two are not the same query.
    const parsed = parseReportParams(new URLSearchParams('date_from=2026-07-01'));
    expect('status' in parsed).toBe(false);
    expect('executor' in parsed).toBe(false);
  });

  test('throws on status=running (surfaces as ZodError -> 422 envelope)', () => {
    expect(() => parseReportParams(new URLSearchParams('status=running'))).toThrow();
  });

  test('throws when date_to is before date_from', () => {
    const params = new URLSearchParams({ date_from: '2026-07-31', date_to: '2026-07-01' });
    expect(() => parseReportParams(params)).toThrow();
  });

  test('throws on an over-cap limit', () => {
    expect(() => parseReportParams(new URLSearchParams({ limit: '500' }))).toThrow();
  });

  test('ignores an unknown extra param (e.g. an injected workspace_id)', () => {
    const parsed = parseReportParams(new URLSearchParams({ module_id: VALID_MODULE_ID, workspace_id: 'anything' }));
    expect(parsed.module_id).toBe(VALID_MODULE_ID);
    expect((parsed as Record<string, unknown>).workspace_id).toBeUndefined();
  });
});

describe('cursor codec reuse (BK-37, unmodified)', () => {
  test('round-trips a cursor accepted by this module\'s own parser', () => {
    const parsed = parseReportParams(new URLSearchParams({ cursor: VALID_CURSOR }));
    const decoded = decodeRunCursor(parsed.cursor!);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.startedAt).toBe(VALID_STARTED_AT);
      expect(decoded.cursor.id).toBe(VALID_RUN_ID);
    }
  });

  test('re-exports the identical functions history-validation.ts defines (no fork)', async () => {
    const historyValidation = await import('@lib/runs/history-validation');
    expect(encodeRunCursor).toBe(historyValidation.encodeRunCursor);
    expect(decodeRunCursor).toBe(historyValidation.decodeRunCursor);
  });
});

describe('branch (BK-228)', () => {
  test('keeps a branch with a slash exactly as sent', () => {
    const params = new URLSearchParams();
    params.set('branch', 'feature/checkout-discounts');
    expect(parseReportParams(new URLSearchParams(params.toString())).branch).toBe('feature/checkout-discounts');
  });

  test('keeps the case of the branch', () => {
    expect(parseReportParams(new URLSearchParams('branch=Main')).branch).toBe('Main');
  });

  test('is absent when not sent', () => {
    expect(parseReportParams(new URLSearchParams('')).branch).toBeUndefined();
  });

  test('accepts 255 characters and rejects 256', () => {
    expect(parseReportParams(new URLSearchParams(`branch=${'a'.repeat(255)}`)).branch).toHaveLength(255);
    expect(() => parseReportParams(new URLSearchParams(`branch=${'a'.repeat(256)}`))).toThrow();
  });

  test('rejects an empty branch', () => {
    expect(() => parseReportParams(new URLSearchParams('branch='))).toThrow();
  });
});
