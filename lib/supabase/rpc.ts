import type { Database, Json } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// Typed wrappers around our `bunkai_*` RPCs. Keeps call-sites short and
// guarantees argument names stay in sync with the migration files. Each
// wrapper returns the `{ data, error }` shape Postgrest already produces so
// callers can branch on `error` uniformly.

type Client = SupabaseClient<Database>;

export interface BootstrapWorkspaceArgs {
  slug: string
  name: string
}

export async function bootstrapWorkspace(supabase: Client, args: BootstrapWorkspaceArgs) {
  return supabase.rpc('bunkai_bootstrap_workspace', {
    p_slug: args.slug,
    p_name: args.name,
  });
}

export interface SaveAtcStep {
  content: string
  input_data?: string | null
  expected?: string | null
}

export interface SaveAtcAssertion {
  content: string
}

export interface SaveAtcArgs {
  atcId: string
  title: string
  layer: string
  tags: string[]
  userStoryId: string
  steps: SaveAtcStep[]
  assertions: SaveAtcAssertion[]
  acIds: string[]
}

export async function saveAtc(supabase: Client, args: SaveAtcArgs) {
  return supabase.rpc('bunkai_save_atc', {
    p_atc_id: args.atcId,
    p_title: args.title,
    p_layer: args.layer,
    p_tags: args.tags,
    p_user_story_id: args.userStoryId,
    p_steps: args.steps as unknown as Json,
    p_assertions: args.assertions as unknown as Json,
    p_ac_ids: args.acIds,
  });
}
