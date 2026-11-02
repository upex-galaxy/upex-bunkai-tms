import { TestsListSkeleton } from '@components/tests/TestsListView';

// BK-666 (AC-09) — while the Tests list route loads, skeleton rows stand in for
// the rows; nothing partial is shown as final. Scoped by the `(list)` route
// group to the list only, never to a Test's own detail.
export default function Loading() {
  return <TestsListSkeleton />;
}
