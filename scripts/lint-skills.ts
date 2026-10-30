#!/usr/bin/env bun
/**
 * lint-skills.ts — validates the skill composition system.
 *
 * Checks:
 *   1. ORPHAN-CATEGORY (ERROR) — SKILL.md frontmatter declares a category not in §4.1.
 *   2. STALE-MENTION   (WARN)  — Expected matches table cites a skill name that is
 *                                not in install.ts (any tier) and not in skill-registry slugs.
 *   3. TIER-MISMATCH   (ERROR) — Expected matches table annotates a skill as `(T2)`
 *                                or similar but install.ts says different tier.
 *                                install.ts is the tier authority for community
 *                                skills: one committed inside `.agents/skills/`
 *                                (projects commit them) keeps its install.ts tier
 *                                and is never reclassified as T1.
 *   4. MISSING-SECTION (ERROR) — Skill declares `complementary_categories` but has
 *                                no `## Composable Skills` heading (sprint-development
 *                                is exempt — uses `## SDD Composition`).
 *   5. EMPTY-CATEGORY  (ERROR) — §4.1 row declares a category but maps it to zero
 *                                skills (the category is unreachable).
 *   6. STALE-PATH      (ERROR) — Any file references the old `.context/skill-composition-strategy.md`
 *                                path instead of the canonical
 *                                `.agents/skills/agentic-dev-core/references/skill-composition-strategy.md`.
 *   7. DUPLICATE-TIER  (ERROR) — Same skill name appears in both SKILL_SLUGS (T2)
 *                                and PROJECT_LEVEL_SKILLS (T3) — install.ts conflict.
 *   8. SESSION-BANNER-MISSING (ERROR) — A retrofitted SKILL.md does not contain
 *                                the verbatim session-management banner prefix.
 *   9. SESSION-PHASE-0-MISSING (ERROR) — A retrofitted SKILL.md has no Phase 0
 *                                (or Phase -1) section, or that section omits `.session/`.
 *  10. SESSION-SCOPE-INVALID  (WARN)  — A `.session/<skill>/<scope>/` directory
 *                                does not match the per-skill scope regex.
 *  11. SKILL-HARDCODED-CFID   (ERROR) — `customfield_NNNN` literal id inside
 *                                any skill under `.agents/skills/` (K1).
 *                                Anti-pattern citations (line contains
 *                                NEVER/Never) are exempt.
 *  12. SKILL-FR-SUMMARY-PREFIX (ERROR) — `FR-XXX —` (em-dash) summary anti-pattern
 *                                inside any skill (K2). Anti-pattern citations
 *                                exempt.
 *  13. SKILL-DESC-HEADER      (WARN)  — `## Acceptance Criteria` / `## Scope` /
 *                                `## Out Of Scope` H2 inside any skill — may
 *                                belong in custom fields, not the description
 *                                body. Humans audit (K3).
 *  14. SKILL-LITERAL-TOOL     (ERROR) — Literal tool commands (`acli `,
 *                                `mcp__atlassian__`, `curl ... rest/api/3/`)
 *                                inside any skill (K4). Anti-pattern citations
 *                                exempt. Tool-owner skills listed in
 *                                `LITERAL_TOOL_ALLOWED_SKILLS` (e.g. `acli`)
 *                                are exempt — they legitimately own the HOW.
 *  15. SKILL-WAVE-TERMINOLOGY (ERROR) — Residual "Wave" terminology in
 *                                product-management refs and master-implementation-plan
 *                                docs (K7). Narrow scope retained: Wave→Sprint
 *                                was a product-management terminology rename;
 *                                widening would force the `hand-wave` exception
 *                                to cover legitimate prose in unrelated skills.
 *                                Exceptions: idiom `hand-wave`, anti-pattern
 *                                citations (line contains `NEVER` or quoted
 *                                `"Wave"`).
 *
 *  16. FILE-LINE              (ERROR) — A `path.ext:N` / `:N-M` / `#LN` citation in
 *                                the prose of the `.agents/` markdown or `AGENTS.md`.
 *                                A line number shifts on any edit above it; cite
 *                                the file plus a symbol or a heading. Per-line
 *                                escape: `volatile-ok: <reason>`. Severity:
 *                                VOLATILE_SEVERITY (Critical Rule #17; canon
 *                                agentic-dev-core/references/volatile-facts.md).
 *  17. CURRENT-STATE          (ERROR) — A claim about the present in the same
 *                                prose: "today", "currently", "as of <year>", a
 *                                dated measurement, "since <version>", a measured
 *                                size, a tool version. Fenced blocks and the
 *                                frontmatter are skipped. Severity:
 *                                VOLATILE_SEVERITY.
 *  18. KIND-MISSING           (ERROR) — a T1 SKILL.md must declare the purpose
 *                                axis `metadata.kind` (one of KNOWN_KINDS).
 *                                Committed community skills keep their
 *                                install.ts tier and are exempt. Doctrine:
 *                                skill-composition-strategy.md §2b.
 *  19. KIND-VOCAB             (ERROR) — a declared `metadata.kind` outside
 *                                context / workflow / utility / core.
 *  20. KIND-SUFFIX            (ERROR) — the slug suffix and the declared kind
 *                                agree in BOTH directions (KIND_SUFFIX_RULES):
 *                                `-context` ⇔ `context`, `-cli` / `-tool` /
 *                                `-app` ⇔ `utility`. Slugs in
 *                                KIND_SUFFIX_EXEMPT predate the rule.
 *  21. CAPABILITY-VOCAB       (ERROR) — a name in `metadata.requires_capabilities`
 *                                outside KNOWN_CAPABILITIES, the mirror of
 *                                agentic-dev-core/references/mcp-capabilities.md §2.
 *  22. CAPABILITY-UNDECLARED  (WARN)  — a T1 SKILL.md body (outside fenced
 *                                blocks) carries a resolution tag from
 *                                CAPABILITY_TAGS without declaring the matching
 *                                capability (mcp-capabilities.md §3). A `core`
 *                                skill is skipped: it hosts the doctrine that
 *                                describes the tags.
 *  23. STAGE-OWNER-DISPATCH   (ERROR) — `metadata.stage_owner: true` without a
 *                                dispatch section (DISPATCH_SECTION_HEADING:
 *                                `## Subagent Dispatch Strategy`,
 *                                `## Subagent dispatch` or `## Session & Dispatch`).
 *  24. CONTEXT-WRITES         (ERROR) — `metadata.writes` (skill-scaffold.md §2,
 *                                the context-kind amendment) declared by a
 *                                non-context skill, naming a target outside the
 *                                skill's own `references/`, without
 *                                `references/refresh.md`, or next to a tracker
 *                                tag (TRACKER_WRITE_TAGS): a context skill edits
 *                                its own map, never Jira or Confluence.
 *  25. STALE-PATH (context)   (ERROR) — inside a `metadata.kind: context` skill
 *                                every `.context/` cite must exist on disk (the
 *                                map is born before the skill); only the
 *                                gitignored `.context/PBI/` cache is exempt.
 *  26. T4-LOADER              (ERROR) — every slug in cli/install.ts:USER_LEVEL_SKILLS
 *                                must have a row in the "Loaded by / when" table of
 *                                `agentic-dev-onboard/SKILL.md` §"Community skills
 *                                installed at user level", and the row's loader cell
 *                                must either cite its loader in backticks or say
 *                                "user-invoked only". No-op when USER_LEVEL_SKILLS
 *                                is empty.
 *
 * Note: `complementary_categories` frontmatter is OPTIONAL on every T1 skill.
 * Skills that do not need to borrow community capability (e.g. pure CLI wrappers
 * like git-flow-master, acli) simply omit the field — no warning, no info.
 *
 * Exit codes:
 *   0 — no errors (warnings/info OK)
 *   1 — at least one ERROR found
 */

