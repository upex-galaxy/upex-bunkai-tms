// BK-881 / BK-1082 — the one rounding rule behind every coverage percentage
// Bunkai prints or publishes (Home's Coverage card, the workspace coverage
// API, the project Coverage KPI tiles). Framework-agnostic, pure.
//
// Whole percent, half-up, EXCEPT that the two extremes are reserved for the
// exact states they claim: `100` only when `numerator === denominator`, `0`
// only when `numerator === 0`. Anything strictly in between is clamped to
// [1, 99], so 199/200 reads 99% (a gap still exists) and 1/201 reads 1% (real
// coverage exists). PO policy recorded on BK-881, 2026-09-05.
//
// `null` — never `0`, never `NaN` — when the denominator is 0: nothing to
// measure is not the same as measuring zero.
export function clampedPercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }
  if (numerator === 0) {
    return 0;
  }
  if (numerator === denominator) {
    return 100;
  }
  const rounded = Math.round((numerator / denominator) * 100);
  return Math.min(99, Math.max(1, rounded));
}
