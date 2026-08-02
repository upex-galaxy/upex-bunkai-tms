'use client';

import type { Atc, ModuleTreeNode, UserStoryWithChildren } from '@lib/types';
import { Sidebar } from '@components/layout/Sidebar';
import { Breadcrumb } from '@components/layout/Topbar';
import { duplicateAtc } from '@lib/atcs/duplicate-client';
import { moduleBreadcrumb } from '@lib/tree';
import { cn } from '@lib/utils';
import { ChevronDown, ChevronLeft, ChevronRight, DownloadCloud, GitBranch, MoreHorizontal, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AcceptanceCriteriaPanel } from './acceptance-criteria-panel';
import { CreateEnvironmentForm } from './create-environment-form';
import { CreateModuleForm } from './create-module-form';
import { DeleteEnvironmentDialog } from './delete-environment-dialog';
import { DeleteModuleDialog } from './delete-module-dialog';
import { DeleteUserStoryDialog } from './delete-user-story-dialog';
import { ImportFromJiraDialog } from './import-from-jira-dialog';
import { MoveModuleDialog } from './move-module-dialog';
import { RenameEnvironmentForm } from './rename-environment-form';
import { RenameModuleForm } from './rename-module-form';
import { UserStoryForm } from './user-story-form';
import { useWorkbench } from './workbench-context';

// Workspace Test projection for the explorer's flat Tests group (BK-27).
// Tests are workspace-scoped (no module anchor — ratified derivation D9), so
// they render as a flat list, not inside the module tree.
export interface ExplorerTestItem {
  id: string
  title: string
  created_at: string
  step_count: number
}

// BK-148 — a project environment row for the explorer's Environments group. A
// named deployment target a Run executes against, project-scoped.
export interface ExplorerEnvironmentItem {
  id: string
  name: string
  created_at: string
}

interface ProjectExplorerProps {
  projectId: string
  projectSlug: string
  projectName: string
  tree: ModuleTreeNode[]
  // Workspace Tests for the read-only Tests group. Opening a Test as a `t:`
  // tab is BK-32 — rows here are creation feedback only.
  tests?: ExplorerTestItem[]
  // BK-148 — the project's environments for the Environments group (name asc).
  environments?: ExplorerEnvironmentItem[]
  // True when the caller's workspace role is >= member. Gates the create
  // affordances; the API remains the authority and rejects unauthorized writes.
  canCreate: boolean
  // Route-driven workbench (BK-147): a plain ATC/Test click navigates to its
  // route, which opens as a tab in the persistent shell. `selectedAtcId` /
  // `selectedTestId` (derived from the active route) highlight the open item.
  selectedAtcId?: string | null
  selectedTestId?: string | null
}

interface CreateTarget {
  parentModuleId: string | null
  parentLabel?: string
}

// Minimal chain projection consumed by `moduleBreadcrumb`. The tree already
// carries the three fields needed to walk the parent chain, so we flatten it
// here instead of threading the flat `Module[]` through another prop.
interface ChainNode {
  id: string
  parent_module_id: string | null
  name: string
}

function flattenChain(nodes: ModuleTreeNode[], acc: ChainNode[] = []): ChainNode[] {
  for (const n of nodes) {
    acc.push({ id: n.id, parent_module_id: n.parent_module_id, name: n.name });
    flattenChain(n.children, acc);
  }
  return acc;
}

// Flat projection of the tree for the move dialog, which needs each module's
// `path` (to compute valid destinations) alongside id / name / parent.
interface ModuleLite {
  id: string
  name: string
  path: string
  parent_module_id: string | null
}

function flattenModules(nodes: ModuleTreeNode[], acc: ModuleLite[] = []): ModuleLite[] {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name, path: n.path, parent_module_id: n.parent_module_id });
    flattenModules(n.children, acc);
  }
  return acc;
}

// Count what a soft-delete would cascade-archive beneath a node: descendant
// modules (excluding the node itself) and every ATC in the subtree. Drives the
// delete confirmation's blast-radius copy.
function countSubtree(node: ModuleTreeNode): { modules: number, atcs: number } {
  let modules = 0;
  let atcs = node.atcs.length;
  for (const child of node.children) {
    const sub = countSubtree(child);
    modules += 1 + sub.modules;
    atcs += sub.atcs;
  }
  return { modules, atcs };
}

