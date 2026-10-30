/**
 * @fileoverview Parity report after `bun sync`: ONE table of what still
 * differs from upstream per surface, with concrete evidence, and ONE prompt the
 * user hands to their AI so every row gets a decision (keep project | take
 * upstream | merge) BEFORE anything is edited.
 *
 * Inputs are collected by the wrapper at afterApply time, while the upstream
 * clone is still on disk:
 *
 *  - protected watchlist entries that drifted this run (`updater-drift.ts`);
 *  - the compatibility check (`checkAgentCompatibility`): its errors are the
 *    only BLOCKING findings, and the MCP set errors are folded per host. When a
 *    compat error and a watched-file drift name the SAME path, they fold into
 *    one row (compat evidence first, drift evidence appended);
 *  - skills the cross-harness migration archived because `.agents/skills/`
 *    already owned the name (this run's, plus any archive dir entry that has
 *    not been nudged yet; one marker per skill under `.template/upstream-sha/`);
 *  - the retired command-alias overlay when a project still has one (one
 *    informational row), and every project command the compat hook moved
 *    aside because it carried a skill's name (one informational row each);
 *  - components held back this run, with their lock commits;
 *  - `.env` keys upstream documents and the project lacks;
 *  - the `git_strategy` provenance stamp in `.agents/project.yaml`.
 *
 * Rules: no finding without evidence (a heading, a key, a server id, a count);
 * ids are sequential per run; the prompt speaks in headings and sections,
 * never in rule numbers. Full diffs go to the saved file, never to the terminal.
 * A `merge` on a watched file always says what to port and what to keep (the
 * upstream additions vs the project-only keys or sections); a structural
 * (identity) file compares keys only and fires, labelled `informational`, for
 * upstream additions alone.
 */

import type { CompatibilityErrorGroup } from './agent-compatibility.ts';
import type { MapStatus } from './context-maps.ts';
import type { LegacyHomeKind } from './updater-instructions.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import * as path from 'node:path';

import { parse as parseYaml } from 'yaml';
import { stripJsonComments } from './agent-compatibility-contracts.ts';
import { compatibilityErrorGroup, HARNESS_COMMAND_DIRS, RETIRED_COMMAND_ALIAS_OVERLAY, SHADOWING_COMMANDS_BACKUP_DIR } from './agent-compatibility.ts';
import { contextMapAdvice, contextMapStatuses, mapRelPath } from './context-maps.ts';
import { HARNESS_LEVEL_MCPS } from './harness-level-mcps.ts';
import { declaredHarnesses } from './harness-selection.ts';
import { INSTRUCTIONS_DIR, isSplitL0, legacyHeadingHome, PROJECT_INSTRUCTIONS_FILE, renamedSectionsNote } from './updater-instructions.ts';
import { CLAUDE_SETTINGS_FILE, DECLINED_DENIES_KEY, DECLINED_HOOKS_KEY, OPENCODE_SETTINGS_FILE, opencodeDenyGap } from './updater-settings.ts';

// ============================================================================
// TYPES
// ============================================================================

export type ParitySurface = 'instructions' | 'skills' | 'hooks' | 'mcp' | 'env' | 'components' | 'package' | 'git' | 'gates';

/**
 * `take upstream` is reserved for content the project lacks entirely. A row
 * whose evidence names something only the project has (a server, a key, a
 * heading, an edit) suggests `merge`: following `take upstream` literally
 * there would delete it.
 */
export type ParitySuggestion
  = 'keep project' | 'take upstream' | 'merge' | 'run agents:compat' | 'decide';

export interface ParityFinding {
  id: number
  surface: ParitySurface
  path: string
  /** Concrete, scannable: headings, keys, server ids, counts. Never a diff. */
  evidence: string
  suggested: ParitySuggestion
  /**
   * Blocking = a failed compatibility contract, a kept file whose upstream hunk
   * another file of the same release depends on (`PATH_PREREQUISITES`), or a
   * missing config block a shipped skill reads (`CONFIG_BLOCK_READERS`).
   * Ordinary watched-file drift never blocks.
   */
  blocking: boolean
  /** Full paired diff, written to the saved file under the finding's heading. */
  diff?: string
  /** Plain-text detail (gate output, the two package.json values), written to the saved file when there is no diff. */
  detail?: string
  /** A follow-up the saved file repeats under the row (how to keep a merge on the next sync). */
  note?: string
  /**
   * `--adopt` only: this row's `take upstream` is deliberate and survives the
   * adopt rewrite to `merge` (the app's hand copy of a framework skill, whose
   * upstream copy the adoption saved for an approved replacement).
   */
  adoptTakeUpstream?: boolean
}

/** A synced file the project had edited that this run overwrote (`RunSummary.localEditsOverwritten`). */
export interface LocalEditInput {
  path: string
  component: string
  /** Absolute path of the pre-write backup copy, or null when none was written. */
  backupPath: string | null
}

export interface PackageJsonKeptInput {
  file: string
  section: string
  key: string
  localValue: string
  upstreamValue: string
}

/** Outcome of one quality gate the wrapper ran after the apply (`types:check`, `lint:check`). */
export interface GateResult {
  script: string
  status: 'pass' | 'fail' | 'timeout' | 'error'
  exitCode: number | null
  /** Seconds the gate took. */
  seconds: number
  errorCount: number
  /** The first error lines of the output, already trimmed. */
  firstErrors: string[]
  /** Repo-relative paths named by the errors that THIS run applied. */
  failingApplied: string[]
  /** Complete combined output, for the saved file. */
  output: string
}

export interface ParityDriftInput {
  path: string
  reason: string
  /** Compare keys only (project identity file): a row for upstream additions, none for value differences. */
  structural?: boolean
  /** `project` = declared in `updater.protected_paths`: a synced component file, so its row sits on Skills or Componentes. */
  source?: 'upstream' | 'project'
}

export interface HeldBackComponent {
  component: string
  lockCommit: string | null
}

export interface ParityInput {
  /** Project root (the consumer repo). */
  root: string
  /** Upstream clone directory, still on disk during afterApply. */
  upstreamDir: string
  /** Watchlist entries that drifted this run (already filtered by the sha markers). */
  drift: ParityDriftInput[]
  /** `checkAgentCompatibility().errors`. */
  compatErrors: string[]
  /** Skills to report as archived (names only); see `archivedSkillsToReport`. */
  archivedSkills: string[]
  /** Directory holding the archived skills (`<MIGRATION_BACKUP_DIR>/skills`). */
  archivedSkillsDir: string
  heldBack: HeldBackComponent[]
  /** Keys upstream `.env.example` documents that the project's `.env` / `.env.example` lack. */
  envNewKeys: string[]
  /** Project-edited synced files this run overwrote. */
  localEdits?: LocalEditInput[]
  /** `package.json` keys kept at the project's value while upstream differs. */
  packageJsonKept?: PackageJsonKeptInput[]
  /** Quality gates run after the apply; only failed / timed-out ones become rows. */
  gates?: GateResult[]
  /** Project commands the compat hook moved to `SHADOWING_COMMANDS_BACKUP_DIR` this run. */
  shadowingCommandsMoved?: string[]
  /** A legacy git-tracked `.context/PBI/` cache (see `updater-pbi.ts`): one row, the recipe in its file. */
  pbiCache?: PbiCacheInput | null
  /** `permissions.allow` entries the additive merge appended to `.claude/settings.json` this run (`updater-settings.ts`). */
  allowListAdded?: string[]
  /** `permissions.deny` entries the same merge appended this run. */
  denyListAdded?: string[]
  /** Upstream deny entries the project lacks and declined through `updater.declined_denies`. */
  denyListDeclined?: string[]
  /** Hook commands the additive hook merge appended to `.claude/settings.json` (`formatHookCommand`). */
  hooksAdded?: string[]
  /** Upstream hook commands the project lacks and declined through `updater.declined_hooks`. */
  hooksDeclined?: string[]
  /** Upstream hook commands not appended because the script they run is missing in the project. */
  hooksSkipped?: string[]
  /** Keys `.claude/settings.json` repeated, folded into one list by the hook merge. */
  settingsDuplicatesFolded?: string[]
  /** Evidence for the unresolved-doctrine ledger row (`runDoctrineLedger`), when there is debt. */
  doctrineDebt?: string | null
  /** The file that row is about. Defaults to `AGENTS.md` (`DOCTRINE_FILE`). */
  doctrineFile?: string
  /** Prerequisite declarations, keyed by repo-relative path. Defaults to `PATH_PREREQUISITES`. */
  prerequisites?: Record<string, PathPrerequisite>
  /** Which shipped skill reads which top-level config block. Defaults to `CONFIG_BLOCK_READERS`. */
  configBlockReaders?: Record<string, Record<string, ConfigBlockReader>>
  /** Business context map states; defaults to reading them from `root` (`contextMapStatuses`). */
  contextMaps?: MapStatus[]
  /** Disk-profile lines in the project's skills and instructions; defaults to scanning `root` (`browserProfileDrift`). */
  browserProfileSites?: BrowserProfileSite[]
  /** `bun sync --adopt` only: the rows `runAdopt` built (`./updater-adopt.ts`), listed before the git-strategy row. */
  adoptFindings?: Omit<ParityFinding, 'id'>[]
  /**
   * The run is `--adopt`: every file a row names was the APP's before this run,
   * so no row suggests `take upstream` (it would replace the app's own
   * `tsconfig.json`, say); `merge` instead, saying why.
   */
  adopting?: boolean
}

export interface PbiCacheInput {
  /** Tracked paths outside the committed allowlist. */
  tracked: number
  /** Repo-relative path of the saved migration recipe. */
  recipePath: string
}

export interface ParityMeta {
  templateRepo: string
  upstreamSha: string
  lockSha: string
  /** Repo-relative path of the saved prompt file (named inside the prompt). */
  promptFile: string
}

export type SurfaceState = 'ok' | 'warn' | 'blocked';

export interface SurfaceRow {
  surface: ParitySurface
  label: string
  state: SurfaceState
  cell: string
}

