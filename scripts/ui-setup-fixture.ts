#!/usr/bin/env bun
/**
 * @fileoverview A throwaway copy of this repo to run `bun setup` against
 * (installer-ui delivery 3), never the checkout itself.
 *
 *   bun scripts/ui-setup-fixture.ts --out <dir>
 *
 * <dir>/project  the WORKING TREE (tracked and untracked files git does not
 *                ignore, so uncommitted work is what runs), committed once in a
 *                fresh repo with no `origin`, its package renamed `acme-app`
 *                the way the scaffolder renames it: a consumer project that
 *                still carries the maintainers' `.agents/project.yaml`.
 *                `node_modules` is a symlink to this checkout's, so the setup
 *                gate finds the dependencies and installs nothing.
 * <dir>/home     an empty HOME: nothing the run writes at user level (skills,
 *                Engram, agent configs) reaches the real one.
 *
 * `fixtureEnv()` is the clean environment a run gets: no variable of the
 * calling shell (`bun test` loads this repo's `.env` into process.env), every
 * step that needs the network or writes outside the project switched off.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(import.meta.dir, '..');

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', '-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { throw new Error(`git ${args.join(' ')} (${cwd}): ${r.stderr}`); }
  return r.stdout;
}

export interface SetupFixture {
  project: string
  home: string
}

export function buildSetupFixture(root: string): SetupFixture {
  rmSync(root, { recursive: true, force: true });
  const project = join(root, 'project');
  const home = join(root, 'home');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  const files = git(REPO, 'ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean);
  for (const rel of files) {
    const from = join(REPO, rel);
    const to = join(project, rel);
    mkdirSync(dirname(to), { recursive: true });
    try { copyFileSync(from, to); }
    catch { /* a tracked file deleted in the working tree */ }
  }
  const pkgPath = join(project, 'package.json');
  writeFileSync(pkgPath, readFileSync(pkgPath, 'utf8').replace(/"name": "[^"]+"/, '"name": "acme-app"'));
  symlinkSync(join(REPO, 'node_modules'), join(project, 'node_modules'));
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '--no-verify', '-m', 'fixture');
  return { project, home };
}

/** The environment of a fixture run: clean, offline-safe, isolated HOME. */
export function fixtureEnv(f: SetupFixture, extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    HOME: f.home,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    LANG: 'es_ES.UTF-8',
    NO_COLOR: '1',
    UPEX_UI_NO_OPEN: '1',
    INSTALL_SKIP_COMMUNITY: '1',
    INSTALL_SKIP_ENGRAM: '1',
    INSTALL_SKIP_PLAYWRIGHT: '1',
    INSTALL_SKIP_JIRA: '1',
    // git identity without the real ~/.gitconfig.
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'user.email',
    GIT_CONFIG_VALUE_0: 'fixture@example.invalid',
    GIT_CONFIG_KEY_1: 'user.name',
    GIT_CONFIG_VALUE_1: 'fixture',
    ...extra,
  };
}

if (import.meta.main) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : '';
  if (!out) {
    process.stderr.write('usage: bun scripts/ui-setup-fixture.ts --out <dir>\n');
    process.exit(2);
  }
  const f = buildSetupFixture(resolve(out));
  process.stdout.write(`project: ${f.project}\nhome:    ${f.home}\n`);
}
