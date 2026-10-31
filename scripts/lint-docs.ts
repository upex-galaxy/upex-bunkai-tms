#!/usr/bin/env bun
/**
 * lint-docs.ts — dead-link gate for the human documentation surface.
 *
 * Scans `docs/**` (`.html` and `.md`), the root `README.md`, `INSTALLER.md`
 * and `CONTEXT.md`, the nested READMEs (`.context/README.md` and the
 * `README.md` of each direct child of `.context/` and `packages/`), and the
 * HTML that GitHub Pages publishes (`packages/decks/**`, `packages/pages-home/**`),
 * and reports:
 *
 *   - `link`: a RELATIVE link (`href="…"`, `src="…"`, markdown `](…)`) that
 *     does not resolve to an existing file or directory, relative to the file
 *     that holds it. The agent-facing markdown (`.agents/**`, `.context/**`
 *     outside the `.context/PBI/` cache, `.claude/**`; `AGENT_LINK_ROOTS`) is
 *     scanned for this kind only: its markdown `](…)` links, with fenced
 *     blocks and inline code spans skipped, and git-ignored files (community
 *     skills, generated prompts) left out. A published page (`PUBLISHED_MOUNTS`) is resolved the way
 *     the Pages site serves it (`.github/workflows/pages.yml` assembles it):
 *     `./decks/x.html` from the home page is `packages/decks/x.html` in the repo;
 *   - `path`: an inline-code path (`` `docs/…` ``, `<code>docs/…</code>`) that
 *     starts with a known repo root and does not exist, resolved from the repo
 *     root;
 *   - `meta`: an HTML page under `docs/` without a `<title>` or a
 *     `<meta name="description">`;
 *   - `file-line` / `current-state`: a volatile fact of one of the two
 *     regex-visible families of Critical Rule #17: a `path.ext:N` citation or a
 *     claim about the present ("today", "as of <year>", a dated measurement,
 *     "since <version>", a tool version). Fenced blocks, `<pre>`,
 *     `<code class="block">`, `<script>` and `<style>` are skipped; a line
 *     marked `volatile-ok: <reason>` is kept;
 *   - `roster`: a repo skill (a committed `.agents/skills/<slug>/SKILL.md` that
 *     is not a community install) missing from the section 5 skill router
 *     (`.agents/instructions/agent-skills-and-mcps.md`, or `AGENTS.md` on a
 *     project that still carries the single-file layout: `skillTableSource`).
 *     A skill the PROJECT created counts as listed when its row sits in the
 *     "Project context skills" table of `.agents/instructions/agent-project.md`, or
 *     when an `AGENTS.md` router row loads its `SKILL.md` (the adopted app's
 *     `<app>-context`): both are project-owned files `bun sync` never
 *     overwrites, unlike the synced skills section.
 *     The human pages are NOT checked for a skill list: they point to
 *     the generated `REGISTRY.md`, because enumerating the skills there is the
 *     mutable-set copy Critical Rule #17 forbids;
 *   - `script`: a `bun run <name>` quoted in `AGENTS.md`, an instruction
 *     section (`.agents/instructions/*.md`) or the doc surface
 *     (fenced blocks, decks and the Pages home included) whose name
 *     `package.json` does not declare. Placeholders, file runs
 *     (`bun run scripts/x.ts`) and prose that only names the command are
 *     ignored.
 *   - `contract`: a documentation-contract marker (`LINT.IfChange` /
 *     `LINT.ThenChange`, ADR-0017) is unbalanced, reuses a label, or names a
 *     page that does not exist. Maintainers' checkout only
 *     (`contractsEnforced`); the range check itself is
 *     `scripts/lint-doc-contracts.ts`, at pre-push and in CI.
 *
 * Severity per kind lives in `SEVERITY`: an `error` fails the gate, a
 * `warning` is printed and passes.
 *
 * External URLs, `mailto:` / `tel:` / `data:` / `javascript:`, bare anchors
 * and template placeholders are ignored; a `#fragment` or `?query` is stripped
 * before the lookup. A repo root that does not exist in this checkout is
 * skipped entirely, in both directions: a scaffolded project has no
 * `packages/`, so neither the deck scan nor a `packages/…` citation can fail
 * there. Paths containing glob or placeholder characters (`*`, `{`, `<`, `$`)
 * are treated as patterns, not files.
 *
 * Two kinds of path are legitimately absent and never reported: a path git
 * IGNORES (generated or installed at setup: `.agents/prompts/…`, the
 * `.context/PBI/` cache, community skills), and the few OPTIONAL files a doc
 * describes before anyone creates them (`OPTIONAL_PATHS`). The inline-path
 * check does not run on `packages/decks/**`: deck slides quote illustrative
 * paths from teaching examples. Their relative links and their `bun run` names
 * ARE checked.
 *
 * Usage: bun scripts/lint-docs.ts   (exit 1 on any `error` finding)
 */

