import {
  isEvidenceLinkOpenable,
  resolveAtcVerdictBadge,
  resolveStatusDotToken,
  resolveStepMarkControlState,
  RUN_STEP_MARKING_CLOSED_MESSAGE,
  validateMarkStepForm,
} from '@lib/runs/mark-step-view';
import { RUN_STEP_EVIDENCE_URL_MAX, RUN_STEP_NOTE_MAX } from '@lib/runs/validation';
import { describe, expect, test } from 'bun:test';

// BK-35 — Mark Step view-state: per-step control visibility (Q2/Q4/AC6),
// the ATC verdict badge (Q1's "unrun while pending" state), and the
// mark-form field validation. Mirrors lib/runs/realtime-run-channel.test.ts /
// report-view.test.ts's structure — one describe per exported function.

// ---------------------------------------------------------------------------
// resolveStepMarkControlState
// ---------------------------------------------------------------------------

describe('resolveStepMarkControlState', () => {
  test('Q4 — a non-member+/viewer caller sees no controls and no guard message, regardless of run/step status', () => {
    const state = resolveStepMarkControlState({ canMark: false, runStatus: 'running', stepStatus: 'pending' });
    expect(state.showControls).toBe(false);
    expect(state.guardMessage).toBeNull();
    expect(state.pressed).toEqual({ passed: false, failed: false, blocked: false });
  });

  test('Q4 — a viewer on a CLOSED run still sees nothing (no guard copy either — they never had the ability)', () => {
    const state = resolveStepMarkControlState({ canMark: false, runStatus: 'aborted', stepStatus: 'passed' });
    expect(state.showControls).toBe(false);
    expect(state.guardMessage).toBeNull();
  });

  test('a member+ caller on a running run sees controls, with no guard message', () => {
    const state = resolveStepMarkControlState({ canMark: true, runStatus: 'running', stepStatus: 'pending' });
    expect(state.showControls).toBe(true);
    expect(state.guardMessage).toBeNull();
  });

  test('Q2 — a member+ caller on a closed run (passed/failed/aborted) sees the frozen guard copy instead of controls', () => {
    for (const runStatus of ['passed', 'failed', 'aborted'] as const) {
      const state = resolveStepMarkControlState({ canMark: true, runStatus, stepStatus: 'pending' });
      expect(state.showControls).toBe(false);
      expect(state.guardMessage).toBe(RUN_STEP_MARKING_CLOSED_MESSAGE);
    }
  });

  test('guard copy is EXACTLY Q2\'s frozen string (mirrors the abort/finish template)', () => {
    expect(RUN_STEP_MARKING_CLOSED_MESSAGE).toBe('This run is already closed and cannot accept new step results.');
  });

  test('AC6/Q7 — re-marking stays enabled: a step already marked shows controls, not a read-only result', () => {
    const state = resolveStepMarkControlState({ canMark: true, runStatus: 'running', stepStatus: 'passed' });
    expect(state.showControls).toBe(true);
  });

  test('`pressed` reflects the current status for exactly one of passed/failed/blocked', () => {
    expect(resolveStepMarkControlState({ canMark: true, runStatus: 'running', stepStatus: 'passed' }).pressed)
      .toEqual({ passed: true, failed: false, blocked: false });
    expect(resolveStepMarkControlState({ canMark: true, runStatus: 'running', stepStatus: 'failed' }).pressed)
      .toEqual({ passed: false, failed: true, blocked: false });
    expect(resolveStepMarkControlState({ canMark: true, runStatus: 'running', stepStatus: 'blocked' }).pressed)
      .toEqual({ passed: false, failed: false, blocked: true });
  });

  test('Q1 — a pending step has nothing pressed', () => {
    expect(resolveStepMarkControlState({ canMark: true, runStatus: 'running', stepStatus: 'pending' }).pressed)
      .toEqual({ passed: false, failed: false, blocked: false });
  });
});

// ---------------------------------------------------------------------------
// resolveStatusDotToken / resolveAtcVerdictBadge
// ---------------------------------------------------------------------------

describe('resolveStatusDotToken', () => {
  test('maps the API\'s step/ATC verbs to the live .dot[data-status] tokens', () => {
    expect(resolveStatusDotToken('passed')).toBe('pass');
    expect(resolveStatusDotToken('failed')).toBe('fail');
    expect(resolveStatusDotToken('blocked')).toBe('blocked');
    expect(resolveStatusDotToken('skipped')).toBe('skipped');
  });

  test('Q1 — "pending" (unrun) reuses the neutral "skipped" token rather than inventing a new color', () => {
    expect(resolveStatusDotToken('pending')).toBe('skipped');
  });
});

