import { describe, expect, it } from 'bun:test';
import { archiveLine, formatModuleRestored, restoreModuleToast } from './restore-copy';

const BASE = { id: 'm', name: 'Checkout', changed: true, modules: 1, user_stories: 0, acceptance_criteria: 0, atcs: 0 };
const AT = '2026-11-05T10:30:00.123456+00:00';

describe('restoreModuleToast', () => {
  it('names the Module and counts only what came back with it', () => {
    expect(restoreModuleToast({ ...BASE, modules: 3, user_stories: 5, acceptance_criteria: 14, atcs: 9 }))
      .toBe('Restored "Checkout" with 2 sub-modules, 5 user stories, 14 acceptance criteria and 9 ATCs.');
  });

  it('uses the singular and leaves out what did not come back', () => {
    expect(restoreModuleToast({ ...BASE, modules: 2, atcs: 1 })).toBe('Restored "Checkout" with 1 sub-module and 1 ATC.');
    expect(restoreModuleToast({ ...BASE, user_stories: 1, acceptance_criteria: 1 }))
      .toBe('Restored "Checkout" with 1 user story and 1 acceptance criterion.');
  });

  it('says so when the Module came back alone', () => {
    expect(restoreModuleToast(BASE)).toBe('Restored "Checkout".');
  });

  it('does not claim a restore when nothing changed', () => {
    expect(restoreModuleToast({ ...BASE, changed: false, modules: 0 })).toBe('"Checkout" was already active.');
  });
});

describe('formatModuleRestored', () => {
  it('counts what came back, for module.restored only', () => {
    expect(formatModuleRestored('module.restored', { modules: 3, user_stories: 5, acceptance_criteria: 14, atcs: 9 }))
      .toBe('Back with 2 sub-modules, 5 user stories, 14 acceptance criteria and 9 ATCs');
    expect(formatModuleRestored('module.restored', { modules: 1 })).toBe('Nothing else came back with it');
    expect(formatModuleRestored('module.archived', { modules: 3 })).toBeNull();
  });

  it('survives a payload with no counts', () => {
    expect(formatModuleRestored('module.restored', {})).toBe('Nothing else came back with it');
  });
});

describe('archiveLine', () => {
  it('shows only the date for a row archived on its own', () => {
    expect(archiveLine({ archived_at: AT, archived_by: null, archived_with: null })).toBe('2026-11-05 10:30');
  });

  it('adds who, and what it went down with', () => {
    expect(archiveLine({ archived_at: AT, archived_by: { user_id: 'u', email: 'ana@example.com' }, archived_with: 'Checkout' }))
      .toBe('2026-11-05 10:30 · with Checkout · ana@example.com');
  });

  it('never prints a blank actor', () => {
    expect(archiveLine({ archived_at: AT, archived_by: { user_id: 'u', email: null }, archived_with: null }))
      .toBe('2026-11-05 10:30 · a former member');
  });
});
