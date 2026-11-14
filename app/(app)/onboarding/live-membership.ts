import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// BK-1903 — the onboarding page's one decision, split out of `page.tsx` (a
// page module may only export the page) so it is testable without mocking
// `next/navigation` process-wide.
//
// Does the account belong to at least one LIVE workspace? A soft-deleted
// workspace (BK-512, ADR-0015) keeps its member rows `active` so a restore
// inside the grace moves no data; an account whose only memberships are in
// deleted workspaces must get the onboarding form, not `/projects`. The
// `workspace_members` SELECT policy (0084a) already hides those rows from the
// session client; the inner embed states the rule here instead of depending on
// a clause in another table's policy. Same shape as `lib/home/open-bugs.ts`.
export async function hasLiveMembership(db: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data } = await db
    .from('workspace_members')
    .select('workspace_id, workspaces!inner(deleted_at)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('workspaces.deleted_at', null)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
