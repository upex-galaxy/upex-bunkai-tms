'use client';

import type { Project, Workspace } from '@lib/types';
import { cn } from '@lib/utils';
import { ChevronDown } from 'lucide-react';

interface WorkspaceSwitcherProps {
  workspace: Workspace
  project: Project
  className?: string
}

export function WorkspaceSwitcher({ workspace, project, className }: WorkspaceSwitcherProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-2 text-sm text-fg-1 hover:border-stroke-3 hover:bg-surface-3',
        className,
      )}
    >
      <span className="font-jp text-md font-bold text-fg-0">分</span>
      <span className="text-fg-3">{workspace.name}</span>
      <span className="text-fg-4">/</span>
      <span className="font-semibold text-fg-0">{project.name}</span>
      <ChevronDown size={11} className="text-fg-3" />
    </button>
  );
}
