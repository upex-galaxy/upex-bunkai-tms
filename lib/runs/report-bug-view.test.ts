import { BugRunLinkedCreateBodySchema } from '@lib/bugs/validation';
import { buildReportBugPrefill, shouldShowReportBugButton } from '@lib/runs/report-bug-view';
import { describe, expect, test } from 'bun:test';

// BK-40 Slice 2 — Report-bug view-state: per-step button visibility (ATP-N1)
// and the run-linked dialog's prefill derivation (ATP-P1). Mirrors
// lib/runs/mark-step-view.test.ts's structure — one describe per export.

describe('shouldShowReportBugButton', () => {
  test('ATP-N1 — a member+ caller sees the button only on a failed step', () => {
    expect(shouldShowReportBugButton({ canReportBug: true, stepStatus: 'failed' })).toBe(true);
  });

  test('ATP-N1 — a member+ caller sees no button on any non-failed step status', () => {
    expect(shouldShowReportBugButton({ canReportBug: true, stepStatus: 'pending' })).toBe(false);
    expect(shouldShowReportBugButton({ canReportBug: true, stepStatus: 'passed' })).toBe(false);
    expect(shouldShowReportBugButton({ canReportBug: true, stepStatus: 'blocked' })).toBe(false);
    expect(shouldShowReportBugButton({ canReportBug: true, stepStatus: 'skipped' })).toBe(false);
  });

  test('a non-member+/viewer caller sees no button regardless of step status', () => {
    expect(shouldShowReportBugButton({ canReportBug: false, stepStatus: 'failed' })).toBe(false);
  });
});

describe('buildReportBugPrefill', () => {
  test('ATP-P1 — derives a title stub from the ATC title, defaults P3, and carries the step content through as reproduction text', () => {
    const prefill = buildReportBugPrefill({
      atcTitle: 'Tokenize card with retry after gateway 5xx',
      stepContent: 'Submit payment with an expired card',
      stepEvidenceUrl: null,
    });
    expect(prefill.title).toBe('Tokenize card with retry after gateway 5xx failed');
    expect(prefill.severity).toBe('P3');
    expect(prefill.stepsToReproduce).toBe('Submit payment with an expired card');
    expect(prefill.evidenceUrls).toEqual([]);
  });

  test('seeds the step\'s own captured evidence link as the first evidence row when present', () => {
    const prefill = buildReportBugPrefill({
      atcTitle: 'Log in with valid credentials',
      stepContent: 'Enter credentials and submit',
      stepEvidenceUrl: 'https://example.com/screenshot.png',
    });
    expect(prefill.evidenceUrls).toEqual(['https://example.com/screenshot.png']);
  });

  test('truncates a stub over BUG_TITLE_MAX rather than sending an unfileable title', () => {
    const longAtcTitle = 'A'.repeat(250);
    const prefill = buildReportBugPrefill({
      atcTitle: longAtcTitle,
      stepContent: 'step content',
      stepEvidenceUrl: null,
    });
    expect(prefill.title.length).toBe(200);
  });

  test('the " failed" suffix alone clears BUG_TITLE_MIN even for a blank ATC title (never happens in practice, but stays valid if it did)', () => {
    const prefill = buildReportBugPrefill({
      atcTitle: '',
      stepContent: 'step content',
      stepEvidenceUrl: null,
    });
    expect(prefill.title).toBe('failed');
  });
});

// BK-500 regression — the seeded evidence row used to be a bare truthiness
// check, so a legacy non-http(s) `evidence_url` was prefilled verbatim and
// then rejected by the filing-time schema on the tester's first submit, on a
// field they never typed into. These assertions run the REAL prefill output
// through the REAL `BugRunLinkedCreateBodySchema` the API route parses with —
// no mocks, no hand-rolled copy of either side — so the suite fails if the
// two ever disagree again, not merely if this one helper changes shape.
describe('buildReportBugPrefill — BK-500 evidence-seed scheme allowlist', () => {
  const RUN_STEP_ID = '123e4567-e89b-42d3-a456-426614174000';

  function fileSeededPrefill(stepEvidenceUrl: string | null) {
    const prefill = buildReportBugPrefill({
      atcTitle: 'Tokenize card with retry after gateway 5xx',
      stepContent: 'Submit payment with an expired card',
      stepEvidenceUrl,
    });
    const parsed = BugRunLinkedCreateBodySchema.safeParse({
      run_step_id: RUN_STEP_ID,
      title: prefill.title,
      severity: prefill.severity,
      steps_to_reproduce: prefill.stepsToReproduce,
      evidence_urls: prefill.evidenceUrls,
    });
    return { prefill, parsed };
  }

  test.each([
    ['javascript:alert(document.cookie)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['blob:https://example.com/9d1f'],
    ['vbscript:msgbox(1)'],
    ['//evil.com/shot.png'],
    ['http:example.com'],
  ])('drops a non-http(s) stored evidence value (%s) instead of seeding a guaranteed 422', (stored) => {
    const { prefill, parsed } = fileSeededPrefill(stored);
    expect(prefill.evidenceUrls).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  test('a genuine http(s) stored evidence value is still seeded, and the seeded body files cleanly', () => {
    const { prefill, parsed } = fileSeededPrefill('https://example.com/screenshot.png');
    expect(prefill.evidenceUrls).toEqual(['https://example.com/screenshot.png']);
    expect(parsed.success).toBe(true);
  });

  test('a padded stored value is trimmed before it is both checked and seeded, so what was validated is what gets posted', () => {
    const { prefill, parsed } = fileSeededPrefill('  https://example.com/screenshot.png  ');
    expect(prefill.evidenceUrls).toEqual(['https://example.com/screenshot.png']);
    expect(parsed.success).toBe(true);
  });

  test('a whitespace-only stored value seeds no evidence row at all', () => {
    const { prefill, parsed } = fileSeededPrefill('   ');
    expect(prefill.evidenceUrls).toEqual([]);
    expect(parsed.success).toBe(true);
  });
});
