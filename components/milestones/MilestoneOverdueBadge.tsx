import { AlertTriangle } from 'lucide-react';

// BK-206 — the overdue badge (`milestones-board.html` `.chip[data-status="overdue"]`),
// built from the live `.status-chip` atom in its fail tone: icon + TEXT, never colour
// alone. It renders BESIDE the neutral countdown chip, which stays exactly as BK-205
// ships it (Q5 ratified 2026-10-25; AI Product Owner decision PO-1 on BK-206). The
// label comes from `overdueInfo` (lib/milestones/readiness-view.ts), the one overdue
// predicate the list and the detail share.

export function MilestoneOverdueBadge({ label, testId }: { label: string, testId?: string }) {
  return (
    <span data-testid={testId} className="status-chip" data-status="fail">
      <AlertTriangle size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
