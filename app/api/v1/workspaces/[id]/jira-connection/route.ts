import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import {
  assertCanAdministerJiraConnection,
  assertWorkspaceIdIsUuid,
  extractWorkspaceId,
  isAdminRole,
  JIRA_CONNECTION_MESSAGES,
  JiraConnectionPutBodySchema,
  mapJiraConnectionRpcError,
  parseJiraConnectionBody,
  readActiveRole,
  readConnectionMeta,
  toConnectedShape,
} from '@lib/jira/connection-access';
import { normalizeJiraSiteUrl } from '@lib/jira/site-url';
import { createAdminClient } from '@lib/supabase/admin';
import { deleteWorkspaceJiraConnection, upsertWorkspaceJiraConnection } from '@lib/supabase/rpc';

// BK-1170 — the workspace's own Jira connection (site URL, email, API token).
//
// GET    any active member: `{ connected }`; owner / admin also see the site URL,
//        the email, `has_token`, `updated_at` and `updated_by`.
// PUT    owner / admin only (`workspace:admin` + a LIVE role read). The token is
//        WRITE-ONLY: it goes into Supabase Vault through
//        `bunkai_upsert_workspace_jira_connection` (migration 0119, service_role
//        only) and no route ever returns it. It is required on the first save and
//        whenever the site changes; omit it to change only the email.
// DELETE owner / admin only; removes the connection and its Vault secret.
//
// Nothing here logs a request body.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  assertWorkspaceIdIsUuid(workspaceId);

  const { principal, db } = getAuth(ctx);
  const role = await readActiveRole(db, principal, workspaceId);
  const meta = await readConnectionMeta(createAdminClient(), workspaceId);

  if (meta === null) {
    return jsonResponse({ jira_connection: { connected: false } }, { status: 200 });
  }
  if (!isAdminRole(role)) {
    return jsonResponse({ jira_connection: { connected: true } }, { status: 200 });
  }
  return jsonResponse({ jira_connection: toConnectedShape(meta) }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const PUT = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  assertWorkspaceIdIsUuid(workspaceId);

  const { principal, db } = getAuth(ctx);
  await assertCanAdministerJiraConnection({ db, principal, workspaceId });

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = parseJiraConnectionBody(JiraConnectionPutBodySchema, payload);

  // Validated before the RPC: only https://<name>.atlassian.net is ever stored.
  const siteUrl = normalizeJiraSiteUrl(body.site_url);
  if (siteUrl === null) {
    throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.invalid_site_url, {
      details: { reason: 'invalid_site_url' },
    });
  }

  // The RPC is granted to service_role only (ADR-0012); the actor is the
  // gateway-resolved user, never anything from the request body.
  const { data, error } = await upsertWorkspaceJiraConnection(createAdminClient(), {
    actorUserId: principal.userId,
    workspaceId,
    siteUrl,
    email: body.email,
    apiToken: body.api_token ?? null,
  });
  if (error) {
    mapJiraConnectionRpcError(error);
  }

  const saved = data as { site_url: string, email: string, updated_at: string, updated_by: string | null };
  return jsonResponse(
    {
      jira_connection: {
        connected: true,
        site_url: saved.site_url,
        email: saved.email,
        has_token: true,
        updated_at: saved.updated_at,
      },
    },
    { status: 200 },
  );
}, { auth: 'required', requires: ['workspace:admin'] });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  assertWorkspaceIdIsUuid(workspaceId);

  const { principal, db } = getAuth(ctx);
  await assertCanAdministerJiraConnection({ db, principal, workspaceId });

  const { data, error } = await deleteWorkspaceJiraConnection(createAdminClient(), {
    actorUserId: principal.userId,
    workspaceId,
  });
  if (error) {
    mapJiraConnectionRpcError(error);
  }
  if (data !== true) {
    throw new ApiError('not_found', 'This workspace has no Jira connection.', {
      details: { reason: 'not_connected' },
    });
  }
  return new Response(null, { status: 204 });
}, { auth: 'required', requires: ['workspace:admin'] });