import type { VolatileKind } from './lib/volatile-facts';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ADOPT_UPSTREAM_SKILLS_DIR, isToolingSkill, readUpstreamOwned } from '../cli/lib/tooling-scope.ts';
import { maskPreservedAppInstructions } from '../cli/lib/updater-adopt.ts';
import { isVolatileExemptPath, scanVolatile, volatileRemedy } from './lib/volatile-facts';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

// `LINT_SKILLS_ROOT` exists for the regression tests (fixture repos); every
// normal run resolves the repo from this file's location.
const REPO_ROOT = process.env.LINT_SKILLS_ROOT ?? join(import.meta.dir, '..');
const SKILLS_DIR = join(REPO_ROOT, '.agents/skills');
const STRATEGY_DOC = join(SKILLS_DIR, 'agentic-dev-core/references/skill-composition-strategy.md');
const INSTALL_TS = join(REPO_ROOT, 'cli/install.ts');
const STALE_PATH_LITERAL = '.context/skill-composition-strategy.md';
const SCAN_FOR_STALE_PATH = ['AGENTS.md', '.agents/skills', '.context'];
const SPRINT_DEV_EXEMPT = 'sprint-development'; // uses "## SDD Composition" instead

/**
 * Skills exempt from SKILL-LITERAL-TOOL — they legitimately own the HOW for a
 * specific tool surface and MUST quote literal commands (e.g. `acli` owns
 * Jira / Confluence CLI syntax). One-line to extend.
 */
const LITERAL_TOOL_ALLOWED_SKILLS = new Set<string>(['acli']);

/**
 * Skills exempt from SKILL-HARDCODED-CFID — tool-owner skills that teach users
 * how to interact with Jira customfields and must quote concrete IDs in
 * pedagogical examples (CSV payloads, REST shapes). Workflow skills consume
 * customfields via the slug catalog; tool-owner skills document the underlying
 * surface and need the literal IDs to remain useful.
 */
const HARDCODED_CFID_ALLOWED_SKILLS = new Set<string>(['acli']);

/**
 * Files at the root of `.agents/skills/` (not inside any skill subdirectory)
 * that are autogenerated aggregates of upstream skill metadata. Linting these
 * is double-counting — the rules are enforced at the source skill. Lint the
 * generators / sources, not the cache.
 */
const SKILL_AGGREGATE_FILES = new Set<string>(['REGISTRY.md']);

/**
 * Severity of the two volatile-facts checks (16-17). ERROR: the prose sweep
 * left no residue, so a new hit is a regression, not one more line in a
 * backlog. A line that must carry the shape says why with `volatile-ok:`.
 */
const VOLATILE_SEVERITY: Record<VolatileKind, Severity> = {
  'FILE-LINE': 'ERROR',
  'CURRENT-STATE': 'ERROR',
};

// -----------------------------------------------------------------------------
// Skill-system axes (checks 18-25; canon agentic-dev-core/references/skill-scaffold.md)
// -----------------------------------------------------------------------------

/**
 * Purpose axis vocabulary (`metadata.kind`), mirroring §2b of the strategy doc.
 * Orthogonal to the tier (ownership) and to `complementary_categories`
 * (domain): a skill is exactly one of these. Checks 18-20.
 */
const KNOWN_KINDS = new Set(['context', 'workflow', 'utility', 'core']);

/**
 * Slugs exempt from KIND-SUFFIX (check 20), in both directions. Every entry
 * predates the suffix rule and is grandfathered BY NAME so the exemption stays
 * visible here instead of hiding in a looser regex:
 *   - `acli`: a utility without the `-cli` / `-tool` / `-app` suffix.
 *   - `project-context`: a workflow whose slug ends `-context` (the suffix the
 *     `context` kind reserves). `UPSTREAM_CONTEXT_SUFFIX_SKILLS` in
 *     `cli/lib/updater-core.ts` mirrors the `-context` entries; a test there
 *     keeps the two in step.
 * A new skill picks a slug that matches its kind; it does not get added here.
 */
const KIND_SUFFIX_EXEMPT = new Set<string>(['acli', 'project-context']);

/**
 * Suffix ⇔ kind table for KIND-SUFFIX (check 20). `workflow` and `core` are
 * absent on purpose: they carry no suffix rule.
 */
const KIND_SUFFIX_RULES: ReadonlyArray<{ kind: string, suffixes: readonly string[] }> = [
  { kind: 'context', suffixes: ['-context'] },
  { kind: 'utility', suffixes: ['-cli', '-tool', '-app'] },
];

/**
 * MCP capability vocabulary (`metadata.requires_capabilities`), mirroring §2
 * of agentic-dev-core/references/mcp-capabilities.md. A skill declares the
 * CAPABILITY it needs, never a server name. Add a name here AND in the
 * reference, in the same change. Check 21.
 */
const KNOWN_CAPABILITIES = new Set(['library-docs', 'web-search', 'db', 'automation-flows', 'diagrams']);

/**
 * Resolution tag → capability it resolves to (`.agents/instructions/agent-tool-resolution.md` §6). Drives the
 * CAPABILITY-UNDECLARED heuristic (check 22). `[ISSUE_TRACKER_TOOL]` and
 * `[AUTOMATION_TOOL]` are absent on purpose: they resolve to CLIs.
 */
const CAPABILITY_TAGS: ReadonlyArray<{ tag: string, capability: string }> = [
  { tag: '[DB_TOOL]', capability: 'db' },
  { tag: '[DOCS_TOOL]', capability: 'library-docs' },
  { tag: '[WEB_SEARCH_TOOL]', capability: 'web-search' },
  { tag: '[AUTOMATION_FLOWS_TOOL]', capability: 'automation-flows' },
];

/** Tracker resolution tags a context skill with a write scope must never carry (check 24). */
const TRACKER_WRITE_TAGS = ['[ISSUE_TRACKER_TOOL]', '[KNOWLEDGE_BASE_TOOL]'];

/**
 * The dispatch section a stage-owning skill must carry (check 23). Three
 * spellings, because this repo's stage owners grew them independently and each
 * one holds the dispatch contract: renaming headings would buy nothing.
 */
const DISPATCH_SECTION_HEADING = /^## (?:Subagent Dispatch Strategy|Subagent dispatch|Session & Dispatch)\s*$/m;

/** The gitignored Jira cache: never on disk in the boilerplate, exempt from check 25. */
const CONTEXT_CACHE_PREFIX = '.context/PBI/';

// -----------------------------------------------------------------------------
// Session-management contract (per agentic-dev-core/references/session-management.md §14)
// -----------------------------------------------------------------------------

/**
 * Skills that adopted the session-management contract. Each maps to the regex
 * that the immediate child directory under `.session/<skill>/` must satisfy,
 * or `null` if the skill stores state directly under `.session/<skill>/` with
 * no `<scope>` segment. Skills NOT in this map are exempt from BANNER, PHASE-0,
 * and SCOPE-INVALID checks.
 */
const SESSION_RETROFITTED_SKILLS: Record<string, RegExp | null> = {
  // Scope is the run MODE, not a ticket — one lock + one progress trail per mode.
  'autonomous-delivery': /^(?:story|bug|discovery)$/,
  'project-foundation': null,
  'project-bootstrap': null,
  'project-adoption': null,
  // `seed` (curation root) is a strict subset of `[a-z0-9][a-z0-9-]*`
  // (kebab-case epic slug); no separate literal branch is needed.
  'product-management': /^[a-z0-9][a-z0-9-]*$/,
  'design-system': null,
  'testability-guide': null,
  'sprint-development': /^[A-Z]+-\d+$/,
};

