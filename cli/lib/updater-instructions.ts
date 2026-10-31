/**
 * @fileoverview The `instructions` component: the on-demand sections of the
 * project instructions (`.agents/instructions/`, L1 of progressive disclosure)
 * and the one file in that folder no sync ever touches.
 *
 * WHAT IS SYNCED. Every section file and the folder README are upstream's
 * shared doctrine: they arrive through the ordinary `directory` component, with
 * the same mechanics as skills (overwritten on `bun sync`, a project edit
 * backed up under `.backups/` and reported as an overwritten edit, a path the
 * project lists in `updater.protected_paths` kept as its own).
 *
 * WHAT IS NOT. `.agents/instructions/agent-project.md` is the project-owned overlay.
 * The boilerplate's own copy carries THIS repository's exceptions (its git
 * strategy divergence, its push authorization), so it never travels: the sync
 * excludes it, and a project that has none receives a GENERIC stub instead,
 * rendered from `agent-project.md.template` (a non-`.md` name on purpose, so the
 * `instructions:check` gate and every `*.md` section reader ignore it).
 * Delivered once, never touched again. Same idea as `.agents/project.schema.yaml`
 * standing in for the maintainer's `.agents/project.yaml`, and the same answer
 * to the same risk: a leak gate refuses a stub that carries the boilerplate's
 * own text.
 *
 * THE MIGRATION. A project scaffolded before the split still has the single
 * monolithic `AGENTS.md`, which is protected (never rewritten). The parity row
 * for it maps each legacy heading to the section file that now ships it, and
 * names the headings that are the project's own so they move into `agent-project.md`
 * (`LEGACY_SECTION_HOMES`, consumed by `updater-parity.ts`). This module imports
 * nothing from the parity module: the parity module imports from here.
 *
 * THE RENAME. The sections once carried a number (`80-git.md`); every file but
 * the README now carries the `agent-` prefix instead (`agent-git.md`), with the
 * same frontmatter `id`. A project's copies under the numbered names leave
 * through the deprecated-files mechanism, backed up first
 * (`RENAMED_SECTION_FILES`); its overlay, `project.md`, is MOVED to
 * `agent-project.md` byte for byte, never regenerated from the template
 * (`migrateLegacyProjectInstructions`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The component's folder: L1 of the project instructions. */
export const INSTRUCTIONS_DIR = '.agents/instructions';
/** The project-owned overlay. Excluded from the sync; delivered once as a stub. */
export const PROJECT_INSTRUCTIONS_FILE = `${INSTRUCTIONS_DIR}/agent-project.md`;
/** The generic stub a project receives in place of the boilerplate's own `agent-project.md`. */
export const PROJECT_INSTRUCTIONS_TEMPLATE = `${INSTRUCTIONS_DIR}/agent-project.md.template`;
/** The overlay's name before the `agent-` rename: moved to `PROJECT_INSTRUCTIONS_FILE`, never synced. */
export const LEGACY_PROJECT_INSTRUCTIONS_FILE = `${INSTRUCTIONS_DIR}/project.md`;
/** The heading the boilerplate's own `agent-project.md` keeps its git exception under (Addendum 1). */
export const PROJECT_GIT_HEADING = '## Git Strategy (this repository)';

// ============================================================================
// LEAK GATE
// ============================================================================

/**
 * Text that only the boilerplate's OWN `agent-project.md` has any reason to carry:
 * the vocabulary of its accepted ruleset divergence and its standing push
 * authorization. A stub that matches one of these is the maintainer's file, or
 * a copy of it, and is refused. The verbatim-line check below catches the next
 * leak no pattern names.
 */
export const STUB_LEAK_PATTERNS: ReadonlyArray<{ name: string, re: RegExp }> = [
  { name: 'the accepted ruleset divergence', re: /accepted[ _]divergences?/i },
  { name: 'the boilerplate describing itself', re: /\bthe boilerplate itself\b/i },
  { name: 'a ruleset bypass list', re: /\bbypass list\b/i },
  { name: 'an admin push credential', re: /\badmin credential\b/i },
  { name: 'a standing push authorization', re: /\bstanding authorization\b/i },
];

/** A non-heading line shorter than this is too generic to call a leak when it repeats. */
const LEAK_LINE_MIN = 40;

export interface StubLeak {
  /** 1-based line in the stub. */
  line: number
  why: string
  text: string
}

/** Body lines of a markdown file: no frontmatter, no headings, no blank lines. */
function bodyLines(text: string): Array<{ line: number, text: string }> {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end !== -1) { start = end + 1; }
  }
  const out: Array<{ line: number, text: string }> = [];
  for (let i = start; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) { continue; }
    out.push({ line: i + 1, text: t });
  }
  return out;
}

/**
 * Why `stub` must not ship. Empty when it is safe. `ownProjectMd` is the
 * boilerplate's own `agent-project.md` (the file the stub replaces): a body line the
 * two share verbatim is a leak, because the stub is generic by contract and the
 * boilerplate's file is not. Frontmatter and headings are exempt: the stub
 * keeps the overlay's `id`, `title` and `load_when` on purpose.
 */
