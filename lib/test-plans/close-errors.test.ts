import { mapTestPlanCloseRpcError } from '@lib/test-plans/errors';
import { describe, expect, test } from 'bun:test';

// BK-207 — the SQLSTATE -> HTTP mapping for close / reopen. 45604-45606 mean something
// else in the BK-203 membership family (`mapTestPlanTestsRpcError`); these tests pin
// the close-family meaning so the two cannot be swapped by accident.

function thrown(code: string) {
  let error: unknown;
  let returned = false;
  try {
    mapTestPlanCloseRpcError({ code, message: 'raw' });
    returned = true;
  }
  catch (raw) {
    error = raw;
  }
  expect(returned).toBe(false);
  return error as { status: number, message: string, details?: { reason?: string } };
}

describe('mapTestPlanCloseRpcError', () => {
  const cases = [
    { code: 'P0002', status: 404, reason: 'not_found', message: 'Test plan not found.' },
    { code: '45606', status: 403, reason: 'close_forbidden', message: 'Only the plan\'s creator or a workspace admin can close or reopen it.' },
    { code: '45603', status: 409, reason: 'test_plan_not_open', message: 'The plan is not in a state that allows this action.' },
    { code: '45604', status: 422, reason: 'verdict_required', message: 'Select a verdict (passed or failed) to close the plan.' },
    { code: '45605', status: 422, reason: 'verdict_invalid', message: 'Verdict must be passed or failed.' },
    { code: '22001', status: 422, reason: 'test_plan_summary_length', message: 'Outcome summary must be 4000 characters or fewer.' },
  ];

  for (const c of cases) {
    test(`maps ${c.code} to ${c.status} (${c.reason})`, () => {
      const error = thrown(c.code);
      expect(error.status).toBe(c.status);
      expect(error.message).toBe(c.message);
      expect(error.details?.reason).toBe(c.reason);
    });
  }

  test('an unrecognised code is an internal error carrying the raw message', () => {
    const error = thrown('99999');
    expect(error.status).toBe(500);
    expect(error.message).toBe('raw');
  });
});
