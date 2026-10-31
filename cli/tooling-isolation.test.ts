/**
 * The tooling's own type/lint scope, and the framework gates that pick it on an
 * ADOPTED app. The greenfield path is asserted command for command: a project
 * scaffolded from the boilerplate must run exactly the gates it ran before.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { ADOPTED_APP_CONFIGS, COMPONENTS, resolveProtectedWatchlist, watchedForDrift } from './update-boilerplate.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');
const GATES = join(REPO_ROOT, '.husky', 'framework-gates.sh');
const IS_WINDOWS = process.platform === 'win32';

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

describe('the tooling scope ships with the tooling component', () => {
  test('tsconfig.tooling.json and eslint.config.tooling.mjs are synced like the eslint base', () => {
    const files = COMPONENTS.find(c => c.name === 'tooling')?.files ?? [];
    expect(files).toEqual(expect.arrayContaining(['eslint.config.base.js', 'eslint.config.tooling.mjs', 'tsconfig.tooling.json']));
  });

  test('tsconfig.tooling.json covers the tooling only, never the app tree', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.tooling.json'), 'utf8')) as { include: string[], extends?: string };
    expect(config.include).toEqual(['cli/**/*.ts', 'scripts/**/*.ts', '.agents/**/*.ts']);
    // Standalone: extending the root tsconfig would inherit an adopted app's settings.
    expect(config.extends).toBeUndefined();
  });

  test('package.json runs the tooling scope through its own scripts; the greenfield scripts are unchanged', () => {
    const scripts = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    // Scoped to what upstream owns on an adopted app; folder-wide everywhere else (scripts/tooling-check.ts).
    expect(scripts['tooling:types:check']).toBe('bun scripts/tooling-check.ts types');
    expect(scripts['tooling:lint:check']).toBe('bun scripts/tooling-check.ts lint');
    expect(scripts['types:check']).toBe('tsc --noEmit');
    expect(scripts['lint:check']).toBe('eslint .');
  });
});

describe('the app\'s own root configs on an adopted repo', () => {
  // Upstream's root tsconfig/eslint config are greenfield's: comparing an app's
  // config with them advises porting Bun settings INTO the app.
  test('their drift rows are dropped on an adopted repo and kept on a greenfield one; the watchlist itself is unchanged', () => {
    const watchlist = resolveProtectedWatchlist(REPO_ROOT);
    const paths = (adopted: boolean): string[] => watchedForDrift(watchlist, adopted).map(e => e.path);
    for (const config of ADOPTED_APP_CONFIGS) {
      expect(watchlist.map(e => e.path)).toContain(config);
      expect(paths(false)).toContain(config);
      expect(paths(true)).not.toContain(config);
    }
    expect(paths(true)).toContain('.husky/pre-commit');
  });
});

