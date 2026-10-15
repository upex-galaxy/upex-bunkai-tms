'use client';

import type { ViewKind } from '@lib/saved-views/constants';
import type { MenuNotice } from '@lib/saved-views/menu-state';
import type { SavedViewState } from '@lib/saved-views/state';
import type { SavedViewItem } from '@lib/saved-views/view-model';
import { Button } from '@components/ui/button';
import { SAVED_VIEW_COPY } from '@lib/saved-views/constants';
import { pruneNotice, resolveActiveView, stateKey, visibleNotice } from '@lib/saved-views/menu-state';
import { resolveRestore, restoreNotice } from '@lib/saved-views/restore';
import { isStateEmpty } from '@lib/saved-views/state';
import { Bookmark, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SavedViewDeleteDialog, SavedViewNameDialog } from './SavedViewDialogs';
import { useSavedViews } from './useSavedViews';

// BK-443 — the Saved views control, one component mounted in each surface's own
// filter toolbar (master-design-plan §5 D42). A trigger button opens a popover
// of the member's views for THIS surface; opening one replaces the applied
// filters; the footer saves the current filters or updates the active view.
//
// The surface owns its filter state. It passes the state it currently shows
// (`currentState`, in canonical form) and an `onApply` that makes the surface
// show a given state, address included. This component never touches the
// address itself, so each surface keeps the filter mechanism it already has.

interface SavedViewsMenuProps {
  projectId: string
  kind: ViewKind
  // The filters the surface shows right now, canonical (see `stateFromParams`).
  currentState: SavedViewState
  // Make the surface show exactly this state. Called with `{}` when a view no
  // longer applies at all, which clears the filters.
  onApply: (state: SavedViewState) => void
  // Active module ids on a surface with a module filter, to degrade a view
  // whose module was archived (AC-12).
  moduleIds?: ReadonlySet<string>
}

type DialogState
  = | { mode: 'closed' }
    | { mode: 'create' }
    | { mode: 'rename', view: SavedViewItem }
    | { mode: 'delete', view: SavedViewItem };

const PREFIX = 'saved-views';

