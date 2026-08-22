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

  // AC 3.2 — BK-592: the message is the ratified copy, NOT Zod's own
  // "Name is required". This assertion used to pin the defect in place.
  test('rejects an empty string with the ratified length copy (AC 3.2)', () => {
    const result = TestPlanNameSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name must be between 1 and 100 characters.');
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

  // AC 1.4 — BK-592: the ratified copy covers the too-long case with the SAME
  // string as the too-short case, exactly as the RPC's single 45600 does.
  test('rejects 101 characters with the ratified length copy (AC 1.4)', () => {
    const result = TestPlanNameSchema.safeParse('x'.repeat(TEST_PLAN_NAME_MAX + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name must be between 1 and 100 characters.');
    }
  });
});

// BK-592 regression. The four scenarios the defect filed, plus the invariant
// whose violation caused them.
//
// Root cause was NOT a wrong string: it was the SAME copy written out twice,
// once as a Zod message and once as a literal in errors.ts. Because the Zod
// pre-check fails fast, a malformed body never reaches the RPC, so the
// ratified wording in errors.ts was unreachable for exactly the inputs it
// described — and the two copies drifted with nothing to catch it.
//
// The cross-layer assertions below are the real regression guard: they fail
// if EITHER layer's copy changes without the other, which is the only way
// this defect can come back. Re-inlining a literal in either module breaks
// them by construction.
describe('BK-592 — ratified validation copy is single-sourced across both layers', () => {
  const RATIFIED_NAME_COPY = 'Name must be between 1 and 100 characters.';

  function messageFor(input: string): string | undefined {
    const result = TestPlanNameSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? undefined : result.error.issues[0]?.message;
  }

  // The exact four rows of the defect's own actual-vs-expected table.
  test('AC 1.4 — a 101-character name returns the ratified copy, not Zod\'s too_big message', () => {
    expect(messageFor('x'.repeat(TEST_PLAN_NAME_MAX + 1))).toBe(RATIFIED_NAME_COPY);
  });

  test('AC 3.1 — a whitespace-only name returns the ratified copy, not "Name is required"', () => {
    expect(messageFor('   ')).toBe(RATIFIED_NAME_COPY);
  });

  test('AC 3.2 — an empty-string name returns the ratified copy, not "Name is required"', () => {
    expect(messageFor('')).toBe(RATIFIED_NAME_COPY);
  });

  test('AC 3.3 — a tab/newline-only name returns the ratified copy, not "Name is required"', () => {
    expect(messageFor('\t\n')).toBe(RATIFIED_NAME_COPY);
  });

  // The invariant itself: whatever the Zod layer says for a length violation
  // must be byte-identical to what the RPC mapper says for the SQLSTATE that
  // encodes the same rule. This is what makes the drift unrepresentable.
  test('the Zod message and the 45600 RPC mapping are the same string', () => {
    let mapped: string | null = null;
    try {
      mapTestPlanRpcError({ code: '45600', message: 'test_plan_name_length' });
    }
    catch (error) {
      mapped = (error as { message: string }).message;
    }
    expect(mapped).toBe(RATIFIED_NAME_COPY);
    expect(messageFor('')).toBe(mapped);
    expect(messageFor('x'.repeat(TEST_PLAN_NAME_MAX + 1))).toBe(mapped);
  });

  // Description and goal carried the same latent divergence (their two copies
  // differed only by a trailing period, so nothing surfaced it). Pinned here
  // so the next drift is caught on the cheap side.
  test('description and goal copy also match across both layers', () => {
    function mappedFor(code: string): string {
      try {
        mapTestPlanRpcError({ code, message: 'x' });
      }
      catch (error) {
        return (error as { message: string }).message;
      }
      throw new Error('mapTestPlanRpcError must always throw');
    }

    const descriptionResult = TestPlanCreateBodySchema.safeParse({
      name: 'valid',
      description: 'x'.repeat(TEST_PLAN_DESCRIPTION_MAX + 1),
    });
    expect(descriptionResult.success).toBe(false);
    if (!descriptionResult.success) {
      expect(descriptionResult.error.issues[0]?.message).toBe(mappedFor('45601'));
    }

    const goalResult = TestPlanCreateBodySchema.safeParse({
      name: 'valid',
      goal: 'x'.repeat(TEST_PLAN_GOAL_MAX + 1),
    });
    expect(goalResult.success).toBe(false);
    if (!goalResult.success) {
      expect(goalResult.error.issues[0]?.message).toBe(mappedFor('45602'));
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
