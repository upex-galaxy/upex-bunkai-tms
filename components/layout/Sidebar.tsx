'use client';

import type { Atc, ModuleTreeNode } from '@lib/types';
import { cn } from '@lib/utils';
import { ChevronDown, ChevronRight, FileText, FolderClosed, FolderOpen, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface SidebarProps {
  projectSlug: string
  projectName: string
  tree: ModuleTreeNode[]
  selectedAtcId?: string | null
}

export function Sidebar({ projectSlug, projectName, tree, selectedAtcId }: SidebarProps) {
  return (
    <aside className="flex w-[280px] flex-shrink-0 flex-col overflow-hidden border-r border-stroke-1 bg-surface-1">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-stroke-1 px-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-3">
          Explorer
        </span>
        <span className="text-xs text-fg-3">{projectName}</span>
      </div>
      <nav className="flex-1 overflow-auto py-1.5">
        {tree.map(node => (
          <ModuleNode
            key={node.id}
            node={node}
            depth={0}
            projectSlug={projectSlug}
            selectedAtcId={selectedAtcId}
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
}

function ModuleNode({ node, depth, projectSlug, selectedAtcId }: ModuleNodeProps) {
  const hasChildren
    = node.children.length > 0 || node.user_stories.length > 0 || node.atcs.length > 0;
  const [open, setOpen] = useState(depth < 2);
  const indent = 8 + depth * 12;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-6 w-full items-center gap-1.5 text-left text-sm text-fg-1 hover:bg-surface-2"
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
      {open && (
        <div>
          {node.children.map(child => (
            <ModuleNode
              key={child.id}
              node={child}
              depth={depth + 1}
              projectSlug={projectSlug}
              selectedAtcId={selectedAtcId}
            />
          ))}
          {node.user_stories.map(story => (
            <div key={story.id}>
              <div
                className="flex h-6 items-center gap-1.5 text-sm text-fg-2"
                style={{ paddingLeft: indent + 18, paddingRight: 8 }}
              >
                <FileText size={11} className="text-fg-3" />
                <span className="font-mono text-xs text-accent">{story.external_id}</span>
                <span className="truncate text-fg-2">{story.title}</span>
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
