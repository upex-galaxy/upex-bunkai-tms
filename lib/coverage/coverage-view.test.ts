import type { CoverageModule, CoverageNoCoverageItem } from '@lib/coverage/coverage-view';
import {
  buildNoCoverageDisplayList,
  coverageBarFractions,
  coverageFractionLabel,
  COVERAGE_EMPTY_NO_ACS_DESCRIPTION,
  COVERAGE_EMPTY_NO_ACS_TITLE,
  filterModulesBySegment,
  hasNoCoverageGaps,
  moduleBoundCount,
  moduleFilterMetaText,
  noCoverageTotalCount,
  percentLabel,
  resolveCoverageEmptyState,
  resolveModuleStatusChip,
  segmentCounts,
} from '@lib/coverage/coverage-view';
import { describe, expect, test } from 'bun:test';

// BK-46 — Project Coverage view-state logic. Fixture modules mirror
// metrics-dashboard.html's own 8 demo rows (MOD-001..MOD-008) so the segment
// filter and chip-label tests are checked against the SAME data/counts the
// shipped mockup shows ("8 of 8" all, "Coverage gaps 4", "Never run 5").

const MOD_001_FULLY_COVERED: CoverageModule = {
  module_id: 'mod-001', module_name: 'Authentication', ac_total: 12, ac_uncovered: 0, ac_not_run: 0, ac_executed: 12, status: 'fully_covered',
};
const MOD_002_MIXED: CoverageModule = {
  module_id: 'mod-002', module_name: 'Checkout', ac_total: 16, ac_uncovered: 2, ac_not_run: 3, ac_executed: 11, status: 'uncovered',
};
const MOD_003_BOUND_NEVER_RUN: CoverageModule = {
  module_id: 'mod-003', module_name: 'Search', ac_total: 6, ac_uncovered: 0, ac_not_run: 6, ac_executed: 0, status: 'not_run',
};
const MOD_004_MIXED: CoverageModule = {
  module_id: 'mod-004', module_name: 'User Profile', ac_total: 10, ac_uncovered: 2, ac_not_run: 1, ac_executed: 7, status: 'uncovered',
};
const MOD_005_NO_COVERAGE: CoverageModule = {
  module_id: 'mod-005', module_name: 'Notifications', ac_total: 8, ac_uncovered: 8, ac_not_run: 0, ac_executed: 0, status: 'uncovered',
};
const MOD_006_FULLY_COVERED: CoverageModule = {
  module_id: 'mod-006', module_name: 'Billing', ac_total: 9, ac_uncovered: 0, ac_not_run: 0, ac_executed: 9, status: 'fully_covered',
};
const MOD_007_MIXED: CoverageModule = {
  module_id: 'mod-007', module_name: 'Audit Export', ac_total: 9, ac_uncovered: 5, ac_not_run: 2, ac_executed: 2, status: 'uncovered',
};
const MOD_008_PARTIAL_NEVER_RUN: CoverageModule = {
  module_id: 'mod-008', module_name: 'Session Management', ac_total: 5, ac_uncovered: 0, ac_not_run: 2, ac_executed: 3, status: 'not_run',
};

const MOCKUP_MODULES: CoverageModule[] = [
  MOD_001_FULLY_COVERED,
  MOD_002_MIXED,
  MOD_003_BOUND_NEVER_RUN,
  MOD_004_MIXED,
  MOD_005_NO_COVERAGE,
  MOD_006_FULLY_COVERED,
  MOD_007_MIXED,
  MOD_008_PARTIAL_NEVER_RUN,
];

const MOD_NO_ACS: CoverageModule = {
  module_id: 'mod-009', module_name: 'Empty Module', ac_total: 0, ac_uncovered: 0, ac_not_run: 0, ac_executed: 0, status: 'no_acs',
};

describe('moduleBoundCount', () => {
  test('bound = not_run + executed, excluding uncovered', () => {
    expect(moduleBoundCount(MOD_002_MIXED)).toBe(14); // 16 total - 2 uncovered
    expect(moduleBoundCount(MOD_005_NO_COVERAGE)).toBe(0);
    expect(moduleBoundCount(MOD_001_FULLY_COVERED)).toBe(12);
  });
});

