import { BugsListQuerySchema, parseBugsListParams } from '@lib/bugs/list-query';
import { describe, expect, it } from 'bun:test';

// BK-41 — query-string validation boundary cases for GET /api/v1/bugs
// (ATP-11, ATP-12, ATP-13, ATP-14).

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';

function params(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs);
}

describe('parseBugsListParams — required project_id (ATP-13)', () => {
  it('parses a minimal valid query', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID }));
    expect(parsed.project_id).toBe(PROJECT_ID);
    expect(parsed.limit).toBe(30);
    expect(parsed.module_id).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.severity).toBeUndefined();
  });

  it('ATP-13: rejects a missing project_id', () => {
    expect(() => parseBugsListParams(params({}))).toThrow();
  });

  it('rejects a non-UUID project_id', () => {
    expect(() => parseBugsListParams(params({ project_id: 'not-a-uuid' }))).toThrow();
  });
});

describe('parseBugsListParams — status filter (Decision 6, ATP-12)', () => {
  it('parses a single status value', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, status: 'open' }));
    expect(parsed.status).toEqual(['open']);
  });

  it('parses a comma-separated multi-value status filter (OR-within-field)', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, status: 'open,in_progress' }));
    expect(parsed.status).toEqual(['open', 'in_progress']);
  });

  it('ATP-12: rejects an invalid status value (hyphenated, not the wire value)', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, status: 'in-progress' }))).toThrow();
  });

  it('rejects a status value outside the enum entirely', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, status: 'archived' }))).toThrow();
  });
});

describe('parseBugsListParams — severity filter (Decision 6, ATP-11)', () => {
  it('parses a single severity value', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, severity: 'P1' }));
    expect(parsed.severity).toEqual(['P1']);
  });

  it('parses a comma-separated multi-value severity filter (OR-within-field)', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, severity: 'P1,P2' }));
    expect(parsed.severity).toEqual(['P1', 'P2']);
  });

  it('ATP-11: rejects an invalid severity value', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, severity: 'P9' }))).toThrow();
  });
});

describe('parseBugsListParams — combined status + severity (Decision 6 follow-up, AND-across-fields wiring)', () => {
  it('parses both filters together, unaffected by each other', () => {
    const parsed = parseBugsListParams(params({
      project_id: PROJECT_ID,
      status: 'open,in_progress',
      severity: 'P1,P2',
    }));
    expect(parsed.status).toEqual(['open', 'in_progress']);
    expect(parsed.severity).toEqual(['P1', 'P2']);
  });
});

describe('parseBugsListParams — module_id', () => {
  it('parses a valid module_id', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, module_id: MODULE_ID }));
    expect(parsed.module_id).toBe(MODULE_ID);
  });

  it('rejects a non-UUID module_id', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, module_id: 'not-a-uuid' }))).toThrow();
  });
});

describe('parseBugsListParams — limit boundary (ATP-14, Decision 4)', () => {
  it('defaults to 30 when omitted', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID }));
    expect(parsed.limit).toBe(30);
  });

  it('accepts the lower boundary (1)', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, limit: '1' }));
    expect(parsed.limit).toBe(1);
  });

  it('accepts the upper boundary (50)', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, limit: '50' }));
    expect(parsed.limit).toBe(50);
  });

  it('rejects a limit of 0', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, limit: '0' }))).toThrow();
  });

  it('rejects a limit above 50', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, limit: '51' }))).toThrow();
  });

  it('rejects a non-integer limit', () => {
    expect(() => parseBugsListParams(params({ project_id: PROJECT_ID, limit: '1.5' }))).toThrow();
  });
});

describe('parseBugsListParams — cursor', () => {
  it('passes an opaque cursor string through unchanged for the route to decode', () => {
    const parsed = parseBugsListParams(params({ project_id: PROJECT_ID, cursor: 'some-opaque-token' }));
    expect(parsed.cursor).toBe('some-opaque-token');
  });
});

describe('BugsListQuerySchema — safeParse surface (mirrors ActivityQuerySchema\'s own test convention)', () => {
  it('safeParse reports success for a fully valid query object', () => {
    const result = BugsListQuerySchema.safeParse({
      project_id: PROJECT_ID,
      module_id: MODULE_ID,
      status: 'open',
      severity: 'P1',
      limit: 10,
    });
    expect(result.success).toBe(true);
  });
});
