import { BugCreateBodySchema, BugStandaloneCreateBodySchema, isRunLinkedBugBody } from '@lib/bugs/validation';
import { describe, expect, test } from 'bun:test';

// Zod v4's `.uuid()` enforces RFC 4122 version/variant nibbles, so these must
// be valid-shaped (version 4, variant 8) rather than arbitrary repeated hex.
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const MODULE_ID = '22222222-2222-4222-8222-222222222222';
const RUN_STEP_ID = '33333333-3333-4333-8333-333333333333';

function standaloneBody(overrides: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT_ID,
    module_id: MODULE_ID,
    title: 'A perfectly reasonable bug title',
    severity: 'P2',
    ...overrides,
  };
}

describe('BugStandaloneCreateBodySchema — title bounds (ATP-N2)', () => {
  test('rejects a title shorter than 5 characters', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ title: 'abcd' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Title must be between 5 and 200 characters');
    }
  });

  test('rejects a title longer than 200 characters', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ title: 'a'.repeat(201) }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Title must be between 5 and 200 characters');
    }
  });

  test('accepts a title at the lower boundary (exactly 5 characters)', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ title: 'abcde' }));
    expect(result.success).toBe(true);
  });

  test('accepts a title at the upper boundary (exactly 200 characters)', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ title: 'a'.repeat(200) }));
    expect(result.success).toBe(true);
  });

  test('trims the title before measuring its length', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ title: `  ${'a'.repeat(200)}  ` }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toHaveLength(200);
    }
  });
});

describe('BugStandaloneCreateBodySchema — severity (ATP-N4)', () => {
  test('rejects a severity outside P1-P4', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ severity: 'P5' }));
    expect(result.success).toBe(false);
  });

  test('rejects a missing severity', () => {
    const body = standaloneBody();
    delete (body as Record<string, unknown>).severity;
    const result = BugStandaloneCreateBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test.each(['P1', 'P2', 'P3', 'P4'])('accepts severity %s', (severity) => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ severity }));
    expect(result.success).toBe(true);
  });
});

describe('BugStandaloneCreateBodySchema — evidence link limit (ATP-B1)', () => {
  test('accepts exactly 10 evidence links', () => {
    const evidence_urls = Array.from({ length: 10 }, (_, i) => `https://example.com/evidence-${i}.png`);
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ evidence_urls }));
    expect(result.success).toBe(true);
  });

  test('rejects an 11th evidence link', () => {
    const evidence_urls = Array.from({ length: 11 }, (_, i) => `https://example.com/evidence-${i}.png`);
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody({ evidence_urls }));
    expect(result.success).toBe(false);
  });

  test('rejects a non-URL evidence entry', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(
      standaloneBody({ evidence_urls: ['not-a-url'] }),
    );
    expect(result.success).toBe(false);
  });

  test('an absent evidence_urls list is allowed (defaults applied at the RPC)', () => {
    const result = BugStandaloneCreateBodySchema.safeParse(standaloneBody());
    expect(result.success).toBe(true);
  });
});

describe('BugCreateBodySchema — variant discrimination', () => {
  test('a standalone body (project_id + module_id, no run_step_id) parses as standalone', () => {
    const result = BugCreateBodySchema.safeParse(standaloneBody());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isRunLinkedBugBody(result.data)).toBe(false);
    }
  });

  test('a run-linked body (run_step_id only) parses as run-linked', () => {
    const result = BugCreateBodySchema.safeParse({
      run_step_id: RUN_STEP_ID,
      title: 'A perfectly reasonable bug title',
      severity: 'P1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isRunLinkedBugBody(result.data)).toBe(true);
    }
  });

  test('a body with neither run_step_id nor project_id/module_id is rejected', () => {
    const result = BugCreateBodySchema.safeParse({
      title: 'A perfectly reasonable bug title',
      severity: 'P1',
    });
    expect(result.success).toBe(false);
  });
});
