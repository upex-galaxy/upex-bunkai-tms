import {
  RUN_START_TOKEN_MAX,
  RUN_STEP_EVIDENCE_URL_MAX,
  RUN_STEP_NOTE_MAX,
  RunCreateBodySchema,
  RunStepMarkBodySchema,
} from '@lib/runs/validation';
import { describe, expect, test } from 'bun:test';

// BK-34 — body validation for POST /api/v1/runs. Pure schema tests: the Zod
// layer mirrors the bunkai_create_run SHAPE rules (test_id + environment_id are
// uuids, executor_mode is an allowed enum, start_token is a bounded non-empty
// string) so malformed bodies fail fast as 422 before any DB round-trip; the RPC
// stays the enforcement point of record for env containment + the steps gate +
// the 24h window.

const VALID_TEST_ID = '11111111-1111-4111-8111-111111111111';
const VALID_ENV_ID = '22222222-2222-4222-8222-222222222222';

describe('runCreateBodySchema', () => {
  test('accepts the minimal valid body (test_id + environment_id)', () => {
    const parsed = RunCreateBodySchema.parse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID });
    expect(parsed.test_id).toBe(VALID_TEST_ID);
    expect(parsed.environment_id).toBe(VALID_ENV_ID);
    expect(parsed.executor_mode).toBeUndefined();
    expect(parsed.start_token).toBeUndefined();
  });

  test('accepts each allowed executor_mode', () => {
    for (const mode of ['human', 'agent', 'ci'] as const) {
      const parsed = RunCreateBodySchema.parse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID, executor_mode: mode });
      expect(parsed.executor_mode).toBe(mode);
    }
  });

  test('rejects an out-of-enum executor_mode', () => {
    expect(RunCreateBodySchema.safeParse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID, executor_mode: 'robot' }).success).toBe(false);
  });

  test('rejects a non-uuid test_id', () => {
    expect(RunCreateBodySchema.safeParse({ test_id: 'not-a-uuid', environment_id: VALID_ENV_ID }).success).toBe(false);
  });

  test('rejects a non-uuid environment_id', () => {
    expect(RunCreateBodySchema.safeParse({ test_id: VALID_TEST_ID, environment_id: 'nope' }).success).toBe(false);
  });

  test('rejects an absent test_id', () => {
    expect(RunCreateBodySchema.safeParse({ environment_id: VALID_ENV_ID }).success).toBe(false);
  });

  test('rejects an absent environment_id', () => {
    expect(RunCreateBodySchema.safeParse({ test_id: VALID_TEST_ID }).success).toBe(false);
  });

  test('accepts a start_token and trims it', () => {
    const parsed = RunCreateBodySchema.parse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID, start_token: '  tok-123  ' });
    expect(parsed.start_token).toBe('tok-123');
  });

  test('rejects an empty / whitespace-only start_token', () => {
    expect(RunCreateBodySchema.safeParse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID, start_token: '' }).success).toBe(false);
    expect(RunCreateBodySchema.safeParse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID, start_token: '   ' }).success).toBe(false);
  });

  test('rejects a start_token over the length cap', () => {
    const tooLong = 'x'.repeat(RUN_START_TOKEN_MAX + 1);
    expect(RunCreateBodySchema.safeParse({ test_id: VALID_TEST_ID, environment_id: VALID_ENV_ID, start_token: tooLong }).success).toBe(false);
  });
});

