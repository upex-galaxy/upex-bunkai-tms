#!/usr/bin/env bun
/**
 * lint-instructions.ts — structural gate for the progressive disclosure of the
 * project instructions: the always-on `AGENTS.md` (L0) and the on-demand
 * section files under `.agents/instructions/` (L1). Parsers live in
 * `scripts/lib/instructions.ts`.
 *
 * Checks (errors, except the `budget` target, which warns):
 *
 *   - `budget`: L0 bytes, measured without an adopted app's preserved block
 *     (`## 0. Project instructions (pre-adoption)`), warn over `L0_TARGET`
 *     and fail over `L0_BUDGET`; the whole file, that block included, fails
 *     over `L0_PROJECT_BUDGET` and, whatever the budgets say, at Codex's
 *     `project_doc_max_bytes` default. Codex cuts its project instructions
 *     there without a visible notice, so that cap is a correctness limit, not
 *     a style preference.
 *   - `router`: the table between `<!-- router:start -->` and
 *     `<!-- router:end -->` exists, every row has a kind and at least one load
 *     target, every target resolves (a backticked repo path or a bare
 *     `@path` import), and every section file is the target of some row.
 *     The "Project context skills" table of `agent-project.md` (between
 *     `<!-- project-skills:start -->` and `<!-- project-skills:end -->`, the
 *     home of a project-created skill's row, which `bun sync` never
 *     overwrites) is checked the same way: each row names a skill whose
 *     `.agents/skills/<slug>/SKILL.md` exists, says when to load it, and
 *     carries at least one trigger that compiles. An `agent-project.md`
 *     without the markers has no project rows and passes.
 *   - `frontmatter`: every file but `README.md` is named `agent-<id>.md` and
 *     opens with `id` (its file stem without `agent-`), `title`, `load_when`,
 *     `triggers` (a non-empty list of strings that compile as
 *     case-insensitive regexes) and `paths` (a list of repo-relative
 *     prefixes); `agent-project.md` (`id: project`) is the only file whose
 *     `triggers` may be empty (`triggers: []`); `README.md` carries none. No
 *     other file lives in the folder, and file names carry no order: the
 *     router rows do.
 *   - `rules`: every L0 Critical Rule (`N. **NAME**: text … Full: …`) has a
 *     `## N. NAME` heading in `agent-critical-rules.md`, every rule there has its
 *     L0 line, and each L0 excerpt (`…` joins excerpts) appears verbatim in
 *     the full text. The binding sentence never exists only in a section.
 *   - `binding`: a line of a section that says `NEVER` or `MUST` names what
 *     carries it into context when the section is not loaded: a Critical Rule
 *     (`Rule #N` with N in L0), a skill whose `## Compact Rules` reach every
 *     executor (`` `slug` `` or `/slug`), a bold contract label L0 also
 *     carries, or an explicit `<!-- binds-in-section: <reason> -->` that
 *     declares the rule binding only on the work that routes to the section.
 *     `agent-critical-rules.md` and `agent-project.md` are exempt (the first
 *     holds the full text of rules L0 carries, the second is project-owned).
 *   - `import`: a bare `@path` outside code in L0 is a Claude Code import
 *     (loaded in full at launch); only `ALLOWED_IMPORTS` may appear, and each
 *     must exist.
 *
 * Three locks keep the split from eroding (ADR-0014). Each one binds the
 * maintainers' copy as an error; in a project it is a warning, and only once
 * the file it reads is there (the README and the eval set are synced, the ADR
 * folder is the project's own, and so is `AGENTS.md`):
 *
 *   - `lock`: the ROUTER rows are frozen. `<!-- router:lock <fingerprint>
 *     <ADR-NNNN> -->` in `AGENTS.md` records the fingerprint of the table and
 *     the ADR that decided it; a table that no longer matches fails, and so
 *     does an ADR that does not exist or does not cite that fingerprint. The
 *     escape hatch is the decision itself: write (or amend) the ADR, then
 *     `bun run instructions:check --accept-router ADR-NNNN` rewrites the lock
 *     and names the fingerprint the ADR must cite.
 *   - `eval`: the labelled-prompt eval of the router (`scripts/lib/router-eval.ts`)
 *     runs on every call, whole set in milliseconds, and must hold the recall
 *     and precision targets, so a `triggers:` or `paths:` edit that loses a
 *     route or floods them fails here, before any test run.
 *   - `complete`: every section but `agent-project.md` ships whole: frontmatter
 *     and a router row (checked above), at least `MIN_EVAL_PROMPTS` labelled
 *     prompts that expect its id, and a row in the README `## Sections` table.
 *
 * A project whose `AGENTS.md` has no ROUTER yet still runs its pre-split
 * monolith (the sync delivers the sections; moving AGENTS.md is the project's
 * own merge, named in the parity report of `bun sync`): the gate prints a
 * note and passes, because being behind upstream is not a broken repo; so does
 * an adopted app with no `AGENTS.md` while its saved merge waits for approval.
 * The maintainers' copy never gets that pass.
 *
 * Usage: bun scripts/lint-instructions.ts   (exit 1 on any error)
 *        bun scripts/lint-instructions.ts --accept-router ADR-NNNN   (re-lock the ROUTER on a decided change)
 */

