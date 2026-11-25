import { ApiError } from '@lib/api/error-envelope';
import { hasNonUuidId, pickBulkEditWorkspace, TEST_BULK_CEILING, TestBulkEditBodySchema } from '@lib/tests/bulk-edit';
import { mapTestBulkEditError } from '@lib/tests/errors';
import { describe, expect, it } from 'bun:test';

const ids = (n: number): string[] => Array.from({ length: n }, () => crypto.randomUUID());

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { test_ids: ids(1), mode: 'add', tags: ['smoke'], ...overrides };
}

function accepts(input: Record<string, unknown>): boolean {
  return TestBulkEditBodySchema.safeParse(input).success;
}

function captured(error: { code?: string, message: string }): ApiError {
  try {
    mapTestBulkEditError(error);
  }
  catch (err) {
    if (err instanceof ApiError) { return err; }
    throw err;
  }
}

describe('bK-2099 — TestBulkEditBodySchema', () => {
  it('accepts add and remove, defaults dry_run to false', () => {
    const parsed = TestBulkEditBodySchema.parse(body());
    expect(parsed.dry_run).toBe(false);
    expect(accepts(body({ mode: 'remove', dry_run: true }))).toBe(true);
  });

  it('refuses whole-set replace and any unknown mode', () => {
    expect(accepts(body({ mode: 'replace' }))).toBe(false);
    expect(accepts(body({ mode: 'ADD' }))).toBe(false);
  });

  it('refuses a body that carries an add set and a remove set (strict keys)', () => {
    expect(accepts({ test_ids: ids(1), add: ['a'], remove: ['b'] })).toBe(false);
    expect(accepts(body({ remove: ['b'] }))).toBe(false);
  });

  it('refuses an empty tag list, a blank tag, a comma and more than 20 tags', () => {
    expect(accepts(body({ tags: [] }))).toBe(false);
    expect(accepts(body({ tags: ['ok', '   '] }))).toBe(false);
    expect(accepts(body({ tags: ['a,b'] }))).toBe(false);
    expect(accepts(body({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))).toBe(false);
    expect(accepts(body({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }))).toBe(true);
  });

  it('enforces 50 characters after trimming: 49 and 50 pass, 51 fails', () => {
    expect(accepts(body({ tags: ['a'.repeat(49)] }))).toBe(true);
    expect(accepts(body({ tags: ['a'.repeat(50)] }))).toBe(true);
    expect(accepts(body({ tags: ['a'.repeat(51)] }))).toBe(false);
    expect(accepts(body({ tags: [`  ${'a'.repeat(50)}  `] }))).toBe(true);
    expect(TestBulkEditBodySchema.parse(body({ tags: ['  Login  '] })).tags).toEqual(['Login']);
  });

  it('counts code points, not UTF-16 units: 26 emoji pass, 51 emoji fail', () => {
    expect('😀'.repeat(26).length).toBe(52);
    expect(accepts(body({ tags: ['😀'.repeat(26)] }))).toBe(true);
    expect(accepts(body({ tags: ['😀'.repeat(50)] }))).toBe(true);
    expect(accepts(body({ tags: ['😀'.repeat(51)] }))).toBe(false);
  });

  it('applies the 200 ceiling to distinct ids: 199 and 200 pass, 201 fails, repeats are free', () => {
    expect(accepts(body({ test_ids: ids(TEST_BULK_CEILING - 1) }))).toBe(true);
    expect(accepts(body({ test_ids: ids(TEST_BULK_CEILING) }))).toBe(true);
    expect(accepts(body({ test_ids: ids(TEST_BULK_CEILING + 1) }))).toBe(false);
    const distinct = ids(TEST_BULK_CEILING);
    expect(accepts(body({ test_ids: [...distinct, ...distinct.slice(0, 50)] }))).toBe(true);
    const one = crypto.randomUUID();
    expect(accepts(body({ test_ids: [...ids(TEST_BULK_CEILING), one.toUpperCase(), one] }))).toBe(false);
  });

  it('refuses an empty selection and a raw list over 1000 entries', () => {
    expect(accepts(body({ test_ids: [] }))).toBe(false);
    const one = crypto.randomUUID();
    expect(accepts(body({ test_ids: Array.from({ length: 1001 }, () => one) }))).toBe(false);
  });
});

describe('bK-2099 — hasNonUuidId', () => {
  it('flags a raw body whose test_ids hold a non-UUID string, and nothing else', () => {
    expect(hasNonUuidId({ test_ids: ids(3) })).toBe(false);
    expect(hasNonUuidId({ test_ids: [...ids(2), 'not-a-uuid'], tags: [] })).toBe(true);
    expect(hasNonUuidId({ test_ids: 'not-an-array' })).toBe(false);
    expect(hasNonUuidId(null)).toBe(false);
    expect(hasNonUuidId([1, 2])).toBe(false);
  });
});

describe('bK-2099 — pickBulkEditWorkspace', () => {
  const ws = crypto.randomUUID();
  const other = crypto.randomUUID();

  it('a cookie session uses the body value, else the active-workspace cookie', () => {
    expect(pickBulkEditWorkspace(ws, { via: 'cookie', workspaceId: null })).toEqual({ kind: 'workspace', workspaceId: ws });
    expect(pickBulkEditWorkspace(undefined, { via: 'cookie', workspaceId: null })).toEqual({ kind: 'active_cookie' });
  });

  it('a scoped PAT uses its own workspace and refuses another one', () => {
    expect(pickBulkEditWorkspace(undefined, { via: 'bearer', workspaceId: ws })).toEqual({ kind: 'workspace', workspaceId: ws });
    expect(pickBulkEditWorkspace(ws.toUpperCase(), { via: 'bearer', workspaceId: ws })).toEqual({ kind: 'workspace', workspaceId: ws.toUpperCase() });
    expect(pickBulkEditWorkspace(other, { via: 'bearer', workspaceId: ws })).toEqual({ kind: 'token_workspace_mismatch' });
  });

  it('an unscoped PAT must name the workspace', () => {
    expect(pickBulkEditWorkspace(ws, { via: 'bearer', workspaceId: null })).toEqual({ kind: 'workspace', workspaceId: ws });
    expect(pickBulkEditWorkspace(undefined, { via: 'bearer', workspaceId: null })).toEqual({ kind: 'workspace_required' });
  });
});

describe('bK-2099 — mapTestBulkEditError', () => {
  it('42501 → 403 forbidden with insufficient_role', () => {
    const err = captured({ code: '42501', message: 'forbidden' });
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'insufficient_role' });
  });

  it('45129 and 45130 → 422 validation_failed with a named reason', () => {
    const selection = captured({ code: '45129', message: 'bulk_selection_invalid' });
    expect(selection.status).toBe(422);
    expect(selection.details).toEqual({ reason: 'bulk_selection_invalid' });
    const change = captured({ code: '45130', message: 'bulk_change_invalid' });
    expect(change.status).toBe(422);
    expect(change.details).toEqual({ reason: 'bulk_change_invalid' });
  });

  it('an unknown error never echoes database text', () => {
    const unknown = captured({ code: 'XX000', message: 'relation "public.tests" secret detail' });
    expect(unknown.status).toBe(500);
    expect(unknown.message).not.toContain('public.tests');
  });
});
