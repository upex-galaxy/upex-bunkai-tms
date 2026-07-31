import { TestDetailView } from '@components/tests/TestDetailView';
import { loadTestDetail } from '@lib/tests/load-test-detail';

interface PageProps {
  params: Promise<{ projectSlug: string, testId: string }>
}

// BK-32 — read-only expanded Test detail, now the "Steps" tab of the Test route
// group. The auth + active-workspace + RPC + role + environments preamble moved
// into `loadTestDetail` (BK-37), which `layout.tsx` also calls: React's
// `cache()` means the two share ONE `bunkai_get_test_expanded` call per request.
// The header lives in the layout; this page renders the tab's own content.
export default async function TestDetailPage({ params }: PageProps) {
  const { projectSlug, testId } = await params;
  const { test, canReorder } = await loadTestDetail(projectSlug, testId);

  return (
    <TestDetailView
      test={test}
      projectSlug={projectSlug}
      canReorder={canReorder}
    />
  );
}
