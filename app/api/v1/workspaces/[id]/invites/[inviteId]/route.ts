import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { generateInviteToken, hashInviteToken } from '@lib/api/invite-tokens';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { webUrl } from '@lib/urls';

// POST   /api/v1/workspaces/{id}/invites/{inviteId} — rotate the token
//                                                     (resend = same email,
//                                                     fresh secret + expiry).
// DELETE /api/v1/workspaces/{id}/invites/{inviteId} — revoke (sets revoked_at).
//
// Both routes are admin/owner-gated via RLS on `workspace_invites`. The
// service-role client is NOT used here so the policy is the source of truth
// for permission.

export const POST = withApiHandler(async (request: NextRequest) => {
  const { workspaceId, inviteId } = extractIds(request);
  if (!isUuid(workspaceId) || !isUuid(inviteId)) {
    throw new ApiError('bad_request', 'workspace id and invite id must be UUIDs.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const newToken = generateInviteToken();
  const newHash = await hashInviteToken(newToken);
  const newExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('workspace_invites')
    .update({
      expires_at: newExpiresAt,
      revoked_at: null,
      accepted_at: null,
      accepted_by_user_id: null,
    })
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .select('id, email, role, expires_at, created_at')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Invite not found or you lack permission.');
  }

  // The RLS-gated update above proved the caller is a workspace admin. Rotate
  // the secret in the sibling table (service-role; QA/analytics cannot read it).
  const { error: secretError } = await createAdminClient()
    .from('workspace_invite_secrets')
    .upsert({ invite_id: inviteId, token_hash: newHash }, { onConflict: 'invite_id' });

  if (secretError) {
    throw new ApiError('internal_error', secretError.message);
  }

  const acceptUrl = `${webUrl('/invites/accept')}?token=${encodeURIComponent(newToken)}`;

  return jsonResponse({
    invite: data,
    token: newToken,
    accept_url: acceptUrl,
    warning: 'Copy this URL now — the token cannot be retrieved later.',
  });
});

export const DELETE = withApiHandler(async (request: NextRequest) => {
  const { workspaceId, inviteId } = extractIds(request);
  if (!isUuid(workspaceId) || !isUuid(inviteId)) {
    throw new ApiError('bad_request', 'workspace id and invite id must be UUIDs.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const { data, error } = await supabase
    .from('workspace_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Invite not found or you lack permission.');
  }

  return jsonResponse({ ok: true });
});

function extractIds(request: NextRequest): { workspaceId: string, inviteId: string } {
  const segments = new URL(request.url).pathname.split('/');
  const wsIdx = segments.lastIndexOf('workspaces');
  const invIdx = segments.lastIndexOf('invites');
  return {
    workspaceId: wsIdx >= 0 ? (segments[wsIdx + 1] ?? '') : '',
    inviteId: invIdx >= 0 ? (segments[invIdx + 1] ?? '') : '',
  };
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
