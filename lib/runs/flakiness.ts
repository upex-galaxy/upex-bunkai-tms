// BK-554 — per-Test flakiness signal: framework-agnostic, pure functions only.
// The database returns raw counts (`bunkai_list_test_runs.flakiness`, migration
// 0099); the constants, the band and the copy live here so they are unit-testable
// and shared by the page and the client view. Rules ruled by the AI Product Owner
// on BK-554 (Business Rules BR-01..BR-09).

export const FLAKINESS_WINDOW = 10;
export const FLAKINESS_MIN_SAMPLE = 5;

export interface FlakinessCounts {
  // Passed/Failed Runs in the window (0..10).
  sample: number
  // Consecutive pairs in the window whose verdicts differ.
  flips: number
  // Aborted Runs left out of the sample (skipped, not a break).
  aborted_skipped: number
}

export type FlakinessBand = 'stable' | 'occasionally-flaky' | 'flaky';

export type FlakinessSignal
  = | { kind: 'insufficient', sample: number, needed: number, abortedSkipped: number }
    | { kind: 'judged', band: FlakinessBand, flips: number, sample: number, pairs: number, ratePercent: number, abortedSkipped: number };

export const EMPTY_FLAKINESS: FlakinessCounts = { sample: 0, flips: 0, aborted_skipped: 0 };

export function resolveFlakiness(counts: FlakinessCounts): FlakinessSignal {
  const { sample, flips, aborted_skipped: abortedSkipped } = counts;
  if (sample < FLAKINESS_MIN_SAMPLE) {
    return { kind: 'insufficient', sample, needed: FLAKINESS_MIN_SAMPLE - sample, abortedSkipped };
  }
  const pairs = sample - 1;
  // Band is decided on the exact fraction (flips/pairs <= 1/3  <=>  3*flips <= pairs),
  // never on the rounded percentage.
  let band: FlakinessBand = 'flaky';
  if (flips === 0) {
    band = 'stable';
  }
  else if (flips * 3 <= pairs) {
    band = 'occasionally-flaky';
  }
  return { kind: 'judged', band, flips, sample, pairs, ratePercent: Math.round((flips / pairs) * 100), abortedSkipped };
}

export const FLAKINESS_BAND_LABEL: Record<FlakinessBand, string> = {
  'stable': 'Stable',
  'occasionally-flaky': 'Occasionally flaky',
  'flaky': 'Flaky',
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function flakinessAbortedNote(abortedSkipped: number): string | null {
  if (abortedSkipped <= 0) {
    return null;
  }
  return `${abortedSkipped} Aborted ${plural(abortedSkipped, 'Run', 'Runs')} left out`;
}

// Headline sentence. Judged: "Flaky — 5 flips in the last 10 runs (56%)".
// Below minimum: states how many more Runs are needed, never a rate.
export function flakinessHeadline(signal: FlakinessSignal): string {
  if (signal.kind === 'insufficient') {
    return `Not enough runs yet — ${signal.sample} of ${FLAKINESS_MIN_SAMPLE} needed (${signal.needed} more ${plural(signal.needed, 'Run', 'Runs')} needed)`;
  }
  const flips = `${signal.flips} ${plural(signal.flips, 'flip', 'flips')}`;
  const label = FLAKINESS_BAND_LABEL[signal.band];
  if (signal.band === 'stable') {
    return `${label} — no flips in the last ${signal.sample} runs`;
  }
  return `${label} — ${flips} in the last ${signal.sample} runs (${signal.ratePercent}%)`;
}