describe('framework gates pick the scope', () => {
  /** A git repo with a stub `bun` that logs every `bun run <script>` and succeeds. */
  function repo(opts: { adopted: boolean, toolingScripts: boolean }): { root: string, run: (fn: string) => { code: number, calls: string[], out: string } } {
    const root = mkdtempSync(join(tmpdir(), 'gates scope '));
    roots.push(root);
    const bin = join(root, '.bin');
    mkdirSync(bin);
    const log = join(root, 'calls.log');
    writeFileSync(join(bin, 'bun'), `#!/bin/sh\necho "$*" >> "${log}"\nexit 0\n`);
    chmodSync(join(bin, 'bun'), 0o755);
    const scripts: Record<string, string> = { 'types:check': 'x', 'lint:check': 'x', 'format:check': 'x' };
    if (opts.toolingScripts) { Object.assign(scripts, { 'tooling:types:check': 'x', 'tooling:lint:check': 'x' }); }
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ scripts }, null, 2)}\n`);
    if (opts.adopted) {
      mkdirSync(join(root, '.template'));
      writeFileSync(join(root, '.template', 'installer.lock.json'), `${JSON.stringify({ template: 'upex-galaxy/agentic-dev-boilerplate', adopted: true }, null, 2)}\n`);
    }
    Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
    return {
      root,
      run: (fn) => {
        rmSync(log, { force: true });
        // `sh -e`, as `.husky/_/h` runs every hook.
        const p = Bun.spawnSync(['sh', '-e', '-c', `. "${GATES}"; ${fn}`], {
          cwd: root,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
        });
        let calls: string[] = [];
        try { calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean); }
        catch {}
        return { code: p.exitCode ?? 1, calls, out: `${p.stdout.toString()}${p.stderr.toString()}` };
      },
    };
  }

  test('greenfield: exactly the gates it ran before, command for command', () => {
    if (IS_WINDOWS) { return; }
    const { run } = repo({ adopted: false, toolingScripts: true });
    expect(run('framework_gates_pre_commit')).toMatchObject({ code: 0, calls: ['run types:check', 'run vars:check', 'run skills:check'] });
    expect(run('framework_gates_pre_push').calls).toEqual([
      'run format:check',
      'run lint:check',
      'run vars:env:check',
      'run skills:registry:check',
      'run agents:compat:check',
    ]);
  });

  test('adopted app: the tooling scope instead of the app\'s scripts, and no repo-wide format check', () => {
    if (IS_WINDOWS) { return; }
    const { run } = repo({ adopted: true, toolingScripts: true });
    expect(run('framework_gates_pre_commit').calls).toEqual(['run tooling:types:check', 'run vars:check', 'run skills:check']);
    const push = run('framework_gates_pre_push');
    expect(push.calls).toEqual(['run tooling:lint:check', 'run vars:env:check', 'run skills:registry:check', 'run agents:compat:check']);
    expect(push.out).toContain('format:check skipped');
  });

  test('adopted app whose package.json lacks the tooling scripts: the check is skipped and says so, the hook survives', () => {
    if (IS_WINDOWS) { return; }
    const { run } = repo({ adopted: true, toolingScripts: false });
    const commit = run('framework_gates_pre_commit');
    expect(commit.code).toBe(0);
    expect(commit.calls).toEqual(['run vars:check', 'run skills:check']);
    expect(commit.out).toContain('no "tooling:types:check" script');
  });
});

describe('the pre-commit hook runs lint-staged only where the project configures it', () => {
  const HOOK = resolve(import.meta.dir, '..', '.husky', 'pre-commit');

  /** Runs the real hook with a stub `bunx` that logs its arguments; no gates file, so only lint-staged can call it. */
  function commit(files: Record<string, string>): { code: number, calls: string[] } {
    const root = mkdtempSync(join(tmpdir(), 'pre-commit lint-staged '));
    roots.push(root);
    const bin = join(root, '.bin');
    mkdirSync(bin);
    const log = join(root, 'calls.log');
    writeFileSync(join(bin, 'bunx'), `#!/bin/sh\necho "$*" >> "${log}"\nexit 0\n`);
    chmodSync(join(bin, 'bunx'), 0o755);
    for (const [rel, text] of Object.entries(files)) { writeFileSync(join(root, rel), text); }
    // A copy of the hook with no gates file beside it: the gates only warn, so lint-staged is all that runs.
    mkdirSync(join(root, '.husky'));
    writeFileSync(join(root, '.husky', 'pre-commit'), readFileSync(HOOK, 'utf8'));
    const p = Bun.spawnSync(['sh', '-e', join(root, '.husky', 'pre-commit')], { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` } });
    let calls: string[] = [];
    try { calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean); }
    catch {}
    return { code: p.exitCode ?? 1, calls };
  }

  test('greenfield: package.json carries the config, lint-staged runs as before', () => {
    if (IS_WINDOWS) { return; }
    expect(commit({ 'package.json': '{\n  "lint-staged": {\n    "*.ts": ["eslint --fix"]\n  }\n}\n' }).calls).toEqual(['lint-staged']);
    expect(commit({ '.lintstagedrc.json': '{}', 'package.json': '{}' }).calls).toEqual(['lint-staged']);
  });

  test('adopted app with no config (only the devDependency): skipped, the commit is not failed', () => {
    if (IS_WINDOWS) { return; }
    const r = commit({ 'package.json': '{\n  "devDependencies": {\n    "lint-staged": "^16.2.7"\n  }\n}\n' });
    expect(r.calls).toEqual([]);
    expect(r.code).toBe(0);
  });
});
