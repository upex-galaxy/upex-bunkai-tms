import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';

// Index landing for authenticated users. Routes them to the right place:
//   * No active membership          → /onboarding (create first workspace)
//   * Membership but no project     → render an empty-state placeholder
//   * Has projects                  → redirect to the first one
//
// Phase E will replace the empty-state placeholder + multi-workspace switcher
// with a real picker UI.
export default async function ProjectsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/projects');
  }

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (!memberships || memberships.length === 0) {
    redirect('/onboarding');
  }

  const workspaceIds = memberships.map(m => m.workspace_id);

  const { data: projects } = await supabase
    .from('projects')
    .select('slug, created_at')
    .in('workspace_id', workspaceIds)
    .order('created_at', { ascending: true })
    .limit(1);

  if (projects && projects.length > 0) {
    redirect(`/projects/${projects[0].slug}`);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-0 px-6">
      <div className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-6 text-center">
        <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          No projects yet
        </div>
        <h1 className="m-0 text-xl font-bold tracking-tight text-fg-0">
          Your workspace is ready
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-3">
          Create your first project to start authoring modules, user stories,
          and ATCs. Project creation UI ships in Phase E.
        </p>
      </div>
    </div>
  );
}