export function SavedViewsMenu({ projectId, kind, currentState, onApply, moduleIds }: SavedViewsMenuProps) {
  const { views, status, load, create, rename, replaceState, remove } = useSavedViews(projectId, kind);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<MenuNotice | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch whenever the panel opens, so views saved in another tab appear.
  useEffect(() => {
    if (open) { void load(); }
  }, [open, load]);

  useEffect(() => {
    if (!open) { return; }
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialog.mode === 'closed') { setOpen(false); }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, dialog.mode]);

  // A notice belongs to the state it was raised for: drop it for good on the next
  // filter edit, so it cannot reappear when the filters return to that state.
  const currentKey = stateKey(currentState);
  useEffect(() => {
    setNotice(current => pruneNotice(current, currentState));
  }, [currentKey]);

  const active = resolveActiveView(views, activeId);
  const shownNotice = visibleNotice(notice, currentState);

  const applyView = (view: SavedViewItem) => {
    const result = resolveRestore(kind, view.state, { moduleIds });
    onApply(result.state);
    setActiveId(view.id);
    const message = restoreNotice(result);
    setNotice(message === null ? null : { message, forKey: stateKey(result.state) });
    setOpen(false);
  };

  // Nothing applied means nothing to save (AC-10): say so instead of opening a
  // dialog that could only fail.
  const guardNonEmpty = (): boolean => {
    if (!isStateEmpty(currentState)) { return true; }
    setNotice({ message: SAVED_VIEW_COPY.nothingToSave, forKey: stateKey(currentState) });
    setOpen(false);
    return false;
  };

  const startSave = () => {
    if (guardNonEmpty()) { setDialog({ mode: 'create' }); }
  };

  const updateActive = async () => {
    if (!active || !guardNonEmpty()) { return; }
    const result = await replaceState(active.id, currentState);
    if (result.ok) {
      toast.success('Saved view updated');
      setOpen(false);
    }
    else {
      toast.error(result.message);
    }
  };

  return (
    <div ref={containerRef} className="relative inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={`${PREFIX}-trigger`}
        onClick={() => setOpen(o => !o)}
      >
        <Bookmark size={12} />
        Saved views
      </Button>

      {shownNotice && (
        <p role="status" data-testid={`${PREFIX}-notice`} className="m-0 max-w-[320px] text-right text-2xs text-fg-2">
          {shownNotice}
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Saved views"
          data-testid={`${PREFIX}-panel`}
          className="absolute right-0 top-full z-50 mt-1 w-[320px] max-w-[calc(100vw-2rem)] rounded-2 border border-stroke-1 bg-surface-2 py-1 text-left shadow-lg"
        >
          {views === null && status !== 'error' && (
            <p data-testid={`${PREFIX}-loading`} className="m-0 px-3 py-2 text-xs text-fg-4">Loading saved views…</p>
          )}

          {status === 'error' && views === null && (
            <div className="px-3 py-2" data-testid={`${PREFIX}-error`}>
              <p className="m-0 text-xs text-signal-fail">{SAVED_VIEW_COPY.unavailable}</p>
              <Button type="button" variant="ghost" size="sm" data-testid={`${PREFIX}-retry`} onClick={() => { void load(); }}>
                Retry
              </Button>
            </div>
          )}

          {views !== null && views.length === 0 && (
            <p data-testid={`${PREFIX}-empty`} className="m-0 px-3 py-2 text-xs text-fg-3">No saved views yet</p>
          )}

          {views !== null && views.length > 0 && (
            <ul className="m-0 max-h-72 list-none overflow-y-auto p-0">
              {views.map(view => (
                <li key={view.id} className="flex items-center gap-1 px-1">
                  <button
                    type="button"
                    data-testid={`${PREFIX}-item-${view.id}`}
                    aria-current={view.id === active?.id}
                    onClick={() => applyView(view)}
                    className="min-w-0 flex-1 truncate rounded-1 px-2 py-1.5 text-left text-sm text-fg-1 hover:bg-surface-3"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${view.name}`}
                    data-testid={`${PREFIX}-rename-${view.id}`}
                    onClick={() => setDialog({ mode: 'rename', view })}
                    className="inline-flex size-6 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-fg-0"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    data-testid={`${PREFIX}-delete-${view.id}`}
                    onClick={() => setDialog({ mode: 'delete', view })}
                    className="inline-flex size-6 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-signal-fail"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 flex flex-col gap-0.5 border-t border-stroke-1 px-1 pt-1">
            <button
              type="button"
              data-testid={`${PREFIX}-save`}
              onClick={startSave}
              className="rounded-1 px-2 py-1.5 text-left text-sm text-fg-1 hover:bg-surface-3"
            >
              Save current view…
            </button>
            {active && (
              <button
                type="button"
                data-testid={`${PREFIX}-update`}
                onClick={() => { void updateActive(); }}
                className="truncate rounded-1 px-2 py-1.5 text-left text-sm text-fg-1 hover:bg-surface-3"
              >
                {`Update “${active.name}” with current filters`}
              </button>
            )}
          </div>
        </div>
      )}

      <SavedViewNameDialog
        open={dialog.mode === 'create' || dialog.mode === 'rename'}
        testId={`${PREFIX}-name-dialog`}
        title={dialog.mode === 'rename' ? 'Rename saved view' : 'Save current view'}
        submitLabel={dialog.mode === 'rename' ? 'Rename' : 'Save view'}
        initialName={dialog.mode === 'rename' ? dialog.view.name : ''}
        onClose={() => setDialog({ mode: 'closed' })}
        onSubmit={async (name) => {
          const result = dialog.mode === 'rename'
            ? await rename(dialog.view.id, name)
            : await create(name, currentState);
          if (!result.ok) { return result.message; }
          if (dialog.mode === 'create') { setActiveId(result.item.id); }
          setDialog({ mode: 'closed' });
          return null;
        }}
      />

      <SavedViewDeleteDialog
        name={dialog.mode === 'delete' ? dialog.view.name : null}
        testId={`${PREFIX}-delete-dialog`}
        onClose={() => setDialog({ mode: 'closed' })}
        onConfirm={async () => {
          if (dialog.mode !== 'delete') { return null; }
          const result = await remove(dialog.view.id);
          if (!result.ok) { return result.message; }
          setDialog({ mode: 'closed' });
          return null;
        }}
      />
    </div>
  );
}
