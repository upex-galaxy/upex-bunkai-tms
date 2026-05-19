import { AtcEditor } from '@components/atcs/AtcEditor';
import {
  getAcceptanceCriteriaForStory,
  getAssertionsForAtc,
  getAtc,
  getBoundAcIdsForAtc,
  getProjectBySlug,
  getStepsForAtc,
  modules,
  userStories,
} from '@lib/mock';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, atcId: string }>
}

export default async function AtcEditorPage({ params }: PageProps) {
  const { projectSlug, atcId } = await params;

  const project = getProjectBySlug(projectSlug);
  if (!project) { notFound(); }

  const atc = getAtc(atcId);
  if (!atc || atc.project_id !== project.id) { notFound(); }

  const module_ = modules.find(m => m.id === atc.module_id) ?? null;
  const steps = getStepsForAtc(atc.id);
  const assertions = getAssertionsForAtc(atc.id);
  const boundAcIds = getBoundAcIdsForAtc(atc.id);

  // All stories in the project's modules (for the picker)
  const projectModuleIds = new Set(
    modules.filter(m => m.project_id === project.id).map(m => m.id),
  );
  const projectStories = userStories.filter(s => projectModuleIds.has(s.module_id));

  const storyAcs: Record<string, ReturnType<typeof getAcceptanceCriteriaForStory>> = {};
  for (const s of projectStories) {
    storyAcs[s.id] = getAcceptanceCriteriaForStory(s.id);
  }

  return (
    <AtcEditor
      atc={atc}
      module={module_}
      modulePath={module_?.path ?? '—'}
      initialSteps={steps}
      initialAssertions={assertions}
      initialAcIds={boundAcIds}
      stories={projectStories}
      storyAcs={storyAcs}
      projectSlug={project.slug}
    />
  );
}
