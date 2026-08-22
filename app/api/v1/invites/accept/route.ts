import type { WorkspaceRole } from '@lib/workspaces/invites';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { hashInviteToken } from '@lib/api/invite-tokens';
import { createAdminClient } from '@lib/supabase/admin';
import { inviteAcceptAction } from '@lib/workspaces/invites';
import { z } from 'zod';

// POST /api/v1/invites/accept — invitee redeems a raw token. The caller must
// be signed in; the call adds a row to `workspace_members` for the caller in
// the invite's workspace + role, and stamps `accepted_at` on the invite.
//
// Email matching: the caller's auth email must equal the invite's email.
// Bypassing this would let a user redeem invites addressed to other people.

const BodySchema = z.object({
  token: z.string().min(8).max(256),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);
  const admin = createAdminClient();

  // Email-gated redemption: the caller's auth email must equal the invite's
  // email. Email lives in auth.users, so resolve it via the admin auth API
  // (works for cookie and PAT callers alike).
  const { data: caller, error: callerError } = await admin.auth.admin.getUserById(principal.userId);
  const callerEmail = caller?.user?.email ?? null;
  if (callerError || !callerEmail) {
    throw new ApiError('unauthorized', 'You must be signed in to accept an invite.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { token } = BodySchema.parse(payload);

  const tokenHash = await hashInviteToken(token);

  // The token hash lives in a sibling table QA/analytics roles cannot read.
  // Resolve the invite id from the hash, then load the invite metadata.
  const { data: secret, error: secretError } = await admin
    .from('workspace_invite_secrets')
    .select('invite_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (secretError) {
    throw new ApiError('internal_error', secretError.message);
  }
  if (!secret) {
    throw new ApiError('not_found', 'Invite token is invalid.');
  }

  const { data: invite, error: lookupError } = await admin
    .from('workspace_invites')
    .select('id, workspace_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('id', secret.invite_id)
    .maybeSingle();

  if (lookupError) {
    throw new ApiError('internal_error', lookupError.message);
  }
  if (!invite) {
    throw new ApiError('not_found', 'Invite token is invalid.');
  }
  if (invite.revoked_at) {
    throw new ApiError('conflict', 'Invite has been revoked.');
  }
  if (invite.accepted_at) {
    throw new ApiError('conflict', 'Invite has already been accepted.');
  }
  if (new Date(invite.expires_at) < new Date()) {
    throw new ApiError('conflict', 'Invite has expired.');
  }
  if (invite.email.toLowerCase() !== callerEmail.toLowerCase()) {
    throw new ApiError('forbidden', 'This invite was sent to a different email address.');
  }

  // BK-62: an accept must never demote. If the caller already holds an active
  // membership with an equal or higher role, reject instead of upserting —
  // the unconditional upsert here is what demoted a workspace owner to member.
  const { data: existingMember, error: existingError } = await admin
    .from('workspace_members')
    .select('role, status')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', principal.userId)
    .maybeSingle();

  if (existingError) {
    throw new ApiError('internal_error', existingError.message);
  }

  const action = inviteAcceptAction(existingMember, invite.role as WorkspaceRole);
  if (action === 'reject_already_member') {
    throw new ApiError('conflict', 'You are already a member of this workspace with an equal or higher role.', {
      details: { reason: 'already_member_equal_or_higher_role' },
    });
  }

  // Upsert membership: insert a new row, activate a non-active row (e.g.
  // status='invited'), or apply a legitimate promotion to a higher role.
  const { error: memberError } = await admin
    .from('workspace_members')
    .upsert(
      {
        workspace_id: invite.workspace_id,
        user_id: principal.userId,
        role: invite.role,
        status: 'active',
      },
      { onConflict: 'workspace_id,user_id' },
    );

  if (memberError) {
    throw new ApiError('internal_error', memberError.message);
  }

  const { error: stampError } = await admin
    .from('workspace_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: principal.userId,
    })
    .eq('id', invite.id);

  if (stampError) {
    throw new ApiError('internal_error', stampError.message);
  }

  return jsonResponse({
    ok: true,
    workspace_id: invite.workspace_id,
    role: invite.role,
  });
}, {
  auth: 'authenticated',
  why: 'Deferred debt carried from BK-262 shift-left: the caller is not yet a member of the workspace when accepting an invite, so no capability-in-that-workspace check can apply.',
});
