import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { checkJiraDestination } from '@lib/jira/project-check';
import { assertCanAdministerTracker, assertProjectIdIsUuid, extractProjectId } from '@lib/tracker-settings/access';
import { withCheckGuard } from '@lib/tracker-settings/check-guard';
import { parseTrackerSettingsBody, TrackerSettingsCheckBodySchema } from '@lib/tracker-settings/validation';

// POST /api/v1/projects/{id}/tracker-settings/check — "Run connection check"
// (BK-371). Owner / admin only: the check asks the company Jira, with a shared
// credential, whether a key exists, so members and viewers must not be able to
// probe it (PO Q4). Reads and creates nothing in Bunkai; creates nothing in Jira.
//
// The typed (possibly unsaved) key and issue type are validated and normalised
// BEFORE any network call. A FAILED check is a 200 `{ ok: false, reason }`, never a
// 4xx (T3); only a malformed body is a 422. One check at a time per person: a
// second concurrent call is a 429 `rate_limited` / `check_in_progress`.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  assertProjectIdIsUuid(projectId);

  const { principal, db } = getAuth(ctx);
  await assertCanAdministerTracker({ db, principal, projectId });

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = parseTrackerSettingsBody(TrackerSettingsCheckBodySchema, payload);

  const result = await withCheckGuard(principal.userId, async () => checkJiraDestination({
    projectKey: body.destination_project_key,
    issueTypeName: body.issue_type_name,
  }));

  return jsonResponse(
    result.ok
      ? { ok: true, reason: null }
      : { ok: false, reason: { kind: result.kind, message: result.message } },
    { status: 200 },
  );
}, { auth: 'required', requires: ['workspace:admin'] });