import type { VolatileKind } from './lib/volatile-facts';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { contractsEnforced, scanContracts } from './lib/doc-contracts';
import { L0_FILE, parseProjectSkills, parseRouter, PROJECT_FILE, SECTIONS_DIR, skillTableSource } from './lib/instructions';
import { isVolatileExemptPath, scanVolatile, volatileRemedy } from './lib/volatile-facts';

/** Repo roots an inline-code path must start with to be checked. */
export const KNOWN_ROOTS = ['docs/', '.agents/', 'scripts/', 'cli/', 'packages/'] as const;

export type DocFindingKind = 'link' | 'path' | 'meta' | 'file-line' | 'current-state' | 'roster' | 'script' | 'contract';

export interface DocFinding {
  file: string
  line: number
  kind: DocFindingKind
  target: string
}

/**
 * What fails the gate. A family with no residue in this repo is an `error`, so
 * a new hit is a regression. A family that still carries residue is a
 * `warning` until a sweep removes it, then flips to `error`: `path` and
 * `script` (docs that describe paths and app scripts a scaffolded project
 * creates later). The two volatile-facts families were swept and block.
 */
export const SEVERITY: Record<DocFindingKind, 'error' | 'warning'> = {
  'link': 'error',
  'meta': 'error',
  'roster': 'error',
  'path': 'warning',
  'script': 'warning',
  'file-line': 'error',
  'current-state': 'error',
  'contract': 'error',
};

const VOLATILE_KIND: Record<VolatileKind, DocFindingKind> = {
  'FILE-LINE': 'file-line',
  'CURRENT-STATE': 'current-state',
};

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function relativePosix(from: string, to: string): string {
  return toPosix(relative(from, to));
}

