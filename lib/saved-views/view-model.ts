import type { Database } from '@lib/types/supabase';
import type { ViewKind } from './constants';
import type { SavedViewState } from './state';

// BK-443 — the wire shape of one saved view. The owner id is never returned:
// the caller only ever sees their own rows, so it would carry no information.

export interface SavedViewItem {
  id: string
  project_id: string
  view_kind: ViewKind
  name: string
  state: SavedViewState
  created_at: string
  updated_at: string
}

export const SAVED_VIEW_COLUMNS = 'id, project_id, view_kind, name, state, created_at, updated_at';

type SavedViewRow = Pick<
  Database['public']['Tables']['user_view_state']['Row'],
  'id' | 'project_id' | 'view_kind' | 'name' | 'state' | 'created_at' | 'updated_at'
>;

export function toSavedViewItem(row: SavedViewRow): SavedViewItem {
  return {
    id: row.id,
    project_id: row.project_id,
    view_kind: row.view_kind as ViewKind,
    name: row.name,
    state: row.state as SavedViewState,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
