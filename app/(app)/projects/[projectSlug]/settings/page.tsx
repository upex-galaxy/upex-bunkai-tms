import { TrackerSettingsForm } from '@components/tracker-settings/TrackerSettingsForm';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { readTrackerSettings } from '@lib/tracker-settings/access';
import { DEFAULT_ISSUE_TYPE } from '@lib/tracker-settings/rules';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

// Project > Settings (BK-371). The home of the Project's Jira defect sync: the
// destination key, the issue type and the on/off switch. Reachable for every role
// (an eighth project sub-nav entry); only owners and admins get usable controls.
// Spec-only departure ratified by the PO (Q6, master-design-plan §5 D42): live
// components only, no mockup. Reads are plain RLS-scoped selects, mirroring
// `milestones/page.tsx`'s workspace/project resolution; the routes under
// /api/v1/projects/{id}/tracker-settings are the authority for every write.
export default async function ProjectSettingsPage({ params }: PageProps) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieActive,
    (workspaceRows ?? []).map(w => w.id),
  );
  if (!activeWorkspaceId) { notFound(); }

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectErr || !project) { notFound(); }

  // The role only decides whether the controls are usable (a UX hint). The PUT and
  // the check re-read it live and refuse anyone who is not an owner or admin.
  const { data: { user } } = await supabase.auth.getUser();
  let canEdit = false;
  if (user) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    canEdit = membership != null && ['owner', 'admin'].includes(membership.role);
  }

  const stored = await readTrackerSettings(supabase, project.id);

  return (
    <div data-testid="project-settings-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[640px] flex-col gap-3">
          <div>
            <h1 className="m-0 text-md font-semibold text-fg-0">Settings</h1>
            <p className="m-0 text-xs text-fg-3">
              Integrations for
              {' '}
              {project.name}
              .
            </p>
          </div>
          <TrackerSettingsForm
            projectId={project.id}
            canEdit={canEdit}
            initial={{
              destinationKey: stored?.destination_project_key ?? '',
              issueTypeName: stored?.issue_type_name ?? DEFAULT_ISSUE_TYPE,
              enabled: stored?.enabled ?? false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
