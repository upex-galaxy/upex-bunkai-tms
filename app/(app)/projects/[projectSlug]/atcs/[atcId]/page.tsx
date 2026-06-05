import type {
  AcceptanceCriterion,
  Atc,
  AtcAssertion,
  AtcStep,
  Module,
  UserStory,
} from '@lib/types';
import { AtcEditor } from '@components/atcs/AtcEditor';
import { createClient } from '@lib/supabase/server';
import { notFound } from 'next/navigation';
import { saveAtcAction } from './actions';

interface PageProps {
  params: Promise<{ projectSlug: string, atcId: string }>
}

export default async function AtcEditorPage({ params }: PageProps) {
  const { projectSlug, atcId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();

  if (!project) { notFound(); }

  // A soft-deleted (archived) ATC must 404 on its deep-link, matching its
  // absence from the listings (BK-10 soft-delete cascade).
  const { data: atc } = await supabase
    .from('atcs')
    .select('*')
    .eq('id', atcId)
    .eq('project_id', project.id)
    .is('archived_at', null)
    .maybeSingle();

  if (!atc) { notFound(); }

  const [{ data: stepsData }, { data: assertionsData }, { data: boundData }, { data: moduleData }] = await Promise.all([
    supabase.from('atc_steps').select('*').eq('atc_id', atc.id).order('position', { ascending: true }),
    supabase.from('atc_assertions').select('*').eq('atc_id', atc.id).order('position', { ascending: true }),
    supabase.from('atc_acceptance_criteria').select('acceptance_criterion_id').eq('atc_id', atc.id),
    supabase.from('modules').select('*').eq('id', atc.module_id).maybeSingle(),
  ]);

  // For the anchoring picker we need every story in the project + their ACs —
  // archived (soft-deleted) modules/stories/criteria are excluded so an ATC can
  // never be re-anchored to retired content.
  const { data: projectModules } = await supabase
    .from('modules')
    .select('id')
    .eq('project_id', project.id)
    .is('archived_at', null);

  const moduleIds = (projectModules ?? []).map(m => m.id);

  const { data: storiesData } = moduleIds.length > 0
    ? await supabase.from('user_stories').select('*').in('module_id', moduleIds).is('archived_at', null)
    : { data: [] };

  const storyIds = (storiesData ?? []).map(s => s.id);
  const { data: acsData } = storyIds.length > 0
    ? await supabase.from('acceptance_criteria').select('*').in('user_story_id', storyIds).is('archived_at', null).order('position', { ascending: true })
    : { data: [] };

  const stories = (storiesData ?? []) as UserStory[];
  const acceptanceCriteria = (acsData ?? []) as AcceptanceCriterion[];
  const storyAcs: Record<string, AcceptanceCriterion[]> = {};
  for (const s of stories) {
    storyAcs[s.id] = acceptanceCriteria.filter(ac => ac.user_story_id === s.id);
  }

  return (
    <AtcEditor
      atc={atc as Atc}
      module={(moduleData ?? null) as Module | null}
      modulePath={moduleData?.path ?? '—'}
      initialSteps={(stepsData ?? []) as AtcStep[]}
      initialAssertions={(assertionsData ?? []) as AtcAssertion[]}
      initialAcIds={(boundData ?? []).map(b => b.acceptance_criterion_id)}
      stories={stories}
      storyAcs={storyAcs}
      projectSlug={project.slug}
      onSave={saveAtcAction}
    />
  );
}
