import type { BulkEditReport, BulkOutcome } from '@lib/atcs/bulk-edit';
import {
  BULK_EDIT_CEILING,
  BULK_REFUSAL_REASONS,
  bulkReasonLabel,
  bulkSelectionProblem,
  bulkTagsProblem,
  describeBulkChange,
  flattenModuleOptions,
  groupRefusals,
  normalizeBulkTag,
  parseBulkTagInput,
  pluralAtcs,
  refusedAtcIds,
  toWireChange,
} from '@lib/atcs/bulk-edit';
import { describe, expect, test } from 'bun:test';

// BK-507 — the pure vocabulary behind the bulk edit. What the database does with
// it is proved by bulk-edit-isolation.test.ts.

function outcome(id: string, kind: BulkOutcome['outcome'], reason: string | null = null): BulkOutcome {
  return { atc_id: id, slug: `m/atc-${id}`, title: `ATC ${id}`, outcome: kind, reason, version: 1 };
}

function report(outcomes: BulkOutcome[]): BulkEditReport {
  return {
    dry_run: false,
    field: 'layer',
    requested: outcomes.length,
    changed: outcomes.filter(o => o.outcome === 'changed').length,
    unchanged: outcomes.filter(o => o.outcome === 'unchanged').length,
    refused: outcomes.filter(o => o.outcome === 'refused').length,
    outcomes,
  };
}

describe('tag input (E7)', () => {
  test('normalises casing, spaces and duplicates the way the stored tags are', () => {
    expect(normalizeBulkTag('  Two   Words ')).toBe('two words');
    expect(parseBulkTagInput(' Smoke, smoke ,REGRESSION,, \n two  words ')).toEqual(['smoke', 'regression', 'two words']);
  });

  test('empty input yields no tags and is a problem; so is more than 10 or an over-long tag', () => {
    expect(parseBulkTagInput(' , ,')).toEqual([]);
    expect(bulkTagsProblem([])).toContain('at least one');
    expect(bulkTagsProblem(Array.from({ length: 11 }, (_, i) => `t${i}`))).toContain('at most 10');
    expect(bulkTagsProblem(['x'.repeat(51)])).toContain('50');
    expect(bulkTagsProblem(['ok'])).toBeNull();
  });
});

describe('selection ceiling (E14)', () => {
  test('refuses above the ceiling and names it; the ceiling itself is allowed', () => {
    expect(bulkSelectionProblem(BULK_EDIT_CEILING)).toBeNull();
    const message = bulkSelectionProblem(BULK_EDIT_CEILING + 3);
    expect(message).toContain(String(BULK_EDIT_CEILING));
    expect(message).toContain('Deselect 3');
  });
});

describe('describing the change', () => {
  test('names the exact change for each field', () => {
    expect(describeBulkChange({ field: 'tags', op: 'add', tags: ['a', 'b'] })).toBe('Add tags “a”, “b”');
    expect(describeBulkChange({ field: 'tags', op: 'remove', tags: ['a'] })).toBe('Remove tag “a”');
    expect(describeBulkChange({ field: 'module', moduleId: 'm1' }, 'root/auth')).toBe('Move to Module root/auth');
    expect(describeBulkChange({ field: 'layer', layer: 'API' })).toBe('Set layer to API');
    expect(describeBulkChange({ field: 'priority', priority: 'High' })).toBe('Set priority to High');
    expect(describeBulkChange({ field: 'priority', priority: null })).toBe('Clear the priority');
  });

  test('pluralises the count', () => {
    expect(pluralAtcs(1)).toBe('1 ATC');
    expect(pluralAtcs(12)).toBe('12 ATCs');
  });

  test('the wire change carries each field under the key the schema expects', () => {
    expect(toWireChange({ field: 'tags', op: 'add', tags: ['a'] })).toEqual({ op: 'add', tags: ['a'] });
    expect(toWireChange({ field: 'module', moduleId: 'm1' })).toEqual({ module_id: 'm1' });
    expect(toWireChange({ field: 'layer', layer: 'UI' })).toEqual({ layer: 'UI' });
    expect(toWireChange({ field: 'priority', priority: null })).toEqual({ priority: null });
  });
});

describe('reading a report', () => {
  const sample = report([
    outcome('1', 'changed'),
    outcome('2', 'unchanged'),
    outcome('3', 'refused', 'stale_version'),
    outcome('4', 'refused', 'archived'),
    outcome('5', 'refused', 'stale_version'),
    outcome('6', 'refused', 'something_new'),
  ]);

  test('groups refusals by reason in the vocabulary order; an unknown reason reads as a failed write', () => {
    const groups = groupRefusals(sample);
    expect(groups.map(g => g.reason)).toEqual(['stale_version', 'archived', 'write_failed']);
    expect(groups[0].outcomes.map(o => o.atc_id)).toEqual(['3', '5']);
    expect(groups[2].outcomes.map(o => o.atc_id)).toEqual(['6']);
  });

  test('lists the refused ids so the selection can narrow to them', () => {
    expect(refusedAtcIds(sample)).toEqual(['3', '4', '5', '6']);
  });

  test('every reason in the vocabulary has a label, and null or unknown falls back', () => {
    for (const reason of BULK_REFUSAL_REASONS) {
      expect(bulkReasonLabel(reason).length).toBeGreaterThan(0);
    }
    expect(bulkReasonLabel(null)).toBe(bulkReasonLabel('write_failed'));
    expect(bulkReasonLabel('nope')).toBe(bulkReasonLabel('write_failed'));
  });
});

describe('module options', () => {
  const node = (id: string, path: string, archived: string | null, children: unknown[] = []) => (
    { id, path, archived_at: archived, children } as never
  );

  test('flattens the live tree sorted by path and leaves archived Modules (and their subtree) out', () => {
    const tree = [
      node('r', 'root', null, [node('l', 'root/leaf', null), node('g', 'root/gone', '2026-01-01', [node('gg', 'root/gone/deep', null)])]),
      node('a', 'alpha', null),
    ];
    expect(flattenModuleOptions(tree)).toEqual([
      { id: 'a', path: 'alpha' },
      { id: 'r', path: 'root' },
      { id: 'l', path: 'root/leaf' },
    ]);
  });
});
