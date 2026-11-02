// BK-1557 — the global sidebar's three project-scoped entries (Test Runs,
// Bug Reports, Metrics). There is no workspace-wide aggregate route for any
// of them; each surface exists per project (`/projects/{slug}/runs`, `/bugs`,
// `/metrics`). The sidebar used to render them as `soon` (D18), which read as
// "not built" while the project sub-nav opened the real screens. They now link
// into a project (master-design-plan §5 D52): the project the user is in, else
// the workspace's first project, else nothing (the entry stays disabled).

export const PROJECT_SECTIONS = ['runs', 'bugs', 'metrics'] as const;

export type ProjectSection = typeof PROJECT_SECTIONS[number];

interface NavProject {
  slug: string
}

const PROJECT_SLUG_PATTERN = /^\/projects\/([^/]+)/;
const PROJECT_SECTION_PATTERN = /^\/projects\/[^/]+\/(runs|bugs|metrics)(?:\/|$)/;

// The project the sidebar's project-scoped entries point at. A slug in the URL
// wins only when it names a project of the active workspace (`/projects/new`
// and a stale slug fall through to the first project).
export function resolveNavProjectSlug(pathname: string, projects: NavProject[]): string | null {
  const match = PROJECT_SLUG_PATTERN.exec(pathname);
  if (match) {
    const current = projects.find(p => p.slug === match[1]);
    if (current) { return current.slug; }
  }
  return projects[0]?.slug ?? null;
}

export function projectSectionHref(projectSlug: string | null, section: ProjectSection): string | null {
  return projectSlug === null ? null : `/projects/${projectSlug}/${section}`;
}

// Which of the three sections the pathname is on, nested routes included
// (`/runs/{runId}` stays on Test Runs). A Test's own run history lives at
// `/tests/{testId}/runs`, which this pattern does not match.
export function activeProjectSection(pathname: string): ProjectSection | null {
  const match = PROJECT_SECTION_PATTERN.exec(pathname);
  return match ? match[1] as ProjectSection : null;
}

// "Projects" covers every `/projects` route EXCEPT the three sections that now
// have their own sidebar entry, so the two never highlight together.
export function isProjectsNavActive(pathname: string): boolean {
  const inProjects = pathname === '/projects' || pathname.startsWith('/projects/');
  return inProjects && activeProjectSection(pathname) === null;
}
