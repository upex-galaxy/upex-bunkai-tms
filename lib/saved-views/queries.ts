import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ViewKind } from './constants';
import type { SavedViewCreateBody, SavedViewPatchBody } from './validation';
import type { SavedViewItem } from './view-model';
import { SAVED_VIEW_LIMIT } from './constants';
import { mapSavedViewDbError, savedViewNotFound, savedViewStateRefusal } from './errors';
import { validateStateForKind } from './state';
import { SAVED_VIEW_COLUMNS, toSavedViewItem } from './view-model';

// BK-443 — the database access behind the saved-views routes, kept out of the
// route files so it can be driven with a recording client (the repo has no
// NextRequest harness; same split as `notification-preferences/response.ts`).
//
// Every query goes through the caller's RLS-scoped client. The policies in
// migration 0093 are the guard; the explicit `user_id` / `project_id` / `id`
// filters here are defense in depth and keep the intent readable. A foreign or
// missing view matches zero rows and answers the same 404 either way.

type Db = SupabaseClient<Database>;
type ViewUpdate = Database['public']['Tables']['user_view_state']['Update'];

export interface ViewScope {
  userId: string
  projectId: string
}

export async function listSavedViews(db: Db, scope: ViewScope, kind: ViewKind): Promise<SavedViewItem[]> {
  const { data, error } = await db
    .from('user_view_state')
    .select(SAVED_VIEW_COLUMNS)
    .eq('user_id', scope.userId)
    .eq('project_id', scope.projectId)
    .eq('view_kind', kind)
    .order('name_key', { ascending: true })
    .order('id', { ascending: true })
    .limit(SAVED_VIEW_LIMIT);
  if (error) { mapSavedViewDbError(error); }
  return (data ?? []).map(toSavedViewItem);
}

export async function createSavedView(db: Db, scope: ViewScope, body: SavedViewCreateBody): Promise<SavedViewItem> {
  const checked = validateStateForKind(body.view_kind, body.state);
  if (!checked.ok) { throw savedViewStateRefusal(checked.reason); }

  const { data, error } = await db
    .from('user_view_state')
    .insert({
      user_id: scope.userId,
      project_id: scope.projectId,
      view_kind: body.view_kind,
      name: body.name,
      state: checked.state,
    })
    .select(SAVED_VIEW_COLUMNS)
    .single();
  if (error) { mapSavedViewDbError(error, 'create'); }
  return toSavedViewItem(data);
}

export async function updateSavedView(db: Db, scope: ViewScope & { viewId: string }, body: SavedViewPatchBody): Promise<SavedViewItem> {
  const update: ViewUpdate = {};
  if (body.name !== undefined) { update.name = body.name; }

  if (body.state !== undefined) {
    // The state rules depend on the surface, which the body does not carry:
    // read it from the caller's own row (which is also the 404 for a foreign id).
    const { data: current, error: readError } = await db
      .from('user_view_state')
      .select('view_kind')
      .eq('id', scope.viewId)
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .maybeSingle();
    if (readError) { mapSavedViewDbError(readError); }
    if (!current) { throw savedViewNotFound(); }
    const checked = validateStateForKind(current.view_kind as ViewKind, body.state);
    if (!checked.ok) { throw savedViewStateRefusal(checked.reason); }
    update.state = checked.state;
  }

  const { data, error } = await db
    .from('user_view_state')
    .update(update)
    .eq('id', scope.viewId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .select(SAVED_VIEW_COLUMNS);
  if (error) { mapSavedViewDbError(error); }
  const row = data?.[0];
  if (!row) { throw savedViewNotFound(); }
  return toSavedViewItem(row);
}

export async function deleteSavedView(db: Db, scope: ViewScope & { viewId: string }): Promise<void> {
  const { data, error } = await db
    .from('user_view_state')
    .delete()
    .eq('id', scope.viewId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .select('id');
  if (error) { mapSavedViewDbError(error); }
  if (!data || data.length === 0) { throw savedViewNotFound(); }
}