import type { RouterEvalFixture, RouterEvalResult } from './lib/router-eval';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADOPT_INSTRUCTIONS_PENDING_FILE, adoptInstructionsPending } from '../cli/lib/agent-compatibility';
import { isMaintainerCopy } from '../cli/lib/agents-schema';
import {
  ADR_DIR,
  coreBytes,
  findAdr,
  L0_FILE,
  parseFrontmatter,
  parseFullRules,
  parseL0Rules,
  parseProjectSkills,
  parseRouter,
  PROJECT_FILE,
  README_FILE,
  readmeSectionRows,
  ROUTER_EVAL_FIXTURE,
  routerFingerprint,
  routerLock,
  RULES_FILE,
  SECTION_FILE,
  SECTIONS_DIR,
  SKILL_SLUG,
  withoutCode,
  withRouterLock,
} from './lib/instructions';
import { evaluateRouter, MIN_EVAL_PROMPTS, promptsPerLabel, readRouterEvalFixture } from './lib/router-eval';

/** Target for L0 without project additions: over it is a warning, so the number stays visible. */
export const L0_TARGET = 16 * 1024;
/** Ceiling for L0 without project additions. */
export const L0_BUDGET = 24 * 1024;
/** Ceiling for L0 with a project's additions (an adopted app's preserved block). */
export const L0_PROJECT_BUDGET = 28 * 1024;
/** Codex `project_doc_max_bytes` default: past it the file is cut at the byte. */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024;
/** Bare `@path` imports L0 may carry: Claude Code loads them at launch, the other hosts follow the router row. */
export const ALLOWED_IMPORTS = ['package.json', '.agents/project.yaml'] as const;

export type InstructionFindingKind = 'budget' | 'router' | 'frontmatter' | 'rules' | 'binding' | 'import' | 'lock' | 'eval' | 'complete';

export interface InstructionFinding {
  kind: InstructionFindingKind
  severity: 'error' | 'warning'
  file: string
  line: number
  message: string
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

function finding(kind: InstructionFindingKind, file: string, line: number, message: string): InstructionFinding {
  return { kind, severity: 'error', file, line, message };
}

/** Skills whose `SKILL.md` has a `## Compact Rules` section (their rules reach every executor through `REGISTRY.md`). */
function compactRuleSkills(root: string): Set<string> {
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) { return new Set(); }
  return new Set(readdirSync(dir).filter((slug) => {
    const file = join(dir, slug, 'SKILL.md');
    return existsSync(file) && /^## Compact Rules\b/m.test(readFileSync(file, 'utf8'));
  }));
}

