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
 *   4. MISSING-SECTION (ERROR) — Skill declares `complementary_categories` but has
 *                                no `## Composable Skills` heading (sprint-development
 *                                is exempt — uses `## SDD Composition`).
 *   5. EMPTY-CATEGORY  (ERROR) — §4.1 row declares a category but maps it to zero
 *                                skills (the category is unreachable).
 *   6. STALE-PATH      (ERROR) — Any file references the old `.context/skill-composition-strategy.md`
 *                                path instead of the canonical
 *                                `.claude/skills/agentic-dev-core/references/skill-composition-strategy.md`.
 *   7. DUPLICATE-TIER  (ERROR) — Same skill name appears in both SKILL_SLUGS (T2)
 *                                and PROJECT_LEVEL_SKILLS (T3) — install.ts conflict.
 *
 * Note: `complementary_categories` frontmatter is OPTIONAL on every T1 skill.
 * Skills that do not need to borrow community capability (e.g. pure CLI wrappers
 * like git-flow-master, acli) simply omit the field — no warning, no info.
 *
 * Exit codes:
 *   0 — no errors (warnings/info OK)
 *   1 — at least one ERROR found
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const SKILLS_DIR = join(REPO_ROOT, '.claude/skills');
const STRATEGY_DOC = join(SKILLS_DIR, 'agentic-dev-core/references/skill-composition-strategy.md');
const INSTALL_TS = join(REPO_ROOT, 'cli/install.ts');
const STALE_PATH_LITERAL = '.context/skill-composition-strategy.md';
const SCAN_FOR_STALE_PATH = ['CLAUDE.md', '.claude/skills', '.context'];
const SPRINT_DEV_EXEMPT = 'sprint-development'; // uses "## SDD Composition" instead

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
  complementaryCategories: string[]
  hasComposableSection: boolean
  expectedMatchesSkills: string[] // skills mentioned in the "Expected matches" table
  expectedMatchesTierAnnotations: Map<string, string> // skill → annotated tier (e.g. "T2", "T3", "T4 ASK")
}

interface Frontmatter {
  complementary_categories?: string[]
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
  return {
    name,
    path,
    body,
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
    record('ERROR', 'STALE-PATH', f.replace(`${REPO_ROOT}/`, ''), `line ${line}: stale ref to '.context/skill-composition-strategy.md' (canonical: '.claude/skills/agentic-dev-core/references/skill-composition-strategy.md')`);
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
  // Discover T1 skills (folders in .claude/skills/)
  const t1 = new Set<string>();
  for (const e of readdirSync(SKILLS_DIR)) {
    const skillFile = join(SKILLS_DIR, e, 'SKILL.md');
    try { if (statSync(skillFile).isFile()) { t1.add(e); } }
    catch { /* skip */ }
  }

  const { t2, t3, t4 } = extractInstallTsSkills();
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
  }

  // Check 6: stale path scan
  scanForStalePath();

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
  console.log(`Scanning ${SKILLS_DIR.replace(`${REPO_ROOT}/`, '')} ... ${t1.size} T1 skills`);
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
