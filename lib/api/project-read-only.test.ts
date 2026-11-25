import { ApiError } from '@lib/api/error-envelope';
import { isProjectReadOnlyFailure, projectReadOnlyError, throwIfProjectReadOnly } from '@lib/api/project-read-only';
import { describe, expect, test } from 'bun:test';

describe('project read-only mapping (BK-233, Scenario 2.2)', () => {
  test('recognises the 45701 SQLSTATE and the trigger message', () => {
    expect(isProjectReadOnlyFailure({ code: '45701', message: 'project_read_only' })).toBe(true);
    expect(isProjectReadOnlyFailure(new ApiError('internal_error', 'project_read_only'))).toBe(true);
    expect(isProjectReadOnlyFailure({ code: '45700', message: 'project_limit_reached' })).toBe(false);
    expect(isProjectReadOnlyFailure(null)).toBe(false);
  });

  test('never re-wraps the named error itself', () => {
    expect(isProjectReadOnlyFailure(projectReadOnlyError())).toBe(false);
  });

  test('the named error is a 422 project_read_only with a reason', () => {
    const error = projectReadOnlyError();
    expect(error.status).toBe(422);
    expect(error.code).toBe('project_read_only');
    expect(error.details).toEqual({ reason: 'project_read_only' });
  });

  test('a domain mapper throws the named error before its own switch', () => {
    expect(() => throwIfProjectReadOnly({ code: '45701', message: 'project_read_only' })).toThrow(ApiError);
    expect(() => throwIfProjectReadOnly({ code: '42501', message: 'denied' })).not.toThrow();
    expect(() => throwIfProjectReadOnly(null)).not.toThrow();
  });
});
