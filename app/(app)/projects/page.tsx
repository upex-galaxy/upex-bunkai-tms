import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateProjectForm } from './create-project-form';

// Index landing for authenticated users. Routes them to the right place:
//   * No active membership → /onboarding (create first workspace)
//   * Otherwise            → render the Create-Project form alongside the
//     active workspace's existing projects (each links to its detail page).
//
// The Create-Project form lives here; the multi-workspace picker lives in the
// Topbar `WorkspaceSwitcher` on the project pages.
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
  const visibleIds = new Set(workspaces.map(w => w.id));
  const activeWorkspaceId
    = cookieActive && visibleIds.has(cookieActive)
      ? cookieActive
      : workspaces[0].id;

  // RLS-gated read of the active workspace's projects for the list.
  const { data: projects } = await supabase
    .from('projects')
    .select('slug, name, created_at')
    .eq('workspace_id', activeWorkspaceId)
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen items-center justify-center gap-6 bg-surface-0 px-6">
      <CreateProjectForm workspaceId={activeWorkspaceId} />

      {projects && projects.length > 0 && (
        <div
          data-testid="projects-list"
          className="w-full max-w-[320px] rounded-3 border border-stroke-2 bg-surface-1 p-6"
        >
          <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-4">
            Projects
          </div>
          <ul className="m-0 grid gap-1 p-0">
            {projects.map(project => (
              <li key={project.slug}>
                <Link
                  href={`/projects/${project.slug}`}
                  data-testid={`projects-list-item-${project.slug}`}
                  className="flex items-baseline justify-between rounded-2 px-2 py-1.5 text-sm text-fg-1 hover:bg-surface-2"
                >
                  <span className="truncate font-medium text-fg-0">{project.name}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-fg-4">{project.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
