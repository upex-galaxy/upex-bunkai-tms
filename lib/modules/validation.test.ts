import { moduleCreateToasts, modulePatchShapeError } from '@lib/modules/validation';
import { describe, expect, test } from 'bun:test';

describe('modulePatchShapeError', () => {
  test('an empty body (no fields present) is no_fields', () => {
    expect(modulePatchShapeError({ hasName: false, hasDescription: false, hasParent: false }))
      .toBe('no_fields');
  });

  test('a single field is acceptable (name-only / description-only / parent-only)', () => {
    expect(modulePatchShapeError({ hasName: true, hasDescription: false, hasParent: false }))
      .toBeNull();
    expect(modulePatchShapeError({ hasName: false, hasDescription: true, hasParent: false }))
      .toBeNull();
    expect(modulePatchShapeError({ hasName: false, hasDescription: false, hasParent: true }))
      .toBeNull();
  });

  test('name + description together is acceptable (both feed one update rpc)', () => {
    expect(modulePatchShapeError({ hasName: true, hasDescription: true, hasParent: false }))
      .toBeNull();
  });

  test('name + parent is combined_update_and_move (BK-57)', () => {
    expect(modulePatchShapeError({ hasName: true, hasDescription: false, hasParent: true }))
      .toBe('combined_update_and_move');
  });

  test('description + parent is combined_update_and_move (BK-57)', () => {
    expect(modulePatchShapeError({ hasName: false, hasDescription: true, hasParent: true }))
      .toBe('combined_update_and_move');
  });

  test('all three fields is combined_update_and_move (BK-57)', () => {
    expect(modulePatchShapeError({ hasName: true, hasDescription: true, hasParent: true }))
      .toBe('combined_update_and_move');
  });
});

describe('moduleCreateToasts', () => {
  test('no warning yields exactly one success toast', () => {
    expect(moduleCreateToasts(undefined)).toEqual([
      { kind: 'success', message: 'Module created' },
    ]);
  });

  test('a non-empty warning yields success FIRST, then the warning verbatim (BK-67)', () => {
    const warning = 'This module sits 5 levels deep — the maximum is 6.';
    expect(moduleCreateToasts(warning)).toEqual([
      { kind: 'success', message: 'Module created' },
      { kind: 'warning', message: warning },
    ]);
  });

  test('an empty-string warning yields the success toast only', () => {
    expect(moduleCreateToasts('')).toEqual([
      { kind: 'success', message: 'Module created' },
    ]);
  });

  test('the first toast is always the success toast, for every input', () => {
    const inputs: Array<string | null | undefined> = [undefined, null, '', 'deep nesting'];
    for (const input of inputs) {
      expect(moduleCreateToasts(input)[0]?.kind).toBe('success');
    }
  });
});