export interface ParityReport {
  /** One row per surface, in `SURFACE_ORDER`; the wrapper renders them with `tui.table`. */
  surfaces: SurfaceRow[]
  prompt: string
  fileBody: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const PARITY_PROMPT_PATH = path.join('.agents', 'prompts', 'parity-plan.md');
/** One marker per archived skill, next to the watchlist sha markers (gitignored). */
const ARCHIVED_SKILL_MARKER_DIR = path.join('.template', 'upstream-sha');

const MCP_HOST_FILE: Record<string, string> = {
  claude: '.mcp.json',
  opencode: 'opencode.jsonc',
  codex: '.codex/config.toml',
};

/** Order of the surfaces in every table. */
export const SURFACE_ORDER: ParitySurface[] = ['instructions', 'skills', 'hooks', 'mcp', 'env', 'components', 'package', 'git', 'gates'];

/** English labels for the prompt (the AI reads it). */
const SURFACE_LABEL_EN: Record<ParitySurface, string> = {
  instructions: 'Instructions',
  skills: 'Skills',
  hooks: 'Hooks',
  mcp: 'MCP',
  env: 'Env',
  components: 'Components',
  package: 'package.json',
  git: 'Git',
  gates: 'Gates',
};

/** Spanish labels for the terminal table (the human reads it). */
const SURFACE_LABEL_ES: Record<ParitySurface, string> = {
  instructions: 'Instrucciones y config',
  skills: 'Skills',
  hooks: 'Hooks',
  mcp: 'MCP',
  env: 'Env',
  components: 'Componentes',
  package: 'package.json',
  git: 'Git',
  gates: 'Verificación',
};

/** The other two MCP registries a host's project-only server must be declared in. */
function otherMcpHostFiles(host: string): string {
  return Object.entries(MCP_HOST_FILE).filter(([id]) => id !== host).map(([, file]) => file).join(' and ');
}

const MAX_NAMES = 3;

/** Appended to every overwritten-edit row: the one-line fix that makes the next sync keep the merge. */
export const PROTECT_HINT = 'add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge';

/** The same fix, spelled out as the YAML to paste, repeated under the row in the saved file. */
export function protectNote(filePath: string): string {
  return [
    `Keep this merge on the next sync: ${PROTECT_HINT}:`,
    '',
    '    updater:',
    '      protected_paths:',
    `        - ${filePath}`,
  ].join('\n');
}

/** The project-owned pre-commit hook (watchlisted: delivered once, never overwritten). */
export const HUSKY_PRE_COMMIT = '.husky/pre-commit';

/** Its pre-push sibling. Same delivery: once when missing, then project-owned. */
export const HUSKY_PRE_PUSH = '.husky/pre-push';

/** The commit-message sibling. Same delivery; its gates are warn-only. */
export const HUSKY_COMMIT_MSG = '.husky/commit-msg';

/** The SYNCED file every hook sources to get the gates upstream owns. */
export const HUSKY_GATES_FILE = '.husky/framework-gates.sh';

/**
 * Every husky hook is bootstrap-only: delivered once when missing, then
 * project-owned, because a project's own gates live in them. The cost was that
 * a gate added upstream never reached a project scaffolded earlier.
 *
 * Upstream's fix is the gates split: the gates upstream owns live in the
 * SYNCED `.husky/framework-gates.sh`, and each hook sources it and calls one
 * function. A hook that predates the split keeps every gate inlined and will
 * never see another one, and nothing but this row can tell it so. The same
 * holds for a project that already had its own `.husky/commit-msg`
 * (commitlint, say): ours is never delivered over it, so this row is the only
 * way the warn-only trailer check reaches it.
 *
 * Returns the adoption note (the block to paste) while the hook does not source
 * the gates file; null once it does. A mention in a comment is not adoption.
 */
export function frameworkGatesNote(projectHook: string, hookPath: string): string | null {
  const sourced = projectHook
    .split('\n')
    .some(line => !line.trimStart().startsWith('#') && line.includes('framework-gates.sh'));
  if (sourced) { return null; }
  const fn = hookPath === HUSKY_PRE_PUSH
    ? 'framework_gates_pre_push'
    : hookPath === HUSKY_COMMIT_MSG ? 'framework_gates_commit_msg "$1"' : 'framework_gates_pre_commit';
  return [
    `Adopt the gates split in ${hookPath}. Your gates and their ordering stay yours; replace only the block`,
    'that runs upstream\'s gates with the call below, and every gate a future release adds arrives with',
    `${HUSKY_GATES_FILE} instead of needing this file rewritten:`,
    '',
    '    GATES="$(dirname -- "$0")/framework-gates.sh"',
    '    if [ -f "$GATES" ]; then',
    '      . "$GATES"',
    `      ${fn}`,
    '    fi',
    '',
    'The `-f` guard is not decoration: `.husky/_/h` runs the hook under `sh -e`, so sourcing a file that is',
    'not there kills the hook. Read the synced file for what each gate covers.',
  ].join('\n');
}

export interface PathPrerequisite {
  /** What the upstream hunk is needed FOR, in one scannable phrase. */
  requiredBy: string
  /** The project's own gate that proves it, named in the row. */
  gate: string
}

/**
 * Files whose upstream hunk is a PREREQUISITE for something else the same
 * release ships. A kept copy of one of these (a watched path, or one the
 * project declared in `updater.protected_paths`) is not cosmetic drift: the
 * release is half-delivered until the hunk lands, and the row has to say so.
 *
 * Measured in the sibling QA boilerplate: upstream shipped a skill declaring a
 * new category AND the one-line `scripts/lint-skills.ts` change that admits it.
 * The project protected that script, so only the skill arrived and
 * `bun run skills:check` failed on a freshly synced repo, while the row's whole
 * evidence was a hunk count indistinguishable from a cosmetic diff.
 */
export const PATH_PREREQUISITES: Record<string, PathPrerequisite> = {
  'scripts/lint-skills.ts': {
    requiredBy: 'the skill vocabulary (categories, `metadata.kind`) every .agents/skills/**/SKILL.md is linted against; a skill shipped in the same release that declares a new value stays unlintable until this file carries it',
    gate: 'bun run skills:check',
  },
};

export interface ConfigBlockReader {
  /** The skill that reads the block, spelled as it is invoked. */
  skill: string
  /** What the skill needs the block FOR, in one scannable phrase. */
  requiredBy: string
}

/**
 * Top-level blocks of a structural config file that a SHIPPED SKILL reads,
 * per file. A block upstream added and the project does not have is otherwise
 * reported as `structural`: informational, never blocking. That is right for
 * project identity, but wrong the moment a skill in the same release reads the
 * block: the release ships a skill that fails at RUNTIME, in the middle of
 * somebody's session, rather than at sync time when there is a prompt and an
 * operator.
 *
 * So the rule is narrow on purpose: the block must be MISSING (a block that is
 * present with different values stays informational, always), top-level, and
 * DECLARED here. Nothing is inferred. Declaring a block is the deliberate act
 * of saying "a skill breaks without this", and the cost of that act is one
 * blocking row for every project that lacks it.
 *
 * It lives beside `PATH_PREREQUISITES`, the same statement about a different
 * unit: that one says a kept FILE leaves the release half-delivered, this one
 * says a missing BLOCK does.
 */
export const CONFIG_BLOCK_READERS: Record<string, Record<string, ConfigBlockReader>> = {
  '.agents/project.yaml': {
    git_strategy: {
      skill: '/git-flow-master',
      requiredBy: 'the branching strategy, the protected-branch list and `policy.direct_push_to_protected`, resolved before every push; without the block the skill cannot tell an authorized direct push from a forbidden one, and `bun run git:policy verify` has no declared side to compare the host ruleset against',
    },
    autonomous_delivery: {
      skill: '/autonomous-delivery',
      requiredBy: 'the master switch, the per-mode caps, the isolation mode and the gh identity asserted before every push and merge, all read in Phase 0 of every unattended run',
    },
    decision_authority: {
      skill: '/autonomous-delivery',
      requiredBy: 'whether a product call stops the run (`escalate`) or is decided by a scored subagent (`decide`), read before treating any product question as an escalation',
    },
    orchestration: {
      skill: '/orca-orchestration',
      requiredBy: 'the worker cap per round, the default harness / model / effort a worker launches with, and which orchestrator CLI and verbs to drive; without the block the skill degrades to one worker, the harness defaults and no orchestrator named',
    },
    stack: {
      skill: '/project-context',
      requiredBy: 'where the app lives (`app_root`), which schema source the maps trust (the live database or the migration files) and whether the API is Supabase-direct, read before every map, plan and roadmap run; without the block the skill assumes a greenfield app at the repo root with a live schema, which maps the wrong tree or the wrong database on an adopted app',
    },
  },
};

/**
 * Top-level blocks the project is MISSING that a shipped skill reads. Empty for
 * a file with no declaration, for one that does not parse, and for every block
 * whose only difference is its values.
 */
export function missingConfigBlocks(
  filePath: string,
  project: string,
  upstream: string,
  readers: Record<string, Record<string, ConfigBlockReader>> = CONFIG_BLOCK_READERS,
): { block: string, reader: ConfigBlockReader }[] {
  const declared = readers[filePath.replace(/\\/g, '/')];
  if (declared === undefined) { return []; }
  const mine = configEntries(project, filePath);
  const theirs = configEntries(upstream, filePath);
  if (!mine || !theirs) { return []; }
  return Object.entries(declared)
    // Top-level only: `configEntries` also carries `top.child` rows, and a
    // missing CHILD of a block the project has is a value-shaped difference,
    // not the absent-block failure this escalates.
    .filter(([block]) => theirs.has(block) && !mine.has(block))
    .map(([block, reader]) => ({ block, reader }));
}

/**
 * The clause that turns a missing declared block into a blocking row. It names
 * the skill, because the operator's real question is "what breaks if I skip
 * this", and the answer is a skill they already have installed.
 */
export function configBlockClause(missing: { block: string, reader: ConfigBlockReader }[]): string {
  const each = missing.map(m => `\`${m.block}:\` read by \`${m.reader.skill}\` for ${m.reader.requiredBy}`);
  return `BLOCKING: ${missing.length} block(s) upstream added are MISSING here and a shipped skill reads them, so it fails at runtime instead of at sync time: ${each.join(' | ')}. Take upstream's block and adapt its VALUES to this project; the values are yours, the block's existence is not`;
}

/** The declaration for a path, or null when its content gates nothing else. */
export function prerequisiteFor(
  filePath: string,
  manifest: Record<string, PathPrerequisite> = PATH_PREREQUISITES,
): PathPrerequisite | null {
  return manifest[filePath.replace(/\\/g, '/')] ?? null;
}

/**
 * The clause appended to a kept row whose hunk gates another file of the same
 * release. It names the gate as the arbiter on purpose: the declaration is
 * per-path, not per-hunk, so a project that already merged the hunk by hand
 * proves it in one command instead of arguing with the row.
 */
export function prerequisiteClause(prerequisite: PathPrerequisite): string {
  return `PREREQUISITE for this release: ${prerequisite.requiredBy}; keeping the project copy as-is fails \`${prerequisite.gate}\` (run it: it is the arbiter, and it passes if your copy already carries the hunk)`;
}

// ============================================================================
// DIFF HELPERS
// ============================================================================

export interface DiffStats {
  hunks: number
  added: number
  removed: number
}

/** Hunk / line counts of a unified diff. */
export function diffStats(diff: string): DiffStats {
  let hunks = 0;
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) { hunks += 1; }
    else if (line.startsWith('+') && !line.startsWith('+++')) { added += 1; }
    else if (line.startsWith('-') && !line.startsWith('---')) { removed += 1; }
  }
  return { hunks, added, removed };
}

/**
 * `git diff --no-index` between two paths (files or directories), uncolored,
 * `+` = what `b` has. Absolute paths in the headers are replaced by the labels
 * so the saved file reads `project/AGENTS.md` -> `upstream/AGENTS.md`, not two
 * temp-dir paths. Git prints header paths with forward slashes on every
 * platform, so a Windows `a` / `b` is normalized the same way before the
 * relabel, or the temp-dir paths would survive there. Returns '' when the
 * paths are identical or git is unavailable.
 */
export function diffNoIndex(a: string, b: string, labels: { a: string, b: string } = { a: 'project', b: 'upstream' }): string {
  const res = spawnSync('git', ['diff', '--no-index', '--no-color', '--', a, b], { encoding: 'utf8' });
  let out = res.stdout ?? '';
  const relabel = (raw: string, label: string): void => {
    const needle = raw.replace(/\\/g, '/');
    const replacement = `/${label}/${path.basename(needle)}`;
    for (const form of new Set([needle, raw])) { out = out.split(form).join(replacement); }
  };
  relabel(a, labels.a);
  relabel(b, labels.b);
  return out;
}

function formatStats(stats: DiffStats): string {
  return `${stats.hunks} hunk${stats.hunks === 1 ? '' : 's'} (+${stats.added}/-${stats.removed})`;
}

