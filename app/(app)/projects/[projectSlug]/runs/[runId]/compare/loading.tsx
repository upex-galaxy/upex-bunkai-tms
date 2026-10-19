import { RunHistorySkeleton } from '@components/runs/RunHistoryView';

// BK-442 — the comparison's loading skeleton: the BK-37 skeleton, reused as is (a
// header strip, cards and a table-shaped block), so the two Run surfaces load alike.
export default function Loading() {
  return <RunHistorySkeleton />;
}
