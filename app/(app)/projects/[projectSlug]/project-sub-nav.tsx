'use client';

import type { ComponentType } from 'react';
import { cn } from '@lib/utils';
import { BarChart3, Bug, Library, Play } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Project sub-nav (BK-265). The three project surfaces shipped by BK-38
// (Test Runs), BK-41/BK-42 (Bug Reports) and BK-46 (Metrics) had no `href`
// anywhere in the app — they were reachable only by typing the URL. This is
// the entry point for them.
//
// It lives in the persistent project shell (project-shell.tsx), NOT in each
// page, so it survives navigation across the project's detail routes — the
// same BK-147 / ADR-0003 layout contract the explorer relies on.
//
// The four global sidebar items (ATC Library, Test Runs, Bug Reports, Metrics)
// deliberately stay `soon`: those are workspace-wide aggregates that do not
// exist. These entries are project-scoped, and every one of them points at a
// route that is actually built — no entry is invented for a route that only
// has `[id]` / `new` segments (ATCs and Tests are browsed from the workbench).

interface SubNavEntry {
  id: string
  label: string
  icon: ComponentType<{ size?: number, className?: string }>
  // Path segment appended to `/projects/{slug}`; `null` = the project index.
  segment: string | null
}

const ENTRIES: SubNavEntry[] = [
  { id: 'atcs', label: 'All ATCs', icon: Library, segment: null },
  { id: 'runs', label: 'Test Runs', icon: Play, segment: 'runs' },
  { id: 'bugs', label: 'Bug Reports', icon: Bug, segment: 'bugs' },
  { id: 'metrics', label: 'Metrics', icon: BarChart3, segment: 'metrics' },
];

function entryHref(projectSlug: string, segment: string | null): string {
  return segment === null ? `/projects/${projectSlug}` : `/projects/${projectSlug}/${segment}`;
}

// The active entry is resolved by EXACT path match, never by prefix. Two
// reasons: `aria-current="page"` means "this link IS the current page", and a
// prefix rule would light up "Test Runs" on `/tests/{testId}/runs` (a Test's
// own run history, BK-37), which belongs to the workbench, not to the
// project-wide run report. On a detail route no entry is current — the
// workbench tab bar is what indicates the open item there.
export function resolveProjectSectionLabel(pathname: string, projectSlug: string): string | null {
  const entry = ENTRIES.find(e => pathname === entryHref(projectSlug, e.segment));
  return entry?.label ?? null;
}

export function ProjectSubNav({ projectSlug }: { projectSlug: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Project sections"
      data-testid="project-subnav"
      className="flex h-8 flex-shrink-0 items-center gap-0.5 border-b border-stroke-1 bg-surface-1 px-3"
    >
      {ENTRIES.map((entry) => {
        const href = entryHref(projectSlug, entry.segment);
        const active = pathname === href;
        const Icon = entry.icon;
        return (
          <Link
            key={entry.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-testid={`project-subnav-${entry.id}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-1 px-2.5 py-1 text-xs font-medium transition-colors duration-token ease-token',
              active ? 'bg-surface-3 text-fg-0' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-1',
            )}
          >
            <Icon size={12} className={active ? 'text-accent' : undefined} />
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
