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
