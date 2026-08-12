#!/usr/bin/env bun
/**
 * Release readiness gate.
 *
 * Reads the release ledgers under `.context/release/pending-production-*.md`, runs the
 * `verify` block of every entry under "## Pending", and reports what is genuinely done.
 *
 * The point is that the ledger cannot rot. A written checklist decays the moment someone
 * completes an item and forgets to tick it, or ticks it without doing it. Here the
 * checkbox IS the command, so the file is re-derived from reality on every run.
 *
 * Exit codes:
 *   0  every pending entry verified
 *   1  at least one entry is PENDING, MANUAL, or errored
 *   2  the ledger could not be read or parsed
 *
 * Usage:
 *   bun run release:check                 # newest ledger
 *   bun run release:check -- --all        # every ledger found
 *   bun run release:check -- --file .context/release/pending-production-v2.md
 *   bun run release:check -- --json
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER_DIR = '.context/release';
const LEDGER_PREFIX = 'pending-production-';

type Status = 'DONE' | 'PENDING' | 'MANUAL' | 'ERROR';

interface Entry {
  key: string
  title: string
  verify: string | null
}

interface Result extends Entry {
  status: Status
  detail: string
}

interface Cli {
  json: boolean
  all: boolean
  file: string | null
}

function parseArgs(argv: string[]): Cli {
  const fileIndex = argv.indexOf('--file');
  return {
    json: argv.includes('--json'),
    all: argv.includes('--all'),
    file: fileIndex !== -1 ? (argv[fileIndex + 1] ?? null) : null,
  };
}

function ledgerFiles({ all, file }: Cli): string[] {
  if (file) { return [file]; }

  let names: string[];
  try {
    names = readdirSync(LEDGER_DIR)
      .filter(n => n.startsWith(LEDGER_PREFIX) && n.endsWith('.md'))
      // Highest version last, so `.pop()` is the newest. Natural-sort the numeric tail so
      // v10 sorts after v9 rather than between v1 and v2.
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  catch {
    fail(`No ledger directory at ${LEDGER_DIR}/. Nothing to check.`);
  }

  if (names.length === 0) {
    fail(`No ${LEDGER_PREFIX}*.md ledger found in ${LEDGER_DIR}/.`);
  }

  const chosen = all ? names : names.slice(-1);
  return chosen.map(n => join(LEDGER_DIR, n));
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

/**
 * Pulls entries out of the "## Pending" section only. Anything under "## Done" is history
 * and is deliberately not re-run: those commands may reference state that has since moved
 * on, and a stale failure there would be noise rather than a signal.
 */
function parseLedger(source: string): Entry[] {
  const pending = source.split(/^## +Pending\s*$/m)[1];
  if (pending === undefined) { return []; }

  const body = pending.split(/^## +/m)[0] ?? '';
  const entries: Entry[] = [];

  // `### KEY · Title`. The separator is a literal " · ", and the key excludes it, so the
  // two capture groups cannot overlap — the naive `(\S+)\s*·\s*(.+?)` form is ambiguous
  // enough to backtrack super-linearly on a long heading.
  const heads = [...body.matchAll(/^### ([^\s·]+) · (.+)$/gm)];

  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    const next = heads[i + 1];
    if (head?.index === undefined) { continue; }

    const start = head.index + head[0].length;
    const end = next?.index ?? body.length;
    const chunk = body.slice(start, end);

    const fence = /```bash verify\n([\s\S]*?)```/.exec(chunk);

    entries.push({
      key: head[1] ?? '(no key)',
      title: head[2] ?? '(no title)',
      verify: fence?.[1] === undefined ? null : fence[1].trimEnd(),
    });
  }

  return entries;
}

function runVerify(entry: Entry): Result {
  if (entry.verify === null) {
    return {
      ...entry,
      status: 'MANUAL',
      detail: 'no verify block — confirm by hand, then add one',
    };
  }

  const run = spawnSync('bash', ['-c', entry.verify], {
    encoding: 'utf8',
    env: process.env,
    timeout: 60_000,
  });

  if (run.error) {
    return { ...entry, status: 'ERROR', detail: run.error.message };
  }
  if (run.status === 0) {
    return { ...entry, status: 'DONE', detail: 'verified' };
  }

  // A non-zero exit is the normal "not done yet" signal, so it is not an error. Surface
  // stderr only when the command actually complained, which usually means the check itself
  // is broken (missing credential, typo) rather than the action being incomplete.
  const stderr = (run.stderr ?? '').trim().split('\n')[0] ?? '';
  return {
    ...entry,
    status: 'PENDING',
    detail: stderr ? `exit ${run.status} — ${stderr}` : `exit ${run.status}`,
  };
}

const ICON: Record<Status, string> = {
  DONE: '[32m✓[0m',
  PENDING: '[33m•[0m',
  MANUAL: '[33m?[0m',
  ERROR: '[31m✗[0m',
};

function report(file: string, results: Result[]): void {
  process.stdout.write(`\n[1m${file}[0m\n`);

  if (results.length === 0) {
    process.stdout.write('  (no entries under "## Pending")\n');
    return;
  }

  const width = Math.max(...results.map(r => r.key.length));
  for (const r of results) {
    process.stdout.write(
      `  ${ICON[r.status]} ${r.key.padEnd(width)}  ${r.title}\n`
      + `      [2m${r.status} — ${r.detail}[0m\n`,
    );
  }
}

const cli = parseArgs(process.argv.slice(2));
const files = ledgerFiles(cli);
const all: { file: string, results: Result[] }[] = [];

for (const file of files) {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  }
  catch {
    fail(`Cannot read ledger: ${file}`);
  }
  all.push({ file, results: parseLedger(source).map(runVerify) });
}

const flat = all.flatMap(f => f.results);
const blocking = flat.filter(r => r.status !== 'DONE');

if (cli.json) {
  process.stdout.write(`${JSON.stringify({ files: all, blocking: blocking.length }, null, 2)}\n`);
}
else {
  for (const { file, results } of all) { report(file, results); }

  const done = flat.length - blocking.length;
  process.stdout.write(`\n  ${done}/${flat.length} verified\n`);
  process.stdout.write(
    blocking.length === 0
      ? '\n  [32mRelease gate open.[0m Every pending action is verified.\n\n'
      : `\n  [33mRelease gate closed.[0m ${blocking.length} action(s) still outstanding.\n\n`,
  );
}

process.exit(blocking.length === 0 ? 0 : 1);
