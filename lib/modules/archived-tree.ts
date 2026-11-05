import type { AcceptanceCriterion, Module, UserStory } from '@lib/types';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import {
  batchIds,
  fetchTreeAcceptanceCriteria,
  fetchTreeModules,
  fetchTreeStories,
} from '@lib/projects/workbench-tree-query';
import { resolveActivityActors } from '@lib/supabase/rpc';

// BK-601 — the Module tree listing behind GET /api/v1/projects/{id}/modules, and what
// each archived row says about itself (AI Product Owner ruling of 2026-11-05, gap 6):
//   * the top Module of an archive: when, and who, from its `module.archived` entry;
//   * a row that archive swept up: "archived with <Module>", same person and date;
//   * a Criterion that went with a Story archived on its own: "with <Story>", date only;
//   * a Story or Criterion archived on its own: the date only, because no actor was
//     ever recorded and the screen must not invent one.

export interface ArchiveActor {
  user_id: string
  email: string | null
}

export interface ArchiveInfo {
  archived_at: string
  archived_by: ArchiveActor | null
  archived_with: string | null
}

interface ArchiveStamp {
  archived_at: string | null
  archive_batch_id?: string | null
}

// Two rows went down in one archive: the same batch or, for rows archived before the
// batch id existed, no batch and the same instant.
function sameArchive(a: ArchiveStamp, b: ArchiveStamp): boolean {
  if (a.archived_at === null || b.archived_at === null) { return false; }
  if (a.archive_batch_id || b.archive_batch_id) { return a.archive_batch_id === b.archive_batch_id; }
  return Date.parse(a.archived_at) === Date.parse(b.archived_at);
}

export interface AnnotateInput {
  modules: Module[]
  stories: UserStory[]
  criteria: AcceptanceCriterion[]
  // The actor of each Module's latest `module.archived` entry, by Module id.
  actorByModule: ReadonlyMap<string, ArchiveActor>
}

export interface AnnotatedTree {
  modules: Map<string, ArchiveInfo>
  stories: Map<string, ArchiveInfo>
  criteria: Map<string, ArchiveInfo>
}

export function annotateArchive({ modules, stories, criteria, actorByModule }: AnnotateInput): AnnotatedTree {
  const moduleById = new Map(modules.map(m => [m.id, m]));
  const storyById = new Map(stories.map(s => [s.id, s]));

  // The top of the archive this Module went down in. A chain is at most 6 long and
  // acyclic by the move guard; the visited set only keeps a corrupt row from hanging.
  const topOf = (mod: Module): Module => {
    let top = mod;
    const visited = new Set<string>([mod.id]);
    while (top.parent_module_id !== null) {
      const parent = moduleById.get(top.parent_module_id);
      if (!parent || visited.has(parent.id) || !sameArchive(parent, top)) { break; }
      visited.add(parent.id);
      top = parent;
    }
    return top;
  };

  const result: AnnotatedTree = { modules: new Map(), stories: new Map(), criteria: new Map() };

  for (const mod of modules) {
    if (mod.archived_at === null) { continue; }
    const top = topOf(mod);
    result.modules.set(mod.id, {
      archived_at: mod.archived_at,
      archived_by: actorByModule.get(top.id) ?? null,
      archived_with: top.id === mod.id ? null : top.name,
    });
  }

  for (const story of stories) {
    if (story.archived_at === null) { continue; }
    const mod = moduleById.get(story.module_id);
    const top = mod && sameArchive(story, mod) ? topOf(mod) : null;
    result.stories.set(story.id, {
      archived_at: story.archived_at,
      archived_by: top ? actorByModule.get(top.id) ?? null : null,
      archived_with: top?.name ?? null,
    });
  }

  for (const criterion of criteria) {
    if (criterion.archived_at === null) { continue; }
    const story = storyById.get(criterion.user_story_id);
    const storyInfo = story && sameArchive(criterion, story) ? result.stories.get(story.id) : undefined;
    result.criteria.set(criterion.id, {
      archived_at: criterion.archived_at,
      archived_by: storyInfo?.archived_by ?? null,
      archived_with: storyInfo ? storyInfo.archived_with ?? story?.title ?? null : null,
    });
  }

  return result;
}