// BK-35 — mark-step body validation. Pure schema tests: the Zod layer mirrors
// the bunkai_mark_run_step backstop (status is passed/failed/blocked only —
// 'pending' is never accepted) and pre-normalizes empty/whitespace note/
// evidence_url to null (Q8) so `.url()` never rejects an empty string. The RPC
// stays the enforcement point of record (mark-step.test.ts covers it).
describe('runStepMarkBodySchema', () => {
  test('accepts the minimal valid body (status only)', () => {
    const parsed = RunStepMarkBodySchema.parse({ status: 'passed' });
    expect(parsed.status).toBe('passed');
    expect(parsed.note).toBeUndefined();
    expect(parsed.evidence_url).toBeUndefined();
  });

  test('accepts each allowed status', () => {
    for (const status of ['passed', 'failed', 'blocked'] as const) {
      expect(RunStepMarkBodySchema.parse({ status }).status).toBe(status);
    }
  });

  test('rejects a re-mark-to-pending attempt', () => {
    expect(RunStepMarkBodySchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  test('rejects any other out-of-enum status value', () => {
    expect(RunStepMarkBodySchema.safeParse({ status: 'skipped' }).success).toBe(false);
    expect(RunStepMarkBodySchema.safeParse({ status: 'robot' }).success).toBe(false);
  });

  test('rejects an absent status', () => {
    expect(RunStepMarkBodySchema.safeParse({}).success).toBe(false);
  });

  test('accepts a note and trims it', () => {
    const parsed = RunStepMarkBodySchema.parse({ status: 'passed', note: '  looks good  ' });
    expect(parsed.note).toBe('looks good');
  });

  test('Q8 — empty-string and whitespace-only note normalize to null (never rejected)', () => {
    expect(RunStepMarkBodySchema.parse({ status: 'passed', note: '' }).note).toBeNull();
    expect(RunStepMarkBodySchema.parse({ status: 'passed', note: '   ' }).note).toBeNull();
  });

  test('accepts a note at exactly the length cap, rejects one over it', () => {
    const atMax = 'x'.repeat(RUN_STEP_NOTE_MAX);
    expect(RunStepMarkBodySchema.safeParse({ status: 'passed', note: atMax }).success).toBe(true);
    const tooLong = 'x'.repeat(RUN_STEP_NOTE_MAX + 1);
    expect(RunStepMarkBodySchema.safeParse({ status: 'passed', note: tooLong }).success).toBe(false);
  });

  test('accepts a valid evidence_url', () => {
    const parsed = RunStepMarkBodySchema.parse({ status: 'passed', evidence_url: 'https://s3.example.com/evidence/shot.png' });
    expect(parsed.evidence_url).toBe('https://s3.example.com/evidence/shot.png');
  });

  test('Q8 — empty-string and whitespace-only evidence_url normalize to null (never rejected)', () => {
    expect(RunStepMarkBodySchema.parse({ status: 'passed', evidence_url: '' }).evidence_url).toBeNull();
    expect(RunStepMarkBodySchema.parse({ status: 'passed', evidence_url: '   ' }).evidence_url).toBeNull();
  });

  test('ATP — rejects a malformed (non-URL) evidence_url', () => {
    expect(RunStepMarkBodySchema.safeParse({ status: 'passed', evidence_url: 'not-a-url' }).success).toBe(false);
  });

  // BK-466 — this schema is the enforcement point of record for a direct
  // bearer-token (`run:execute`) caller of POST .../mark, which never goes
  // through RunnerView.tsx or lib/runs/mark-step-view.ts's client-side
  // check. `javascript:`/`data:` both parse fine as a bare `new URL(...)`
  // (the old `.url()` check, no protocol restriction, let them through); the
  // scheme allowlist below must reject them here, at the API edge, since the
  // RPC itself (0042_run_step_mark.sql) only trims/normalizes and never
  // checks scheme.
  test('BK-466 — rejects a javascript: evidence_url', () => {
    expect(RunStepMarkBodySchema.safeParse({ status: 'passed', evidence_url: 'javascript:alert(1)' }).success).toBe(false);
  });

  test('BK-466 — rejects a data: evidence_url', () => {
    expect(RunStepMarkBodySchema.safeParse({ status: 'passed', evidence_url: 'data:text/html,<script>alert(1)</script>' }).success).toBe(false);
  });

  test('rejects an evidence_url over the length cap', () => {
    const tooLong = `https://example.com/${'x'.repeat(RUN_STEP_EVIDENCE_URL_MAX)}`;
    expect(RunStepMarkBodySchema.safeParse({ status: 'passed', evidence_url: tooLong }).success).toBe(false);
  });

  test('accepts an explicit null for note/evidence_url', () => {
    const parsed = RunStepMarkBodySchema.parse({ status: 'passed', note: null, evidence_url: null });
    expect(parsed.note).toBeNull();
    expect(parsed.evidence_url).toBeNull();
  });
});