/**
 * Invariant prefix of the orchestration + session banner that every retrofitted
 * SKILL.md must contain verbatim. Continues differently in the progress-only
 * variant (sprint-development) but the prefix up to "archive on completion)."
 * is identical in both forms. Contains an em-dash (U+2014) between "dispatch"
 * and "main thread" — copy-paste from project-foundation/SKILL.md; do not retype.
 */
const SESSION_BANNER_PREFIX = '> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion).';

/**
 * Matches `## Phase 0`, `## Phase 0.0`, `## Phase -1` (ASCII hyphen-minus), or
 * `## Phase −1` (U+2212 minus). The session-resume Phase 0 is named `-1` in
 * test-documentation to avoid a numeric collision with its existing Phase 0.
 */
const PHASE_0_HEADING = /^## Phase (?:0(?:\.0)?|-1|−1)(?:\s|$)/m;

// -----------------------------------------------------------------------------
// Findings collector
// -----------------------------------------------------------------------------

type Severity = 'ERROR' | 'WARN' | 'INFO';
interface Finding {
  severity: Severity
  code: string
  scope: string
  message: string
}

const findings: Finding[] = [];

function record(severity: Severity, code: string, scope: string, message: string) {
  findings.push({ severity, code, scope, message });
}

// -----------------------------------------------------------------------------
// Frontmatter parsing
// -----------------------------------------------------------------------------

interface SkillMeta {
  name: string
  path: string
  body: string
  /** `metadata.kind`; undefined when absent (KIND-MISSING). */
  kind?: string
  stageOwner: boolean
  /** `metadata.requires_capabilities`; undefined when the key is absent. */
  requiresCapabilities?: string[]
  /** `metadata.writes` (a context skill's own write scope); undefined when absent. */
  writes?: string[]
  complementaryCategories: string[]
  hasComposableSection: boolean
  expectedMatchesSkills: string[] // skills mentioned in the "Expected matches" table
  expectedMatchesTierAnnotations: Map<string, string> // skill → annotated tier (e.g. "T2", "T3", "T4 ASK")
}

interface Frontmatter {
  complementary_categories?: string[]
  metadata?: {
    kind?: unknown
    stage_owner?: unknown
    requires_capabilities?: unknown
    writes?: unknown
  }
}

/** A list-valued frontmatter key as strings; undefined when the key is absent. */
function stringList(value: unknown): string[] | undefined {
  if (value === undefined) { return undefined; }
  if (value === null) { return []; }
  if (Array.isArray(value)) { return value.map(v => String(v)); }
  return [String(value)];
}

function parseFrontmatter(raw: string): { meta: Frontmatter, body: string } {
  if (!raw.startsWith('---\n')) { return { meta: {}, body: raw }; }
  const end = raw.indexOf('\n---', 4);
  if (end === -1) { return { meta: {}, body: raw }; }
  const yamlText = raw.slice(4, end);
  const body = raw.slice(end + 4);
  try {
    return { meta: (parseYaml(yamlText) ?? {}) as Frontmatter, body };
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    record('ERROR', 'BAD-FRONTMATTER', 'unknown', `YAML parse error: ${message}`);
    return { meta: {}, body };
  }
}

function extractExpectedMatches(body: string): {
  skills: string[]
  tierAnnotations: Map<string, string>
} {
  // Find the section starting with "## Composable Skills" or "## SDD Composition"
  // Look at "Expected matches" table inside it.
  const skills: string[] = [];
  const tierAnnotations = new Map<string, string>();
  const headings = ['## Composable Skills', '## SDD Composition'];
  let sectionStart = -1;
  for (const h of headings) {
    const idx = body.indexOf(h);
    if (idx !== -1) { sectionStart = idx; break; }
  }
  if (sectionStart === -1) { return { skills, tierAnnotations }; }
  // Section ends at next "## " heading (not ###)
  const restAfterStart = body.slice(sectionStart);
  const nextH2 = restAfterStart.slice(2).search(/\n## /);
  const sectionText = nextH2 === -1 ? restAfterStart : restAfterStart.slice(0, nextH2 + 2);
  // Match table rows: lines starting with `|`. Skip header + separator.
  const rows = sectionText.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('| ---') && !/\| Category /.test(l));
  for (const row of rows) {
    // Split into cells. First cell is category, second+ are skill listings.
    const cells = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length < 2) { continue; }
    const skillsCells = cells.slice(1).join(' | '); // join cell[1..n] for matches
    const skillMatches = skillsCells.matchAll(/`([a-z][a-z0-9-]+(?:\/[a-z0-9-]+)?)`/g);
    for (const m of skillMatches) {
      const name = m[1];
      // Filter non-skill tokens (tier markers, status words, common CLI tools)
      if (/^(?:T[1-4]|silent|ASK|none|hybrid|engram|file|strict|standard|off)$/i.test(name)) { continue; }
      if (/^(?:gh|git|npm|pnpm|yarn|npx)$/.test(name)) { continue; }
      skills.push(name);
      // Tier annotation: "(T2)", "(T3)", "(T4)" right after the backtick
      const tierMatch = skillsCells.match(new RegExp(`\`${name}\`\\s*\\((T[1-4])\\)`));
      if (tierMatch) { tierAnnotations.set(name, tierMatch[1]); }
      // "T4 ASK:" prefix marks subsequent skills in that segment as T4
      const beforeName = skillsCells.slice(0, skillsCells.indexOf(`\`${name}\``));
      const lastT4Ask = beforeName.lastIndexOf('T4 ASK');
      const lastSemicolon = beforeName.lastIndexOf(';');
      if (lastT4Ask !== -1 && lastT4Ask > lastSemicolon) {
        tierAnnotations.set(name, 'T4');
      }
    }
  }
  return { skills: [...new Set(skills)], tierAnnotations };
}

function loadSkill(name: string): SkillMeta | null {
  const path = join(SKILLS_DIR, name, 'SKILL.md');
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); }
  catch { return null; }
  const { meta, body } = parseFrontmatter(raw);
  const cats = Array.isArray(meta.complementary_categories) ? meta.complementary_categories : [];
  const hasSection = body.includes('## Composable Skills') || body.includes('## SDD Composition');
  const { skills, tierAnnotations } = extractExpectedMatches(body);
  const metadata = meta.metadata && typeof meta.metadata === 'object' ? meta.metadata : {};
  return {
    name,
    path,
    body,
    kind: typeof metadata.kind === 'string' ? metadata.kind : undefined,
    stageOwner: metadata.stage_owner === true,
    requiresCapabilities: stringList(metadata.requires_capabilities),
    writes: stringList(metadata.writes),
    complementaryCategories: cats,
    hasComposableSection: hasSection,
    expectedMatchesSkills: skills,
    expectedMatchesTierAnnotations: tierAnnotations,
  };
}

// -----------------------------------------------------------------------------
// install.ts parsing — extract T2 / T3 / T4 skill names
// -----------------------------------------------------------------------------

