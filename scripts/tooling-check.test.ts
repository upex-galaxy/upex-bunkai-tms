import { describe, expect, test } from 'bun:test';
import { isToolingPath } from '../cli/lib/tooling-scope.ts';
import { repoLegs, scopeTscOutput, tscErrorFile } from './tooling-check.ts';

describe('scopeTscOutput', () => {
  const out = [
    'cli/update-boilerplate.ts(1462,3): error TS2322: Type \'symbol | T\' is not assignable to type \'T\'.',
    '  \'T\' could be instantiated with an arbitrary type.',
    'scripts/x-thread.ts(241,33): error TS2584: Cannot find name \'document\'.',
    '  detail of the app error',
    'lib/jira/audit/roster.ts(1,1): error TS2307: Cannot find module.',
    'error TS5083: Cannot read file \'tsconfig.tooling.json\'.',
  ].join('\n');

  test('keeps the tooling\'s errors with their detail and every global error; counts the app\'s', () => {
    const owned = { scripts: [], skills: [] };
    const { kept, dropped } = scopeTscOutput(out, rel => isToolingPath(rel, owned));
    expect(kept).toEqual([
      'cli/update-boilerplate.ts(1462,3): error TS2322: Type \'symbol | T\' is not assignable to type \'T\'.',
      '  \'T\' could be instantiated with an arbitrary type.',
      'error TS5083: Cannot read file \'tsconfig.tooling.json\'.',
    ]);
    expect(dropped).toBe(2);
  });

  test('tscErrorFile reads the path of a located error only', () => {
    expect(tscErrorFile('scripts/a.ts(1,2): error TS1: x')).toBe('scripts/a.ts');
    expect(tscErrorFile('error TS5083: x')).toBeNull();
  });
});

describe('repoLegs', () => {
  test('greenfield runs the three legs repo:check always opened with, in the same order', () => {
    expect(repoLegs(false).map(l => l.name)).toEqual(['format:check', 'lint:check', 'types:check']);
  });

  test('an adopted app runs the tooling-scoped checks and no format leg', () => {
    expect(repoLegs(true).map(l => l.name)).toEqual(['tooling:lint:check', 'tooling:types:check']);
  });
});
