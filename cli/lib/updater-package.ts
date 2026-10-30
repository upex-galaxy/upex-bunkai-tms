/**
 * @fileoverview Append-only package.json sync handler.
 *
 * Mirror of `updater-ignore.ts` but JSON-aware. Surfaces upstream-only keys
 * inside the configured sections (default: `scripts`, `devDependencies`) and
 * appends them at the END of each section while preserving the user's existing
 * key order. Same-key/different-value drift is reported as FYI and NEVER
 * overwritten. Top-level keys outside the configured sections (`name`,
 * `version`, `engines`, etc.) stay byte-identical. A `lint-staged` value (a
 * command or an array of commands) travels as JSON text (`getSection`).
 *
 * Contract:
 *  - Compare upstream `package.json` against local section-by-section.
 *  - Surface upstream-only keys as `upstreamOnlyKeys` (safe append).
 *  - Surface same-key/different-value as `localOverrideKeys` (FYI only).
 *  - State tracks `appliedKeys` per (file, section) so an applied key never
 *    re-surfaces on subsequent runs (mirror of `appendedLines`).
 *
 * Parse / write rules:
 *  - Local indent detected from the existing file (defaults to 2 spaces).
 *  - Trailing-newline presence preserved.
 *  - CRLF / LF detected and normalised to the file's existing style.
 *  - Within each section, user's existing key order preserved; new keys
 *    appended at end, sorted alphabetically among themselves.
 *  - Sections not listed in the spec are passed through untouched.
 */

import type {
  PackageJsonDelta,
  PackageJsonSectionDelta,
  PackageJsonSpec,
  SyncStateV7,
} from './updater-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { withoutHuskyStep } from './hook-manager';

// ============================================================================
// PARSE HELPERS
// ============================================================================

export interface ParsedPackageJson {
  data: Record<string, unknown>
  indent: number
  hasTrailingNewline: boolean
  usesCrlf: boolean
}

/**
 * Detect indent from raw JSON text. Returns the number of spaces, or -1 when
 * the file uses tabs. Defaults to 2 when no indented line is found.
 * `stringifyPackageJson` interprets -1 as '\t'.
 */
export function detectIndent(raw: string): number {
  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.length === 0) { continue; }
    const match = line.match(/^( +|\t)/);
    if (!match) { continue; }
    if (match[1].startsWith('\t')) { return -1; }
    return match[1].length;
  }
  return 2;
}

/**
 * Parse package.json and capture formatting metadata (indent, EOL, trailing
 * newline) so the rewrite can preserve it byte-for-byte outside the mutated
 * sections. Throws on parse failure — caller MUST catch.
 */
export function parsePackageJson(filePath: string): ParsedPackageJson {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const usesCrlf = /\r\n/.test(raw);
  const normalised = raw.replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalised.endsWith('\n');
  const indent = detectIndent(normalised);
  const data = JSON.parse(normalised) as Record<string, unknown>;
  return { data, indent, hasTrailingNewline, usesCrlf };
}

/**
 * Stringify with the formatting metadata captured at parse time.
 */
export function stringifyPackageJson(parsed: ParsedPackageJson): string {
  const indentArg: string | number = parsed.indent === -1 ? '\t' : parsed.indent;
  let out = JSON.stringify(parsed.data, null, indentArg);
  if (parsed.hasTrailingNewline) { out += '\n'; }
  if (parsed.usesCrlf) { out = out.replace(/\n/g, '\r\n'); }
  return out;
}

/**
 * Sections whose values are not plain strings. A `lint-staged` glob maps to a
 * command string OR an array of commands, so every value of such a section
 * travels through the delta, the state (`keptKeys`) and the report as its
 * canonical JSON text, and is decoded back only when written to the file.
 * Encoding the whole section (strings included) keeps the round trip
 * unambiguous: a raw command that happens to start with `[` is never mistaken
 * for an array.
 */
const JSON_VALUED_SECTIONS = new Set<string>(['lint-staged']);

/**
 * The value written to the file for a delta value of `section`: decoded JSON
 * for a JSON-valued section, the string itself otherwise.
 */