function extractInstallTsSkills(): { t2: Set<string>, t3: Set<string>, t4: Set<string> } {
  const src = readFileSync(INSTALL_TS, 'utf8');
  const t2 = new Set<string>();
  const t3 = new Set<string>();
  const t4 = new Set<string>();

  // SKILL_SLUGS — array of string literals
  const slugsMatch = src.match(/const SKILL_SLUGS = \[([^\]]+)\]/);
  if (slugsMatch) {
    for (const m of slugsMatch[1].matchAll(/['"]([a-z][a-z0-9-]+)['"]/g)) { t2.add(m[1]); }
  }

  // PROJECT_LEVEL_SKILLS / USER_LEVEL_SKILLS — array of object literals { skill: '...' }
  const projMatch = src.match(/const PROJECT_LEVEL_SKILLS[^=]*=\s*\[([\s\S]*?)\];/);
  if (projMatch) {
    for (const m of projMatch[1].matchAll(/skill:\s*['"]([a-z][a-z0-9-]+)['"]/g)) { t3.add(m[1]); }
  }
  const userMatch = src.match(/const USER_LEVEL_SKILLS[^=]*=\s*\[([\s\S]*?)\];/);
  if (userMatch) {
    for (const m of userMatch[1].matchAll(/skill:\s*['"]([a-z][a-z0-9-]+)['"]/g)) { t4.add(m[1]); }
    // also catch entries with only `package` (whole-repo installs like n8n-skills)
    for (const m of userMatch[1].matchAll(/package:\s*['"]([^'"]*)['"]\s*\}/g)) {
      const pkg = m[1];
      const last = pkg.split('/').pop()?.replace(/\.git$/, '');
      if (last) { t4.add(last); }
    }
  }

  return { t2, t3, t4 };
}

// -----------------------------------------------------------------------------
// Strategy doc §4.1 parsing — category → skills lookup
// -----------------------------------------------------------------------------

interface CategoryEntry {
  skills: string[]
  /**
   * True when §4.1 cell explicitly marks the category as T1-only (no community
   * skills exist — e.g. `issue-tracker` is covered solely by the project-owned
   * `acli` skill). EMPTY-CATEGORY does not fire for these.
   */
  t1Only: boolean
}

function extractCategoryVocab(): Map<string, CategoryEntry> {
  const src = readFileSync(STRATEGY_DOC, 'utf8');
  const startMarker = '### 4.1 Category list';
  const endMarker = '### 4.2';
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    record('ERROR', 'BAD-STRATEGY-DOC', 'strategy', '§4.1 or §4.2 heading missing');
    return new Map();
  }
  const section = src.slice(start, end);
  const vocab = new Map<string, CategoryEntry>();
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) { continue; }
    if (line.includes('---')) { continue; }
    if (line.includes('Category')) { continue; }
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) { continue; }
    const catMatch = cells[0].match(/^`([a-z][a-z0-9-]+)`$/);
    if (!catMatch) { continue; }
    const category = catMatch[1];
    const skillCell = cells[1];
    const skills = [...skillCell.matchAll(/`([a-z][a-z0-9-]+)`/g)].map(m => m[1]);
    // Detect intentional T1-only marker (e.g. "(acli is T1)") so EMPTY-CATEGORY
    // is suppressed for documented project-owned-only domains.
    const t1Only = /\bis\s+T1\b/i.test(skillCell);
    vocab.set(category, { skills, t1Only });
  }
  return vocab;
}

// -----------------------------------------------------------------------------
// Path mismatch scan (Check 6)
// -----------------------------------------------------------------------------

function walk(dir: string, files: string[] = []): string[] {
  let entries;
  try { entries = readdirSync(dir); }
  catch { return files; }
  for (const e of entries) {
    const full = join(dir, e);
    let s;
    try { s = statSync(full); }
    catch { continue; }
    if (s.isDirectory()) { walk(full, files); }
    else if (e.endsWith('.md')) { files.push(full); }
  }
  return files;
}

function scanForStalePath() {
  const targets: string[] = [];
  for (const t of SCAN_FOR_STALE_PATH) {
    const full = join(REPO_ROOT, t);
    let s;
    try { s = statSync(full); }
    catch { continue; }
    if (s.isDirectory()) { targets.push(...walk(full)); }
    else { targets.push(full); }
  }
  for (const f of targets) {
    const text = readFileSync(f, 'utf8');
    const idx = text.indexOf(STALE_PATH_LITERAL);
    if (idx === -1) { continue; }
    // Strip leading prefix to compute line number
    const line = text.slice(0, idx).split('\n').length;
    record('ERROR', 'STALE-PATH', f.replace(`${REPO_ROOT}/`, ''), `line ${line}: stale ref to '.context/skill-composition-strategy.md' (canonical: '.agents/skills/agentic-dev-core/references/skill-composition-strategy.md')`);
  }
}

// -----------------------------------------------------------------------------
// Inline-code STALE-PATH scan (per-skill, body-scoped)
// -----------------------------------------------------------------------------

function stripFencedCodeBlocks(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '');
}

const INLINE_CODE_PATH
  = /`((?:\.claude\/skills|scripts|cli|\.agents|tests|api)\/[\w./-]+)`/g;

/**
 * Paths that are documented but intentionally generated by a separate manual
 * script (not present in the repo at all times). The lint skips STALE-PATH for
 * these. Each entry's existence is owned by another script — STALE-PATH would
 * be a false positive.
 */
const STALE_PATH_DEFERRED_ALLOWLIST = new Set<string>([
  // .agents/jira-link-types.json — synced by `bun run jira:sync-link-types`.
  // Sync script is stubbed (see scripts/sync-jira-link-types.ts); the JSON
  // file appears only after a real workspace sync. Skills reference the path
  // to teach the contract; STALE-PATH must not fire while it's deferred.
  '.agents/jira-link-types.json',
  // .agents/jira-fields.json + jira-workflows.json — per-INSTANCE catalogs
  // written by `bun run jira:sync-fields` / `jira:sync-workflows` against the
  // project's own Jira. Never delivered (REPO_ONLY_PATHS in
  // cli/update-boilerplate.ts, TEMPLATE_EXCLUDES in the scaffolder), so a fresh
  // project or an adopted app lacks them until that sync runs.
  '.agents/jira-fields.json',
  '.agents/jira-workflows.json',
]);

function checkInlineStalePaths(
  skillSlug: string,
  skillDir: string,
  body: string,
  repoRoot: string,
): void {
  const stripped = stripFencedCodeBlocks(body);
  INLINE_CODE_PATH.lastIndex = 0;
  for (const match of stripped.matchAll(INLINE_CODE_PATH)) {
    const path = match[1];
    if (path.startsWith('/')) { continue; }
    if (path.endsWith('/')) { continue; } // directory-shape illustration, not a file ref
    if (STALE_PATH_DEFERRED_ALLOWLIST.has(path)) { continue; }
    // Skill-dir-first resolution: shorthand like `scripts/foo.ts` inside a skill
    // body resolves against the skill's own directory; fall back to repo root.
    if (existsSync(join(skillDir, path))) { continue; }
    if (existsSync(join(repoRoot, path))) { continue; }
    record('ERROR', 'STALE-PATH', skillSlug, `\`${path}\` referenced in SKILL.md body does not exist on disk`);
  }
}

// -----------------------------------------------------------------------------
// Skill-system axes (checks 18-25)
// -----------------------------------------------------------------------------

function checkKind(skill: SkillMeta): void {
  if (skill.kind === undefined) {
    record('ERROR', 'KIND-MISSING', skill.name, 'frontmatter must declare `metadata.kind` (one of: context, workflow, utility, core); see skill-composition-strategy.md §2b');
    return;
  }
  if (!KNOWN_KINDS.has(skill.kind)) {
    record('ERROR', 'KIND-VOCAB', skill.name, `\`metadata.kind: ${skill.kind}\` is not in the §2b vocabulary (context, workflow, utility, core)`);
    return;
  }
  if (KIND_SUFFIX_EXEMPT.has(skill.name)) { return; }
  for (const rule of KIND_SUFFIX_RULES) {
    const matchedSuffix = rule.suffixes.find(sfx => skill.name.endsWith(sfx));
    if (matchedSuffix && skill.kind !== rule.kind) {
      record('ERROR', 'KIND-SUFFIX', skill.name, `slug ends \`${matchedSuffix}\` so \`metadata.kind\` must be \`${rule.kind}\`, found \`${skill.kind}\``);
    }
    if (!matchedSuffix && skill.kind === rule.kind) {
      record('ERROR', 'KIND-SUFFIX', skill.name, `\`metadata.kind: ${rule.kind}\` requires a slug ending ${rule.suffixes.map(sfx => `\`${sfx}\``).join(' / ')} (grandfathered by name in KIND_SUFFIX_EXEMPT: ${[...KIND_SUFFIX_EXEMPT].join(', ')})`);
    }
  }
}

function checkCapabilities(skill: SkillMeta): void {
  for (const capability of skill.requiresCapabilities ?? []) {
    if (!KNOWN_CAPABILITIES.has(capability)) {
      record('ERROR', 'CAPABILITY-VOCAB', skill.name, `\`metadata.requires_capabilities\` names \`${capability}\`, not in the mcp-capabilities.md §2 vocabulary (${[...KNOWN_CAPABILITIES].join(', ')})`);
    }
  }
  if (skill.kind === 'core') { return; }
  const declared = new Set(skill.requiresCapabilities ?? []);
  const prose = stripFencedCodeBlocks(skill.body);
  for (const { tag, capability } of CAPABILITY_TAGS) {
    if (prose.includes(tag) && !declared.has(capability)) {
      record('WARN', 'CAPABILITY-UNDECLARED', skill.name, `body uses \`${tag}\` but \`metadata.requires_capabilities\` does not declare \`${capability}\` (declare it, or drop the mention if the skill never uses it; mcp-capabilities.md §3)`);
    }
  }
}

