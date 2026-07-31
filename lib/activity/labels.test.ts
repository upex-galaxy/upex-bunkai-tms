import { ACTIVITY_ALLOWED_ACTIONS } from '@lib/activity/constants';
import { ACTION_LABELS, isKnownActivityAction } from '@lib/activity/labels';
import { describe, expect, test } from 'bun:test';

// BK-49 — R1 backstop (implementation-plan.md Risk R1: allowlist/label-map
// drift). `ACTION_LABELS` and `ACTIVITY_ALLOWED_ACTIONS` are two
// hand-maintained lists (Decision 2's flagged trade-off); this suite is the
// cross-reference that catches the day they drift apart.

describe('aCTION_LABELS coverage (Risk R1)', () => {
  test('every allowlisted action has a label', () => {
    for (const action of ACTIVITY_ALLOWED_ACTIONS) {
      expect(ACTION_LABELS[action]).toBeDefined();
      expect(typeof ACTION_LABELS[action]).toBe('string');
      expect(ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });

  test('the label map carries exactly the 8 allowlisted actions — no orphan, no gap', () => {
    expect(Object.keys(ACTION_LABELS).sort()).toEqual([...ACTIVITY_ALLOWED_ACTIONS].sort());
  });

  test('the exact 8-row table matches implementation-plan.md verbatim', () => {
    expect(ACTION_LABELS).toEqual({
      'module.renamed': 'renamed a module',
      'module.description_updated': 'updated a module description',
      'module.moved': 'moved a module',
      'module.archived': 'archived a module',
      'atc.created': 'created an ATC',
      'test.created': 'created a Test',
      'run.finished': 'finished a run',
      'run.aborted': 'aborted a run',
    });
  });
});

describe('isKnownActivityAction', () => {
  test('accepts every allowlisted action', () => {
    for (const action of ACTIVITY_ALLOWED_ACTIONS) {
      expect(isKnownActivityAction(action)).toBe(true);
    }
  });

  test('rejects an excluded write-site action (e.g. atc.updated, out of MVP scope)', () => {
    expect(isKnownActivityAction('atc.updated')).toBe(false);
  });

  test('rejects an unrelated string', () => {
    expect(isKnownActivityAction('bug.reported')).toBe(false);
  });
});