/** `budget` findings for one L0 text. */
export function lintBudget(l0: string): InstructionFinding[] {
  const findings: InstructionFinding[] = [];
  const core = coreBytes(l0);
  const total = Buffer.byteLength(l0);
  if (core > L0_BUDGET) {
    findings.push(finding('budget', L0_FILE, 1, `L0 is ${core} bytes, over the ${L0_BUDGET}-byte ceiling: move detail into a section`));
  }
  else if (core > L0_TARGET) {
    findings.push({ ...finding('budget', L0_FILE, 1, `L0 is ${core} bytes, over the ${L0_TARGET}-byte target`), severity: 'warning' });
  }
  if (total > CODEX_PROJECT_DOC_MAX_BYTES) {
    findings.push(finding('budget', L0_FILE, 1, `L0 is ${total} bytes: Codex cuts project instructions at ${CODEX_PROJECT_DOC_MAX_BYTES}`));
  }
  else if (total > L0_PROJECT_BUDGET) {
    findings.push(finding('budget', L0_FILE, 1, `L0 with project additions is ${total} bytes, over ${L0_PROJECT_BUDGET}: move project text into ${SECTIONS_DIR}/${PROJECT_FILE} or a context skill`));
  }
  return findings;
}

/** `import` findings: bare `@path` tokens outside code in L0. */
export function lintImports(root: string, l0: string): InstructionFinding[] {
  const findings: InstructionFinding[] = [];
  withoutCode(l0).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?<![\w.])@([\w./-]+)/g)) {
      const target = m[1].replace(/\.$/, '');
      if (!(ALLOWED_IMPORTS as readonly string[]).includes(target)) {
        findings.push(finding('import', L0_FILE, i + 1, `bare \`@${target}\` is a Claude Code import; only ${ALLOWED_IMPORTS.map(a => `@${a}`).join(', ')} may appear (wrap other mentions in backticks)`));
      }
      else if (!existsSync(join(root, target))) {
        findings.push(finding('import', L0_FILE, i + 1, `import target missing: ${target}`));
      }
    }
  });
  return findings;
}

/** `frontmatter` findings for one file of the sections folder. */
export function lintFrontmatter(rel: string, name: string, text: string): InstructionFinding[] {
  const bad = (message: string): InstructionFinding[] => [finding('frontmatter', rel, 1, message)];
  const meta = parseFrontmatter(text);
  if (name === README_FILE) { return meta ? bad('README.md carries no frontmatter') : []; }
  if (!meta) { return bad('missing YAML frontmatter'); }
  for (const key of ['id', 'title', 'load_when']) {
    if (typeof meta[key] !== 'string' || !meta[key].trim()) { return bad(`\`${key}\` must be a non-empty string`); }
  }
  const isProject = name === PROJECT_FILE;
  const section = SECTION_FILE.exec(name);
  if (!section) { return bad('file name must be `agent-<id>.md` (every file but README.md carries the `agent-` prefix)'); }
  if (meta.id !== section[1]) { return bad(`\`id\` must be \`${section[1]}\` (the file stem without \`agent-\`)`); }
  const triggers = meta.triggers;
  if (!Array.isArray(triggers) || triggers.some(t => typeof t !== 'string')) { return bad('`triggers` must be a list of strings'); }
  if (triggers.length === 0 && !isProject) { return bad('`triggers` is empty: the hook can never route here (only agent-project.md may leave it empty)'); }
  for (const trigger of triggers as string[]) {
    try { void new RegExp(trigger, 'i'); }
    catch { return bad(`trigger does not compile: ${trigger}`); }
  }
  if (!Array.isArray(meta.paths) || meta.paths.some(p => typeof p !== 'string')) { return bad('`paths` must be a list of strings'); }
  return [];
}

