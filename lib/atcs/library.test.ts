import { describe, expect, test } from 'bun:test';
import { buildAtcLibraryRows, countAtcsInWorkspace, countDistinctTestsPerAtc, resolveAtcLibraryViewState } from './library';

function atc(over: Partial<Parameters<typeof buildAtcLibraryRows>[0][number]> = {}) {
  return {
    id: 'a1',
    slug: 'auth/atc-001',
    title: 'Login happy path',
    layer: 'UI',
    projects: { name: 'Checkout', slug: 'checkout' },
    modules: { name: 'Auth' },
    user_stories: { external_id: 'BK-100', title: 'Login' },
    atc_acceptance_criteria: [{ acceptance_criteria: { title: 'AC-3', position: 3, archived_at: null } }],
    ...over,
  };
}

describe('buildAtcLibraryRows', () => {
  test('maps every row field', () => {
    const [row] = buildAtcLibraryRows([atc()], new Map([['a1', 4]]));
    expect(row).toMatchObject({
      code: 'atc-001',
      title: 'Login happy path',
      layer: 'UI',
      projectName: 'Checkout',
      projectSlug: 'checkout',
      moduleName: 'Auth',
      storyLabel: 'BK-100',
      acLabel: 'AC-3',
      usedInTests: 4,
    });
  });

  test('used-in defaults to 0 when no Test references the ATC', () => {
    expect(buildAtcLibraryRows([atc()], new Map())[0].usedInTests).toBe(0);
  });

  test('anchors to first AC by position and notes extras, skipping archived', () => {
    const [row] = buildAtcLibraryRows([atc({
      atc_acceptance_criteria: [
        { acceptance_criteria: { title: 'AC-2', position: 2, archived_at: null } },
        { acceptance_criteria: { title: 'AC-1', position: 1, archived_at: null } },
        { acceptance_criteria: { title: 'AC-0', position: 0, archived_at: '2026-01-01' } },
      ],
    })], new Map());
    expect(row.acLabel).toBe('AC-1 +1');
  });

  test('falls back to story title and null AC label', () => {
    const [row] = buildAtcLibraryRows([atc({ user_stories: { external_id: null, title: 'Login' }, atc_acceptance_criteria: [] })], new Map());
    expect(row.storyLabel).toBe('Login');
    expect(row.acLabel).toBeNull();
  });

  test('sorts by Project name then ATC code', () => {
    const rows = buildAtcLibraryRows([
      atc({ id: '1', slug: 'b', projects: { name: 'Z', slug: 'z' } }),
      atc({ id: '2', slug: 'b', projects: { name: 'A', slug: 'a' } }),
      atc({ id: '3', slug: 'a', projects: { name: 'A', slug: 'a' } }),
    ], new Map());
    expect(rows.map(r => r.id)).toEqual(['3', '2', '1']);
  });
});

describe('countDistinctTestsPerAtc', () => {
  test('counts distinct Tests, not steps', () => {
    const m = countDistinctTestsPerAtc([
      { atc_id: 'a', test_id: 't1' },
      { atc_id: 'a', test_id: 't1' },
      { atc_id: 'a', test_id: 't2' },
      { atc_id: 'b', test_id: 't1' },
    ]);
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(1);
  });
});

describe('resolveAtcLibraryViewState', () => {
  test('empty vs list', () => {
    expect(resolveAtcLibraryViewState(0)).toBe('empty');
    expect(resolveAtcLibraryViewState(1)).toBe('list');
  });
});

describe('countAtcsInWorkspace', () => {
  function fakeDb(result: { count: number | null, error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = async () => Promise.resolve(result);
    return chain as never;
  }
  test('returns the count', async () => {
    expect(await countAtcsInWorkspace(fakeDb({ count: 5, error: null }), 'w')).toBe(5);
  });
  test('returns null on error so the badge is hidden', async () => {
    expect(await countAtcsInWorkspace(fakeDb({ count: null, error: { message: 'x' } }), 'w')).toBeNull();
  });
});
