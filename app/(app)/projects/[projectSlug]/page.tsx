import { AtcTable } from '@components/atcs/AtcTable';
import { CommandPalette } from '@components/layout/CommandPalette';
import { Sidebar } from '@components/layout/Sidebar';
import { Breadcrumb, Topbar } from '@components/layout/Topbar';
import { WorkspaceSwitcher } from '@components/layout/WorkspaceSwitcher';
import { Button } from '@components/ui/button';
import {
  buildModuleTree,
  getAtcsForProject,
  getProjectBySlug,
  getWorkspaceById,
  modules,
} from '@lib/mock';
import { Plus } from 'lucide-react';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectSlug } = await params;
  const project = getProjectBySlug(projectSlug);
  if (!project) { notFound(); }

  const workspace = getWorkspaceById(project.workspace_id);
  if (!workspace) { notFound(); }

  const tree = buildModuleTree(project.id);
  const projectAtcs = getAtcsForProject(project.id);
  const moduleById = new Map(modules.map(m => [m.id, m]));
  const rows = projectAtcs.map(a => ({
    ...a,
    module_path: moduleById.get(a.module_id)?.path ?? '—',
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0">
      <Topbar
        left={(
          <>
            <WorkspaceSwitcher workspace={workspace} project={project} />
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