function checkStageOwnerDispatch(skill: SkillMeta): void {
  if (!skill.stageOwner || DISPATCH_SECTION_HEADING.test(skill.body)) { return; }
  record('ERROR', 'STAGE-OWNER-DISPATCH', skill.name, 'frontmatter declares `metadata.stage_owner: true` but the body has no dispatch section (`## Subagent Dispatch Strategy`, `## Subagent dispatch` or `## Session & Dispatch`; AGENTS.md §3)');
}

function checkContextWrites(skill: SkillMeta, skillDir: string): void {
  if (skill.writes === undefined) { return; }
  if (skill.kind !== 'context') {
    record('ERROR', 'CONTEXT-WRITES', skill.name, `\`metadata.writes\` is the context-kind amendment; a \`${skill.kind ?? 'kind-less'}\` skill does not declare a write scope (skill-scaffold.md §2)`);
    return;
  }
  for (const target of skill.writes) {
    const normalized = target.replace(/^\.\//, '');
    if (normalized !== 'references' && !normalized.startsWith('references/')) {
      record('ERROR', 'CONTEXT-WRITES', skill.name, `\`metadata.writes\` names \`${target}\`; a context skill writes only under its own \`references/\``);
    }
  }
  const refreshPath = join(skillDir, 'references', 'refresh.md');
  const hasRefresh = existsSync(refreshPath);
  if (!hasRefresh) {
    record('ERROR', 'CONTEXT-WRITES', skill.name, 'a context skill that declares `metadata.writes` must carry `references/refresh.md`, the procedure its write path runs');
  }
  const surfaces = [skill.body, hasRefresh ? readFileSync(refreshPath, 'utf8') : ''];
  for (const tag of TRACKER_WRITE_TAGS) {
    if (surfaces.some(text => text.includes(tag))) {
      record('ERROR', 'CONTEXT-WRITES', skill.name, `a context skill with a write scope carries \`${tag}\`; it edits its own map, never a tracker`);
    }
  }
}

const INLINE_CONTEXT_PATH = /`(\.context\/[\w./-]+)`/g;

function checkContextSkillCites(skill: SkillMeta): void {
  if (skill.kind !== 'context') { return; }
  for (const match of stripFencedCodeBlocks(skill.body).matchAll(INLINE_CONTEXT_PATH)) {
    const path = match[1];
    if (path.startsWith(CONTEXT_CACHE_PREFIX)) { continue; }
    if (existsSync(join(REPO_ROOT, path))) { continue; }
    record('ERROR', 'STALE-PATH', skill.name, `\`${path}\` cited by a context skill does not exist on disk (a context skill cites what exists; skill-scaffold.md §3)`);
  }
}

// -----------------------------------------------------------------------------
// Session-management checks (per agentic-dev-core/references/session-management.md §14)
// -----------------------------------------------------------------------------

function checkSessionBanner(skill: SkillMeta): void {
  if (!(skill.name in SESSION_RETROFITTED_SKILLS)) { return; }
  if (!skill.body.includes(SESSION_BANNER_PREFIX)) {
    record('ERROR', 'SESSION-BANNER-MISSING', skill.name, 'SKILL.md body missing the verbatim session-management banner prefix (see session-management.md §3)');
  }
}

function checkSessionPhase0(skill: SkillMeta): void {
  if (!(skill.name in SESSION_RETROFITTED_SKILLS)) { return; }
  const match = PHASE_0_HEADING.exec(skill.body);
  if (!match) {
    record('ERROR', 'SESSION-PHASE-0-MISSING', skill.name, 'SKILL.md has no `## Phase 0` (or `## Phase -1`) heading');
    return;
  }
  const headingIdx = match.index;
  const restAfter = skill.body.slice(headingIdx + match[0].length);
  const nextH2 = restAfter.search(/\n## /);
  const sectionBody = nextH2 === -1 ? restAfter : restAfter.slice(0, nextH2);
  if (!sectionBody.includes('.session/')) {
    record('ERROR', 'SESSION-PHASE-0-MISSING', skill.name, 'Phase 0 section does not mention `.session/` — must reference session-management resume path');
  }
}

function checkSessionScopes(): void {
  const sessionRoot = join(REPO_ROOT, '.session');
  if (!existsSync(sessionRoot)) { return; }
  for (const [skillSlug, scopeRegex] of Object.entries(SESSION_RETROFITTED_SKILLS)) {
    const skillSessionDir = join(sessionRoot, skillSlug);
    if (!existsSync(skillSessionDir)) { continue; }
    let entries: string[];
    try { entries = readdirSync(skillSessionDir); }
    catch { continue; }
    for (const e of entries) {
      const full = join(skillSessionDir, e);
      let s;
      try { s = statSync(full); }
      catch { continue; }
      if (scopeRegex === null) {
        if (s.isDirectory()) {
          record('WARN', 'SESSION-SCOPE-INVALID', skillSlug, `.session/${skillSlug}/${e}/ exists but ${skillSlug} stores state directly under .session/${skillSlug}/ (no <scope> segment expected)`);
        }
      }
      else {
        if (!s.isDirectory()) { continue; }
        if (!scopeRegex.test(e)) {
          record('WARN', 'SESSION-SCOPE-INVALID', skillSlug, `.session/${skillSlug}/${e}/ does not match expected scope shape ${scopeRegex}`);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Skill-wide refactor checks (K1–K4 repo-wide; K7 narrow per the May 2026 plan)
// -----------------------------------------------------------------------------

const PRODUCT_MANAGEMENT_DIR = join(SKILLS_DIR, 'product-management');
const MASTER_PLAN_DOCS = [
  join(SKILLS_DIR, 'project-context/references/master-plan.md'),
  join(REPO_ROOT, '.context/master-implementation-plan.md'),
];

/**
 * Resolves a file path under `.agents/skills/` to its owning skill slug
 * (immediate child directory of SKILLS_DIR). Returns null when the file
 * sits outside any skill (e.g. `.context/master-implementation-plan.md`).
 */
function skillSlugForFile(file: string): string | null {
  // Normalize separators before comparing. `SKILLS_DIR` and `file` are built with
  // path.join (backslashes on Windows), but the prefix is forward-slash-suffixed.
  // Without normalization every startsWith() fails on Windows, so no file maps to a
  // skill slug and every tool-owner skill loses its SKILL-LITERAL-TOOL/CFID exemption.
  const normFile = file.replace(/\\/g, '/');
  const prefix = `${SKILLS_DIR.replace(/\\/g, '/')}/`;
  if (!normFile.startsWith(prefix)) { return null; }
  const rest = normFile.slice(prefix.length);
  const slash = rest.indexOf('/');
  return slash === -1 ? rest : rest.slice(0, slash);
}

/**
 * Anti-pattern citations are lines that document the rule by stating it
 * negatively (e.g. "NEVER hardcode customfield_NNNNN", "❌ No literal tool
 * commands"). These lines legitimately include the banned token as an
 * illustration; skipping them prevents the methodology's own rules from
 * tripping their own lint.
 *
 * Heuristic — line matches ANY of:
 *   - `NEVER`, `Never ` (caveat: must be followed by space to skip false hits like "Nevertheless")
 *   - `Anti-pattern`, `Restrictions`, `never appear`
 *   - leading `❌` (negative checklist row)
 *   - `**No ` (bolded "No" prefix used in summary anti-pattern callouts)
 *   - `- No ` (bulleted "No" anti-pattern row at start of bullet)
 */
function isAntiPatternCitation(line: string): boolean {
  if (/\b(?:NEVER|Never |Anti-pattern|Restrictions|never appear)\b/.test(line)) { return true; }
  if (/❌/.test(line)) { return true; }
  if (/\*\*No\s/.test(line)) { return true; } // "**No `FR-XXX —` prefix.**"
  if (/^\s*[-*]\s+No\s/.test(line)) { return true; }
  return false;
}

interface GrepFinding {
  file: string
  line: number
  text: string
}

function gatherAllSkillMarkdown(): string[] {
  if (!existsSync(SKILLS_DIR)) { return []; }
  return walk(SKILLS_DIR).filter((f) => {
    // Skip autogenerated aggregate files at SKILLS_DIR root (e.g. REGISTRY.md).
    const rel = f.slice(SKILLS_DIR.length + 1);
    if (!rel.includes('/') && SKILL_AGGREGATE_FILES.has(rel)) { return false; }
    // An adopted app's own skills are not this doctrine's (`cli/lib/tooling-scope.ts`).
    if (!rel.includes('/')) { return true; }
    const name = rel.split('/')[0];
    const owned = readUpstreamOwned(REPO_ROOT);
    return isToolingSkill(name, owned) && !(owned !== null && existsSync(join(REPO_ROOT, ADOPT_UPSTREAM_SKILLS_DIR, name)));
  });
}

function gatherProductManagementMarkdown(): string[] {
  if (!existsSync(PRODUCT_MANAGEMENT_DIR)) { return []; }
  return walk(PRODUCT_MANAGEMENT_DIR);
}

function scanLines(
  files: string[],
  pattern: RegExp,
  predicate: (line: string, match: RegExpExecArray) => boolean,
): GrepFinding[] {
  const out: GrepFinding[] = [];
  for (const file of files) {
    let text: string;
    try { text = readFileSync(file, 'utf8'); }
    catch { continue; }
    const lines = text.split('\n');
    // Track fenced code blocks so structural rules (e.g. SKILL-DESC-HEADER)
    // ignore template content that sits INSIDE ```fences``` — those lines are
    // illustrative markdown samples, not real document structure.
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) { continue; }
      pattern.lastIndex = 0;
      const m = pattern.exec(line);
      if (m === null) { continue; }
      if (!predicate(line, m)) { continue; }
      out.push({ file, line: i + 1, text: line.trim() });
    }
  }
  return out;
}

function relScope(file: string): string {
  return file.replace(`${REPO_ROOT}/`, '');
}

function checkSkillHardcodedCfid(files: string[]): void {
  // K1: customfield_NNNN literals.
  // Tool-owner skills in HARDCODED_CFID_ALLOWED_SKILLS are exempt — they own
  // the HOW and must quote concrete customfield IDs in pedagogical examples.
  const re = /customfield_\d{4,}/;
  const allowed = (file: string) => {
    const slug = skillSlugForFile(file);
    return slug !== null && HARDCODED_CFID_ALLOWED_SKILLS.has(slug);
  };
  const scoped = files.filter(f => !allowed(f));
  const hits = scanLines(scoped, re, line => !isAntiPatternCitation(line));
  for (const h of hits) {
    record(
      'ERROR',
      'SKILL-HARDCODED-CFID',
      relScope(h.file),
      `line ${h.line}: hardcoded \`${h.text.match(re)?.[0]}\` — use {{jira.<slug>}} instead`,
    );
  }
}

function checkSkillFrSummaryPrefix(files: string[]): void {
  // K2: `FR-XXX —` em-dash anti-pattern.
  // Use em-dash U+2014 literal.
  const re = /FR-[A-Z0-9]{3,} —/;
  const hits = scanLines(files, re, line => !isAntiPatternCitation(line));
  for (const h of hits) {
    record(
      'ERROR',
      'SKILL-FR-SUMMARY-PREFIX',
      relScope(h.file),
      `line ${h.line}: \`FR-XXX —\` summary anti-pattern — use \`**Source spec:** FR-XXX\` as the first body line`,
    );
  }
}

function checkSkillDescriptionHeaders(files: string[]): void {
  // K3: ## Acceptance Criteria / ## Scope / ## Out Of Scope H2 headers — WARN.
  const re = /^## (Acceptance [Cc]riteria|Scope|Out [Oo]f [Ss]cope)\s*$/;
  const hits = scanLines(files, re, () => true);
  for (const h of hits) {
    record(
      'WARN',
      'SKILL-DESC-HEADER',
      relScope(h.file),
      `line ${h.line}: \`${h.text}\` — verify this lives in a methodology discussion section, not a description template (custom fields own AC / Scope / Out Of Scope)`,
    );
  }
}

function checkSkillLiteralTools(files: string[]): void {
  // K4: literal tool commands inside skill content — must use [ISSUE_TRACKER_TOOL] pseudo-code.
  // Tool-owner skills in LITERAL_TOOL_ALLOWED_SKILLS are exempt — they own the HOW.
  //
  // Regex requires a command-shape context for `acli`:
  //   - preceded by line-start, whitespace, `$`, or backtick
  //   - followed by a real acli subcommand (jira / confluence / admin / rovodev /
  //     auth / workitem)
  // This excludes prose references (`/acli`, `(acli is T1)`, "the acli CLI does
  // X", etc.) where the word appears without command shape.
  const re = /(?:^|[\s$`])acli (?:jira|confluence|admin|rovodev|auth|workitem)\b|mcp__atlassian__|curl[^\n]*rest\/api\/3\//;
  const allowed = (file: string) => {
    const slug = skillSlugForFile(file);
    return slug !== null && LITERAL_TOOL_ALLOWED_SKILLS.has(slug);
  };
  const scoped = files.filter(f => !allowed(f));
  const hits = scanLines(scoped, re, line => !isAntiPatternCitation(line));
  for (const h of hits) {
    record(
      'ERROR',
      'SKILL-LITERAL-TOOL',
      relScope(h.file),
      `line ${h.line}: literal tool command — replace with \`[ISSUE_TRACKER_TOOL]\` pseudo-code; HOW belongs in the owning tool skill`,
    );
  }
}

function checkSkillWaveTerminology(files: string[]): void {
  // K7: residual "Wave" terminology — except idiom `hand-wave` and anti-pattern citations.
  // Case-insensitive on the `wave` form; word-boundary on both.
  // Narrow scope retained: scans product-management + master-implementation-plan
  // docs only. See header §15 for rationale.
  const re = /\bwave\b/i;
  const hits = scanLines(files, re, (line) => {
    if (isAntiPatternCitation(line)) { return false; }
    // Exception 1: idiom `hand-wave` / `hand-waves` / `hand-waving`.
    if (/\bhand-wav(?:e|es|ed|ing)\b/i.test(line)) { return false; }
    // Exception 2: anti-pattern citation with quoted "Wave" or `Wave`.
    if (/"Wave"/.test(line)) { return false; }
    if (/`Wave`/.test(line)) { return false; }
    return true;
  });
  for (const h of hits) {
    record(
      'ERROR',
      'SKILL-WAVE-TERMINOLOGY',
      relScope(h.file),
      `line ${h.line}: residual "Wave" — use "Sprint" (or "Master Sprint" / "Execution Sprint" when ambiguity matters)`,
    );
  }
}

function checkSkillRefactor(): void {
  // K1–K4: repo-wide across all skills under `.agents/skills/`.
  const skillFiles = gatherAllSkillMarkdown();
  checkSkillHardcodedCfid(skillFiles);
  checkSkillFrSummaryPrefix(skillFiles);
  checkSkillDescriptionHeaders(skillFiles);
  checkSkillLiteralTools(skillFiles);

  // K7: narrow scope — product-management refs + master-implementation-plan docs.
  const waveFiles = gatherProductManagementMarkdown();
  for (const p of MASTER_PLAN_DOCS) {
    if (existsSync(p)) { waveFiles.push(p); }
  }
  checkSkillWaveTerminology(waveFiles);
}

// -----------------------------------------------------------------------------
// Volatile facts (Checks 16-17, Critical Rule #17)
// -----------------------------------------------------------------------------

/**
 * Every markdown file under `.agents/` plus `AGENTS.md`, minus what the rule exempts or this lint
 * does not own: symlinked and community skills (their tier comes from
 * install.ts), the gitignored `.agents/prompts/`, skill-creator workspaces, the
 * generated `REGISTRY.md`, and the dated records `isVolatileExemptPath` names.
 */
function gatherVolatileTargets(communitySlugs: Set<string>): string[] {
  const out: string[] = [];
  const agentsDir = join(REPO_ROOT, '.agents');
  const visit = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); }
    catch { return; }
    for (const e of entries) {
      const full = join(dir, e);
      if (lstatSync(full).isSymbolicLink()) { continue; }
      if (statSync(full).isDirectory()) {
        if (dir === agentsDir && e === 'prompts') { continue; }
        if (dir === SKILLS_DIR && (communitySlugs.has(e) || e.endsWith('-workspace'))) { continue; }
        visit(full);
      }
      else if (e.endsWith('.md')) {
        if (dir === SKILLS_DIR && SKILL_AGGREGATE_FILES.has(e)) { continue; }
        out.push(full);
      }
    }
  };
  visit(agentsDir);
  const agentsMd = join(REPO_ROOT, 'AGENTS.md');
  if (existsSync(agentsMd)) { out.push(agentsMd); }
  return out.filter(f => !isVolatileExemptPath(relScope(f)));
}

function checkVolatileFacts(files: string[]): void {
  for (const file of files) {
    let text: string;
    try { text = readFileSync(file, 'utf8'); }
    catch { continue; }
    const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
    // An adopted app's own instructions, preserved verbatim in AGENTS.md, are not this doctrine's to judge.
    if (rel === 'AGENTS.md') { text = maskPreservedAppInstructions(text); }
    const seen = new Set<string>();
    for (const hit of scanVolatile(text, { html: false })) {
      const key = `${hit.line}:${hit.kind}`;
      if (seen.has(key)) { continue; }
      seen.add(key);
      record(VOLATILE_SEVERITY[hit.kind], hit.kind, rel, `line ${hit.line}: \`${hit.match}\` — ${volatileRemedy(hit.kind)}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Check 26: T4-LOADER
// -----------------------------------------------------------------------------

const ONBOARD_SKILL_REL = '.agents/skills/agentic-dev-onboard/SKILL.md';
const T4_LOADER_HEADING = '## Community skills installed at user level';
/** `| \`slug\` | source | loader |`: the slug, then the last cell. */
const T4_LOADER_ROW = /^\|\s*`([\w-]+)`\s*\|.*\|([^|]*)\|\s*$/;
const T4_LOADER_USER_ONLY = /user-invoked only/i;
const T4_LOADER_CITATION = /`[^`]+`/;

/** Check 26: every USER_LEVEL_SKILLS slug has a loader row in the onboard table. */
function checkT4Loaders(t4: Set<string>): void {
  if (t4.size === 0) { return; }
  const onboardPath = join(REPO_ROOT, ONBOARD_SKILL_REL);
  if (!existsSync(onboardPath)) {
    record('ERROR', 'T4-LOADER', 'USER_LEVEL_SKILLS', `${ONBOARD_SKILL_REL} is missing, so no user-level skill has a declared loader`);
    return;
  }

  const loaders = new Map<string, string>();
  let inSection = false;
  for (const line of readFileSync(onboardPath, 'utf8').split('\n')) {
    if (line.startsWith('## ')) {
      inSection = line.trim() === T4_LOADER_HEADING;
      continue;
    }
    if (!inSection) { continue; }
    const m = T4_LOADER_ROW.exec(line);
    if (m) { loaders.set(m[1], m[2].trim()); }
  }

  for (const slug of [...t4].sort()) {
    const loader = loaders.get(slug);
    if (loader === undefined) {
      record('ERROR', 'T4-LOADER', slug, `in USER_LEVEL_SKILLS but has no row in ${ONBOARD_SKILL_REL} §"Community skills installed at user level": add one naming its loader, or "user-invoked only"`);
    }
    else if (!T4_LOADER_USER_ONLY.test(loader) && !T4_LOADER_CITATION.test(loader)) {
      record('ERROR', 'T4-LOADER', slug, `the "Loaded by / when" cell in ${ONBOARD_SKILL_REL} neither cites its loader in backticks nor says "user-invoked only"`);
    }
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function tierOf(skillName: string, t1: Set<string>, t2: Set<string>, t3: Set<string>, t4: Set<string>): string | null {
  if (t1.has(skillName)) { return 'T1'; }
  if (t2.has(skillName)) { return 'T2'; }
  if (t3.has(skillName)) { return 'T3'; }
  if (t4.has(skillName)) { return 'T4'; }
  return null;
}

function main() {
  const { t2, t3, t4 } = extractInstallTsSkills();

  // Discover T1 skills (folders in .agents/skills/)
  const t1 = new Set<string>();
  const committedCommunity = new Set<string>();
  const appOwned = new Set<string>();
  const pendingTake = new Set<string>();
  const upstreamOwned = readUpstreamOwned(REPO_ROOT);
  for (const e of readdirSync(SKILLS_DIR)) {
    // Symlinked entries (community skills linked from .agents/skills) are NOT
    // T1 — their tier comes from install.ts. Mirrors the symlink-awareness in
    // build-skill-registry.ts so tier classification stays consistent.
    if (lstatSync(join(SKILLS_DIR, e)).isSymbolicLink()) { continue; }
    const skillFile = join(SKILLS_DIR, e, 'SKILL.md');
    try { if (!statSync(skillFile).isFile()) { continue; } }
    catch { continue; }
    // A community skill committed as a real directory in the store (downstream
    // projects commit their `bunx skills add` output) is still the tier
    // install.ts says. Classifying it T1 made every `(T3)` annotation that
    // cites it a TIER-MISMATCH.
    if (t2.has(e) || t3.has(e) || t4.has(e)) { committedCommunity.add(e); continue; }
    // An adopted app's own skill (`cli/lib/tooling-scope.ts`): written before
    // the adoption, to the app's conventions, never to this doctrine.
    if (!isToolingSkill(e, upstreamOwned)) { appOwned.add(e); continue; }
    // The app's older hand copy of a framework skill, upstream's copy saved
    // for `project-adoption` to apply on approval: linted once it is taken.
    if (upstreamOwned !== null && existsSync(join(REPO_ROOT, ADOPT_UPSTREAM_SKILLS_DIR, e))) { pendingTake.add(e); continue; }
    t1.add(e);
  }

  const vocab = extractCategoryVocab();

  // Check 8: duplicate across tiers
  const seen = new Map<string, string[]>();
  for (const s of t2) { (seen.get(s) ?? seen.set(s, []).get(s)!).push('T2'); }
  for (const s of t3) { (seen.get(s) ?? seen.set(s, []).get(s)!).push('T3'); }
  for (const s of t4) { (seen.get(s) ?? seen.set(s, []).get(s)!).push('T4'); }
  for (const [skill, tiers] of seen) {
    if (tiers.length > 1) {
      record('ERROR', 'DUPLICATE-TIER', `install.ts:${skill}`, `appears in multiple tiers: ${tiers.join(', ')}`);
    }
  }

  // Check 26: T4-LOADER
  checkT4Loaders(t4);

  // Check 5: empty-category — §4.1 row maps a category to zero skills.
  // A category with one or more skills is healthy (single-skill is fine — if
  // the lone skill disappears the installer surfaces it; categories are not
  // forced to be redundant). Categories marked as T1-only (e.g. `issue-tracker`,
  // covered exclusively by the project-owned `acli` skill) are intentionally
  // empty and exempt.
  for (const [cat, entry] of vocab) {
    if (entry.skills.length === 0 && !entry.t1Only) {
      record('ERROR', 'EMPTY-CATEGORY', `§4.1:${cat}`, 'category declared in §4.1 but maps to zero skills (unreachable)');
    }
  }

  // Per-skill checks
  for (const skillName of [...t1].sort()) {
    const skill = loadSkill(skillName);
    if (!skill) {
      record('ERROR', 'UNREADABLE', skillName, 'SKILL.md missing or unreadable');
      continue;
    }

    // Check 4: missing Composable Skills section
    if (skill.complementaryCategories.length > 0 && !skill.hasComposableSection && skillName !== SPRINT_DEV_EXEMPT) {
      record('ERROR', 'MISSING-SECTION', skillName, 'has complementary_categories but no `## Composable Skills` heading');
    }

    // Check 1: orphan category
    for (const cat of skill.complementaryCategories) {
      if (!vocab.has(cat)) {
        record('ERROR', 'ORPHAN-CATEGORY', skillName, `category '${cat}' not in strategy doc §4.1`);
      }
    }

    // Check 2: stale skill mentions
    // Lenient: accept if known in install.ts (any tier) OR mentioned anywhere in §4.1 vocab.
    const vocabSkillSet = new Set<string>();
    for (const entry of vocab.values()) { for (const s of entry.skills) { vocabSkillSet.add(s); } }
    for (const mentioned of skill.expectedMatchesSkills) {
      const tier = tierOf(mentioned, t1, t2, t3, t4);
      if (!tier && !vocabSkillSet.has(mentioned)) {
        record('WARN', 'STALE-MENTION', skillName, `Expected matches cites '${mentioned}' which is not in any tier (T1/T2/T3/T4) nor in §4.1 vocab`);
      }
    }

    // Check 3: tier mismatch
    for (const [skillName2, annotatedTier] of skill.expectedMatchesTierAnnotations) {
      const actualTier = tierOf(skillName2, t1, t2, t3, t4);
      if (actualTier && actualTier !== annotatedTier) {
        record('ERROR', 'TIER-MISMATCH', skillName, `'${skillName2}' annotated as ${annotatedTier} but install.ts says ${actualTier}`);
      }
    }

    // Inline-code STALE-PATH: path-like literals in backtick spans of SKILL.md
    // body must resolve relative to the skill dir or repo root.
    checkInlineStalePaths(skillName, join(SKILLS_DIR, skillName), skill.body, REPO_ROOT);

    // Session-management checks (per-skill).
    checkSessionBanner(skill);
    checkSessionPhase0(skill);

    // Checks 18-25: purpose axis, capabilities, stage owners, context write scope.
    checkKind(skill);
    checkCapabilities(skill);
    checkStageOwnerDispatch(skill);
    checkContextWrites(skill, join(SKILLS_DIR, skillName));
    checkContextSkillCites(skill);
  }

  // Check 6: stale path scan
  scanForStalePath();

  // Session-management checks (global).
  checkSessionScopes();

  // Skill-wide refactor checks (K1–K4 repo-wide; K7 narrow scope).
  checkSkillRefactor();

  // Checks 16-17: volatile facts (Critical Rule #17) over .agents/**/*.md + AGENTS.md.
  checkVolatileFacts(gatherVolatileTargets(new Set([...t2, ...t3, ...t4, ...appOwned, ...pendingTake])));

  // Report
  const counts = { ERROR: 0, WARN: 0, INFO: 0 };
  for (const f of findings) { counts[f.severity]++; }

  // Group by severity, then scope
  const byScope = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byScope.get(f.scope) ?? [];
    arr.push(f);
    byScope.set(f.scope, arr);
  }

  const t1Sorted = [...t1].sort();
  console.log('\nlint-skills — skill composition system audit');
  const communityNote = committedCommunity.size > 0
    ? ` (+ ${committedCommunity.size} community skills committed in the store, tiers from cli/install.ts)`
    : '';
  const appNote = (appOwned.size > 0
    ? ` (+ ${appOwned.size} skills of the adopted app, outside the framework's doctrine: not linted here)`
    : '')
  + (pendingTake.size > 0
    ? ` (+ ${pendingTake.size} framework skills still on the app's hand copy, take-upstream pending in ${ADOPT_UPSTREAM_SKILLS_DIR}/ (project-adoption Phase 3): ${[...pendingTake].sort().join(', ')})`
    : '');
  console.log(`Scanning ${SKILLS_DIR.replace(`${REPO_ROOT}/`, '')} ... ${t1.size} T1 skills${communityNote}${appNote}`);
  console.log(`Reading ${STRATEGY_DOC.replace(`${REPO_ROOT}/`, '')} §4.1 ... ${vocab.size} categories`);
  console.log(`Reading cli/install.ts ... ${t2.size} T2, ${t3.size} T3, ${t4.size} T4\n`);

  for (const skill of t1Sorted) {
    const skillFindings = findings.filter(f => f.scope === skill);
    const errs = skillFindings.filter(f => f.severity === 'ERROR').length;
    const warns = skillFindings.filter(f => f.severity === 'WARN').length;
    const infos = skillFindings.filter(f => f.severity === 'INFO').length;
    const icon = errs > 0 ? '❌' : warns > 0 ? '⚠️ ' : infos > 0 ? 'ℹ️ ' : '✅';
    const tag = errs > 0 ? `${errs} ERROR` : warns > 0 ? `${warns} WARN` : infos > 0 ? `${infos} INFO` : 'OK';
    console.log(`${icon}  ${skill.padEnd(25)} — ${tag}`);
    for (const f of skillFindings) {
      console.log(`     [${f.severity}/${f.code}] ${f.message}`);
    }
  }

  // Non-skill-scoped findings
  const nonSkillScopes = [...new Set(findings.map(f => f.scope))].filter(s => !t1.has(s));
  if (nonSkillScopes.length > 0) {
    console.log('\nGlobal findings:');
    for (const scope of nonSkillScopes.sort()) {
      for (const f of findings.filter(x => x.scope === scope)) {
        const icon = f.severity === 'ERROR' ? '❌' : f.severity === 'WARN' ? '⚠️ ' : 'ℹ️ ';
        console.log(`${icon}  [${f.severity}/${f.code}] ${scope} — ${f.message}`);
      }
    }
  }

  console.log(`\nSummary: ${counts.ERROR} errors, ${counts.WARN} warnings, ${counts.INFO} info`);
  process.exit(counts.ERROR > 0 ? 1 : 0);
}

main();