export function decodeSectionValue(section: string, value: string): unknown {
  return JSON_VALUED_SECTIONS.has(section) ? JSON.parse(value) as unknown : value;
}

/**
 * Extract a string-keyed object section. Returns empty object when section is
 * missing or not an object. In a plain section non-string values are skipped
 * (scripts and dependency maps are string maps); in a JSON-valued section
 * (`lint-staged`) every value is kept as its canonical JSON text, arrays
 * included, so upstream changes there reach every consumer.
 */
export function getSection(data: Record<string, unknown>, section: string): Record<string, string> {
  const raw = data[section];
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return {};
  }
  const jsonValued = JSON_VALUED_SECTIONS.has(section);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (jsonValued) { out[k] = JSON.stringify(v); }
    else if (typeof v === 'string') { out[k] = v; }
  }
  return out;
}

// ============================================================================
// DETECT
// ============================================================================

/**
 * Diff a local package.json against its upstream counterpart for every
 * configured section.
 *
 * Returns empty deltas (all four buckets empty) when the upstream or local
 * file is missing or unparseable. State's `appliedKeys` is subtracted from
 * `upstreamOnlyKeys` so previously-applied keys never re-surface.
 */
export function detectPackageJsonDelta(
  spec: PackageJsonSpec,
  repoRoot: string,
  templateDir: string,
  state: Pick<SyncStateV7, 'packageJsonSync'> | null,
): PackageJsonDelta {
  const upstreamPath = path.join(templateDir, spec.path);
  const localPath = path.join(repoRoot, spec.path);

  const emptySections: Record<string, PackageJsonSectionDelta> = {};
  for (const section of spec.sections) {
    emptySections[section] = {
      upstreamOnlyKeys: {},
      localOverrideKeys: {},
      localOnlyKeys: [],
      alreadyApplied: state?.packageJsonSync?.[spec.path]?.[section]?.appliedKeys ?? [],
    };
  }

  if (!fs.existsSync(upstreamPath) || !fs.existsSync(localPath)) {
    return { file: spec.path, sections: emptySections };
  }

  let upstream: ParsedPackageJson;
  let local: ParsedPackageJson;
  try {
    upstream = parsePackageJson(upstreamPath);
    local = parsePackageJson(localPath);
  }
  catch {
    return { file: spec.path, sections: emptySections };
  }

  const sections: Record<string, PackageJsonSectionDelta> = {};
  for (const section of spec.sections) {
    const upstreamMap = getSection(upstream.data, section);
    const localMap = getSection(local.data, section);
    const appliedKeys = state?.packageJsonSync?.[spec.path]?.[section]?.appliedKeys ?? [];
    const appliedSet = new Set(appliedKeys);
    const keptKeys = state?.packageJsonSync?.[spec.path]?.[section]?.keptKeys ?? {};

    const upstreamOnlyKeys: Record<string, string> = {};
    const localOverrideKeys: Record<string, { localValue: string, upstreamValue: string }> = {};
    const localOnlyKeys: string[] = [];

    for (const [key, upstreamValue] of Object.entries(upstreamMap)) {
      if (!(key in localMap)) {
        if (!appliedSet.has(key)) {
          upstreamOnlyKeys[key] = upstreamValue;
        }
        continue;
      }
      const localValue = localMap[key];
      if (localValue !== upstreamValue) {
        // Suppress keys the user already chose to keep ('mine') against this
        // exact upstream value. If upstream changed since, re-surface it.
        if (keptKeys[key] === upstreamValue) { continue; }
        localOverrideKeys[key] = { localValue, upstreamValue };
      }
    }

    for (const key of Object.keys(localMap)) {
      if (!(key in upstreamMap)) {
        localOnlyKeys.push(key);
      }
    }

    sections[section] = {
      upstreamOnlyKeys,
      localOverrideKeys,
      localOnlyKeys,
      alreadyApplied: [...appliedSet],
    };
  }

  return { file: spec.path, sections };
}

// ============================================================================
// APPLY
// ============================================================================

