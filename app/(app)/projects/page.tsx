import { buttonVariants } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { cn } from '@lib/utils';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { FolderPlus, Plus } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

// BK-266 — the Projects index. This route used to render the create-project
// form centred on the screen with the existing projects demoted to a side card,
// which meant the de-facto landing screen asked for something new before
// showing what was already there. It is now a plain index of the ACTIVE
// workspace's projects; creating one is a deliberate act with its own address
// (`/projects/new`, which hosts the same form unchanged).
//
// No mockup exists for this screen — `project.jsx` specs the project DETAIL.
// Built against the frozen §2 tokens plus the closest live list pattern in this
// codebase (`/activity`, §4.16): header block + card-wrapped rows.
// Registered as §5 D19 in `.context/design/master-design-plan.md`.
export default async function ProjectsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/projects');
  }

  // RLS narrows this select to the workspaces the caller belongs to. We mirror
  // /api/v1/me's resolution: honour the bk_active_ws cookie when it points at a
  // visible workspace, otherwise fall back to the oldest membership.
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });

  if (!workspaces || workspaces.length === 0) {
    redirect('/onboarding');
  }

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  // The list is non-empty here (empty redirects above), so the helper's null
  // case is unreachable; the `??` keeps the type narrowed to string.
  const activeWorkspaceId
    = resolveActiveWorkspaceId(cookieActive, workspaces.map(w => w.id))
      ?? workspaces[0].id;

  // RLS-gated read of the active workspace's projects. Oldest first (BR-2) so
  // the index never contradicts the sidebar's own project list, which is read
  // the same way in `app/(app)/layout.tsx`. Switching workspace moves the
  // cookie, which re-resolves `activeWorkspaceId` and re-scopes this read.
  const { data } = await supabase
    .from('projects')
    .select('slug, name, description, created_at')
    .eq('workspace_id', activeWorkspaceId)
    .order('created_at', { ascending: true });
  const projects = data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-stroke-2 px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg-0">Projects</h1>
          <p className="text-sm text-fg-2">
            {projects.length > 0
              ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} in this workspace, oldest first.`
              : 'Projects in this workspace.'}
          </p>
        </div>
        {/* The empty state carries the only create affordance when there is
            nothing to list (AC4 — "a single clear way"), so this one is hidden
            in that case rather than competing with it. */}
        {projects.length > 0 && (
          <Link
            href="/projects/new"
            data-testid="projects-new-link"
            className={buttonVariants({ variant: 'primary', size: 'sm' })}
          >
            <Plus size={13} />
            New project
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          <Card className="overflow-hidden">
            {projects.length === 0
              ? (
                  <div
                    data-testid="projects-empty"
                    className="flex flex-col items-center gap-2 px-4 py-10 text-center"
                  >
                    <FolderPlus size={18} className="text-fg-3" />
                    <span className="text-md font-semibold text-fg-1">No projects yet</span>
                    <span className="max-w-[46ch] text-sm text-fg-3">
                      A project groups the modules, user stories, and ATCs your team authors.
                      Create the first one to start covering this workspace.
                    </span>
                    <Link
                      href="/projects/new"
                      data-testid="projects-empty-create"
                      className={cn(buttonVariants({ variant: 'primary' }), 'mt-2')}
                    >
                      <Plus size={14} />
                      Create your first project
                    </Link>
                  </div>
                )
              : (
                  <ul data-testid="projects-list" className="m-0 grid grid-cols-1 p-0">
                    {projects.map(project => (
                      <li key={project.slug} className="border-b border-stroke-2 last:border-b-0">
                        <Link
                          href={`/projects/${project.slug}`}
                          data-testid={`projects-list-item-${project.slug}`}
                          className="flex flex-col gap-1 px-4 py-3 transition-colors duration-token ease-token hover:bg-surface-3 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-md font-semibold text-fg-0">
                              {project.name}
                            </span>
                            <span className="shrink-0 font-mono text-2xs text-fg-4">
                              {formatCreatedAt(project.created_at)}
                            </span>
                          </span>
                          <span className="truncate font-mono text-xs text-fg-3">
                            /
                            {project.slug}
                          </span>
                          {/* BR-7 — a description is optional: absent means no
                              placeholder and no empty line, not a blank row. */}
                          {project.description !== null && project.description.trim().length > 0 && (
                            <span className="line-clamp-2 text-sm text-fg-2">
                              {project.description}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Deterministic UTC date, matching the run-history/activity convention: a
// locale-formatted date would render differently on the server and the client.
function formatCreatedAt(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toISOString().slice(0, 10);
}
