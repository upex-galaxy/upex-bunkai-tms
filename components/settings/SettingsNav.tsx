'use client';

import { isSettingsNavItemActive, SETTINGS_NAV_AVAILABLE, SETTINGS_NAV_COMING_SOON } from '@lib/settings/nav-items';
import { cn } from '@lib/utils';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Settings hub side nav (BK-87, TC-AC3). Per TD2, this nests INSIDE the
// existing app shell as a second 216px column — it does NOT re-render the
// mockup's separate 48px icon rail, which would strand the workspace
// switcher, search, and pinned projects while inside Settings (Rule #14).
//
// "Available" items are real links with `aria-current="page"`. "Coming soon"
// items are plain, non-focusable spans (no href, `aria-disabled`, a "soon"
// text tag) — structurally different from a live link, never color-only
// (standing color-not-sole-signal rule), and skipped by Tab by construction.
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      data-testid="settings-nav"
      className="flex w-[216px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-stroke-1 bg-surface-1 p-2"
    >
      <Link
        href="/projects"
        data-testid="settings-back-to-app"
        className="mb-1 flex h-7 items-center gap-2 rounded-2 px-2 text-[12.5px] text-fg-2 hover:bg-surface-3 hover:text-fg-0"
      >
        <ArrowLeft size={14} />
        Back to app
      </Link>

      <div className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-widest text-fg-3">
        Available
      </div>
      {SETTINGS_NAV_AVAILABLE.map((item) => {
        const active = isSettingsNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.id}
            href={item.href as string}
            aria-current={active ? 'page' : undefined}
            data-testid={`settings-nav-${item.id}`}
            className={cn(
              'flex h-7 items-center gap-2 rounded-2 px-2 text-[12.5px] font-medium text-fg-2 hover:bg-surface-3 hover:text-fg-0',
              active && 'bg-surface-3 text-fg-0',
            )}
          >
            {item.label}
          </Link>
        );
      })}

      <div className="px-2 pb-1 pt-4 text-2xs font-semibold uppercase tracking-widest text-fg-3">
        Coming soon
      </div>
      {SETTINGS_NAV_COMING_SOON.map(item => (
        <span
          key={item.id}
          aria-disabled="true"
          title="Coming soon"
          data-testid={`settings-nav-${item.id}`}
          className="flex h-7 cursor-not-allowed items-center gap-2 rounded-2 px-2 text-[12.5px] font-medium text-fg-4"
        >
          <span className="flex-1">{item.label}</span>
          <span className="rounded-1 border border-stroke-2 px-1.5 py-px font-mono text-2xs uppercase tracking-wide text-fg-4">
            soon
          </span>
        </span>
      ))}
    </nav>
  );
}
