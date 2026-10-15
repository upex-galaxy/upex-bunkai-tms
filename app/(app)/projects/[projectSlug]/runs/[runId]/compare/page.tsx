import { RunCompareView } from '@components/runs/RunCompareView';
import { COMPARE_LOAD_ERROR, parseRunComparison } from '@lib/runs/compare-view';
import { compareRun } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, runId: string }>
}

// BK-442 — compare a Run against the previous Run of the same Test. A page UNDER
// the Run (`/projects/{slug}/runs/{runId}/compare`), holding only the viewed Run's
// id, so a link pasted into Jira keeps its meaning (the Previous run is fixed by the
// time the viewed Run started, not by when someone opens the link). Any active
// workspace member opens it, viewers included.
//
// One read, one rulebook: this calls the SAME function the headless route uses
// (`bunkai_compare_run`, 0092_run_compare.sql), on the viewer's OWN cookie client.
// The function is SECURITY INVOKER with no identity parameter, so row-level security
// is the only authorization; never swap this for the admin client. A missing Run, a
// Run in another workspace, a non-member and a soft-deleted workspace all raise the
// same P0002 and collapse into one `notFound()` (non-disclosure).
//
// A failed read is NOT thrown to the route error boundary: it is handed to the view
// as its error state (the BK-37 error block with Retry), so one flaky request never
// takes the whole Run page down with it.
export default async function RunComparePage({ params }: PageProps) {
  const { projectSlug, runId } = await params;
  if (!isUuid(runId)) { notFound(); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { notFound(); }

  const { data, error } = await compareRun(supabase, { runId });
  if (error?.code === 'P0002') { notFound(); }
  if (error) {
    // Server-side only: the client gets fixed text, never the database message.
    console.error(JSON.stringify({ level: 'error', component: 'page', route: 'runs/[runId]/compare', error_code: error.code, message: error.message }));
    return <RunCompareView projectSlug={projectSlug} runId={runId} initialComparison={null} initialError={COMPARE_LOAD_ERROR} />;
  }

  const comparison = parseRunComparison(data);
  if (comparison === null) {
    console.error(JSON.stringify({ level: 'error', component: 'page', route: 'runs/[runId]/compare', error_code: 'compare_payload_invalid' }));
    return <RunCompareView projectSlug={projectSlug} runId={runId} initialComparison={null} initialError={COMPARE_LOAD_ERROR} />;
  }

  return <RunCompareView projectSlug={projectSlug} runId={runId} initialComparison={comparison} />;
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
