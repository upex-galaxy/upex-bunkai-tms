'use server';

import type {
  AcceptanceCriterion,
  Atc,
  AtcAssertion,
  AtcStep,
  UserStory,
} from '@lib/types';
import { createClient } from '@lib/supabase/server';

// Read-only bundle the Tree-view ATC detail pane needs. Same shape the editor
// page assembles, minus the anchoring picker data — this is render-only. RLS on
// the user's server client gates every table, so an out-of-workspace ATC simply
// resolves to null (the pane shows a not-found state).
export interface AtcDetail {
  atc: Atc
  modulePath: string
  steps: AtcStep[]
  assertions: AtcAssertion[]
  acIds: string[]
  story: UserStory | null
  storyCriteria: AcceptanceCriterion[]
}

export async function getAtcDetailAction(
  projectSlug: string,
  atcId: string,
): Promise<AtcDetail | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();

  if (!project) { return null; }

  const { data: atc } = await supabase
    .from('atcs')
    .select('*')
    .eq('id', atcId)
    .eq('project_id', project.id)
    .is('archived_at', null)
    .maybeSingle();

  if (!atc) { return null; }

  const [{ data: stepsData }, { data: assertionsData }, { data: boundData }, { data: moduleData }] = await Promise.all([
    supabase.from('atc_steps').select('*').eq('atc_id', atc.id).order('position', { ascending: true }),
    supabase.from('atc_assertions').select('*').eq('atc_id', atc.id).order('position', { ascending: true }),
    supabase.from('atc_acceptance_criteria').select('acceptance_criterion_id').eq('atc_id', atc.id),
    supabase.from('modules').select('path').eq('id', atc.module_id).maybeSingle(),
  ]);

  let story: UserStory | null = null;
  let storyCriteria: AcceptanceCriterion[] = [];
  if (atc.user_story_id) {
    const { data: storyData } = await supabase
      .from('user_stories')
      .select('*')
      .eq('id', atc.user_story_id)
      .is('archived_at', null)
      .maybeSingle();
    story = (storyData ?? null) as UserStory | null;

    const { data: criteriaData } = await supabase
      .from('acceptance_criteria')
      .select('*')
      .eq('user_story_id', atc.user_story_id)
      .is('archived_at', null)
      .order('position', { ascending: true });
    storyCriteria = (criteriaData ?? []) as AcceptanceCriterion[];
  }

  return {
    atc: atc as Atc,
    modulePath: moduleData?.path ?? '—',
    steps: (stepsData ?? []) as AtcStep[],
    assertions: (assertionsData ?? []) as AtcAssertion[],
    acIds: (boundData ?? []).map(b => b.acceptance_criterion_id),
    story,
    storyCriteria,
  };
}
