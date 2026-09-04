import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { validateComponentRegistry } from './lib/updater-core.ts';
import { COMPONENTS, parseArgs, resolveProtectedWatchlist, runGate, summarizeGates } from './update-boilerplate.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater wrapper '));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

describe('component registry', () => {
  test('no two components claim the same path', () => {
    expect(() => validateComponentRegistry(COMPONENTS)).not.toThrow();
  });

  test('.claude/settings.json ships once (bootstrap-only) and stays out of every directory component', () => {
    const rootConfig = COMPONENTS.find(c => c.name === 'agent-root-config');
    expect(rootConfig).toMatchObject({ type: 'file-list', paths: ['.claude'], files: ['settings.json'], bootstrapOnly: true });
    // `.claude` itself is never a directory component: `commands` owns
    // `.claude/commands`, the alias `.claude/skills` is generated.
    expect(COMPONENTS.filter(c => c.type !== 'file-list').flatMap(c => c.paths)).not.toContain('.claude');
  });
});

describe('protected watchlist', () => {
  test('the husky hooks are watched (project gates), the identity files are structural, and a project without the block adds nothing', () => {
    const root = temporaryRoot();
    const warnings: string[] = [];
    const watchlist = resolveProtectedWatchlist(root, m => warnings.push(m));
    expect(warnings).toEqual([]);
    const byPath = Object.fromEntries(watchlist.map(e => [e.path, e]));
    expect(byPath['.husky/pre-commit']).toMatchObject({ reason: 'project gates live here', source: 'upstream' });
    expect(byPath['.husky/pre-push']).toMatchObject({ reason: 'project gates live here', source: 'upstream' });
    expect(byPath['.agents/project.yaml']?.structural).toBe(true);
    expect(byPath['.agents/jira-required.yaml']?.structural).toBe(true);
    expect(byPath['.claude/settings.json']?.structural).toBeUndefined();
    expect(watchlist.every(e => e.source === 'upstream')).toBe(true);
    // The husky component still owns the directory: the hooks are protected by path, not unsynced.
    expect(COMPONENTS.find(c => c.name === 'husky')).toMatchObject({ type: 'directory', paths: ['.husky'] });
  });

  test('updater.protected_paths joins the watchlist; invalid entries are reported in Spanish and ignored', () => {
    const root = temporaryRoot();
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents', 'project.yaml'), 'updater:\n  protected_paths:\n    - scripts/lint-vars.ts\n    - .husky/pre-push\n    - ../outside.ts\n    - .git/config\n');
    const warnings: string[] = [];
    const watchlist = resolveProtectedWatchlist(root, m => warnings.push(m));
    expect(watchlist.filter(e => e.source === 'project').map(e => e.path)).toEqual(['scripts/lint-vars.ts']);
    expect(watchlist.filter(e => e.path === '.husky/pre-push')).toHaveLength(1);
    expect(warnings).toEqual([
      'updater.protected_paths (.agents/project.yaml): entrada ignorada "../outside.ts": outside the repo (`..` segment).',
      'updater.protected_paths (.agents/project.yaml): entrada ignorada ".git/config": under .git.',
    ]);
  });
});

describe('flags', () => {
  test('--no-gates and --interactive parse next to the existing modes', () => {
    expect(parseArgs(['--auto', '--no-gates'])).toMatchObject({ auto: true, noGates: true, interactive: false });
    expect(parseArgs(['--interactive', '--dry-run'])).toMatchObject({ interactive: true, dryRun: true, auto: false, noGates: false });
    expect(parseArgs([])).toMatchObject({ auto: false, noGates: false, interactive: false, strict: false });
  });
});

describe('post-apply gates', () => {
  /** A project whose package.json defines the gate scripts as shell one-liners. */
  function project(scripts: Record<string, string>): string {
    const root = temporaryRoot();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'gate-fixture', private: true, scripts }, null, 2));
    return root;
  }

  test('a failing gate reports exit code, error count, the first lines and which applied files they name', () => {
    const root = project({ 'types:check': 'printf "cli/lib/updater-core.test.ts(84,19): error TS2352: bad cast\\nsrc/app.ts(1,1): error TS1000: nope\\n" >&2; exit 2' });
    const gate = runGate('types:check', root, ['cli/lib/updater-core.test.ts', 'cli/update-boilerplate.ts']);
    expect(gate).toMatchObject({ script: 'types:check', status: 'fail', exitCode: 2, errorCount: 2, failingApplied: ['cli/lib/updater-core.test.ts'] });
    expect(gate.firstErrors).toEqual(['cli/lib/updater-core.test.ts(84,19): error TS2352: bad cast', 'src/app.ts(1,1): error TS1000: nope']);
    expect(gate.output).toContain('TS2352');
  });

  test('a passing gate carries no errors; one that does not finish in time is a timeout, not a failure', () => {
    const root = project({ 'lint:check': 'exit 0', 'types:check': 'sleep 5' });
    expect(runGate('lint:check', root, [])).toMatchObject({ status: 'pass', exitCode: 0, errorCount: 0, firstErrors: [] });
    const slow = runGate('types:check', root, [], 300);
    expect(slow.status).toBe('timeout');
    expect(slow.exitCode).toBeNull();
  }, 15_000);

  test('the closing-box line names every gate and its verdict', () => {
    expect(summarizeGates([])).toBeNull();
    expect(summarizeGates([
      { script: 'types:check', status: 'fail', exitCode: 2, seconds: 8, errorCount: 5, firstErrors: [], failingApplied: [], output: '' },
      { script: 'lint:check', status: 'pass', exitCode: 0, seconds: 3, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
      { script: 'test', status: 'timeout', exitCode: null, seconds: 120, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
    ])).toBe('types:check FAIL (5 errores); lint:check OK; test omitido (>120 s)');
  });
});