/** Volatile-facts findings for one file (Critical Rule #17). Exported for the unit test. */
export function lintDocVolatile(rel: string, raw: string): DocFinding[] {
  if (isVolatileExemptPath(rel)) { return []; }
  const findings: DocFinding[] = [];
  const seen = new Set<string>();
  for (const hit of scanVolatile(raw, { html: rel.endsWith('.html') })) {
    const key = `${hit.line}:${hit.kind}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    findings.push({ file: rel, line: hit.line, kind: VOLATILE_KIND[hit.kind], target: hit.match });
  }
  return findings;
}

/** Title and description checks for one HTML page under `docs/`. */
export function lintDocMeta(rel: string, html: string): DocFinding[] {
  if (!rel.startsWith('docs/') || !rel.endsWith('.html')) { return []; }
  const head = html.split(/<\/head>/i)[0];
  const findings: DocFinding[] = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  if (!title || title[1].trim() === '') {
    findings.push({ file: rel, line: 1, kind: 'meta', target: '<title>' });
  }
  const description = (head.match(/<meta\s[^>]*>/gi) ?? []).find(tag => /\sname\s*=\s*["']description["']/i.test(tag));
  const content = description ? /\scontent\s*=\s*["']([^"']*)["']/i.exec(description) : null;
  if (!content || content[1].trim() === '') {
    findings.push({ file: rel, line: 1, kind: 'meta', target: '<meta name="description">' });
  }
  return findings;
}

/**
 * Documented optional files: described in prose, present only in some projects.
 * The retired command-alias overlay is one: nothing creates it any more, but a
 * project scaffolded earlier may still carry it, and the updater names it.
 */
export const OPTIONAL_PATHS = new Set<string>([
  '.agents/compatibility/command-aliases.project.json',
]);

/**
 * Where each published surface lives on the GitHub Pages site
 * (`.github/workflows/pages.yml` assembles it): site prefix -> repo directory.
 * The empty prefix is the site root, served from `packages/pages-home/`.
 * Longest prefix wins.
 */
export const PUBLISHED_MOUNTS: ReadonlyArray<readonly [site: string, repo: string]> = [
  ['decks/', 'packages/decks/'],
  ['', 'packages/pages-home/'],
];

/**
 * Single files the Pages workflow copies outside the mounts above: site path ->
 * repo path. `docs/` is not published, only its start-here page is.
 */
export const PUBLISHED_FILES: ReadonlyArray<readonly [site: string, repo: string]> = [
  ['onboarding.html', 'docs/onboarding.html'],
];

/** Repo path (posix, relative) -> site path, or null when the file is not published HTML. */
export function sitePathOf(rel: string): string | null {
  if (!rel.endsWith('.html')) { return null; }
  const file = PUBLISHED_FILES.find(([, repo]) => repo === rel);
  if (file) { return file[0]; }
  for (const [site, repo] of PUBLISHED_MOUNTS) {
    if (repo !== '' && rel.startsWith(repo)) { return site + rel.slice(repo.length); }
  }
  return null;
}

/**
 * Resolve a relative link the way the Pages site does, for a published page.
 * Returns the repo path that backs the target, or `'outside'` when the link
 * climbs above the site root.
 */
export function resolvePublishedLink(siteFile: string, target: string): string | 'outside' {
  const parts = siteFile.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') { continue; }
    if (seg === '..') {
      if (parts.length === 0) { return 'outside'; }
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const site = parts.join('/') + (target.endsWith('/') && parts.length > 0 ? '/' : '');
  const file = PUBLISHED_FILES.find(([sitePath]) => sitePath === site);
  if (file) { return file[1]; }
  const sorted = [...PUBLISHED_MOUNTS].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, repo] of sorted) {
    const bare = prefix.replace(/\/$/, '');
    if (prefix === '' || site === bare || site.startsWith(prefix)) {
      const rest = prefix === '' ? site : site.slice(Math.min(site.length, prefix.length));
      return (repo + rest).replace(/\/$/, '') || repo.replace(/\/$/, '');
    }
  }
  return 'outside';
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

function walk(dir: string, exts: string[], out: string[]): void {
  if (!existsSync(dir)) { return; }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) { continue; }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, exts, out); }
    else if (exts.some(ext => entry.name.endsWith(ext))) { out.push(full); }
  }
}

/**
 * The READMEs that live outside `docs/` one level down: `.context/` and its
 * direct children, and every `packages/*` package. Not a recursive walk:
 * `.context/PBI/` is a Jira cache that can hold thousands of files.
 * `.agents/README.md` is `lint-skills.ts` territory.
 */
function nestedReadmes(root: string): string[] {
  const out: string[] = [];
  for (const base of ['.context', 'packages']) {
    const dir = join(root, base);
    if (!existsSync(dir)) { continue; }
    const own = join(dir, 'README.md');
    if (existsSync(own)) { out.push(own); }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const readme = join(dir, entry.name, 'README.md');
      if (entry.isDirectory() && existsSync(readme)) { out.push(readme); }
    }
  }
  return out;
}

/** A markdown `](…)` link target, first group. */
const MD_LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Roots of the agent-facing markdown whose `](…)` links the gate checks (link kind only). */
export const AGENT_LINK_ROOTS = ['.agents', '.context', '.claude'] as const;

/** The Jira cache under `.context/`: synced content, never authored here. */
const PBI_CACHE = join('.context', 'PBI');

/**
 * The agent-facing markdown files, absolute paths, sorted. Directory symlinks
 * are not followed (`.claude/skills` is an alias of `.agents/skills`), the PBI
 * cache is skipped, and `lintDocs` drops the git-ignored ones.
 */
export function collectAgentLinkFiles(root: string): string[] {
  const files: string[] = [];
  for (const base of AGENT_LINK_ROOTS) {
    const found: string[] = [];
    walk(join(root, base), ['.md'], found);
    files.push(...found.filter(file => !relative(root, file).startsWith(`${PBI_CACHE}/`)));
  }
  return files.sort();
}

/** Blank inline code spans, keeping offsets: a `[x](y)` quoted as code is an example, not a link. */
function blankInlineCode(text: string): string {
  return text.replace(/`[^`\n]*`/g, span => span.replace(/[^\n]/g, ' '));
}

/** `link` findings for one agent-facing markdown file. */
export function lintAgentLinkFile(root: string, file: string): DocFinding[] {
  return linkFindings(root, file, blankInlineCode(blankFences(readFileSync(file, 'utf8'))), [MD_LINK]);
}

/** Every file the gate scans, absolute paths, sorted for stable output. */
export function collectDocFiles(root: string): string[] {
  const files: string[] = [];
  walk(join(root, 'docs'), ['.html', '.md'], files);
  walk(join(root, 'packages', 'decks'), ['.html'], files);
  walk(join(root, 'packages', 'pages-home'), ['.html'], files);
  for (const name of ['README.md', 'INSTALLER.md', 'CONTEXT.md']) {
    const full = join(root, name);
    if (existsSync(full)) { files.push(full); }
  }
  for (const readme of nestedReadmes(root)) {
    if (!files.includes(readme)) { files.push(readme); }
  }
  return files.sort();
}

const IGNORED_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const PATTERN_CHARS = /[*{}<>$|&…]/;

function isCheckableLink(raw: string): boolean {
  const target = raw.trim();
  if (target === '' || IGNORED_SCHEME.test(target) || target.startsWith('/')) { return false; }
  // `[table]([column])` in pseudocode: a bracketed target is a placeholder, not a path.
  return !PATTERN_CHARS.test(target) && !/[[\]]/.test(target);
}

function stripSuffix(target: string): string {
  return target.split('#')[0].split('?')[0];
}

/** Remove fenced code blocks from markdown, keeping line count stable. */
function blankFences(text: string): string {
  return text.replace(/^(```|~~~)[\s\S]*?\n\1/gm, block => block.replace(/[^\n]/g, ''));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function rootExists(root: string, path: string): boolean {
  const top = path.split('/')[0];
  return existsSync(join(root, top));
}

