/**
 * @fileoverview The varlock env schema, generated from the variable manifest,
 * and the inherited-override check that guards `varlock run` launches.
 *
 * Two committed files:
 *
 *   - `.env.core.schema`  GENERATED here from `VAR_MANIFEST` + `UNROUTED_VARS`,
 *                         SYNCED by the updater (component `env-schema`). Never
 *                         hand-edited: `bun run vars:schema` rewrites it and
 *                         `bun run vars:schema:check` fails when it is stale.
 *   - `.env.schema`       PROJECT-OWNED (delivered once, then protected). Holds
 *                         the root decorators and imports the core half with
 *                         `@import(./.env.core.schema)`; a project appends its
 *                         own variables below the import.
 *
 * Neither file holds a value. They declare NAMES, types and sensitivity. Values
 * stay in `.env` / `.env.local` (the default path), or come from a secret
 * manager plugin later. The schema REQUIRES nothing (ADR-0010): this repo is a
 * template, a fresh clone has no Supabase project and no Atlassian site yet,
 * and the consumer that reads a variable fails by name when it is empty.
 *
 * WHY THE CORE FILE IS NAMED `.env.core.schema` AND NOT `.env.schema.core`.
 * varlock parses any file starting with `.env` as `.env[.<env>][.<type>]`, at
 * most two segments after `env`, and refuses an import that is not `.env.*`
 * ("Unsure how to interpret filename"). So the type suffix must come LAST and
 * the qualifier in the middle. varlock reads `core` as an environment
 * qualifier, but an IMPORTED file "is never treated as env-specific even if
 * its filename contains an env qualifier" (JSDoc of `isEnvSpecific` in
 * varlock's env-graph, NOT the public docs). That is the one undocumented rule
 * this layout leans on, and it is why `varlock` is pinned EXACTLY in
 * `package.json` and why `loadSchemaPairThroughVarlock` below loads the
 * committed pair through varlock on every `vars:schema:check`: a bump that
 * changes the rule fails the gate instead of silently dropping every core
 * variable from validation.
 *
 * PRECEDENCE (`inheritedOverrides`). `varlock run` lets a variable already in
 * the process environment WIN over `.env` (measured on the pinned 1.20.0; no
 * flag inverts it), the opposite of the `dotenv -o` wrappers it replaced. A
 * stale value inherited from a parent shell would then make a corrected `.env`
 * a silent no-op. `bun run vars:env:check` reports that.
 *
 * THE OPTIONAL PROVIDER OVERLAY. The core header carries
 * `@import(./.env.provider.schema, allowMissing=true)`: the hook a project
 * uses when it keeps its secrets in a manager (ADR-0011). Absent overlay = a
 * no-op, so every project without one loads unchanged. Placed HERE, in the
 * synced half, so an existing project gains the hook with `bun sync` and
 * never has to edit its own `.env.schema`. Measured (agentic-qa, same varlock
 * pin): an overlay item beats both this file's empty declaration and a project
 * re-declaration with an empty value. The overlay is `./secret-providers.ts`.
 *
 * `cli/` is import-closed: this module imports only from
 * `./variables-manifest.ts`, `./secret-providers.ts` and node built-ins. `scripts/env-schema.ts`
 * and `scripts/check-vars.ts` import FROM here.
 */

import type { VarSpec } from './variables-manifest.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PROVIDER_SCHEMA_FILE } from './secret-providers.ts';
import { DEPRECATED_VARS, parseDotEnvPairs, validateVarManifest, valueSourceOf, VAR_MANIFEST } from './variables-manifest.ts';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** Generated, synced half. Root-relative. */
export const CORE_SCHEMA_FILE = '.env.core.schema';
/** Project-owned half, the file varlock auto-loads. Root-relative. */
export const PROJECT_SCHEMA_FILE = '.env.schema';
/** The one manifest source the generator reads. Named for messages only. */
export const SCHEMA_SOURCE = 'cli/lib/variables-manifest.ts';
/** The env files varlock reads by default, in load order (later wins). */
export const ENV_VALUE_FILES = ['.env', '.env.local'] as const;

const GENERATED_BANNER_LINE = `# ${CORE_SCHEMA_FILE} - GENERATED from ${SCHEMA_SOURCE}. DO NOT EDIT.`;

// ----------------------------------------------------------------------------
// Unrouted variables: documented, optional, NOT routed by the installer
// ----------------------------------------------------------------------------

/**
 * Keys `.env.example` documents (active or commented) or the Supabase↔Vercel
 * integration writes into `.env`, that `VAR_MANIFEST` does not route. The
 * schema MUST declare them: varlock treats an undeclared key found in `.env` as
 * implicitly sensitive, and an undeclared key with an EMPTY value as a
 * validation failure. A `.env` copied from the template has to load.
 *
 * `docs` here is free text (a sentence), unlike `VarSchemaHints.docs` (a URL).
 */
export interface UnroutedVar {
  name: string
  docs: string
  type?: string
  example?: string
  sensitive?: boolean
}

