import type { JiraCredentials } from '@lib/jira/credentials';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import {
  assertCanAdministerJiraConnection,
  assertWorkspaceIdIsUuid,
  extractWorkspaceId,
  JIRA_CONNECTION_MESSAGES,
  JiraConnectionCheckBodySchema,
  parseJiraConnectionBody,
} from '@lib/jira/connection-access';
import { checkJiraConnection } from '@lib/jira/connection-check';
import { loadWorkspaceJiraCredentials } from '@lib/jira/credentials';
import { normalizeJiraSiteUrl } from '@lib/jira/site-url';
import { createAdminClient } from '@lib/supabase/admin';
import { withCheckGuard } from '@lib/tracker-settings/check-guard';

// POST /api/v1/workspaces/{id}/jira-connection/check — "Test connection" (BK-1170).
// Owner / admin only. Body is either empty (test the STORED connection) or all of
// `{ site_url, email, api_token }` (test unsaved values); anything partial is a 422.
// The site URL is validated and normalised BEFORE any network call, so only
// https://<name>.atlassian.net can ever be contacted. Creates and stores nothing.
//
// A FAILED check is a 200 `{ ok: false, reason: { kind, message } }`, never a 4xx;
// only a malformed body is a 422. One check at a time per person (the same guard
// as the tracker-settings check): a second concurrent call is a 429.
// The token is never returned and the request body is never logged.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  assertWorkspaceIdIsUuid(workspaceId);

  const { principal, db } = getAuth(ctx);
  await assertCanAdministerJiraConnection({ db, principal, workspaceId });

  const raw = await request.text();
  let payload: unknown = {};
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    }
    catch {
      throw new ApiError('bad_request', 'Request body must be valid JSON.');
    }
  }
  const body = parseJiraConnectionBody(JiraConnectionCheckBodySchema, payload);

  const given = [body.site_url, body.email, body.api_token].filter(value => value !== undefined).length;
  if (given !== 0 && given !== 3) {
    throw new ApiError('validation_failed', 'Send the site URL, the email and the API token together, or nothing to test the saved connection.', {
      details: { reason: 'incomplete_body' },
    });
  }

  let credentials: JiraCredentials | null;
  if (given === 3) {
    const url = normalizeJiraSiteUrl(body.site_url ?? '');
    if (url === null) {
      throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.invalid_site_url, {
        details: { reason: 'invalid_site_url' },
      });
    }
    credentials = { url, email: body.email ?? '', token: body.api_token ?? '' };
  }
  else {
    credentials = await loadWorkspaceJiraCredentials(createAdminClient(), workspaceId);
    if (credentials === null) {
      return jsonResponse(
        { ok: false, reason: { kind: 'not_connected', message: 'Jira is not connected for this workspace.' } },
        { status: 200 },
      );
    }
  }

  const checked = credentials;
  const result = await withCheckGuard(principal.userId, async () => checkJiraConnection(checked));
  return jsonResponse(
    result.ok ? { ok: true, reason: null } : { ok: false, reason: result.reason },
    { status: 200 },
  );
}, { auth: 'required', requires: ['workspace:admin'] });
