import type { ModuleOption } from '@components/atcs/NewAtcEditor';
import type { AcceptanceCriterion, UserStory } from '@lib/types';
import { NewAtcEditor } from '@components/atcs/NewAtcEditor';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ story?: string, ac?: string }>
}

export default async function NewAtcPage({ params, searchParams }: PageProps) {
  const { projectSlug } = await params;
  const { story: storyParam, ac: acParam } = await searchParams;
  const supabase = await createClient();

  // Project slugs are only unique PER WORKSPACE (BK-52), so the lookup must be
  // scoped to the caller's active workspace — RLS alone would happily match a
  // same-slug project from another workspace the caller belongs to.
  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieActive,
    (workspaceRows ?? []).map(w => w.id),
  );
  if (!activeWorkspaceId) { notFound(); }

  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('workspace_id', activeWorkspaceId)
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

  // Resolve the explorer "Create ATC" deep-link (`?story=…&ac=…`). Only honour
  // params that point at material visible in THIS project (RLS-narrowed above),
  // so a stale or hand-edited URL can never pre-anchor to foreign content. The
  // module defaults to the story's own module.
  const initialStory = storyParam
    ? stories.find(s => s.id === storyParam) ?? null
    : null;
  const initialStoryId = initialStory?.id ?? null;
  const initialModuleId = initialStory?.module_id ?? null;
  const initialAcIds
    = initialStoryId && acParam
      && (storyAcs[initialStoryId] ?? []).some(ac => ac.id === acParam)
      ? [acParam]
      : [];

  return (
    <NewAtcEditor
      projectSlug={project.slug}
      modules={modules}
      stories={stories}
      storyAcs={storyAcs}
      initialStoryId={initialStoryId}
      initialAcIds={initialAcIds}
      initialModuleId={initialModuleId}
    />
  );
}
