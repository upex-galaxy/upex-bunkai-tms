/**
 * instructions.ts — readers for the progressive disclosure of the project
 * instructions: the always-on `AGENTS.md` (L0) and the on-demand section files
 * under `.agents/instructions/` (L1).
 *
 * One parser per shape, shared by `scripts/lint-instructions.ts` and every
 * reader of a table that moved out of `AGENTS.md` (the skill router of
 * `scripts/lint-docs.ts`). A reader asks for the section first and falls back
 * to `AGENTS.md`, so a project that still carries the single-file layout keeps
 * passing its gates.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const L0_FILE = 'AGENTS.md';
export const SECTIONS_DIR = '.agents/instructions';
export const RULES_FILE = 'agent-critical-rules.md';
export const SKILLS_FILE = 'agent-skills-and-mcps.md';
export const PROJECT_FILE = 'agent-project.md';
export const README_FILE = 'README.md';
/** The heading `bun sync --adopt` puts above an adopted app's preserved instructions (`ADOPT_INSTRUCTIONS_HEADING` in `cli/lib/updater-adopt.ts`). */
export const APP_BLOCK_HEADING = '## 0. Project instructions (pre-adoption)';

/**
 * A section file: `agent-<id>.md`. Every file of the folder but `README.md`
 * carries the `agent-` prefix, so a reader can tell it came with the agent
 * setup; the id is the stem without it. Order comes from the router rows, not
 * from file names.
 */
export const SECTION_FILE = /^agent-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export interface RouterRow {
  /** 1-based line in L0. */
  line: number
  kind: string
  /** Repo-relative load targets: backticked paths, then bare `@path` imports. */
  targets: string[]
}

export interface L0Rule {
  n: number
  name: string
  /** Verbatim excerpts of the full rule (`…` joins them in L0). */
  excerpts: string[]
  line: number
}

/** Text with fenced blocks blanked and inline code spans emptied (line count kept). */
export function withoutCode(text: string): string {
  let fenced = false;
  return text.split('\n').map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line.replace(/`[^`]*`/g, '``');
  }).join('\n');
}

/** Bytes of L0 without an adopted app's preserved block (from its heading to the last `## 1` heading). */
export function coreBytes(l0: string): number {
  const lines = l0.split('\n');
  const start = lines.findIndex(l => l.trim() === APP_BLOCK_HEADING);
  if (start === -1) { return Buffer.byteLength(l0); }
  let end = lines.length;
  for (let i = lines.length - 1; i > start; i -= 1) {
    if (/^## 1[.\s]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return Buffer.byteLength([...lines.slice(0, start), ...lines.slice(end)].join('\n'));
}

export const ROUTER_START = '<!-- router:start -->';
export const ROUTER_END = '<!-- router:end -->';

/** Rows of the L0 router table, or null when its markers are missing. */
export function parseRouter(l0: string): RouterRow[] | null {
  const lines = l0.split('\n');
  const start = lines.findIndex(l => l.trim() === ROUTER_START);
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (start === -1 || end === -1 || end < start) { return null; }
  const rows: RouterRow[] = [];
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|') || /^\|[\s:|-]+\|$/.test(line)) { continue; }
    const cells = line.slice(1, -1).split('|').map(c => c.trim());
    if (cells[0] === 'Kind') { continue; }
    const load = cells[1] ?? '';
    const targets = [
      ...[...load.matchAll(/`([^`]+)`/g)].map(m => m[1]),
      ...[...load.replace(/`[^`]*`/g, '').matchAll(/(?<![\w.])@([\w./-]+)/g)].map(m => m[1]),
    ];
    rows.push({ line: i + 1, kind: cells[0] ?? '', targets });
  }
  return rows;
}

/**
 * The ROUTER lock, one comment line in `AGENTS.md`: the fingerprint of the
 * table it froze and the ADR that decided that table. The rows are request
 * kinds, fixed on purpose (ADR-0009); a change to them is an architectural
 * decision, so the lock moves only together with an ADR that cites it
 * (ADR-0014). Same grammar as the QA twin, so both repos read one lock line.
 */
export const ROUTER_LOCK = /<!-- router:lock ([0-9a-f]{12}) (ADR-\d{4}) -->/;
export const ADR_DIR = '.context/ADR';
/** Labelled prompts for the router (recall / precision), read by the lint and `cli/lib/instruction-router.test.ts`. */
export const ROUTER_EVAL_FIXTURE = 'cli/lib/fixtures/instruction-router-eval.json';
/** The index in `.agents/instructions/README.md`: one row per section file. */
export const README_SECTIONS_HEADING = /^## Sections\s*$/m;

/**
 * The ROUTER table as the lock sees it: header plus rows, separator rows
 * dropped, every cell trimmed and its inner whitespace collapsed, so a
 * reflowed table keeps its fingerprint and a changed cell does not.
 */
export function routerTableLines(l0: string): string[] | null {
  const lines = l0.split('\n');
  const start = lines.findIndex(l => l.trim() === ROUTER_START);
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (start < 0 || end < 0 || end < start) { return null; }
  return lines.slice(start + 1, end)
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l))
    .map(l => l.slice(1, -1).split('|').map(c => c.replace(/\s+/g, ' ').trim()).join(' | '));
}

/** First 12 hex of the sha256 of the normalized ROUTER table, or null without markers. */
export function routerFingerprint(l0: string): string | null {
  const lines = routerTableLines(l0);
  return lines === null ? null : createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
}

/** The lock line of `AGENTS.md`, or null when there is none. */
export function routerLock(l0: string): { fingerprint: string, adr: string, line: number } | null {
  const lines = l0.split('\n');
  const index = lines.findIndex(l => ROUTER_LOCK.test(l));
  if (index < 0) { return null; }
  const m = ROUTER_LOCK.exec(lines[index])!;
  return { fingerprint: m[1], adr: m[2], line: index + 1 };
}

