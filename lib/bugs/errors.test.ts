import { ApiError } from '@lib/api/error-envelope';
import { mapBugRpcError } from '@lib/bugs/errors';
import { describe, expect, test } from 'bun:test';

// BK-40 — the file-a-bug / list-project-bugs error mapper. The RPCs raise the
// bugs-domain 453xx block (45300 bugs_module_outside_project, 45301
// bug_title_invalid, 45302 bug_severity_invalid, 45303
// bug_evidence_limit_exceeded) plus the standard 42501 (forbidden) and P0002
// (not_found, non-disclosure).
//
// BK-264 (Slice 2) extends coverage to the two new RPCs sharing this same
// mapper: bunkai_assign_bug (45312/45313, P0002 via the `notFoundEntity: 'bug'`
// option) and bunkai_transition_bug_status (45310/45311, same P0002 option).

// `mapBugRpcError` always throws; capture the ApiError so each case can assert
// code/status/message/details.
function capture(
  error: { code?: string, message: string },
  opts?: { notFoundEntity?: 'project_or_module' | 'bug', currentStatus?: string },
): ApiError {
  try {
    mapBugRpcError(error, opts);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('mapBugRpcError', () => {
  test('42501 → forbidden 403', () => {
    const err = capture({ code: '42501', message: 'forbidden' });
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  test('P0002 → not_found 404 (non-disclosing across project/module) — default call site', () => {
    const err = capture({ code: 'P0002', message: 'project_not_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Project or module not found.');
  });

  test('BK-264: P0002 with notFoundEntity "bug" → not_found 404, generic "Bug not found" (assign/status routes)', () => {
    const err = capture({ code: 'P0002', message: 'bug_not_found' }, { notFoundEntity: 'bug' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Bug not found.');
    expect(err.details).toEqual({ reason: 'not_found' });
  });

  test('BK-264: 45310 → validation_failed 422 (bug_status_transition_skipped)', () => {
    const err = capture({ code: '45310', message: 'bug_status_transition_skipped' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'status_transition_skipped' });
  });

  // Review fix — the AC ("Skipping a lifecycle stage is rejected") requires
  // the message to NAME the actual required next stage, not just state the
  // general rule. `currentStatus` is what the caller (performBugStatusTransition)
  // re-derives client-side and passes in on this specific error path.
  test('BK-264 review fix: 45310 with currentStatus "open" pins the literal message naming "in_progress" as the required next stage', () => {
    const err = capture({ code: '45310', message: 'bug_status_transition_skipped' }, { currentStatus: 'open' });
    expect(err.message).toBe('A bug must move to \'in_progress\' first.');
  });

  test('BK-264 review fix: 45310 with currentStatus "resolved" pins the literal message naming "closed" as the required next stage', () => {
    const err = capture({ code: '45310', message: 'bug_status_transition_skipped' }, { currentStatus: 'resolved' });
    expect(err.message).toBe('A bug must move to \'closed\' first.');
  });

  test('BK-264 review fix: 45310 without currentStatus falls back to the generic message (defensive — the caller should always supply it)', () => {
    const err = capture({ code: '45310', message: 'bug_status_transition_skipped' });
    expect(err.message).toBe('A bug can only move forward one status stage at a time.');
  });

  test('BK-264: 45311 → validation_failed 422 (bug_status_transition_backward)', () => {
    const err = capture({ code: '45311', message: 'bug_status_transition_backward' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'status_transition_backward' });
  });

  // Review fix — pins the literal message text for the backward-move case too
  // (previously only `details.reason` was asserted for either 45310/45311).
  test('BK-264 review fix: 45311 pins the literal message text', () => {
    const err = capture({ code: '45311', message: 'bug_status_transition_backward' });
    expect(err.message).toBe('A bug\'s status cannot move backward.');
  });

  test('BK-264: 45312 → validation_failed 422 (bug_assignee_not_workspace_member)', () => {
    const err = capture({ code: '45312', message: 'bug_assignee_not_workspace_member' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'assignee_not_workspace_member' });
  });

  test('BK-264: 45313 → validation_failed 422 (bug_assignee_view_only)', () => {
    const err = capture({ code: '45313', message: 'bug_assignee_view_only' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'assignee_view_only' });
  });

  test('45300 → validation_failed 422 (bugs_module_outside_project)', () => {
    const err = capture({ code: '45300', message: 'bugs_module_outside_project' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'module_outside_project' });
  });

  test('45301 → validation_failed 422 (bug_title_invalid)', () => {
    const err = capture({ code: '45301', message: 'bug_title_invalid' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.message).toBe('Title must be between 5 and 200 characters.');
  });

  test('45302 → validation_failed 422 (bug_severity_invalid)', () => {
    const err = capture({ code: '45302', message: 'bug_severity_invalid' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'severity_invalid' });
  });

  test('45303 → validation_failed 422 (bug_evidence_limit_exceeded)', () => {
    const err = capture({ code: '45303', message: 'bug_evidence_limit_exceeded' });
    expect(err.code).toBe('validation_failed');
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'evidence_limit_exceeded' });
  });

  test('unknown code → internal_error 500', () => {
    const err = capture({ code: '99999', message: 'weird db error' });
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toBe('weird db error');
  });
});
