import {
  assertTargetDateBounds,
  maxTargetDateUtcIso,
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_NAME_MAX,
  MilestoneCreateBodySchema,
  MilestoneNameSchema,
  todayUtcIso,
} from '@lib/milestones/validation';
import { describe, expect, test } from 'bun:test';

// BK-205 — body validation for the milestones create/edit routes. Pure
// schema tests: the Zod layer mirrors the bunkai_create_milestone /
// bunkai_update_milestone SHAPE rules (collapse-then-trim, length 1..100,
// description <=500) so malformed bodies fail fast as a 422 before any DB
// round-trip; the RPC + table CHECK + unique index stay the enforcement
// points of record.

describe('MilestoneNameSchema', () => {
  test('collapses internal whitespace runs (including tabs) and trims edges', () => {
    expect(MilestoneNameSchema.parse('  Release\t\t2.4   ')).toBe('Release 2.4');
  });

  test('rejects an empty string with "Name is required"', () => {
    const result = MilestoneNameSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name is required');
    }
  });

  test('rejects a whitespace-only string (collapses+trims to empty)', () => {
    const result = MilestoneNameSchema.safeParse('   ');
    expect(result.success).toBe(false);
  });

  test('accepts exactly 100 characters', () => {
    const name = 'x'.repeat(MILESTONE_NAME_MAX);
    expect(MilestoneNameSchema.parse(name)).toBe(name);
  });

  test('rejects 101 characters with the AC-exact too-long message', () => {
    const result = MilestoneNameSchema.safeParse('x'.repeat(MILESTONE_NAME_MAX + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name must be 100 characters or fewer');
    }
  });
});

describe('MilestoneCreateBodySchema', () => {
  test('parses a valid body, normalizing the name and defaulting description', () => {
    const parsed = MilestoneCreateBodySchema.parse({
      name: '  Release   2.4  ',
      target_date: todayUtcIso(),
    });
    expect(parsed).toEqual({ name: 'Release 2.4', target_date: todayUtcIso(), description: '' });
  });

  test('rejects a target_date that is not a calendar date', () => {
    const result = MilestoneCreateBodySchema.safeParse({ name: 'X', target_date: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  test('rejects a description over the max', () => {
    const result = MilestoneCreateBodySchema.safeParse({
      name: 'X',
      target_date: todayUtcIso(),
      description: 'x'.repeat(MILESTONE_DESCRIPTION_MAX + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe('assertTargetDateBounds', () => {
  test('does not throw for today', () => {
    expect(() => assertTargetDateBounds(todayUtcIso())).not.toThrow();
  });

  test('does not throw for exactly 5 years from today', () => {
    expect(() => assertTargetDateBounds(maxTargetDateUtcIso())).not.toThrow();
  });

  test('throws milestone_target_date_past for yesterday', () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    expect(() => assertTargetDateBounds(yesterday)).toThrow('Target date must be today or later.');
  });

  test('throws milestone_target_date_too_far one day beyond the 5-year bound', () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() + 5);
    d.setUTCDate(d.getUTCDate() + 1);
    const tooFar = d.toISOString().slice(0, 10);
    expect(() => assertTargetDateBounds(tooFar)).toThrow('Target date must be within the next 5 years.');
  });
});
