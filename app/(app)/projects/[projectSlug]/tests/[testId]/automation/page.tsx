import { TestAutomationHistory } from '@components/tests/TestAutomationHistory';
import { loadTestAutomationStatus } from '@lib/tests/load-automation-status';
import { loadTestDetail } from '@lib/tests/load-test-detail';

interface PageProps {
  params: Promise<{ projectSlug: string, testId: string }>
}

// BK-227 — the Status history tab of the Test detail route (master-design-plan
// §5 D74). `loadTestDetail` runs first for its 404 semantics; both reads are
// the ones the layout already made this request.
export default async function TestAutomationHistoryPage({ params }: PageProps) {
  const { projectSlug, testId } = await params;
  const { userId } = await loadTestDetail(projectSlug, testId);
  const { automation_status, history } = await loadTestAutomationStatus(testId, userId);
  return <TestAutomationHistory status={automation_status} history={history} />;
}
