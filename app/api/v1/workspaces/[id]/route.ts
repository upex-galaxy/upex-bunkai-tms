import type { NextRequest } from 'next/server';
import type { WorkspaceDeletionResult } from './deletion-response';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertWorkspaceContext } from '@lib/api/principal';
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_COOKIE_DEFAULTS } from '@lib/api/workspace-cookie';
import { env } from '@lib/env';
import { createAdminClient } from '@lib/supabase/admin';
import { requestWorkspaceDeletion } from '@lib/supabase/rpc';
import { sendWorkspaceDeletionEmails } from '@lib/workspace-deletion/email';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { mapDeleteWorkspaceError } from './deletion-response';
import { resolveNewActiveWorkspace } from './membership/response';

const ParamsSchema = z.object({ id: z.string().uuid() });

const PatchBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>
}

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { db } = getAuth(ctx);
  const id = extractId(request);
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { data, error } = await db
    .from('workspaces')
    .select('id, slug, name, owner_user_id, plan, created_at')
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Workspace not found.');
  }

  return jsonResponse({ workspace: data });
}, { auth: 'required', requires: ['atc:read'] });

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const id = extractId(request);
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  // A workspace-scoped PAT may only modify its own workspace (ADR-0006).
  assertWorkspaceContext(principal, parsed.data.id);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const patch = PatchBodySchema.parse(payload);

  if (!patch.name) {
    throw new ApiError('bad_request', 'Provide at least one field to update.');
  }

  // RLS gates the update to workspace owners; non-owners get zero rows back.
  const { data, error } = await db
    .from('workspaces')
    .update({ name: patch.name })
    .eq('id', parsed.data.id)
    .select('id, slug, name, owner_user_id, plan, created_at')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('forbidden', 'You do not have permission to update this workspace.');
  }

  return jsonResponse({ workspace: data });
}, { auth: 'required', requires: ['workspace:admin'] });

// DELETE /api/v1/workspaces/{id} — Delete a workspace I own (BK-512, ADR-
// 0015). Owner-only, cookie-session-only (mirrors BK-508's data-export
// posture — deletion deserves at least the same). The atomic guard logic
// (owner check, PAT/invite revocation, audit tombstone) lives in the
// SECURITY DEFINER RPC `bunkai_request_workspace_deletion` (migration 0084);
// this route is a thin wrapper that also re-resolves the caller's active
// workspace (AC-09/AC-10/AC-11, same `resolveNewActiveWorkspace` the Leave
// flow uses) and fires the confirm-time deletion-receipt email (ADR-0015
// point 9) after the response is flushed.
export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const id = extractId(request);
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { data, error } = await requestWorkspaceDeletion(db, { workspaceId: parsed.data.id });
  if (error) {
    mapDeleteWorkspaceError(error);
  }
  const result = data as unknown as WorkspaceDeletionResult;

  const cookieStore = await cookies();
  const currentActiveId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;

  const { newActiveWorkspaceId, newActiveWorkspaceName } = await resolveNewActiveWorkspace(db, {
    userId: principal.userId,
    leftWorkspaceId: parsed.data.id,
    currentActiveId,
  });

  const admin = createAdminClient();
  const { data: actor } = await admin.auth.admin.getUserById(principal.userId);
  const actorEmail = actor?.user?.email ?? 'A workspace Owner';

  after(async () => sendWorkspaceDeletionEmails({
    recipients: result.recipients,
    input: {
      workspaceName: result.workspace_name,
      workspaceId: result.workspace_id,
      actorEmail,
      purgeDeadline: result.purge_deadline,
    },
    apiKey: env.RESEND_API_KEY,
    fromEmail: env.RESEND_DIGEST_FROM_EMAIL,
  }));

  const response = jsonResponse({
    workspaceId: result.workspace_id,
    workspaceName: result.workspace_name,
    purgeDeadline: result.purge_deadline,
    otherMemberCount: result.other_member_count,
    // The deleted workspace's own cookie-active-ness, not "was any workspace
    // re-pointed" — `resolveNewActiveWorkspace` short-circuits to nulls both
    // when the deleted workspace was inactive (nothing to re-point: AC-11's
    // stable-context case) AND when it was active but no replacement remains
    // (AC-10: onboarding). The client needs to tell those apart, since only
    // the second means "no workspace left".
    wasActiveWorkspace: currentActiveId === parsed.data.id,
    newActiveWorkspaceId,
    newActiveWorkspaceName,
  });
  if (newActiveWorkspaceId) {
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, newActiveWorkspaceId, ACTIVE_WORKSPACE_COOKIE_DEFAULTS);
  }
  else if (currentActiveId === parsed.data.id) {
    response.cookies.delete(ACTIVE_WORKSPACE_COOKIE);
  }
  return response;
}, { auth: 'cookie-only', why: 'Workspace deletion is available to the Owner via a browser session only.' });

function extractId(request: NextRequest): string {
  // App Router exposes route params via context, but withApiHandler is generic
  // so we read it from the URL path directly. `/api/v1/workspaces/{id}` →
  // segment after the literal "workspaces".
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

export type { RouteContext };