describe('segment filter — matches the mockup\'s applyFilter exactly', () => {
  test('"all" always matches every module', () => {
    expect(filterModulesBySegment(MOCKUP_MODULES, 'all')).toHaveLength(8);
  });

  test('"gaps" = ac_uncovered > 0 — matches mockup\'s count of 4 (MOD-002/004/005/007)', () => {
    const gaps = filterModulesBySegment(MOCKUP_MODULES, 'gaps');
    expect(gaps.map(m => m.module_id).sort()).toEqual(['mod-002', 'mod-004', 'mod-005', 'mod-007']);
  });

  test('"notrun" = ac_not_run > 0 AND bound > 0 — matches mockup\'s count of 5 (MOD-002/003/004/007/008)', () => {
    const notrun = filterModulesBySegment(MOCKUP_MODULES, 'notrun');
    expect(notrun.map(m => m.module_id).sort()).toEqual(['mod-002', 'mod-003', 'mod-004', 'mod-007', 'mod-008']);
  });

  test('gaps and notrun OVERLAP — a module can match both simultaneously (not mutually exclusive)', () => {
    expect(filterModulesBySegment(MOCKUP_MODULES, 'gaps').some(m => m.module_id === 'mod-002')).toBe(true);
    expect(filterModulesBySegment(MOCKUP_MODULES, 'notrun').some(m => m.module_id === 'mod-002')).toBe(true);
  });

  test('a fully-unbound module (bound = 0) never matches "notrun", even with ac_not_run somehow set', () => {
    const impossibleButDefensive: CoverageModule = { ...MOD_005_NO_COVERAGE, ac_not_run: 0 };
    expect(filterModulesBySegment([impossibleButDefensive], 'notrun')).toHaveLength(0);
  });
});

describe('segmentCounts', () => {
  test('matches the mockup\'s three filter-button counts: All 8, Coverage gaps 4, Never run 5', () => {
    expect(segmentCounts(MOCKUP_MODULES)).toEqual({ all: 8, gaps: 4, notrun: 5 });
  });
});

describe('moduleFilterMetaText', () => {
  test('mirrors the mockup\'s "N of M modules" copy', () => {
    expect(moduleFilterMetaText(4, 8)).toBe('4 of 8 modules');
    expect(moduleFilterMetaText(8, 8)).toBe('8 of 8 modules');
  });
});

describe('resolveModuleStatusChip', () => {
  test('fully covered (bound = total, zero not_run) -> "Fully covered", pass', () => {
    expect(resolveModuleStatusChip(MOD_001_FULLY_COVERED)).toEqual({ label: 'Fully covered', tone: 'pass' });
    expect(resolveModuleStatusChip(MOD_006_FULLY_COVERED)).toEqual({ label: 'Fully covered', tone: 'pass' });
  });

  test('entirely unbound (bound = 0, some ACs exist) -> "No coverage", fail — NOT "N uncovered"', () => {
    expect(resolveModuleStatusChip(MOD_005_NO_COVERAGE)).toEqual({ label: 'No coverage', tone: 'fail' });
  });

  test('partially uncovered (bound > 0, ac_uncovered > 0) -> "N uncovered", fail', () => {
    expect(resolveModuleStatusChip(MOD_002_MIXED)).toEqual({ label: '2 uncovered', tone: 'fail' });
    expect(resolveModuleStatusChip(MOD_004_MIXED)).toEqual({ label: '2 uncovered', tone: 'fail' });
    expect(resolveModuleStatusChip(MOD_007_MIXED)).toEqual({ label: '5 uncovered', tone: 'fail' });
  });

  test('bound, zero uncovered, ALL bound ACs never-run -> "Bound, never run", skipped', () => {
    expect(resolveModuleStatusChip(MOD_003_BOUND_NEVER_RUN)).toEqual({ label: 'Bound, never run', tone: 'skipped' });
  });

  test('bound, zero uncovered, SOME (not all) bound ACs never-run -> "N never run", skipped', () => {
    expect(resolveModuleStatusChip(MOD_008_PARTIAL_NEVER_RUN)).toEqual({ label: '2 never run', tone: 'skipped' });
  });

  test('a module with zero ACs (no_acs) gets its own distinct, neutral chip — not in the mockup, ATP Group 5 #1', () => {
    expect(resolveModuleStatusChip(MOD_NO_ACS)).toEqual({ label: 'No ACs yet', tone: 'neutral' });
  });
});

describe('coverageBarFractions', () => {
  test('MOD-002: 11 executed, 3 not_run, 2 unbound of 16 -> matches mockup\'s bar widths (68.7% / 18.8%)', () => {
    const f = coverageBarFractions(MOD_002_MIXED);
    expect(f.executed).toBeCloseTo(11 / 16, 5);
    expect(f.notRun).toBeCloseTo(3 / 16, 5);
  });

  test('a zero-total module renders zero fractions, not NaN/Infinity', () => {
    expect(coverageBarFractions(MOD_NO_ACS)).toEqual({ executed: 0, notRun: 0 });
  });
});

describe('coverageFractionLabel', () => {
  test('"bound / total" for a real module', () => {
    expect(coverageFractionLabel(MOD_002_MIXED)).toBe('14 / 16');
    expect(coverageFractionLabel(MOD_001_FULLY_COVERED)).toBe('12 / 12');
  });

  test('a zero-total module renders "—", not "0 / 0"', () => {
    expect(coverageFractionLabel(MOD_NO_ACS)).toBe('—');
  });
});

