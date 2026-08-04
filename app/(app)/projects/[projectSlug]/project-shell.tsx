'use client';

import type { ReactNode } from 'react';
import type { WorkbenchData, WorkbenchView } from './workbench-context';
import { CommandPalette } from '@components/layout/CommandPalette';
import { Breadcrumb, Topbar } from '@components/layout/Topbar';
import { buttonVariants } from '@components/ui/button';
import { cn } from '@lib/utils';
import { GitBranch, ListTree, Network, Play, Plus, Table2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AtcSearchFilter } from './atc-search-filter';
import { ProjectExplorer } from './project-explorer';
import { ProjectSubNav, resolveProjectSectionLabel } from './project-sub-nav';
import { TestTagFilter } from './test-tag-filter';
import { useWorkbench, WorkbenchProvider } from './workbench-context';

const VIEWS: { key: WorkbenchView, label: string, icon: typeof ListTree }[] = [
  { key: 'tree', label: 'Tree', icon: ListTree },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'mindmap', label: 'Mind map', icon: Network },
];

// Persistent project shell (BK-147). Renders the toolbar, the project explorer,
// and the route-driven tab bar around the active route's content (`children`).
// Lives in `[projectSlug]/layout.tsx`, so it stays mounted across the index, an
// open ATC, and an open Test — the explorer never disappears.
export function ProjectShell({ children, ...data }: WorkbenchData & { children: ReactNode }) {
  // Keyed by slug at the layout so the provider remounts (and tabs reset) on a
  // project switch — see ADR-0003.
  return (
    <WorkbenchProvider {...data}>
      <ShellChrome>{children}</ShellChrome>
    </WorkbenchProvider>
  );
}

function ShellChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    projectId,
    projectSlug,
    projectName,
    workspaceName,
    tree,
    tests,
    environments,
    canCreate,
    view,
    setView,
    openTabs,
    activeAtcId,
    activeTestId,
    activeRunId,
    closeTab,
  } = useWorkbench();

  const isDetail = activeAtcId !== null || activeTestId !== null;
  // The explorer rail persists on every detail route; on the index it shows only
  // in Tree mode (Table / Mind map are full-width browse surfaces).
  const explorerVisible = isDetail || view === 'tree';

  // The last breadcrumb crumb tracks the sub-nav's active entry (BK-265) so the
  // shell can no longer claim "All ATCs" while the user is on Metrics. Off the
  // four section routes (an open ATC / Test / run) it stays "All ATCs", exactly
  // as it read before this ticket.
  const sectionLabel = resolveProjectSectionLabel(pathname, projectSlug) ?? 'All ATCs';

  const projectIndexHref = `/projects/${projectSlug}`;

  const selectView = (next: WorkbenchView) => {
    setView(next);
    // The view toggle picks a browse mode for the workbench, so it has to land
    // there from ANY other route inside the project — an open ATC or Test, a
    // run report, or one of the three section surfaces (BK-265 made those
    // clickable, which turned a previously unreachable dead control into a
    // live one that only toggled the explorer rail).
    if (pathname !== projectIndexHref) { router.push(projectIndexHref); }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0">
      <Topbar
        left={<Breadcrumb items={[workspaceName, projectName, sectionLabel]} />}
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
                onClick={() => selectView(v.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-1 px-2.5 py-1 text-xs font-medium transition-colors',
                  view === v.key ? 'bg-surface-3 text-fg-0' : 'text-fg-3 hover:text-fg-1',
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
            <AtcSearchFilter projectId={projectId} projectSlug={projectSlug} />
            <TestTagFilter />
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
      <ProjectSubNav projectSlug={projectSlug} />
      <div className="flex flex-1 overflow-hidden">
        {explorerVisible && (
          <ProjectExplorer
            projectId={projectId}
            projectSlug={projectSlug}
            projectName={projectName}
            tree={tree}
            tests={tests}
            environments={environments}
            canCreate={canCreate}
            selectedAtcId={activeAtcId}
            selectedTestId={activeTestId}
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-0">
          {openTabs.length > 0 && (
            <div
              data-testid="workbench-tabs"
              className="flex h-8 flex-shrink-0 items-stretch overflow-x-auto border-b border-stroke-1 bg-surface-1"
            >
              {openTabs.map((t) => {
                const active
                  = (t.kind === 'atc' && t.id === activeAtcId)
                    || (t.kind === 'test' && t.id === activeTestId)
                    || (t.kind === 'run' && t.id === activeRunId);
                return (
                  <div
                    key={`${t.kind}:${t.id}`}
                    role="tab"
                    aria-selected={active}
                    data-testid={`${t.kind}-tab-${t.id}`}
                    onClick={() => router.push(t.href)}
                    className={cn(
                      'flex flex-shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-r border-stroke-1 pl-3 pr-2 text-xs',
                      active
                        ? 'border-t border-t-accent bg-surface-0 text-fg-0'
                        : 'border-t border-t-transparent text-fg-2 hover:bg-surface-2',
                    )}
                  >
                    {t.kind === 'atc'
                      ? <span className="dot" data-status={t.status} />
                      : t.kind === 'run'
                        ? <Play size={11} className="shrink-0 text-fg-3" />
                        : <GitBranch size={11} className="shrink-0 text-fg-3" />}
                    <span className="max-w-[160px] truncate font-mono text-xs" title={t.label}>
                      {t.label}
                    </span>
                    {t.kind === 'atc' && t.layer && (
                      <span className="layer-chip" data-layer={t.layer.toLowerCase()}>{t.layer}</span>
                    )}
                    {t.kind === 'test' && t.stepCount !== undefined && (
                      <span className="font-mono text-2xs text-fg-4">{t.stepCount}</span>
                    )}
                    <button
                      type="button"
                      data-testid={`${t.kind}-tab-close-${t.id}`}
                      aria-label="Close tab"
                      onClick={(e) => { e.stopPropagation(); closeTab(t.kind, t.id); }}
                      className="ml-1 inline-flex rounded-1 p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg-0"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}
