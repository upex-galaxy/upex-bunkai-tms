import { RestoreClient } from './restore-client';

// Public landing for the workspace-restore flow (BK-512, ADR-0015 point 9 —
// "the email is what makes restore discoverable"). Standalone route outside
// the `(app)` shell, same posture as `app/invites/accept`: the workspace is
// invisible via RLS while deleted, so a route inside the app shell (which
// assumes an active, visible workspace) is the wrong host for this link.
export default async function RestoreWorkspacePage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-6 py-10">
      <RestoreClient workspaceId={id} />
    </div>
  );
}