/** `router` findings: markers, rows, resolvable targets, every section routed. */
export function lintRouter(root: string, l0: string, sections: string[]): InstructionFinding[] {
  const rows = parseRouter(l0);
  if (rows === null) { return [finding('router', L0_FILE, 1, 'router markers `<!-- router:start -->` / `<!-- router:end -->` missing')]; }
  const findings: InstructionFinding[] = [];
  if (rows.length === 0) { findings.push(finding('router', L0_FILE, 1, 'router table has no rows')); }
  const routed = new Set<string>();
  for (const row of rows) {
    if (!row.kind) { findings.push(finding('router', L0_FILE, row.line, 'row without a kind')); }
    if (row.targets.length === 0) { findings.push(finding('router', L0_FILE, row.line, 'row without a load target')); }
    for (const target of row.targets) {
      if (!existsSync(join(root, target))) { findings.push(finding('router', L0_FILE, row.line, `load target does not resolve: ${target}`)); }
      routed.add(target);
    }
  }
  for (const section of sections) {
    if (!routed.has(`${SECTIONS_DIR}/${section}`)) {
      findings.push(finding('router', `${SECTIONS_DIR}/${section}`, 1, 'section is not the load target of any router row'));
    }
  }
  return findings;
}

/** `router` findings for the project's own skill rows in `agent-project.md`. */
export function lintProjectSkills(root: string, projectText: string): InstructionFinding[] {
  const rel = `${SECTIONS_DIR}/${PROJECT_FILE}`;
  const findings: InstructionFinding[] = [];
  for (const row of parseProjectSkills(projectText) ?? []) {
    const bad = (message: string): void => { findings.push(finding('router', rel, row.line, message)); };
    if (!SKILL_SLUG.test(row.slug)) {
      bad(`project skill row: \`${row.slug}\` is not a skill slug (write it backticked, e.g. \`billing-context\`)`);
      continue;
    }
    if (!existsSync(join(root, '.agents', 'skills', row.slug, 'SKILL.md'))) { bad(`project skill row: .agents/skills/${row.slug}/SKILL.md does not exist`); }
    if (!row.loadWhen) { bad(`project skill row \`${row.slug}\` has no Load when`); }
    if (row.triggers.length === 0) { bad(`project skill row \`${row.slug}\` has no trigger: the hook can never route to it`); }
    for (const trigger of row.triggers) {
      try { void new RegExp(trigger, 'i'); }
      catch { bad(`project skill row \`${row.slug}\`: trigger does not compile: ${trigger}`); }
    }
  }
  return findings;
}

/** `rules` findings: L0 binding lines against the full-text rules file. */
export function lintRules(l0: string, rulesText: string | null): InstructionFinding[] {
  const l0Rules = parseL0Rules(l0);
  const rulesRel = `${SECTIONS_DIR}/${RULES_FILE}`;
  if (l0Rules.length === 0) { return [finding('rules', L0_FILE, 1, 'no Critical Rules found under `## 1. CRITICAL RULES`')]; }
  if (rulesText === null) { return [finding('rules', rulesRel, 1, 'full-text rules file missing')]; }
  const findings: InstructionFinding[] = [];
  const full = parseFullRules(rulesText);
  for (const rule of l0Rules) {
    const target = full.get(rule.n);
    if (!target) {
      findings.push(finding('rules', L0_FILE, rule.line, `rule ${rule.n} has no \`## ${rule.n}. ${rule.name}\` in ${RULES_FILE}`));
      continue;
    }
    if (target.name !== rule.name) {
      findings.push(finding('rules', L0_FILE, rule.line, `rule ${rule.n} is \`${rule.name}\` in L0 but \`${target.name}\` in ${RULES_FILE}`));
    }
    if (rule.excerpts.length === 0) {
      findings.push(finding('rules', L0_FILE, rule.line, `rule ${rule.n} has no binding text in L0`));
    }
    for (const excerpt of rule.excerpts) {
      if (!squash(target.body).includes(squash(excerpt))) {
        findings.push(finding('rules', L0_FILE, rule.line, `rule ${rule.n} excerpt is not verbatim in ${RULES_FILE}: "${excerpt.slice(0, 60)}…"`));
      }
    }
  }
  const inL0 = new Set(l0Rules.map(r => r.n));
  for (const n of full.keys()) {
    if (!inL0.has(n)) { findings.push(finding('rules', rulesRel, 1, `rule ${n} has no binding line in L0`)); }
  }
  return findings;
}

