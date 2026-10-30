/**
 * Regression tests for `scripts/provision-worktree.ts`, run against a real
 * temp git repo + a real `git worktree add`. What they guard:
 *   1. The refusal to run on the PRIMARY checkout (the whole point of the
 *      script is to provision a FRESH worktree, never the checkout it was
 *      launched from).
 *   2. That gitignored inputs (.env, .vercel/, a community skill dir) actually
 *      land in the worktree.
 *   3. That .session/ is deliberately never copied, even when present in the
 *      primary checkout: a session reaches it by an absolute path instead.
 *   4. --dry-run reports intent without writing anything.
 *   5. Provisioning never runs a shell autoloader: with a `direnv` binary on
 *      PATH it is still never invoked, the worktree still gets its own `.env`,
 *      and a primary's `.envrc` / `.envrc.local` is not copied (each process
 *      loads its own config; nothing exports `.env` into a shell).
 *
 * The fixture's package.json declares a trivial `agents:compat` script (`bun
 * -e "process.exit(0)"`) so the test never depends on this repo's real
 * `cli/lib/agent-compatibility.ts`: only the CONTRACT ("the script runs
 * `bun run agents:compat` inside the target and aborts on failure") is under
 * test here, not that script's own behaviour.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { PROVISION_COPIES, provisionPackageManager, worktreeIncludeLine } from '../cli/lib/worktree.ts';

const SCRIPT = resolve(import.meta.dir, 'provision-worktree.ts');
const IS_WINDOWS = platform() === 'win32';

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function git(cwd: string, ...cmd: string[]): void {
  const p = Bun.spawnSync(['git', '-C', cwd, ...cmd], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) {
    throw new Error(`git ${cmd.join(' ')} failed:\n${p.stderr.toString()}`);
  }
}

/**
 * A temp primary checkout with: a trivial package.json + committed lockfile
 * (so `bun install --frozen-lockfile` succeeds against it), a gitignored
 * `.env` / `.env.local` / `.vercel/project.json` / `.session/probe.md` / one
 * community skill dir under `.agents/skills/`, and one worktree branched off it.
 */
function fixture(): { primary: string, worktree: string } {
  const root = mkdtempSync(join(tmpdir(), 'provision-worktree-'));
  temporaryRoots.push(root);
  const primary = join(root, 'primary');
  mkdirSync(primary, { recursive: true });

  git(primary, 'init', '-q', '-b', 'main');
  git(primary, 'config', 'user.email', 'test@example.com');
  git(primary, 'config', 'user.name', 'Test');

  writeFileSync(join(primary, 'package.json'), `${JSON.stringify({
    name: 'fixture',
    private: true,
    scripts: { 'agents:compat': 'bun -e "process.exit(0)"' },
  }, null, 2)}\n`);
  writeFileSync(join(primary, '.gitignore'), [
    'node_modules/',
    '.env',
    '.env.local',
    '.vercel',
    '.session/',
    '.agents/skills/community-skill/',
    '',
  ].join('\n'));
  git(primary, 'add', 'package.json', '.gitignore');
  git(primary, 'commit', '-q', '-m', 'init');

  // Real lockfile, so the script's `bun install --frozen-lockfile` succeeds later.
  const install = Bun.spawnSync(['bun', 'install'], { cwd: primary, stdout: 'pipe', stderr: 'pipe' });
  if (install.exitCode !== 0) {
    throw new Error(`bun install (fixture setup) failed:\n${install.stderr.toString()}`);
  }
  git(primary, 'add', '-A');
  git(primary, 'commit', '-q', '-m', 'lockfile', '--allow-empty');

  // Gitignored inputs present in the primary, never committed.
  writeFileSync(join(primary, '.env'), 'LOCAL_USER_EMAIL=test@example.com\n');
  writeFileSync(join(primary, '.env.local'), 'LOCAL_USER_PASSWORD=override\n');
  mkdirSync(join(primary, '.vercel'), { recursive: true });
  writeFileSync(join(primary, '.vercel', 'project.json'), '{"projectId":"prj_x","orgId":"team_x"}\n');
  mkdirSync(join(primary, '.session'), { recursive: true });
  writeFileSync(join(primary, '.session', 'probe.md'), 'must never be copied\n');
  mkdirSync(join(primary, '.agents', 'skills', 'community-skill'), { recursive: true });
  writeFileSync(join(primary, '.agents', 'skills', 'community-skill', 'SKILL.md'), '# stub\n');

  const worktree = join(root, 'wt');
  git(primary, 'worktree', 'add', '-b', 'wt-branch', worktree, 'main');

  return { primary, worktree };
}

