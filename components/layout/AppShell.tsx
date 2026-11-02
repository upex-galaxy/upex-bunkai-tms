'use client';

import type { ReactNode } from 'react';
import { useChat } from '@components/chat/ChatProvider';
import { cn } from '@lib/utils';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// BK-1557 — the responsive frame around every (app) route. From `md` up it is
// the same three-column grid the layout always rendered (224px sidebar,
// content, optional chat dock). Below `md` the sidebar leaves the grid and
// becomes an off-canvas drawer, opened from a 40px menu bar at the top of the
// content column, so the content gets the full phone width (master design
// plan §5 D53).
//
// There is exactly ONE AppSidebar instance: it is passed in as `sidebar` and
// only repositioned. A second copy for mobile would double its window keydown
// listeners (⌘K) and its Realtime notifications subscription.
//
// The drawer slides by animating `left`, never `transform`: a transformed
// ancestor becomes the containing block of every `position: fixed`
// descendant, which would trap the workspace switcher's full-screen backdrop
// inside the 224px drawer.

interface AppShellProps {
  sidebar: ReactNode
  dock?: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, dock, children }: AppShellProps) {
  const pathname = usePathname();
  const chat = useChat();
  const [navOpen, setNavOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Following a link inside the drawer closes it (derived from the route,
  // adjusted during render rather than in an effect).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setNavOpen(false);
  }
  // Opening team chat from the drawer hands the screen to the chat overlay.
  if (chat.open && navOpen) {
    setNavOpen(false);
  }

  // Crossing into `md` (rotation, resize) turns the drawer back into the
  // static column, so the open state must reset: otherwise the content would
  // stay `inert` with no backdrop or menu button left to explain it.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) { setNavOpen(false); }
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!navOpen) { return; }
    // Move focus into the drawer once it is visible, so keyboard and screen
    // reader users land on the navigation they just opened.
    const frame = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) { return; }
      setNavOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  return (
    <div className="grid h-dvh min-h-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden bg-surface-0 md:grid-cols-[224px_minmax(0,1fr)_auto]">
      {navOpen && (
        <div
          aria-hidden
          data-testid="app-nav-backdrop"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div
        id="app-nav"
        ref={drawerRef}
        data-testid="app-nav"
        data-open={navOpen}
        // Any link followed from the drawer closes it, including one to the
        // current route (no pathname change) or a search-param-only link.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a[href]')) { setNavOpen(false); }
        }}
        className={cn(
          'fixed inset-y-0 z-40 w-[224px] transition-[left,visibility] duration-token ease-token motion-reduce:transition-none',
          'md:static md:visible md:z-auto md:w-auto md:shadow-none md:transition-none',
          navOpen ? 'visible left-0 shadow-pop' : 'invisible -left-[224px]',
        )}
      >
        {sidebar}
      </div>
      {/* `inert` while the drawer is open keeps Tab inside the navigation. */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" inert={navOpen || undefined}>
        <div
          data-testid="mobile-menu-bar"
          className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-stroke-1 bg-surface-1 px-2 md:hidden"
        >
          <button
            ref={menuButtonRef}
            type="button"
            data-testid="mobile-menu-button"
            aria-label="Open navigation"
            aria-controls="app-nav"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="inline-flex size-7 items-center justify-center rounded-2 text-fg-2 transition-colors duration-token ease-token hover:bg-surface-2 hover:text-fg-0"
          >
            <Menu size={16} />
          </button>
          <span className="inline-flex size-6 items-center justify-center rounded-1 bg-accent font-jp text-base font-bold leading-none tracking-tight text-white">
            分
          </span>
          <span className="text-base font-bold tracking-tight text-fg-0">Bunkai</span>
        </div>
        {children}
      </div>
      {dock}
    </div>
  );
}
