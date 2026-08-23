import { describe, expect, test } from 'bun:test';

import { isRepoOnlyPath } from './updater-core.ts';
import { groupIgnoreLines, ignoreLineStem } from './updater-ignore.ts';

// A gitignore re-include ladder in this repo's shape (`.context/PBI/` cache:
// exclude everything, re-include the committed allowlist) — the case the
// grouping exists for.
const PBI_LADDER = [
  '.context/PBI/*',
  '!.context/PBI/README.md',
  '!.context/PBI/templates/',
];

describe('ignoreLineStem', () => {
  test('strips the leading negation', () => {
    expect(ignoreLineStem('!.context/PBI/README.md')).toBe('.context/PBI/README.md');
  });

  test('strips trailing glob segments and slashes', () => {
    expect(ignoreLineStem('.context/PBI/*')).toBe('.context/PBI');
    expect(ignoreLineStem('.context/PBI/epics/*/*')).toBe('.context/PBI/epics');
    expect(ignoreLineStem('!.context/PBI/templates/')).toBe('.context/PBI/templates');
    expect(ignoreLineStem('dist/**')).toBe('dist');
  });

  test('keeps mid-path globs (still prefix-comparable)', () => {
    expect(ignoreLineStem('!.context/PBI/epics/*/evidence/')).toBe('.context/PBI/epics/*/evidence');
  });
});

describe('groupIgnoreLines', () => {
  test('the PBI gitignore ladder collapses into ONE atomic group', () => {
    const groups = groupIgnoreLines(PBI_LADDER);
    expect(groups).toHaveLength(1);
    expect(groups[0].atomic).toBe(true);
    expect(groups[0].lines).toEqual(PBI_LADDER);
  });

  test('a deeper multi-level ladder still collapses into one atomic group', () => {
    const deep = [
      '.context/PBI/*',
      '!.context/PBI/README.md',
      '!.context/PBI/templates/',
      '!.context/PBI/epics/',
      '.context/PBI/epics/*',
      '!.context/PBI/epics/*/',
    ];
    const groups = groupIgnoreLines(deep);
    expect(groups).toHaveLength(1);
    expect(groups[0].atomic).toBe(true);
    expect(groups[0].lines).toEqual(deep);
  });

  test('unrelated single lines stay individual and non-atomic', () => {
    const groups = groupIgnoreLines(['node_modules/', 'dist/', '.env']);
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      expect(g.atomic).toBe(false);
      expect(g.lines).toHaveLength(1);
    }
  });

  test('a ladder between unrelated lines groups only the ladder', () => {
    const lines = ['node_modules/', ...PBI_LADDER, '.env'];
    const groups = groupIgnoreLines(lines);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ lines: ['node_modules/'], atomic: false });
    expect(groups[1]).toEqual({ lines: PBI_LADDER, atomic: true });
    expect(groups[2]).toEqual({ lines: ['.env'], atomic: false });
  });

  test('a pattern followed by an unrelated negation does not group', () => {
    const groups = groupIgnoreLines(['dist/', '!coverage/keep.md']);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => !g.atomic)).toBe(true);
  });

  test('consecutive prefix-sharing patterns WITHOUT a negation stay individual', () => {
    // No re-include ladder involved — grouping them all-or-nothing would only
    // remove choice, not prevent corruption.
    const groups = groupIgnoreLines(['dist/', 'dist/assets/*']);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => !g.atomic && g.lines.length === 1)).toBe(true);
  });

  test('a minimal pattern + negation pair is atomic', () => {
    const groups = groupIgnoreLines(['reports/*', '!reports/README.md']);
    expect(groups).toHaveLength(1);
    expect(groups[0].atomic).toBe(true);
    expect(groups[0].lines).toEqual(['reports/*', '!reports/README.md']);
  });

  test('preserves input order across groups', () => {
    const lines = ['a/*', '!a/keep', 'zzz.log', 'b/*', '!b/keep'];
    const groups = groupIgnoreLines(lines);
    expect(groups.map(g => g.lines).flat()).toEqual(lines);
    expect(groups).toHaveLength(3);
    expect(groups[0].atomic).toBe(true);
    expect(groups[1].atomic).toBe(false);
    expect(groups[2].atomic).toBe(true);
  });

  test('empty input yields no groups', () => {
    expect(groupIgnoreLines([])).toEqual([]);
  });
});

// isRepoOnlyPath lives in updater-core.ts; its tests sit here because this
// batch's file partition owns no updater-core.test.ts (path-matching semantics
// belong to the same hardening bundle as the grouping above).
describe('isRepoOnlyPath', () => {
  const prefixes = ['.context/business'];

  test('matches the prefix itself', () => {
    expect(isRepoOnlyPath('.context/business', prefixes)).toBe(true);
  });

  test('matches anything beneath the prefix', () => {
    expect(isRepoOnlyPath('.context/business/business-data-map.md', prefixes)).toBe(true);
    expect(isRepoOnlyPath('.context/business/nested/deep.md', prefixes)).toBe(true);
  });

  test('leaves siblings alone', () => {
    // The bug this guards: a naive startsWith would swallow all three.
    expect(isRepoOnlyPath('.context/business-archive/x.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('.context/businesses/x.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('.context/business.md', prefixes)).toBe(false);
  });

  test('leaves unrelated paths alone', () => {
    expect(isRepoOnlyPath('docs/setup/jira-setup-guide.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('.claude/skills/acli/SKILL.md', prefixes)).toBe(false);
  });

  test('does not match a parent of the prefix', () => {
    expect(isRepoOnlyPath('.context', prefixes)).toBe(false);
  });

  test('exact-file prefixes match only that file', () => {
    const filePrefixes = ['.github/workflows/ci.yml'];
    expect(isRepoOnlyPath('.github/workflows/ci.yml', filePrefixes)).toBe(true);
    expect(isRepoOnlyPath('.github/workflows/ci.yml.bak', filePrefixes)).toBe(false);
    expect(isRepoOnlyPath('.github/workflows/pages.yml', filePrefixes)).toBe(false);
  });

  test('normalizes backslashes on both sides', () => {
    expect(isRepoOnlyPath('.context\\business\\x.md', prefixes)).toBe(true);
    expect(isRepoOnlyPath('.context/business/x.md', ['.context\\business'])).toBe(true);
  });

  test('tolerates a trailing slash in the configured prefix', () => {
    expect(isRepoOnlyPath('.context/business/x.md', ['.context/business/'])).toBe(true);
  });

  test('an empty prefix never matches, so a stray entry cannot blank the sync', () => {
    expect(isRepoOnlyPath('docs/anything.md', [''])).toBe(false);
    expect(isRepoOnlyPath('docs/anything.md', ['/'])).toBe(false);
  });

  test('no prefixes configured means nothing is filtered', () => {
    expect(isRepoOnlyPath('.context/business/x.md', [])).toBe(false);
  });
});
