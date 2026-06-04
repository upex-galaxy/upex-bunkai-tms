'use client';

import type { ModuleTreeNode } from '@lib/types';
import { Sidebar } from '@components/layout/Sidebar';
import { useState } from 'react';
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

  return (
    <>
      <Sidebar
        projectSlug={projectSlug}
        projectName={projectName}
        tree={tree}
        canCreate={canCreate}
        onNewModule={() => setTarget({ parentModuleId: null })}
        onAddSubModule={node =>
          setTarget({ parentModuleId: node.id, parentLabel: node.name })}
      />

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
