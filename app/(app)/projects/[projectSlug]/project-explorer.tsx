'use client';

import type { Atc, ModuleTreeNode, UserStoryWithChildren } from '@lib/types';
import { Sidebar } from '@components/layout/Sidebar';
import { Breadcrumb } from '@components/layout/Topbar';
import { moduleBreadcrumb } from '@lib/tree';
import { cn } from '@lib/utils';
import { ChevronLeft, ChevronRight, DownloadCloud } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AcceptanceCriteriaPanel } from './acceptance-criteria-panel';
import { CreateModuleForm } from './create-module-form';
import { DeleteModuleDialog } from './delete-module-dialog';
import { DeleteUserStoryDialog } from './delete-user-story-dialog';
import { ImportFromJiraDialog } from './import-from-jira-dialog';
import { MoveModuleDialog } from './move-module-dialog';
import { RenameModuleForm } from './rename-module-form';
import { UserStoryForm } from './user-story-form';

interface ProjectExplorerProps {
  projectId: string
  projectSlug: string
  projectName: string
  tree: ModuleTreeNode[]
  // True when the caller's workspace role is >= member. Gates the create
  // affordances; the API remains the authority and rejects unauthorized writes.
  canCreate: boolean
  // Tree-workbench wiring: a plain ATC click opens an in-pane tab (handled by
  // the parent workbench) instead of navigating to the editor. `selectedAtcId`
  // highlights the active tab's row in the tree.
  onOpenAtc?: (atc: Atc) => void
  selectedAtcId?: string | null
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
  canCreate,
  onOpenAtc,
  selectedAtcId,
}: ProjectExplorerProps) {
  const [target, setTarget] = useState<CreateTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<ModuleTreeNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<ModuleTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleTreeNode | null>(null);
  const [newStoryModule, setNewStoryModule] = useState<ModuleTreeNode | null>(null);
  const [editStory, setEditStory] = useState<UserStoryWithChildren | null>(null);
  const [deleteStory, setDeleteStory] = useState<UserStoryWithChildren | null>(null);
  const [manageStory, setManageStory] = useState<UserStoryWithChildren | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
                onOpenAtc={onOpenAtc}
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
              />
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
    </>
  );
}