/** `link` findings: each pattern's first group, resolved relative to `file`. */
function linkFindings(root: string, file: string, text: string, patterns: RegExp[]): DocFinding[] {
  const findings: DocFinding[] = [];
  const rel = relativePosix(root, file);
  const site = sitePathOf(rel);
  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const target = match[1];
      if (!isCheckableLink(target)) { continue; }
      const clean = stripSuffix(target);
      if (clean === '') { continue; }
      let resolved = resolve(dirname(file), decodeURIComponent(clean));
      let outside = false;
      if (site !== null) {
        const published = resolvePublishedLink(site, decodeURIComponent(clean));
        // A link above the site root has no target once published: always dead.
        outside = published === 'outside';
        if (!outside) { resolved = join(root, published); }
      }
      const fromRoot = relativePosix(root, resolved);
      // A link that climbs into a root this checkout does not have is skipped.
      if (!outside && !fromRoot.startsWith('..') && !rootExists(root, fromRoot)) { continue; }
      if (outside || !existsSync(resolved)) {
        const key = `link:${match.index}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ file: rel, line: lineOf(text, match.index ?? 0), kind: 'link', target });
        }
      }
    }
  }
  return findings;
}

/** Findings for one file. Exported for the unit test. */
export function lintDocFile(root: string, file: string): DocFinding[] {
  const findings: DocFinding[] = [];
  const raw = readFileSync(file, 'utf8');
  const isMarkdown = file.endsWith('.md');
  const text = isMarkdown ? blankFences(raw) : raw.replace(/<script[\s\S]*?<\/script>/gi, m => m.replace(/[^\n]/g, ''));
  const rel = relativePosix(root, file);

  const linkPatterns = [
    /\b(?:href|src)\s*=\s*"([^"]*)"/g,
    /\b(?:href|src)\s*=\s*'([^']*)'/g,
  ];
  if (isMarkdown) { linkPatterns.push(MD_LINK); }
  findings.push(...linkFindings(root, file, text, linkPatterns));

  const codePatterns = rel.startsWith('packages/decks/') ? [] : [/`([^`\n]+)`/g, /<code>([^<\n]+)<\/code>/g];
  for (const pattern of codePatterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1].trim().replace(/[.,;:]+$/, '');
      if (!KNOWN_ROOTS.some(prefix => candidate.startsWith(prefix))) { continue; }
      if (/\s/.test(candidate) || PATTERN_CHARS.test(candidate)) { continue; }
      const clean = stripSuffix(candidate).replace(/:\d+(?:-\d+)?$/, '');
      if (!rootExists(root, clean) || OPTIONAL_PATHS.has(clean.replace(/\/$/, ''))) { continue; }
      if (!existsSync(join(root, clean))) {
        findings.push({ file: rel, line: lineOf(text, match.index ?? 0), kind: 'path', target: candidate });
      }
    }
  }
  findings.push(...lintDocMeta(rel, raw));
  findings.push(...lintDocVolatile(rel, raw));
  return findings;
}

