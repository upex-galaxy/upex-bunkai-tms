import { mapTestPlanRpcError } from '@lib/test-plans/errors';
import {
  TEST_PLAN_DESCRIPTION_MAX,
  TEST_PLAN_GOAL_MAX,
  TEST_PLAN_NAME_MAX,
  TestPlanCreateBodySchema,
  TestPlanNameSchema,
} from '@lib/test-plans/validation';
import { describe, expect, test } from 'bun:test';

// BK-202 — body validation + RPC error mapping for the test-plan
// create/edit routes. Pure unit tests: the Zod layer mirrors the
// bunkai_create_test_plan / bunkai_update_test_plan SHAPE rules
// (collapse-then-trim, name 1..100, description <=500, goal <=100) so a
// malformed body fails fast as a 422 before any DB round-trip; the RPC +
// table CHECK + unique index stay the enforcement points of record, and the
// REAL write path is exercised against the live database in
// `test-plan-rpc-isolation.test.ts` — these tests deliberately prove nothing
// about the database.

describe('TestPlanNameSchema', () => {
  test('collapses internal whitespace runs (including tabs) and trims edges', () => {
    expect(TestPlanNameSchema.parse('  Release\t\t2.4   regression ')).toBe('Release 2.4 regression');
  });

  // AC 1.5 — `" A "` must land as `"A"`, proving the 1-char lower bound and
  // the trim rule at once.
  test('accepts a name that trims to exactly one character (AC 1.5)', () => {
    expect(TestPlanNameSchema.parse(' A ')).toBe('A');
  });

  // AC 3.2
  test('rejects an empty string with "Name is required"', () => {
    const result = TestPlanNameSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name is required');
    }
  });

  // AC 3.1
  test('rejects a whitespace-only string (collapses+trims to empty)', () => {
    expect(TestPlanNameSchema.safeParse('   ').success).toBe(false);
  });

  // AC 3.3 — tabs and newlines are whitespace to `\s`, matching the RPC.
  test('rejects a name made only of tab/newline whitespace (AC 3.3)', () => {
    expect(TestPlanNameSchema.safeParse('\t\n').success).toBe(false);
  });

  // AC 1.3 — the upper bound is inclusive.
  test('accepts exactly 100 characters (AC 1.3)', () => {
    const name = 'x'.repeat(TEST_PLAN_NAME_MAX);
    expect(TestPlanNameSchema.parse(name)).toBe(name);
  });

  // AC 1.4
  test('rejects 101 characters with the too-long message (AC 1.4)', () => {
    const result = TestPlanNameSchema.safeParse('x'.repeat(TEST_PLAN_NAME_MAX + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name must be 100 characters or fewer');
    }
  });
});

describe('TestPlanCreateBodySchema', () => {
  // AC 1.2 — a name-only body is valid; description and goal default to ''.
  test('parses a name-only body, defaulting description and goal (AC 1.2)', () => {
    expect(TestPlanCreateBodySchema.parse({ name: '  Smoke   pass ' })).toEqual({
      name: 'Smoke pass',
      description: '',
      goal: '',
    });
  });

  // AC 1.1
  test('parses a full body with description and goal (AC 1.1)', () => {
    expect(TestPlanCreateBodySchema.parse({
      name: 'Release 2.4 regression',
      description: 'Full regression before the 2.4 cut',
      goal: '  Release   2.4 ',
    })).toEqual({
      name: 'Release 2.4 regression',
      description: 'Full regression before the 2.4 cut',
      // The goal column's CHECK pins the same collapse-then-trim invariant
      // the name column does, so the schema must normalize it too.
      goal: 'Release 2.4',
    });
  });

  test('rejects a description over the max', () => {
    const result = TestPlanCreateBodySchema.safeParse({
      name: 'X',
      description: 'x'.repeat(TEST_PLAN_DESCRIPTION_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  test('rejects a goal over the max', () => {
    const result = TestPlanCreateBodySchema.safeParse({
      name: 'X',
      goal: 'x'.repeat(TEST_PLAN_GOAL_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  test('accepts a goal at exactly the max', () => {
    const goal = 'x'.repeat(TEST_PLAN_GOAL_MAX);
    expect(TestPlanCreateBodySchema.parse({ name: 'X', goal }).goal).toBe(goal);
  });
});

describe('mapTestPlanRpcError', () => {
  // Every branch throws; the assertions below pin the ratified copy and the
  // status each SQLSTATE resolves to.
  const cases: { code: string, status: number, message: string, reason: string }[] = [
    { code: '42501', status: 403, message: 'You must be a member of this workspace with write access.', reason: 'not_a_member' },
    { code: 'P0002', status: 404, message: 'Test plan not found.', reason: 'not_found' },
    { code: '23505', status: 409, message: 'A test plan with this name already exists.', reason: 'test_plan_name_taken' },
    { code: '45600', status: 422, message: 'Name must be between 1 and 100 characters.', reason: 'test_plan_name_length' },
    { code: '45601', status: 422, message: 'Description must be 500 characters or fewer.', reason: 'test_plan_description_length' },
    { code: '45602', status: 422, message: 'Goal must be 100 characters or fewer.', reason: 'test_plan_goal_length' },
    { code: '45603', status: 409, message: 'This test plan is closed and can no longer be edited.', reason: 'test_plan_not_open' },
  ];

  for (const testCase of cases) {
    test(`maps ${testCase.code} to ${testCase.status} with reason ${testCase.reason}`, () => {
      // The guard sits OUTSIDE the try: raising it inside would be caught by
      // the same `catch`, so a mapper that silently returned would fall into
      // the assertions instead of reporting the real problem.
      let thrown: unknown;
      let returned = false;
      try {
        mapTestPlanRpcError({ code: testCase.code, message: 'raw' });
        returned = true;
      }
      catch (raw) {
        thrown = raw;
      }
      expect(returned).toBe(false);
      const error = thrown as { status?: number, message: string, details?: { reason?: string } };
      expect(error.status).toBe(testCase.status);
      expect(error.message).toBe(testCase.message);
      expect(error.details?.reason).toBe(testCase.reason);
    });
  }

  test('falls through to internal_error for an unrecognised code', () => {
    let thrown: unknown;
    let returned = false;
    try {
      mapTestPlanRpcError({ code: '99999', message: 'something went sideways' });
      returned = true;
    }
    catch (raw) {
      thrown = raw;
    }
    expect(returned).toBe(false);
    const error = thrown as { status?: number, message: string };
    expect(error.status).toBe(500);
    expect(error.message).toBe('something went sideways');
  });
});