/** `binding` findings for one section file. */
export function lintBinding(
  rel: string,
  text: string,
  ctx: { ruleNumbers: Set<number>, skills: Set<string>, l0: string },
): InstructionFinding[] {
  const findings: InstructionFinding[] = [];
  const raw = text.split('\n');
  withoutCode(text).split('\n').forEach((line, i) => {
    if (!/\bNEVER\b|\bMUST\b/.test(line)) { return; }
    const full = raw[i];
    if (/<!--\s*binds-in-section:\s*\S/.test(full)) { return; }
    if ([...full.matchAll(/\bRule #?(\d+)\b/g)].some(m => ctx.ruleNumbers.has(Number(m[1])))) { return; }
    const slugs = [...full.matchAll(/`\/?([a-z][a-z0-9-]+)`|(?<![\w/.])\/([a-z][a-z0-9-]+)\b/g)].map(m => m[1] ?? m[2]);
    if (slugs.some(s => ctx.skills.has(s))) { return; }
    const label = /^\s*(?:[-*]\s+|>\s*)?\*\*([^*]+)\*\*/.exec(full);
    if (label && ctx.l0.includes(`**${label[1]}**`)) { return; }
    findings.push(finding('binding', rel, i + 1, 'NEVER/MUST with no carrier: cite `Rule #N`, a skill with Compact Rules, a contract L0 carries, or mark `<!-- binds-in-section: <reason> -->`'));
  });
  return findings;
}

/**
 * A project (never the maintainers' copy) whose `AGENTS.md` has no ROUTER: it
 * received the sections but has not moved to the L0 layout yet. An adopted
 * app whose `AGENTS.md` still waits for its approved merge
 * (`adoptInstructionsPending`) is pending the same way.
 */
export function isPendingMigration(root: string): boolean {
  const l0Path = join(root, L0_FILE);
  if (!existsSync(l0Path)) { return adoptInstructionsPending(root); }
  if (parseRouter(readFileSync(l0Path, 'utf8')) !== null) { return false; }
  const yamlPath = join(root, '.agents', 'project.yaml');
  return !(existsSync(yamlPath) && isMaintainerCopy(readFileSync(yamlPath, 'utf8')));
}

/** The maintainers' copy: its `.agents/project.yaml` carries the `MAINTAINER COPY:` line. */
function isMaintainer(root: string): boolean {
  const yamlPath = join(root, '.agents', 'project.yaml');
  return existsSync(yamlPath) && isMaintainerCopy(readFileSync(yamlPath, 'utf8'));
}

const ACCEPT_HINT = '`bun run instructions:check --accept-router ADR-NNNN`';

// LINT.IfChange(instruction-locks)
/** `lock` findings: the ROUTER table matches its lock, and the lock's ADR exists and cites the fingerprint. */
export function lintLock(root: string, l0: string, maintainer: boolean): InstructionFinding[] {
  const fingerprint = routerFingerprint(l0);
  if (fingerprint === null) { return []; }
  const lock = routerLock(l0);
  const severity: InstructionFinding['severity'] = maintainer ? 'error' : 'warning';
  if (lock === null) {
    // A project that has never locked its router opted out; the maintainers' copy cannot.
    return maintainer ? [finding('lock', L0_FILE, 1, `the ROUTER has no lock line: record the ADR that decided the table, then ${ACCEPT_HINT}`)] : [];
  }
  const out: InstructionFinding[] = [];
  if (lock.fingerprint !== fingerprint) {
    out.push({ ...finding('lock', L0_FILE, lock.line, `ROUTER rows changed (table ${fingerprint}, lock ${lock.fingerprint}). Rows are fixed request kinds: grow a section and its \`triggers:\` instead. A new request kind is an architectural decision: write the ADR, then ${ACCEPT_HINT}`), severity });
  }
  if (!maintainer) { return out; }
  const adr = findAdr(root, lock.adr);
  if (adr === null) {
    out.push(finding('lock', L0_FILE, lock.line, `the lock names ${lock.adr}, which is not in ${ADR_DIR}/`));
  }
  else if (!readFileSync(join(root, adr), 'utf8').includes(lock.fingerprint)) {
    out.push(finding('lock', adr, 1, `${lock.adr} does not cite the router fingerprint \`${lock.fingerprint}\` the lock records: add it (References, or an Amendments line)`));
  }
  return out;
}

/** EVAL: recall, binding recall and precision hold their targets; every label names a routed id. */
export function lintEval(result: RouterEvalResult, severity: InstructionFinding['severity']): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const at = (message: string): InstructionFinding => ({ ...finding('eval', ROUTER_EVAL_FIXTURE, 1, message), severity });
  if (result.recall < result.targets.recall) {
    out.push(at(`router recall ${pct(result.recall)} < ${pct(result.targets.recall)}: fix the section's \`triggers:\`, never the label. ${result.misses.slice(0, 5).join('; ')}`));
  }
  else if (result.bindingRecall < result.targets.bindingRecall) {
    // Binding recall never exceeds recall: reported only when recall itself holds.
    out.push(at(`router binding recall ${pct(result.bindingRecall)} < ${pct(result.targets.bindingRecall)}: the ranking pushes expected sections past the cap onto the optional line; a weak anchor needs a sharper trigger. ${result.demoted.slice(0, 5).join('; ')}`));
  }
  if (result.precision < result.targets.precision) {
    out.push(at(`router precision ${pct(result.precision)} < ${pct(result.targets.precision)}: a trigger fires on prompts that do not need its section; narrow it`));
  }
  if (result.unknownLabels.length > 0) {
    out.push(at(`labels no routed section or import carries: ${result.unknownLabels.join(', ')}`));
  }
  return out;
}

/** `complete` findings: every section but the project overlay has enough labelled prompts and a README row; no README row is stale. */
export function lintComplete(root: string, sections: string[], fixture: RouterEvalFixture | null, maintainer: boolean): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  const severity: InstructionFinding['severity'] = maintainer ? 'error' : 'warning';
  const at = (file: string, line: number, message: string): InstructionFinding => ({ ...finding('complete', file, line, message), severity });
  const readmeRel = `${SECTIONS_DIR}/${README_FILE}`;
  const readmePath = join(root, readmeRel);
  const readmeRows = existsSync(readmePath) ? readmeSectionRows(readFileSync(readmePath, 'utf8')) : null;
  if (readmeRows === null && maintainer) { out.push(at(readmeRel, 1, 'no `## Sections` table: every section file needs a row there')); }
  const perLabel = fixture ? promptsPerLabel(fixture) : null;
  for (const name of sections) {
    if (name === PROJECT_FILE) { continue; }
    const rel = `${SECTIONS_DIR}/${name}`;
    const meta = parseFrontmatter(readFileSync(join(root, rel), 'utf8'));
    const id = typeof meta?.id === 'string' ? meta.id : (SECTION_FILE.exec(name)?.[1] ?? name);
    const count = perLabel?.get(id) ?? 0;
    if (perLabel && count < MIN_EVAL_PROMPTS) {
      out.push(at(rel, 1, `${count} labelled prompt(s) expect \`${id}\` in ${ROUTER_EVAL_FIXTURE}; a section ships with at least ${MIN_EVAL_PROMPTS}`));
    }
    if (readmeRows && !readmeRows.some(r => r.name === name)) { out.push(at(rel, 1, `no row in the \`## Sections\` table of ${readmeRel}`)); }
  }
  const names = new Set(sections);
  for (const row of readmeRows ?? []) {
    if (!names.has(row.name)) { out.push(at(readmeRel, row.line, `\`${row.name}\` is not a section in ${SECTIONS_DIR}/`)); }
  }
  return out;
}

/** The router eval of `root`, when both its fixture and its router are there. Throws on a malformed fixture. */
export function routerEval(root: string): RouterEvalResult | null {
  const fixture = readRouterEvalFixture(root);
  return fixture ? evaluateRouter(root, fixture) : null;
}

/** `lock`, `eval` and `complete` findings (ADR-0014). */
export function lintLocks(root: string, l0: string, sections: string[]): InstructionFinding[] {
  const maintainer = isMaintainer(root);
  const severity: InstructionFinding['severity'] = maintainer ? 'error' : 'warning';
  const findings = parseRouter(l0) === null ? [] : lintLock(root, l0, maintainer);
  let fixture: RouterEvalFixture | null = null;
  try { fixture = readRouterEvalFixture(root); }
  catch (error) { findings.push({ ...finding('eval', ROUTER_EVAL_FIXTURE, 1, (error as Error).message), severity }); }
  if (fixture === null) {
    if (maintainer && !findings.some(f => f.kind === 'eval')) { findings.push(finding('eval', ROUTER_EVAL_FIXTURE, 1, 'missing: the router eval has no labelled prompts to run')); }
  }
  else {
    const result = evaluateRouter(root, fixture);
    if (result) { findings.push(...lintEval(result, severity)); }
  }
  findings.push(...lintComplete(root, sections, fixture, maintainer));
  return findings;
}
// LINT.ThenChange(README.md, INSTALLER.md, .agents/instructions/README.md, .agents/skills/agentic-dev-core/references/instructions-doctrine.md, packages/decks/progressive-disclosure/how-it-works.es.html)

/**
 * `--accept-router ADR-NNNN`: re-lock the ROUTER on a decided change. Refuses
 * an ADR that is not on disk; writes the lock and returns the fingerprint the
 * ADR must cite (the lint keeps failing until it does).
 */
export function acceptRouter(root: string, adrId: string): { ok: boolean, message: string } {
  if (!/^ADR-\d{4}$/.test(adrId)) { return { ok: false, message: `expected an ADR id like ADR-0014, got ${JSON.stringify(adrId)}` }; }
  const l0Path = join(root, L0_FILE);
  const l0 = existsSync(l0Path) ? readFileSync(l0Path, 'utf8') : '';
  const fingerprint = routerFingerprint(l0);
  if (fingerprint === null) { return { ok: false, message: `${L0_FILE} has no ROUTER markers to lock` }; }
  const adr = findAdr(root, adrId);
  if (adr === null) { return { ok: false, message: `${adrId} is not in ${ADR_DIR}/: write the ADR that decides the new table first` }; }
  writeFileSync(l0Path, withRouterLock(l0, fingerprint, adrId));
  if (!readFileSync(join(root, adr), 'utf8').includes(fingerprint)) {
    return { ok: false, message: `ROUTER locked at ${fingerprint} by ${adrId}; now cite it in ${adr}: add \`router fingerprint ${fingerprint}\` (References, or an Amendments line)` };
  }
  return { ok: true, message: `ROUTER locked at ${fingerprint} by ${adrId}` };
}

export function lintInstructions(root: string): InstructionFinding[] {
  const l0Path = join(root, L0_FILE);
  if (isPendingMigration(root)) { return []; }
  if (!existsSync(l0Path)) { return [finding('router', L0_FILE, 1, 'AGENTS.md missing')]; }
  const l0 = readFileSync(l0Path, 'utf8');
  const dir = join(root, SECTIONS_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).sort() : [];
  const sections = files.filter(f => f !== README_FILE);
  const rulesPath = join(dir, RULES_FILE);
  const projectPath = join(dir, PROJECT_FILE);

  const findings = [
    ...lintBudget(l0),
    ...lintImports(root, l0),
    ...lintRouter(root, l0, sections),
    ...(existsSync(projectPath) ? lintProjectSkills(root, readFileSync(projectPath, 'utf8')) : []),
    ...files.flatMap(name => lintFrontmatter(`${SECTIONS_DIR}/${name}`, name, readFileSync(join(dir, name), 'utf8'))),
    ...lintRules(l0, existsSync(rulesPath) ? readFileSync(rulesPath, 'utf8') : null),
  ];
  const ctx = { ruleNumbers: new Set(parseL0Rules(l0).map(r => r.n)), skills: compactRuleSkills(root), l0 };
  for (const name of sections) {
    if (name === RULES_FILE || name === PROJECT_FILE) { continue; }
    findings.push(...lintBinding(`${SECTIONS_DIR}/${name}`, readFileSync(join(dir, name), 'utf8'), ctx));
  }
  findings.push(...lintLocks(root, l0, sections));
  return findings;
}

if (import.meta.main) {
  const root = process.cwd();
  const acceptAt = process.argv.indexOf('--accept-router');
  if (acceptAt >= 0) {
    const accepted = acceptRouter(root, process.argv[acceptAt + 1] ?? '');
    (accepted.ok ? console.log : console.error)(`${accepted.ok ? '✓' : '✗'} ${accepted.message}`);
    if (!accepted.ok) { process.exit(1); }
  }
  if (isPendingMigration(root)) {
    console.log(existsSync(join(root, L0_FILE))
      ? `- instructions:check skipped: ${L0_FILE} has no ROUTER yet (pre-split monolith); move it to the L0 + ${SECTIONS_DIR}/ layout, see the parity report of \`bun sync\``
      : `- instructions:check skipped: ${L0_FILE} waits for the adoption merge saved in ${ADOPT_INSTRUCTIONS_PENDING_FILE} (\`project-adoption\` Phase 6)`);
    process.exit(0);
  }
  const findings = lintInstructions(root);
  const l0Path = join(root, L0_FILE);
  const bytes = existsSync(l0Path) ? coreBytes(readFileSync(l0Path, 'utf8')) : 0;
  const errors = findings.filter(f => f.severity === 'error');
  for (const f of findings.filter(f => f.severity === 'warning')) {
    console.warn(`  ! ${f.file}:${f.line}  ${f.kind}  ${f.message}`);
  }
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  let evalResult: RouterEvalResult | null = null;
  try { evalResult = routerEval(root); }
  catch { /* a malformed fixture is already an `eval` finding */ }
  const lock = existsSync(l0Path) ? routerLock(readFileSync(l0Path, 'utf8')) : null;
  const evalNote = evalResult ? `; router eval recall ${pct(evalResult.recall)} binding ${pct(evalResult.bindingRecall)} precision ${pct(evalResult.precision)} over ${evalResult.prompts} prompts` : '';
  const lockNote = lock ? `; router lock ${lock.fingerprint} (${lock.adr})` : '';
  if (errors.length === 0) {
    console.log(`✓ instructions:check passed (L0 ${bytes} bytes; target ${L0_TARGET}, ceiling ${L0_BUDGET}${evalNote}${lockNote})`);
    process.exit(0);
  }
  console.error(`✗ instructions:check found ${errors.length} problem(s):\n`);
  for (const f of errors) {
    console.error(`  ${f.file}:${f.line}  ${f.kind}  ${f.message}`);
  }
  process.exit(1);
}
