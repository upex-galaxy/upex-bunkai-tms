import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { generateInviteToken, hashInviteToken } from '@lib/api/invite-tokens';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
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

export const POST = withApiHandler(async (request: NextRequest) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { email, role } = CreateBodySchema.parse(payload);

  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);

  // RLS gates the insert to workspace admins/owners; non-admins receive a
  // permission error from Postgrest that we map to 403.
  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      email: email.toLowerCase(),
      role,
      invited_by_user_id: user.id,
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
  const { error: secretError } = await createAdminClient()
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
});

export const GET = withApiHandler(async (request: NextRequest) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const { data, error } = await supabase
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
});

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
