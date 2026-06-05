'use client';

import type { ModuleTreeNode } from '@lib/types';
import { Sidebar } from '@components/layout/Sidebar';
import { Breadcrumb } from '@components/layout/Topbar';
import { moduleBreadcrumb } from '@lib/tree';
import { useMemo, useState } from 'react';
import { CreateModuleForm } from './create-module-form';
import { DeleteModuleDialog } from './delete-module-dialog';
import { MoveModuleDialog } from './move-module-dialog';
import { RenameModuleForm } from './rename-module-form';

interface ProjectExplorerProps {
  projectId: string
  projectSlug: string
  projectName: string
  tree: ModuleTreeNode[]
  // True when the caller's workspace role is >= member. Gates the create
  // affordances; the API remains the authority and rejects unauthorized writes.
  canCreate: boolean
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
}: ProjectExplorerProps) {
  const [target, setTarget] = useState<CreateTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<ModuleTreeNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<ModuleTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleTreeNode | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const deleteCounts = deleteTarget ? countSubtree(deleteTarget) : null;
  const flatModules = useMemo(() => flattenModules(tree), [tree]);

  const chain = useMemo(() => flattenChain(tree), [tree]);
  const breadcrumb = selectedModuleId
    ? moduleBreadcrumb(chain, selectedModuleId)
    : [];

  return (
    <>
      <div className="flex flex-shrink-0 flex-col overflow-hidden">
        <div className="flex h-8 flex-shrink-0 items-center border-b border-stroke-1 bg-surface-1 px-3">
          {breadcrumb.length > 0
            ? (
                <span data-testid="module-breadcrumb">
                  <Breadcrumb items={breadcrumb} />
                </span>
              )
            : (
                <span className="text-xs text-fg-4">Select a module</span>
              )}
        </div>
        <div className="flex min-h-0 flex-1">
          <Sidebar
            projectSlug={projectSlug}
            projectName={projectName}
            tree={tree}
            canCreate={canCreate}
            selectedModuleId={selectedModuleId}
            onNewModule={() => setTarget({ parentModuleId: null })}
            onAddSubModule={node =>
              setTarget({ parentModuleId: node.id, parentLabel: node.name })}
            onRenameModule={setRenameTarget}
            onMoveModule={setMoveTarget}
            onDeleteModule={setDeleteTarget}
            onSelect={setSelectedModuleId}
          />
        </div>
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
    </>
  );
}
