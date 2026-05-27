'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface Member {
  user_id: string
  role: string
  status: string
  joined_at: string
}

interface Invite {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
  accepted_at: string | null
  revoked_at: string | null
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

interface Props {
  workspaceId: string
  members: Member[]
  invites: Invite[]
}

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export function MembersClient({ workspaceId, members, invites }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'member' | 'admin'>('member');
  const [submitting, setSubmitting] = useState(false);

  const inviteTeammate = async () => {
    if (!email.trim() || submitting) { return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        toast.error(body.error?.message ?? 'Could not create invite.');
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { accept_url: string };
      await navigator.clipboard.writeText(body.accept_url).catch(() => undefined);
      toast.success(`Invite link for ${email.trim()} copied to clipboard.`);
      setEmail('');
      router.refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setSubmitting(false);
    }
  };

  const revoke = async (inviteId: string) => {
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
      toast.error(body.error?.message ?? 'Could not revoke invite.');
      return;
    }
    toast.success('Invite revoked.');
    router.refresh();
  };

  const resend = async (inviteId: string) => {
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
      toast.error(body.error?.message ?? 'Could not rotate invite.');
      return;
    }
    const body = (await res.json()) as { accept_url: string };
    await navigator.clipboard.writeText(body.accept_url).catch(() => undefined);
    toast.success('New invite link copied to clipboard.');
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <section className="rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-widest text-fg-3">
          Invite teammate
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[240px]">
            <span className="mb-1.5 block text-xs font-medium text-fg-2">Email</span>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="h-10 text-md"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-fg-2">Role</span>
            <select
              value={role}
              onChange={e => setRole(e.target.value as typeof role)}
              className="h-10 rounded-2 border border-stroke-2 bg-surface-0 px-3 text-md text-fg-0"
            >
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={!email.trim() || submitting}
            onClick={() => { void inviteTeammate(); }}
          >
            {submitting ? 'Sending…' : 'Generate invite link'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-fg-4">
          MVP does not send email — the link is copied to your clipboard for you to share.
        </p>
      </section>

      <section className="rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-widest text-fg-3">
          Active members (
          {members.length}
          )
        </h2>
        <ul className="m-0 divide-y divide-stroke-2 p-0">
          {members.map(m => (
            <li key={m.user_id} className="flex items-center justify-between py-2 text-sm">
              <code className="text-fg-2">{m.user_id}</code>
              <span className="text-fg-3">
                {m.role}
                {' '}
                ·
                {m.status}
              </span>
            </li>
          ))}
          {members.length === 0 && <li className="py-2 text-sm text-fg-4">No members yet.</li>}
        </ul>
      </section>

      <section className="rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-widest text-fg-3">
          Pending invites (
          {invites.filter(i => i.status === 'pending').length}
          )
        </h2>
        <ul className="m-0 divide-y divide-stroke-2 p-0">
          {invites.map(invite => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <div>
                <div className="text-fg-1">{invite.email}</div>
                <div className="text-xs text-fg-4">
                  {invite.role}
                  {' '}
                  ·
                  {invite.status}
                  {' '}
                  · expires
                  {new Date(invite.expires_at).toLocaleDateString()}
                </div>
              </div>
              {invite.status === 'pending' && (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { void resend(invite.id); }}>
                    Rotate link
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { void revoke(invite.id); }}>
                    Revoke
                  </Button>
                </div>
              )}
            </li>
          ))}
          {invites.length === 0 && <li className="py-2 text-sm text-fg-4">No invites yet.</li>}
        </ul>
      </section>
    </div>
  );
}