function listNames(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES).map(n => `"${n}"`).join(', ');
  return names.length > MAX_NAMES ? `${shown} +${names.length - MAX_NAMES} more` : shown;
}

// ============================================================================
// SECTION-LEVEL EVIDENCE
// ============================================================================

const HEADING_RE = /^#{1,3}\s+/;

/** Markdown sections keyed by heading (levels 1-3). Body is whitespace-normalized. */
export function markdownSections(text: string): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current = '';
  sections.set(current, []);
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (HEADING_RE.test(line)) {
      current = line.replace(HEADING_RE, '').trim();
      // A repeated heading gets a suffix so both bodies survive the comparison.
      let key = current;
      for (let n = 2; sections.has(key); n += 1) { key = `${current} (${n})`; }
      current = key;
      sections.set(current, []);
      continue;
    }
    sections.get(current)!.push(line.trimEnd());
  }
  return new Map([...sections].map(([k, v]) => [k, v.join('\n').trim()]));
}

export interface SectionDelta {
  added: string[]
  removed: string[]
  changed: string[]
}

// A separator swap alone (`## A — B` vs `## A: B`) is not a heading change:
// collapse the four interchangeable forms to one canonical token before
// comparing. Whitespace is trimmed and collapsed too, so stray double spaces
// never cause a false added/removed pair. Case-sensitive otherwise — this is
// a comparison key, never shown to the user.
const HEADING_SEPARATOR_RE = / — | – | - |:\s*/g;
/** Canonical stand-in for any of the four separator forms above. */
const HEADING_SEPARATOR_CANONICAL = ' :: ';

function normalizeHeadingKey(heading: string): string {
  return heading
    .trim()
    .replace(/\s+/g, ' ')
    .replace(HEADING_SEPARATOR_RE, HEADING_SEPARATOR_CANONICAL)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Headings upstream added / project-only / present in both with a different body. */
export function markdownSectionDelta(project: string, upstream: string): SectionDelta {
  const mine = markdownSections(project);
  const theirs = markdownSections(upstream);
  // Normalized key -> the project's own heading text, for matching across a
  // punctuation-only rename.
  const mineByKey = new Map<string, string>();
  for (const heading of mine.keys()) {
    if (heading === '') { continue; }
    mineByKey.set(normalizeHeadingKey(heading), heading);
  }

  const added: string[] = [];
  const changed: string[] = [];
  for (const [heading, body] of theirs) {
    if (heading === '') { continue; }
    const mineHeading = mineByKey.get(normalizeHeadingKey(heading));
    if (mineHeading === undefined) { added.push(heading); }
    else if (mine.get(mineHeading) !== body) { changed.push(heading); }
  }
  const theirsKeys = new Set([...theirs.keys()].filter(h => h !== '').map(normalizeHeadingKey));
  const removed = [...mine.keys()].filter(h => h !== '' && !theirsKeys.has(normalizeHeadingKey(h)));
  return { added, removed, changed };
}

/**
 * Entries of a structured config, two levels deep (`top`, `top.child` when the
 * child is a plain object), key -> value. Two levels is where MCP registries,
 * permission blocks and `git_strategy` live; deeper is noise. YAML falls back
 * to a line scan (keys only) when the parser rejects the text.
 */
export function configEntries(text: string, filePath: string): Map<string, unknown> | null {
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;
  try {
    if (ext === '.json') { parsed = JSON.parse(text); }
    else if (ext === '.jsonc') { parsed = JSON.parse(stripJsonComments(text).replace(/,(\s*[}\]])/g, '$1')); }
    else if (ext === '.toml') { parsed = Bun.TOML.parse(text); }
    else if (ext === '.yaml' || ext === '.yml') {
      try { parsed = parseYaml(text); }
      catch { return new Map(yamlKeys(text).map(k => [k, undefined])); }
    }
    else { return null; }
  }
  catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { return null; }
  const entries = new Map<string, unknown>();
  for (const [top, value] of Object.entries(parsed as Record<string, unknown>)) {
    entries.set(top, value);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) { entries.set(`${top}.${child}`, childValue); }
    }
  }
  return entries;
}

/** Keys of a structured config, two levels deep (see `configEntries`). */
export function configKeys(text: string, filePath: string): string[] | null {
  const entries = configEntries(text, filePath);
  return entries ? [...entries.keys()] : null;
}

/** Top-level and first-nested YAML keys (block style, 2-space indent), no parser needed. */
function yamlKeys(text: string): string[] {
  const keys: string[] = [];
  let top = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const topMatch = /^([\w.-]+):/.exec(line);
    if (topMatch) { top = topMatch[1]; keys.push(top); continue; }
    const childMatch = /^ {2}([\w.-]+):/.exec(line);
    if (childMatch && top !== '') { keys.push(`${top}.${childMatch[1]}`); }
  }
  return keys;
}

