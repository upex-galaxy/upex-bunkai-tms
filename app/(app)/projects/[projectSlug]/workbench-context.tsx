'use client';

import type { Atc, ModuleTreeNode } from '@lib/types';
import type { ReactNode } from 'react';
import type { ExplorerEnvironmentItem, ExplorerTestItem } from './project-explorer';
import { shortSlug } from '@lib/utils';
import { useParams, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Client state layer for the project workbench (BK-147). The persistent shell
// (project-shell.tsx) and the index page both read this. Tabs are route-driven:
// the ACTIVE tab is derived from the URL, and the open-tab set is ephemeral
// client state that survives child-route navigation because the layout (and
// this provider) stay mounted. Switching projects remounts the provider (the
// shell is keyed by slug), so tabs reset by construction — out of scope to
// persist tabs across sessions/devices.

export type WorkbenchView = 'tree' | 'table' | 'mindmap';

export type WorkbenchTabKind = 'atc' | 'test' | 'run';

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
  // BK-148 — the project's environments, fed to the explorer's Environments group.
  environments: ExplorerEnvironmentItem[]
  canCreate: boolean
}

interface WorkbenchContextValue extends WorkbenchData {
  view: WorkbenchView
  setView: (view: WorkbenchView) => void
  openTabs: WorkbenchTab[]
  activeAtcId: string | null
  activeTestId: string | null
  // BK-34 — the active 'run' route's id (null off a run route). Runs are not in
  // the loaded project data, so a run tab's label is supplied lazily by the
  // runner view via `registerRunLabel` once the composed run payload loads.
  activeRunId: string | null
  registerRunLabel: (id: string, label: string) => void
  closeTab: (kind: WorkbenchTabKind, id: string) => void
  // BK-33 — Test tag filter shared between the toolbar control and the explorer
  // Tests group. `testTagFilter` is the active tag (null = no filter); when set,
  // `filteredTestIds` is the id set the explorer scopes the Tests list to
  // (empty array = the tag matches no Test → "No Tests carry this tag").
  testTagFilter: string | null
  filteredTestIds: string[] | null
  setTestTagFilter: (tag: string | null, ids: string[] | null) => void
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) { throw new Error('useWorkbench must be used within a WorkbenchProvider'); }
  return ctx;
}

// Returns a tab descriptor for an item that EXISTS in the loaded project data,
// or null. A deleted / invisible item resolves to null so it never spawns a
// stray tab — the route's not-found page renders inside the shell instead.
function findTab(
  rows: ProjectRow[],
  tests: ExplorerTestItem[],
  runLabels: Record<string, string>,
  projectSlug: string,
  kind: WorkbenchTabKind,
  id: string,
): WorkbenchTab | null {
  if (kind === 'atc') {
    const atc = rows.find(r => r.id === id);
    if (!atc) { return null; }
    return {
      kind: 'atc',
      id,
      href: `/projects/${projectSlug}/atcs/${id}`,
      label: shortSlug(atc.slug),
      layer: atc.layer,
      status: atc.status,
    };
  }
  if (kind === 'run') {
    // Runs aren't in the loaded project data — return the tab immediately (so a
    // run route always gets a tab) with a placeholder label that the runner
    // view refines via `registerRunLabel`.
    return {
      kind: 'run',
      id,
      href: `/projects/${projectSlug}/runs/${id}`,
      label: runLabels[id] ?? 'Run',
    };
  }
  const test = tests.find(t => t.id === id);
  if (!test) { return null; }
  return {
    kind: 'test',
    id,
    href: `/projects/${projectSlug}/tests/${id}`,
    label: test.title,
    stepCount: test.step_count,
  };
}

export function WorkbenchProvider({ children, ...data }: WorkbenchData & { children: ReactNode }) {
  const router = useRouter();
  const { rows, tests, projectSlug } = data;
  const params = useParams<{ atcId?: string, testId?: string, runId?: string }>();
  const activeAtcId = params.atcId ?? null;
  const activeTestId = params.testId ?? null;
  const activeRunId = params.runId ?? null;

  const [view, setView] = useState<WorkbenchView>('tree');
  // BK-34 — lazy label registry for run tabs. Runs aren't in the loaded project
  // data, so the runner view registers its `test_title` once the composed run
  // payload loads; the tab seeds with a placeholder and refines on registration.
  const [runLabels, setRunLabels] = useState<Record<string, string>>({});
  const registerRunLabel = useCallback(
    (id: string, label: string) =>
      setRunLabels(prev => (prev[id] === label ? prev : { ...prev, [id]: label })),
    [],
  );
  // BK-33 — active tag filter + the matching Test id set (null = no filter).
  const [testTagFilter, setTagFilter] = useState<string | null>(null);
  const [filteredTestIds, setFilteredTestIds] = useState<string[] | null>(null);
  // Stable identity so the toolbar filter's debounced effect can list it as a
  // dependency without re-running every render.
  const setTestTagFilter = useCallback((tag: string | null, ids: string[] | null) => {
    setTagFilter(tag);
    setFilteredTestIds(ids);
  }, []);
  const [openTabs, setOpenTabs] = useState<WorkbenchTab[]>(() => {
    const seed = activeAtcId
      ? findTab(rows, tests, runLabels, projectSlug, 'atc', activeAtcId)
      : activeTestId
        ? findTab(rows, tests, runLabels, projectSlug, 'test', activeTestId)
        : activeRunId
          ? findTab(rows, tests, runLabels, projectSlug, 'run', activeRunId)
          : null;
    return seed ? [seed] : [];
  });

  // Visiting a detail route registers it as a tab (dedup) and makes it active.
  // `rows`/`tests`/`projectSlug` are stable for the provider's life (the layout
  // loads them once; a project switch remounts via the slug key), so this only
  // meaningfully fires when the active item changes.
  useEffect(() => {
    const kind: WorkbenchTabKind | null = activeAtcId
      ? 'atc'
      : activeTestId
        ? 'test'
        : activeRunId
          ? 'run'
          : null;
    const id = activeAtcId ?? activeTestId ?? activeRunId;
    if (!kind || !id) { return; }
    const tab = findTab(rows, tests, runLabels, projectSlug, kind, id);
    if (!tab) { return; } // deleted / invisible item -> no tab; the not-found page shows
    setOpenTabs((prev) => {
      const existing = prev.find(t => t.kind === kind && t.id === id);
      if (!existing) { return [...prev, tab]; }
      // A run tab's label refines when `registerRunLabel` populates `runLabels`
      // — swap in the fresh label if it changed, otherwise keep prev identity.
      if (existing.label !== tab.label) {
        return prev.map(t => (t.kind === kind && t.id === id ? tab : t));
      }
      return prev;
    });
  }, [activeAtcId, activeTestId, activeRunId, rows, tests, runLabels, projectSlug]);

  const closeTab = (kind: WorkbenchTabKind, id: string) => {
    const idx = openTabs.findIndex(t => t.kind === kind && t.id === id);
    const next = openTabs.filter(t => !(t.kind === kind && t.id === id));
    setOpenTabs(next);
    // Navigate AFTER computing the next list and OUTSIDE the state updater —
    // calling router.push() inside a setState updater fires during render and
    // triggers "Cannot update Router while rendering WorkbenchProvider".
    const isActive
      = (kind === 'atc' && id === activeAtcId)
        || (kind === 'test' && id === activeTestId)
        || (kind === 'run' && id === activeRunId);
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
    activeRunId,
    registerRunLabel,
    closeTab,
    testTagFilter,
    filteredTestIds,
    setTestTagFilter,
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}