function run(cwdArgs: string[], env: Record<string, string> = {}): { code: number, out: string } {
  const p = Bun.spawnSync({ cmd: ['bun', SCRIPT, ...cwdArgs], stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

/**
 * A PATH whose first segment holds a fake `direnv` that records every call in
 * `marker`, so a test can prove the provisioner never invokes one.
 */
function pathWithTrapDirenv(marker: string): string {
  const bin = mkdtempSync(join(tmpdir(), 'provision-worktree-bin-'));
  temporaryRoots.push(bin);
  const trap = join(bin, 'direnv');
  writeFileSync(trap, `#!/bin/sh\necho "$@" >> '${marker}'\n`);
  chmodSync(trap, 0o755);
  return [bin, process.env.PATH ?? ''].join(delimiter);
}

describe('provisionPackageManager (bun only)', () => {
  function repo(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'provision-pm-'));
    temporaryRoots.push(root);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  }
  const stack = (pm: string): string => `project:\n  project_name: x\nstack:\n  app_root: .\n  package_manager: ${pm} # bun | pnpm\n`;

  test('bun, or nothing to tell, provisions as before', () => {
    expect(provisionPackageManager(repo({ 'bun.lock': '' }))).toEqual({ ok: true, note: null });
    expect(provisionPackageManager(repo({}))).toEqual({ ok: true, note: null });
    expect(provisionPackageManager(repo({ '.agents/project.yaml': stack('null') }))).toEqual({ ok: true, note: null });
  });

  test('another package manager is refused with the reason, declared or by lockfile', () => {
    const declared = provisionPackageManager(repo({ '.agents/project.yaml': stack('pnpm'), 'bun.lock': '' }));
    expect(declared).toMatchObject({ ok: false });
    expect(!declared.ok && declared.reason).toContain('stack.package_manager is pnpm');
    const byLock = provisionPackageManager(repo({ 'package-lock.json': '{}' }));
    expect(!byLock.ok && byLock.reason).toContain('the app installs with package-lock.json');
    expect(!byLock.ok && byLock.reason).toContain('requires bun');
  });

  test('two package managers and nothing declared is ambiguous; declared bun wins with a warning', () => {
    const both = provisionPackageManager(repo({ 'bun.lock': '', 'yarn.lock': '' }));
    expect(!both.ok && both.reason).toContain('no stack.package_manager to choose between them');
    const chosen = provisionPackageManager(repo({ '.agents/project.yaml': stack('bun'), 'bun.lock': '', 'yarn.lock': '' }));
    expect(chosen).toMatchObject({ ok: true });
    expect(chosen.ok && chosen.note).toContain('yarn.lock');
  });
});

describe('provision-worktree', () => {
  test('refuses a non-bun app before copying anything', () => {
    const { worktree } = fixture();
    writeFileSync(join(worktree, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    const result = run([worktree]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('Refusing to provision');
    expect(result.out).toContain('requires bun');
    expect(existsSync(join(worktree, '.env'))).toBe(false);
  });

  test('refuses to run on the primary checkout', () => {
    const { primary } = fixture();
    const result = run([primary, '--dry-run']);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('Refusing to provision the PRIMARY checkout');
  });

  test('refuses when the target path IS the primary, even without --dry-run', () => {
    const { primary } = fixture();
    const result = run([primary]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('Refusing to provision the PRIMARY checkout');
  });

  test('copies gitignored inputs into a fresh worktree and never copies .session/', () => {
    const { worktree } = fixture();
    const result = run([worktree]);
    expect(result.code).toBe(0);

    expect(readFileSync(join(worktree, '.env'), 'utf8')).toContain('LOCAL_USER_EMAIL');
    expect(readFileSync(join(worktree, '.env.local'), 'utf8')).toBe('LOCAL_USER_PASSWORD=override\n');
    expect(readFileSync(join(worktree, '.vercel', 'project.json'), 'utf8')).toContain('prj_x');
    expect(existsSync(join(worktree, '.agents', 'skills', 'community-skill', 'SKILL.md'))).toBe(true);

    // .session/ exists in the primary but must NEVER be copied.
    expect(existsSync(join(worktree, '.session'))).toBe(false);
  });

  test('never runs direnv, never copies .envrc files, and the worktree still gets its own .env', () => {
    if (IS_WINDOWS) { return; } // the trap binary is a POSIX shell script; documented, not measured on Windows.
    const { primary, worktree } = fixture();
    writeFileSync(join(primary, '.envrc'), 'export LEAK=1\n');
    writeFileSync(join(primary, '.envrc.local'), 'export LEAK=1\n');
    const marker = join(primary, '..', 'direnv-calls.log');
    const result = run([worktree], { PATH: pathWithTrapDirenv(marker) });
    expect(result.code).toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(result.out.toLowerCase()).not.toContain('direnv');
    expect(readFileSync(join(worktree, '.env'), 'utf8')).toContain('LOCAL_USER_EMAIL');
    expect(existsSync(join(worktree, '.envrc'))).toBe(false);
    expect(existsSync(join(worktree, '.envrc.local'))).toBe(false);
  });

  test('copied secrets are mode 0600 (files) / 0700 (dirs) on POSIX', () => {
    if (IS_WINDOWS) { return; } // chmod is a no-op by design on win32: nothing to assert.
    const { worktree } = fixture();
    const result = run([worktree]);
    expect(result.code).toBe(0);

    expect(statSync(join(worktree, '.env')).mode & 0o777).toBe(0o600);
    expect(statSync(join(worktree, '.env.local')).mode & 0o777).toBe(0o600);
    expect(statSync(join(worktree, '.vercel')).mode & 0o777).toBe(0o700);
    expect(statSync(join(worktree, '.vercel', 'project.json')).mode & 0o777).toBe(0o600);
  });

  test('absent optional inputs are info, not warnings', () => {
    const { worktree } = fixture();
    const result = run([worktree]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Skipping .env.sentry-build-plugin (not present in primary checkout)');
  });

  test('.worktreeinclude names every path the provisioner copies', () => {
    const lines = readFileSync(resolve(import.meta.dir, '..', '.worktreeinclude'), 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'));
    for (const entry of PROVISION_COPIES) {
      expect(lines).toContain(worktreeIncludeLine(entry));
    }
  });

  test('--dry-run reports intent without writing anything', () => {
    const { worktree } = fixture();
    const result = run([worktree, '--dry-run']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Would copy .env');
    expect(result.out).toContain('Would copy .vercel/');
    expect(existsSync(join(worktree, '.env'))).toBe(false);
    expect(existsSync(join(worktree, '.vercel'))).toBe(false);
  });
});