export interface KeyDelta {
  added: string[]
  projectOnly: string[]
  /**
   * Keys both copies have with a different value. A top key whose children
   * are entries of their own counts through them only; a nested object (an
   * MCP server entry under `mcpServers` / `mcp` / `mcp_servers`) is compared
   * whole, args, env and url included.
   */
  changed: string[]
  /** For each `changed` key holding an object on both sides: which fields differ (`args differ`, `env keys differ`). For an array on both sides: the elements added / removed. */
  changedDetail: Record<string, string>
  /** The subset of `changed` holding an ARRAY on both sides (named in full, never "values differ"). */
  changedArrays: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `a`, `a and b`, `a, b and c`. */
function joinAnd(items: string[]): string {
  if (items.length <= 1) { return items.join(''); }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Field order in an object-diff phrase: what an MCP server entry is made of, then the rest alphabetically. */
const OBJECT_FIELD_ORDER = ['type', 'transport', 'command', 'args', 'url', 'headers', 'env', 'env_vars', 'environment', 'enabled', 'disabled'];

/**
 * Which fields of two objects differ, as one phrase: `args differ`,
 * `args and env keys differ`, `command, args and url differ`. An env table
 * (`env`, `env_vars`, `environment`) is compared by key set first: `env keys
 * differ` when the variable names differ, `env values differ` when only the
 * values do.
 */
function describeObjectDelta(mine: Record<string, unknown>, theirs: Record<string, unknown>): string {
  const rank = (field: string): number => {
    const at = OBJECT_FIELD_ORDER.indexOf(field);
    return at === -1 ? OBJECT_FIELD_ORDER.length : at;
  };
  const fields = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const differing: string[] = [];
  for (const field of fields) {
    const own = mine[field];
    const other = theirs[field];
    if (stableValue(own) === stableValue(other)) { continue; }
    if ((field === 'env' || field === 'env_vars' || field === 'environment') && isPlainObject(own) && isPlainObject(other)) {
      const sameKeys = stableValue(Object.keys(own).sort()) === stableValue(Object.keys(other).sort());
      differing.push(sameKeys ? `${field} values` : `${field} keys`);
      continue;
    }
    differing.push(field);
  }
  return `${joinAnd(differing)} differ`;
}

/**
 * Which ELEMENTS of two arrays differ: `added: ["a"]`, `removed: ["b"]`, both.
 * An appended entry is not a changed value, and reporting it as one is wrong in
 * kind: `.claude/settings.json` read "values differ at permissions.allow" while
 * upstream had simply appended two `Skill(...)` permissions.
 */
function describeArrayDelta(mine: readonly unknown[], theirs: readonly unknown[]): string {
  const asText = (v: unknown): string => (typeof v === 'string' ? v : stableValue(v));
  const minePlain = mine.map(asText);
  const theirsPlain = theirs.map(asText);
  const mineSet = new Set(minePlain);
  const theirsSet = new Set(theirsPlain);
  const added = theirsPlain.filter(v => !mineSet.has(v));
  const removed = minePlain.filter(v => !theirsSet.has(v));
  const parts: string[] = [];
  if (added.length > 0) { parts.push(`added: [${listNames(added)}]`); }
  if (removed.length > 0) { parts.push(`removed: [${listNames(removed)}]`); }
  return parts.length > 0 ? parts.join(', ') : `same ${theirsPlain.length} item(s), order differs`;
}

/**
 * The changed keys as evidence: scalars by name (`values differ at: "a.x"`),
 * object entries by what differs inside (`context7: args differ`), arrays by
 * their elements with the key named in full (`"permissions.allow": added:
 * [...]`), at most `MAX_NAMES` of each named, the rest counted.
 */
function describeChangedKeys(changed: string[], detail: Record<string, string>, arrays: readonly string[] = []): string {
  const isArray = new Set(arrays);
  const scalars = changed.filter(k => !(k in detail));
  const arrayKeys = changed.filter(k => k in detail && isArray.has(k));
  const objects = changed.filter(k => k in detail && !isArray.has(k));
  const parts: string[] = [];
  if (scalars.length > 0) { parts.push(`values differ at: ${listNames(scalars)}`); }
  for (const key of arrayKeys.slice(0, MAX_NAMES)) { parts.push(`"${key}": ${detail[key]}`); }
  if (arrayKeys.length > MAX_NAMES) { parts.push(`+${arrayKeys.length - MAX_NAMES} more array(s)`); }
  if (objects.length > 0) {
    // The entry's own name: the key minus the registry it sits under.
    const shown = objects.slice(0, MAX_NAMES).map(k => `${k.slice(k.indexOf('.') + 1)}: ${detail[k]}`).join('; ');
    parts.push(objects.length > MAX_NAMES ? `${shown}; +${objects.length - MAX_NAMES} more` : shown);
  }
  return parts.join('; ');
}

/** Stable serialization for value comparison (key order of objects normalized). */
function stableValue(value: unknown): string {
  if (typeof value !== 'object' || value === null) { return JSON.stringify(value) ?? 'undefined'; }
  if (Array.isArray(value)) { return `[${value.map(stableValue).join(',')}]`; }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableValue(obj[k])}`).join(',')}}`;
}

/**
 * Upstream additions, project-only keys, and keys whose values differ. Given
 * plain key lists (no values) `changed` stays empty.
 */
export function configKeyDelta(project: readonly string[] | ReadonlyMap<string, unknown>, upstream: readonly string[] | ReadonlyMap<string, unknown>): KeyDelta {
  const mine = project instanceof Map ? project : new Map((project as readonly string[]).map(k => [k, undefined]));
  const theirs = upstream instanceof Map ? upstream : new Map((upstream as readonly string[]).map(k => [k, undefined]));
  const withValues = project instanceof Map && upstream instanceof Map;
  const added = [...theirs.keys()].filter(k => !mine.has(k));
  const projectOnly = [...mine.keys()].filter(k => !theirs.has(k));
  const changed: string[] = [];
  const changedDetail: Record<string, string> = {};
  const changedArrays: string[] = [];
  if (withValues) {
    // A key whose children are entries of their own (a top key holding an
    // object) is judged through them; anything else is compared whole.
    const expanded = (key: string): boolean => {
      const prefix = `${key}.`;
      for (const k of theirs.keys()) { if (k.startsWith(prefix)) { return true; } }
      for (const k of mine.keys()) { if (k.startsWith(prefix)) { return true; } }
      return false;
    };
    for (const [key, value] of theirs) {
      if (!mine.has(key) || expanded(key)) { continue; }
      const own = mine.get(key);
      if (stableValue(own) === stableValue(value)) { continue; }
      changed.push(key);
      if (isPlainObject(own) && isPlainObject(value)) { changedDetail[key] = describeObjectDelta(own, value); }
      else if (Array.isArray(own) && Array.isArray(value)) {
        changedDetail[key] = describeArrayDelta(own, value);
        changedArrays.push(key);
      }
    }
  }
  return { added, projectOnly, changed, changedDetail, changedArrays };
}

export interface WatchedFileEvidence {
  evidence: string
  /** The project has headings or keys upstream lacks: `take upstream` would delete them. */
  projectOnly: boolean
  /** The cost-aware verb: what porting upstream would add, and what it would cost the project. */
  suggested: ParitySuggestion
}

/**
 * Verb + evidence for one watched file from what the two copies share and
 * lack. `unit` names the structure compared ("key" / "heading"). Never a bare
 * `merge`: the evidence says what to port and what to keep.
 */
function costSignal(
  unit: string,
  added: string[],
  projectOnly: string[],
  changed: string[],
  changedDetail: Record<string, string> = {},
  changedArrays: readonly string[] = [],
): { parts: string[], suggested: ParitySuggestion } {
  const units = (n: number): string => `${unit}${n === 1 ? '' : 's'}`;
  const changedNote = unit === 'heading' ? `body differs in ${changed.length}: ${listNames(changed)}` : describeChangedKeys(changed, changedDetail, changedArrays);
  if (added.length > 0 && projectOnly.length > 0) {
    const parts = [`port upstream additions only: ${listNames(added)}`, `keep project-only ${units(projectOnly.length)}: ${listNames(projectOnly)}`];
    if (changed.length > 0) { parts.push(changedNote); }
    return { parts, suggested: 'merge' };
  }
  if (added.length > 0) {
    if (changed.length === 0) { return { parts: [`upstream added ${added.length} ${units(added.length)}: ${listNames(added)}`, 'nothing project-only'], suggested: 'take upstream' }; }
    return { parts: [`port upstream additions only: ${listNames(added)}`, `keep project ${unit === 'heading' ? 'bodies' : 'values'} at: ${listNames(changed)}`], suggested: 'merge' };
  }
  if (projectOnly.length > 0) {
    if (changed.length === 0) { return { parts: [`project-only ${units(projectOnly.length)}: ${listNames(projectOnly)}`, 'upstream adds nothing'], suggested: 'keep project' }; }
    return { parts: [`keep project-only ${units(projectOnly.length)}: ${listNames(projectOnly)}`, `${changedNote} (port what you want)`], suggested: 'merge' };
  }
  if (changed.length > 0) { return { parts: [`same ${units(2)}, ${changedNote} (port what you want, keep the rest)`], suggested: 'merge' }; }
  return { parts: [`same ${units(2)} and ${unit === 'heading' ? 'bodies' : 'values'}; formatting or comments differ`], suggested: 'keep project' };
}

/** Evidence for a watched file, from its two copies plus the diff. */
export function watchedFileEvidence(filePath: string, project: string, upstream: string, diff: string): WatchedFileEvidence {
  const stats = formatStats(diffStats(diff));
  let parts: string[];
  let projectOnly = false;
  let suggested: ParitySuggestion = 'merge';
  if (path.extname(filePath).toLowerCase() === '.md') {
    const delta = markdownSectionDelta(project, upstream);
    projectOnly = delta.removed.length > 0;
    ({ parts, suggested } = costSignal('heading', delta.added, delta.removed, delta.changed));
  }
  else {
    const mine = configEntries(project, filePath);
    const theirs = configEntries(upstream, filePath);
    if (mine && theirs) {
      const delta = configKeyDelta(mine, theirs);
      projectOnly = delta.projectOnly.length > 0;
      ({ parts, suggested } = costSignal('key', delta.added, delta.projectOnly, delta.changed, delta.changedDetail, delta.changedArrays));
    }
    else {
      // No key structure (a shell hook, a JS config): the hunks are the evidence.
      parts = ['content differs (no key structure): review the hunks in the saved file'];
    }
  }
  return { evidence: `${parts.join('; ')}; ${stats}`, projectOnly, suggested };
}

/**
 * Structure-only comparison for a project identity file: keys or headings
 * upstream added, nothing else. `null` when upstream added nothing (a value
 * difference is project identity, not drift: no row).
 */
export function structuralEvidence(filePath: string, project: string, upstream: string): string | null {
  let added: string[];
  let unit: string;
  if (path.extname(filePath).toLowerCase() === '.md') {
    added = markdownSectionDelta(project, upstream).added;
    unit = 'heading';
  }
  else {
    const mine = configEntries(project, filePath);
    const theirs = configEntries(upstream, filePath);
    if (!mine || !theirs) { return null; }
    added = configKeyDelta(mine, theirs).added;
    unit = 'key';
  }
  if (added.length === 0) { return null; }
  return `informational: upstream added ${added.length} ${unit}${added.length === 1 ? '' : 's'}: ${listNames(added)}; merge = add the new ${unit}s, values are project identity and never compared`;
}

/** Registry keys of the three MCP host files (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`). */
const MCP_REGISTRY_KEYS = ['mcpServers', 'mcp', 'mcp_servers'];

/** Server ids among `ids` the project file declares and the upstream copy no longer does. */
function serversUpstreamDropped(filePath: string, project: string, upstream: string, ids: readonly string[]): string[] {
  if (!Object.values(MCP_HOST_FILE).includes(filePath)) { return []; }
  const mine = configEntries(project, filePath);
  const theirs = configEntries(upstream, filePath);
  if (!mine || !theirs) { return []; }
  return ids.filter(id => MCP_REGISTRY_KEYS.some(r => mine.has(`${r}.${id}`)) && !MCP_REGISTRY_KEYS.some(r => theirs.has(`${r}.${id}`)));
}

/**
 * A downstream project's protected MCP file still declares a server upstream
 * moved to HARNESS level (ADR-0005: web search). The file is on the
 * watchlist, so nothing overwrites it; this note is how the project learns
 * the server is now the harness's business. Returns the clause for the row and
 * the longer note, or null when the project declares none of them or upstream
 * still has them.
 */
export function harnessLevelMcpNote(filePath: string, project: string, upstream: string): { clause: string, note: string } | null {
  // Only a server upstream once committed moved; one it never shipped has no migration to explain.
  const committed = HARNESS_LEVEL_MCPS.filter(m => m.formerEnvVar !== null);
  const ids = serversUpstreamDropped(filePath, project, upstream, committed.map(m => m.id));
  if (ids.length === 0) { return null; }
  const vars = committed.filter(m => ids.includes(m.id)).flatMap(m => (m.formerEnvVar === null ? [] : [m.formerEnvVar]));
  return {
    clause: `${listNames(ids)} now run at harness level (upstream removed them and their keys ${listNames(vars)}): keep them here as project-only servers, or remove them and connect them once per machine`,
    note: [
      `Upstream no longer commits ${listNames(ids)}: a remote MCP server whose only project-side content is an API key is the harness's business, and the skills resolve it by capability whatever the server prefix (ADR-0005; .agents/skills/agentic-dev-core/references/mcp-capabilities.md).`,
      'Two valid answers for this project:',
      `  - keep project: the server stays a project-only entry in ${filePath} and in the other two host files, and its key stays in your .env, which no sync touches (the synced .env.example and the variable manifest no longer list ${listNames(vars)}, so document it wherever this project keeps its own keys).`,
      `  - remove it here (and from the other two host files) and connect it at user level: Claude Code \`claude mcp add --scope user\` or a claude.ai connector; OpenCode ~/.config/opencode/opencode.json; Codex \`codex mcp add\`. Then drop ${listNames(vars)} from .env.`,
      'bun run setup:doctor reports which of these servers your user-level configs already declare.',
    ].join('\n'),
  };
}

/**
 * The harness launch scripts upstream shipped until it retired them
 * (`bun run claude|codex|opencode`, ADR-0016), and the launcher they ran. Each
 * put every `.env` value into the agent's own process; a harness now opens as
 * its bare binary and each MCP server loads `.env` itself. Upstream never
 * re-adds them (the `package.json` sync only appends keys upstream still has)
 * and never deletes a project's copy: the launcher is in the updater's
 * `excludePaths`, so not even `--force` removes it. One informational row each.
 */
export const RETIRED_HARNESS_SCRIPTS = ['claude', 'codex', 'opencode'] as const;
export const RETIRED_HARNESS_LAUNCHER = 'scripts/launch.ts';

/** A script that starts its harness with the env files loaded: the launcher, varlock, dotenv, or a sourced `.env`. */
const ENV_LOADING_LAUNCH = /scripts\/launch\.ts|\bvarlock\b|\bdotenv\b|\.env\b/;

/** The retired launch scripts the project's `package.json` still declares, and whether the launcher file is still there. */
export function retiredHarnessLaunchers(root: string): { scripts: string[], launcher: boolean } {
  let scripts: Record<string, unknown> = {};
  try {
    scripts = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }).scripts ?? {};
  }
  catch {
    scripts = {};
  }
  const found = RETIRED_HARNESS_SCRIPTS.filter((name) => {
    const value = scripts[name];
    return typeof value === 'string' && ENV_LOADING_LAUNCH.test(value);
  });
  return { scripts: found, launcher: fs.existsSync(path.join(root, RETIRED_HARNESS_LAUNCHER)) };
}

/**
 * Servers upstream once committed and then RETIRED outright (no harness-level
 * replacement): the capability they served moved to a CLI. Keyed by server
 * id; the value is the one-line reason the row prints.
 */
export const RETIRED_MCPS: Readonly<Record<string, string>> = {
  atlassian: 'Jira and Confluence go through the `/acli` CLI (`[ISSUE_TRACKER_TOOL]`); the Atlassian MCP is an opt-in, per-developer setup (docs/mcp/)',
};

/**
 * A downstream project's protected MCP file still declares a server upstream
 * RETIRED (`RETIRED_MCPS`). Nothing overwrites the file; this note is how the
 * project learns why the server left and that keeping it is a valid answer.
 * Null when the project declares none of them or upstream still has them.
 */
export function retiredMcpNote(filePath: string, project: string, upstream: string): { clause: string, note: string } | null {
  const retired = serversUpstreamDropped(filePath, project, upstream, Object.keys(RETIRED_MCPS));
  if (retired.length === 0) { return null; }
  return {
    clause: `upstream retired ${listNames(retired)}: keep it here as a project-only server, or remove it`,
    note: [
      ...retired.map(id => `Upstream no longer commits ${listNames([id])}: ${RETIRED_MCPS[id]}.`),
      'Two valid answers for this project:',
      `  - keep project: the server stays a project-only entry in ${filePath} (and in the other two host files); agents:compat:check still compares it across hosts, just without a pinned shape.`,
      '  - remove it from all three host files.',
    ].join('\n'),
  };
}

/** One evidence sentence for a watched file, from its two copies plus the diff. */
export function describeWatchedFile(filePath: string, project: string, upstream: string, diff: string): string {
  return watchedFileEvidence(filePath, project, upstream, diff).evidence;
}

/** One line of the legacy-AGENTS.md heading map. */
export interface LegacyHeadingRow {
  heading: string
  /** `own` = no shipped heading matches: the project's own text. */
  kind: LegacyHomeKind | 'own'
  files: string[]
  action: string
}

const LEGACY_ACTION: Record<LegacyHomeKind | 'own', string> = {
  moved: 'ships as a synced section now: move anything of yours out of it into .agents/instructions/agent-project.md, then delete the heading from AGENTS.md',
  split: 'take upstream\'s L0 text for this heading; the full text lives in the section file, synced',
  stays: 'still in L0: port upstream\'s wording, keep your own additions',
  app: 'the app\'s preserved instructions: leave the block where it is',
  own: 'your own text: move it into .agents/instructions/agent-project.md (or a project context skill), then delete it from AGENTS.md',
};

