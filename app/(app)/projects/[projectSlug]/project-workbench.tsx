'use client';

import type { Atc, ModuleTreeNode } from '@lib/types';
import type { ExplorerTestItem } from './project-explorer';
import { AtcTable } from '@components/atcs/AtcTable';
import { CommandPalette } from '@components/layout/CommandPalette';
import { Breadcrumb, Topbar } from '@components/layout/Topbar';
import { buttonVariants } from '@components/ui/button';
import { cn, shortSlug } from '@lib/utils';
import { ListTree, Network, Plus, Table2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AtcDetailPane } from './atc-detail-pane';
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
  // Workspace Tests (chains of ATCs, BK-27) for the explorer's Tests group.
  tests: ExplorerTestItem[]
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
  tests,
  canCreate,
}: ProjectWorkbenchProps) {
  const [view, setView] = useState<View>('tree');
  // Open-ATC tabs for the Tree view's detail pane (mockup TabBar). Clicking an
  // ATC in the explorer opens it here; tabs are closeable.
  const [openTabs, setOpenTabs] = useState<Atc[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeTab = openTabs.find(t => t.id === activeTabId) ?? null;

  const openAtc = (atc: Atc) => {
    setOpenTabs(prev => (prev.some(t => t.id === atc.id) ? prev : [...prev, atc]));
    setActiveTabId(atc.id);
    setView('tree');
  };

  const closeTab = (id: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id);
        const neighbour = next[idx] ?? next[idx - 1] ?? null;
        setActiveTabId(neighbour?.id ?? null);
      }
      return next;
    });
  };

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
            <CommandPalette ownsHotkey={false} />
            <Link
              href={`/projects/${projectSlug}/atcs/new`}
              className={buttonVariants({ size: 'sm' })}
              data-testid="project-new-atc"
            >
              <Plus size={11} />
              {' '}
              New ATC
            </Link>
            <Link
              href={`/projects/${projectSlug}/tests/new`}
              className={buttonVariants({ variant: 'primary', size: 'sm' })}
              data-testid="project-new-test"
            >
              <Plus size={11} />
              {' '}
              New Test
            </Link>
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
              tests={tests}
              canCreate={canCreate}
              onOpenAtc={openAtc}
              selectedAtcId={activeTabId}
            />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-0">
              {openTabs.length > 0 && (
                <div className="flex h-8 flex-shrink-0 items-stretch overflow-x-auto border-b border-stroke-1 bg-surface-1">
                  {openTabs.map(t => (
                    <div
                      key={t.id}
                      role="tab"
                      aria-selected={t.id === activeTabId}
                      data-testid={`atc-tab-${t.id}`}
                      onClick={() => setActiveTabId(t.id)}
                      className={cn(
                        'flex flex-shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-r border-stroke-1 pl-3 pr-2 text-xs',
                        t.id === activeTabId
                          ? 'border-t border-t-accent bg-surface-0 text-fg-0'
                          : 'border-t border-t-transparent text-fg-2 hover:bg-surface-2',
                      )}
                    >
                      <span className="dot" data-status={t.status} />
                      <span className="font-mono text-xs" title={t.slug}>{shortSlug(t.slug)}</span>
                      <span className="layer-chip" data-layer={t.layer.toLowerCase()}>{t.layer}</span>
                      <button
                        type="button"
                        data-testid={`atc-tab-close-${t.id}`}
                        aria-label="Close tab"
                        onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                        className="ml-1 inline-flex rounded-1 p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg-0"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto">
                {activeTab
                  ? <AtcDetailPane projectSlug={projectSlug} atc={activeTab} />
                  : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-4">
                        Select an ATC from the explorer to preview it here.
                      </div>
                    )}
              </div>
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
