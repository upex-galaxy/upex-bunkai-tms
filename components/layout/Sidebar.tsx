'use client';

import type { Atc, AtcStatus, ModuleTreeNode, UserStoryWithChildren } from '@lib/types';
import type { LucideIcon } from 'lucide-react';
import { cn, shortSlug } from '@lib/utils';
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Copy, FilePlus, Files, FileText, FlaskConical, FolderClosed, FolderInput, FolderOpen, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

// Explorer status filter (BK-9). `all` shows everything; the others narrow the
// visible ATC rows to a single status. `unrun` maps to the `unrun` AtcStatus.
type ExplorerFilter = 'all' | 'fail' | 'blocked' | 'unrun';

const FILTERS: { key: ExplorerFilter, label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'fail', label: 'fail' },
  { key: 'blocked', label: 'blocked' },
  { key: 'unrun', label: 'unrun' },
];

// Right-click context-menu target (BK-10). One union member per row kind so the
// menu can render the right verbs and wire to the matching callback.
type CtxTarget
  = | { kind: 'module', node: ModuleTreeNode }
    | { kind: 'story', story: UserStoryWithChildren }
    | { kind: 'atc', atc: Atc };

interface CtxState {
  x: number
  y: number
  target: CtxTarget
}

type OpenCtx = (e: React.MouseEvent, target: CtxTarget) => void;

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
  // Opens the acceptance-criteria management panel for a user story (BK-15).
  onManageCriteria?: (story: UserStoryWithChildren) => void
  // Fires when a module row is clicked. Optional (default no-op) so existing
  // callers that don't track selection keep working unchanged.
  onSelect?: (moduleId: string) => void
  // When provided, a plain click on an ATC opens it in the Tree workbench's
  // in-pane tab instead of navigating to the full editor.
  onOpenAtc?: (atc: Atc) => void
  // Duplicates an ATC from its context menu (BK-23). One click → deep-copy with
  // the default `(copy)` title → navigate to the new ATC editor.
  onDuplicateAtc?: (atc: Atc) => void
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
  onManageCriteria,
  onSelect,
  onOpenAtc,
  onDuplicateAtc,
}: SidebarProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<ExplorerFilter>('all');
  const [ctx, setCtx] = useState<CtxState | null>(null);

  // Status counts across the whole tree drive the filter-chip badges. Computed
  // from the full tree (not the filtered view) so the numbers stay stable.
  const counts = useMemo(() => countByStatus(tree), [tree]);

  const openCtx: OpenCtx = (e, target) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, target });
  };

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden bg-surface-1">
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
                title="Create a new module"
                className="inline-flex h-5 items-center gap-1 rounded-1 px-1.5 text-xs font-medium text-fg-2 hover:bg-surface-2 hover:text-fg-0"
              >
                <Plus size={12} />
                New module
              </button>
            )
          : <span className="text-xs text-fg-3">{projectName}</span>}
      </div>
      {/* Status filter chips (BK-9). Hidden when the project has no ATCs yet so
          an empty project doesn't show four zero-count chips. */}
      {counts.all > 0 && (
        <div
          data-testid="explorer-filters"
          className="flex flex-shrink-0 items-center gap-1.5 border-b border-stroke-1 px-2.5 py-2"
        >
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              data-testid={`explorer-filter-${f.key}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center rounded-1 border px-1.5 py-0.5 text-2xs font-medium transition-colors',
                filter === f.key
                  ? 'border-stroke-3 bg-surface-3 text-fg-0'
                  : 'border-stroke-1 text-fg-2 hover:border-stroke-2 hover:text-fg-1',
              )}
            >
              {f.label}
              <span className="ml-1 font-mono text-fg-4">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}
      <nav className="flex-1 overflow-auto py-1.5">
        {tree.length === 0
          ? (
              <div
                data-testid="modules-empty-state"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <FolderClosed size={20} className="text-fg-4" />
                <p className="text-sm text-fg-3">No modules yet</p>
                {canCreate && onNewModule
                  ? (
                      <button
                        type="button"
                        data-testid="module-empty-cta"
                        onClick={onNewModule}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-sm text-fg-1 hover:border-stroke-3 hover:bg-surface-3"
                      >
                        <Plus size={13} />
                        Create your first module
                      </button>
                    )
                  : (
                      <p className="text-xs text-fg-4">Ask a workspace member to add one.</p>
                    )}
              </div>
            )
          : tree.map(node => (
              <ModuleNode
                key={node.id}
                node={node}
                depth={0}
                projectSlug={projectSlug}
                selectedAtcId={selectedAtcId}
                selectedModuleId={selectedModuleId}
                canCreate={canCreate}
                filter={filter}
                onAddSubModule={onAddSubModule}
                onRenameModule={onRenameModule}
                onMoveModule={onMoveModule}
                onDeleteModule={onDeleteModule}
                onNewUserStory={onNewUserStory}
                onEditUserStory={onEditUserStory}
                onDeleteUserStory={onDeleteUserStory}
                onManageCriteria={onManageCriteria}
                onSelect={onSelect}
                onContextMenu={openCtx}
                onOpenAtc={onOpenAtc}
              />
            ))}
      </nav>
      {ctx && (
        <ExplorerContextMenu
          state={ctx}
          projectSlug={projectSlug}
          canCreate={canCreate}
          onClose={() => setCtx(null)}
          router={router}
          onSelect={onSelect}
          onAddSubModule={onAddSubModule}
          onRenameModule={onRenameModule}
          onMoveModule={onMoveModule}
          onDeleteModule={onDeleteModule}
          onNewUserStory={onNewUserStory}
          onEditUserStory={onEditUserStory}
          onDeleteUserStory={onDeleteUserStory}
          onManageCriteria={onManageCriteria}
          onDuplicateAtc={onDuplicateAtc}
        />
      )}
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
  filter: ExplorerFilter
  onAddSubModule?: (node: ModuleTreeNode) => void
  onRenameModule?: (node: ModuleTreeNode) => void
  onMoveModule?: (node: ModuleTreeNode) => void
  onDeleteModule?: (node: ModuleTreeNode) => void
  onNewUserStory?: (node: ModuleTreeNode) => void
  onEditUserStory?: (story: UserStoryWithChildren) => void
  onDeleteUserStory?: (story: UserStoryWithChildren) => void
  onManageCriteria?: (story: UserStoryWithChildren) => void
  onSelect?: (moduleId: string) => void
  onContextMenu: OpenCtx
  onOpenAtc?: (atc: Atc) => void
}

function ModuleNode({
  node,
  depth,
  projectSlug,
  selectedAtcId,
  selectedModuleId,
  canCreate = false,
  filter,
  onAddSubModule,
  onRenameModule,
  onMoveModule,
  onDeleteModule,
  onNewUserStory,
  onEditUserStory,
  onDeleteUserStory,
  onManageCriteria,
  onSelect,
  onContextMenu,
  onOpenAtc,
}: ModuleNodeProps) {
  const hasChildren
    = node.children.length > 0 || node.user_stories.length > 0 || node.atcs.length > 0;
  const [open, setOpen] = useState(depth < 2);
  const indent = 8 + depth * 12;
  const selected = node.id === selectedModuleId;
  const moduleRollup = rollupStatus(moduleStatuses(node));
  // ATCs that belong to a user story in this module are rendered nested under
  // that story (StoryNode). Only render genuinely module-level / orphan ATCs
  // flat here, so a story-linked ATC isn't drawn twice.
  const storyIds = new Set(node.user_stories.map(s => s.id));
  const visibleAtcs = node.atcs.filter(
    atc => !storyIds.has(atc.user_story_id) && atcMatches(atc.status, filter),
  );

  return (
    <div>
      <div
        onContextMenu={e => onContextMenu(e, { kind: 'module', node })}
        className={cn(
          'group relative flex h-6 w-full items-center hover:bg-surface-2',
          selected && 'bg-surface-2',
        )}
      >
        <button
          type="button"
          data-testid={`module-toggle-${node.id}`}
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          aria-label={hasChildren ? (open ? 'Collapse module' : 'Expand module') : undefined}
          aria-expanded={hasChildren ? open : undefined}
          className="inline-flex h-6 w-4 flex-shrink-0 items-center justify-center disabled:cursor-default"
          style={{ marginLeft: indent }}
        >
          {hasChildren
            ? open
              ? <ChevronDown size={10} className="text-fg-3" />
              : <ChevronRight size={10} className="text-fg-3" />
            : null}
        </button>
        <button
          type="button"
          data-testid={`module-row-${node.id}`}
          aria-current={selected ? 'true' : undefined}
          onClick={() => {
            onSelect?.(node.id);
            setOpen(true);
          }}
          className="flex h-6 min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-fg-1"
          style={{ paddingRight: 8 }}
        >
          {open
            ? <FolderOpen size={12} className="text-fg-2" />
            : <FolderClosed size={12} className="text-fg-2" />}
          <span className="truncate font-semibold text-fg-0">{node.name}</span>
          {moduleRollup && <span className="dot ml-auto shrink-0" data-status={moduleRollup} />}
          <span className={cn('font-mono text-xs text-fg-4', !moduleRollup && 'ml-auto')}>{countAtcs(node)}</span>
        </button>
        {canCreate && (onAddSubModule || onRenameModule || onMoveModule || onDeleteModule) && (
          <div className="absolute right-1 hidden items-center gap-0.5 group-hover:flex">
            {onAddSubModule && (
              <button
                type="button"
                data-testid={`module-add-sub-${node.id}`}
                onClick={() => onAddSubModule(node)}
                title="Add sub-module"
                aria-label="Add sub-module"
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
                aria-label="New user story"
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
                aria-label="Move module"
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
                aria-label="Rename module"
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
                aria-label="Delete module"
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
              filter={filter}
              onAddSubModule={onAddSubModule}
              onRenameModule={onRenameModule}
              onMoveModule={onMoveModule}
              onDeleteModule={onDeleteModule}
              onNewUserStory={onNewUserStory}
              onEditUserStory={onEditUserStory}
              onDeleteUserStory={onDeleteUserStory}
              onManageCriteria={onManageCriteria}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onOpenAtc={onOpenAtc}
            />
          ))}
          {node.user_stories.map(story => (
            <StoryNode
              key={story.id}
              story={story}
              indent={indent + 12}
              projectSlug={projectSlug}
              canCreate={canCreate}
              filter={filter}
              selectedAtcId={selectedAtcId}
              onEditUserStory={onEditUserStory}
              onDeleteUserStory={onDeleteUserStory}
              onManageCriteria={onManageCriteria}
              onContextMenu={onContextMenu}
              onOpenAtc={onOpenAtc}
            />
          ))}
          {visibleAtcs.map(atc => (
            <AtcLink
              key={atc.id}
              atc={atc}
              indent={indent + 18}
              projectSlug={projectSlug}
              selected={atc.id === selectedAtcId}
              onContextMenu={onContextMenu}
              onOpenAtc={onOpenAtc}
            />
          ))}
          {node.children.length === 0
            && node.user_stories.length === 0
            && node.atcs.length === 0 && (
            <div
              className="flex h-5 items-center text-xs italic text-fg-4"
              style={{ paddingLeft: indent + 30, paddingRight: 8 }}
            >
              No stories yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A user story renders as an accordion: the AC + ATC children stay collapsed
// until the row is toggled, so a module with many stories doesn't explode into
// a 200-line flat list. ATCs linked to the story nest here (not flat under the
// module). Clicking an AC opens the criteria panel; hover exposes a Create-ATC
// shortcut anchored to this story.
function StoryNode({
  story,
  indent,
  projectSlug,
  canCreate,
  filter,
  selectedAtcId,
  onEditUserStory,
  onDeleteUserStory,
  onManageCriteria,
  onContextMenu,
  onOpenAtc,
}: {
  story: UserStoryWithChildren
  indent: number
  projectSlug: string
  canCreate: boolean
  filter: ExplorerFilter
  selectedAtcId?: string | null
  onEditUserStory?: (story: UserStoryWithChildren) => void
  onDeleteUserStory?: (story: UserStoryWithChildren) => void
  onManageCriteria?: (story: UserStoryWithChildren) => void
  onContextMenu: OpenCtx
  onOpenAtc?: (atc: Atc) => void
}) {
  const [open, setOpen] = useState(false);
  const acs = story.acceptance_criteria;
  const storyAtcs = story.atcs.filter(atc => atcMatches(atc.status, filter));
  const storyRollup = rollupStatus(story.atcs.map(a => a.status));
  const hasChildren = acs.length > 0 || story.atcs.length > 0;
  const newAtcHref = `/projects/${projectSlug}/atcs/new?story=${story.id}`;

  return (
    <div>
      <div
        onContextMenu={e => onContextMenu(e, { kind: 'story', story })}
        className="group relative flex h-6 items-center hover:bg-surface-2"
        style={{ paddingLeft: indent, paddingRight: 8 }}
      >
        <button
          type="button"
          data-testid={`story-toggle-${story.id}`}
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          aria-label={hasChildren ? (open ? 'Collapse story' : 'Expand story') : undefined}
          aria-expanded={hasChildren ? open : undefined}
          className="inline-flex h-6 w-4 flex-shrink-0 items-center justify-center disabled:cursor-default"
        >
          {hasChildren
            ? open
              ? <ChevronDown size={10} className="text-fg-3" />
              : <ChevronRight size={10} className="text-fg-3" />
            : null}
        </button>
        <button
          type="button"
          data-testid={`story-row-${story.id}`}
          aria-expanded={hasChildren ? open : undefined}
          onClick={() => setOpen(o => !o)}
          className="flex h-6 min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
        >
          <FileText size={11} className="shrink-0 text-fg-3" />
          {story.external_id && (
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-accent">{story.external_id}</span>
          )}
          <span className="min-w-0 flex-1 truncate text-fg-2">{story.title}</span>
          {storyRollup && <span className="dot shrink-0" data-status={storyRollup} />}
          {story.status === 'ready_to_test' && (
            <span
              data-testid={`story-status-${story.id}`}
              className="shrink-0 rounded-1 bg-accent-soft px-1 font-mono text-[10px] font-semibold text-accent"
            >
              ready
            </span>
          )}
        </button>
        {canCreate && (
          <div className="absolute right-1 hidden items-center gap-0.5 group-hover:flex">
            <Link
              href={newAtcHref}
              data-testid={`story-new-atc-${story.id}`}
              title="Create ATC for this story"
              aria-label="Create ATC for this story"
              className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-accent"
            >
              <FlaskConical size={10} />
            </Link>
            {onManageCriteria && (
              <button
                type="button"
                data-testid={`story-criteria-${story.id}`}
                onClick={() => onManageCriteria(story)}
                title="Manage acceptance criteria"
                aria-label="Manage acceptance criteria"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
              >
                <ListChecks size={10} />
              </button>
            )}
            {onEditUserStory && (
              <button
                type="button"
                data-testid={`story-edit-${story.id}`}
                onClick={() => onEditUserStory(story)}
                title="Edit story"
                aria-label="Edit story"
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
                aria-label="Remove story"
                className="flex h-5 w-5 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-signal-fail"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <div>
          {acs.map(ac => (
            <div
              key={ac.id}
              className="group/ac relative flex h-5 items-center hover:bg-surface-2"
              style={{ paddingLeft: indent + 22, paddingRight: 8 }}
            >
              <button
                type="button"
                data-testid={`ac-row-${ac.id}`}
                onClick={() => onManageCriteria?.(story)}
                title="View acceptance criteria"
                className="flex h-5 min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-fg-3"
              >
                <ListChecks size={10} className="shrink-0 text-fg-4" />
                <span className="min-w-0 flex-1 truncate">{ac.title}</span>
              </button>
              {canCreate && (
                <Link
                  href={`${newAtcHref}&ac=${ac.id}`}
                  data-testid={`ac-new-atc-${ac.id}`}
                  title="Create ATC from this criterion"
                  aria-label="Create ATC from this criterion"
                  className="absolute right-1 hidden h-4 w-4 items-center justify-center rounded-1 bg-surface-2 text-fg-3 hover:bg-surface-3 hover:text-accent group-hover/ac:flex"
                >
                  <Plus size={10} />
                </Link>
              )}
            </div>
          ))}
          {storyAtcs.map(atc => (
            <AtcLink
              key={atc.id}
              atc={atc}
              indent={indent + 22}
              projectSlug={projectSlug}
              selected={atc.id === selectedAtcId}
              onContextMenu={onContextMenu}
              onOpenAtc={onOpenAtc}
            />
          ))}
          {!hasChildren && (
            <div
              className="flex h-5 items-center text-2xs italic text-fg-4"
              style={{ paddingLeft: indent + 22, paddingRight: 8 }}
            >
              No criteria yet
            </div>
          )}
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
  onContextMenu,
  onOpenAtc,
}: {
  atc: Atc
  indent: number
  projectSlug: string
  selected: boolean
  onContextMenu: OpenCtx
  onOpenAtc?: (atc: Atc) => void
}) {
  return (
    <Link
      href={`/projects/${projectSlug}/atcs/${atc.id}`}
      onContextMenu={e => onContextMenu(e, { kind: 'atc', atc })}
      onClick={(e) => {
        // In the Tree workbench, a plain click opens the ATC in an in-pane tab
        // instead of navigating to the full editor. Modifier/middle clicks keep
        // the native link behaviour (open the editor in a new tab).
        if (onOpenAtc && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          onOpenAtc(atc);
        }
      }}
      className={cn(
        'flex h-6 items-center gap-1.5 text-sm transition-colors',
        selected
          ? 'border-l-2 border-accent bg-accent-soft text-fg-0'
          : 'border-l-2 border-transparent text-fg-1 hover:bg-surface-2',
      )}
      style={{ paddingLeft: indent, paddingRight: 8 }}
    >
      <span className="dot shrink-0" data-status={atc.status} />
      <span className="shrink-0 font-mono text-xs text-fg-3" title={atc.slug}>{shortSlug(atc.slug)}</span>
      <span className="min-w-0 flex-1 truncate">{atc.title}</span>
      <span
        className="layer-chip shrink-0"
        data-layer={atc.layer.toLowerCase()}
      >
        {atc.layer}
      </span>
    </Link>
  );
}

// ── Context menu (BK-10) ───────────────────────────────────────────
// Custom right-click menu. Deliberately not @radix-ui/react-context-menu —
// that's not in deps and adding it churns package.json/lockfile. Items reuse
// the callbacks already threaded into Sidebar; affordances without a backend
// (Run, Duplicate, View deps) render disabled with a "soon" hint.

interface MenuItem {
  label: string
  icon?: LucideIcon
  shortcut?: string
  onClick?: () => void
  danger?: boolean
  accent?: boolean
  soon?: boolean
}

type MenuEntry = MenuItem | 'divider';

interface ContextMenuProps {
  state: CtxState
  projectSlug: string
  canCreate: boolean
  onClose: () => void
  router: ReturnType<typeof useRouter>
  onSelect?: (moduleId: string) => void
  onAddSubModule?: (node: ModuleTreeNode) => void
  onRenameModule?: (node: ModuleTreeNode) => void
  onMoveModule?: (node: ModuleTreeNode) => void
  onDeleteModule?: (node: ModuleTreeNode) => void
  onNewUserStory?: (node: ModuleTreeNode) => void
  onEditUserStory?: (story: UserStoryWithChildren) => void
  onDeleteUserStory?: (story: UserStoryWithChildren) => void
  onManageCriteria?: (story: UserStoryWithChildren) => void
  onDuplicateAtc?: (atc: Atc) => void
}

function ExplorerContextMenu({
  state,
  projectSlug,
  canCreate,
  onClose,
  router,
  onSelect,
  onAddSubModule,
  onRenameModule,
  onMoveModule,
  onDeleteModule,
  onNewUserStory,
  onEditUserStory,
  onDeleteUserStory,
  onManageCriteria,
  onDuplicateAtc,
}: ContextMenuProps) {
  // Close on Escape, on scroll, and on resize — a positioned menu shouldn't
  // linger detached from the row it points at.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).then(
      () => toast.success('ID copied to clipboard'),
      () => toast.error('Could not copy ID'),
    );
  };

  const { target } = state;
  const { title, kind, entries } = buildMenu();

  function buildMenu(): { title: string, kind: string, entries: MenuEntry[] } {
    if (target.kind === 'module') {
      const node = target.node;
      const entries: MenuEntry[] = [
        { label: 'Open', icon: ArrowRight, shortcut: '⏎', onClick: () => onSelect?.(node.id) },
      ];
      if (canCreate) {
        entries.push(
          'divider',
          ...(onAddSubModule ? [{ label: 'New sub-module', icon: Plus, onClick: () => onAddSubModule(node) }] : []),
          ...(onNewUserStory ? [{ label: 'New user story', icon: FilePlus, onClick: () => onNewUserStory(node) }] : []),
          'divider',
          ...(onRenameModule ? [{ label: 'Rename', icon: Pencil, shortcut: 'F2', onClick: () => onRenameModule(node) }] : []),
          ...(onMoveModule ? [{ label: 'Move', icon: FolderInput, onClick: () => onMoveModule(node) }] : []),
          { label: 'Duplicate', icon: Files, shortcut: '⌘D', soon: true },
        );
      }
      entries.push(
        { label: 'Copy ID', icon: Copy, shortcut: '⌘C', onClick: () => copyId(node.id) },
      );
      if (canCreate && onDeleteModule) {
        entries.push('divider', { label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true, onClick: () => onDeleteModule(node) });
      }
      return { title: node.name, kind: 'Module', entries };
    }

    if (target.kind === 'story') {
      const story = target.story;
      const entries: MenuEntry[] = [];
      if (canCreate) {
        entries.push(
          ...(onManageCriteria ? [{ label: 'Manage criteria', icon: ListChecks, onClick: () => onManageCriteria(story) }] : []),
          ...(onEditUserStory ? [{ label: 'Edit', icon: Pencil, shortcut: 'E', onClick: () => onEditUserStory(story) }] : []),
        );
      }
      entries.push(
        { label: 'Copy ID', icon: Copy, shortcut: '⌘C', onClick: () => copyId(story.external_id ?? story.id) },
      );
      if (canCreate && onDeleteUserStory) {
        entries.push('divider', { label: 'Remove', icon: Trash2, shortcut: '⌫', danger: true, onClick: () => onDeleteUserStory(story) });
      }
      return { title: story.external_id ?? story.title, kind: 'User story', entries };
    }

    const atc = target.atc;
    const href = `/projects/${projectSlug}/atcs/${atc.id}`;
    const entries: MenuEntry[] = [
      { label: 'Open', icon: ArrowRight, shortcut: '⏎', onClick: () => router.push(href) },
      { label: 'Open in new tab', icon: ArrowUpRight, shortcut: '⌘⏎', onClick: () => window.open(href, '_blank', 'noopener') },
    ];
    if (canCreate && onDuplicateAtc) {
      entries.push(
        'divider',
        { label: 'Duplicate', icon: Files, shortcut: '⌘D', onClick: () => onDuplicateAtc(atc) },
      );
    }
    entries.push(
      'divider',
      { label: 'Copy ID', icon: Copy, shortcut: '⌘C', onClick: () => copyId(atc.id) },
    );
    return { title: atc.id, kind: 'ATC', entries };
  }

  // Clamp into the viewport so the menu never spills off-screen. Width/height
  // are fixed estimates that match the rendered popover.
  const MENU_W = 230;
  const estH = 56 + entries.length * 28;
  const left = Math.min(state.x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - MENU_W - 8);
  const top = Math.min(state.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - estH - 8);

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        data-testid="explorer-context-menu"
        role="menu"
        className="fixed z-[51] w-[230px] rounded-2 border border-stroke-3 bg-surface-3 p-1 shadow-pop"
        style={{ left, top }}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="mb-1 border-b border-stroke-1 px-2 py-1.5">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-3">{kind}</div>
          <div className="truncate text-sm font-semibold text-fg-0">{title}</div>
        </div>
        {entries.map((it, i) =>
          it === 'divider'
            ? <div key={`div-${i}`} className="my-1 h-px bg-stroke-1" />
            : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  data-testid={`ctx-${it.label.toLowerCase().replace(/\s+/g, '-')}`}
                  disabled={it.soon || !it.onClick}
                  onClick={() => {
                    it.onClick?.();
                    onClose();
                  }}
                  className={cn(
                    'grid w-full grid-cols-[14px_1fr_auto] items-center gap-2 rounded-1 px-2 py-1.5 text-left text-sm',
                    it.danger
                      ? 'text-signal-fail hover:bg-surface-4'
                      : it.accent
                        ? 'text-accent-hi hover:bg-surface-4'
                        : 'text-fg-1 hover:bg-surface-4',
                    (it.soon || !it.onClick) && 'cursor-default opacity-40 hover:bg-transparent',
                  )}
                >
                  <span className="flex items-center justify-center">
                    {it.icon ? <it.icon size={12} /> : null}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {it.label}
                    {it.soon && <span className="rounded-1 bg-surface-2 px-1 font-mono text-[9px] uppercase text-fg-4">soon</span>}
                  </span>
                  {it.shortcut ? <span className="kbd">{it.shortcut}</span> : <span />}
                </button>
              ),
        )}
      </div>
    </>
  );
}

function atcMatches(status: AtcStatus, filter: ExplorerFilter): boolean {
  return filter === 'all' || status === filter;
}

function countAtcs(node: ModuleTreeNode): number {
  let n = node.atcs.length;
  for (const c of node.children) { n += countAtcs(c); }
  return n;
}

// Worst-first precedence for the roll-up status dot on container rows (module /
// story). A module shows the most-severe status among the ATCs beneath it, so
// the tree reads at a glance — matches the mockup's per-row dots.
const ROLLUP_ORDER: AtcStatus[] = ['fail', 'blocked', 'running', 'unrun', 'skipped', 'pass'];

function rollupStatus(statuses: AtcStatus[]): AtcStatus | null {
  if (statuses.length === 0) { return null; }
  for (const s of ROLLUP_ORDER) {
    if (statuses.includes(s)) { return s; }
  }
  return null;
}

// node.atcs already holds every ATC in the module (the tree builder buckets
// story-linked ATCs there too), so recursing children alone covers the subtree.
function moduleStatuses(node: ModuleTreeNode): AtcStatus[] {
  const acc = node.atcs.map(a => a.status);
  for (const c of node.children) { acc.push(...moduleStatuses(c)); }
  return acc;
}

function countByStatus(tree: ModuleTreeNode[]): Record<ExplorerFilter, number> {
  const acc: Record<ExplorerFilter, number> = { all: 0, fail: 0, blocked: 0, unrun: 0 };
  const walk = (node: ModuleTreeNode) => {
    for (const atc of node.atcs) {
      acc.all += 1;
      if (atc.status === 'fail') { acc.fail += 1; }
      else if (atc.status === 'blocked') { acc.blocked += 1; }
      else if (atc.status === 'unrun') { acc.unrun += 1; }
    }
    for (const child of node.children) { walk(child); }
  };
  for (const node of tree) { walk(node); }
  return acc;
}