export const UNROUTED_VARS: readonly UnroutedVar[] = [
  // --- MCP control plane (local only, never pushed anywhere) ---
  { name: 'SUPABASE_ACCESS_TOKEN', sensitive: true, docs: 'Supabase personal access token for the Supabase MCP server (.mcp.json, opencode.jsonc, .codex/config.toml). Dashboard, Account, Access Tokens.' },
  // --- Jira sync operational params, NOT credentials ---
  { name: 'JIRA_PROJECT_KEY', docs: 'Default project key for bun run jira:sync-issues; falls back to .agents/project.yaml.' },
  { name: 'JIRA_SYNC_OUTPUT', docs: 'Output directory for synced issues (default .context/PBI).' },
  // --- Legacy Supabase pair, still provisioned by the Supabase-Vercel integration ---
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', docs: 'Legacy browser-safe anon key. Valid while Supabase keeps the legacy pair; the publishable key replaces it.' },
  { name: 'SUPABASE_ANON_KEY', docs: 'Legacy anon key (server-side copy). Valid while Supabase keeps the legacy pair.' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', sensitive: true, docs: 'Legacy service_role key (server only). Valid while Supabase keeps the legacy pair; the secret key replaces it.' },
];

// ----------------------------------------------------------------------------
// Deprecated keys in .env: never declared, neutralized for validation
// ----------------------------------------------------------------------------

/** An ACTIVE assignment line (`KEY=` or `export KEY=`); a commented line is inert. */
const ENV_ASSIGNMENT = /^\s*(?:export\s+)?([A-Z_]\w*)\s*=/i;

/**
 * The `DEPRECATED_VARS` that `.env` text still assigns, in manifest order.
 * Names only: a caller never needs, and never gets, a value.
 *
 * The schema does NOT declare them (a declared name reads as a live one), and
 * an undeclared key that is present and EMPTY fails `varlock load`. So the
 * doctor neutralizes them (`neutralizeDeprecatedKeys`) to judge the declared
 * items only, and reports the lines for the human to delete.
 */
export function deprecatedEnvKeysIn(envText: string): string[] {
  const assigned = new Set<string>();
  for (const line of envText.split(/\r?\n/)) {
    const match = ENV_ASSIGNMENT.exec(line);
    if (match) { assigned.add(match[1]); }
  }
  return DEPRECATED_VARS.filter(d => assigned.has(d.name)).map(d => d.name);
}

/**
 * A child environment in which every deprecated key `.env` still assigns has a
 * non-empty placeholder, so `varlock load` judges the declared items only. A
 * process value wins over the `.env` line (measured), and an undeclared key
 * fails only when EMPTY. The placeholder is a constant, never the real value.
 */
export function neutralizeDeprecatedKeys<T extends Record<string, string | undefined>>(env: T, inFile: readonly string[]): T {
  const out: Record<string, string | undefined> = { ...env };
  for (const name of inFile) { out[name] = 'deprecated'; }
  return out as T;
}

// ----------------------------------------------------------------------------
// Generation
// ----------------------------------------------------------------------------

/**
 * Free text that is safe inside an env-spec comment block: no `@`, because a
 * `@word` in a comment IS a decorator to varlock, and no line break, because
 * every line of the block is emitted with its own `# ` prefix.
 */
function safeText(text: string): string {
  return text.replace(/@/g, '(at)').replace(/\s+/g, ' ').trim();
}

/** Quote a decorator argument. Double quotes, backslash-escaped. */
function quoteArg(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function decoratorLine(parts: Array<string | null>): string | null {
  const present = parts.filter((p): p is string => p !== null && p.length > 0);
  return present.length === 0 ? null : `# ${present.join(' ')}`;
}

function renderManifestItem(spec: VarSpec): string[] {
  const lines: string[] = [`# ${safeText(spec.note)}`];
  if (spec.obtainHint !== undefined && spec.obtainHint.trim() !== '') {
    lines.push(`# Obtain: ${safeText(spec.obtainHint)}`);
  }
  const hints = spec.schema ?? {};
  const decorators = decoratorLine([
    spec.secret ? '@sensitive' : null,
    hints.type !== undefined ? `@type=${hints.type}` : null,
    hints.example !== undefined ? `@example=${quoteArg(hints.example)}` : null,
    hints.docs !== undefined ? `@docs(${hints.docs})` : null,
  ]);
  if (decorators !== null) { lines.push(decorators); }
  lines.push(`${spec.name}=`);
  return lines;
}

function renderUnrouted(item: UnroutedVar): string[] {
  const lines: string[] = [`# ${safeText(item.docs)}`];
  const decorators = decoratorLine([
    item.sensitive === true ? '@sensitive' : null,
    item.type !== undefined ? `@type=${item.type}` : null,
    item.example !== undefined ? `@example=${quoteArg(item.example)}` : null,
  ]);
  if (decorators !== null) { lines.push(decorators); }
  lines.push(`${item.name}=`);
  return lines;
}

/** Manifest vars whose value lives in an env file: the set the schema declares. */
function envFileSpecs(manifest: readonly VarSpec[]): VarSpec[] {
  return manifest.filter(s => valueSourceOf(s) === 'env-file');
}

/** Every NAME the generated core schema declares, in file order. */
export function declaredSchemaKeys(): string[] {
  return [...envFileSpecs(VAR_MANIFEST).map(s => s.name), ...UNROUTED_VARS.map(u => u.name)];
}

/** Every NAME the core schema marks `@sensitive`. */
export function sensitiveSchemaKeys(): Set<string> {
  return new Set([
    ...envFileSpecs(VAR_MANIFEST).filter(s => s.secret).map(s => s.name),
    ...UNROUTED_VARS.filter(u => u.sensitive === true).map(u => u.name),
  ]);
}

/**
 * The full text of `.env.core.schema`. Deterministic: same manifest, same
 * bytes, LF line endings, trailing newline. Only manifest vars whose value
 * lives in an env file are emitted: `ATLASSIAN_URL` is anchored to
 * `.agents/project.yaml` and must never grow a second copy.
 */
export function generateCoreSchema(
  manifest: readonly VarSpec[] = VAR_MANIFEST,
  unrouted: readonly UnroutedVar[] = UNROUTED_VARS,
): string {
  validateVarManifest();
  const manifestNames = new Set(manifest.map(s => s.name));
  for (const item of unrouted) {
    if (manifestNames.has(item.name)) {
      throw new Error(`Unrouted var '${item.name}' is also a manifest variable; declare it once.`);
    }
  }

  const header = [
    '# ============================================================================',
    GENERATED_BANNER_LINE,
    '# ============================================================================',
    '# SYNCED by the boilerplate updater (component env-schema). Regenerate with',
    '#   bun run vars:schema        and gate it with    bun run vars:schema:check',
    `# Imported by the project-owned ${PROJECT_SCHEMA_FILE}, which holds the root`,
    '# decorators and the project\'s own variables.',
    '#',
    '# This file declares NAMES, types and sensitivity. It never holds a value:',
    '# fill .env (or .env.local). Validate (redacted): bunx varlock load --agent',
    '#',
    '# Nothing here is required: a fresh clone has no Supabase project or Atlassian',
    '# site yet, and the consumer that reads a variable fails by name when it is',
    '# empty. A project that wants a stronger contract re-declares the item in',
    `# ${PROJECT_SCHEMA_FILE} as required (the importing file wins).`,
    '#',
    `# The import below is the OPTIONAL secret-manager overlay (${PROVIDER_SCHEMA_FILE},`,
    '# references only, written by `bun setup` when a project opts in). Absent',
    '# = nothing changes: values come from .env / .env.local.',
    `# @import(./${PROVIDER_SCHEMA_FILE}, allowMissing=true)`,
    '# @defaultRequired=false',
    '# @defaultSensitive=false',
    '# ---',
    '',
  ];

  const body: string[] = [
    '# ----------------------------------------------------------------------------',
    '# Routed variables: tool credentials, the Supabase / Postgres backend, app',
    '# config, the automation identity, n8n. Every @sensitive item is a secret the',
    '# agent references by NAME only (Critical Rule #1).',
    `# Source: ${SCHEMA_SOURCE}. Order = manifest order.`,
    '# ----------------------------------------------------------------------------',
    '',
  ];
  for (const spec of envFileSpecs(manifest)) {
    body.push(...renderManifestItem(spec), '');
  }
  body.push(
    '# ----------------------------------------------------------------------------',
    '# Unrouted variables. Never pushed by the installer; declared so a .env copied',
    '# from the template, or pulled from Vercel, validates.',
    '# ----------------------------------------------------------------------------',
    '',
  );
  for (const item of unrouted) {
    body.push(...renderUnrouted(item), '');
  }

  return `${[...header, ...body].join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * The seed for a project's `.env.schema`. Written ONLY when the file is
 * absent (`seedProjectSchema`): after that the project owns it.
 *
 * No `@generateTsTypes`: nothing in the tooling reads the typed `ENV`, and the
 * app keeps reading `process.env`. A project that adopts `varlock/env` adds the
 * decorator here.
 */
export function projectSchemaTemplate(): string {
  return [
    '# ============================================================================',
    `# ${PROJECT_SCHEMA_FILE} - project-owned env schema (varlock, env-spec)`,
    '# ============================================================================',
    '# Delivered once by the boilerplate, then yours: bun sync never overwrites',
    `# it. The boilerplate half lives in ${CORE_SCHEMA_FILE} (generated + synced)`,
    '# and is pulled in by the import below. Add the variables YOUR app needs',
    '# under "Project variables"; keep values out of this file.',
    '#',
    '# Validate:   bunx varlock load --agent      (redacted, agent-safe)',
    '# Explain:    bunx varlock explain <VAR>',
    '# Reference:  https://varlock.dev/reference/item-decorators',
    '#',
    `# @import(./${CORE_SCHEMA_FILE})`,
    '# @defaultRequired=false',
    '# @defaultSensitive=false',
    '# ---',
    '',
    '# ----------------------------------------------------------------------------',
    '# Project variables (add below; one decorator line per item, e.g.)',
    '#   # Stripe secret key for the checkout route',
    '#   # @sensitive @required',
    '#   STRIPE_SECRET_KEY=',
    '#',
    `# An item ${CORE_SCHEMA_FILE} declares can be re-declared here with a stronger`,
    '# decorator (e.g. NEXT_PUBLIC_SUPABASE_URL made required); the project',
    '# declaration wins. Mark every secret sensitive: bun run env:set refuses to',
    '# write a sensitive key, and varlock redacts it in every agent-facing output.',
    '# ----------------------------------------------------------------------------',
    '',
  ].join('\n');
}

// ----------------------------------------------------------------------------
// File operations
// ----------------------------------------------------------------------------

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export interface CoreSchemaCheck {
  ok: boolean
  /** `missing` when the file is absent, `stale` when its bytes differ, `fresh` otherwise. */
  state: 'missing' | 'stale' | 'fresh'
  expected: string
}

/** Compare the committed `.env.core.schema` with what the manifest generates now. */
export function checkCoreSchema(root: string): CoreSchemaCheck {
  const expected = generateCoreSchema();
  const target = path.join(root, CORE_SCHEMA_FILE);
  if (!fs.existsSync(target)) { return { ok: false, state: 'missing', expected }; }
  const actual = normalizeEol(fs.readFileSync(target, 'utf8'));
  const ok = actual === expected;
  return { ok, state: ok ? 'fresh' : 'stale', expected };
}

/** Write `.env.core.schema`. Returns true when the bytes changed. */
export function writeCoreSchema(root: string): boolean {
  const check = checkCoreSchema(root);
  if (check.ok) { return false; }
  fs.writeFileSync(path.join(root, CORE_SCHEMA_FILE), check.expected, 'utf8');
  return true;
}

/** Create `.env.schema` from the template when absent. Never overwrites. */
export function seedProjectSchema(root: string): boolean {
  const target = path.join(root, PROJECT_SCHEMA_FILE);
  if (fs.existsSync(target)) { return false; }
  fs.writeFileSync(target, projectSchemaTemplate(), 'utf8');
  return true;
}

// ----------------------------------------------------------------------------
// Sensitivity, as the committed schema pair declares it
// ----------------------------------------------------------------------------

/** One `KEY=` item line of an env-spec file, with the decorator lines above it. */
interface SchemaItem { name: string, decorators: string }

/** The items of one schema file: each `KEY=` line and the comment block right above it. */
function schemaItems(text: string): SchemaItem[] {
  const items: SchemaItem[] = [];
  let block: string[] = [];
  let pastHeader = false;
  for (const raw of normalizeEol(text).split('\n')) {
    const line = raw.trim();
    if (!pastHeader) {
      if (line === '# ---') { pastHeader = true; }
      continue;
    }
    if (line === '') { block = []; continue; }
    if (line.startsWith('#')) { block.push(line); continue; }
    const m = /^([A-Z_]\w*)\s*=/i.exec(line);
    if (m) { items.push({ name: m[1], decorators: block.join(' ') }); }
    block = [];
  }
  return items;
}

export interface SchemaClassification {
  /** Every NAME the pair declares. */
  declared: Set<string>
  /** The NAMES it marks `@sensitive`. */
  sensitive: Set<string>
}

/**
 * The NAMES the committed pair declares and marks `@sensitive`: the core
 * file's items plus the project file's own declarations, where a project
 * re-declaration wins. Read from the files on disk (never from a value), so
 * `bun run env:set` and the drift reports apply the classification varlock
 * applies. A file that is absent contributes nothing; `null` when NEITHER file
 * exists, so a caller can fall back to the manifest.
 */
export function schemaClassification(root: string): SchemaClassification | null {
  const files = [CORE_SCHEMA_FILE, PROJECT_SCHEMA_FILE].map(f => path.join(root, f)).filter(f => fs.existsSync(f));
  if (files.length === 0) { return null; }
  const verdict = new Map<string, boolean>();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const defaultSensitive = /@defaultSensitive=true\b/.test(text.split('# ---')[0] ?? '');
    for (const item of schemaItems(text)) {
      const explicit = /@sensitive=false\b/.test(item.decorators)
        ? false
        : /@sensitive\b/.test(item.decorators) ? true : null;
      verdict.set(item.name, explicit ?? defaultSensitive);
    }
  }
  return {
    declared: new Set(verdict.keys()),
    sensitive: new Set([...verdict].filter(([, s]) => s).map(([n]) => n)),
  };
}

