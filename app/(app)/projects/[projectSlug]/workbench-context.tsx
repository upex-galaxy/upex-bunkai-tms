'use client';

import type { Atc, ModuleTreeNode } from '@lib/types';
import type { ReactNode } from 'react';
import type { ExplorerTestItem } from './project-explorer';
import { shortSlug } from '@lib/utils';
import { useParams, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';

// Client state layer for the project workbench (BK-147). The persistent shell
// (project-shell.tsx) and the index page both read this. Tabs are route-driven:
// the ACTIVE tab is derived from the URL, and the open-tab set is ephemeral
// client state that survives child-route navigation because the layout (and
// this provider) stay mounted. Switching projects remounts the provider (the
// shell is keyed by slug), so tabs reset by construction — out of scope to
// persist tabs across sessions/devices.

export type WorkbenchView = 'tree' | 'table' | 'mindmap';

export type WorkbenchTabKind = 'atc' | 'test';

export interface WorkbenchTab {
  kind: WorkbenchTabKind
  id: string
  href: string
  label: string
  layer?: string
  status?: string
  stepCount?: number
}

export type ProjectRow = Atc & { module_path: string };

export interface WorkbenchData {
  projectId: string
  projectSlug: string
  projectName: string
  workspaceName: string
  tree: ModuleTreeNode[]
  rows: ProjectRow[]
  tests: ExplorerTestItem[]
  canCreate: boolean
}

interface WorkbenchContextValue extends WorkbenchData {
  view: WorkbenchView
  setView: (view: WorkbenchView) => void
  openTabs: WorkbenchTab[]
  activeAtcId: string | null
  activeTestId: string | null
  closeTab: (kind: WorkbenchTabKind, id: string) => void
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) { throw new Error('useWorkbench must be used within a WorkbenchProvider'); }
  return ctx;
}

function buildTab(
  rows: ProjectRow[],
  tests: ExplorerTestItem[],
  projectSlug: string,
  kind: WorkbenchTabKind,
  id: string,
): WorkbenchTab {
  if (kind === 'atc') {
    const atc = rows.find(r => r.id === id);
    return {
      kind: 'atc',
      id,
      href: `/projects/${projectSlug}/atcs/${id}`,
      label: atc ? shortSlug(atc.slug) : 'ATC',
      layer: atc?.layer,
      status: atc?.status,
    };
  }
  const test = tests.find(t => t.id === id);
  return {
    kind: 'test',
    id,
    href: `/projects/${projectSlug}/tests/${id}`,
    label: test?.title ?? 'Test',
    stepCount: test?.step_count,
  };
}

export function WorkbenchProvider({ children, ...data }: WorkbenchData & { children: ReactNode }) {
  const router = useRouter();
  const { rows, tests, projectSlug } = data;
  const params = useParams<{ atcId?: string, testId?: string }>();
  const activeAtcId = params.atcId ?? null;
  const activeTestId = params.testId ?? null;

  const [view, setView] = useState<WorkbenchView>('tree');
  const [openTabs, setOpenTabs] = useState<WorkbenchTab[]>(() => {
    if (activeAtcId) { return [buildTab(rows, tests, projectSlug, 'atc', activeAtcId)]; }
    if (activeTestId) { return [buildTab(rows, tests, projectSlug, 'test', activeTestId)]; }
    return [];
  });

  // Visiting a detail route registers it as a tab (dedup) and makes it active.
  // `rows`/`tests`/`projectSlug` are stable for the provider's life (the layout
  // loads them once; a project switch remounts via the slug key), so this only
  // meaningfully fires when the active item changes.
  useEffect(() => {
    const kind: WorkbenchTabKind | null = activeAtcId ? 'atc' : activeTestId ? 'test' : null;
    const id = activeAtcId ?? activeTestId;
    if (!kind || !id) { return; }
    setOpenTabs((prev) => {
      if (prev.some(t => t.kind === kind && t.id === id)) { return prev; }
      return [...prev, buildTab(rows, tests, projectSlug, kind, id)];
    });
  }, [activeAtcId, activeTestId, rows, tests, projectSlug]);

  const closeTab = (kind: WorkbenchTabKind, id: string) => {
    const idx = openTabs.findIndex(t => t.kind === kind && t.id === id);
    const next = openTabs.filter(t => !(t.kind === kind && t.id === id));
    setOpenTabs(next);
    // Navigate AFTER computing the next list and OUTSIDE the state updater —
    // calling router.push() inside a setState updater fires during render and
    // triggers "Cannot update Router while rendering WorkbenchProvider".
    const isActive
      = (kind === 'atc' && id === activeAtcId) || (kind === 'test' && id === activeTestId);
    if (isActive) {
      const neighbour = next[idx] ?? next[idx - 1] ?? null;
      router.push(neighbour ? neighbour.href : `/projects/${projectSlug}`);
    }
  };

  const value: WorkbenchContextValue = {
    ...data,
    view,
    setView,
    openTabs,
    activeAtcId,
    activeTestId,
    closeTab,
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}
