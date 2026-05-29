import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { hashInviteToken } from '@lib/api/invite-tokens';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
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

export const POST = withApiHandler(async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    throw new ApiError('unauthorized', 'You must be signed in to accept an invite.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { token } = BodySchema.parse(payload);

  const tokenHash = await hashInviteToken(token);
  const admin = createAdminClient();

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
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError('forbidden', 'This invite was sent to a different email address.');
  }

  // Upsert membership: if the user already has any row for this workspace
  // (e.g. status='invited'), promote it to active; otherwise insert.
  const { error: memberError } = await admin
    .from('workspace_members')
    .upsert(
      {
        workspace_id: invite.workspace_id,
        user_id: user.id,
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
      accepted_by_user_id: user.id,
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
});
