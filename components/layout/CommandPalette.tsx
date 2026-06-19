'use client';

import { Button } from '@components/ui/button';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

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

export function CommandPalette({
  open: openProp,
  onOpenChange,
  trigger = true,
  ownsHotkey = true,
}: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = (next: boolean) => {
    if (isControlled) { onOpenChange?.(next); }
    else { setInternalOpen(next); }
  };

  useEffect(() => {
    if (!ownsHotkey) { return; }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const next = !open;
        if (isControlled) { onOpenChange?.(next); }
        else { setInternalOpen(next); }
      }
      if (e.key === 'Escape') {
        if (isControlled) { onOpenChange?.(false); }
        else { setInternalOpen(false); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownsHotkey, open, isControlled, onOpenChange]);

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

      {open && (
        <div
          data-testid="command-palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[640px] max-w-[90vw] overflow-hidden rounded-3 border border-stroke-3 bg-surface-3 shadow-pop"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-stroke-1 px-3 py-2">
              <Search size={14} className="text-fg-3" />
              <input
                autoFocus
                placeholder="Search ATCs, modules, user stories…"
                className="h-7 w-full bg-transparent text-md text-fg-0 outline-none placeholder:text-fg-4"
              />
              <span className="kbd">Esc</span>
            </div>
            <div className="px-3 py-6 text-center text-sm text-fg-3">
              Command palette is a stub. Wire up cmdk + fuzzy search in Phase D.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
