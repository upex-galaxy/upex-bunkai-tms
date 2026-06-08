import {
  canAddTag,
  hasMinimumSteps,
  provenanceOk,
  tagCapReached,
  titleValid,
} from '@lib/atcs/builder-guards';
import { describe, expect, test } from 'bun:test';

describe('titleValid', () => {
  test('rejects a title below the minimum (2 chars)', () => {
    expect(titleValid('AB')).toBe(false);
  });

  test('accepts a title at the minimum (3 chars)', () => {
    expect(titleValid('ABC')).toBe(true);
  });

  test('trims before measuring', () => {
    expect(titleValid('  AB  ')).toBe(false);
    expect(titleValid('  ABC  ')).toBe(true);
  });

  test('accepts a title at the maximum (200 chars)', () => {
    expect(titleValid('x'.repeat(200))).toBe(true);
  });

  test('rejects a title above the maximum (201 chars)', () => {
    expect(titleValid('x'.repeat(201))).toBe(false);
  });
});

describe('tagCapReached / canAddTag', () => {
  const nine = Array.from({ length: 9 }, (_, i) => `t${i}`);
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);

  test('cap is not reached at 9 tags', () => {
    expect(tagCapReached(nine)).toBe(false);
    expect(canAddTag(nine, 'new')).toBe(true);
  });

  test('cap is reached at 10 tags — the 11th is refused', () => {
    expect(tagCapReached(ten)).toBe(true);
    expect(canAddTag(ten, 'eleventh')).toBe(false);
  });

  test('refuses empty and duplicate tags', () => {
    expect(canAddTag(['regression'], '   ')).toBe(false);
    expect(canAddTag(['regression'], 'Regression')).toBe(false);
  });
});

describe('provenanceOk', () => {
  test('requires both a story and at least one AC', () => {
    expect(provenanceOk(null, [])).toBe(false);
    expect(provenanceOk('story-1', [])).toBe(false);
    expect(provenanceOk(null, ['ac-1'])).toBe(false);
    expect(provenanceOk('story-1', ['ac-1'])).toBe(true);
  });
});

describe('hasMinimumSteps', () => {
  test('requires at least one step', () => {
    expect(hasMinimumSteps(0)).toBe(false);
    expect(hasMinimumSteps(1)).toBe(true);
  });
});
