// BK-22 — "used in N tests" presentation helpers. Pure, framework-agnostic;
// unit-tested in `usage.test.ts`.

// Count label with correct singular/plural grammar (AC E1). The count is the
// number of DISTINCT Tests chaining the ATC (the RPC's `count`), not the number
// of chain positions.
//   0 -> "Not used yet"   1 -> "Used in 1 test"   N -> "Used in N tests"
export function atcUsageLabel(count: number): string {
  if (count <= 0) {
    return 'Not used yet';
  }
  return `Used in ${count} ${count === 1 ? 'test' : 'tests'}`;
}

// Render an entry's positions compactly: a single position shows as "#1"; the
// same ATC at multiple positions in one Test (AC2.2) shows as "#1, #3". An
// empty list (should not happen for a returned entry) yields an empty string.
export function formatPositions(positions: number[]): string {
  if (positions.length === 0) {
    return '';
  }
  return positions.map(p => `#${p}`).join(', ');
}