const ROUTER_HEADING = /^### Skills T1\b/m;

/** Slugs in the first column of the section 5 skill router table, or null when the table is missing. */
export function routerSlugs(agentsMd: string): Set<string> | null {
  const start = agentsMd.search(ROUTER_HEADING);
  if (start < 0) { return null; }
  const after = agentsMd.slice(start).split('\n').slice(1);
  const next = after.findIndex(line => /^#{1,3} /.test(line));
  const section = next < 0 ? after : after.slice(0, next);
  const slugs = new Set<string>();
  for (const line of section) {
    const cell = /^\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|/.exec(line);
    if (cell) { slugs.add(cell[1]); }
  }
  return slugs;
}

/** Community skill slugs `cli/install.ts` installs: they land in the same store but are not repo skills. */
function communitySlugs(root: string): Set<string> {
  const installTs = join(root, 'cli', 'install.ts');
  if (!existsSync(installTs)) { return new Set(); }
  const src = readFileSync(installTs, 'utf8');
  return new Set([...src.matchAll(/\bskill:\s*['"]([a-z][a-z0-9-]+)['"]/g)].map(m => m[1]));
}

/** Repo skills: committed, non-symlinked skill folders that are not community installs. */
function repoSkills(root: string): string[] {
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) { return []; }
  const community = communitySlugs(root);
  const candidates = readdirSync(dir)
    .filter(name => !community.has(name) && !lstatSync(join(dir, name)).isSymbolicLink())
    .filter(name => statSync(join(dir, name)).isDirectory() && existsSync(join(dir, name, 'SKILL.md')));
  const ignored = gitIgnored(root, candidates.map(slug => `.agents/skills/${slug}/SKILL.md`));
  return candidates.filter(slug => !ignored.has(`.agents/skills/${slug}/SKILL.md`)).sort();
}

/**
 * Slugs of the skills the project routes from its own files: rows of the
 * "Project context skills" table of `agent-project.md`, and `AGENTS.md` router rows
 * that load a `.agents/skills/<slug>/SKILL.md`.
 */
export function projectRoutedSlugs(root: string): Set<string> {
  const slugs = new Set<string>();
  const project = join(root, SECTIONS_DIR, PROJECT_FILE);
  if (existsSync(project)) {
    for (const row of parseProjectSkills(readFileSync(project, 'utf8')) ?? []) { slugs.add(row.slug); }
  }
  const l0 = join(root, L0_FILE);
  if (existsSync(l0)) {
    for (const row of parseRouter(readFileSync(l0, 'utf8')) ?? []) {
      for (const target of row.targets) {
        const m = /^\.agents\/skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md$/.exec(target);
        if (m) { slugs.add(m[1]); }
      }
    }
  }
  return slugs;
}

/** `roster` findings: repo skills missing from the section 5 skill router and from the project's own router rows. */
export function lintRoster(root: string): DocFinding[] {
  const source = skillTableSource(root);
  const skills = repoSkills(root);
  if (source === null || skills.length === 0) { return []; }
  const router = routerSlugs(source.text);
  if (router === null) {
    return [{ file: source.file, line: 1, kind: 'roster', target: 'section 5 skill router table (### Skills T1 heading not found)' }];
  }
  const projectRouted = projectRoutedSlugs(root);
  return skills.filter(slug => !router.has(slug) && !projectRouted.has(slug)).map(slug => ({ file: source.file, line: 1, kind: 'roster' as const, target: slug }));
}

/** The instruction sections (`.agents/instructions/*.md`): their `bun run` citations are checked like `AGENTS.md`'s. */
function instructionFiles(root: string): string[] {
  const dir = join(root, SECTIONS_DIR);
  if (!existsSync(dir)) { return []; }
  return readdirSync(dir).filter(name => name.endsWith('.md')).sort().map(name => join(dir, name));
}

const BUN_RUN = /\bbun run(?:\s+--silent)?\s+([^\s`'"<>()[\]|,;\\]+)/g;

function scriptNames(pkgFile: string): string[] {
  if (!existsSync(pkgFile)) { return []; }
  return Object.keys((JSON.parse(readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {});
}

/** `script` findings: `bun run <name>` citations whose name `package.json` does not declare. */
export function lintScripts(root: string, files: string[]): DocFinding[] {
  const pkgFile = join(root, 'package.json');
  if (!existsSync(pkgFile)) { return []; }
  const rootScripts = scriptNames(pkgFile);
  const findings: DocFinding[] = [];
  for (const file of files) {
    const rel = relativePosix(root, file);
    // A package README quotes its own scripts as well as the root ones. Decks
    // and the Pages home live under packages/ but teach the root scripts.
    const pkg = sitePathOf(rel) === null ? /^packages\/([^/]+)\//.exec(rel) : null;
    const scripts = new Set(pkg ? [...rootScripts, ...scriptNames(join(root, 'packages', pkg[1], 'package.json'))] : rootScripts);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(BUN_RUN)) {
      const name = match[1].replace(/[.:]+$/, '');
      if (!/^[a-z0-9]/i.test(name) || name.includes('/') || /\.[cm]?[jt]sx?$/.test(name) || PATTERN_CHARS.test(name)) { continue; }
      if (!scripts.has(name)) { findings.push({ file: rel, line: lineOf(text, match.index ?? 0), kind: 'script', target: name }); }
    }
  }
  return findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}

/** Targets git ignores, resolved from the repo root. Empty outside a git work tree. */
function gitIgnored(root: string, paths: string[]): Set<string> {
  if (paths.length === 0) { return new Set(); }
  const result = Bun.spawnSync(['git', 'check-ignore', '--stdin'], {
    cwd: root,
    stdin: new TextEncoder().encode(`${paths.join('\n')}\n`),
    stdout: 'pipe',
    stderr: 'ignore',
  });
  return new Set(result.stdout.toString().split('\n').map(line => line.trim()).filter(Boolean));
}

export function lintDocs(root: string): { files: number, findings: DocFinding[] } {
  const files = collectDocFiles(root);
  const agentCandidates = collectAgentLinkFiles(root).filter(file => !files.includes(file));
  const ignoredAgent = gitIgnored(root, agentCandidates.map(file => relativePosix(root, file)));
  const agentFiles = agentCandidates.filter(file => !ignoredAgent.has(relativePosix(root, file)));
  const raw = [
    ...files.flatMap(file => lintDocFile(root, file)),
    ...agentFiles.flatMap(file => lintAgentLinkFile(root, file)),
  ];
  const isRef = (f: DocFinding): boolean => f.kind === 'link' || f.kind === 'path';
  const resolvedOf = (f: DocFinding): string => f.kind === 'path'
    ? stripSuffix(f.target).replace(/:\d+(?:-\d+)?$/, '')
    : relativePosix(root, resolve(root, dirname(f.file), decodeURIComponent(stripSuffix(f.target))));
  const ignored = gitIgnored(root, [...new Set(raw.filter(isRef).map(resolvedOf))]);
  const findings = raw.filter(f => !isRef(f) || !ignored.has(resolvedOf(f)));
  const agentsFile = join(root, 'AGENTS.md');
  findings.push(...lintRoster(root));
  const instructions = [...(existsSync(agentsFile) ? [agentsFile] : []), ...instructionFiles(root)];
  findings.push(...lintScripts(root, [...instructions, ...files]));
  findings.push(...lintContracts(root));
  return { files: files.length + agentFiles.length, findings };
}

/** Documentation-contract markers (ADR-0017): balanced, unique labels, every target on disk. */
export function lintContracts(root: string): DocFinding[] {
  if (!contractsEnforced(root)) { return []; }
  return scanContracts(root).findings.map(f => ({ file: f.file, line: f.line, kind: 'contract' as const, target: f.detail }));
}

const LABEL: Record<DocFindingKind, string> = {
  'link': 'dead link',
  'path': 'missing path',
  'meta': 'missing',
  'file-line': 'FILE-LINE',
  'current-state': 'CURRENT-STATE',
  'roster': 'skill not listed',
  'script': 'unknown script',
  'contract': 'doc contract',
};

if (import.meta.main) {
  const root = process.cwd();
  if (!statSync(root).isDirectory()) { process.exit(2); }
  const { files, findings } = lintDocs(root);
  const note = (f: DocFinding): string => f.kind === 'file-line'
    ? `(${volatileRemedy('FILE-LINE')})`
    : f.kind === 'current-state' ? `(${volatileRemedy('CURRENT-STATE')})` : '';
  const warnings = findings.filter(f => SEVERITY[f.kind] === 'warning');
  const errors = findings.filter(f => SEVERITY[f.kind] === 'error');
  for (const f of warnings) {
    console.warn(`  ! ${f.file}:${f.line}  ${LABEL[f.kind]}  ${f.target} ${note(f)}`);
  }
  if (errors.length === 0) {
    const tail = warnings.length > 0 ? `, ${warnings.length} warning(s)` : '';
    console.log(`✓ docs:check passed (${files} files, no blocking findings${tail})`);
    process.exit(0);
  }
  console.error(`✗ docs:check found ${errors.length} problem(s) in ${files} files:\n`);
  for (const f of errors) {
    console.error(`  ${f.file}:${f.line}  ${LABEL[f.kind]}  ${f.target}`);
  }
  process.exit(1);
}
