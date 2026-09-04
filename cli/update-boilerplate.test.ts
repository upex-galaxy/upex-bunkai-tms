import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { validateComponentRegistry } from './lib/updater-core.ts';
import { COMPONENTS, parseArgs, runGate, summarizeGates } from './update-boilerplate.ts';

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
