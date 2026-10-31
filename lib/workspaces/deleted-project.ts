import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// BK-1129 — BK-512 Scenario N3 on a reload. Every Run URL lives under
// /projects/{projectSlug}, and that segment's layout refuses first: once the
// workspace is soft-deleted (ADR-0015) the project is invisible and the layout
// calls notFound() before the Runner page ever runs. This tells the layout
// whether the slug it could not find belongs to a workspace the CALLER was in
// and the Owner deleted.
//
// Scoped from the caller outward: only workspaces where the caller still holds
// an active membership row (the soft-delete leaves it) are considered, so a
// slug from somebody else's deleted workspace answers false and discloses
// nothing. `db` must be the service-role client: RLS hides a deleted workspace
// and its projects. Utility contract: any read failure answers false, keeping
// the existing not-found.
export async function isProjectInDeletedWorkspaceOf(
  db: SupabaseClient<Database>,
  params: { projectSlug: string, userId: string },
): Promise<boolean> {
  const { data: memberships } = await db
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', params.userId)
    .eq('status', 'active');
  const memberOf = (memberships ?? []).map(m => m.workspace_id);
  if (memberOf.length === 0) {
    return false;
  }

  const { data: deleted } = await db
    .from('workspaces')
    .select('id')
    .in('id', memberOf)
    .not('deleted_at', 'is', null);
  const deletedIds = (deleted ?? []).map(w => w.id);
  if (deletedIds.length === 0) {
    return false;
  }

  const { data: project } = await db
    .from('projects')
    .select('id')
    .eq('slug', params.projectSlug)
    .in('workspace_id', deletedIds)
    .limit(1)
    .maybeSingle();
  return project !== null;
}
