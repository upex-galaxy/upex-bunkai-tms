import { canSubmitIssueForm } from '@lib/tokens/issue-form';
import { describe, expect, test } from 'bun:test';

// BK-88 Slice B — issuance form validation gate (AC Scenario 2).

describe('canSubmitIssueForm', () => {
  test('empty name -> false', () => {
    expect(canSubmitIssueForm({ name: '', scopes: ['atc:read'] })).toBe(false);
  });

  test('whitespace-only name -> false', () => {
    expect(canSubmitIssueForm({ name: '   ', scopes: ['atc:read'] })).toBe(false);
  });

  test('no scopes -> false', () => {
    expect(canSubmitIssueForm({ name: 'ci-deploy', scopes: [] })).toBe(false);
  });

  test('valid name + at least one scope -> true', () => {
    expect(canSubmitIssueForm({ name: 'ci-deploy', scopes: ['atc:read'] })).toBe(true);
  });

  test('name with surrounding whitespace still counts when trimmed content is non-empty', () => {
    expect(canSubmitIssueForm({ name: '  ci-deploy  ', scopes: ['run:execute'] })).toBe(true);
  });

  test('empty name AND no scopes -> false', () => {
    expect(canSubmitIssueForm({ name: '', scopes: [] })).toBe(false);
  });
});
