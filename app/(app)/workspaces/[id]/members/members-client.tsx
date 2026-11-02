'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { RemoveMemberModal } from '@components/workspaces/RemoveMemberModal';
import { canRemoveMember } from '@lib/workspaces/member-ladder';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Member {
  user_id: string
  role: string
  status: string
  joined_at: string
  // BK-572 — resolved server-side from bunkai_chat_roster; null when the
  // roster did not return it (never shown as a raw id on its own).
  email: string | null
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
  workspaceName: string
  currentUserId: string
  callerRole: string | null
  members: Member[]
  invites: Invite[]
}

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export function MembersClient({ workspaceId, workspaceName, currentUserId, callerRole, members, invites }: Props) {
  const router = useRouter();
  const [removeTarget, setRemoveTarget] = useState<{ userId: string, email: string, role: string } | null>(null);
  const membersHeadingRef = useRef<HTMLHeadingElement>(null);
  const [removals, setRemovals] = useState(0);

  // After a removal the row that opened the dialog is gone, so focus lands on
  // the list heading instead of the page body (AC-20). A parent effect runs
  // after the dialog's own return-to-trigger effect in the same commit, so
  // this one wins.
  useEffect(() => {
    if (removals > 0) {
      membersHeadingRef.current?.focus();
    }
  }, [removals]);
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
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-fg-2">Role</span>
            <Select
              value={role}
              onChange={e => setRole(e.target.value as typeof role)}
            >
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </Select>
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
        <h2
          ref={membersHeadingRef}
          tabIndex={-1}
          data-testid="members-heading"
          className="m-0 mb-3 text-sm font-semibold uppercase tracking-widest text-fg-3 outline-none"
        >
          Active members (
          {members.length}
          )
        </h2>
        <ul className="m-0 divide-y divide-stroke-2 p-0">
          {members.map((m) => {
            const isSelf = m.user_id === currentUserId;
            const label = m.email ?? 'Unknown member';
            const removable = m.email !== null && canRemoveMember({ callerId: currentUserId, callerRole, target: m });
            return (
              <li key={m.user_id} data-testid={`member-row-${m.user_id}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-fg-1">
                    {label}
                    {isSelf && <span className="text-fg-3"> (you)</span>}
                  </div>
                  <div className="text-xs text-fg-4">
                    {m.role}
                    {' '}
                    ·
                    {' '}
                    {m.status}
                  </div>
                </div>
                {removable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`member-remove-${m.user_id}`}
                    aria-label={`Remove ${label}`}
                    onClick={() => setRemoveTarget({ userId: m.user_id, email: label, role: m.role })}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
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

      <RemoveMemberModal
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        member={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          setRemovals(n => n + 1);
          router.refresh();
        }}
        onRefused={() => {
          // The refused row may vanish on refresh (404): keep focus on the list.
          setRemovals(n => n + 1);
          router.refresh();
        }}
      />
    </div>
  );
}
