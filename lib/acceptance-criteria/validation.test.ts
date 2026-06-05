import { criterionTitleError } from '@lib/acceptance-criteria/validation';
import { describe, expect, test } from 'bun:test';

describe('criterionTitleError', () => {
  test('accepts a normal title', () => {
    expect(criterionTitleError('Full refund within 30 days')).toBeNull();
  });

  test('empty / whitespace is title_required', () => {
    expect(criterionTitleError('')).toBe('title_required');
    expect(criterionTitleError('   ')).toBe('title_required');
  });

  test('2 chars rejected, 3 chars accepted (min boundary, AC5)', () => {
    expect(criterionTitleError('OK')).toBe('title_too_short');
    expect(criterionTitleError('Yes')).toBeNull();
  });

  test('200 chars accepted, 201 rejected (max boundary)', () => {
    expect(criterionTitleError('a'.repeat(200))).toBeNull();
    expect(criterionTitleError('a'.repeat(201))).toBe('title_too_long');
  });

  test('trims before measuring', () => {
    expect(criterionTitleError('  ab  ')).toBe('title_too_short');
    expect(criterionTitleError('  abc  ')).toBeNull();
  });
});