/**
 * Append selected keys to the local package.json under the configured sections.
 *
 * Caller passes the per-section values map (keyed by section name → { key:
 * upstreamValue }). Optionally, caller can restrict which keys to write via
 * `keysBySection` — when omitted, ALL keys present in `valuesBySection[section]`
 * are written.
 *
 * Ordering contract:
 *   - User's existing keys in each section keep their original order.
 *   - New keys appended AT THE END of the section, sorted alphabetically among
 *     themselves only (no global re-sort).
 *   - Sections absent in local are created at the end of the JSON object.
 *
 * Idempotency:
 *   - Keys already present locally (any value) are SKIPPED — never overwritten.
 *     Drift is FYI only; caller already filtered via `detectPackageJsonDelta`.
 *
 * Never removes local content. Never modifies sections outside `spec.sections`.
 *
 * Returns the keys actually written per section. Empty result means no fs
 * write occurred.
 */
export function applyPackageJsonAppend(
  spec: PackageJsonSpec,
  valuesBySection: Record<string, Record<string, string>>,
  repoRoot: string,
  keysBySection?: Record<string, string[]>,
): Record<string, string[]> {
  const filePath = path.join(repoRoot, spec.path);
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let parsed: ParsedPackageJson;
  try {
    parsed = parsePackageJson(filePath);
  }
  catch {
    return {};
  }

  const written: Record<string, string[]> = {};
  let changed = false;

  for (const section of spec.sections) {
    const values = valuesBySection[section] ?? {};
    const explicitKeys = keysBySection?.[section];
    const keys = (explicitKeys ?? Object.keys(values))
      .filter(k => k in values)
      .slice()
      .sort();

    if (keys.length === 0) { continue; }

    const existingSection = parsed.data[section];
    const localMap = (existingSection !== null && typeof existingSection === 'object')
      ? { ...(existingSection as Record<string, unknown>) }
      : {};

    const writtenForSection: string[] = [];
    for (const key of keys) {
      if (key in localMap) { continue; } // never overwrite (drift is FYI only)
      localMap[key] = decodeSectionValue(section, values[key]);
      writtenForSection.push(key);
    }

    if (writtenForSection.length > 0) {
      parsed.data[section] = localMap;
      written[section] = writtenForSection;
      changed = true;
    }
  }

  if (!changed) {
    return {};
  }

  fs.writeFileSync(filePath, stringifyPackageJson(parsed));
  return written;
}

/**
 * Overwrite EXISTING keys in the local package.json with upstream values.
 *
 * Counterpart to `applyPackageJsonAppend` — that one only adds NEW keys and
 * never touches existing ones. This one is the explicit "use upstream" ('theirs')
 * resolution for diverged keys: it replaces the local value of a key that
 * already exists. Only keys present in `overridesBySection[section]` AND already
 * present locally are written (a missing local key is ignored — append handles
 * those). Key order is preserved (in-place replacement, no re-sort).
 *
 * Never adds new sections. Never removes keys. Preserves file formatting.
 *
 * Returns the keys actually overwritten per section. Empty result → no write.
 */
export function applyPackageJsonOverride(
  spec: PackageJsonSpec,
  overridesBySection: Record<string, Record<string, string>>,
  repoRoot: string,
): Record<string, string[]> {
  const filePath = path.join(repoRoot, spec.path);
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let parsed: ParsedPackageJson;
  try {
    parsed = parsePackageJson(filePath);
  }
  catch {
    return {};
  }

  const written: Record<string, string[]> = {};
  let changed = false;

  for (const section of spec.sections) {
    const overrides = overridesBySection[section] ?? {};
    const keys = Object.keys(overrides);
    if (keys.length === 0) { continue; }

    const existingSection = parsed.data[section];
    if (existingSection === null || typeof existingSection !== 'object') { continue; }
    const localMap = existingSection as Record<string, unknown>;

    const writtenForSection: string[] = [];
    for (const key of keys) {
      if (!(key in localMap)) { continue; } // append handles brand-new keys
      localMap[key] = decodeSectionValue(section, overrides[key]);
      writtenForSection.push(key);
    }

    if (writtenForSection.length > 0) {
      written[section] = writtenForSection;
      changed = true;
    }
  }

  if (!changed) {
    return {};
  }

  fs.writeFileSync(filePath, stringifyPackageJson(parsed));
  return written;
}

