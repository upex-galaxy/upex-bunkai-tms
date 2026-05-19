import type {
  AcceptanceCriterion,
  Atc,
  Module,
  ModuleTreeNode,
  UserStoryWithChildren,
} from '@lib/types';
import { acceptanceCriteria } from './acceptance-criteria';
import { atcAcceptanceCriteria, atcAssertions, atcs, atcSteps } from './atcs';
import { modules } from './modules';
import { projects } from './projects';
import { userStories } from './user-stories';
import { workspaceMembers, workspaces } from './workspaces';

export {
  acceptanceCriteria,
  atcAcceptanceCriteria,
  atcAssertions,
  atcs,
  atcSteps,
  modules,
  projects,
  userStories,
  workspaceMembers,
  workspaces,
};

export function getProjectBySlug(slug: string) {
  return projects.find(p => p.slug === slug);
}

export function getWorkspaceById(id: string) {
  return workspaces.find(w => w.id === id);
}

export function getModulesForProject(projectId: string): Module[] {
  return modules.filter(m => m.project_id === projectId);
}

export function getAcceptanceCriteriaForStory(storyId: string): AcceptanceCriterion[] {
  return acceptanceCriteria
    .filter(ac => ac.user_story_id === storyId)
    .sort((a, b) => a.position - b.position);
}

export function getAtcsForModule(moduleId: string): Atc[] {
  return atcs.filter(a => a.module_id === moduleId);
}

export function getAtcsForProject(projectId: string): Atc[] {
  return atcs.filter(a => a.project_id === projectId);
}

export function getAtc(atcId: string): Atc | undefined {
  return atcs.find(a => a.id === atcId);
}

export function getStepsForAtc(atcId: string) {
  return atcSteps.filter(s => s.atc_id === atcId).sort((a, b) => a.position - b.position);
}

export function getAssertionsForAtc(atcId: string) {
  return atcAssertions.filter(a => a.atc_id === atcId).sort((a, b) => a.position - b.position);
}

export function getBoundAcIdsForAtc(atcId: string): string[] {
  return atcAcceptanceCriteria
    .filter(j => j.atc_id === atcId)
    .map(j => j.acceptance_criterion_id);
}

export function buildModuleTree(projectId: string): ModuleTreeNode[] {
  const projectModules = getModulesForProject(projectId);
  const projectAtcs = atcs.filter(a => a.project_id === projectId);

  const nodeMap = new Map<string, ModuleTreeNode>();
  for (const mod of projectModules) {
    nodeMap.set(mod.id, {
      ...mod,
      children: [],
      user_stories: [],
      atcs: [],
    });
  }

  const storiesByModule = new Map<string, UserStoryWithChildren[]>();
  for (const story of userStories) {
    const acs = getAcceptanceCriteriaForStory(story.id);
    const storyAtcs = projectAtcs.filter(a => a.user_story_id === story.id);
    const withChildren: UserStoryWithChildren = {
      ...story,
      acceptance_criteria: acs,
      atcs: storyAtcs,
    };
    if (!storiesByModule.has(story.module_id)) { storiesByModule.set(story.module_id, []); }
    storiesByModule.get(story.module_id)!.push(withChildren);
  }

  for (const node of nodeMap.values()) {
    node.user_stories = storiesByModule.get(node.id) ?? [];
    node.atcs = projectAtcs.filter(a => a.module_id === node.id);
  }

  const roots: ModuleTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parent_module_id === null) {
      roots.push(node);
    }
    else {
      const parent = nodeMap.get(node.parent_module_id);
      if (parent) { parent.children.push(node); }
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
