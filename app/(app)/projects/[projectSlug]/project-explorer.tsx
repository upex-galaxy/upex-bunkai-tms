'use client';

import type { ModuleTreeNode } from '@lib/types';
import { Sidebar } from '@components/layout/Sidebar';
import { Breadcrumb } from '@components/layout/Topbar';
import { moduleBreadcrumb } from '@lib/tree';
import { useMemo, useState } from 'react';
import { CreateModuleForm } from './create-module-form';

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
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

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
    </>
  );
}
