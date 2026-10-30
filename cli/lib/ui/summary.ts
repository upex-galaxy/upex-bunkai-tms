/**
 * @fileoverview The saved summary (owner decisions D6 and Q3): at `run.end` the
 * page in its final state, journal embedded, is written to
 * `.session/runs/<cmd>-<yyyymmdd-hhmm>.html`.
 *
 * `.session/` is ignored by git in both boilerplates without touching any
 * `.gitignore`. The journal is already redacted when it reaches this module, so
 * the file holds no secret. The last `keep` (20) summaries are kept; older ones
 * are deleted when a new one is written.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { JournalEntry, Lang, RunCmd } from './events.ts';

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { renderPage } from './page.ts';

export const RUNS_DIR = join('.session', 'runs');
const SUMMARY_NAME = /^(?:setup|up)-\d{8}-\d{4}(?:-\d+)?\.html$/;

const pad = (n: number): string => String(n).padStart(2, '0');

export function summaryStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export interface WriteSummaryOptions {
  repoRoot: string
  cmd: RunCmd
  lang: Lang
  journal: JournalEntry[]
  now?: Date
  keep?: number
}

/** Writes the summary and returns its path relative to `repoRoot`. */
export function writeSummary(opts: WriteSummaryOptions): string {
  const dir = join(opts.repoRoot, RUNS_DIR);
  mkdirSync(dir, { recursive: true });
  const base = `${opts.cmd}-${summaryStamp(opts.now ?? new Date())}`;
  let file = join(dir, `${base}.html`);
  for (let i = 2; existsSync(file); i++) { file = join(dir, `${base}-${i}.html`); }
  writeFileSync(file, renderPage({ mode: 'saved', note: 'saved', lang: opts.lang, journal: opts.journal }));
  pruneSummaries(dir, opts.keep ?? 20);
  return relative(opts.repoRoot, file);
}

/** Deletes all but the newest `keep` summaries. Only files named like a summary are ever touched. */
export function pruneSummaries(dir: string, keep: number): string[] {
  if (!existsSync(dir)) { return []; }
  const files = readdirSync(dir)
    .filter(f => SUMMARY_NAME.test(f))
    .map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t || b.f.localeCompare(a.f));
  const gone = files.slice(Math.max(0, keep)).map(x => x.f);
  for (const f of gone) { rmSync(join(dir, f), { force: true }); }
  return gone;
}
