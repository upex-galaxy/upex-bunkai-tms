import { BugBulkEditBodySchema } from '@lib/bugs/bulk-edit-validation';
import { describe, expect, test } from 'bun:test';

// BK-2098 AC13 and AC14 — the request schema, the first gate (T5).

const PROJECT = '11111111-1111-4111-8111-111111111111';
const BUG = '22222222-2222-4222-8222-222222222222';

function body(overrides: Record<string, unknown> = {}) {
  return { project_id: PROJECT, field: 'status', change: { status: 'in_progress' }, items: [{ id: BUG }], ...overrides };
}

describe('bugBulkEditBodySchema', () => {
  test('accepts a status and a severity request, defaulting dry_run to false and version to null', () => {
    expect(BugBulkEditBodySchema.parse(body())).toEqual({
      project_id: PROJECT,
      field: 'status',
      change: { status: 'in_progress' },
      items: [{ id: BUG, version: null }],
      dry_run: false,
    });
    expect(BugBulkEditBodySchema.parse(body({ field: 'severity', change: { severity: 'P2' }, items: [{ id: BUG, version: 3 }], dry_run: true })).items[0].version).toBe(3);
  });

  test('accepts exactly 200 items and repeated ids (the database evaluates each id once)', () => {
    expect(BugBulkEditBodySchema.safeParse(body({ items: Array.from({ length: 200 }, () => ({ id: BUG })) })).success).toBe(true);
  });

  test.each([
    ['an empty items list', body({ items: [] })],
    ['201 items', body({ items: Array.from({ length: 201 }, () => ({ id: BUG })) })],
    ['a non-UUID id', body({ items: [{ id: 'nope' }] })],
    ['a non-UUID project_id', body({ project_id: 'nope' })],
    ['a field other than status or severity', body({ field: 'title', change: { title: 'x' } })],
    ['a change carrying both fields', body({ change: { status: 'in_progress', severity: 'P1' } })],
    ['a change with an extra key', body({ change: { status: 'in_progress', note: 'x' } })],
    ['a status outside the lifecycle', body({ change: { status: 'done' } })],
    ['a severity outside P1 to P4', body({ field: 'severity', change: { severity: 'P5' } })],
    ['a missing change value', body({ change: {} })],
    ['a severity change sent with field status', body({ change: { severity: 'P1' } })],
    ['an unknown top-level key', body({ workspace_id: PROJECT })],
    ['an item with an unknown key', body({ items: [{ id: BUG, title: 'x' }] })],
    ['a version below 1', body({ items: [{ id: BUG, version: 0 }] })],
  ])('rejects %s', (_label, input) => {
    expect(BugBulkEditBodySchema.safeParse(input).success).toBe(false);
  });
});
