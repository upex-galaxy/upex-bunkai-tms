'use client';

import type { Atc, ModuleTreeNode } from '@lib/types';
import { AtcTable } from '@components/atcs/AtcTable';
import { CommandPalette } from '@components/layout/CommandPalette';
import { Breadcrumb, Topbar } from '@components/layout/Topbar';
import { Button, buttonVariants } from '@components/ui/button';
import { cn } from '@lib/utils';
import { ListTree, Network, Plus, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MindMapView } from './mind-map-view';
import { ProjectExplorer } from './project-explorer';

type View = 'tree' | 'table' | 'mindmap';

const VIEWS: { key: View, label: string, icon: typeof ListTree }[] = [
  { key: 'tree', label: 'Tree', icon: ListTree },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'mindmap', label: 'Mind map', icon: Network },
];

interface ProjectWorkbenchProps {
  projectId: string
  projectSlug: string
  projectName: string
  workspaceName: string
  tree: ModuleTreeNode[]
  rows: (Atc & { module_path: string })[]
  canCreate: boolean
}

// Client shell that owns the Tree / Table / Mind map view switch (mockup
// `screens/project.jsx` Topbar `center`). The server page hands it the already
// built tree + flattened rows; this only chooses what the workbench renders.
export function ProjectWorkbench({
  projectId,
  projectSlug,
  projectName,
  workspaceName,
  tree,
  rows,
  canCreate,
}: ProjectWorkbenchProps) {
  const [view, setView] = useState<View>('tree');

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0">
      <Topbar
        left={<Breadcrumb items={[workspaceName, projectName, 'All ATCs']} />}
        center={(
          <div
            className="inline-flex items-center gap-0.5 rounded-2 border border-stroke-1 bg-surface-1 p-0.5"
            role="tablist"
            aria-label="Project view"
          >
            {VIEWS.map(v => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                data-testid={`view-toggle-${v.key}`}
                onClick={() => setView(v.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-1 px-2.5 py-1 text-xs font-medium transition-colors',
                  view === v.key
                    ? 'bg-surface-3 text-fg-0'
                    : 'text-fg-3 hover:text-fg-1',
                )}
              >
                <v.icon size={12} />
                {v.label}
              </button>
            ))}
          </div>
        )}
        right={(
          <>
            <CommandPalette />
            <Link
              href={`/projects/${projectSlug}/atcs/new`}
              className={buttonVariants({ size: 'sm' })}
              data-testid="project-new-atc"
            >
              <Plus size={11} />
              {' '}
              New ATC
            </Link>
            <Button
              variant="primary"
              size="sm"
              disabled
              title="Test builder ships next sprint"
              className="cursor-not-allowed opacity-60"
            >
              <Plus size={11} />
              {' '}
              New Test
            </Button>
          </>
        )}
      />
      <div className="flex flex-1 overflow-hidden">
        {view === 'tree' && (
          <>
            <ProjectExplorer
              projectId={projectId}
              projectSlug={projectSlug}
              projectName={projectName}
              tree={tree}
              canCreate={canCreate}
            />
            <main className="flex flex-1 flex-col overflow-hidden bg-surface-0">
              <AtcTable atcs={rows} projectSlug={projectSlug} />
            </main>
          </>
        )}
        {view === 'table' && (
          <main className="flex flex-1 flex-col overflow-hidden bg-surface-0">
            <AtcTable atcs={rows} projectSlug={projectSlug} />
          </main>
        )}
        {view === 'mindmap' && <MindMapView tree={tree} projectSlug={projectSlug} />}
      </div>
    </div>
  );
}
