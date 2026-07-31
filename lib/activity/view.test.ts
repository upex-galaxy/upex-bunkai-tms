import { extractRunVerdict, resolveActivityViewState, resolveActorLabel } from '@lib/activity/view';
import { describe, expect, test } from 'bun:test';

// BK-49 — Activity feed view-state branch selection (AC3 3.1 vs 3.2), the
// actor fallback (AC1 1.4), and the run.finished verdict derivation.

describe('resolveActivityViewState', () => {
  test('a FIRST-PAGE error takes priority, even with rows already on screen', () => {
    expect(resolveActivityViewState({ error: true, rowCount: 12 })).toBe('error');
    expect(resolveActivityViewState({ error: true, rowCount: 0 })).toBe('error');
  });

  test('a failed APPEND is not this resolver\'s input — deep lists stay mounted', () => {
    // The caller keeps a failed "load older" in its own state and passes
    // error: false here, so several loaded pages survive one flaky append —
    // same split RunHistoryView's resolver makes, for the same reason.
    expect(resolveActivityViewState({ error: false, rowCount: 90 })).toBe('rows');
  });

  test('rows present -> rows', () => {
    expect(resolveActivityViewState({ error: false, rowCount: 1 })).toBe('rows');
  });

  test('zero rows, no error -> empty (AC3 3.1, distinct from error)', () => {
    expect(resolveActivityViewState({ error: false, rowCount: 0 })).toBe('empty');
  });
});

describe('resolveActorLabel', () => {
  test('a resolved email renders verbatim', () => {
    expect(resolveActorLabel({ email: 'qa-lead@example.com' })).toBe('qa-lead@example.com');
  });

  test('an unresolvable actor falls back to neutral copy, never a raw id or blank cell', () => {
    expect(resolveActorLabel({ email: null })).toBe('a workspace member');
  });
});

describe('extractRunVerdict', () => {
  test('run.finished with a valid verdict returns it', () => {
    expect(extractRunVerdict('run.finished', { verdict: 'passed', skipped_steps: 0 })).toBe('passed');
    expect(extractRunVerdict('run.finished', { verdict: 'failed', skipped_steps: 2 })).toBe('failed');
  });

  test('run.finished with a missing or malformed verdict returns null, not a crash', () => {
    expect(extractRunVerdict('run.finished', {})).toBeNull();
    expect(extractRunVerdict('run.finished', { verdict: null })).toBeNull();
    expect(extractRunVerdict('run.finished', { verdict: 'unknown' })).toBeNull();
  });

  test('every other action returns null — the badge is run.finished-only', () => {
    expect(extractRunVerdict('run.aborted', { verdict: 'passed' })).toBeNull();
    expect(extractRunVerdict('module.renamed', { verdict: 'passed' })).toBeNull();
    expect(extractRunVerdict('atc.created', {})).toBeNull();
  });
});