describe('resolveAtcVerdictBadge', () => {
  test('Q1 — a pending ATC renders the "Unrun" label, not a premature verdict', () => {
    expect(resolveAtcVerdictBadge('pending')).toEqual({ label: 'Unrun', token: 'skipped' });
  });

  test('resolved verdicts render their own label + the matching dot token', () => {
    expect(resolveAtcVerdictBadge('passed')).toEqual({ label: 'Passed', token: 'pass' });
    expect(resolveAtcVerdictBadge('failed')).toEqual({ label: 'Failed', token: 'fail' });
    expect(resolveAtcVerdictBadge('blocked')).toEqual({ label: 'Blocked', token: 'blocked' });
  });
});

// ---------------------------------------------------------------------------
// isEvidenceLinkOpenable (BK-466)
// ---------------------------------------------------------------------------

// BK-466 — this is the render guard RunnerView.tsx calls directly to decide
// anchor-vs-text for a step's evidence link (the actual defect: the anchor
// used to render `s.evidence_url` unconditionally, with no scheme check).
describe('isEvidenceLinkOpenable', () => {
  test('a well-formed https URL is openable', () => {
    expect(isEvidenceLinkOpenable('https://example.com/evidence.png')).toBe(true);
  });

  test('a well-formed http URL is openable', () => {
    expect(isEvidenceLinkOpenable('http://example.com')).toBe(true);
  });

  test('a javascript: URL is NOT openable', () => {
    expect(isEvidenceLinkOpenable('javascript:alert(1)')).toBe(false);
  });

  test('a data: URL is NOT openable', () => {
    expect(isEvidenceLinkOpenable('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateMarkStepForm
// ---------------------------------------------------------------------------

describe('validateMarkStepForm', () => {
  test('empty note + empty evidence link is valid (both optional)', () => {
    expect(validateMarkStepForm({ note: '', evidenceUrl: '' })).toBeNull();
  });

  test('whitespace-only note/evidence link is valid — trims to empty, mirrors Q8\'s empty-to-null normalization', () => {
    expect(validateMarkStepForm({ note: '   ', evidenceUrl: '   ' })).toBeNull();
  });

  test('a note exactly at the max length is valid', () => {
    expect(validateMarkStepForm({ note: 'x'.repeat(RUN_STEP_NOTE_MAX), evidenceUrl: '' })).toBeNull();
  });

  test('a note over the max length is rejected with a field-specific message', () => {
    const result = validateMarkStepForm({ note: 'x'.repeat(RUN_STEP_NOTE_MAX + 1), evidenceUrl: '' });
    expect(result).toBe(`Note must be at most ${RUN_STEP_NOTE_MAX} characters.`);
  });

  test('a well-formed evidence URL is valid', () => {
    expect(validateMarkStepForm({ note: '', evidenceUrl: 'https://example.com/screenshot.png' })).toBeNull();
  });

  test('a malformed evidence URL is rejected with a field-specific message', () => {
    expect(validateMarkStepForm({ note: '', evidenceUrl: 'not-a-url' }))
      .toBe('Evidence link must be a valid URL.');
  });

  // BK-466 — a javascript:/data: evidence URL is well-formed enough for
  // `new URL(...)` to parse (so the old `isValidUrl`-backed check let it
  // through); it must still be rejected here now that the scheme allowlist
  // (`isHttpUrl`) is the gate.
  test('a javascript: evidence URL is rejected, not accepted as "valid"', () => {
    expect(validateMarkStepForm({ note: '', evidenceUrl: 'javascript:alert(1)' }))
      .toBe('Evidence link must be a valid URL.');
  });

  test('a data: evidence URL is rejected, not accepted as "valid"', () => {
    expect(validateMarkStepForm({ note: '', evidenceUrl: 'data:text/html,<script>alert(1)</script>' }))
      .toBe('Evidence link must be a valid URL.');
  });

  test('an evidence URL over the max length is rejected before the URL check', () => {
    const longUrl = `https://example.com/${'x'.repeat(RUN_STEP_EVIDENCE_URL_MAX)}`;
    const result = validateMarkStepForm({ note: '', evidenceUrl: longUrl });
    expect(result).toBe(`Evidence link must be at most ${RUN_STEP_EVIDENCE_URL_MAX} characters.`);
  });
});
