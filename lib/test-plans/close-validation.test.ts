import {
  normalizePlanSummary,
  PLAN_SUMMARY_LENGTH_MESSAGE,
  PLAN_SUMMARY_MAX,
  PLAN_VERDICT_INVALID_MESSAGE,
  PLAN_VERDICT_REQUIRED_MESSAGE,
  planSummaryLength,
  TestPlanCloseBodySchema,
} from '@lib/test-plans/close-validation';
import { describe, expect, test } from 'bun:test';

// BK-207 — pure unit tests for the close body rules. They prove the SHAPE rules only;
// the real write path (and the SQLSTATE contract) is exercised against the live
// database in `plan-close-isolation.test.ts`.

describe('planSummaryLength on the trimmed summary (the dialog counter)', () => {
  test('4000 characters plus a trailing newline is within the bound', () => {
    const typed = `${'a'.repeat(PLAN_SUMMARY_MAX)}\n`;
    expect(planSummaryLength(typed)).toBe(PLAN_SUMMARY_MAX + 1);
    expect(planSummaryLength(normalizePlanSummary(typed) ?? '')).toBe(PLAN_SUMMARY_MAX);
    expect(TestPlanCloseBodySchema.safeParse({ verdict: 'passed', summary: typed }).success).toBe(true);
  });

  test('whitespace-only counts as zero', () => {
    expect(planSummaryLength(normalizePlanSummary('  \n\t ') ?? '')).toBe(0);
  });
});

describe('normalizePlanSummary', () => {
  test('trims the edges and keeps inner whitespace untouched', () => {
    expect(normalizePlanSummary('  one known flaky test,\n accepted  ')).toBe('one known flaky test,\n accepted');
  });

  test.each([undefined, null, '', '   ', '\t\n\r', '\u00A0', ' \u00A0\t\n '])('treats %p as no summary', (blank) => {
    expect(normalizePlanSummary(blank)).toBeNull();
  });

  // The RPC trims [\t\n\v\f\r NBSP] only, so another Unicode space is content.
  test('does not trim Unicode spaces the database keeps (EM SPACE)', () => {
    expect(normalizePlanSummary(' kept ')).toBe(' kept ');
  });
});

describe('planSummaryLength', () => {
  test('counts characters, not UTF-16 units', () => {
    expect(planSummaryLength('🙂'.repeat(3))).toBe(3);
  });
});

describe('TestPlanCloseBodySchema', () => {
  test('accepts a verdict with a summary and normalizes the summary', () => {
    expect(TestPlanCloseBodySchema.parse({ verdict: 'passed', summary: '  ok  ' })).toEqual({ verdict: 'passed', summary: 'ok' });
  });

  test('accepts the failed verdict', () => {
    expect(TestPlanCloseBodySchema.parse({ verdict: 'failed' })).toEqual({ verdict: 'failed', summary: null });
  });

  test.each([undefined, null, '', '   '])('stores %p as no summary and still closes', (summary) => {
    expect(TestPlanCloseBodySchema.parse({ verdict: 'passed', summary })).toEqual({ verdict: 'passed', summary: null });
  });

  test('accepts exactly 4000 characters and rejects 4001', () => {
    expect(TestPlanCloseBodySchema.safeParse({ verdict: 'passed', summary: 'x'.repeat(PLAN_SUMMARY_MAX) }).success).toBe(true);
    const tooLong = TestPlanCloseBodySchema.safeParse({ verdict: 'passed', summary: 'x'.repeat(PLAN_SUMMARY_MAX + 1) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0].message).toBe(PLAN_SUMMARY_LENGTH_MESSAGE);
  });

  test('applies the bound after trimming and counts emoji as one character', () => {
    expect(TestPlanCloseBodySchema.safeParse({ verdict: 'passed', summary: ` ${'x'.repeat(PLAN_SUMMARY_MAX)} ` }).success).toBe(true);
    expect(TestPlanCloseBodySchema.safeParse({ verdict: 'passed', summary: '🙂'.repeat(PLAN_SUMMARY_MAX) }).success).toBe(true);
  });

  test.each([{}, { verdict: null }, { verdict: '' }, { verdict: '   ' }])('a missing verdict (%p) is the required-verdict error', (body) => {
    const result = TestPlanCloseBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(PLAN_VERDICT_REQUIRED_MESSAGE);
  });

  test.each(['flaky', 'PASSED', 'pass', 'blocked'])('a verdict outside {passed, failed} (%p) is the invalid-verdict error', (verdict) => {
    const result = TestPlanCloseBodySchema.safeParse({ verdict });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(PLAN_VERDICT_INVALID_MESSAGE);
  });

  test('a summary alone never satisfies the verdict', () => {
    expect(TestPlanCloseBodySchema.safeParse({ summary: 'a good summary' }).success).toBe(false);
  });
});
