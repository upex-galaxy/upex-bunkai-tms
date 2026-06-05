'use client';

import type { Atc, ModuleTreeNode, UserStoryWithChildren } from '@lib/types';
import { cn } from '@lib/utils';
import { ChevronDown, ChevronRight, FilePlus, FileText, FolderClosed, FolderInput, FolderOpen, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface SidebarProps {
  projectSlug: string
  projectName: string
  tree: ModuleTreeNode[]
  selectedAtcId?: string | null
  // Id of the currently selected module row, used to drive the breadcrumb and
  // highlight the active node. Optional so non-explorer callers stay unaffected.
  selectedModuleId?: string | null
  // True when the caller may create modules (workspace role >= member). When
  // false the create affordances are hidden. The API is the authority; this is
  // only a UX hint.
  canCreate?: boolean
  // Opens the create form at the project root (no parent).
  onNewModule?: () => void
  // Opens the create form with the given node as parent.
  onAddSubModule?: (node: ModuleTreeNode) => void
  // Opens the rename form for the given node.
  onRenameModule?: (node: ModuleTreeNode) => void
  // Opens the move dialog for the given node.
  onMoveModule?: (node: ModuleTreeNode) => void
  // Opens the delete confirmation for the given node.
  onDeleteModule?: (node: ModuleTreeNode) => void
  // Opens the new-user-story form anchored to the given module.
  onNewUserStory?: (node: ModuleTreeNode) => void
  // Opens the edit form for a user story.
  onEditUserStory?: (story: UserStoryWithChildren) => void
  // Opens the remove confirmation for a user story.
  onDeleteUserStory?: (story: UserStoryWithChildren) => void
  // Fires when a module row is clicked. Optional (default no-op) so existing
  // callers that don't track selection keep working unchanged.
  onSelect?: (moduleId: string) => void
}

export function Sidebar({
  projectSlug,
  projectName,
  tree,
  selectedAtcId,
  selectedModuleId,
  canCreate = false,
  onNewModule,
  onAddSubModule,
  onRenameModule,
  onMoveModule,
  onDeleteModule,
  onNewUserStory,
  onEditUserStory,
  onDeleteUserStory,
  onSelect,
}: SidebarProps) {
  return (
    <aside className="flex w-[280px] flex-shrink-0 flex-col overflow-hidden border-r border-stroke-1 bg-surface-1">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-stroke-1 px-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-3">
          Explorer
        </span>
        {canCreate && onNewModule
          ? (
              <button
                type="button"
                data-testid="module-new-root"
                onClick={onNewModule}
                title="New module"
                className="inline-flex h-5 items-center gap-1 rounded-1 px-1.5 text-xs text-fg-3 hover:bg-surface-2 hover:text-fg-1"
              >
                <Plus size={11} />
                New
              </button>
            )
          : <span className="text-xs text-fg-3">{projectName}</span>}
      </div>
      <nav className="flex-1 overflow-auto py-1.5">
        {tree.map(node => (
          <ModuleNode
            key={node.id}
            node={node}
            depth={0}
            projectSlug={projectSlug}
            selectedAtcId={selectedAtcId}
            selectedModuleId={selectedModuleId}
            canCreate={canCreate}
            onAddSubModule={onAddSubModule}
            onRenameModule={onRenameModule}
            onMoveModule={onMoveModule}
            onDeleteModule={onDeleteModule}
            onNewUserStory={onNewUserStory}
            onEditUserStory={onEditUserStory}
            onDeleteUserStory={onDeleteUserStory}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </aside>
  );
}

interface ModuleNodeProps {
  node: ModuleTreeNode
  depth: number
  projectSlug: string
  selectedAtcId?: string | null
  selectedModuleId?: string | null
  canCreate?: boolean
  onAddSubModule?: (node: ModuleTreeNode) => void
  onRenameModule?: (node: ModuleTreeNode) => void
  onMoveModule?: (node: ModuleTreeNode) => void
  onDeleteModule?: (node: ModuleTreeNode) => void
  onNewUserStory?: (node: ModuleTreeNode) => void
  onEditUserStory?: (story: UserStoryWithChildren) => void
  onDeleteUserStory?: (story: UserStoryWithChildren) => void
  onSelect?: (moduleId: string) => void
}

function ModuleNode({
  node,
  depth,
  projectSlug,
  selectedAtcId,
  selectedModuleId,
  canCreate = false,
  onAddSubModule,
  onRenameModule,
  onMoveModule,
  onDeleteModule,
  onNewUserStory,
  onEditUserStory,
  onDeleteUserStory,
  onSelect,
}: ModuleNodeProps) {
  const hasChildren
    = node.children.length > 0 || node.user_stories.length > 0 || node.atcs.length > 0;
  const [open, setOpen] = useState(depth < 2);
  const indent = 8 + depth * 12;
  const selected = node.id === selectedModuleId;

  return (
    <div>
      <div
        className={cn(
          'group relative flex h-6 w-full items-center hover:bg-surface-2',
          selected && 'bg-surface-2',
        )}
      >
        <button
          type="button"
          data-testid={`module-row-${node.id}`}
          aria-current={selected ? 'true' : undefined}
          onClick={() => {
            setOpen(o => !o);
            onSelect?.(node.id);
          }}
          className="flex h-6 min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-fg-1"
          style={{ paddingLeft: indent, paddingRight: 8 }}
        >
          <span className="inline-flex w-3 items-center justify-center">
            {hasChildren
              ? open
                ? <ChevronDown size={10} className="text-fg-3" />
                : <ChevronRight size={10} className="text-fg-3" />
              : null}
          </span>
          {open
            ? <FolderOpen size={12} className="text-fg-2" />
            : <FolderClosed size={12} className="text-fg-2" />}
          <span className="truncate font-semibold text-fg-0">{node.name}</span>
          <span className="ml-auto font-mono text-xs text-fg-4">{countAtcs(node)}</span>
        </button>
        {canCreate && (onAddSubModule || onRenameModule || onMoveModule || onDeleteModule) && (
          <div className="absolute right-1 hidden items-center gap-0.5 group-hover:flex">
            {onAddSubModule && (
              <button
                type="button"
                data-testid={`module-add-sub-${node.id}`}
                onClick={() => onAddSubModule(node)}
                title="Add sub-module"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
              >
                <Plus size={11} />
              </button>
            )}
            {onNewUserStory && (
              <button
                type="button"
                data-testid={`module-new-story-${node.id}`}
                onClick={() => onNewUserStory(node)}
                title="New user story"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
              >
                <FilePlus size={11} />
              </button>
            )}
            {onMoveModule && (
              <button
                type="button"
                data-testid={`module-move-${node.id}`}
                onClick={() => onMoveModule(node)}
                title="Move module"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
              >
                <FolderInput size={11} />
              </button>
            )}
            {onRenameModule && (
              <button
                type="button"
                data-testid={`module-rename-${node.id}`}
                onClick={() => onRenameModule(node)}
                title="Rename module"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
              >
                <Pencil size={11} />
              </button>
            )}
            {onDeleteModule && (
              <button
                type="button"
                data-testid={`module-delete-${node.id}`}
                onClick={() => onDeleteModule(node)}
                title="Delete module"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-signal-fail"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <div>
          {node.children.map(child => (
            <ModuleNode
              key={child.id}
              node={child}
              depth={depth + 1}
              projectSlug={projectSlug}
              selectedAtcId={selectedAtcId}
              selectedModuleId={selectedModuleId}
              canCreate={canCreate}
              onAddSubModule={onAddSubModule}
              onRenameModule={onRenameModule}
              onMoveModule={onMoveModule}
              onDeleteModule={onDeleteModule}
              onNewUserStory={onNewUserStory}
              onEditUserStory={onEditUserStory}
              onDeleteUserStory={onDeleteUserStory}
              onSelect={onSelect}
            />
          ))}
          {node.user_stories.map(story => (
            <div key={story.id}>
              <div
                className="group relative flex h-6 items-center gap-1.5 text-sm text-fg-2 hover:bg-surface-2"
                style={{ paddingLeft: indent + 18, paddingRight: 8 }}
              >
                <FileText size={11} className="text-fg-3" />
                {story.external_id && (
                  <span className="font-mono text-xs text-accent">{story.external_id}</span>
                )}
                <span className="truncate text-fg-2">{story.title}</span>
                {canCreate && (onEditUserStory || onDeleteUserStory) && (
                  <div className="absolute right-1 hidden items-center gap-0.5 group-hover:flex">
                    {onEditUserStory && (
                      <button
                        type="button"
                        data-testid={`story-edit-${story.id}`}
                        onClick={() => onEditUserStory(story)}
                        title="Edit story"
                        className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
                      >
                        <Pencil size={10} />
                      </button>
                    )}
                    {onDeleteUserStory && (
                      <button
                        type="button"
                        data-testid={`story-delete-${story.id}`}
                        onClick={() => onDeleteUserStory(story)}
                        title="Remove story"
                        className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-signal-fail"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {story.acceptance_criteria.map(ac => (
                <div
                  key={ac.id}
                  className="flex h-5 items-center gap-1.5 text-xs text-fg-3"
                  style={{ paddingLeft: indent + 36, paddingRight: 8 }}
                >
                  <ListChecks size={10} className="text-fg-4" />
                  <span className="truncate">{ac.title}</span>
                </div>
              ))}
            </div>
          ))}
          {node.atcs.map(atc => (
            <AtcLink
              key={atc.id}
              atc={atc}
              indent={indent + 18}
              projectSlug={projectSlug}
              selected={atc.id === selectedAtcId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AtcLink({
  atc,
  indent,
  projectSlug,
  selected,
}: {
  atc: Atc
  indent: number
  projectSlug: string
  selected: boolean
}) {
  return (
    <Link
      href={`/projects/${projectSlug}/atcs/${atc.id}`}
      className={cn(
        'flex h-6 items-center gap-1.5 text-sm transition-colors',
        selected
          ? 'border-l-2 border-accent bg-accent-soft text-fg-0'
          : 'border-l-2 border-transparent text-fg-1 hover:bg-surface-2',
      )}
      style={{ paddingLeft: indent, paddingRight: 8 }}
    >
      <span className="dot" data-status={atc.status} />
      <span className="font-mono text-xs text-fg-3">{atc.id}</span>
      <span className="truncate">{atc.title}</span>
      <span
        className="layer-chip ml-auto"
        data-layer={atc.layer.toLowerCase()}
      >
        {atc.layer}
      </span>
    </Link>
  );
}

function countAtcs(node: ModuleTreeNode): number {
  let n = node.atcs.length;
  for (const c of node.children) { n += countAtcs(c); }
  return n;
}