/** `AGENTS.md` with its lock set to `fingerprint` + `adr`: replaced in place, or added right under the router end marker. */
export function withRouterLock(l0: string, fingerprint: string, adr: string): string {
  const lock = `<!-- router:lock ${fingerprint} ${adr} -->`;
  if (ROUTER_LOCK.test(l0)) { return l0.replace(ROUTER_LOCK, lock); }
  const lines = l0.split('\n');
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (end < 0) { return l0; }
  lines.splice(end + 1, 0, lock);
  return lines.join('\n');
}

/** Repo-relative path of `ADR-NNNN-*.md` under `.context/ADR/`, or null. */
export function findAdr(root: string, id: string): string | null {
  const dir = join(root, ADR_DIR);
  if (!existsSync(dir)) { return null; }
  const name = readdirSync(dir).find(n => n.startsWith(`${id}-`) && n.endsWith('.md'));
  return name ? `${ADR_DIR}/${name}` : null;
}

/** Section file names the README `## Sections` table lists (first cell, backticked), or null when the table is missing. */
export function readmeSectionRows(text: string): Array<{ name: string, line: number }> | null {
  const start = text.search(README_SECTIONS_HEADING);
  if (start < 0) { return null; }
  const firstLine = text.slice(0, start).split('\n').length;
  const after = text.slice(start).split('\n').slice(1);
  const next = after.findIndex(line => /^#{1,2} /.test(line));
  const rows: Array<{ name: string, line: number }> = [];
  (next < 0 ? after : after.slice(0, next)).forEach((line, i) => {
    const cell = /^\|\s*`([\w.-]+\.md)`\s*\|/.exec(line);
    if (cell) { rows.push({ name: cell[1], line: firstLine + 1 + i }); }
  });
  return rows;
}

export const PROJECT_SKILLS_START = '<!-- project-skills:start -->';
export const PROJECT_SKILLS_END = '<!-- project-skills:end -->';
/** A skill slug as `.agents/skills/<slug>/` names it. */
export const SKILL_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export interface ProjectSkillRow {
  /** 1-based line in `agent-project.md`. */
  line: number
  /** First backticked token of the Skill cell (may be invalid: the lint says so). */
  slug: string
  loadWhen: string
  /** Backticked regexes of the Triggers cell, `\|` unescaped to `|`. */
  triggers: string[]
}

/** Table cells split on unescaped pipes (GFM: `\|` is a literal pipe, inside code spans too). */
export function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
}

/**
 * Rows of the "Project context skills" table of `agent-project.md` (between
 * `<!-- project-skills:start -->` and `<!-- project-skills:end -->`), or null
 * when the markers are missing. Columns: `Skill | Load when | Triggers |
 * Loaded by`. Same grammar as `parseProjectSkillRows` in
 * `.agents/hooks/personality-reinject.mjs`.
 */
export function parseProjectSkills(text: string): ProjectSkillRow[] | null {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim() === PROJECT_SKILLS_START);
  const end = lines.findIndex(l => l.trim() === PROJECT_SKILLS_END);
  if (start === -1 || end === -1 || end < start) { return null; }
  const rows: ProjectSkillRow[] = [];
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|') || /^\|[\s:|-]+\|$/.test(line)) { continue; }
    const cells = tableCells(line);
    if (cells[0] === 'Skill') { continue; }
    rows.push({
      line: i + 1,
      slug: /`\/?([^`]+)`/.exec(cells[0] ?? '')?.[1] ?? (cells[0] ?? ''),
      loadWhen: cells[1] ?? '',
      triggers: [...(cells[2] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]),
    });
  }
  return rows;
}

/** YAML frontmatter of a section file, or null when it has none. */
export function parseFrontmatter(text: string): Record<string, unknown> | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) { return null; }
  const data = parseYaml(match[1]) as unknown;
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

/** Critical Rules as L0 states them under `## 1. CRITICAL RULES`. */
export function parseL0Rules(l0: string): L0Rule[] {
  const lines = l0.split('\n');
  const start = lines.findIndex(l => l.startsWith('## 1. CRITICAL RULES'));
  if (start === -1) { return []; }
  const rules: L0Rule[] = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i += 1) {
    const m = /^(\d+)\. \*\*([^*]+)\*\*(.*)$/.exec(lines[i]);
    if (!m) { continue; }
    const body = m[3].replace(/\s*Full: \S+\s*$/, '').replace(/^[:.]\s*/, '').trim();
    rules.push({ n: Number(m[1]), name: m[2], excerpts: body.split('…').map(s => s.trim()).filter(Boolean), line: i + 1 });
  }
  return rules;
}

/** Full rule bodies of the critical-rules section, keyed by number (`## N. NAME`). */
export function parseFullRules(text: string): Map<number, { name: string, body: string }> {
  const rules = new Map<number, { name: string, body: string }>();
  for (const part of text.split(/^## /m).slice(1)) {
    const m = /^(\d+)\. (.+)\n([\s\S]*)$/.exec(part);
    if (m) { rules.set(Number(m[1]), { name: m[2].trim(), body: m[3] }); }
  }
  return rules;
}

/**
 * The file that holds the skill router table (`### Skills T1`): the skills
 * section when it exists, `AGENTS.md` otherwise. Null when neither exists.
 */
export function skillTableSource(root: string): { file: string, text: string } | null {
  for (const file of [`${SECTIONS_DIR}/${SKILLS_FILE}`, L0_FILE]) {
    const full = join(root, file);
    if (existsSync(full)) { return { file, text: readFileSync(full, 'utf8') }; }
  }
  return null;
}
