import type { BugBulkEditReport, BugBulkOutcome } from '@lib/bugs/bulk-edit';
import {
  BUG_BULK_STATUS_TARGETS,
  bugBulkReasonLabel,
  bugBulkSelectionProblem,
  describeBugBulkChange,
  groupBugRefusals,
  isIrreversibleBugBulkChange,
  pluralBugs,
  refusedBugIds,
  toBugBulkWireChange,
} from '@lib/bugs/bulk-edit';
import { describe, expect, test } from 'bun:test';

function outcome(id: string, kind: BugBulkOutcome['outcome'], reason: string | null = null): BugBulkOutcome {
  return { bug_id: id, title: `Bug ${id}`, outcome: kind, reason, status: 'open', severity: 'P3', version: 1 };
}

function report(outcomes: BugBulkOutcome[]): BugBulkEditReport {
  return {
    dry_run: false,
    field: 'status',
    requested: outcomes.length,
    changed: outcomes.filter(o => o.outcome === 'changed').length,
    unchanged: outcomes.filter(o => o.outcome === 'unchanged').length,
    refused: outcomes.filter(o => o.outcome === 'refused').length,
    outcomes,
  };
}

describe('bK-2098 bulk-edit vocabulary', () => {
  test('aC21: the screen offers In progress, Resolved and Closed, never Open', () => {
    expect([...BUG_BULK_STATUS_TARGETS]).toEqual(['in_progress', 'resolved', 'closed']);
  });

  test('aC20: more than 200 selected names the ceiling and how many to deselect', () => {
    expect(bugBulkSelectionProblem(200)).toBeNull();
    expect(bugBulkSelectionProblem(201)).toBe('You can bulk-edit at most 200 Bugs at a time. Deselect 1 to continue.');
  });

  test('aC21: the change is named exactly, and only Closed is irreversible', () => {
    expect(describeBugBulkChange({ field: 'status', status: 'in_progress' })).toBe('Set status to In progress');
    expect(describeBugBulkChange({ field: 'severity', severity: 'P1' })).toBe('Set severity to P1 Critical');
    expect(isIrreversibleBugBulkChange({ field: 'status', status: 'closed' })).toBe(true);
    expect(isIrreversibleBugBulkChange({ field: 'status', status: 'resolved' })).toBe(false);
    expect(isIrreversibleBugBulkChange({ field: 'severity', severity: 'P4' })).toBe(false);
  });

  test('the wire change carries one key named after the field', () => {
    expect(toBugBulkWireChange({ field: 'status', status: 'resolved' })).toEqual({ status: 'resolved' });
    expect(toBugBulkWireChange({ field: 'severity', severity: 'P2' })).toEqual({ severity: 'P2' });
  });

  test('aC22: refusals group by reason in a fixed order, unknown reasons read as write_failed', () => {
    const r = report([
      outcome('1', 'changed'),
      outcome('2', 'refused', 'status_transition_backward'),
      outcome('3', 'refused', 'stale_version'),
      outcome('4', 'refused', 'raw database text'),
      outcome('5', 'refused', 'status_transition_backward'),
    ]);
    expect(groupBugRefusals(r).map(g => [g.reason, g.outcomes.map(o => o.bug_id)])).toEqual([
      ['stale_version', ['3']],
      ['status_transition_backward', ['2', '5']],
      ['write_failed', ['4']],
    ]);
    expect(refusedBugIds(r)).toEqual(['2', '3', '4', '5']);
    expect(bugBulkReasonLabel('raw database text')).toBe('The write failed');
    expect(bugBulkReasonLabel('status_transition_skipped')).toContain('one stage at a time');
  });

  test('pluralBugs', () => {
    expect(pluralBugs(1)).toBe('1 Bug');
    expect(pluralBugs(3)).toBe('3 Bugs');
  });
});
