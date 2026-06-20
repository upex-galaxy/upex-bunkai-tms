import {
  ENVIRONMENT_NAME_MAX,
  EnvironmentCreateBodySchema,
  EnvironmentNameSchema,
  EnvironmentRenameBodySchema,
} from '@lib/environments/validation';
import { describe, expect, test } from 'bun:test';

// BK-148 — body validation for the environments CRUD routes. Pure schema tests:
// the Zod layer mirrors the bunkai_create_environment / bunkai_rename_environment
// SHAPE rules (trim, non-empty, length 1..50) so malformed bodies fail fast as a
// 422 before any DB round-trip; the RPC + unique index stay the enforcement
// points of record (trim, length, case-insensitive uniqueness).

describe('EnvironmentNameSchema', () => {
  test('trims surrounding whitespace and accepts the trimmed value', () => {
    expect(EnvironmentNameSchema.parse('  Staging  ')).toBe('Staging');
  });

  test('rejects an empty string with "Name is required"', () => {
    const result = EnvironmentNameSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name is required');
    }
  });

  test('rejects a whitespace-only string (trims to empty) with "Name is required"', () => {
    const result = EnvironmentNameSchema.safeParse('   ');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name is required');
    }
  });

  test('accepts exactly 50 characters', () => {
    const name = 'x'.repeat(ENVIRONMENT_NAME_MAX);
    expect(EnvironmentNameSchema.parse(name)).toBe(name);
  });

  test('rejects 51 characters with the AC-exact too-long message', () => {
    const result = EnvironmentNameSchema.safeParse('x'.repeat(ENVIRONMENT_NAME_MAX + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name must be 50 characters or fewer');
    }
  });

  test('a name that is > 50 only because of trailing whitespace passes after trim', () => {
    const name = 'x'.repeat(ENVIRONMENT_NAME_MAX);
    expect(EnvironmentNameSchema.parse(`${name}     `)).toBe(name);
  });

  test('ENVIRONMENT_NAME_MAX is 50 (the app-authoritative AC bound)', () => {
    expect(ENVIRONMENT_NAME_MAX).toBe(50);
  });
});

describe('EnvironmentCreateBodySchema / EnvironmentRenameBodySchema', () => {
  test('create body parses a valid name', () => {
    expect(EnvironmentCreateBodySchema.parse({ name: ' Production ' })).toEqual({ name: 'Production' });
  });

  test('rename body parses a valid name', () => {
    expect(EnvironmentRenameBodySchema.parse({ name: 'QA' })).toEqual({ name: 'QA' });
  });

  test('create body rejects a missing name', () => {
    expect(EnvironmentCreateBodySchema.safeParse({}).success).toBe(false);
  });

  test('rename body rejects an empty name', () => {
    expect(EnvironmentRenameBodySchema.safeParse({ name: '' }).success).toBe(false);
  });
});