/**
 * The heading map for a project whose `AGENTS.md` is still the pre-split single
 * file while upstream ships the progressive-disclosure L0. Every heading of the
 * project's copy, with where its text lives now and what to do with it. Empty
 * when upstream is not the split L0, when the project's copy already is, or
 * when the project carries none of the relocated headings.
 */
export function legacyInstructionsMap(project: string, upstream: string): LegacyHeadingRow[] {
  if (!isSplitL0(upstream) || isSplitL0(project)) { return []; }
  const headings = [...markdownSections(project).keys()].filter(h => h !== '');
  const rows: LegacyHeadingRow[] = [];
  const upstreamTitle = [...markdownSections(upstream).keys()].find(h => h !== '');
  for (const heading of headings) {
    // The file's own title is shared by both copies; it maps to nothing.
    if (heading === upstreamTitle) { continue; }
    const home = legacyHeadingHome(heading);
    const kind = home?.kind ?? 'own';
    rows.push({ heading, kind, files: home?.files ?? [PROJECT_INSTRUCTIONS_FILE], action: LEGACY_ACTION[kind] });
  }
  return rows.some(r => r.kind === 'moved') ? rows : [];
}

/**
 * The migration clause + note for the `AGENTS.md` drift row of a project
 * scaffolded before the split. The file is protected and is NEVER rewritten
 * automatically: the row says which headings now arrive as synced section
 * files, which are the project's own (they move into `agent-project.md`), and that
 * the router + load protocol are what to port from upstream.
 */
export function legacyInstructionsNote(filePath: string, project: string, upstream: string): { clause: string, note: string } | null {
  if (filePath !== 'AGENTS.md') { return null; }
  const rows = legacyInstructionsMap(project, upstream);
  if (rows.length === 0) { return null; }
  const moved = rows.filter(r => r.kind === 'moved').map(r => r.heading);
  const own = rows.filter(r => r.kind === 'own').map(r => r.heading);
  const added = markdownSectionDelta(project, upstream).added;
  const clause = [
    `legacy single-file ${filePath}: ${moved.length} heading(s) now ship as synced sections under ${INSTRUCTIONS_DIR}/ (${listNames(moved)})`,
    own.length > 0 ? `${own.length} heading(s) are this project's own and move into ${PROJECT_INSTRUCTIONS_FILE} (${listNames(own)})` : 'no project-only heading',
    added.length > 0 ? `port upstream's L0 additions: ${listNames(added)}` : null,
    'never rewritten automatically; the heading map is in the saved file',
  ].filter((part): part is string => part !== null).join('; ');
  const cell = (text: string): string => text.replace(/\|/g, '\\|');
  const note = [
    `${filePath} here is the pre-split single file; upstream now ships it as a small always-on L0 (load protocol, router, Critical Rules as binding sentences, behavioural layer, orchestration core, memory triggers) plus on-demand sections in ${INSTRUCTIONS_DIR}/, which \`bun sync\` keeps in step for you. ${filePath} is yours and is never rewritten automatically. Rebuild it from upstream's L0, carrying over only what is this project's own:`,
    '',
    '| Your heading | Lives now in | What to do |',
    '|---|---|---|',
    ...rows.map(r => `| ${cell(r.heading)} | ${r.files.map(f => `\`${f}\``).join(' + ')} | ${r.action} |`),
    ...added.map(h => `| (upstream only) ${cell(h)} | \`${filePath}\` | copy from upstream's ${filePath} |`),
    '',
    `Done when \`bun run instructions:check\` passes: L0 under its byte budget, every section routed. A rule only this project has lives in ${PROJECT_INSTRUCTIONS_FILE}, which no sync touches.`,
  ].join('\n');
  return { clause, note };
}

// ============================================================================
// COMPAT ERROR CLASSIFICATION
// ============================================================================

const MCP_MISSING_RE = /^MCP (\S+) missing from (\w+):/;
const MCP_EXTRA_RE = /^MCP (\S+) present in (\w+) only:/;

const COMPAT_GROUP_SURFACE: Record<CompatibilityErrorGroup, ParitySurface> = {
  instructions: 'instructions',
  alias: 'skills',
  // A command that shadows a skill is a skills problem: the skill is what stops loading.
  commands: 'skills',
  hooks: 'hooks',
  mcp: 'mcp',
  // An unwired lint block is a verification gap: the rule ships and enforces nothing.
  lint: 'gates',
};

/** Same classifier `bun run agents:compat` groups its output by. */
export function compatErrorSurface(message: string): ParitySurface {
  return COMPAT_GROUP_SURFACE[compatibilityErrorGroup(message)];
}

/**
 * Generated surfaces are rebuilt by `agents:compat`, and the same repair moves
 * a command that shadows a skill aside; anything else comes from upstream's
 * shape.
 */
export function compatErrorSuggestion(message: string): ParitySuggestion {
  // The wiring lives in the project-owned `eslint.config.js`: add the block, keep the rest.
  // On an adopted app the consumer is the SYNCED `eslint.config.tooling.mjs`: restore it.
  if (/^eslint\.config\.tooling\.mjs does not wire/.test(message)) { return 'take upstream'; }
  if (/does not wire \w+ from eslint\.config\.base\.js/.test(message)) { return 'merge'; }
  return /command shadows skill|skills alias|\.claude\/skills/i.test(message) ? 'run agents:compat' : 'take upstream';
}

function compatErrorPath(message: string): string {
  const m = /(?:^|\s|:)((?:\.[\w-]+|[\w-]+)(?:\/[\w.-]+)+\.\w+)/.exec(message);
  if (m) { return m[1]; }
  const host = /(claude|opencode|codex)\b/i.exec(message);
  if (host && /MCP/.test(message)) { return MCP_HOST_FILE[host[1].toLowerCase()]; }
  if (/skills alias|\.claude\/skills/.test(message)) { return '.claude/skills'; }
  const eslint = /^(eslint\.config(?:\.tooling)?\.m?js) /.exec(message);
  if (eslint) { return eslint[1]; }
  return '(compat)';
}

/** One line of a project skill, command or instruction that opens a browser on a disk profile. */
export interface BrowserProfileSite {
  /** Repo-relative path, `/` separators. */
  file: string
  /** 1-indexed. */
  line: number
  /** What the line does: `--persistent`, or the `--profile=<value>` it passes. */
  flag: string
  reason: 'persistent' | 'relative profile' | 'profile inside the repo'
}

/** Where a project keeps the text its agents follow. `.claude/skills` is usually the alias of `.agents/skills` (deduplicated by real path). */
export const BROWSER_PROFILE_SCAN_ROOTS: readonly string[] = ['.agents/skills', '.claude/skills', '.claude/commands', '.agents/instructions'];
export const BROWSER_PROFILE_SCAN_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md'];

/**
 * The vendor `playwright-cli` skill documents its own `--persistent` flag; that
 * is the vendor describing the tool, not the project instructing an agent.
 * A relative `--profile` in it is still reported (the vendor's examples are absolute).
 */
const VENDOR_FLAG_DOCS = /^\.(?:agents|claude)\/skills\/playwright-cli\//;
const SCANNED_EXTENSIONS = /\.(?:md|mdx|txt|sh|ts|js|mjs|cjs|json|ya?ml)$/i;
const MAX_SCANNED_BYTES = 1_000_000;

