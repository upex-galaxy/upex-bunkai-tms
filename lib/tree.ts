import type {
  AcceptanceCriterion,
  Atc,
  Module,
  ModuleTreeNode,
  UserStory,
  UserStoryWithChildren,
} from '@lib/types';

// Pure builder: flat lists of modules / stories / ACs / ATCs → nested
// ModuleTreeNode roots. Phase B used this on mock data; Phase D feeds it
// from `select('*')` queries against Supabase.
//
// The shape intentionally avoids any I/O: every consumer (server component,
// future client revalidation hook, server action) should hydrate flat arrays
// first, then call this once.

export interface BuildModuleTreeInput {
  modules: Module[]
  stories: UserStory[]
  acceptanceCriteria: AcceptanceCriterion[]
  atcs: Atc[]
}

export function buildModuleTree(input: BuildModuleTreeInput): ModuleTreeNode[] {
  const { modules, stories, acceptanceCriteria, atcs } = input;

  const nodeMap = new Map<string, ModuleTreeNode>();
  for (const mod of modules) {
    nodeMap.set(mod.id, {
      ...mod,
      children: [],
      user_stories: [],
      atcs: [],
    });
  }

  const acsByStory = new Map<string, AcceptanceCriterion[]>();
  for (const ac of acceptanceCriteria) {
    const bucket = acsByStory.get(ac.user_story_id);
    if (bucket) {
      bucket.push(ac);
    }
    else {
      acsByStory.set(ac.user_story_id, [ac]);
    }
  }
  for (const bucket of acsByStory.values()) {
    bucket.sort((a, b) => a.position - b.position);
  }

  const atcsByStory = new Map<string, Atc[]>();
  for (const atc of atcs) {
    const bucket = atcsByStory.get(atc.user_story_id);
    if (bucket) {
      bucket.push(atc);
    }
    else {
      atcsByStory.set(atc.user_story_id, [atc]);
    }
  }

  const storiesByModule = new Map<string, UserStoryWithChildren[]>();
  for (const story of stories) {
    const withChildren: UserStoryWithChildren = {
      ...story,
      acceptance_criteria: acsByStory.get(story.id) ?? [],
      atcs: atcsByStory.get(story.id) ?? [],
    };
    const bucket = storiesByModule.get(story.module_id);
    if (bucket) {
      bucket.push(withChildren);
    }
    else {
      storiesByModule.set(story.module_id, [withChildren]);
    }
  }

  const atcsByModule = new Map<string, Atc[]>();
  for (const atc of atcs) {
    const bucket = atcsByModule.get(atc.module_id);
    if (bucket) {
      bucket.push(atc);
    }
    else {
      atcsByModule.set(atc.module_id, [atc]);
    }
  }

  for (const node of nodeMap.values()) {
    node.user_stories = storiesByModule.get(node.id) ?? [];
    node.atcs = atcsByModule.get(node.id) ?? [];
  }

  const roots: ModuleTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parent_module_id === null) {
      roots.push(node);
    }
    else {
      const parent = nodeMap.get(node.parent_module_id);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  const sortChildren = (n: ModuleTreeNode): void => {
    n.children.sort((a, b) => a.position - b.position);
    n.children.forEach(sortChildren);
  };
  roots.sort((a, b) => a.position - b.position);
  roots.forEach(sortChildren);

  return roots;
}

// Minimal shape needed to walk the parent chain. Accepts full `Module[]` or any
// projection carrying these three fields, so callers can pass query rows
// directly without widening to the full row type.
type ModuleChainNode = Pick<Module, 'id' | 'parent_module_id' | 'name'>;

// Builds the display-name breadcrumb for a module by walking `parent_module_id`
// up to the root, returning names ordered root→module (e.g. ['Payment',
// 'Refunds']). The materialized `path` column stores SLUGS, so it cannot be used
// for a human-readable breadcrumb — this composes from `name` instead.
//
// Pure + framework-agnostic. Guards against missing parents (stops the walk) and
// cycles (bounded by the node count via a visited set), returning whatever
// prefix was resolved. Unknown `moduleId` yields an empty array.
export function moduleBreadcrumb(
  modules: ModuleChainNode[],
  moduleId: string,
): string[] {
  const byId = new Map<string, ModuleChainNode>();
  for (const mod of modules) { byId.set(mod.id, mod); }

  const names: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(moduleId) ?? null;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.push(current.name);
    current = current.parent_module_id
      ? byId.get(current.parent_module_id) ?? null
      : null;
  }

  return names.reverse();
}
