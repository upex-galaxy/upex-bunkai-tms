import type { AcceptanceCriterion, Atc, Module, UserStory } from '@lib/types';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@lib/atcs/export-query';

// BK-1233 — the project layout's reads that feed the workbench explorer tree.
//
// PostgREST caps an unranged read at `db-max-rows` (1000) and answers HTTP 200
// with no error, so the layout's bare `.select()`s showed at most 1000 ATCs per
// Project and silently dropped the rest from every module (same cap BK-315 and
// BK-637 fixed for the CSV export). Every read here is drained to completion
// with `fetchAllPages`, under an ordering that ends in the primary key so the
// offset windows neither skip nor repeat a row between pages.
//
// The two `.in()` reads are also sent in batches: PostgREST puts the id list
// in the GET query string (~40 URL-encoded bytes per uuid) against a gateway
// header buffer of ~8 KB, so a few hundred story ids already produce a 414.
// Same batching precedent as `lib/home/recent-projects.ts`.
//
// A failed page throws instead of returning a partial list: a truncated tree
// is exactly the defect this module exists to remove.

type Db = SupabaseClient<Database>;

export const TREE_IN_FILTER_BATCH = 100;

// Every `Atc` field, and nothing else. `select('*')` also pulled `tsv` (the
// search tsvector), which no tree consumer reads and which the layout then
// serialized into the RSC payload twice (tree + rows) for every ATC.
// `workbench-tree-query.test.ts` fails if this list drifts from `Atc`.
export const TREE_ATC_COLUMNS
  = 'id, project_id, module_id, user_story_id, slug, title, layer, version, status, tags, technique, priority, created_at, updated_at, archived_at';

export interface ExplorerTestSourceRow {
  id: string
  title: string
  created_at: string
  test_steps: { count: number }[]
}

export function batchIds(ids: string[], size: number = TREE_IN_FILTER_BATCH): string[][] {
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    batches.push(ids.slice(start, start + size));
  }
  return batches;
}

async function fetchInBatches<T>(
  ids: string[],
  fetchBatch: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.all(batchIds(ids).map(fetchBatch));
  return results.flat();
}

// Live modules of the Project, in display order.
export async function fetchTreeModules(db: Db, projectId: string): Promise<Module[]> {
  return fetchAllPages<Module>(async (offset, limit) => {
    const { data, error } = await db
      .from('modules')
      .select('*')
      .eq('project_id', projectId)
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    return { data: data as Module[] | null, error };
  });
}

// Live ATCs of the Project. Neither the explorer nor the table sorts ATCs, so
// fetch order is display order: creation order, as the unordered read
// returned them in practice.
export async function fetchTreeAtcs(db: Db, projectId: string): Promise<Atc[]> {
  return fetchAllPages<Atc>(async (offset, limit) => {
    const { data, error } = await db
      .from('atcs')
      .select(TREE_ATC_COLUMNS)
      .eq('project_id', projectId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    return { data: data as Atc[] | null, error };
  });
}

// Live stories of the given (live) modules. Batched by module, so every
// module's stories come back from one batch, in creation order.
export async function fetchTreeStories(db: Db, moduleIds: string[]): Promise<UserStory[]> {
  return fetchInBatches(moduleIds, async batch => fetchAllPages<UserStory>(async (offset, limit) => {
    const { data, error } = await db
      .from('user_stories')
      .select('*')
      .in('module_id', batch)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    return { data: data as UserStory[] | null, error };
  }));
}

// Live ACs of the given (live) stories. `buildModuleTree` re-sorts each
// story's ACs by `position`.
export async function fetchTreeAcceptanceCriteria(
  db: Db,
  storyIds: string[],
): Promise<AcceptanceCriterion[]> {
  return fetchInBatches(storyIds, async batch => fetchAllPages<AcceptanceCriterion>(async (offset, limit) => {
    const { data, error } = await db
      .from('acceptance_criteria')
      .select('*')
      .in('user_story_id', batch)
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    return { data: data as AcceptanceCriterion[] | null, error };
  }));
}

// The workspace's Tests for the explorer's Tests group (BK-27), newest first.
export async function fetchExplorerTests(db: Db, workspaceId: string): Promise<ExplorerTestSourceRow[]> {
  return fetchAllPages<ExplorerTestSourceRow>(async (offset, limit) => {
    const { data, error } = await db
      .from('tests')
      .select('id, title, created_at, test_steps(count)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    return { data: data as ExplorerTestSourceRow[] | null, error };
  });
}
