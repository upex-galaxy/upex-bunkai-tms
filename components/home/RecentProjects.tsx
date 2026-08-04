import type { RecentProject } from '@lib/home/recent-projects';
import { Card } from '@components/ui/card';
import { AlertTriangle, ChevronRight, FolderPlus } from 'lucide-react';
import Link from 'next/link';

// BK-257 — Home's "Recent projects" list (master-design-plan §4.2, `home.jsx`'s
// left-hand card). The workspace's projects ordered by activity, so a member
// lands on Home and gets straight back into what they were working on.
//
// Departures from the mockup, all deliberate:
//   * NO coverage bar. `home.jsx` puts a per-project coverage `.bar` in each
//     row; the story's Out Of Scope field hands the Coverage surface to BK-259,
//     which owns that domain on this screen. Building it twice would give Home
//     two coverage numbers with two different definitions.
//   * NO status dot. The mockup's left-edge `dot[data-status]` implies a
//     per-project health state that does not exist in the schema — there is no
//     column, no derivation, and no story for one. A dot wired to a constant is
//     a lie with a colour.
//   * Absolute UTC time, not "2h ago". The live app renders timestamps as
//     `YYYY-MM-DD HH:MM` everywhere (`/activity`, run history) precisely because
//     locale/relative formatting drifts between server and browser. Live-UI-first
//     (Critical Rule #14): match the app, not the mockup's copy.
//   * The mockup's `PRJ-xxx` code column becomes the project slug, which is what
//     this product actually identifies a project by (and what `/projects` shows).
//   * The counts share the slug's meta line instead of holding their own column.
//     The mockup's 6-column grid loses two cells here (no status dot, no coverage
//     bar), and a dedicated counts column in what remains only fits on a wide
//     viewport — which is how they ended up hidden below `sm` and out of AC1 on a
//     phone. On the meta line they are present at every width and truncate with
//     the rest of the line instead of disappearing.
//
// Kept from the mockup: the card + section header shape, "Sorted by activity"
// hint, the "View all" escape hatch to `/projects`, one row per project with
// name, counts, last activity, and a chevron affordance.

interface RecentProjectsCardProps {
  projects: RecentProject[]
}

export function RecentProjectsCard({ projects }: RecentProjectsCardProps) {
  return (
    <RecentProjectsShell>
      {projects.length === 0
        ? (
            <div
              data-testid="home-recent-projects-empty"
              className="flex flex-col items-center gap-2 px-4 py-8 text-center"
            >
              <FolderPlus size={18} className="text-fg-3" />
              <span className="text-md font-semibold text-fg-1">No projects yet</span>
              <span className="max-w-[46ch] text-sm text-fg-3">
                A project groups the modules, user stories, and ATCs your team authors.
                Create the first one and it will show up here.
              </span>
              <Link
                href="/projects/new"
                data-testid="home-recent-projects-create"
                className="mt-1 text-sm font-semibold text-accent hover:underline"
              >
                Create your first project
              </Link>
            </div>
          )
        : (
            <ul data-testid="home-recent-projects-list" className="m-0 grid grid-cols-1 p-0">
              {projects.map(project => (
                <li key={project.id} className="border-t border-stroke-2 first:border-t-0">
                  <Link
                    href={`/projects/${project.slug}`}
                    data-testid={`home-recent-projects-item-${project.slug}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-token ease-token hover:bg-surface-3 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="min-w-0 truncate text-sm font-semibold text-fg-0">
                        {project.name}
                      </span>
                      <span className="min-w-0 truncate text-2xs text-fg-3">
                        <span className="font-mono text-fg-4">
                          /
                          {project.slug}
                        </span>
                        {' · '}
                        <span className="font-mono text-fg-2">{project.moduleCount}</span>
                        {' '}
                        {project.moduleCount === 1 ? 'module' : 'modules'}
                        {' · '}
                        <span className="font-mono text-fg-2">{project.atcCount}</span>
                        {' ATC'}
                      </span>
                    </span>
                    <span
                      className="shrink-0 font-mono text-2xs text-fg-4"
                      title="Last activity (UTC)"
                    >
                      {formatLastActivity(project.lastActivityAt)}
                    </span>
                    <ChevronRight size={12} className="shrink-0 text-fg-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
    </RecentProjectsShell>
  );
}

// A read that failed gets its own state, never the empty one. "No projects yet"
// pointed at a member whose workspace is full would send them to /projects/new
// to recreate something that already exists — the same line the projects index
// (BK-266) and the Home banner (BK-255) draw.
export function RecentProjectsError() {
  return (
    <RecentProjectsShell>
      <div
        data-testid="home-recent-projects-error"
        className="flex flex-col items-center gap-2 px-4 py-8 text-center"
      >
        <AlertTriangle size={16} className="text-signal-fail" />
        <span className="text-md font-semibold text-fg-1">Could not load recent projects</span>
        <span className="max-w-[46ch] text-sm text-fg-3">
          This workspace&apos;s projects could not be read just now. Reload the page to
          try again — nothing has been changed.
        </span>
      </div>
    </RecentProjectsShell>
  );
}

// Suspense fallback. Same `animate-status-pulse` treatment the welcome summary
// and the activity skeletons use, sized to the row height so the widgets below
// do not jump when the real rows arrive.
export function RecentProjectsSkeleton() {
  return (
    <RecentProjectsShell>
      <div
        data-testid="home-recent-projects-skeleton"
        className="flex flex-col gap-3 px-4 py-4"
        aria-hidden="true"
      >
        {[0, 1, 2].map(row => (
          <div key={row} className="h-8 w-full animate-status-pulse rounded-1 bg-surface-3" />
        ))}
      </div>
    </RecentProjectsShell>
  );
}

// The card and its header, shared by every state so the section title, the
// "Sorted by activity" hint and the "View all" link stay put whichever body
// renders underneath.
function RecentProjectsShell({ children }: { children: React.ReactNode }) {
  return (
    <section data-testid="home-recent-projects" aria-labelledby="home-recent-projects-title">
      <Card className="overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-3">
          <h2
            id="home-recent-projects-title"
            className="text-sm font-semibold tracking-tight text-fg-0"
          >
            Recent projects
          </h2>
          <span className="flex items-center gap-3">
            <span className="hidden text-2xs text-fg-4 sm:inline">Sorted by activity</span>
            <Link
              href="/projects"
              data-testid="home-recent-projects-view-all"
              className="flex items-center gap-0.5 text-xs font-semibold text-fg-2 transition-colors duration-token ease-token hover:text-fg-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View all
              <ChevronRight size={11} />
            </Link>
          </span>
        </header>
        {children}
      </Card>
    </section>
  );
}

// Timezone-stable UTC, matching `/activity`'s `formatActivityTime` and run
// history's `formatRanAt`: '2026-08-04T09:41:00+00:00' -> '2026-08-04 09:41'.
function formatLastActivity(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
