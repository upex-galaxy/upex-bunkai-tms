import { canSubmitIssueForm, SCOPES_REQUIRED_MESSAGE, scopesError } from '@lib/tokens/issue-form';
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

// BK-1079 — inline "At least one scope is required." error (BK-88 AC2).
describe('scopesError', () => {
  test('pristine form (no name, scopes untouched) -> no error', () => {
    expect(scopesError({ name: '', scopes: [], scopesTouched: false })).toBeNull();
  });

  test('name filled, no scope -> AC2 message', () => {
    expect(scopesError({ name: 'ci-deploy', scopes: [], scopesTouched: false })).toBe(SCOPES_REQUIRED_MESSAGE);
  });

  test('whitespace-only name, scopes untouched -> no error', () => {
    expect(scopesError({ name: '   ', scopes: [], scopesTouched: false })).toBeNull();
  });

  test('scope checked then unchecked (touched), no name -> AC2 message', () => {
    expect(scopesError({ name: '', scopes: [], scopesTouched: true })).toBe(SCOPES_REQUIRED_MESSAGE);
  });

  test('at least one scope selected -> no error, whatever the name', () => {
    expect(scopesError({ name: 'ci-deploy', scopes: ['atc:read'], scopesTouched: true })).toBeNull();
    expect(scopesError({ name: '', scopes: ['atc:read'], scopesTouched: true })).toBeNull();
  });

  test('message is the exact AC2 copy', () => {
    expect(SCOPES_REQUIRED_MESSAGE).toBe('At least one scope is required.');
  });
});