export function findStubLeaks(stub: string, ownProjectMd: string | null): StubLeak[] {
  const leaks: StubLeak[] = [];
  const own = new Set(ownProjectMd === null ? [] : bodyLines(ownProjectMd).map(l => l.text).filter(t => t.length >= LEAK_LINE_MIN));
  for (const { line, text } of bodyLines(stub)) {
    const pattern = STUB_LEAK_PATTERNS.find(p => p.re.test(text));
    if (pattern) { leaks.push({ line, why: pattern.name, text }); continue; }
    if (own.has(text)) { leaks.push({ line, why: 'a line copied from the boilerplate\'s own agent-project.md', text }); }
  }
  return leaks;
}

// ============================================================================
// STUB DELIVERY
// ============================================================================

export type StubDelivery
  = | { kind: 'present' }
    | { kind: 'no-template' }
    | { kind: 'refused', leaks: StubLeak[] }
    | { kind: 'delivered', dryRun: boolean };

function readOrNull(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); }
  catch { return null; }
}

/**
 * Give a project that has no `agent-project.md` the generic stub, once. A project
 * that has one keeps it untouched, whatever it says. An upstream that predates
 * the template delivers nothing, and a template that fails the leak gate is
 * refused (the caller reports it). A dry run reports what it would write.
 */
export function deliverProjectInstructionsStub(
  repoRoot: string,
  upstreamDir: string,
  opts: { dryRun?: boolean } = {},
): StubDelivery {
  const target = path.join(repoRoot, ...PROJECT_INSTRUCTIONS_FILE.split('/'));
  // A legacy `project.md` is the project's overlay under its old name:
  // `migrateLegacyProjectInstructions` moves it, the stub never replaces it.
  if (fs.existsSync(target) || fs.existsSync(path.join(repoRoot, ...LEGACY_PROJECT_INSTRUCTIONS_FILE.split('/')))) { return { kind: 'present' }; }
  const stub = readOrNull(path.join(upstreamDir, ...PROJECT_INSTRUCTIONS_TEMPLATE.split('/')));
  if (stub === null) { return { kind: 'no-template' }; }
  const leaks = findStubLeaks(stub, readOrNull(path.join(upstreamDir, ...PROJECT_INSTRUCTIONS_FILE.split('/'))));
  if (leaks.length > 0) { return { kind: 'refused', leaks }; }
  if (opts.dryRun !== true) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, stub, 'utf8');
  }
  return { kind: 'delivered', dryRun: opts.dryRun === true };
}

// ============================================================================
// THE agent- RENAME (numbered sections retired, project.md moved)
// ============================================================================

/** Old section file name -> new one, inside `INSTRUCTIONS_DIR`. The overlay is not here: it moves, it is not retired. */
export const RENAMED_SECTION_FILES: Readonly<Record<string, string>> = {
  '01-critical-rules.md': 'agent-critical-rules.md',
  '10-harnesses.md': 'agent-harnesses.md',
  '15-context-map.md': 'agent-context-map.md',
  '20-skills-and-mcps.md': 'agent-skills-and-mcps.md',
  '30-tool-resolution.md': 'agent-tool-resolution.md',
  '40-project-variables.md': 'agent-project-variables.md',
  '50-ticket-work.md': 'agent-ticket-work.md',
  '60-local-context-pbi.md': 'agent-local-context-pbi.md',
  '70-code-quickref.md': 'agent-code-quickref.md',
  '80-git.md': 'agent-git.md',
  '90-orchestration-detail.md': 'agent-orchestration-detail.md',
  'project.md.template': 'agent-project.md.template',
};

export type ProjectInstructionsMigration
  = | { kind: 'none' }
    | { kind: 'moved', dryRun: boolean }
    /** Both names exist: nothing moves; the project merges the legacy file by hand. */
    | { kind: 'both' };

/**
 * Move a project's `project.md` to `agent-project.md`, content byte for byte,
 * when only the legacy name exists. Never regenerated from the template, never
 * merged: when both exist the project wrote the new one itself, and both stay
 * for it to reconcile. A dry run reports what it would move.
 */
export function migrateLegacyProjectInstructions(repoRoot: string, opts: { dryRun?: boolean } = {}): ProjectInstructionsMigration {
  const legacy = path.join(repoRoot, ...LEGACY_PROJECT_INSTRUCTIONS_FILE.split('/'));
  const target = path.join(repoRoot, ...PROJECT_INSTRUCTIONS_FILE.split('/'));
  if (!fs.existsSync(legacy)) { return { kind: 'none' }; }
  if (fs.existsSync(target)) { return { kind: 'both' }; }
  if (opts.dryRun !== true) { fs.renameSync(legacy, target); }
  return { kind: 'moved', dryRun: opts.dryRun === true };
}

/**
 * The clause + note for the `AGENTS.md` drift row of a project whose own
 * (protected, never rewritten) `AGENTS.md` still names a section by its
 * numbered path. Null when it names none. The sections themselves already
 * arrive under the new names; only the project's references move by hand.
 */
