import type { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { mapDeleteWorkspaceError } from './deletion-response';

// BK-512 — DELETE /api/v1/workspaces/{id} and POST /api/v1/workspaces/{id}/
// restore share this error mapper. The routes themselves are thin
// `withApiHandler` wrappers with no dedicated NextRequest/ctx test harness in
// this repo (same posture `membership/route.test.ts` documents); every
// branch worth covering lives in this pure function. `resolveNewActiveWorkspace`
// (reused as-is from `./membership/response`) already has its own coverage
// there — not duplicated here.
describe('mapDeleteWorkspaceError (BK-512)', () => {
  it('maps not_authenticated (42501) to 401 unauthorized', () => {
    try {
      mapDeleteWorkspaceError({ code: '42501', message: 'not_authenticated' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('unauthorized');
      expect((err as ApiError).status).toBe(401);
    }
  });

  it('maps not_a_member (P0002) to 404 not_found — multi-tenant isolation: a caller with no active membership row for the target workspace is refused as not_found, never told the workspace exists', () => {
    try {
      mapDeleteWorkspaceError({ code: 'P0002', message: 'not_a_member' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('not_found');
      expect((err as ApiError).status).toBe(404);
    }
  });

  it('maps owner_only (45900) to 403 forbidden — AC-02: an Admin/Member/Viewer caller is refused, not silently downgraded', () => {
    try {
      mapDeleteWorkspaceError({ code: '45900', message: 'owner_only' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('forbidden');
      expect((err as ApiError).status).toBe(403);
    }
  });

  it('maps already_deleted (45901) to 404 not_found — Scenario N5 idempotent double-submit, Option B (ticket-scored 25/25): the losing tab is refused as not_found, matching the shipped token-revoke precedent, not a 409', () => {
    try {
      mapDeleteWorkspaceError({ code: '45901', message: 'already_deleted' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('not_found');
      expect((err as ApiError).status).toBe(404);
    }
  });

  it('maps not_deleted (45902) to 409 conflict with a reason detail', () => {
    try {
      mapDeleteWorkspaceError({ code: '45902', message: 'not_deleted' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('conflict');
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).details).toEqual({ reason: 'not_deleted' });
    }
  });

  it('maps an unrecognized error code to 500 internal_error', () => {
    try {
      mapDeleteWorkspaceError({ code: '99999', message: 'boom' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('internal_error');
      expect((err as ApiError).status).toBe(500);
    }
  });
});
