import type { TrackerCardState, TrackerFormValues } from './form-state';
import { describe, expect, it } from 'bun:test';
import {
  applyCheckResult,
  applyEdit,
  applySaved,
  canRunCheck,
  canSave,
  initialCardState,
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

describe('the check result is cleared on ANY edit and after a save (PO Q6, AC-2.7, F4)', () => {
  const checked = (state: TrackerCardState, ok = true) => applyCheckResult(state, { checked: state.current, ok, message: ok ? null : 'Check failed text' });
  const withCheck = checked(initialCardState(saved));

  it('records the result for the pair that was checked', () => {
    expect(withCheck.check).toEqual({ destinationKey: 'QAS', issueTypeName: 'Bug', ok: true, message: null });
    expect(checked(initialCardState(saved), false).check).toMatchObject({ ok: false, message: 'Check failed text' });
  });

  it('a key edit clears it', () => {
    expect(applyEdit(withCheck, { destinationKey: 'QAT' }).check).toBeNull();
  });

  it('an issue type edit clears it', () => {
    expect(applyEdit(withCheck, { issueTypeName: 'Task' }).check).toBeNull();
  });

  it('a Switch toggle clears it', () => {
    expect(applyEdit(withCheck, { enabled: true }).check).toBeNull();
  });

  it('an edit that is reverted does not bring the old result back', () => {
    const edited = applyEdit(withCheck, { destinationKey: 'QAT' });
    const reverted = applyEdit(edited, { destinationKey: 'QAS' });
    expect(reverted.current).toEqual(saved);
    expect(reverted.check).toBeNull();
    // toggling twice is also two edits
    expect(applyEdit(applyEdit(withCheck, { enabled: true }), { enabled: false }).check).toBeNull();
  });

  it('a successful save adopts the stored values and clears the result', () => {
    const edited = applyEdit(withCheck, { enabled: true });
    const rechecked = applyCheckResult(edited, { checked: edited.current, ok: true, message: null });
    expect(rechecked.check).not.toBeNull();
    const stored: TrackerFormValues = { destinationKey: 'QAS', issueTypeName: 'Bug', enabled: true };
    const after = applySaved(rechecked, stored);
    expect(after.check).toBeNull();
    expect(after.saved).toEqual(stored);
    expect(after.current).toEqual(stored);
  });

  it('a late answer for a pair the form no longer holds is dropped', () => {
    const state = initialCardState(saved);
    const edited = applyEdit(state, { destinationKey: 'QAT' });
    expect(applyCheckResult(edited, { checked: saved, ok: true, message: null }).check).toBeNull();
  });

  it('cosmetic differences in the checked pair still match (spaces, case)', () => {
    const state = initialCardState(saved);
    expect(applyCheckResult(state, { checked: { ...saved, destinationKey: ' qas ' }, ok: true, message: null }).check).not.toBeNull();
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

  it('counts code points like the SQL char_length: 60 emoji are valid, 61 are not (F9)', () => {
    expect(validateValues(edit({ issueTypeName: '😀'.repeat(60) })).issueTypeName).toBeUndefined();
    expect(validateValues(edit({ issueTypeName: '😀'.repeat(61) })).issueTypeName).toBe('Issue type must be 1 to 60 characters.');
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