export function renamedSectionsNote(filePath: string, project: string): { clause: string, note: string } | null {
  if (filePath !== 'AGENTS.md') { return null; }
  const stale = Object.entries({ ...RENAMED_SECTION_FILES, 'project.md': 'agent-project.md' })
    .filter(([from]) => new RegExp(`(?<![\\w-])${from.replace(/\./g, '\\.')}(?!\\w|\\.template)`).test(project));
  if (stale.length === 0) { return null; }
  return {
    clause: `${filePath} still names ${stale.length} instruction file(s) by the pre-rename name: rename ${stale.map(([from, to]) => `${from} -> ${to}`).join(', ')}`,
    note: `The files under ${INSTRUCTIONS_DIR}/ now carry the \`agent-\` prefix instead of a number (same frontmatter \`id\`). \`bun sync\` retired the numbered copies (backed up under .backups/) and moved project.md to agent-project.md; ${filePath} is yours, so rename every path it names, then run \`bun run instructions:check\`.`,
  };
}

// ============================================================================
// LEGACY AGENTS.md MIGRATION (heading map)
// ============================================================================

/**
 * Where a heading of the pre-split single-file `AGENTS.md` lives now.
 *  - `moved`: the whole section ships as a synced section file; the project's
 *    copy in `AGENTS.md` is redundant once nothing of its own is in it.
 *  - `split`: L0 keeps part of it (binding sentences, the core) and a section
 *    file holds the rest; the project's body differs from upstream's on purpose.
 *  - `stays`: still in L0, whole.
 *  - `app`: an adopted app's preserved block; it stays where it is.
 */
export type LegacyHomeKind = 'moved' | 'split' | 'stays' | 'app';

export interface LegacyHome {
  kind: LegacyHomeKind
  /** Repo-relative file(s) holding the text now. */
  files: string[]
}

const S = (file: string): string => `${INSTRUCTIONS_DIR}/${file}`;

/**
 * The pre-split `AGENTS.md` headings, matched by their section number (the
 * stable part: projects reword titles) and, for the unnumbered ones, by title.
 * A heading that matches nothing here is the project's own.
 */
export const LEGACY_SECTION_HOMES: ReadonlyArray<{ match: RegExp, home: LegacyHome }> = [
  { match: /^0\.\s/, home: { kind: 'app', files: ['AGENTS.md'] } },
  { match: /^1\.\s/, home: { kind: 'split', files: ['AGENTS.md', S('agent-critical-rules.md')] } },
  { match: /^2\.\s/, home: { kind: 'stays', files: ['AGENTS.md'] } },
  { match: /^3\.\s/, home: { kind: 'split', files: ['AGENTS.md', S('agent-orchestration-detail.md')] } },
  { match: /^4\.\s/, home: { kind: 'moved', files: [S('agent-context-map.md')] } },
  { match: /^5\.\s/, home: { kind: 'moved', files: [S('agent-skills-and-mcps.md')] } },
  { match: /^Skills T1\b/i, home: { kind: 'moved', files: [S('agent-skills-and-mcps.md')] } },
  { match: /^Skill modes\b/i, home: { kind: 'moved', files: [S('agent-skills-and-mcps.md')] } },
  { match: /^MCPs\b/i, home: { kind: 'moved', files: [S('agent-skills-and-mcps.md')] } },
  { match: /^5\.5\s/, home: { kind: 'moved', files: [S('agent-harnesses.md')] } },
  { match: /^6\.5?\s/, home: { kind: 'moved', files: [S('agent-tool-resolution.md')] } },
  { match: /^7\.\s/, home: { kind: 'moved', files: [S('agent-project-variables.md')] } },
  { match: /^8\.\s/, home: { kind: 'moved', files: [S('agent-ticket-work.md')] } },
  { match: /^9\.\s/, home: { kind: 'moved', files: [S('agent-local-context-pbi.md')] } },
  { match: /^10\.\s/, home: { kind: 'moved', files: [S('agent-code-quickref.md')] } },
  { match: /^11\.\s/, home: { kind: 'moved', files: [S('agent-git.md')] } },
  // The generic pointer moved to agent-git.md; a project's OWN exception under it
  // belongs in agent-project.md (Addendum 1), which the row says.
  { match: /^Git Strategy$/i, home: { kind: 'moved', files: [S('agent-git.md'), PROJECT_INSTRUCTIONS_FILE] } },
  { match: /^12\.\s/, home: { kind: 'stays', files: ['AGENTS.md'] } },
];

/** The new home of a legacy heading (its text, without the `#` marks), or null for the project's own. */
export function legacyHeadingHome(heading: string): LegacyHome | null {
  const h = heading.replace(/^#+\s*/, '').trim();
  return LEGACY_SECTION_HOMES.find(e => e.match.test(h))?.home ?? null;
}

/** The marker only the split L0 carries: its router table. */
export const L0_ROUTER_MARKER = '<!-- router:start -->';

/** True when `text` is a progressive-disclosure L0 (it has the router), not the legacy single file. */
export function isSplitL0(text: string): boolean {
  return text.split('\n').some(l => l.trim() === L0_ROUTER_MARKER);
}
