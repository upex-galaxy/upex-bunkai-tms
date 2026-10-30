#!/usr/bin/env bun
/**
 * tooling-check — type-check or lint the boilerplate's OWN tooling, never the
 * app around it.
 *
 * Usage:
 *   bun scripts/tooling-check.ts types   # tsc over tsconfig.tooling.json
 *   bun scripts/tooling-check.ts lint    # eslint with eslint.config.tooling.mjs
 *   bun scripts/tooling-check.ts repo    # the format / lint / types legs of `repo:check`
 *
 * `repo` is what `repo:check` opens with. On a greenfield repo it runs
 * `format:check`, `lint:check` and `types:check`, in that order, stopping at
 * the first failure: the commands it replaced. On an adopted app those three
 * are app-wide (the app's own scripts, or eslint / tsc / prettier over the
 * app's root configs), so it runs the two tooling checks above instead and
 * skips the format leg, as the hook gates do (`.husky/framework-gates.sh`):
 * the app's formatting is its own.
 *
 * On an adopted app the tooling shares `scripts/` and `.agents/skills/` with
 * the app's own code. The installer lock lists what upstream owns there
 * (`upstreamOwned`, `cli/lib/tooling-scope.ts`): `types` reports only the
 * errors in those files, `lint` lints only those files. Without the list
 * (greenfield, or a lock that predates it) both run folder-wide, exactly the
 * commands they replaced.
 *
 * Exit: 0 clean · 1 errors in the tooling · the tool's own code on a crash.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { isAdoptedRepo, isToolingPath, readUpstreamOwned } from '../cli/lib/tooling-scope.ts';

const ROOT = process.cwd();
const LINT_EXTENSIONS = /\.(?:ts|mts|cts|js|mjs|cjs)$/;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules') { continue; }
      const child = join(abs, e.name);
      if (e.isDirectory()) { walk(child); }
      else if (e.isFile()) { out.push(relative(ROOT, child).replace(/\\/g, '/')); }
    }
  };
  walk(join(ROOT, dir));
  return out;
}

/** A `tsc --pretty false` line starts with `<path>(<line>,<col>): error`; anything else is global. */
export function tscErrorFile(line: string): string | null {
  const m = /^(.+?)\(\d+,\d+\): error /.exec(line);
  return m ? m[1] : null;
}

/** Keeps the error lines that belong to the tooling (and every global one); drops the app's. */
export function scopeTscOutput(output: string, inScope: (rel: string) => boolean): { kept: string[], dropped: number } {
  const kept: string[] = [];
  let dropped = 0;
  let keepingCurrent = true;
  for (const line of output.split('\n')) {
    if (line.trim() === '') { continue; }
    const file = tscErrorFile(line);
    if (file !== null) {
      keepingCurrent = inScope(file);
      if (keepingCurrent) { kept.push(line); }
      else { dropped++; }
    }
    // Continuation lines (indented detail) follow their error.
    else if (/^\s/.test(line)) { if (keepingCurrent) { kept.push(line); } }
    else { kept.push(line); }
  }
  return { kept, dropped };
}

function types(): number {
  const owned = readUpstreamOwned(ROOT);
  const args = ['tsc', '--noEmit', '-p', 'tsconfig.tooling.json'];
  if (owned === null) {
    return spawnSync('bunx', args, { stdio: 'inherit' }).status ?? 1;
  }
  const res = spawnSync('bunx', [...args, '--pretty', 'false'], { encoding: 'utf8' });
  const { kept, dropped } = scopeTscOutput(`${res.stdout ?? ''}${res.stderr ?? ''}`, rel => isToolingPath(rel, owned));
  for (const line of kept) { console.log(line); }
  if (dropped > 0) {
    console.log(`ℹ️  ${dropped} error(s) in the app's own files (outside the tooling scope) not reported here: the app checks them with its own scripts.`);
  }
  return kept.some(line => tscErrorFile(line) !== null || /error TS\d+/.test(line)) ? 1 : 0;
}

function lint(): number {
  const owned = readUpstreamOwned(ROOT);
  const base = ['eslint', '--config', 'eslint.config.tooling.mjs'];
  if (owned === null) {
    return spawnSync('bunx', [...base, 'cli', 'scripts'], { stdio: 'inherit' }).status ?? 1;
  }
  const files = [...filesUnder('cli'), ...filesUnder('scripts')]
    .filter(rel => LINT_EXTENSIONS.test(rel) && isToolingPath(rel, owned))
    .sort();
  return spawnSync('bunx', [...base, ...files], { stdio: 'inherit' }).status ?? 1;
}

/** The legs `repo` runs, in order: script names on greenfield, scoped checks on an adopted app. */
export function repoLegs(adopted: boolean): Array<{ name: string, run: () => number }> {
  const script = (name: string) => ({ name, run: () => spawnSync('bun', ['run', name], { stdio: 'inherit' }).status ?? 1 });
  if (!adopted) { return [script('format:check'), script('lint:check'), script('types:check')]; }
  return [{ name: 'tooling:lint:check', run: lint }, { name: 'tooling:types:check', run: types }];
}

function repo(): number {
  const adopted = isAdoptedRepo(ROOT);
  if (adopted) {
    console.log('ℹ️  Adopted app: format:check skipped (the app\'s formatting is its own); lint and types scoped to the tooling. The app checks its code with its own scripts.');
  }
  for (const leg of repoLegs(adopted)) {
    const status = leg.run();
    if (status !== 0) { return status; }
  }
  return 0;
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === 'types') { process.exit(types()); }
  if (mode === 'lint') { process.exit(lint()); }
  if (mode === 'repo') { process.exit(repo()); }
  console.error('Usage: bun scripts/tooling-check.ts <types|lint|repo>');
  process.exit(2);
}
