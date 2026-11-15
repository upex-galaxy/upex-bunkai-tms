import {
  BugAssignBodySchema,
  BugCorrectionBodySchema,
  BugCreateBodySchema,
  BugStandaloneCreateBodySchema,
  BugStatusTransitionBodySchema,
  isRunLinkedBugBody,
} from '@lib/bugs/validation';
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

// BK-264 (Slice 2) — POST /api/v1/bugs/{id}/assign body.
const ASSIGNEE_ID = '44444444-4444-4444-8444-444444444444';

describe('BugAssignBodySchema', () => {
  test('accepts a UUID assignee_user_id', () => {
    const result = BugAssignBodySchema.safeParse({ assignee_user_id: ASSIGNEE_ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignee_user_id).toBe(ASSIGNEE_ID);
    }
  });

  test('accepts a null assignee_user_id (unassign)', () => {
    const result = BugAssignBodySchema.safeParse({ assignee_user_id: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignee_user_id).toBeNull();
    }
  });

  test('rejects a missing assignee_user_id key', () => {
    const result = BugAssignBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('rejects a non-UUID assignee_user_id', () => {
    const result = BugAssignBodySchema.safeParse({ assignee_user_id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

// BK-264 (Slice 2) — POST /api/v1/bugs/{id}/status body.
describe('BugStatusTransitionBodySchema', () => {
  test.each(['open', 'in_progress', 'resolved', 'closed'])('accepts status %s', (status) => {
    const result = BugStatusTransitionBodySchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  test('rejects an unrecognized status value', () => {
    const result = BugStatusTransitionBodySchema.safeParse({ status: 'in-progress' });
    expect(result.success).toBe(false);
  });

  test('rejects a missing status key', () => {
    const result = BugStatusTransitionBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// BK-1835 — PATCH /api/v1/bugs/{id} body: the filing rules, unchanged.
describe('BugCorrectionBodySchema', () => {
  test('accepts a title and severity correction and trims the title', () => {
    const result = BugCorrectionBodySchema.safeParse({ expected_version: 1, title: '  Checkout button does nothing on the second click ', severity: 'P2' });
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Checkout button does nothing on the second click');
  });

  test.each([
    ['empty', ''],
    ['only whitespace', '        '],
    ['shorter than 5 after trimming', '  abcd  '],
    ['longer than 200', 'x'.repeat(201)],
  ])('refuses a title that is %s, with the filing message', (_label, title) => {
    const result = BugCorrectionBodySchema.safeParse({ expected_version: 1, title });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Title must be between 5 and 200 characters');
  });

  test.each([['exactly 5', 'abcde'], ['exactly 200', 'y'.repeat(200)]])('accepts a title of %s characters', (_label, title) => {
    expect(BugCorrectionBodySchema.safeParse({ expected_version: 1, title }).success).toBe(true);
  });

  test('refuses a severity outside P1-P4', () => {
    expect(BugCorrectionBodySchema.safeParse({ expected_version: 1, severity: 'P5' }).success).toBe(false);
  });

  test('trims the description and keeps the steps as typed', () => {
    const result = BugCorrectionBodySchema.safeParse({ expected_version: 3, description: '  rewritten  ', steps_to_reproduce: ' 1. open\n2. click twice ' });
    expect(result.data?.description).toBe('rewritten');
    expect(result.data?.steps_to_reproduce).toBe(' 1. open\n2. click twice ');
  });

  test.each([
    ['evidence_urls', ['https://example.com/a.png']],
    ['status', 'closed'],
    ['assignee_user_id', null],
    ['module_id', '11111111-1111-4111-8111-111111111111'],
  ])('refuses %s instead of silently dropping it', (key, value) => {
    expect(BugCorrectionBodySchema.safeParse({ expected_version: 1, title: 'A valid title', [key]: value }).success).toBe(false);
  });

  test('requires expected_version as a positive integer', () => {
    expect(BugCorrectionBodySchema.safeParse({ title: 'A valid title' }).success).toBe(false);
    expect(BugCorrectionBodySchema.safeParse({ expected_version: 0, title: 'A valid title' }).success).toBe(false);
    expect(BugCorrectionBodySchema.safeParse({ expected_version: 3000000000, title: 'A valid title' }).success).toBe(false);
  });

  test('requires at least one content field', () => {
    expect(BugCorrectionBodySchema.safeParse({ expected_version: 1 }).success).toBe(false);
  });
});

// BK-594 — one budget of ten for links and uploaded images (AC-02, AC-19).
describe('BugCreateBodySchema — shared evidence budget (BK-594)', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`);
  const links = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`);

  test.each([
    ['4 links + 7 uploads', 4, 7],
    ['10 links + 1 upload', 10, 1],
    ['0 links + 11 uploads', 0, 11],
  ])('refuses eleven items in mixed kinds: %s', (_label, l, u) => {
    const result = BugCreateBodySchema.safeParse(standaloneBody({ evidence_urls: links(l), evidence_attachment_ids: ids(u) }));
    expect(result.success).toBe(false);
  });

  test.each([
    ['6 links + 4 uploads', 6, 4],
    ['0 links + 10 uploads', 0, 10],
    ['10 links + 0 uploads', 10, 0],
  ])('accepts ten items in total: %s', (_label, l, u) => {
    const result = BugCreateBodySchema.safeParse(standaloneBody({ evidence_urls: links(l), evidence_attachment_ids: ids(u) }));
    expect(result.success).toBe(true);
  });

  test('refuses the same upload listed twice', () => {
    const [a] = ids(1);
    expect(BugCreateBodySchema.safeParse(standaloneBody({ evidence_attachment_ids: [a, a] })).success).toBe(false);
  });

  test('accepts an order that places every upload once inside the list', () => {
    const result = BugCreateBodySchema.safeParse(standaloneBody({ evidence_urls: links(1), evidence_attachment_ids: ids(2), evidence_order: [0, 2] }));
    expect(result.success).toBe(true);
  });

  test.each([
    ['too short', [0]],
    ['duplicate positions', [1, 1]],
    ['outside the list', [0, 3]],
  ])('refuses an invalid evidence_order: %s', (_label, order) => {
    const result = BugCreateBodySchema.safeParse(standaloneBody({ evidence_urls: links(1), evidence_attachment_ids: ids(2), evidence_order: order }));
    expect(result.success).toBe(false);
  });

  test('a run-linked body carries uploads the same way', () => {
    const result = BugCreateBodySchema.safeParse({ run_step_id: RUN_STEP_ID, title: 'A perfectly reasonable bug title', severity: 'P2', evidence_attachment_ids: ids(1) });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isRunLinkedBugBody(result.data)).toBe(true);
      expect(result.data.evidence_attachment_ids).toHaveLength(1);
    }
  });

  test('a links-only body is unchanged (AC-08)', () => {
    const result = BugCreateBodySchema.safeParse(standaloneBody({ evidence_urls: ['https://example.com/video.mp4'] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evidence_attachment_ids).toBeUndefined();
    }
  });
});
