import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { acceptWorkspaceInvite } from '@lib/supabase/rpc';

// BK-1589 — the refusals of `POST /api/v1/invites/accept`, split out of
// `route.ts` so every branch is unit-testable (the `members/[userId]/response.ts`
// pattern). The route refuses early on what it can see; the RPC
// (`bunkai_accept_workspace_invite`, migration 0118) repeats the checks under a
// row lock and this module maps its answers to the same bodies.

export const INVITE_NOT_FOUND_MESSAGE = 'Invite token is invalid.';
export const INVITE_REVOKED_MESSAGE = 'Invite has been revoked.';
export const INVITE_ACCEPTED_MESSAGE = 'Invite has already been accepted.';
export const INVITE_EXPIRED_MESSAGE = 'Invite has expired.';
export const ALREADY_MEMBER_MESSAGE = 'You are already a member of this workspace with an equal or higher role.';
export const INVITER_NOT_AUTHORIZED_MESSAGE = 'This invite can no longer be used. Ask a workspace Admin for a new one.';

// The single refusal a token that never existed gets. Every path that must
// not disclose existence builds its error HERE, so status + body stay
// byte-identical by construction (BK-988 / BK-512 AC-14).
export function invalidInviteToken(): ApiError {
  return new ApiError('not_found', INVITE_NOT_FOUND_MESSAGE);
}

export function alreadyMember(): ApiError {
  return new ApiError('conflict', ALREADY_MEMBER_MESSAGE, {
    details: { reason: 'already_member_equal_or_higher_role' },
  });
}

const NOT_PENDING_MESSAGES: Record<string, string> = {
  invite_revoked: INVITE_REVOKED_MESSAGE,
  invite_already_accepted: INVITE_ACCEPTED_MESSAGE,
  invite_expired: INVITE_EXPIRED_MESSAGE,
};

// Maps a `bunkai_accept_workspace_invite` error to the house envelope.
export function mapAcceptInviteError(error: { code?: string, message: string }): never {
  if (error.code === 'P0002') {
    throw invalidInviteToken();
  }
  if (error.code === '45222') {
    throw new ApiError('conflict', INVITER_NOT_AUTHORIZED_MESSAGE, {
      details: { reason: 'inviter_not_authorized' },
    });
  }
  if (error.code === '45223') {
    throw alreadyMember();
  }
  const notPending = error.code === '45224' ? NOT_PENDING_MESSAGES[error.message] : undefined;
  if (notPending) {
    throw new ApiError('conflict', notPending);
  }
  throw new ApiError('internal_error', error.message);
}

export interface RedeemedInvite {
  workspace_id: string
  role: string
}

// Runs the one transaction that redeems the invite. `admin` must be the service
// client: nothing else may execute the RPC.
export async function redeemInvite(
  admin: SupabaseClient<Database>,
  params: { inviteId: string, userId: string },
): Promise<RedeemedInvite> {
  const { data, error } = await acceptWorkspaceInvite(admin, params);
  if (error) {
    mapAcceptInviteError(error);
  }
  return data as unknown as RedeemedInvite;
}
