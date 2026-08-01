import { ApiError } from '@lib/api/error-envelope';
import { mapBugRpcError } from '@lib/bugs/errors';
import { describe, expect, test } from 'bun:test';

// BK-40 — the file-a-bug / list-project-bugs error mapper. The RPCs raise the
// bugs-domain 453xx block (45300 bugs_module_outside_project, 45301
// bug_title_invalid, 45302 bug_severity_invalid, 45303
// bug_evidence_limit_exceeded) plus the standard 42501 (forbidden) and P0002
// (not_found, non-disclosure).

// `mapBugRpcError` always throws; capture the ApiError so each case can assert
// code/status/message/details.
function capture(error: { code?: string, message: string }): ApiError {
  try {
    mapBugRpcError(error);
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

  test('P0002 → not_found 404 (non-disclosing across project/module)', () => {
    const err = capture({ code: 'P0002', message: 'project_not_found' });
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Project or module not found.');
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