// ----------------------------------------------------------------------------
// Sensitivity lint: a secret-looking key must be @sensitive
// ----------------------------------------------------------------------------

/**
 * Name fragments that mark a key as a secret. `varlock load --agent` redacts
 * ONLY the items the schema calls sensitive; a token declared without
 * `@sensitive` prints in clear (a token incident in the sibling QA boilerplate,
 * 2026-10-05). Matched
 * as whole `_`-separated segments, case-insensitive, so `GH_TOKEN` and
 * `SLACK_MCP_XOXP_TOKEN` match and `MAX_TOKENS` does not (a number cannot be
 * `@sensitive` in varlock, so a false positive there would have no way out).
 * The sibling agentic-qa boilerplate ships the same constant with the same
 * list; change both.
 */
export const SECRET_NAME_PATTERNS: readonly string[] = [
  'TOKEN',
  'SECRET',
  'SECRETS',
  'PASSWORD',
  'PASSWORDS',
  'PASSWD',
  'PWD',
  'API_KEY',
  'APIKEY',
  'ACCESS_KEY',
  'PRIVATE_KEY',
  'CLIENT_SECRET',
  'CREDENTIAL',
  'CREDENTIALS',
  'PAT',
  'XOXP',
  'XOXB',
  'XAPP',
];

