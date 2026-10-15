import type { TrackerCheckResult, TrackerFormValues } from './form-state';
import { describe, expect, it } from 'bun:test';
import {
  canRunCheck,
  canSave,
  checkResultFor,
  isDirty,
  normalizeValues,
  queueDialogCopy,
  READ_ONLY_NOTE,
  toRequestBody,
  validateValues,
} from './form-state';

// BK-371 — the pure rules of the settings card (AC-1, 2.7, 3, 4, 5.5/5.7, 8, 9, 10).

const saved: TrackerFormValues = { destinationKey: 'QAS', issueTypeName: 'Bug', enabled: false };
const edit = (patch: Partial<TrackerFormValues>): TrackerFormValues => ({ ...saved, ...patch });

describe('isDirty / canSave', () => {
  it('is clean for the saved values and for edits that normalise to them', () => {
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty(saved, edit({ destinationKey: ' qas ' }))).toBe(false);
    expect(isDirty(saved, edit({ issueTypeName: '  Bug ' }))).toBe(false);
  });

  it('is dirty when the key, the issue type or the switch changes', () => {
    expect(isDirty(saved, edit({ destinationKey: 'QAT' }))).toBe(true);
    expect(isDirty(saved, edit({ issueTypeName: 'Task' }))).toBe(true);
    expect(isDirty(saved, edit({ enabled: true }))).toBe(true);
  });

  it('Save is enabled only for an admin, idle, with a changed value (PO Q5)', () => {
    expect(canSave({ saved, current: saved, canEdit: true, busy: false })).toBe(false);
    expect(canSave({ saved, current: edit({ enabled: true }), canEdit: true, busy: false })).toBe(true);
    expect(canSave({ saved, current: edit({ enabled: true }), canEdit: false, busy: false })).toBe(false);
    expect(canSave({ saved, current: edit({ enabled: true }), canEdit: true, busy: true })).toBe(false);
  });

  it('an unconfigured Project (no key, sync off) is clean until the user types', () => {
    const empty: TrackerFormValues = { destinationKey: '', issueTypeName: 'Bug', enabled: false };
    expect(isDirty(empty, empty)).toBe(false);
    expect(isDirty(empty, { ...empty, destinationKey: 'QAS' })).toBe(true);
  });
});

describe('canRunCheck', () => {
  it('needs a key, an admin and nothing in flight', () => {
    expect(canRunCheck({ current: saved, canEdit: true, busy: false })).toBe(true);
    expect(canRunCheck({ current: edit({ destinationKey: '   ' }), canEdit: true, busy: false })).toBe(false);
    expect(canRunCheck({ current: saved, canEdit: false, busy: false })).toBe(false);
    expect(canRunCheck({ current: saved, canEdit: true, busy: true })).toBe(false);
  });
});

describe('checkResultFor (AC-2.7)', () => {
  const passed: TrackerCheckResult = { destinationKey: 'QAS', issueTypeName: 'Bug', ok: true, message: null };

  it('keeps the result while the checked pair is unchanged, including cosmetic edits', () => {
    expect(checkResultFor(passed, saved)).toBe(passed);
    expect(checkResultFor(passed, edit({ destinationKey: ' qas' }))).toBe(passed);
    expect(checkResultFor(passed, edit({ enabled: true }))).toBe(passed);
  });

  it('drops the result as soon as the key or the issue type changes', () => {
    expect(checkResultFor(passed, edit({ destinationKey: 'QAT' }))).toBeNull();
    expect(checkResultFor(passed, edit({ issueTypeName: 'Task' }))).toBeNull();
    expect(checkResultFor(passed, edit({ destinationKey: '' }))).toBeNull();
  });

  it('has nothing to drop when there is no result', () => {
    expect(checkResultFor(null, saved)).toBeNull();
  });
});

describe('validateValues (AC-3 / 9, frozen copy)', () => {
  it('accepts a valid pair', () => {
    expect(validateValues(saved)).toEqual({});
    expect(validateValues(edit({ destinationKey: 'a1_b' }))).toEqual({});
  });

  it.each(['QA-1', '1AB', 'A', 'ABCDEFGHIJK', 'QÁS', '../admin'])('refuses %p with the invalid-key copy', (key) => {
    expect(validateValues(edit({ destinationKey: key })).destinationKey).toBe('Use 2 to 10 capital letters, digits or underscores, starting with a letter.');
  });

  it('asks for a key when it is empty (AC-1.3)', () => {
    expect(validateValues(edit({ destinationKey: '  ' })).destinationKey).toBe('Enter a Jira project key.');
  });

  it('bounds the issue type at 1 to 60 characters', () => {
    expect(validateValues(edit({ issueTypeName: 'x'.repeat(60) })).issueTypeName).toBeUndefined();
    expect(validateValues(edit({ issueTypeName: 'x'.repeat(61) })).issueTypeName).toBe('Issue type must be 1 to 60 characters.');
    expect(validateValues(edit({ issueTypeName: '   ' })).issueTypeName).toBe('Issue type must be 1 to 60 characters.');
  });
});

describe('request body and copy', () => {
  it('normalises the values and omits the confirmation unless one was given', () => {
    expect(toRequestBody(edit({ destinationKey: ' qas ', issueTypeName: ' Bug ', enabled: true }))).toEqual({
      destination_project_key: 'QAS',
      issue_type_name: 'Bug',
      enabled: true,
    });
    expect(toRequestBody(edit({ enabled: true }), 4)).toMatchObject({ confirm_queue_count: 4 });
    expect(toRequestBody(edit({ enabled: true }), 0)).toMatchObject({ confirm_queue_count: 0 });
  });

  it('renders the frozen queue dialog copy with the count and the key (PO Q1)', () => {
    expect(queueDialogCopy({ queueCount: 12, destinationKey: 'QAS' })).toEqual({
      description: 'This change queues 12 defects of this Project for Jira project QAS. Issues created in Jira cannot be removed from Bunkai.',
      confirmLabel: 'Queue 12 defects',
    });
  });

  it('keeps the read-only note as the PO froze it', () => {
    expect(READ_ONLY_NOTE).toBe('Only workspace owners and admins can change this.');
  });

  it('normalizeValues leaves the switch alone', () => {
    expect(normalizeValues(edit({ enabled: true })).enabled).toBe(true);
  });
});
