import { ACTIVITY_ALLOWED_ACTIONS } from '@lib/activity/constants';
import { ACTION_LABELS, isKnownActivityAction, resolveActionLabel } from '@lib/activity/labels';
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

  test('the label map carries exactly the 14 allowlisted actions — no orphan, no gap', () => {
    expect(Object.keys(ACTION_LABELS).sort()).toEqual([...ACTIVITY_ALLOWED_ACTIONS].sort());
  });

  test('the exact 14-row table matches implementation-plan.md / BK-264 + BK-508\'s AC verbatim', () => {
    expect(ACTION_LABELS).toEqual({
      'module.renamed': 'renamed a module',
      'module.description_updated': 'updated a module description',
      'module.moved': 'moved a module',
      'module.archived': 'archived a module',
      'atc.created': 'created an ATC',
      'test.created': 'created a Test',
      'run.finished': 'finished a run',
      'run.aborted': 'aborted a run',
      'bug.assigned': 'assigned this defect to {assignee}',
      'bug.reassigned': 'assigned this defect to {assignee}',
      'bug.unassigned': 'unassigned this defect',
      'bug.status_changed': 'moved this defect to {status}',
      'export.requested': 'requested a workspace data export',
      'export.downloaded': 'downloaded the workspace data export',
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

  test('rejects an unrelated string — bug.filed included: a PRE-EXISTING gap (bunkai_create_bug already emits it), deliberately left out of THIS story\'s allowlist addition', () => {
    expect(isKnownActivityAction('bug.reported')).toBe(false);
    expect(isKnownActivityAction('bug.filed')).toBe(false);
  });
});

// BK-264 (Slice 4) — resolveActionLabel, the dynamic-label generator for the
// 4 new Bug-triage actions. Covers all 5 acceptance-criteria.md scenarios:
// assigned, reassigned, unassigned, status_changed (non-closed), and
// status_changed's closed special-case.
describe('resolveActionLabel — BK-264 Bug-triage actions (acceptance-criteria.md)', () => {
  test('bug.assigned renders the resolved assignee email (AC: "assigned this defect to Sara Iglesias")', () => {
    const label = resolveActionLabel({
      action: 'bug.assigned',
      payload: { previous_assignee_user_id: null, assignee_user_id: 'user-b' },
      assigneeEmail: 'sara.iglesias@example.com',
    });
    expect(label).toBe('assigned this defect to sara.iglesias@example.com');
  });

  test('bug.reassigned renders the SAME "assigned this defect to <assignee>" phrasing as a fresh assignment — acceptance-criteria.md\'s reassignment scenario states no distinct "activity shows" line, so this mirrors the one wording the AC DOES give for "assigned to someone"', () => {
    const label = resolveActionLabel({
      action: 'bug.reassigned',
      payload: { previous_assignee_user_id: 'user-b', assignee_user_id: 'user-c' },
      assigneeEmail: 'elena.vargas@example.com',
    });
    expect(label).toBe('assigned this defect to elena.vargas@example.com');
  });

  test('bug.assigned/reassigned falls back to a neutral phrase when the assignee could not be resolved to an email (never a raw uuid or blank string)', () => {
    const label = resolveActionLabel({
      action: 'bug.assigned',
      payload: { previous_assignee_user_id: null, assignee_user_id: 'user-b' },
      assigneeEmail: null,
    });
    expect(label).toBe('assigned this defect to a workspace member');
  });

  test('bug.unassigned renders "unassigned this defect" verbatim (AC: "Mateo Silva unassigned this defect") — ignores assigneeEmail, since none is shown', () => {
    const label = resolveActionLabel({
      action: 'bug.unassigned',
      payload: { previous_assignee_user_id: 'user-c', assignee_user_id: null },
      assigneeEmail: 'should-not-appear@example.com',
    });
    expect(label).toBe('unassigned this defect');
  });

  test('bug.status_changed renders "moved this defect to <status>" for a non-closed transition (AC: "moved this defect to in progress")', () => {
    const label = resolveActionLabel({
      action: 'bug.status_changed',
      payload: { previous_status: 'open', status: 'in_progress', assignee_user_id: 'user-b' },
      assigneeEmail: null,
    });
    expect(label).toBe('moved this defect to in progress');
  });

  test('bug.status_changed renders "moved this defect to resolved" for the in_progress -> resolved transition', () => {
    const label = resolveActionLabel({
      action: 'bug.status_changed',
      payload: { previous_status: 'in_progress', status: 'resolved', assignee_user_id: 'user-b' },
      assigneeEmail: null,
    });
    expect(label).toBe('moved this defect to resolved');
  });

  test('bug.status_changed to "closed" is special-cased to "closed this defect" — NEVER "moved this defect to closed" (AC: "Elena Vargas closed this defect")', () => {
    const label = resolveActionLabel({
      action: 'bug.status_changed',
      payload: { previous_status: 'resolved', status: 'closed', assignee_user_id: 'user-b' },
      assigneeEmail: null,
    });
    expect(label).toBe('closed this defect');
    expect(label).not.toContain('moved this defect to closed');
  });

  test('an action outside ACTION_LABELS falls back to the raw action string (matches buildActivityItem\'s previous ACTION_LABELS[action] ?? action behavior)', () => {
    const label = resolveActionLabel({ action: 'something.unknown', payload: {}, assigneeEmail: null });
    expect(label).toBe('something.unknown');
  });

  test('a pre-existing static action (e.g. atc.created) is returned unchanged, ignoring payload/assigneeEmail', () => {
    const label = resolveActionLabel({
      action: 'atc.created',
      payload: { title: 'Login succeeds' },
      assigneeEmail: 'should-not-appear@example.com',
    });
    expect(label).toBe('created an ATC');
  });
});
