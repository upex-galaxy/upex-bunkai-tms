import { mapMilestonePlanRpcError } from '@lib/milestones/errors';
import { describe, expect, test } from 'bun:test';

// BK-206 — the SQLSTATE -> HTTP mapping for attach / detach (0112). Pins the ratified
// contract: viewer 403, duplicate 409 + 45504, outside the project 422 + 45505 with no
// id in the answer, the 51st plan 422 + 45506.

function thrown(code: string | undefined) {
  let error: unknown;
  let returned = false;
  try {
    mapMilestonePlanRpcError({ code, message: 'raw' });
    returned = true;
  }
  catch (raw) {
    error = raw;
  }
  expect(returned).toBe(false);
  return error as { status: number, message: string, details?: { reason?: string } };
}

describe('mapMilestonePlanRpcError', () => {
  const cases = [
    { code: '42501', status: 403, reason: 'forbidden_role' },
    { code: 'P0002', status: 404, reason: 'not_found' },
    { code: '45504', status: 409, reason: 'milestone_plan_exists' },
    { code: '23505', status: 409, reason: 'milestone_plan_exists' },
    { code: '45505', status: 422, reason: 'plan_outside_project' },
    { code: '45506', status: 422, reason: 'milestone_plan_limit' },
    { code: '22023', status: 422, reason: 'plan_selection_empty' },
  ];

  for (const c of cases) {
    test(`maps ${c.code} to ${c.status} (${c.reason})`, () => {
      const error = thrown(c.code);
      expect(error.status).toBe(c.status);
      expect(error.details?.reason).toBe(c.reason);
    });
  }

  test('the 45505 message names no id', () => {
    expect(thrown('45505').message).toBe('Only test plans of this milestone\'s project can be attached.');
  });

  test('an unknown code is an internal error', () => {
    expect(thrown('XX000').status).toBe(500);
    expect(thrown(undefined).status).toBe(500);
  });
});
