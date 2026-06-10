import type { Atc, Module, UserStory } from '@lib/types';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { buildModuleTree } from '@lib/tree';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProjectWorkbench } from './project-workbench';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectSlug } = await params;
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

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();

  if (projectErr || !project) { notFound(); }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', project.workspace_id)
    .single();

  if (!workspace) { notFound(); }

  // Resolve the caller's workspace role to gate the create-module affordances.
  // A `viewer` can read the tree but not create; `member`/`admin`/`owner` can.
  // The API enforces this server-side (403 not_a_member); this is a UX hint so
  // viewers do not see a control that would only fail. If the role can't be
  // resolved we default to hiding the affordance.
  const { data: { user } } = await supabase.auth.getUser();
  let canCreate = false;
  if (user) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', project.workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    canCreate = membership != null && membership.role !== 'viewer';
  }

  // `archived_at IS NULL` keeps soft-deleted (BK-10) modules and their cascade
  // out of the active tree and every downstream listing.
  const { data: modulesData } = await supabase
    .from('modules')
    .select('*')
    .eq('project_id', project.id)
    .is('archived_at', null)
    .order('position', { ascending: true });

  const moduleIds = (modulesData ?? []).map(m => m.id);

  const [{ data: storiesData }, { data: atcsData }] = await Promise.all([
    moduleIds.length > 0
      ? supabase.from('user_stories').select('*').in('module_id', moduleIds).is('archived_at', null)
      : Promise.resolve({ data: [] as UserStory[] }),
    supabase.from('atcs').select('*').eq('project_id', project.id).is('archived_at', null),
  ]);

  const storyIds = (storiesData ?? []).map(s => s.id);
  const { data: acsData } = storyIds.length > 0
    ? await supabase.from('acceptance_criteria').select('*').in('user_story_id', storyIds).is('archived_at', null)
    : { data: [] };

  const modules = (modulesData ?? []) as Module[];
  const stories = (storiesData ?? []) as UserStory[];
  const atcs = (atcsData ?? []) as Atc[];

  const tree = buildModuleTree({
    modules,
    stories,
    acceptanceCriteria: acsData ?? [],
    atcs,
  });

  const moduleById = new Map(modules.map(m => [m.id, m]));
  const rows = atcs.map(a => ({
    ...a,
    module_path: moduleById.get(a.module_id)?.path ?? '—',
  }));

  return (
    <ProjectWorkbench
      projectId={project.id}
      projectSlug={project.slug}
      projectName={project.name}
      workspaceName={workspace.name}
      tree={tree}
      rows={rows}
      canCreate={canCreate}
    />
  );
}
