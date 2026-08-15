'use client';

import { Button } from '@components/ui/button';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { AlertTriangle, Bug, Folder, FolderTree, Layers, RefreshCw, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-398 — wires the previously-stubbed Command Palette to a real,
// server-backed cross-entity search. Design ruled by Jira comments 12406
// (AI Tech Lead — data-access design) and 12407 (AI Product Owner — UX
// contract), both binding on this ticket per Critical Rule #18. Rewritten
// in place on `cmdk` (already a dependency, `^1.1.1`) per the ruling; this
// file preserves its `data-testid`, its controlled/uncontrolled contract,
// and the `ownsHotkey` single-owner pattern the two mount points
// (`AppSidebar.tsx`, sidebar) already rely on.
//
// Composes `@radix-ui/react-dialog` primitives directly rather than cmdk's
// `Command.Dialog` convenience wrapper — cmdk's wrapper does NOT forward
// `onCloseAutoFocus` (or any other Radix `Dialog.Content` prop) through to
// Radix, which makes the ruling's focus contract (comment 12407 (e),
// candidate 4, 24/25 — "no restore on navigating close" plus a fallback
// chain) impossible to implement through it. `Command` (the root), `Command
// .Input`, `Command.List`, `Command.Group` and `Command.Item` are still the
// list/keyboard engine, per the ruling's own instruction.

interface CommandPaletteProps {
  /**
   * Controlled open state. When provided, the component is controlled and
   *  reports changes via `onOpenChange`; otherwise it manages its own state.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Render the built-in trigger button. Set false to drive the palette from an
   *  external trigger (e.g. the AppSidebar search button) and render only the modal.
   */
  trigger?: boolean
  /**
   * Attach the global ⌘K / Esc key handler. Only ONE mounted instance should own
   *  the hotkey, otherwise a single ⌘K opens multiple palettes at once.
   */
  ownsHotkey?: boolean
}

type SearchEntityType = 'atc' | 'test' | 'project' | 'module' | 'bug' | 'run';

interface SearchResultItem {
  entity_type: SearchEntityType
  id: string
  name: string
  project_id: string
  project_slug: string
  project_name: string
  href: string
}

interface SearchResponse {
  data: SearchResultItem[]
  truncated: boolean
}

type PaletteState = 'guidance' | 'loading' | 'results' | 'no-results' | 'error';

// Canonical, fixed group order (AC-03 3.1 / comment 12407 correction (c)) —
// never re-ordered by relevance. Empty groups are omitted.
const ENTITY_GROUP_ORDER: SearchEntityType[] = ['atc', 'test', 'project', 'module', 'bug', 'run'];
const ENTITY_GROUP_LABEL: Record<SearchEntityType, string> = {
  atc: 'ATCs',
  test: 'Tests',
  project: 'Projects',
  module: 'Modules',
  bug: 'Bugs',
  run: 'Runs',
};
// §3 glossary headwords for the per-result context string (AC-03 3.2:
// "{entity type} · {project} · {name}") — the singular form, distinct from
// the plural group heading above.
const ENTITY_TYPE_LABEL: Record<SearchEntityType, string> = {
  atc: 'ATC',
  test: 'Test',
  project: 'Project',
  module: 'Module',
  bug: 'Bug',
  run: 'Run',
};
const ENTITY_ICON: Record<SearchEntityType, typeof Layers> = {
  atc: Layers,
  test: Layers,
  project: Folder,
  module: FolderTree,
  bug: Bug,
  run: RefreshCw,
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 8000;
const SKELETON_DELAY_MS = 150;
const GROUP_CAP = 5;
const SIDEBAR_SEARCH_SELECTOR = '[data-testid="sidebar-search"]';

export function CommandPalette({
  open: openProp,
  onOpenChange,
  trigger = true,
  ownsHotkey = true,
}: CommandPaletteProps = {}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [truncatedTypes, setTruncatedTypes] = useState<Set<SearchEntityType>>(new Set());
  const [state, setState] = useState<PaletteState>('guidance');
  const [showSkeleton, setShowSkeleton] = useState(false);

  const openerRef = useRef<HTMLElement | null>(null);
  const navigatedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOpen = useCallback((next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next);
    }
    else {
      setInternalOpen(next);
    }
  }, [isControlled, onOpenChange]);

  // Cmd/Ctrl+K — OPEN, never toggle. If already open, the chord keeps it
  // open and refocuses/reselects the input text (comment 12407 (f)). A
  // scoped-exception owner (today only the Markdown editor's own Cmd+K for
  // insert-link) stops propagation so this window listener never sees the
  // keystroke — see `markdown-editor.tsx`.
  useEffect(() => {
    if (!ownsHotkey) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownsHotkey, setOpen]);

  // Capture the opener + reset query/result state on open. The query is
  // NEVER preserved between openings (comment 12407 (e), final bullet).
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      navigatedRef.current = false;
      setQuery('');
      setResults([]);
      setTruncatedTypes(new Set());
      setState('guidance');
    }
  }, [open]);

  // AC-08 8.3 — active-workspace switch while the palette is open aborts
  // the in-flight request and clears to guidance; Workspace A's results are
  // never rendered after the switch. `bk_active_ws` is httpOnly (unreadable
  // client-side, `lib/api/workspace-cookie.ts`), so `WorkspaceSwitcher`
  // dispatches this event on a successful switch rather than the palette
  // polling an inaccessible cookie.
  useEffect(() => {
    const onWorkspaceChanged = () => {
      abortRef.current?.abort();
      setQuery('');
      setResults([]);
      setState('guidance');
    };
    window.addEventListener('bk:workspace-changed', onWorkspaceChanged);
    return () => window.removeEventListener('bk:workspace-changed', onWorkspaceChanged);
  }, []);

  const runSearch = useCallback((trimmed: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState('loading');
    setShowSkeleton(false);
    if (skeletonTimerRef.current) {
      clearTimeout(skeletonTimerRef.current);
    }
    skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);

    const params = new URLSearchParams({ q: trimmed });
    fetch(`/api/v1/search?${params}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    })
      .then(async (res) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!res.ok) {
          setState('error');
          return;
        }
        const body = (await res.json()) as SearchResponse;
        if (controller.signal.aborted) {
          return;
        }
        const counts = new Map<SearchEntityType, number>();
        for (const row of body.data) {
          counts.set(row.entity_type, (counts.get(row.entity_type) ?? 0) + 1);
        }
        setTruncatedTypes(new Set(
          ENTITY_GROUP_ORDER.filter(t => (counts.get(t) ?? 0) >= GROUP_CAP),
        ));
        setResults(body.data);
        setState(body.data.length === 0 ? 'no-results' : 'results');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState('error');
        }
      })
      .finally(() => {
        if (skeletonTimerRef.current) {
          clearTimeout(skeletonTimerRef.current);
        }
        setShowSkeleton(false);
      });
  }, []);

  // 250ms debounce + AbortController, matching `atc-search-filter.tsx`'s
  // shape (comment 12406). Below the 2-char threshold (counted AFTER
  // trimming): guidance, no request (AC-06 6.2).
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setState('guidance');
      setResults([]);
      return;
    }
    const timer = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // Retry re-issues the CURRENT query immediately (no debounce), without
  // closing the palette or clearing the input (comment 12407 (d), final bullet).
  const retry = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      runSearch(trimmed);
    }
  }, [query, runSearch]);

  const selectResult = useCallback((item: SearchResultItem) => {
    navigatedRef.current = true;
    setOpen(false);
    router.push(item.href);
  }, [router, setOpen]);

  // Focus contract (comment 12407 (e), candidate 4 — winner, 24/25):
  //   * Selecting a result (navigating close) never restores focus — the
  //     destination screen takes it.
  //   * Escape / outside click (non-navigating close) restores the captured
  //     opener IF it is still in the document and focusable; otherwise
  //     falls back to the sidebar search control (covers the Cmd+K-from-
  //     anywhere case, which has no DOM opener).
  const handleCloseAutoFocus = useCallback((event: Event) => {
    if (navigatedRef.current) {
      event.preventDefault();
      navigatedRef.current = false;
      return;
    }
    const opener = openerRef.current;
    if (opener && document.contains(opener) && typeof opener.focus === 'function') {
      // Let Radix's default restore-to-opener behavior proceed.
      return;
    }
    event.preventDefault();
    document.querySelector<HTMLElement>(SIDEBAR_SEARCH_SELECTOR)?.focus();
  }, []);

  const groupedResults = ENTITY_GROUP_ORDER
    .map(type => ({ type, items: results.filter(r => r.entity_type === type) }))
    .filter(group => group.items.length > 0);

  return (
    <>
      {trigger && (
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          className="hidden gap-2 md:inline-flex"
        >
          <Search size={11} className="text-fg-3" />
          <span className="text-fg-3">Search…</span>
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </Button>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content
            data-testid="command-palette"
            className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
            onCloseAutoFocus={handleCloseAutoFocus}
          >
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search ATCs, tests, projects, modules, bugs, and runs in this workspace
            </Dialog.Description>
            <Command
              shouldFilter={false}
              loop
              label="Command palette"
              className="w-[640px] max-w-[90vw] overflow-hidden rounded-3 border border-stroke-3 bg-surface-3 shadow-pop"
            >
              <div className="flex items-center gap-2 border-b border-stroke-1 px-3 py-2">
                <Search size={14} className="text-fg-3" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search ATCs, tests, projects, modules, bugs, and runs in this workspace"
                  className="h-7 w-full bg-transparent text-md text-fg-0 outline-none placeholder:text-fg-4"
                />
                <span className="kbd">Esc</span>
              </div>

              {state === 'guidance' && (
                <div data-testid="command-palette-guidance" className="px-3 py-6 text-center text-sm text-fg-3">
                  Search ATCs, tests, projects, modules, bugs, and runs in this workspace
                </div>
              )}

              {state === 'loading' && (
                <div data-testid="command-palette-loading" className="px-3 py-6 text-center text-sm text-fg-3">
                  {showSkeleton ? 'Searching…' : ' '}
                </div>
              )}

              {state === 'error' && (
                <div data-testid="command-palette-error" className="flex flex-col items-center gap-3 px-3 py-6 text-center">
                  <AlertTriangle size={16} className="text-fg-3" />
                  <p className="text-sm text-fg-2">Search failed. Try again.</p>
                  <Button type="button" size="sm" data-testid="command-palette-retry" onClick={retry}>
                    <RefreshCw size={13} />
                    Retry
                  </Button>
                </div>
              )}

              {state === 'no-results' && (
                <div data-testid="command-palette-no-results" className="px-3 py-6 text-center text-sm text-fg-3">
                  {`No results for "${query.trim()}"`}
                </div>
              )}

              {state === 'results' && (
                <Command.List data-testid="command-palette-results" className="max-h-[360px] overflow-y-auto py-1">
                  {groupedResults.map(group => (
                    <Command.Group
                      key={group.type}
                      heading={ENTITY_GROUP_LABEL[group.type]}
                      className="px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-fg-4"
                    >
                      {group.items.map((item) => {
                        const Icon = ENTITY_ICON[item.entity_type];
                        return (
                          <Command.Item
                            key={`${item.entity_type}-${item.id}`}
                            value={`${item.entity_type}-${item.id}`}
                            data-testid={`command-palette-result-${item.entity_type}-${item.id}`}
                            onSelect={() => selectResult(item)}
                            className="flex cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5 text-sm text-fg-0 aria-selected:bg-accent-soft"
                          >
                            <Icon size={13} className="shrink-0 text-fg-3" />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="text-fg-4">
                                {ENTITY_TYPE_LABEL[item.entity_type]}
                                {' · '}
                                {item.project_name}
                                {' · '}
                              </span>
                              {item.name}
                            </span>
                          </Command.Item>
                        );
                      })}
                      {truncatedTypes.has(group.type) && (
                        <div className="px-2 py-1 text-2xs text-fg-4">+ more — narrow your search</div>
                      )}
                    </Command.Group>
                  ))}
                </Command.List>
              )}
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
