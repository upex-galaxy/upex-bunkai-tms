import type { ModuleOption } from '@components/atcs/NewAtcEditor';
import type { AcceptanceCriterion, UserStory } from '@lib/types';
import { NewAtcEditor } from '@components/atcs/NewAtcEditor';
import { createClient } from '@lib/supabase/server';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

export default async function NewAtcPage({ params }: PageProps) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  // RLS narrows visible projects to workspaces the caller is a member of.
  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();

  if (!project) { notFound(); }

  // Every non-archived module in the project feeds the Module picker; stories +
  // their ACs feed the anchoring panel. Archived (soft-deleted) content is
  // excluded so a new ATC can never be anchored to retired material — same
  // invariant the edit page enforces.
  const { data: moduleRows } = await supabase
    .from('modules')
    .select('id, path, name')
    .eq('project_id', project.id)
    .is('archived_at', null)
    .order('path', { ascending: true });

  const modules = (moduleRows ?? []) as ModuleOption[];
  const moduleIds = modules.map(m => m.id);

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
    <NewAtcEditor
      projectSlug={project.slug}
      modules={modules}
      stories={stories}
      storyAcs={storyAcs}
    />
  );
}