describe('percentLabel', () => {
  test('rounds to the nearest whole percent', () => {
    expect(percentLabel(1, 3)).toBe('33%');
    expect(percentLabel(2, 3)).toBe('67%');
    expect(percentLabel(9, 9)).toBe('100%');
  });

  test('a zero denominator renders "—", never "0%" or NaN', () => {
    expect(percentLabel(0, 0)).toBe('—');
  });
});

describe('buildNoCoverageDisplayList', () => {
  const noCoverageItems: CoverageNoCoverageItem[] = [
    // MOD-005 is entirely unbound (moduleBoundCount === 0) — all 3 of its
    // uncovered ACs here should collapse into ONE module-level entry.
    { ac_id: 'ac-1', ac_title: 'Push token registers on first launch', user_story_id: 'us-1', user_story_title: 'Push notifications', module_id: 'mod-005', module_name: 'Notifications' },
    { ac_id: 'ac-2', ac_title: 'Digest email respects quiet hours', user_story_id: 'us-1', user_story_title: 'Push notifications', module_id: 'mod-005', module_name: 'Notifications' },
    { ac_id: 'ac-3', ac_title: 'Unsubscribe link is one-click', user_story_id: 'us-2', user_story_title: 'Email preferences', module_id: 'mod-005', module_name: 'Notifications' },
    // MOD-002 and MOD-004 are only PARTIALLY uncovered (moduleBoundCount > 0)
    // — their uncovered ACs each get their OWN individual entry.
    { ac_id: 'ac-4', ac_title: 'Export audit log as CSV', user_story_id: 'us-112', user_story_title: 'Audit export', module_id: 'mod-002', module_name: 'Checkout' },
    { ac_id: 'ac-5', ac_title: 'Reject avatar uploads over 5 MB', user_story_id: 'us-110', user_story_title: 'Avatar upload', module_id: 'mod-004', module_name: 'User Profile' },
  ];

  test('an entirely-unbound module collapses to ONE summary entry with the right AC count', () => {
    const list = buildNoCoverageDisplayList(noCoverageItems, MOCKUP_MODULES);
    const moduleEntry = list.find(e => e.kind === 'module');
    expect(moduleEntry).toEqual({ kind: 'module', moduleId: 'mod-005', moduleName: 'Notifications', acCount: 3 });
  });

  test('a partially-bound module\'s uncovered ACs each get their own individual entry', () => {
    const list = buildNoCoverageDisplayList(noCoverageItems, MOCKUP_MODULES);
    const acEntries = list.filter(e => e.kind === 'ac');
    expect(acEntries).toHaveLength(2);
    expect(acEntries.map(e => e.kind === 'ac' ? e.acId : null).sort()).toEqual(['ac-4', 'ac-5']);
  });

  test('total entries = 1 module summary + 2 individual ACs, not 5 flat rows', () => {
    const list = buildNoCoverageDisplayList(noCoverageItems, MOCKUP_MODULES);
    expect(list).toHaveLength(3);
  });

  test('an empty no_coverage list produces an empty display list', () => {
    expect(buildNoCoverageDisplayList([], MOCKUP_MODULES)).toEqual([]);
  });
});

describe('noCoverageTotalCount / hasNoCoverageGaps', () => {
  test('counts every itemized uncovered AC, including ones collapsed into a module summary', () => {
    const items: CoverageNoCoverageItem[] = [
      { ac_id: 'a', ac_title: 't', user_story_id: 'u', user_story_title: 'ut', module_id: 'm', module_name: 'mn' },
      { ac_id: 'b', ac_title: 't', user_story_id: 'u', user_story_title: 'ut', module_id: 'm', module_name: 'mn' },
    ];
    expect(noCoverageTotalCount(items)).toBe(2);
    expect(hasNoCoverageGaps(items)).toBe(true);
  });

  test('an empty list has no gaps', () => {
    expect(noCoverageTotalCount([])).toBe(0);
    expect(hasNoCoverageGaps([])).toBe(false);
  });
});

describe('resolveCoverageEmptyState', () => {
  test('ac_total = 0 -> empty-no-acs (ATP Group 5 #2)', () => {
    expect(resolveCoverageEmptyState({ ac_total: 0 })).toBe('empty-no-acs');
  });

  test('ac_total > 0 -> has-data, even if every AC is uncovered', () => {
    expect(resolveCoverageEmptyState({ ac_total: 8 })).toBe('has-data');
  });

  test('the empty-state copy constants are non-empty, distinct strings', () => {
    expect(COVERAGE_EMPTY_NO_ACS_TITLE.length).toBeGreaterThan(0);
    expect(COVERAGE_EMPTY_NO_ACS_DESCRIPTION.length).toBeGreaterThan(0);
    expect(COVERAGE_EMPTY_NO_ACS_TITLE).not.toBe(COVERAGE_EMPTY_NO_ACS_DESCRIPTION);
  });
});
