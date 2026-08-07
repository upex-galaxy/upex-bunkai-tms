'use client';

import type { ComponentType } from 'react';
import { cn } from '@lib/utils';
import { BarChart3, Bug, Flag, GitBranch, Library, Play } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Project sub-nav (BK-265). The three project surfaces shipped by BK-38
// (Test Runs), BK-41/BK-42 (Bug Reports) and BK-46 (Metrics) had no `href`
// anywhere in the app — they were reachable only by typing the URL. This is
// the entry point for them. BK-205 adds a fifth entry, Milestones — same
// reasoning: `/projects/{slug}/milestones` is a real, built, project-scoped
// route with no `href` anywhere until this story (AI Product Owner decision,
// BK-205 — Critical Rule #14 makes the live UI the source of truth for
// navigation, and this sub-nav is the exact home D18 ratified for this
// decision shape). BK-45 adds a sixth, Traceability — the PO's own routing
// decision (comment 12171, "A4 + V1") names this exact sub-nav as one of the
// story's two required entry points ("the Traceability nav item... lands on
// the screen with a story selector"); the other is deep links FROM the
// Metrics dashboard, which is a separate follow-up wiring those specific
// links, not this file's concern. Without a `?story=` param the destination
// renders its own "select a user story" prompt (`TraceabilityChainView`) —
// this entry does not attempt to pre-select one.
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
  { id: 'traceability', label: 'Traceability', icon: GitBranch, segment: 'traceability' },
  { id: 'milestones', label: 'Milestones', icon: Flag, segment: 'milestones' },
];

function entryHref(projectSlug: string, segment: string | null): string {
  return segment === null ? `/projects/${projectSlug}` : `/projects/${projectSlug}/${segment}`;
}

// Active-entry rule, mirroring `isSettingsNavItemActive` (lib/settings/nav-items.ts):
// the exact route or any nested sub-route. The one exception is "All ATCs",
// whose href IS the project root — a prefix rule there would mark it current on
// every route in the project, so it matches exactly and nothing else.
//
// The three segment entries take the nested form so a section's own detail
// route keeps its entry current: `/runs/{runId}` (a run report, BK-38) stays on
// "Test Runs". It cannot over-match a Test's own run history — that route is
// `/tests/{testId}/runs`, which does not sit under `/runs/`.
function isEntryActive(pathname: string, href: string, segment: string | null): boolean {
  if (segment === null) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveProjectSectionLabel(pathname: string, projectSlug: string): string | null {
  const entry = ENTRIES.find(e => isEntryActive(pathname, entryHref(projectSlug, e.segment), e.segment));
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
        const active = isEntryActive(pathname, href, entry.segment);
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
