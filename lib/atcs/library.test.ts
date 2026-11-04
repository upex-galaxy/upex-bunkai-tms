import { describe, expect, test } from 'bun:test';
import { archivedAtcSource, archivedParentNotes, buildArchivedAtcRows, buildAtcLibraryRows, countAtcsInWorkspace, countDistinctTestsPerAtc, isArchivedOnOwn, resolveAtcLibraryViewState } from './library';

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

// BK-571 — the archived view lists only what was archived on its own.
const OWN = '2026-08-20T10:00:00.123456+00:00';
const CASCADE = '2026-08-21T09:30:00.654321+00:00';

describe('isArchivedOnOwn / archivedAtcSource', () => {
  test('both parents live: the ATC was archived on its own', () => {
    const stamps = { atcArchivedAt: OWN, moduleArchivedAt: null, storyArchivedAt: null };
    expect(isArchivedOnOwn(stamps)).toBe(true);
    expect(archivedAtcSource(stamps)).toBe('own');
  });

  test('a Module cascade stamps the same instant: not an own archive', () => {
    const stamps = { atcArchivedAt: CASCADE, moduleArchivedAt: CASCADE, storyArchivedAt: null };
    expect(isArchivedOnOwn(stamps)).toBe(false);
    expect(archivedAtcSource(stamps)).toBe('module');
  });

  test('a User Story cascade stamps the same instant: not an own archive', () => {
    const stamps = { atcArchivedAt: CASCADE, moduleArchivedAt: null, storyArchivedAt: CASCADE };
    expect(isArchivedOnOwn(stamps)).toBe(false);
    expect(archivedAtcSource(stamps)).toBe('user_story');
  });

  test('an own archive with a parent archived LATER stays an own archive', () => {
    const stamps = { atcArchivedAt: OWN, moduleArchivedAt: CASCADE, storyArchivedAt: CASCADE };
    expect(isArchivedOnOwn(stamps)).toBe(true);
  });

  test('compares raw strings: instants that differ only in microseconds are different', () => {
    const a = '2026-08-21T09:30:00.654321+00:00';
    const b = '2026-08-21T09:30:00.654999+00:00';
    // As `Date`s these are the same millisecond, which would hide an own archive.
    expect(new Date(a).getTime()).toBe(new Date(b).getTime());
    expect(isArchivedOnOwn({ atcArchivedAt: a, moduleArchivedAt: b, storyArchivedAt: null })).toBe(true);
  });
});

describe('archivedParentNotes', () => {
  const base = { moduleName: 'Auth', moduleArchivedAt: null, storyLabel: 'BK-100', storyArchivedAt: null, archivedCriteriaTitles: [] };

  test('no note when nothing above the ATC is archived', () => {
    expect(archivedParentNotes(base)).toEqual([]);
  });

  test('names each archived parent and criterion', () => {
    expect(archivedParentNotes({ ...base, moduleArchivedAt: CASCADE })).toEqual(['Module "Auth" is archived.']);
    expect(archivedParentNotes({ ...base, storyArchivedAt: CASCADE })).toEqual(['User Story "BK-100" is archived.']);
    expect(archivedParentNotes({ ...base, archivedCriteriaTitles: ['AC-3'] })).toEqual(['Acceptance Criterion "AC-3" is archived.']);
  });

  test('lists them all when several are archived', () => {
    expect(archivedParentNotes({ ...base, moduleArchivedAt: CASCADE, storyArchivedAt: CASCADE, archivedCriteriaTitles: ['AC-1', 'AC-2'] })).toEqual([
      'Module "Auth" is archived.',
      'User Story "BK-100" is archived.',
      'Acceptance Criterion "AC-1" is archived.',
      'Acceptance Criterion "AC-2" is archived.',
    ]);
  });
});

describe('buildArchivedAtcRows', () => {
  function archived(over: Record<string, unknown> = {}) {
    return {
      id: 'a1',
      slug: 'auth/atc-001',
      title: 'Login happy path',
      layer: 'UI',
      archived_at: OWN,
      archived_by: 'u1',
      projects: { name: 'Checkout', slug: 'checkout' },
      modules: { name: 'Auth', archived_at: null },
      user_stories: { external_id: 'BK-100', title: 'Login', archived_at: null },
      atc_acceptance_criteria: [{ acceptance_criteria: { title: 'AC-3', position: 3, archived_at: null } }],
      ...over,
    } as Parameters<typeof buildArchivedAtcRows>[0][number];
  }
  const actors = new Map<string, string | null>([['u1', 'ada@acme.test'], ['u2', null]]);

  test('maps the row and resolves the actor', () => {
    const [row] = buildArchivedAtcRows([archived()], actors);
    expect(row).toMatchObject({
      code: 'atc-001',
      projectName: 'Checkout',
      moduleName: 'Auth',
      storyLabel: 'BK-100',
      acLabel: 'AC-3',
      archivedAt: OWN,
      archivedByLabel: 'ada@acme.test',
      notes: [],
    });
  });

  test('keeps the own archive of all four shapes and drops both cascades', () => {
    const rows = buildArchivedAtcRows([
      archived({ id: 'live-parents' }),
      archived({ id: 'module-cascade', archived_at: CASCADE, modules: { name: 'Auth', archived_at: CASCADE } }),
      archived({ id: 'story-cascade', archived_at: CASCADE, user_stories: { external_id: 'BK-100', title: 'Login', archived_at: CASCADE } }),
      archived({ id: 'own-then-parent', modules: { name: 'Auth', archived_at: CASCADE } }),
    ], actors);
    expect(rows.map(r => r.id).sort()).toEqual(['live-parents', 'own-then-parent']);
  });

  test('a later-archived parent is named in a note', () => {
    const [row] = buildArchivedAtcRows([archived({ modules: { name: 'Auth', archived_at: CASCADE } })], actors);
    expect(row.notes).toEqual(['Module "Auth" is archived.']);
  });

  test('an archived bound criterion is named, and still shows in the anchor', () => {
    const [row] = buildArchivedAtcRows([archived({
      atc_acceptance_criteria: [{ acceptance_criteria: { title: 'AC-9', position: 1, archived_at: CASCADE } }],
    })], actors);
    expect(row.notes).toEqual(['Acceptance Criterion "AC-9" is archived.']);
    expect(row.acLabel).toBe('AC-9');
  });

  test('a null archived_by, an unresolved id and a null email all read Unknown', () => {
    const rows = buildArchivedAtcRows([
      archived({ id: 'a', archived_by: null }),
      archived({ id: 'b', archived_by: 'gone' }),
      archived({ id: 'c', archived_by: 'u2' }),
    ], actors);
    expect(rows.map(r => r.archivedByLabel)).toEqual(['Unknown', 'Unknown', 'Unknown']);
  });

  test('lists the most recently archived first', () => {
    const rows = buildArchivedAtcRows([
      archived({ id: 'old', archived_at: OWN }),
      archived({ id: 'new', archived_at: '2026-09-01T00:00:00.000000+00:00' }),
    ], actors);
    expect(rows.map(r => r.id)).toEqual(['new', 'old']);
  });
});
