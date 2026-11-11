import { BULK_EDIT_CEILING } from '@lib/atcs/bulk-edit';
import { AtcBulkEditBodySchema } from '@lib/atcs/bulk-edit-validation';
import { describe, expect, test } from 'bun:test';

// BK-507 — the request gate. One field per request, `status` is not a field.

const project = '11111111-1111-4111-8111-111111111111';
const atc = '22222222-2222-4222-8222-222222222222';
const items = [{ id: atc, version: 3 }];

function parse(body: Record<string, unknown>) {
  return AtcBulkEditBodySchema.safeParse({ project_id: project, items, ...body });
}

describe('bulk-edit body', () => {
  test('accepts each of the four fields', () => {
    expect(parse({ field: 'tags', change: { op: 'add', tags: ['a'] } }).success).toBe(true);
    expect(parse({ field: 'tags', change: { op: 'remove', tags: ['a'] } }).success).toBe(true);
    expect(parse({ field: 'module', change: { module_id: project } }).success).toBe(true);
    expect(parse({ field: 'layer', change: { layer: 'API' } }).success).toBe(true);
    expect(parse({ field: 'priority', change: { priority: 'High' } }).success).toBe(true);
  });

  test('null clears the priority, but the key is required', () => {
    expect(parse({ field: 'priority', change: { priority: null } }).success).toBe(true);
    expect(parse({ field: 'priority', change: {} }).success).toBe(false);
  });

  test('rejects status, a tags replace, and any field outside the vocabulary', () => {
    expect(parse({ field: 'status', change: { status: 'passed' } }).success).toBe(false);
    expect(parse({ field: 'technique', change: { technique: 'Pairwise' } }).success).toBe(false);
    expect(parse({ field: 'tags', change: { op: 'replace', tags: ['a'] } }).success).toBe(false);
  });

  test('rejects an empty selection and one above the ceiling; the ceiling itself passes (E14)', () => {
    const change = { field: 'layer', change: { layer: 'UI' } };
    expect(parse({ ...change, items: [] }).success).toBe(false);
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    expect(parse({ ...change, items: make(BULK_EDIT_CEILING) }).success).toBe(true);
    expect(parse({ ...change, items: make(BULK_EDIT_CEILING + 1) }).success).toBe(false);
  });

  test('rejects bad values: layer, priority, tag count and length, non-uuid ids', () => {
    expect(parse({ field: 'layer', change: { layer: 'Mobile' } }).success).toBe(false);
    expect(parse({ field: 'priority', change: { priority: 'Urgent' } }).success).toBe(false);
    expect(parse({ field: 'tags', change: { op: 'add', tags: [] } }).success).toBe(false);
    expect(parse({ field: 'tags', change: { op: 'add', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) } }).success).toBe(false);
    expect(parse({ field: 'tags', change: { op: 'add', tags: ['x'.repeat(51)] } }).success).toBe(false);
    expect(parse({ field: 'layer', change: { layer: 'UI' }, items: [{ id: 'nope' }] }).success).toBe(false);
  });

  test('defaults dry_run to false and a missing version to null', () => {
    const parsed = AtcBulkEditBodySchema.parse({ project_id: project, items: [{ id: atc }], field: 'layer', change: { layer: 'UI' } });
    expect(parsed.dry_run).toBe(false);
    expect(parsed.items[0].version).toBeNull();
  });
});
