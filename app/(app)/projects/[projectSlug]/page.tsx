import type { Atc, Module, UserStory, Workspace } from '@lib/types';
import { AtcTable } from '@components/atcs/AtcTable';
import { CommandPalette } from '@components/layout/CommandPalette';
import { Sidebar } from '@components/layout/Sidebar';
import { Breadcrumb, Topbar } from '@components/layout/Topbar';
import { WorkspaceSwitcher } from '@components/layout/WorkspaceSwitcher';
import { Button } from '@components/ui/button';
import { createClient } from '@lib/supabase/server';
import { buildModuleTree } from '@lib/tree';
import { Plus } from 'lucide-react';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  // RLS narrows visible projects to workspaces the caller is a member of, so
  // a single-row match is the natural shape for MVP single-workspace users.
  // When multi-workspace lands, route shape becomes
  // `/projects/{workspaceSlug}/{projectSlug}` and this lookup gains the
  // workspace filter.
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('*')
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

  const { data: modulesData } = await supabase
    .from('modules')
    .select('*')
    .eq('project_id', project.id)
    .order('position', { ascending: true });

  const moduleIds = (modulesData ?? []).map(m => m.id);

  const [{ data: storiesData }, { data: atcsData }] = await Promise.all([
    moduleIds.length > 0
      ? supabase.from('user_stories').select('*').in('module_id', moduleIds)
      : Promise.resolve({ data: [] as UserStory[] }),
    supabase.from('atcs').select('*').eq('project_id', project.id),
  ]);

  const storyIds = (storiesData ?? []).map(s => s.id);
  const { data: acsData } = storyIds.length > 0
    ? await supabase.from('acceptance_criteria').select('*').in('user_story_id', storyIds)
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
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0">
      <Topbar
        left={(
          <>
            <WorkspaceSwitcher workspace={workspace as Workspace} project={project} />
            <span className="text-fg-4">·</span>
            <Breadcrumb items={[workspace.name, project.name, 'All ATCs']} />
          </>
        )}
        center={null}
        right={(
          <>
            <CommandPalette />
            <Button size="sm">
              <Plus size={11} />
              {' '}
              New ATC
              <span className="kbd ml-1">N</span>
            </Button>
            <Button variant="primary" size="sm">
              <Plus size={11} />
              {' '}
              New Test
            </Button>
          </>
        )}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projectSlug={project.slug}
          projectName={project.name}
          tree={tree}
        />
        <main className="flex flex-1 flex-col overflow-hidden bg-surface-0">
          <AtcTable atcs={rows} projectSlug={project.slug} />
        </main>
      </div>
    </div>
  );
}
