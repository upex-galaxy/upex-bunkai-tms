import type { ExpandedTest } from '@components/tests/TestDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { getTestExpanded } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// BK-37 — the shared read behind the Test-detail route group. Extracted verbatim
// from `tests/[testId]/page.tsx` (BK-32/28/34) so `layout.tsx` (header + tabs)
// and each tab's own page can both have the Test WITHOUT running the read twice:
// React's `cache()` memoizes per request, so the first caller pays for the RPC
// and every later caller in the same render gets the same promise.
//
// Memoization is keyed on the ARGUMENTS by reference, which is why both are
// plain strings — an options object would be a fresh reference per call site and
// would silently defeat the cache.
//
// Semantics preserved from the original page:
//   * Tests are workspace-scoped (BK-27 D9), so the read is keyed by `testId` +
//     active-workspace membership, not by project; `projectSlug` is the route's
//     display / back-link context and the key for the environments lookup.
//   * One read, one rulebook: this calls the SAME SECURITY DEFINER RPC the
//     headless API route uses (`bunkai_get_test_expanded`), so both surfaces
//     return byte-identical data. The cookie client carries a real `auth.uid()`,
//     but the RPC's own membership check is authoritative.
//   * Missing / not-visible / foreign-workspace Tests all collapse into one safe
//     `notFound()` (INV-3 non-disclosure).

export interface TestDetailEnvironment {
  id: string
  name: string
}

export interface TestDetail {
  userId: string
  activeWorkspaceId: string
  test: ExpandedTest
  // BK-28 — reorder is gated to member/admin/owner. BK-33 reuses it for the tag
  // editor and BK-34 for the Start-run affordance; viewers get the read-only view.
  canReorder: boolean
  // BK-34 — the project's environments (id + name) for the Start-run picker.
  environments: TestDetailEnvironment[]
  environmentError: string | null
}

export const loadTestDetail = cache(async (projectSlug: string, testId: string): Promise<TestDetail> => {
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

  // Tests are workspace-scoped, so the project id isn't on the test; resolve it
  // from the route slug within the active workspace, then read its environments.
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, workspace_id')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectError || !project) { notFound(); }

  // The project is resolved in the same workspace as the project shell. Use its
  // workspace id for the remaining reads so a stale active-workspace cookie cannot
  // split the detail header from the project context.
  const { data: memberRow, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', project.workspace_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (memberError) { throw new Error('Could not load Test permissions.'); }
  const canReorder = ['member', 'admin', 'owner'].includes(memberRow?.role ?? '');

  // Environment loading is auxiliary to the Test detail. Keep the Test content
  // visible if this read fails, but expose the failure to the run affordance.
  const { data: envRows, error: environmentQueryError } = await supabase
    .from('project_environments')
    .select('id, name')
    .eq('project_id', project.id)
    .order('name', { ascending: true });

  return {
    userId: user.id,
    activeWorkspaceId: project.workspace_id,
    test,
    canReorder,
    environments: envRows ?? [],
    environmentError: environmentQueryError ? 'Could not load environments.' : null,
  };
});
