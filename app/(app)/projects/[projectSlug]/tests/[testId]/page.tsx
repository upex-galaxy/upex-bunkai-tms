import type { ExpandedTest } from '@components/tests/TestDetailView';
import { TestDetailView } from '@components/tests/TestDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { getTestExpanded } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, testId: string }>
}

// BK-32 — read-only expanded Test detail page. Tests are workspace-scoped
// (BK-27 D9), so the read is keyed by `testId` + active-workspace membership,
// not by project; `projectSlug` is the route's display/back-link context only.
// One read, one rulebook: the page calls the SAME SECURITY DEFINER RPC the
// headless API route uses (`bunkai_get_test_expanded`), so both surfaces return
// byte-identical data. The cookie client carries a real `auth.uid()`, but the
// RPC's own membership check is authoritative. Missing / not-visible /
// foreign-workspace Tests all collapse into one safe `notFound()` (INV-3
// non-disclosure).
export default async function TestDetailPage({ params }: PageProps) {
  const { projectSlug, testId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { notFound(); }

  // Resolve the active workspace exactly as the ATC detail page does, so the
  // explorer's notion of "current workspace" is respected on deep-link.
  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieActive,
    (workspaceRows ?? []).map(w => w.id),
  );
  if (!activeWorkspaceId) { notFound(); }

  const { data, error } = await getTestExpanded(supabase, {
    actorUserId: user.id,
    testId,
  });
  if (error || !data) { notFound(); }

  const test = data as unknown as ExpandedTest;

  return <TestDetailView test={test} projectSlug={projectSlug} />;
}
