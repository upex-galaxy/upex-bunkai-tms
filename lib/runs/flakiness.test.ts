import {
  flakinessAbortedNote,
  flakinessHeadline,
  resolveFlakiness,
} from '@lib/runs/flakiness';
import { describe, expect, test } from 'bun:test';

// BK-554 — band, rate and copy rules (BR-05, BR-06).
const counts = (sample: number, flips: number, abortedSkipped = 0) => ({ sample, flips, aborted_skipped: abortedSkipped });

describe('resolveFlakiness', () => {
  test('below five verdict Runs: no rate, says how many more are needed', () => {
    const s = resolveFlakiness(counts(4, 3));
    expect(s).toEqual({ kind: 'insufficient', sample: 4, needed: 1, abortedSkipped: 0 });
    expect(flakinessHeadline(s)).toContain('1 more Run needed');
    expect(flakinessHeadline(s)).not.toContain('%');
  });

  test('zero verdict Runs is insufficient and keeps the aborted disclosure', () => {
    const s = resolveFlakiness(counts(0, 0, 3));
    expect(s).toMatchObject({ kind: 'insufficient', needed: 5, abortedSkipped: 3 });
  });

  test('alternating 10 Runs: 9 flips, 100%, Flaky', () => {
    expect(resolveFlakiness(counts(10, 9))).toMatchObject({ band: 'flaky', ratePercent: 100, pairs: 9 });
  });

  test('P,P,F,P,P: 2 flips of 4 pairs, 50%, Flaky', () => {
    expect(resolveFlakiness(counts(5, 2))).toMatchObject({ band: 'flaky', ratePercent: 50 });
  });

  test('never flipped reads Stable', () => {
    const s = resolveFlakiness(counts(10, 0));
    expect(s).toMatchObject({ band: 'stable', ratePercent: 0 });
    expect(flakinessHeadline(s)).toBe('Stable — no flips in the last 10 runs');
  });

  test('one recovery flip is Occasionally flaky, 11%', () => {
    expect(resolveFlakiness(counts(10, 1))).toMatchObject({ band: 'occasionally-flaky', ratePercent: 11 });
  });

  test('boundary: 3 of 9 is Occasionally flaky (33%), 4 of 9 is Flaky (44%)', () => {
    expect(resolveFlakiness(counts(10, 3))).toMatchObject({ band: 'occasionally-flaky', ratePercent: 33 });
    expect(resolveFlakiness(counts(10, 4))).toMatchObject({ band: 'flaky', ratePercent: 44 });
  });

  test('exact-fraction boundary at a short window: 1 of 3 is Occasionally flaky', () => {
    expect(resolveFlakiness(counts(5, 1))).toMatchObject({ band: 'occasionally-flaky' });
    expect(resolveFlakiness(counts(7, 2))).toMatchObject({ band: 'occasionally-flaky', pairs: 6 });
  });

  test('shorter history states the sample used', () => {
    expect(flakinessHeadline(resolveFlakiness(counts(6, 1)))).toBe('Occasionally flaky — 1 flip in the last 6 runs (20%)');
  });
});

describe('flakinessAbortedNote', () => {
  test('silent at zero, singular and plural otherwise', () => {
    expect(flakinessAbortedNote(0)).toBeNull();
    expect(flakinessAbortedNote(1)).toBe('1 Aborted Run left out');
    expect(flakinessAbortedNote(2)).toBe('2 Aborted Runs left out');
  });
});