// ============================================================================
// ADOPT (`--adopt` first run on an existing app)
// ============================================================================

/** Every section an app may already declare a package in. */
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

export interface AdoptPackageJsonFold {
  delta: PackageJsonDelta
  /**
   * Upstream keys this run must remember as handled in their UPSTREAM section
   * (`appliedKeys`) although nothing is written there: a package the app
   * already declares in another section, or a `dependencies` key redirected
   * to `devDependencies`. Without them the next plain `bun sync` would add
   * the same package to a second section.
   */
  satisfied: Record<string, string[]>
}

/**
 * Reshape a package.json delta for an app adopting the boilerplate:
 *
 *  - a package the app already declares in ANY dependency section is never
 *    added to another one (no duplicate, no version the app did not choose);
 *  - the tooling's runtime packages (`dependencies` upstream) go to the app's
 *    `devDependencies`: they run the agentic tooling, not the app, and must
 *    not ship in its production install.
 *
 *  - with `foreignHookManager` (the app's hooks run on lefthook,
 *    simple-git-hooks, ...: `./hook-manager.ts`), an upstream `prepare` the
 *    app lacks arrives WITHOUT its `husky` step: running `husky` rewrites
 *    `core.hooksPath` and switches the app's own hooks off.
 *
 * Same-key drift (`localOverrideKeys`) is left as is: the caller keeps the
 * app's value. Pure: the input delta is not mutated.
 */
export function adoptPackageJsonDelta(delta: PackageJsonDelta, local: Record<string, unknown>, opts: { foreignHookManager?: boolean } = {}): AdoptPackageJsonFold {
  const declared = new Set<string>();
  for (const section of DEPENDENCY_SECTIONS) {
    for (const key of Object.keys(getSection(local, section))) { declared.add(key); }
  }

  const sections: Record<string, PackageJsonSectionDelta> = {};
  for (const [name, sec] of Object.entries(delta.sections)) {
    sections[name] = { ...sec, upstreamOnlyKeys: { ...sec.upstreamOnlyKeys } };
  }
  const satisfied: Record<string, string[]> = {};
  const remember = (section: string, key: string): void => { (satisfied[section] ??= []).push(key); };

  for (const section of DEPENDENCY_SECTIONS) {
    const sec = sections[section];
    if (!sec) { continue; }
    for (const key of Object.keys(sec.upstreamOnlyKeys)) {
      if (!declared.has(key)) { continue; }
      delete sec.upstreamOnlyKeys[key];
      remember(section, key);
    }
  }

  const deps = sections.dependencies;
  const dev = sections.devDependencies;
  if (deps && dev) {
    for (const [key, value] of Object.entries(deps.upstreamOnlyKeys)) {
      delete deps.upstreamOnlyKeys[key];
      remember('dependencies', key);
      if (!(key in dev.upstreamOnlyKeys)) { dev.upstreamOnlyKeys[key] = value; }
    }
  }

  // The app's formatting is its own (the adopted gates skip format:check for
  // the same reason): the adoption never adds a lint-staged config, and the
  // keys are remembered so a later plain run does not add them either.
  const lintStaged = sections['lint-staged'];
  if (lintStaged) {
    for (const key of Object.keys(lintStaged.upstreamOnlyKeys)) {
      delete lintStaged.upstreamOnlyKeys[key];
      remember('lint-staged', key);
    }
  }

  const scripts = sections.scripts;
  const prepare = scripts?.upstreamOnlyKeys.prepare;
  if (opts.foreignHookManager === true && scripts && prepare !== undefined) {
    const kept = withoutHuskyStep(prepare);
    if (kept === null) {
      delete scripts.upstreamOnlyKeys.prepare;
      remember('scripts', 'prepare');
    }
    else { scripts.upstreamOnlyKeys.prepare = kept; }
  }

  return { delta: { file: delta.file, sections }, satisfied };
}
