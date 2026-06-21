import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { generateInviteToken, hashInviteToken } from '@lib/api/invite-tokens';
import { assertWorkspaceContext } from '@lib/api/principal';
import { createAdminClient } from '@lib/supabase/admin';
import { webUrl } from '@lib/urls';
import { z } from 'zod';

// POST /api/v1/workspaces/{id}/invites — admin/owner issues an invite for an
// (email, role) pair. The handler generates a raw token, stores its SHA-256,
// and returns the raw token + accept_url EXACTLY ONCE so the inviter can
// share the link. MVP does not send an email — we log + return the link.
//
// GET /api/v1/workspaces/{id}/invites — admin/owner lists pending invites
// (status derived: pending if not accepted, not revoked, and not expired).

const CreateBodySchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['viewer', 'member', 'admin']).default('member'),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);
  // A workspace-scoped PAT may only act on its own workspace (ADR-0006).
  assertWorkspaceContext(principal, workspaceId);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, role } = CreateBodySchema.parse(payload);
  const normalizedEmail = email.toLowerCase();

  // Authorize BEFORE the uniqueness probes below — they use the admin client,
  // so answering them first would leak membership facts to non-admins. The
  // self-row select is allowed by workspace_members_select_self_or_admin.
  const { data: callerMembership, error: callerError } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', principal.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (callerError) {
    throw new ApiError('internal_error', callerError.message);
  }
  if (!callerMembership || !['admin', 'owner'].includes(callerMembership.role)) {
    throw new ApiError('forbidden', 'You must be an admin or owner to invite teammates.');
  }

  const admin = createAdminClient();

  // BK-60 (FR-003): email must be unique among ACTIVE workspace members.
  // workspace_members has no email column, so resolve email -> user id via
  // the service-role-only SQL helper (auth.users is not exposed to PostgREST).
  const { data: invitedUserId, error: lookupError } = await admin
    .rpc('bunkai_user_id_by_email', { p_email: normalizedEmail });
  if (lookupError) {
    throw new ApiError('internal_error', lookupError.message);
  }
  if (invitedUserId) {
    const { data: existingMember, error: memberError } = await admin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', invitedUserId)
      .eq('status', 'active')
      .maybeSingle();
    if (memberError) {
      throw new ApiError('internal_error', memberError.message);
    }
    if (existingMember) {
      throw new ApiError('conflict', 'This email already belongs to an active workspace member.', {
        details: { reason: 'email_already_member' },
      });
    }
  }

  // BK-61: one live invite per (workspace, email). Pending = not accepted,
  // not revoked, not expired. Expired/revoked rows do NOT block a re-invite.
  const { data: pendingInvite, error: pendingError } = await admin
    .from('workspace_invites')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', normalizedEmail)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (pendingError) {
    throw new ApiError('internal_error', pendingError.message);
  }
  if (pendingInvite) {
    throw new ApiError('conflict', 'A pending invite already exists for this email.', {
      details: { reason: 'invite_already_pending' },
    });
  }

  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);

  // RLS gates the insert to workspace admins/owners; non-admins receive a
  // permission error from Postgrest that we map to 403.
  const { data, error } = await db
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      email: email.toLowerCase(),
      role,
      invited_by_user_id: principal.userId,
    })
    .select('id, email, role, expires_at, created_at')
    .single();

  if (error) {
    if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
      throw new ApiError('forbidden', 'You must be an admin or owner to invite teammates.');
    }
    throw new ApiError('internal_error', error.message);
  }

  // Token hash lives in a sibling table QA/analytics roles cannot read. The
  // RLS-gated insert above already proved the caller is a workspace admin, so
  // the service-role write here is authorization-safe.
  const { error: secretError } = await admin
    .from('workspace_invite_secrets')
    .insert({ invite_id: data.id, token_hash: tokenHash });

  if (secretError) {
    throw new ApiError('internal_error', secretError.message);
  }

  const acceptUrl = `${webUrl('/invites/accept')}?token=${encodeURIComponent(rawToken)}`;

  // Log the issuance so the inviter can find the link in server logs even if
  // the response is lost (MVP has no transactional email yet).

  console.log(`[invite] issued for ${email} on workspace ${workspaceId} → ${acceptUrl}`);

  return jsonResponse(
    {
      invite: {
        id: data.id,
        email: data.email,
        role: data.role,
        expires_at: data.expires_at,
        created_at: data.created_at,
      },
      token: rawToken,
      accept_url: acceptUrl,
      warning: 'Copy this URL now — the token cannot be retrieved later.',
    },
    { status: 201 },
  );
}, { auth: 'required', requires: ['workspace:admin'] });

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);

  const { data, error } = await db
    .from('workspace_invites')
    .select('id, email, role, expires_at, accepted_at, revoked_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  const invites = (data ?? []).map(row => ({
    ...row,
    status: derivedStatus(row),
  }));

  return jsonResponse({ invites });
}, { auth: 'required', requires: ['workspace:admin'] });

// Members list for the same workspace lives here for convenience because the
// /members page wants both invites and members in the same request burst.
export async function listMembers(workspaceId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workspace_members')
    .select('user_id, role, status, joined_at')
    .eq('workspace_id', workspaceId);
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  return data ?? [];
}

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
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
