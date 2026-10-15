import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { checkJiraDestination } from '@lib/jira/project-check';
import { createAdminClient } from '@lib/supabase/admin';
import { upsertProjectTrackerSettings } from '@lib/supabase/rpc';
import {
  assertCanAdministerTracker,
  assertProjectIdIsUuid,
  extractProjectId,
  loadVisibleProject,
  readTrackerSettings,
  toTrackerSettingsShape,
} from '@lib/tracker-settings/access';
import { mapTrackerSettingsRpcError } from '@lib/tracker-settings/errors';
import { parseTrackerSettingsBody, TrackerSettingsBodySchema } from '@lib/tracker-settings/validation';

// GET /api/v1/projects/{id}/tracker-settings — the Project's Jira defect-sync
//     settings (BK-371). Any workspace member or viewer: `atc:read`, RLS decides.
//     A Project that was never configured answers the defaults, never a 404
//     (AC-6.1); a Project the caller cannot see answers the same 404 as a missing
//     one (AC-4.4).
// PUT /api/v1/projects/{id}/tracker-settings — owner / admin only
//     (`workspace:admin` + a LIVE role read). With the sync ON it runs the
//     connection check first and saves nothing when it fails (PO Q2); a save that
//     would queue N > 0 defects needs `confirm_queue_count` = N (PO Q1), else 409.
//     The write is `bunkai_upsert_project_tracker_settings` (migration 0091),
//     granted to service_role only, called with the gateway's principal.userId.
//
// HYBRID error model (as the environments routes): the house `code` plus a
// granular `details.reason`.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  assertProjectIdIsUuid(projectId);

  const { db } = getAuth(ctx);
  await loadVisibleProject(db, projectId);
  const stored = await readTrackerSettings(db, projectId);

  return jsonResponse({ tracker_settings: toTrackerSettingsShape(stored) }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const PUT = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  assertProjectIdIsUuid(projectId);

  const { principal, db } = getAuth(ctx);

  // 404 when RLS hides the Project, workspace-context match for PATs, and the
  // live owner/admin role: all BEFORE any body is parsed and any Jira call.
  await assertCanAdministerTracker({ db, principal, projectId });

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = parseTrackerSettingsBody(TrackerSettingsBodySchema, payload);

  // Check-on-save (PO Q2): only when the sync is switched ON. Switching off must
  // work even when Jira is down, so a sync-off save never calls Jira.
  let issueTypeName = body.issue_type_name;
  if (body.enabled) {
    const check = await checkJiraDestination({
      projectKey: body.destination_project_key,
      issueTypeName: body.issue_type_name,
    });
    if (!check.ok) {
      throw new ApiError('validation_failed', check.message, {
        details: { reason: 'connection_check_failed', check: { kind: check.kind, message: check.message } },
      });
    }
    // Decision C (AI Tech Lead): store Jira's own spelling of the issue type.
    issueTypeName = check.issueTypeName;
  }

  // The RPC is granted to service_role only (ADR-0012); the actor is the
  // gateway-resolved user, never anything from the request body.
  const { data, error } = await upsertProjectTrackerSettings(createAdminClient(), {
    actorUserId: principal.userId,
    projectId,
    destinationProjectKey: body.destination_project_key,
    issueTypeName,
    enabled: body.enabled,
    confirmQueueCount: body.confirm_queue_count ?? null,
  });
  if (error) {
    mapTrackerSettingsRpcError(error);
  }

  const saved = data as { requeued: number, updated_at: string, destination_project_key: string, issue_type_name: string, enabled: boolean };
  return jsonResponse(
    {
      tracker_settings: toTrackerSettingsShape({
        destination_project_key: saved.destination_project_key,
        issue_type_name: saved.issue_type_name,
        enabled: saved.enabled,
        updated_at: saved.updated_at,
      }),
      requeued: saved.requeued,
    },
    { status: 200 },
  );
}, { auth: 'required', requires: ['workspace:admin'] });