/** `--profile=<v>` / `--profile <v>`: a quoted value (spaces allowed) or a bare one. */
const PROFILE_FLAG = /--profile(?:=|[ \t]+)(?:"([^"]+)"|'([^']+)'|([^\s"'`)]+))/g;
/** A negation just before `--persistent` ("never `--persistent`", "nunca --persistent"). */
const NEGATED = /\b(?:never|nunca|not|no|don't|do not|avoid|evita|without|sin)\b[^.;|]{0,24}$/i;

/** Classify one `--profile` value, or null when it is fine (outside the repo, or a placeholder). */
function profileValueProblem(value: string, line: string, root: string): BrowserProfileSite['reason'] | null {
  // Values that name the repo itself, written as a variable or a placeholder.
  if (/^(?:<repo(?:-root)?>|\$\{?(?:PWD|CLAUDE_PROJECT_DIR)\}?|\$\(pwd\))(?:[/\\]|$)/i.test(value)) { return 'profile inside the repo'; }
  // Other placeholders and variables (`<abs root>/<service>`, `$HOME/...`, `%USERPROFILE%\...`): outside by intent.
  if (/^[<{$%~]/.test(value)) { return null; }
  if (/^(?:[a-z]:)?[/\\]/i.test(value)) {
    const abs = path.resolve(value);
    const rootAbs = path.resolve(root);
    return abs === rootAbs || abs.startsWith(rootAbs + path.sep) ? 'profile inside the repo' : null;
  }
  // Relative. `--profile <name>` belongs to other CLIs too (`api:login`, resend,
  // docker compose): a bare name only counts on a browser line, a path anywhere.
  const pathLike = /[/\\]/.test(value) || value.startsWith('.');
  if (/api[:-]login/.test(line)) { return null; }
  if (pathLike || /playwright-cli|\bopen\b/.test(line)) { return 'relative profile'; }
  return null;
}

/** The disk-profile sites in one file's text. Exported for tests. */
export function browserProfileSitesIn(file: string, text: string, root: string): BrowserProfileSite[] {
  const sites: BrowserProfileSite[] = [];
  const vendor = VENDOR_FLAG_DOCS.test(file);
  text.split(/\r?\n/).forEach((line, i) => {
    // `open --help` output quoted in a doc lists the flag; it does not use it.
    const persistent = !vendor && [...line.matchAll(/--persistent\b/g)].some((m) => {
      const before = line.slice(0, m.index);
      return /playwright-cli|\bopen\b/.test(before) && !/--help\b/.test(before) && !NEGATED.test(before);
    });
    if (persistent) { sites.push({ file, line: i + 1, flag: '--persistent', reason: 'persistent' }); }
    for (const m of line.matchAll(PROFILE_FLAG)) {
      const value = m[1] ?? m[2] ?? m[3];
      const reason = profileValueProblem(value, line, root);
      if (reason) { sites.push({ file, line: i + 1, flag: `--profile=${value}`, reason }); }
    }
  });
  return sites;
}

/**
 * Lines of the project's own skills, commands and instructions that open a
 * browser on a disk profile the doctrine rules out: `--persistent`, or a
 * `--profile` that is relative or inside the repo (live-ui-validation.md §3.2).
 * Read-only; unreadable or oversized files are skipped.
 */
export function browserProfileDrift(root: string): BrowserProfileSite[] {
  const seen = new Set<string>();
  const sites: BrowserProfileSite[] = [];
  const visit = (abs: string): void => {
    let real: string;
    try { real = fs.realpathSync(abs); }
    catch { return; }
    if (seen.has(real)) { return; }
    seen.add(real);
    let stat: fs.Stats;
    try { stat = fs.statSync(real); }
    catch { return; }
    if (stat.isDirectory()) {
      const name = path.basename(abs);
      if (name === 'node_modules' || name === '.git' || name.endsWith('-workspace')) { return; }
      let entries: string[];
      try { entries = fs.readdirSync(abs).sort(); }
      catch { return; }
      for (const entry of entries) { visit(path.join(abs, entry)); }
      return;
    }
    if (!stat.isFile() || stat.size > MAX_SCANNED_BYTES || !SCANNED_EXTENSIONS.test(abs)) { return; }
    let text: string;
    try { text = fs.readFileSync(real, 'utf8'); }
    catch { return; }
    if (!text.includes('--p')) { return; }
    sites.push(...browserProfileSitesIn(path.relative(root, abs).split(path.sep).join('/'), text, root));
  };
  for (const rel of [...BROWSER_PROFILE_SCAN_FILES, ...BROWSER_PROFILE_SCAN_ROOTS]) { visit(path.join(root, rel)); }
  return sites;
}

// ============================================================================
// COLLECTOR
// ============================================================================

function readIfExists(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

function watchedSurface(filePath: string, source: 'upstream' | 'project' = 'upstream'): ParitySurface {
  if (filePath === '.mcp.json' || filePath === 'opencode.jsonc' || filePath === '.codex/config.toml') { return 'mcp'; }
  if (filePath === '.claude/settings.json') { return 'hooks'; }
  if (filePath.startsWith('.agents/skills/')) { return 'skills'; }
  // Synced component files kept as the project's own (.husky hooks, a declared path).
  if (filePath.startsWith('.husky/') || source === 'project') { return 'components'; }
  return 'instructions';
}

// ============================================================================
// ARCHIVED SKILLS (one nudge per skill)
// ============================================================================

function archivedSkillMarkerPath(root: string, skill: string): string {
  return path.join(root, ARCHIVED_SKILL_MARKER_DIR, `archived-skill-${skill.replace(/[^a-z0-9.-]+/gi, '_')}.marker`);
}

/**
 * Archived skills that still need a row: what THIS run archived (the migration
 * result, carried into the re-exec child by the wrapper) plus any directory
 * under `archivedSkillsDir` that was never nudged. A skill whose marker exists
 * is skipped, so the row appears once even though the archive dir (gitignored,
 * per developer) stays on disk until the user deletes it.
 */
export function archivedSkillsToReport(root: string, archivedSkillsDir: string, thisRun: readonly string[]): string[] {
  const names = new Set(thisRun);
  try {
    for (const d of fs.readdirSync(archivedSkillsDir, { withFileTypes: true })) {
      if (d.isDirectory()) { names.add(d.name); }
    }
  }
  catch { /* no archive dir: only this run's names, if any */ }
  return [...names].sort().filter(skill => !fs.existsSync(archivedSkillMarkerPath(root, skill)));
}

/** Write the one-nudge marker for each reported skill. Non-fatal: worst case we nudge again. */
export function persistArchivedSkillMarkers(root: string, skills: readonly string[]): void {
  for (const skill of skills) {
    try {
      const marker = archivedSkillMarkerPath(root, skill);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
    }
    catch { /* non-fatal */ }
  }
}

export interface GitStrategyStamp {
  present: boolean
  strategy: string | null
  source: string | null
}

/** `git_strategy` provenance from `.agents/project.yaml`, regex-read (no YAML parser in `cli/`). */
export function readGitStrategyStamp(projectYaml: string | null): GitStrategyStamp {
  if (projectYaml === null || !/^git_strategy:/m.test(projectYaml)) { return { present: false, strategy: null, source: null }; }
  const strategy = /^ {2}strategy:\s*([\w-]+)/m.exec(projectYaml)?.[1] ?? null;
  const source = /^\s+strategy_source:\s*([\w-]+)/m.exec(projectYaml)?.[1] ?? null;
  return { present: true, strategy, source };
}

/**
 * Build the findings for this run. Reads the two trees and shells `git diff
 * --no-index` for counts; writes nothing.
 */
export function collectParityFindings(input: ParityInput): ParityFinding[] {
  const findings: Omit<ParityFinding, 'id'>[] = [];

  // 1. Watched files that drifted: section-level evidence, full diff for the
  //    file. Kept aside until the compat errors are known: a compat error on
  //    the same path folds the drift into its (blocking) row.
  //    A structural entry (project identity) fires only for upstream
  //    additions, labelled `informational`, and its keys are the evidence; a
  //    value-only difference is no row at all.
  const drifted = new Map<string, Omit<ParityFinding, 'id'> & { projectOnly: boolean }>();
  for (const entry of input.drift) {
    const project = readIfExists(path.join(input.root, entry.path));
    const upstream = readIfExists(path.join(input.upstreamDir, entry.path));
    if (project === null || upstream === null) { continue; }
    const diff = diffNoIndex(path.join(input.root, entry.path), path.join(input.upstreamDir, entry.path));
    // Every one of these rows is a KEPT file (a watched path is never
    // overwritten), and a kept path whose upstream hunk gates another file of
    // this release says so and blocks.
    const prerequisite = prerequisiteFor(entry.path, input.prerequisites);
    const withPrerequisite = (evidence: string): string =>
      prerequisite === null ? evidence : `${evidence}; ${prerequisiteClause(prerequisite)}`;
    if (entry.structural) {
      const evidence = structuralEvidence(entry.path, project, upstream);
      // A MISSING top-level block a shipped skill reads is not informational:
      // the skill fails at runtime in somebody's session instead of here, where
      // there is an operator and a prompt. It escalates even when
      // `structuralEvidence` found nothing else to say.
      const missingBlocks = missingConfigBlocks(entry.path, project, upstream, input.configBlockReaders);
      if (evidence === null && missingBlocks.length === 0) { continue; }
      const structural = [evidence, missingBlocks.length > 0 ? configBlockClause(missingBlocks) : null]
        .filter((part): part is string => part !== null)
        .join('; ');
      drifted.set(entry.path, { surface: watchedSurface(entry.path, entry.source), path: entry.path, evidence: withPrerequisite(structural), suggested: 'merge', blocking: prerequisite !== null || missingBlocks.length > 0, diff, projectOnly: true });
      continue;
    }
    let { evidence, projectOnly, suggested } = watchedFileEvidence(entry.path, project, upstream, diff);
    const notes: { clause: string, note: string }[] = [];
    // A pre-split AGENTS.md: the generic heading delta would say "keep
    // project-only headings" for sections that now arrive synced. The heading
    // map replaces it; the file itself is never rewritten.
    const legacy = legacyInstructionsNote(entry.path, project, upstream);
    if (legacy !== null) {
      evidence = `${legacy.clause}; ${formatStats(diffStats(diff))}`;
      projectOnly = true;
      suggested = 'merge';
      notes.push({ clause: '', note: legacy.note });
    }
    // A split AGENTS.md that still routes to the numbered section names: the
    // sections arrived renamed, the project's own file never is.
    const renamed = renamedSectionsNote(entry.path, project);
    if (renamed !== null) {
      suggested = 'merge';
      notes.push(renamed);
    }
    // No husky hook is ever overwritten, so a consumer only learns about the
    // gates split if the row says so: without it no gate a future release adds
    // ever runs there.
    if (entry.path === HUSKY_PRE_COMMIT || entry.path === HUSKY_PRE_PUSH || entry.path === HUSKY_COMMIT_MSG) {
      const gates = frameworkGatesNote(project, entry.path);
      if (gates !== null) {
        notes.push({ clause: `this hook does not source ${HUSKY_GATES_FILE}, so no gate a future release adds will ever run here`, note: gates });
      }
    }
    // An MCP host file still carrying a server upstream moved to harness level
    // or retired: the row explains why; the file is never overwritten.
    for (const mcpNote of [harnessLevelMcpNote(entry.path, project, upstream), retiredMcpNote(entry.path, project, upstream)]) {
      if (mcpNote !== null) { notes.push(mcpNote); }
    }
    drifted.set(entry.path, {
      surface: watchedSurface(entry.path, entry.source),
      path: entry.path,
      evidence: withPrerequisite([evidence, ...notes.map(n => n.clause).filter(c => c !== '')].join('; ')),
      // A prerequisite row cannot be "reviewed later": the release is
      // half-delivered until its hunk lands, so it is a merge, and it blocks.
      suggested: prerequisite === null ? suggested : 'merge',
      blocking: prerequisite !== null,
      diff,
      projectOnly,
      ...(notes.length === 0 ? {} : { note: notes.map(n => n.note).join('\n\n') }),
    });
  }

  // 2. Compat errors. MCP set errors fold into one finding per host; the rest
  //    stay one finding each. All of them block: the contract failed. A drifted watched file on
  //    the same path folds in: compat evidence first, drift evidence appended,
  //    the full diff kept for the saved file. Upstream's shape is suggested
  //    only when the project holds nothing of its own there; a project-only
  //    server, key or heading turns the suggestion into `merge` (still
  //    blocking: the contract is still broken).
  const compat: Omit<ParityFinding, 'id'>[] = [];
  const pushCompat = (finding: Omit<ParityFinding, 'id'>): void => {
    const drift = drifted.get(finding.path);
    if (!drift) { compat.push(finding); return; }
    drifted.delete(finding.path);
    const { projectOnly, ...driftFinding } = drift;
    compat.push({
      ...finding,
      evidence: `${finding.evidence}; ${driftFinding.evidence}`,
      suggested: finding.suggested === 'take upstream' && !projectOnly ? 'take upstream' : 'merge',
      diff: driftFinding.diff,
    });
  };
  const mcpByHost = new Map<string, { missing: string[], extra: string[] }>();
  for (const error of input.compatErrors) {
    const missing = MCP_MISSING_RE.exec(error);
    const extra = MCP_EXTRA_RE.exec(error);
    const match = missing ?? extra;
    if (!match) {
      pushCompat({
        surface: compatErrorSurface(error),
        path: compatErrorPath(error),
        evidence: error,
        suggested: compatErrorSuggestion(error),
        blocking: true,
      });
      continue;
    }
    const host = match[2];
    const bucket = mcpByHost.get(host) ?? { missing: [], extra: [] };
    (missing ? bucket.missing : bucket.extra).push(match[1]);
    mcpByHost.set(host, bucket);
  }
  for (const [host, sets] of mcpByHost) {
    const parts: string[] = [];
    if (sets.missing.length > 0) { parts.push(`missing: ${sets.missing.join(', ')} (declared in .mcp.json)`); }
    // Servers only this host has are the project's integrations: the fix is to
    // declare them everywhere or drop them deliberately, never to overwrite
    // the file with upstream's copy.
    if (sets.extra.length > 0) { parts.push(`only here: ${sets.extra.join(', ')} (not in .mcp.json): declare them in ${otherMcpHostFiles(host)}, or remove them`); }
    pushCompat({
      surface: 'mcp',
      path: MCP_HOST_FILE[host] ?? host,
      evidence: parts.join('; '),
      suggested: sets.extra.length === 0 ? 'take upstream' : 'merge',
      blocking: true,
    });
  }
  // The doctrine ledger: one aggregated row for AGENTS.md sections this project
  // still lacks. Unlike every other watched-file row it is tracked by CONTENT,
  // so `keep project` does not retire it: writing the section does. It folds
  // onto the existing AGENTS.md drift row when there is one, so a run never
  // shows two rows about the same file.
  if (typeof input.doctrineDebt === 'string' && input.doctrineDebt !== '') {
    // The path comes from the caller, not from an import of `updater-doctrine`:
    // that module imports `markdownSectionDelta` from here, and taking the
    // constant back would close the cycle.
    const doctrinePath = input.doctrineFile ?? 'AGENTS.md';
    const existing = drifted.get(doctrinePath);
    if (existing) { existing.evidence = `${existing.evidence}; ${input.doctrineDebt}`; }
    else {
      findings.push({
        surface: 'instructions',
        path: doctrinePath,
        evidence: input.doctrineDebt,
        suggested: 'merge',
        blocking: false,
      });
    }
  }

  findings.push(...[...drifted.values()].map(({ projectOnly: _projectOnly, ...finding }) => finding), ...compat);

  // 3. Archived skills: the migration kept the legacy copy because upstream owns the name.
  for (const skill of input.archivedSkills) {
    const archived = path.join(input.archivedSkillsDir, skill);
    const canonical = path.join(input.root, '.agents', 'skills', skill);
    if (!fs.existsSync(archived)) { continue; }
    const diff = fs.existsSync(canonical) ? diffNoIndex(canonical, archived, { a: 'canonical', b: 'archived' }) : '';
    const stats = diffStats(diff);
    findings.push({
      surface: 'skills',
      path: path.relative(input.root, archived).replace(/\\/g, '/'),
      evidence: fs.existsSync(canonical)
        ? `archived collision vs .agents/skills/${skill}: ${formatStats(stats)}`
        : `archived; .agents/skills/${skill} no longer exists`,
      suggested: 'decide',
      blocking: false,
      diff: diff || undefined,
    });
  }

  // 4. Harness commands. The alias layer is retired: a skill is invoked by its
  //    own name plus a mode, and nothing generates command files any more. A
  //    project that declared its own aliases keeps its wrapper files as plain
  //    harness commands; the overlay that listed them is inert, named once.
  //    A command that carried a skill's name was moved aside by the compat
  //    hook, one row each, so the project can port anything worth keeping.
  if (fs.existsSync(path.join(input.root, RETIRED_COMMAND_ALIAS_OVERLAY))) {
    findings.push({
      surface: 'components',
      path: RETIRED_COMMAND_ALIAS_OVERLAY,
      evidence: `informational: command aliases are retired and nothing reads this overlay any more; the commands it declared are plain harness command files now (${HARNESS_COMMAND_DIRS.join(', ')}): edit them there, and delete the overlay when convenient`,
      suggested: 'keep project',
      blocking: false,
    });
  }
  for (const moved of input.shadowingCommandsMoved ?? []) {
    findings.push({
      surface: 'skills',
      path: moved,
      evidence: `informational: this command had the name of a skill and would have replaced the skill's instructions; moved to ${SHADOWING_COMMANDS_BACKUP_DIR}/${moved}; port anything worth keeping into the skill, then drop the backup`,
      suggested: 'keep project',
      blocking: false,
    });
  }

  // 4a. Retired harness launchers (ADR-0016): the scripts and the launcher
  //     file are reported as removable, never touched.
  const launchers = retiredHarnessLaunchers(input.root);
  if (launchers.scripts.length > 0) {
    findings.push({
      surface: 'package',
      path: 'package.json',
      evidence: `informational: upstream retired the harness launch scripts (${launchers.scripts.map(n => `scripts.${n}`).join(', ')}): each started the agent with every .env value in its own process. Open the agent as its bare binary (${launchers.scripts.join(' / ')}) or desktop app; every MCP server loads .env itself. Left untouched: delete them when convenient`,
      suggested: 'keep project',
      blocking: false,
    });
  }
  if (launchers.launcher) {
    findings.push({
      surface: 'components',
      path: RETIRED_HARNESS_LAUNCHER,
      evidence: 'informational: upstream retired the harness launcher with its scripts (ADR-0016) and no longer ships or updates this file; its stale-variable check lives on in `bun run vars:env:check`. Left untouched: delete it once no script of yours calls it',
      suggested: 'keep project',
      blocking: false,
    });
  }

  // 4b. Business context maps (cli/lib/context-maps.ts): a delivered skill whose
  //     map was never generated, with the old markdown map it replaces beside
  //     it when there is one. Informational, never blocking: a `project-context`
  //     mode generates the map, not a sync, and the old file is generator
  //     input, never a deletion candidate.
  for (const status of input.contextMaps ?? contextMapStatuses(input.root)) {
    const advice = contextMapAdvice(status);
    if (advice === null) { continue; }
    findings.push({
      surface: 'skills',
      path: mapRelPath(status.skill),
      evidence: `informational: ${advice}`,
      suggested: 'keep project',
      blocking: false,
    });
  }

  // 4c. A project skill, command or instruction that still opens a browser on
  //     a disk profile (`--persistent`, a relative or in-repo `--profile`)
  //     leaves a full Chrome profile behind per session. One row per file,
  //     every line named; the file is never rewritten.
  const profileSites = input.browserProfileSites ?? browserProfileDrift(input.root);
  const sitesByFile = new Map<string, BrowserProfileSite[]>();
  for (const site of profileSites) { sitesByFile.set(site.file, [...(sitesByFile.get(site.file) ?? []), site]); }
  for (const [file, sites] of sitesByFile) {
    findings.push({
      surface: /^\.(?:agents|claude)\/(?:skills|commands)\//.test(file) ? 'skills' : 'instructions',
      path: file,
      evidence: `informational: ${sites.map(s => `line ${s.line} ${s.flag} (${s.reason})`).join('; ')}: each such open leaves a full Chrome profile on disk that nothing removes. Every session runs in memory (\`-s=<name> open\`, then the app's own login form); this repo never opens a browser with \`--persistent\` or \`--profile\`. Left untouched: edit the lines when convenient; \`bun run browser:profiles\` lists the profiles already left behind. Doctrine: .agents/skills/sprint-development/references/live-ui-validation.md §3.1, §3.2`,
      suggested: 'keep project',
      blocking: false,
    });
  }

  // 5. Components held back this run, with the lock cursor each one stays at.
  if (input.heldBack.length > 0) {
    findings.push({
      surface: 'components',
      path: '.template/boilerplate.lock.json',
      evidence: `held back: ${input.heldBack.map(h => `${h.component}@${h.lockCommit ? h.lockCommit.slice(0, 7) : 'no lock'}`).join(', ')}`,
      suggested: 'decide',
      blocking: false,
    });
  }

  // 5b. `.context/PBI/` still tracked in git: one row on Componentes. The
  //     path list (hundreds of lines on a live run) lives in the recipe file,
  //     never in the prompt.
  if (input.pbiCache && input.pbiCache.tracked > 0) {
    findings.push({
      surface: 'components',
      path: '.context/PBI/',
      evidence: `${input.pbiCache.tracked} tracked path(s) still in git (Jira cache, gitignored by design); migration recipe saved to ${input.pbiCache.recipePath}`,
      suggested: 'decide',
      blocking: false,
    });
  }

  // 6. Env keys upstream documents and the project lacks.
  if (input.envNewKeys.length > 0) {
    findings.push({
      surface: 'env',
      path: '.env',
      evidence: `upstream .env.example added ${input.envNewKeys.length} key(s): ${input.envNewKeys.join(', ')}`,
      suggested: 'decide',
      blocking: false,
    });
  }

  // 6b. The permission-list and hook merges are additive and already
  //     decided: they ran, and this row says what they added so nothing is a
  //     surprise. Informational, never blocking: an allow entry a project does
  //     not want is re-expressible in `deny`, a deny entry in
  //     `updater.declined_denies` and a hook command in
  //     `updater.declined_hooks`, so the row asks nothing of it. A hook left
  //     out because its script is missing is news (the compat check may still
  //     name it), so it raises the row on its own; a declined entry alone is
  //     the project's standing decision and does not.
  const allowAdded = input.allowListAdded ?? [];
  const denyAdded = input.denyListAdded ?? [];
  const denyDeclined = input.denyListDeclined ?? [];
  const hooksAdded = input.hooksAdded ?? [];
  const hooksDeclined = input.hooksDeclined ?? [];
  const hooksSkipped = input.hooksSkipped ?? [];
  const folded = input.settingsDuplicatesFolded ?? [];
  if (allowAdded.length > 0 || denyAdded.length > 0 || hooksAdded.length > 0 || hooksSkipped.length > 0 || folded.length > 0) {
    const parts: string[] = [];
    if (allowAdded.length > 0) { parts.push(`${allowAdded.length} permission(s) added to permissions.allow: ${allowAdded.join(', ')}`); }
    if (denyAdded.length > 0) { parts.push(`${denyAdded.length} rule(s) added to permissions.deny: ${denyAdded.join(', ')}`); }
    if (denyDeclined.length > 0) { parts.push(`declined via ${DECLINED_DENIES_KEY}: ${denyDeclined.join(', ')}`); }
    if (hooksAdded.length > 0) { parts.push(`${hooksAdded.length} hook command(s) added as new groups: ${hooksAdded.join(', ')}`); }
    if (hooksDeclined.length > 0) { parts.push(`declined via ${DECLINED_HOOKS_KEY}: ${hooksDeclined.join(', ')}`); }
    if (hooksSkipped.length > 0) { parts.push(`not added, the script they run is missing: ${hooksSkipped.join(', ')}`); }
    if (folded.length > 0) { parts.push(`repeated key(s) folded into one list (JSON keeps only the last): ${folded.join(', ')}`); }
    const foldedUnder = (key: string): boolean => folded.some(at => at === key || at.startsWith(`${key}.`) || at.startsWith(`permissions.${key}`));
    const touched = (key: string): boolean => (key === 'deny' && denyAdded.length > 0) || (key === 'hooks' && hooksAdded.length > 0) || foldedUnder(key);
    const untouched = `${['deny', 'ask', 'hooks', 'env'].filter(key => !touched(key)).join('/')} untouched`;
    findings.push({
      surface: 'components',
      path: CLAUDE_SETTINGS_FILE,
      evidence: `informational: ${parts.join('; ')} (set-union with upstream, appended after the project's entries; ${untouched})`,
      suggested: 'keep project',
      blocking: false,
    });
  }

  // 6c. `opencode.jsonc` is never merged (JSONC with comments, ordered rules
  //     where the last match wins): the upstream deny rules it lacks become
  //     one row with the block to paste. A pattern the project lists with any
  //     action is its decision and never reported. Folds onto the file's
  //     drift or MCP row when one exists: one row per path.
  // Not for a project that dropped OpenCode (ADR-0013), even when it kept the file.
  const opencodeGap = declaredHarnesses(input.root).harnesses.includes('opencode') ? opencodeDenyGap(input.root, input.upstreamDir) : null;
  if (opencodeGap !== null) {
    const count = opencodeGap.missing.reduce((n, m) => n + m.patterns.length, 0);
    const rules = opencodeGap.missing.map(m => `${m.tool}: ${m.patterns.join(', ')}`).join('; ');
    const evidence = `permission lacks ${count} upstream deny rule(s) (${rules}); never rewritten: paste the block from the saved prompt, or list a pattern yourself with another action to decline it`;
    const note = [`Deny rules to paste into ${OPENCODE_SETTINGS_FILE}:`, '', '```jsonc', opencodeGap.block, '```'].join('\n');
    const prior = findings.find(f => f.path === OPENCODE_SETTINGS_FILE);
    if (prior) {
      prior.evidence = `${prior.evidence}; ${evidence}`;
      prior.suggested = 'merge';
      prior.note = [prior.note, note].filter(Boolean).join('\n\n');
    }
    else {
      findings.push({ surface: watchedSurface(OPENCODE_SETTINGS_FILE), path: OPENCODE_SETTINGS_FILE, evidence, suggested: 'merge', blocking: false, note });
    }
  }

  // 7. Synced files the project had edited and this run overwrote: the edit
  //    lives in the backup; the row says where, how far the two are apart,
  //    and how to keep the merge next time (`updater.protected_paths`). A
  //    path already protected never reaches here: it is never overwritten.
  for (const edit of input.localEdits ?? []) {
    const current = path.join(input.root, edit.path);
    const backupRel = edit.backupPath ? path.relative(input.root, edit.backupPath).replace(/\\/g, '/') : null;
    const diff = edit.backupPath && fs.existsSync(edit.backupPath) && fs.existsSync(current)
      ? diffNoIndex(edit.backupPath, current, { a: 'project-edit', b: 'applied' })
      : '';
    const stats = diffStats(diff);
    // Restoring a project's own skill from the backup leaves REGISTRY.md
    // built from the overwritten (upstream) content until the registry is
    // regenerated by hand: the row says so.
    const isSkillPath = edit.path.startsWith('.agents/skills/');
    const registryHint = isSkillPath ? '; after restoring, run bun run skills:registry' : '';
    findings.push({
      surface: isSkillPath ? 'skills' : 'components',
      path: edit.path,
      evidence: `project edit overwritten; backup: ${backupRel ?? 'none'}; ${diff ? `${formatStats(stats)} vs applied` : 'backup unavailable'}; ${PROTECT_HINT}${registryHint}`,
      suggested: 'merge',
      blocking: false,
      diff: diff || undefined,
      note: protectNote(edit.path),
    });
  }

  // 8. package.json keys kept at the project's value: the terminal FYI is
  //    lost on a non-interactive run; the row survives, the values go to the file.
  for (const kept of input.packageJsonKept ?? []) {
    findings.push({
      surface: 'package',
      path: kept.file,
      evidence: `${kept.section}.${kept.key}: project value kept; upstream differs`,
      suggested: 'decide',
      blocking: false,
      detail: `project (kept):\n  ${kept.localValue}\nupstream:\n  ${kept.upstreamValue}`,
    });
  }

  // 9. Quality gates that failed after the apply. Informational (never
  //    blocking): a type or lint break the diff-based rows cannot see.
  for (const gate of input.gates ?? []) {
    if (gate.status === 'pass') { continue; }
    const head = gate.status === 'timeout'
      ? `skipped: no verdict within ${Math.round(gate.seconds)} s`
      : gate.status === 'error'
        ? `could not run (exit ${gate.exitCode ?? 'signal'})`
        : `exit ${gate.exitCode ?? 'signal'}; ${gate.errorCount} error(s)`;
    const parts = [head];
    if (gate.firstErrors.length > 0) { parts.push(`first: ${gate.firstErrors.join(' | ')}`); }
    if (gate.status === 'fail') {
      parts.push(gate.failingApplied.length > 0
        ? `applied this run: ${gate.failingApplied.join(', ')}`
        : 'none of the failing files was applied this run');
    }
    findings.push({
      surface: 'gates',
      path: gate.script,
      evidence: parts.join('; '),
      suggested: 'decide',
      blocking: false,
      detail: gate.output.trim() || undefined,
    });
  }

  // 10. `--adopt`: app files kept, the instructions proposal, the scripts the
  //     app kept under a name upstream also defines. Built by `runAdopt`.
  //     One row per path: an adopt row on a path another row already names
  //     (the watched `AGENTS.md`) absorbs that row's evidence. `package.json`
  //     keeps one row per key, as everywhere else.
  for (const row of input.adoptFindings ?? []) {
    const at = row.surface === 'package' ? -1 : findings.findIndex(f => f.path === row.path && f.surface !== 'package');
    if (at === -1) { findings.push(row); continue; }
    const [prior] = findings.splice(at, 1);
    const note = [row.note, prior.note].filter(Boolean).join('\n\n');
    findings.push({
      ...row,
      evidence: `${row.evidence}; ${prior.evidence}`,
      blocking: row.blocking || prior.blocking,
      ...(row.diff ?? prior.diff ? { diff: row.diff ?? prior.diff } : {}),
      ...(row.detail ?? prior.detail ? { detail: row.detail ?? prior.detail } : {}),
      ...(note ? { note } : {}),
    });
  }
  if (input.adopting === true) {
    for (const f of findings) {
      if (f.suggested !== 'take upstream' || f.adoptTakeUpstream === true) { continue; }
      f.suggested = 'merge';
      f.evidence = `${f.evidence}; the app's own file (--adopt): port upstream's additions, never replace it`;
    }
  }

  // 11. Git strategy provenance: a shipped default nobody chose is a pending decision.
  const stamp = readGitStrategyStamp(readIfExists(path.join(input.root, '.agents', 'project.yaml')));
  if (fs.existsSync(path.join(input.root, '.agents', 'project.yaml'))) {
    if (!stamp.present) {
      findings.push({
        surface: 'git',
        path: '.agents/project.yaml',
        evidence: 'no git_strategy block (git-flow-master cannot read a branch policy)',
        suggested: 'decide',
        blocking: false,
      });
    }
    else if (stamp.source !== 'chosen') {
      findings.push({
        surface: 'git',
        path: '.agents/project.yaml',
        evidence: `git_strategy.meta.strategy_source: ${stamp.source ?? 'unset'} (strategy: ${stamp.strategy ?? 'unset'}, shipped default, never chosen)`,
        suggested: 'decide',
        blocking: false,
      });
    }
  }

  return findings.map((f, i) => ({ id: i + 1, ...f }));
}

// ============================================================================
// RENDERER
// ============================================================================

function surfaceRows(findings: ParityFinding[]): SurfaceRow[] {
  return SURFACE_ORDER.map((surface) => {
    const own = findings.filter(f => f.surface === surface);
    const state: SurfaceState = own.length === 0 ? 'ok' : own.some(f => f.blocking) ? 'blocked' : 'warn';
    const paths = [...new Set(own.map(f => f.path))];
    const shown = paths.slice(0, MAX_NAMES).join(', ') + (paths.length > MAX_NAMES ? ` (+${paths.length - MAX_NAMES})` : '');
    const cell = own.length === 0
      ? 'sin diferencias'
      : `${own.length} hallazgo${own.length === 1 ? '' : 's'}: ${shown}`;
    return { surface, label: SURFACE_LABEL_ES[surface], state, cell };
  });
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildParityPrompt(findings: ParityFinding[], meta: ParityMeta): string {
  const upstream = meta.upstreamSha ? meta.upstreamSha.slice(0, 7) : 'unknown';
  const lock = meta.lockSha ? meta.lockSha.slice(0, 7) : 'none';
  const rows = findings.map(f => `| ${f.id} | ${SURFACE_LABEL_EN[f.surface]} | ${escapeCell(f.path)} | ${escapeCell(f.evidence)} | ${f.suggested} |`);
  // A GitHub handle has a raw URL per file; a local clone (UPEX_TEMPLATE_REPO=/path) does not.
  const isGitHubHandle = /^[\w.-]+\/[\w.-]+$/.test(meta.templateRepo);
  const copies = isGitHubHandle ? `; upstream copies: https://raw.githubusercontent.com/${meta.templateRepo}/main/<path>` : '';
  return [
    `Parity review after \`bun sync\` (upstream ${meta.templateRepo}@${upstream}, project lock ${lock}).`,
    'Present the table below to the user, one row per finding, and WAIT for a decision per row',
    '(keep project | take upstream | merge) BEFORE editing anything. Then apply only the chosen rows,',
    'run tests -> types -> lint, and report.',
    `Full diffs per row live in ${meta.promptFile}${copies}.`,
    'Rows marked BLOCKING failed a compatibility contract and must be resolved for `bun run agents:compat:check` to pass.',
    '`take upstream` is suggested only where the project lacks the content entirely; a row naming project-only servers, keys, headings or edits suggests `merge` (its backup or values are in the saved file).',
    'A `merge` row says what to port (upstream additions) and what to keep (project-only). A row labelled `informational` is a project identity file compared by keys only: merge = add the listed keys, never the values.',
    '',
    '| # | Surface | File | What differs (evidence) | Suggested |',
    '|---|---|---|---|---|',
    ...rows.map((row, i) => (findings[i].blocking ? row.replace(/ \|$/, ' (BLOCKING) |') : row)),
    '',
    'Post-merge: bun run agents:compat && bun run agents:compat:check && bun run repo:check',
  ].join('\n');
}

export function buildParityFileBody(findings: ParityFinding[], meta: ParityMeta): string {
  const today = new Date().toISOString().slice(0, 10);
  const evidence = findings.filter(f => f.diff || f.detail || f.note).flatMap(f => [
    `### ${f.id}. ${f.path}`,
    '',
    f.evidence,
    '',
    ...(f.diff || f.detail ? [f.diff ? '```diff' : '```text', (f.diff ?? f.detail ?? '').trimEnd(), '```', ''] : []),
    ...(f.note ? [f.note, ''] : []),
  ]);
  return [
    '# Parity plan — AI review prompt',
    '',
    `> **AUTO-GENERATED, SINGLE-USE.** Written by \`bun sync\` on ${today}.`,
    '> Paste the prompt below into your AI session, then delete this file.',
    '> It is regenerated (overwritten) on every run that ends with findings.',
    '',
    '```text',
    buildParityPrompt(findings, meta),
    '```',
    '',
    ...(evidence.length > 0 ? ['## Evidence (full diffs: `+` is what upstream has, `-` is what the project has; for an overwritten edit, `-` is the project edit and `+` what was applied)', '', ...evidence] : []),
  ].join('\n');
}

export function renderParityReport(findings: ParityFinding[], meta: ParityMeta): ParityReport {
  return {
    surfaces: surfaceRows(findings),
    prompt: buildParityPrompt(findings, meta),
    fileBody: buildParityFileBody(findings, meta),
  };
}

// ============================================================================
// EXIT VERDICT (--strict, aborts)
// ============================================================================

export interface StrictVerdict {
  exitCode: 0 | 1
  /** One line, or null when exit 0. */
  reason: string | null
}

/** Exit 1 under `--strict` when any finding blocks; warn + exit 0 otherwise. */
export function strictVerdict(strict: boolean, findings: ParityFinding[]): StrictVerdict {
  const blocking = findings.filter(f => f.blocking);
  if (!strict || blocking.length === 0) { return { exitCode: 0, reason: null }; }
  const paths = [...new Set(blocking.map(f => f.path))];
  return {
    exitCode: 1,
    reason: `--strict: ${blocking.length} hallazgo(s) bloqueante(s) de compatibilidad (${paths.slice(0, MAX_NAMES).join(', ')}${paths.length > MAX_NAMES ? ', …' : ''}). Corrige y vuelve a correr \`bun run agents:compat:check\`.`,
  };
}

export interface RunVerdict extends StrictVerdict {
  /** The closing line the wrapper prints through `tui.outro`. */
  outro: string
}

export const ABORTED_OUTRO = 'Abortado.';

/**
 * What the process reports at the end. An aborted run (a preflight refusal:
 * dirty tree, corrupt lock, clone failure, a declined migration or
 * self-update) is never a success: exit 1 and `Abortado.` in every mode. An
 * explicit prompt cancel (Ctrl-C) never reaches here: it throws and exits 130.
 * Otherwise `--strict` decides, and the outro names the mode.
 */
export function runVerdict(
  run: { aborted: boolean, dryRun: boolean, strict: boolean },
  findings: ParityFinding[],
): RunVerdict {
  if (run.aborted) { return { exitCode: 1, reason: null, outro: ABORTED_OUTRO }; }
  const strict = strictVerdict(run.strict, findings);
  if (strict.exitCode !== 0) { return { ...strict, outro: 'Sincronizacion completada con contratos rotos (--strict).' }; }
  return { ...strict, outro: run.dryRun ? 'Dry-run completado.' : 'Sincronizacion completada.' };
}
