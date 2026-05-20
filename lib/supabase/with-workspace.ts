import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// Tables that own a literal `workspace_id` column. Listed explicitly so TS
// can verify the column exists at call-site and so child tables (atc_steps,
// atc_assertions, etc.) that resolve tenancy transitively never reach this
// helper by accident.
type WorkspaceScopedTable
  = | 'workspace_members'
    | 'projects';

type Client = SupabaseClient<Database>;

// Returns `from(table).select(...).eq('workspace_id', ws)` starting points
// for workspace-scoped reads. Centralises the "did you remember to filter by
// workspace?" footgun. RLS already enforces isolation; this helper is
// defence in depth + read-intent clarity, not a security boundary.
//
// Use `workspaces(ws)` for the workspace row itself (filters by `id`).
export function withWorkspace(supabase: Client, workspaceId: string) {
  return {
    from(table: WorkspaceScopedTable) {
      return supabase.from(table).select('*').eq('workspace_id', workspaceId);
    },
    workspaces() {
      return supabase.from('workspaces').select('*').eq('id', workspaceId);
    },
  };
}