// Client shell around the existing Sidebar tree. Owns the create-module modal
// state so the Server Component page can stay free of client hooks, and so the
// Sidebar (in components/) does not import an app-route form. The tree itself is
// still rendered by Sidebar/ModuleNode — this only wires the entry points.
export function ProjectExplorer({
  projectId,
  projectSlug,
  projectName,
  tree,
  tests = [],
  environments = [],
  canCreate,
  selectedAtcId,
  selectedTestId,
}: ProjectExplorerProps) {
  const router = useRouter();
  // BK-33 — when a tag filter is active, scope the Tests group to the matching
  // id set (an empty set ⇒ "No Tests carry this tag"). No filter ⇒ all Tests.
  const { testTagFilter, filteredTestIds } = useWorkbench();
  const tagFilterActive = testTagFilter !== null;
  const visibleTests = useMemo(
    () => (filteredTestIds === null
      ? tests
      : tests.filter(t => filteredTestIds.includes(t.id))),
    [tests, filteredTestIds],
  );
  const [target, setTarget] = useState<CreateTarget | null>(null);
  const [duplicatingAtcId, setDuplicatingAtcId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ModuleTreeNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<ModuleTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleTreeNode | null>(null);
  const [newStoryModule, setNewStoryModule] = useState<ModuleTreeNode | null>(null);
  const [editStory, setEditStory] = useState<UserStoryWithChildren | null>(null);
  const [deleteStory, setDeleteStory] = useState<UserStoryWithChildren | null>(null);
  const [manageStory, setManageStory] = useState<UserStoryWithChildren | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  // Tests group accordion (BK-27). Open by default so a just-created Test is
  // immediately visible after the builder redirects back here.
  const [testsOpen, setTestsOpen] = useState(true);

  // Environments group (BK-148). Collapsed by default — a lower-traffic surface
  // than modules/tests. `envMenuId` drives the per-row rename/remove menu;
  // `creatingEnv` / `renameEnv` / `deleteEnv` host the overlay modals.
  const [envOpen, setEnvOpen] = useState(false);
  const [envMenuId, setEnvMenuId] = useState<string | null>(null);
  const [creatingEnv, setCreatingEnv] = useState(false);
  const [renameEnv, setRenameEnv] = useState<ExplorerEnvironmentItem | null>(null);
  const [deleteEnv, setDeleteEnv] = useState<ExplorerEnvironmentItem | null>(null);

  // Explorer panel chrome: collapse to a thin rail (Jira-style) and drag-resize
  // the width. Bounds keep the tree usable. Width is not persisted — a session
  // affordance, reset on reload.
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(280);
  const resizingRef = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) { return; }
      setWidth(Math.min(520, Math.max(220, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Close any open modal on Escape — mirrors the CommandPalette behaviour and
  // matches the backdrop-click dismissal each modal already has. Only one of
  // these is ever open at a time, so clearing all close handlers is safe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') { return; }
      setTarget(null);
      setRenameTarget(null);
      setMoveTarget(null);
      setDeleteTarget(null);
      setNewStoryModule(null);
      setEditStory(null);
      setDeleteStory(null);
      setManageStory(null);
      setImporting(false);
      setCreatingEnv(false);
      setRenameEnv(null);
      setDeleteEnv(null);
      setEnvMenuId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // BK-23 — duplicate an ATC from the explorer context menu. One click → POST
  // the dedicated duplicate endpoint (default `(copy)` title) → navigate to the
  // freshly-created ATC's editor. A second click while a duplicate is in flight
  // is ignored (the menu closes on click anyway, this guards a double-fire).
  const handleDuplicateAtc = async (atc: Atc) => {
    if (duplicatingAtcId) { return; }
    setDuplicatingAtcId(atc.id);
    const result = await duplicateAtc(atc.id);
    if (!result.ok) {
      toast.error(result.errorMessage);
      setDuplicatingAtcId(null);
      return;
    }
    toast.success('ATC duplicated');
    if (result.atcId) {
      router.push(`/projects/${projectSlug}/atcs/${result.atcId}`);
    }
    else {
      router.refresh();
    }
    setDuplicatingAtcId(null);
  };

  const deleteCounts = deleteTarget ? countSubtree(deleteTarget) : null;
  const flatModules = useMemo(() => flattenModules(tree), [tree]);

  const chain = useMemo(() => flattenChain(tree), [tree]);
  const breadcrumb = selectedModuleId
    ? moduleBreadcrumb(chain, selectedModuleId)
    : [];

  return (
    <>
      <div
        data-testid="explorer-panel"
        className="relative flex flex-shrink-0 flex-col overflow-hidden bg-surface-1"
        style={{ width: collapsed ? 0 : width }}
      >
        {!collapsed && (
          <>
            <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-stroke-1 px-3">
              {breadcrumb.length > 0
                ? (
                    <span data-testid="module-breadcrumb" className="min-w-0 truncate">
                      <Breadcrumb items={breadcrumb} />
                    </span>
                  )
                : (
                    <span className="truncate text-xs text-fg-4">Select a module to view its ATCs</span>
                  )}
              {canCreate && (
                <button
                  type="button"
                  data-testid="import-from-jira"
                  onClick={() => setImporting(true)}
                  title="Import issues from Jira"
                  className="ml-2 inline-flex h-5 flex-shrink-0 items-center gap-1 rounded-1 px-1.5 text-xs text-fg-3 hover:bg-surface-2 hover:text-fg-1"
                >
                  <DownloadCloud size={11} />
                  Import
                </button>
              )}
            </div>
            <div className="flex min-h-0 flex-1">
              <Sidebar
                projectSlug={projectSlug}
                projectName={projectName}
                tree={tree}
                canCreate={canCreate}
                selectedModuleId={selectedModuleId}
                selectedAtcId={selectedAtcId}
                onNewModule={() => setTarget({ parentModuleId: null })}
                onAddSubModule={node =>
                  setTarget({ parentModuleId: node.id, parentLabel: node.name })}
                onRenameModule={setRenameTarget}
                onMoveModule={setMoveTarget}
                onDeleteModule={setDeleteTarget}
                onNewUserStory={setNewStoryModule}
                onEditUserStory={setEditStory}
                onDeleteUserStory={setDeleteStory}
                onManageCriteria={setManageStory}
                onSelect={setSelectedModuleId}
                onDuplicateAtc={(atc) => { void handleDuplicateAtc(atc); }}
              />
            </div>
            {/* Tests group (BK-27): workspace-scoped chains of ATCs, flat list
                per ratified derivation D9 (Tests have no module anchor).
                Read-only rows — opening a `t:` tab is BK-32, reorder is BK-28.
                Test rows carry NO layer chip (layer chips are ATC-only) and a
                neutral `unrun` dot (§7 gate: no Runs exist yet). */}
            <div
              data-testid="explorer-tests-group"
              className="flex max-h-[40%] flex-shrink-0 flex-col border-t border-stroke-1"
            >
              <button
                type="button"
                onClick={() => setTestsOpen(o => !o)}
                aria-expanded={testsOpen}
                className="flex h-8 flex-shrink-0 items-center gap-1.5 px-3 text-left hover:bg-surface-2"
              >
                {testsOpen
                  ? <ChevronDown size={10} className="text-fg-3" />
                  : <ChevronRight size={10} className="text-fg-3" />}
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-3">
                  Tests
                </span>
                {tagFilterActive && (
                  <span
                    data-testid="explorer-tests-tag-filter-badge"
                    className="inline-flex items-center rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-fg-2"
                  >
                    {testTagFilter}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-fg-4">{visibleTests.length}</span>
              </button>
              {testsOpen && (
                <div className="min-h-0 overflow-auto pb-1.5">
                  {visibleTests.length === 0
                    ? (
                        <div
                          data-testid="explorer-tests-empty"
                          className="flex h-5 items-center px-3 text-xs italic text-fg-4"
                        >
                          {tagFilterActive ? 'No Tests carry this tag' : 'No Tests yet'}
                        </div>
                      )
                    : visibleTests.map(t => (
                        <Link
                          key={t.id}
                          href={`/projects/${projectSlug}/tests/${t.id}`}
                          data-testid={`explorer-test-${t.id}`}
                          className={cn(
                            'flex h-6 items-center gap-1.5 border-l-2 px-3 text-sm',
                            t.id === selectedTestId
                              ? 'border-accent bg-accent-soft text-fg-0'
                              : 'border-transparent text-fg-1 hover:bg-surface-2',
                          )}
                        >
                          <GitBranch size={12} className="shrink-0 text-fg-3" />
                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          <span className="shrink-0 font-mono text-xs text-fg-4">{t.step_count}</span>
                          <span className="dot shrink-0" data-status="unrun" />
                        </Link>
                      ))}
                </div>
              )}
            </div>

            {/* Environments group (BK-148): per-project deployment targets a Run
                executes against. Sibling of the Tests group; member+ can add,
                rename, and remove via the overlay modals below. Removal is
                blocked when a run references the environment (clean 409 with the
                run count, surfaced by the delete dialog). */}
            <div
              data-testid="explorer-environments-group"
              className="flex flex-shrink-0 flex-col border-t border-stroke-1"
            >
              <div className="flex h-8 flex-shrink-0 items-center gap-1.5 px-3 hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => setEnvOpen(o => !o)}
                  aria-expanded={envOpen}
                  className="flex flex-1 items-center gap-1.5 text-left"
                >
                  {envOpen
                    ? <ChevronDown size={10} className="text-fg-3" />
                    : <ChevronRight size={10} className="text-fg-3" />}
                  <span className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-3">
                    Environments
                  </span>
                  <span className="ml-auto font-mono text-xs text-fg-4">{environments.length}</span>
                </button>
                {canCreate && (
                  <button
                    type="button"
                    data-testid="environment-add"
                    onClick={() => { setCreatingEnv(true); setEnvOpen(true); }}
                    title="Add environment"
                    aria-label="Add environment"
                    className="inline-flex size-5 flex-shrink-0 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              {envOpen && (
                <div className="overflow-auto pb-1.5">
                  {environments.length === 0
                    ? (
                        <div
                          data-testid="explorer-environments-empty"
                          className="flex h-5 items-center px-3 text-xs italic text-fg-4"
                        >
                          No environments yet
                        </div>
                      )
                    : environments.map(env => (
                        <div
                          key={env.id}
                          data-testid={`explorer-environment-${env.id}`}
                          className="group/env relative flex h-6 items-center gap-1.5 border-l-2 border-transparent px-3 text-sm text-fg-1 hover:bg-surface-2"
                        >
                          <Server size={12} className="shrink-0 text-fg-3" />
                          <span className="min-w-0 flex-1 truncate">{env.name}</span>
                          {canCreate && (
                            <button
                              type="button"
                              data-testid={`environment-menu-${env.id}`}
                              onClick={() => setEnvMenuId(id => (id === env.id ? null : env.id))}
                              aria-label={`Manage ${env.name}`}
                              className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 text-fg-3 opacity-0 hover:bg-surface-3 hover:text-fg-1 group-hover/env:opacity-100"
                            >
                              <MoreHorizontal size={13} />
                            </button>
                          )}
                          {envMenuId === env.id && (
                            <div
                              data-testid={`environment-menu-popover-${env.id}`}
                              className="absolute right-2 top-6 z-30 w-32 rounded-2 border border-stroke-2 bg-surface-1 p-1 shadow-pop"
                            >
                              <button
                                type="button"
                                data-testid={`environment-rename-${env.id}`}
                                onClick={() => { setRenameEnv(env); setEnvMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded-1 px-2 py-1 text-left text-xs text-fg-1 hover:bg-surface-2"
                              >
                                <Pencil size={11} className="text-fg-3" />
                                Rename
                              </button>
                              <button
                                type="button"
                                data-testid={`environment-remove-${env.id}`}
                                onClick={() => { setDeleteEnv(env); setEnvMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded-1 px-2 py-1 text-left text-xs text-signal-fail hover:bg-surface-2"
                              >
                                <Trash2 size={11} />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {/* Jira-style divider: drag the hit-area to resize, click the pill to
          collapse/expand the explorer panel. */}
      <div className="group/divider relative w-px flex-shrink-0 bg-stroke-1">
        {!collapsed && (
          <div
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize"
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-accent/30"
          />
        )}
        <button
          type="button"
          data-testid="explorer-collapse-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!collapsed}
          className={cn(
            'absolute left-1/2 top-1/2 z-20 size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-stroke-3 bg-surface-3 text-fg-2 shadow-pop hover:text-fg-0 active:scale-95',
            collapsed ? 'flex' : 'hidden group-hover/divider:flex',
          )}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {target && (
        <div
          data-testid="create-module-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setTarget(null)}
        >
          <div
            className="w-full max-w-[420px]"
            onClick={e => e.stopPropagation()}
          >
            <CreateModuleForm
              projectId={projectId}
              parentModuleId={target.parentModuleId}
              parentLabel={target.parentLabel}
              onCreated={() => setTarget(null)}
              onCancel={() => setTarget(null)}
            />
          </div>
        </div>
      )}

      {renameTarget && (
        <div
          data-testid="rename-module-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setRenameTarget(null)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <RenameModuleForm
              moduleId={renameTarget.id}
              initialName={renameTarget.name}
              initialDescription={renameTarget.description}
              onUpdated={() => setRenameTarget(null)}
              onCancel={() => setRenameTarget(null)}
            />
          </div>
        </div>
      )}

      {moveTarget && (
        <div
          data-testid="move-module-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setMoveTarget(null)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <MoveModuleDialog
              source={{
                id: moveTarget.id,
                name: moveTarget.name,
                path: moveTarget.path,
                parent_module_id: moveTarget.parent_module_id,
              }}
              modules={flatModules}
              onMoved={() => setMoveTarget(null)}
              onCancel={() => setMoveTarget(null)}
            />
          </div>
        </div>
      )}

      {deleteTarget && deleteCounts && (
        <div
          data-testid="delete-module-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <DeleteModuleDialog
              moduleId={deleteTarget.id}
              moduleName={deleteTarget.name}
              subModuleCount={deleteCounts.modules}
              atcCount={deleteCounts.atcs}
              onDeleted={() => {
                if (selectedModuleId === deleteTarget.id) { setSelectedModuleId(null); }
                setDeleteTarget(null);
              }}
              onCancel={() => setDeleteTarget(null)}
            />
          </div>
        </div>
      )}

      {newStoryModule && (
        <div
          data-testid="new-user-story-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setNewStoryModule(null)}
        >
          <div className="w-full max-w-[520px]" onClick={e => e.stopPropagation()}>
            <UserStoryForm
              moduleId={newStoryModule.id}
              onSaved={() => setNewStoryModule(null)}
              onCancel={() => setNewStoryModule(null)}
            />
          </div>
        </div>
      )}

      {editStory && (
        <div
          data-testid="edit-user-story-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setEditStory(null)}
        >
          <div className="w-full max-w-[520px]" onClick={e => e.stopPropagation()}>
            <UserStoryForm
              story={{
                id: editStory.id,
                title: editStory.title,
                description: editStory.description,
                external_id: editStory.external_id,
              }}
              onSaved={() => setEditStory(null)}
              onCancel={() => setEditStory(null)}
            />
          </div>
        </div>
      )}

      {deleteStory && (
        <div
          data-testid="delete-user-story-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setDeleteStory(null)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <DeleteUserStoryDialog
              storyId={deleteStory.id}
              storyTitle={deleteStory.title}
              onDeleted={() => setDeleteStory(null)}
              onCancel={() => setDeleteStory(null)}
            />
          </div>
        </div>
      )}

      {manageStory && (
        <div
          data-testid="acceptance-criteria-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setManageStory(null)}
        >
          <div className="w-full max-w-[560px]" onClick={e => e.stopPropagation()}>
            <AcceptanceCriteriaPanel
              storyId={manageStory.id}
              storyTitle={manageStory.title}
              initialStatus={manageStory.status}
              onCancel={() => setManageStory(null)}
            />
          </div>
        </div>
      )}

      {importing && (
        <div
          data-testid="import-from-jira-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setImporting(false)}
        >
          <div className="w-full max-w-[520px]" onClick={e => e.stopPropagation()}>
            <ImportFromJiraDialog
              projectId={projectId}
              onClose={() => setImporting(false)}
            />
          </div>
        </div>
      )}

      {creatingEnv && (
        <div
          data-testid="create-environment-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setCreatingEnv(false)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <CreateEnvironmentForm
              projectId={projectId}
              onCreated={() => setCreatingEnv(false)}
              onCancel={() => setCreatingEnv(false)}
            />
          </div>
        </div>
      )}

      {renameEnv && (
        <div
          data-testid="rename-environment-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setRenameEnv(null)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <RenameEnvironmentForm
              environmentId={renameEnv.id}
              initialName={renameEnv.name}
              onUpdated={() => setRenameEnv(null)}
              onCancel={() => setRenameEnv(null)}
            />
          </div>
        </div>
      )}

      {deleteEnv && (
        <div
          data-testid="delete-environment-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setDeleteEnv(null)}
        >
          <div className="w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <DeleteEnvironmentDialog
              environmentId={deleteEnv.id}
              environmentName={deleteEnv.name}
              onDeleted={() => setDeleteEnv(null)}
              onCancel={() => setDeleteEnv(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
