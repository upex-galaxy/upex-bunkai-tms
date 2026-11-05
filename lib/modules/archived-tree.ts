import type { ArchivedTreeAtc } from '@lib/projects/workbench-tree-query';
import type { AcceptanceCriterion, ArchiveInfo, Atc, Module, UserStory } from '@lib/types';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import {
  batchIds,
  fetchTreeAcceptanceCriteria,
  fetchTreeArchivedAtcs,
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
//     ever recorded and the screen must not invent one;
//   * an ATC archived on its own: its own `archived_by` (BK-571).

type ArchiveActor = NonNullable<ArchiveInfo['archived_by']>;

interface ArchiveStamp {
  archived_at: string | null
  archive_batch_id?: string | null
}

// Two rows went down in one archive: the same batch or, for rows archived before the
// batch id existed, no batch and the same instant.
function sameArchive(a: ArchiveStamp, b: ArchiveStamp): boolean {
  if (a.archived_at === null || b.archived_at === null) { return false; }
  if (a.archive_batch_id || b.archive_batch_id) { return a.archive_batch_id === b.archive_batch_id; }
  return a.archived_at === b.archived_at;
}

// An ATC restored while its parent was archived holds no batch, only the parent's
// stamp and no actor (ADR-0023), and it still returns with that parent.
function atcWentWith(atc: ArchivedTreeAtc, parent: ArchiveStamp): boolean {
  return sameArchive(atc, parent)
    || (atc.archived_by === null && atc.archive_batch_id === null && atc.archived_at === parent.archived_at);
}

export interface AnnotateInput {
  modules: Module[]
  stories: UserStory[]
  criteria: AcceptanceCriterion[]
  atcs?: ArchivedTreeAtc[]
  // The actor of each Module's latest `module.archived` entry, by Module id.
  actorByModule: ReadonlyMap<string, ArchiveActor>
  // Emails of the actors of ATCs archived on their own, by user id.
  emailByUser?: ReadonlyMap<string, string | null>
}

export interface AnnotatedTree {
  modules: Map<string, ArchiveInfo>
  stories: Map<string, ArchiveInfo>
  criteria: Map<string, ArchiveInfo>
  atcs: Map<string, ArchiveInfo>
}

export function annotateArchive({ modules, stories, criteria, atcs = [], actorByModule, emailByUser }: AnnotateInput): AnnotatedTree {
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

  const result: AnnotatedTree = { modules: new Map(), stories: new Map(), criteria: new Map(), atcs: new Map() };

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

  for (const atc of atcs) {
    if (atc.archived_at === null) { continue; }
    const mod = moduleById.get(atc.module_id);
    const story = storyById.get(atc.user_story_id);
    const parentInfo = mod && atcWentWith(atc, mod)
      ? result.modules.get(mod.id)
      : story && atcWentWith(atc, story) ? result.stories.get(story.id) : undefined;
    const parentName = mod && atcWentWith(atc, mod) ? mod.name : story?.title ?? null;
    result.atcs.set(atc.id, parentInfo
      ? {
          archived_at: atc.archived_at,
          archived_by: parentInfo.archived_by,
          archived_with: parentInfo.archived_with ?? parentName,
        }
      : {
          archived_at: atc.archived_at,
          archived_by: atc.archived_by === null
            ? null
            : { user_id: atc.archived_by, email: emailByUser?.get(atc.archived_by) ?? null },
          archived_with: null,
        });
  }

  return result;
}

export interface ModuleTreeListing {
  modules: Module[]
  user_stories: UserStory[]
  acceptance_criteria: AcceptanceCriterion[]
  // Only with the opt-in. Live ATCs are not part of this listing.
  archived_atcs: Atc[]
}

async function loadArchiveActors(
  db: SupabaseClient<Database>,
  workspaceId: string,
  moduleIds: string[],
  atcActorIds: string[],
): Promise<{ actorByModule: Map<string, ArchiveActor>, emailByUser: Map<string, string | null> }> {
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

  const userIds = [...new Set([...actorIdByModule.values(), ...atcActorIds])];
  if (userIds.length === 0) { return { actorByModule: new Map(), emailByUser: new Map() }; }
  const { data: actors, error } = await resolveActivityActors(db, { workspaceId, userIds });
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  const emailByUser = new Map<string, string | null>((actors ?? []).map(a => [a.user_id, a.email]));
  return {
    actorByModule: new Map([...actorIdByModule].map(([moduleId, userId]) => [
      moduleId,
      { user_id: userId, email: emailByUser.get(userId) ?? null },
    ])),
    emailByUser,
  };
}

export async function loadModuleTreeListing(
  db: SupabaseClient<Database>,
  args: { projectId: string, workspaceId: string, includeArchived: boolean },
): Promise<ModuleTreeListing> {
  const options = { includeArchived: args.includeArchived };
  const modules = await fetchTreeModules(db, args.projectId, options);
  const stories = await fetchTreeStories(db, modules.map(m => m.id), options);
  const criteria = await fetchTreeAcceptanceCriteria(db, stories.map(s => s.id), options);
  const atcs = args.includeArchived ? await fetchTreeArchivedAtcs(db, args.projectId) : [];

  const archivedModuleIds = modules.filter(m => m.archived_at !== null).map(m => m.id);
  const atcActorIds = atcs.flatMap(a => (a.archived_by === null ? [] : [a.archived_by]));
  const { actorByModule, emailByUser } = await loadArchiveActors(db, args.workspaceId, archivedModuleIds, atcActorIds);
  const info = annotateArchive({ modules, stories, criteria, atcs, actorByModule, emailByUser });

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
      project_id: s.project_id,
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
    archived_atcs: atcs.map(({ archived_by: _by, archive_batch_id: _batch, ...atc }) => ({
      ...atc,
      archive: info.atcs.get(atc.id) ?? null,
    })),
  };
}