const SECRET_NAME_RE = new RegExp(`(?:^|_)(?:${SECRET_NAME_PATTERNS.join('|')})(?:_|$)`, 'i');

export function isSecretLookingName(name: string): boolean {
  return SECRET_NAME_RE.test(name);
}

/** What one file says about an item's sensitivity. `undefined` = says nothing. */
type Sensitivity = true | false | 'dynamic' | undefined;

interface SchemaItemDef {
  key: string
  line: number
  /** From the item's own `@sensitive` / `@public`. */
  explicit: Sensitivity
  /** From the file's `@defaultSensitive` root decorator, applied to this key. */
  fileDefault: Sensitivity
}

export interface ParsedSchemaFile {
  items: SchemaItemDef[]
  /** Raw first argument of every root `@import(...)`, in file order. */
  imports: string[]
}

export interface SensitivityViolation {
  key: string
  /** Root-relative path and 1-based line of the declaration the reason names. */
  file: string
  line: number
  reason: string
}

const DIVIDER = /^\s*#\s*-{3,}\s*$/;
const COMMENT = /^\s*#/;
const ITEM = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$/;

/** The decorator part of a comment, or null when the comment is plain prose. */
function decoratorText(comment: string): string | null {
  const body = comment.replace(/^\s*#\s?/, '').trim();
  return body.startsWith('@') ? body : null;
}

/** `@sensitive` / `@public` in one decorator string, resolved to what the item ends up as. */
function sensitivityIn(decorators: string): Sensitivity {
  const m = /(?:^|\s)@(sensitive|public)(?:=(\S+))?(?=\s|$)/.exec(decorators);
  if (!m) { return undefined; }
  const [, name, value] = m;
  if (name === 'sensitive' && value?.startsWith('{')) { return true; }
  const flag = value === undefined || value === 'true' ? true : value === 'false' ? false : 'dynamic';
  if (flag === 'dynamic') { return 'dynamic'; }
  return name === 'sensitive' ? flag : !flag;
}

/** The trailing `# ...` of an item line, skipping a quoted value. */
function postValueComment(value: string): string | null {
  const v = value.trimStart();
  let rest = v;
  const quote = v[0];
  if (quote === '"' || quote === '\'' || quote === '`') {
    const end = v.indexOf(quote, 1);
    rest = end === -1 ? '' : v.slice(end + 1);
  }
  const hash = rest.search(/(?:^|\s)#/);
  return hash === -1 ? null : rest.slice(hash).trim();
}

/** What `@defaultSensitive=<v>` makes of `key`. */
function defaultFor(rootDecorators: string, key: string): Sensitivity {
  const m = /(?:^|\s)@defaultSensitive=(\S+)/.exec(rootDecorators);
  if (!m) { return undefined; }
  if (m[1] === 'true') { return true; }
  if (m[1] === 'false') { return false; }
  const prefix = /^inferFromPrefix\((["']?)([^"')]*)\1\)$/.exec(m[1]);
  return prefix ? !key.startsWith(prefix[2]) : 'dynamic';
}

/**
 * Parse one env-spec file for the sensitivity lint. Static on purpose: running
 * varlock would resolve, and could print, the very values this guards. Reads
 * the header (the leading comment block, closed by a `# ---` divider or a blank
 * line), the decorator comments directly above each item, and a post-value
 * comment on the item line. A commented-out assignment is not an item.
 */
export function parseSchemaForSensitivity(text: string): ParsedSchemaFile {
  const lines = normalizeEol(text).split('\n');

  let headerEnd = 0;
  if (lines.length > 0 && COMMENT.test(lines[0])) {
    let i = 0;
    while (i < lines.length && COMMENT.test(lines[i]) && !DIVIDER.test(lines[i])) { i++; }
    if (i < lines.length && (DIVIDER.test(lines[i]) || lines[i].trim() === '')) { headerEnd = i + 1; }
  }
  const header = lines.slice(0, headerEnd).map(decoratorText).filter((d): d is string => d !== null).join(' ');
  const imports = [...header.matchAll(/@import\(\s*([^,)\s]+)/g)].map(m => m[1].replace(/^["']|["']$/g, ''));

  const items: SchemaItemDef[] = [];
  let block: string[] = [];
  for (let i = headerEnd; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || DIVIDER.test(line)) { block = []; continue; }
    if (COMMENT.test(line)) {
      const dec = decoratorText(line);
      if (dec !== null) { block.push(dec); }
      continue;
    }
    const m = ITEM.exec(line);
    if (m) {
      const post = postValueComment(m[2]);
      const decorators = [...block, post ? decoratorText(post) : null].filter((d): d is string => d !== null).join(' ');
      items.push({ key: m[1], line: i + 1, explicit: sensitivityIn(decorators), fileDefault: defaultFor(header, m[1]) });
    }
    block = [];
  }
  return { items, imports };
}

/**
 * The env schema files varlock loads from `root`: `.env.schema`, everything its
 * `@import` chain reaches, plus the core and provider halves when present (so a
 * broken import still gets them linted). Root-relative, deduplicated.
 */
export function schemaFilesIn(root: string): string[] {
  const seen = new Set<string>();
  const queue = [PROJECT_SCHEMA_FILE, CORE_SCHEMA_FILE, PROVIDER_SCHEMA_FILE];
  while (queue.length > 0) {
    const rel = path.normalize(queue.shift() as string);
    const abs = path.join(root, rel);
    if (seen.has(rel) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) { continue; }
    seen.add(rel);
    for (const imp of parseSchemaForSensitivity(fs.readFileSync(abs, 'utf8')).imports) {
      queue.push(path.relative(root, path.resolve(path.dirname(abs), imp)));
    }
  }
  return [...seen];
}

/**
 * Every secret-looking key, across all `files`, that `varlock load --agent`
 * could print in clear. Independent of varlock's def precedence: PASS needs no
 * declaration calling the key non-sensitive AND (one declaration marking it
 * `@sensitive`, OR every declaration's file defaulting it to sensitive).
 * Names only; a schema value is never read into the result.
 */
export function lintSchemaSensitivity(files: ReadonlyArray<{ file: string, text: string }>): SensitivityViolation[] {
  const defs = new Map<string, Array<SchemaItemDef & { file: string }>>();
  for (const { file, text } of files) {
    for (const item of parseSchemaForSensitivity(text).items) {
      if (!isSecretLookingName(item.key)) { continue; }
      defs.set(item.key, [...(defs.get(item.key) ?? []), { ...item, file }]);
    }
  }

  const violations: SensitivityViolation[] = [];
  for (const [key, list] of defs) {
    const optOut = list.find(d => d.explicit === false);
    if (optOut) {
      violations.push({ key, file: optOut.file, line: optOut.line, reason: 'secret-looking name marked non-sensitive (@public / @sensitive=false)' });
      continue;
    }
    const dynamic = list.find(d => d.explicit === 'dynamic');
    if (dynamic) {
      violations.push({ key, file: dynamic.file, line: dynamic.line, reason: '@sensitive must be a literal (bare, =true or ={...}), not an expression' });
      continue;
    }
    if (list.some(d => d.explicit === true)) { continue; }
    if (list.every(d => d.fileDefault === true)) { continue; }
    const first = list[0];
    violations.push({ key, file: first.file, line: first.line, reason: 'secret-looking name without @sensitive' });
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export interface SensitivityCheck {
  ok: boolean
  files: string[]
  violations: SensitivityViolation[]
}

/** The sensitivity lint over the schema files `root` actually loads. */
export function checkSchemaSensitivity(root: string): SensitivityCheck {
  const files = schemaFilesIn(root);
  const violations = lintSchemaSensitivity(files.map(file => ({ file, text: fs.readFileSync(path.join(root, file), 'utf8') })));
  return { ok: violations.length === 0, files, violations };
}

// ----------------------------------------------------------------------------
// Loading the committed pair through varlock
// ----------------------------------------------------------------------------

/** True when the pinned devDependency is installed (never let `bunx` download one). */
export function varlockInstalled(root: string): boolean {
  return fs.existsSync(path.join(root, 'node_modules', 'varlock', 'package.json'));
}

/** A value that satisfies an env-spec type without being anything real. */
export function placeholderFor(type: string | undefined, sensitive: boolean): string {
  const t = (type ?? 'string').trim();
  const enumMatch = /^enum\((.*)\)$/.exec(t);
  if (enumMatch) { return enumMatch[1].split(',')[0].trim(); }
  if (t.startsWith('email')) { return 'placeholder@example.test'; }
  if (t.startsWith('url')) { return 'https://placeholder.example.test'; }
  if (t.startsWith('port')) { return '5432'; }
  if (t.startsWith('boolean')) { return 'true'; }
  if (t.startsWith('number')) { return '1'; }
  // Long enough that varlock's "value is very short, is it really sensitive?"
  // warning never fires on a sensitive placeholder.
  return sensitive ? 'placeholder-not-a-secret-0000000000' : 'placeholder-value';
}

/**
 * A typed placeholder for EVERY declared item. Nothing is required, so an empty
 * `.env.local` would load too; filling each item proves its `@type` accepts a
 * well-formed value, which an empty load never exercises.
 */
export function placeholderEnv(manifest: readonly VarSpec[] = VAR_MANIFEST): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of envFileSpecs(manifest)) { out[spec.name] = placeholderFor(spec.schema?.type, spec.secret); }
  for (const item of UNROUTED_VARS) { out[item.name] = placeholderFor(item.type, item.sensitive === true); }
  return out;
}

export interface PairLoadResult {
  ok: boolean
  exitCode: number | null
  /** `label` of every source varlock reports, in load order. Never values. */
  sources: Array<{ type: string, label: string }>
  /** Item NAMES the load resolved (values are discarded before this returns). */
  resolvedKeys: string[]
  /** Redacted diagnostic lines from varlock, last few only. */
  stderrTail: string[]
  /** Why `ok` is false, when it is. */
  reason?: string
}

/** A copy of `env` with every schema-declared and deprecated key removed. */
function scrubbedEnv(): NodeJS.ProcessEnv {
  // Spread, never a cast: `cli/**` must compile under a host whose
  // `ProcessEnv` requires `NODE_ENV` (cli/updater-host-types.test.ts).
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of declaredSchemaKeys()) { delete env[name]; }
  for (const dep of DEPRECATED_VARS) { delete env[dep.name]; }
  return env;
}

/**
 * Copy the committed pair into a scratch directory, give it a placeholder
 * `.env.local`, and load it with the pinned varlock (resolved from
 * `varlockRoot`'s node_modules, the repo root unless a test says otherwise). This is the gate the
 * layout relies on (see the header): it proves the `@import` resolves, that
 * the core file is read as a SCHEMA source, and that every core item validates.
 *
 * The child runs with every schema key scrubbed from its environment, so a
 * developer's exported variable cannot turn the gate red. Values never leave
 * this function: the parsed blob is reduced to names before it is returned.
 */
export function loadSchemaPairThroughVarlock(root: string, varlockRoot: string = root): PairLoadResult {
  const core = path.join(root, CORE_SCHEMA_FILE);
  const project = path.join(root, PROJECT_SCHEMA_FILE);
  for (const file of [core, project]) {
    if (!fs.existsSync(file)) {
      return { ok: false, exitCode: null, sources: [], resolvedKeys: [], stderrTail: [], reason: `${path.basename(file)} is missing` };
    }
  }
  if (!varlockInstalled(varlockRoot)) {
    return { ok: false, exitCode: null, sources: [], resolvedKeys: [], stderrTail: [], reason: 'varlock is not installed (bun install)' };
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-pair-'));
  try {
    fs.copyFileSync(core, path.join(scratch, CORE_SCHEMA_FILE));
    fs.copyFileSync(project, path.join(scratch, PROJECT_SCHEMA_FILE));
    const values = placeholderEnv();
    fs.writeFileSync(
      path.join(scratch, '.env.local'),
      `${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`,
      'utf8',
    );

    // `bunx` resolves the project's pinned devDependency from the CWD's
    // node_modules; the scratch dir has none, so run at the repo root and pass
    // the scratch dir as the load path.
    const run = spawnSync('bunx', ['varlock', 'load', '--format', 'json-full', '--compact', '--path', `${scratch}${path.sep}`], {
      cwd: varlockRoot,
      env: scrubbedEnv(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderrTail = (run.stderr ?? '').split(/\r?\n/).filter(l => l.trim() !== '').slice(-12);
    if (run.error) {
      return { ok: false, exitCode: null, sources: [], resolvedKeys: [], stderrTail, reason: `could not run bunx varlock: ${run.error.message}` };
    }
    if (run.status !== 0) {
      return { ok: false, exitCode: run.status, sources: [], resolvedKeys: [], stderrTail, reason: `varlock load exited ${run.status}` };
    }

    let parsed: { sources?: Array<{ type?: string, label?: string }>, config?: Record<string, unknown> };
    try {
      parsed = JSON.parse(run.stdout) as typeof parsed;
    }
    catch {
      return { ok: false, exitCode: run.status, sources: [], resolvedKeys: [], stderrTail, reason: 'varlock load printed no JSON' };
    }
    // Labels come back as paths relative to the CWD; the basename is the only
    // part a reader needs, and the only part that is stable across machines.
    const sources = (parsed.sources ?? [])
      .filter(s => s.type !== 'container')
      .map(s => ({ type: String(s.type ?? ''), label: path.basename(String(s.label ?? '')) }));
    const resolvedKeys = Object.keys(parsed.config ?? {}).sort();

    const coreAsSchema = sources.some(s => s.type === 'schema' && s.label.endsWith(CORE_SCHEMA_FILE));
    if (!coreAsSchema) {
      return { ok: false, exitCode: run.status, sources, resolvedKeys, stderrTail, reason: `${CORE_SCHEMA_FILE} was not loaded as a schema source (import rule changed?)` };
    }
    const missing = declaredSchemaKeys().filter(k => !resolvedKeys.includes(k));
    if (missing.length > 0) {
      return { ok: false, exitCode: run.status, sources, resolvedKeys, stderrTail, reason: `core items not in the resolved graph: ${missing.join(', ')}` };
    }
    return { ok: true, exitCode: run.status, sources, resolvedKeys, stderrTail };
  }
  finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// ----------------------------------------------------------------------------
// Precedence: an inherited process value that shadows .env / .env.local
// ----------------------------------------------------------------------------

/** One variable whose inherited process value differs from the env files. Never carries a value. */
export interface InheritedOverride {
  name: string
  /** Sensitive per the schema pair (or the manifest when there is no schema). */
  sensitive: boolean
  processLength: number
  fileLength: number
}

export interface InheritedOverrideReport {
  /** `skipped`: no `.env` / `.env.local` at all. `varlock`: candidates from `overrideKeys`. `files`: varlock unavailable, candidates = every file key. */
  status: 'skipped' | 'varlock' | 'files'
  findings: InheritedOverride[]
}

/**
 * The keys whose value in `env` would WIN over a different, non-empty value in
 * `.env` / `.env.local` under `varlock run`.
 *
 * Candidates come from `varlock load --format json-full --agent`'s
 * `overrideKeys` (the keys varlock itself takes from the process; measured:
 * every key present in the process, equal or not). The blob's values are
 * discarded unread; each candidate is compared HERE against the env files,
 * parsed in-process, and the finding keeps lengths only. When varlock cannot
 * run (not installed, schema absent, a load that fails validation) every key
 * of the env files is a candidate, which is the same comparison without the
 * schema's key list.
 *
 * An EMPTY file value shadows nothing (the process is then the only source,
 * which is legitimate), and an equal value is not drift.
 */
export function inheritedOverrides(root: string, env: Record<string, string | undefined> = process.env): InheritedOverrideReport {
  const filePairs = new Map<string, string>();
  let anyFile = false;
  for (const file of ENV_VALUE_FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) { continue; }
    anyFile = true;
    for (const [k, v] of parseDotEnvPairs(full)) { filePairs.set(k, v); }
  }
  if (!anyFile) { return { status: 'skipped', findings: [] }; }

  let candidates: string[] | null = null;
  const schemaPresent = fs.existsSync(path.join(root, PROJECT_SCHEMA_FILE));
  if (schemaPresent && varlockInstalled(root)) {
    const inFile = fs.existsSync(path.join(root, '.env')) ? deprecatedEnvKeysIn(fs.readFileSync(path.join(root, '.env'), 'utf8')) : [];
    // Built from a `ProcessEnv` spread, never a cast: `cli/**` must compile
    // under a host whose `ProcessEnv` requires `NODE_ENV`
    // (cli/updater-host-types.test.ts). It holds `env`'s keys plus what the
    // spawn itself needs to find and run `bunx`.
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    const keep = new Set(['PATH', 'HOME', 'TMPDIR', 'SystemRoot']);
    for (const key of Object.keys(childEnv)) {
      if (!(key in env) && !keep.has(key)) { delete childEnv[key]; }
    }
    Object.assign(childEnv, neutralizeDeprecatedKeys({ ...env }, inFile));
    const run = spawnSync('bunx', ['varlock', 'load', '--format', 'json-full', '--agent', '--compact'], {
      cwd: root,
      env: childEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!run.error && run.status === 0) {
      try {
        const blob = JSON.parse(run.stdout) as { overrideKeys?: unknown };
        if (Array.isArray(blob.overrideKeys)) { candidates = blob.overrideKeys.map(String); }
      }
      catch {
        candidates = null;
      }
    }
  }
  const status: InheritedOverrideReport['status'] = candidates === null ? 'files' : 'varlock';
  const keys = candidates ?? [...filePairs.keys()];

  const schema = schemaClassification(root);
  const sensitive = schema?.sensitive ?? new Set(VAR_MANIFEST.filter(s => s.secret).map(s => s.name));
  const declared = schema?.declared ?? new Set(VAR_MANIFEST.map(s => s.name));
  const findings: InheritedOverride[] = [];
  for (const name of keys) {
    const fileValue = filePairs.get(name);
    if (fileValue === undefined || fileValue === '') { continue; }
    const procValue = env[name];
    if (procValue === undefined || procValue === fileValue) { continue; }
    // varlock treats an undeclared key as sensitive; so does this report.
    findings.push({ name, sensitive: sensitive.has(name) || !declared.has(name), processLength: procValue.length, fileLength: fileValue.length });
  }
  findings.sort((a, b) => a.name.localeCompare(b.name));
  return { status, findings };
}
