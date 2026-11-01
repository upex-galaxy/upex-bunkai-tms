import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// BK-620 — which Project a Test belongs to.
//
// `public.tests` carries no `project_id` (Tests are workspace-scoped, BK-27
// Decision 9), so a Test's Project is derived from its chain: test_steps ->
// atcs.project_id. The rule is the ALL-match one 0076_test_plan_tests.sql
// already ratified for `bunkai_add_tests_to_plan` / `bunkai_search_tests`: a
// Test belongs to Project P only when its chain is non-empty and EVERY chained
// ATC is in P. A chain that spans two Projects belongs to neither, and an empty
// chain belongs to none. An ATC whose project the caller cannot read (null /
// undefined) fails closed.
export function isTestChainInProject(
  chainProjectIds: ReadonlyArray<string | null | undefined>,
  projectId: string,
): boolean {
  return chainProjectIds.length > 0 && chainProjectIds.every(id => id === projectId);
}

// The Project of every chained ATC of one Test, in chain order, read under the
// caller's own client (RLS applies: an ATC the caller cannot read comes back
// null and fails the rule closed). A failed read throws: guessing a scope is
// exactly the defect this module exists to remove.
export async function fetchTestChainProjectIds(
  db: SupabaseClient<Database>,
  testId: string,
): Promise<Array<string | null>> {
  const { data, error } = await db
    .from('test_steps')
    .select('position, atcs(project_id)')
    .eq('test_id', testId)
    .order('position', { ascending: true });
  if (error) { throw new Error(error.message); }
  return (data ?? []).map(step => step.atcs?.project_id ?? null);
}
