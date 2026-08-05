import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { ArrowLeft } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateProjectForm } from '../create-project-form';

// BK-266 — the dedicated create-project route. It hosts the SAME
// `CreateProjectForm` the index used to render inline: same field rules, same
// live slug preview, same refusal messages (BR-5 — this story relocates the
// form, it does not re-open its rules).
//
// `new` is already in RESERVED_PROJECT_SLUGS (`lib/projects/validation.ts`,
// BK-8 AC-11), so no project can ever claim this address and be shadowed by
// this static segment.
export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/projects/new');
  }

  // Same resolution the index performs — trivial and independently derived per
  // page, matching every other route in this app.
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });

  if (!workspaces || workspaces.length === 0) {
    redirect('/onboarding');
  }

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId
    = resolveActiveWorkspaceId(cookieActive, workspaces.map(w => w.id))
      ?? workspaces[0].id;

  // Only whether the workspace already holds a project — the form uses it to
  // pick between the first-time welcome and the plain create-another heading.
  const { data: existing, error } = await supabase
    .from('projects')
    .select('slug')
    .eq('workspace_id', activeWorkspaceId)
    .limit(1);

  // A failed read must not be read as "no projects": that would greet a member
  // whose workspace is already full with the first-time "Your workspace is
  // ready" welcome. The create-another heading asserts nothing either way, so
  // it is the honest fallback when we could not find out.
  const hasProjects = error !== null || Boolean(existing && existing.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3 px-6 py-10">
        <Link
          href="/projects"
          data-testid="create-project-back"
          className="inline-flex items-center gap-1.5 self-start rounded-2 text-xs text-fg-3 transition-colors duration-token ease-token hover:text-fg-1"
        >
          <ArrowLeft size={12} />
          Back to projects
        </Link>
        <CreateProjectForm
          workspaceId={activeWorkspaceId}
          hasProjects={hasProjects}
        />
      </div>
    </div>
  );
}
