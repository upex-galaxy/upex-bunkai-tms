import { chatRoster } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';
import { MembersClient } from './members-client';

// Server boundary: confirms session, fetches initial member + invite lists.
// Mutations (invite/resend/revoke, BK-572 remove) round-trip through /api/v1 from the client
// component, which then refreshes the route to pick up the new server data.
export default async function MembersPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/workspaces/${workspaceId}/members`);
  }

  const [{ data: workspace }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from('workspaces').select('id, slug, name').eq('id', workspaceId).maybeSingle(),
    supabase
      .from('workspace_members')
      .select('user_id, role, status, joined_at')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true }),
    supabase
      .from('workspace_invites')
      .select('id, email, role, expires_at, accepted_at, revoked_at, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
  ]);

  if (!workspace) {
    redirect('/projects');
  }

  // BK-572 — the rows that render stay the RLS read above (a Member sees only
  // their own row). Emails come from the membership-asserting
  // `bunkai_chat_roster` (0104), used only as a user_id -> email map through
  // the caller's own client: no new function, no service-role read.
  const { data: roster } = await chatRoster(supabase, { workspaceId });
  const emailById = new Map((roster ?? []).map(r => [r.user_id, r.email]));
  const memberRows = (members ?? []).map(m => ({ ...m, email: emailById.get(m.user_id) ?? null }));
  const callerRole = (members ?? []).find(m => m.user_id === user.id && m.status === 'active')?.role ?? null;

  const enrichedInvites = (invites ?? []).map(row => ({
    ...row,
    status: derivedStatus(row),
  }));

  return (
    <div className="mx-auto max-w-[960px] px-6 py-10">
      <header className="mb-6">
        <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Workspace ·
          {' '}
          {workspace.slug}
        </div>
        <h1 className="m-0 text-2xl font-bold tracking-tight text-fg-0">
          Members & invites
        </h1>
      </header>
      <MembersClient
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        currentUserId={user.id}
        callerRole={callerRole}
        members={memberRows}
        invites={enrichedInvites}
      />
    </div>
  );
}

interface InviteRow {
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string
}

function derivedStatus(row: InviteRow): 'pending' | 'accepted' | 'revoked' | 'expired' {
  if (row.accepted_at) { return 'accepted'; }
  if (row.revoked_at) { return 'revoked'; }
  if (new Date(row.expires_at) < new Date()) { return 'expired'; }
  return 'pending';
}
