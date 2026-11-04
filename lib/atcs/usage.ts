import type { AtcUsageReport } from '@lib/types';

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

// BK-571 — the "Used by" report for an archived ATC, from its raw chain rows. The
// usage RPC is a reuse read and answers not found for an archived ATC, but an
// archived ATC is fully readable and its Tests keep it in their chains. Same
// shape and order as the RPC: one entry per Test, by title, positions ascending.
export function buildAtcUsageReport(
  steps: { position: number, tests: { id: string, title: string } | null }[],
): AtcUsageReport {
  const byTest = new Map<string, { test_id: string, title: string, positions: number[] }>();
  for (const step of steps) {
    if (!step.tests) { continue; }
    const entry = byTest.get(step.tests.id) ?? { test_id: step.tests.id, title: step.tests.title, positions: [] };
    entry.positions.push(step.position);
    byTest.set(step.tests.id, entry);
  }
  const used_in = [...byTest.values()]
    .map(entry => ({ ...entry, positions: [...entry.positions].sort((a, b) => a - b) }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.test_id.localeCompare(b.test_id));
  return { count: used_in.length, used_in };
}
