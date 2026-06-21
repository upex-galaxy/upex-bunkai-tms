import { NO_WORKSPACE_LABEL, roleLabel } from '@lib/account/role-label';
import { describe, expect, test } from 'bun:test';

describe('roleLabel', () => {
  test('capitalizes each canonical role', () => {
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('viewer')).toBe('Viewer');
    expect(roleLabel('member')).toBe('Member');
  });

  test('null role -> empty-state sentinel (Scenario B)', () => {
    expect(roleLabel(null)).toBe(NO_WORKSPACE_LABEL);
  });

  test('undefined role -> empty-state sentinel', () => {
    expect(roleLabel(undefined)).toBe(NO_WORKSPACE_LABEL);
  });
});
