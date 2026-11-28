import type { ReadOnlyProjectRef } from '@lib/billing/subscription';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalDbError } from '@lib/billing/errors';

type Client = SupabaseClient<Database>;

export async function loadReadOnlyProjects(db: Client, workspaceId: string): Promise<ReadOnlyProjectRef[]> {
  const { data: ids, error } = await db.rpc('bunkai_read_only_project_ids', { p_workspace_id: workspaceId });
  if (error) {
    throw internalDbError('bunkai_read_only_project_ids failed', error);
  }
  const ordered = (ids ?? []);
  if (ordered.length === 0) {
    return [];
  }
  const { data: rows, error: rowsError } = await db.from('projects').select('id, name').in('id', ordered);
  if (rowsError) {
    throw internalDbError('read-only projects lookup failed', rowsError);
  }
  const names = new Map((rows ?? []).map(row => [row.id, row.name]));
  return ordered.filter(id => names.has(id)).map(id => ({ id, name: names.get(id) as string }));
}

export async function loadReadOnlyProjectSlugs(db: Client, workspaceId: string): Promise<string[]> {
  const { data: ids, error } = await db.rpc('bunkai_read_only_project_ids', { p_workspace_id: workspaceId });
  if (error || !ids || ids.length === 0) {
    return [];
  }
  const { data: rows, error: rowsError } = await db.from('projects').select('slug').in('id', ids);
  if (rowsError) {
    return [];
  }
  return (rows ?? []).map(row => row.slug);
}

export async function isProjectReadOnly(db: Client, workspaceId: string, projectId: string): Promise<boolean> {
  const { data, error } = await db.rpc('bunkai_read_only_project_ids', { p_workspace_id: workspaceId });
  if (error) {
    return false;
  }
  return ((data ?? [])).includes(projectId);
}