export interface ModuleTreeListing {
  modules: (Omit<Module, 'archive_batch_id'> & { archive: ArchiveInfo | null })[]
  user_stories: (Omit<UserStory, 'archive_batch_id' | 'project_id'> & { archive: ArchiveInfo | null })[]
  acceptance_criteria: (Omit<AcceptanceCriterion, 'archive_batch_id'> & { archive: ArchiveInfo | null })[]
}

async function loadArchiveActors(
  db: SupabaseClient<Database>,
  workspaceId: string,
  moduleIds: string[],
): Promise<Map<string, ArchiveActor>> {
  const actorIdByModule = new Map<string, string>();
  for (const batch of batchIds(moduleIds)) {
    const { data, error } = await db
      .from('activity_log')
      .select('entity_id, actor_user_id, created_at')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'module')
      .eq('action', 'module.archived')
      .in('entity_id', batch)
      .order('created_at', { ascending: false });
    if (error) {
      throw new ApiError('internal_error', error.message);
    }
    // Newest first: the latest entry is the archive in force.
    const seen = new Set<string>();
    for (const row of data ?? []) {
      if (row.entity_id === null || seen.has(row.entity_id)) { continue; }
      seen.add(row.entity_id);
      if (row.actor_user_id !== null) { actorIdByModule.set(row.entity_id, row.actor_user_id); }
    }
  }

  const userIds = [...new Set(actorIdByModule.values())];
  if (userIds.length === 0) { return new Map(); }
  const { data: actors, error } = await resolveActivityActors(db, { workspaceId, userIds });
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  const emailById = new Map((actors ?? []).map(a => [a.user_id, a.email]));
  return new Map([...actorIdByModule].map(([moduleId, userId]) => [
    moduleId,
    { user_id: userId, email: emailById.get(userId) ?? null },
  ]));
}

export async function loadModuleTreeListing(
  db: SupabaseClient<Database>,
  args: { projectId: string, workspaceId: string, includeArchived: boolean },
): Promise<ModuleTreeListing> {
  const options = { includeArchived: args.includeArchived };
  const modules = await fetchTreeModules(db, args.projectId, options);
  const stories = await fetchTreeStories(db, modules.map(m => m.id), options);
  const criteria = await fetchTreeAcceptanceCriteria(db, stories.map(s => s.id), options);

  const archivedModuleIds = modules.filter(m => m.archived_at !== null).map(m => m.id);
  const actorByModule = await loadArchiveActors(db, args.workspaceId, archivedModuleIds);
  const info = annotateArchive({ modules, stories, criteria, actorByModule });

  return {
    modules: modules.map(m => ({
      id: m.id,
      project_id: m.project_id,
      parent_module_id: m.parent_module_id,
      path: m.path,
      name: m.name,
      position: m.position,
      description: m.description,
      created_at: m.created_at,
      archived_at: m.archived_at,
      archive: info.modules.get(m.id) ?? null,
    })),
    user_stories: stories.map(s => ({
      id: s.id,
      module_id: s.module_id,
      title: s.title,
      description: s.description,
      external_id: s.external_id,
      external_url: s.external_url,
      status: s.status,
      created_at: s.created_at,
      archived_at: s.archived_at,
      archive: info.stories.get(s.id) ?? null,
    })),
    acceptance_criteria: criteria.map(c => ({
      id: c.id,
      user_story_id: c.user_story_id,
      title: c.title,
      description: c.description,
      position: c.position,
      created_at: c.created_at,
      archived_at: c.archived_at,
      archive: info.criteria.get(c.id) ?? null,
    })),
  };
}
