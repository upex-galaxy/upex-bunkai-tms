import type { Atc, Module, UserStory } from '@lib/types';
import type { ReactNode } from 'react';
import type { ExplorerTestItem } from './project-explorer';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { buildModuleTree } from '@lib/tree';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProjectShell } from './project-shell';

interface LayoutProps {
  children: ReactNode
  params: Promise<{ projectSlug: string }>
}

// Persistent project layout (BK-147). Loads the explorer tree + Tests once and
// renders the project shell (explorer + toolbar + tab bar) around `children`.
// Next keeps this layout mounted across the index, an open ATC, and an open
// Test, so the explorer never disappears. The detail routes render their own
// content into the shell's content slot. See ADR-0003.
export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  // Project slugs are only unique PER WORKSPACE (BK-52), so the lookup must be
  // scoped to the caller's active workspace.
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

  // Resolve the caller's workspace role to gate the create affordances (the API
  // remains the authority; this is a UX hint). Default to hiding when unknown.
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

  // Workspace Tests (BK-27) feed the explorer's flat Tests group.
  const [{ data: storiesData }, { data: atcsData }, { data: testsData }] = await Promise.all([
    moduleIds.length > 0
      ? supabase.from('user_stories').select('*').in('module_id', moduleIds).is('archived_at', null)
      : Promise.resolve({ data: [] as UserStory[] }),
    supabase.from('atcs').select('*').eq('project_id', project.id).is('archived_at', null),
    supabase
      .from('tests')
      .select('id, title, created_at, test_steps(count)')
      .eq('workspace_id', activeWorkspaceId)
      .order('created_at', { ascending: false }),
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

  const tests: ExplorerTestItem[] = (testsData ?? []).map(t => ({
    id: t.id,
    title: t.title,
    created_at: t.created_at,
    step_count: t.test_steps[0]?.count ?? 0,
  }));

  return (
    <ProjectShell
      key={project.slug}
      projectId={project.id}
      projectSlug={project.slug}
      projectName={project.name}
      workspaceName={workspace.name}
      tree={tree}
      rows={rows}
      tests={tests}
      canCreate={canCreate}
    >
      {children}
    </ProjectShell>
  );
}
