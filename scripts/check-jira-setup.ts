#!/usr/bin/env bun
/**
 * check-jira-setup.ts — validates that the user's Jira workspace contains the
 * custom fields the methodology requires.
 *
 * Two inputs:
 *   - `.agents/jira-required.yaml` — declarative manifest of required /
 *     optional / unmapped slugs. Owned by the methodology, committed to the
 *     repo. Entries declare expected `name`, `type`, and (for option-type
 *     fields) the option slugs.
 *   - `.agents/jira-fields.json` — auto-generated catalog of the user's actual Jira
 *     custom fields. Produced by `bun run jira:sync-fields`.
 *
 * For each `required` slug, the script verifies:
 *   1. The slug exists in `jira-fields.json`.     Missing => ❌ ERROR.
 *   2. The `type` matches.                        Mismatch => ⚠️ WARNING.
 *   3. (option fields) every declared option key exists in jira-fields.json.
 *                                                 Missing options => ⚠️ WARNING.
 *
 * `optional` slugs follow the same checks but missing => 💡 INFO (no error).
 * `unmapped` slugs are reported as informational lines pointing to the
 * manifest documentation.
 *
 * Exit code: 0 if all required present and correct, 1 if any required missing
 * or any required type mismatched. Warnings on optional/unmapped never affect
 * the exit code.
 *
 * Flags:
 *   --json      Emit a machine-readable summary instead of human-readable.
 *   --verbose   Show ✅ entries individually (default suppresses them).
 *   --live      Additionally compare the CACHED `.agents/jira-workflows.json`
 *               against live Jira (one read-only, non-admin REST call). Catches
 *               the staleness class every offline check is blind to: the cache
 *               was correct when it was written and Jira moved underneath it.
 *               Warnings only — never changes the exit code.
 *   --project <KEY>
 *               Project key for --live (flag > JIRA_PROJECT_KEY > project.yaml).
 *   --help      Show usage.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { resolveAtlassianInstance } from '../cli/lib/atlassian-instance';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RequiredEntry {
  name?: string
  type: string
  options?: string[]
  description?: string
  used_by?: string[]
}

interface UnmappedEntry {
  description?: string
  used_by?: string[]
}

interface LinkTypeEntry {
  name?: string
  outward?: string
  inward?: string
  fallback?: string | null
  description?: string
  used_by?: string[]
}

interface StatusEntry {
  description?: string
  fallback_literal?: string
  work_type_slug?: string | null
  used_by?: string[]
}

interface Manifest {
  required: Record<string, RequiredEntry>
  optional: Record<string, RequiredEntry>
  unmapped: Record<string, UnmappedEntry>
  statuses: Record<string, StatusEntry>
  linkTypesRequired: Record<string, LinkTypeEntry>
  linkTypesOptional: Record<string, LinkTypeEntry>
}

interface CatalogStatus {
  id: string | null
  name: string | null
  category: string | null
}

interface CatalogTransition {
  id: string | null
  name: string | null
  from_status_id: string | null
  to_status_id: string | null
  from_canonical: string | null
  to_canonical: string | null
}

interface CatalogWorkType {
  jira_issue_type: { id: string, name: string } | null
  workflow_scheme: { id: string, name: string } | null
  workflow: { id: string | null, name: string } | null
  statuses: Record<string, CatalogStatus>
  transitions: Record<string, CatalogTransition>
}

type WorkflowsCatalog = Record<string, CatalogWorkType>;

/** A single required status declared in the manifest under a work_type. */
interface ManifestRequiredStatus {
  slug: string
  description?: string
}

/** A single required transition declared in the manifest under a work_type. */
interface ManifestRequiredTransition {
  slug: string
  from?: string
  to?: string
  description?: string
}

/** One work_type entry parsed out of `.agents/jira-required.yaml`. */
interface ManifestWorkType {
  slug: string
  jiraIssueType: string
  description?: string
  requiredStatuses: ManifestRequiredStatus[]
  requiredTransitions: ManifestRequiredTransition[]
}

interface JiraFieldEntry {
  id: string
  type?: string
  name?: string
  options?: Record<string, string>
  system?: boolean
  provider?: string
}

type Severity = 'ok' | 'missing' | 'mismatch' | 'info';

interface CheckResult {
  slug: string
  scope: 'required' | 'optional' | 'unmapped'
  severity: Severity
  expected: RequiredEntry | UnmappedEntry
  found?: JiraFieldEntry
  /** Human-readable reasons (one per problem). Empty for `ok`. */
  notes: string[]
  /** For option-type required entries: which option keys are missing. */
  missingOptions: string[]
}

// -----------------------------------------------------------------------------
// Loaders
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const MANIFEST_PATH = join(REPO_ROOT, '.agents', 'jira-required.yaml');
const CATALOG_PATH = join(REPO_ROOT, '.agents', 'jira-fields.json');
const WORKFLOWS_PATH = join(REPO_ROOT, '.agents', 'jira-workflows.json');
const LINK_TYPES_PATH = join(REPO_ROOT, '.agents', 'jira-link-types.json');
const PROJECT_YAML_PATH = join(REPO_ROOT, '.agents', 'project.yaml');

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`FATAL: ${relative(REPO_ROOT, MANIFEST_PATH)} does not exist.`);
    process.exit(1);
  }
  const text = readFileSync(MANIFEST_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${relative(REPO_ROOT, MANIFEST_PATH)}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('FATAL: manifest must be a YAML mapping at the top level.');
    process.exit(1);
  }
  const root = parsed as Record<string, unknown>;
  const required = (root.required ?? {}) as Record<string, RequiredEntry>;
  const optional = (root.optional ?? {}) as Record<string, RequiredEntry>;
  const unmapped = (root.unmapped ?? {}) as Record<string, UnmappedEntry>;
  const statuses = (root.statuses ?? {}) as Record<string, StatusEntry>;
  const linkTypesRaw = (root.link_types ?? {}) as Record<string, unknown>;
  const linkTypesRequired = (linkTypesRaw.required ?? {}) as Record<string, LinkTypeEntry>;
  const linkTypesOptional = (linkTypesRaw.optional ?? {}) as Record<string, LinkTypeEntry>;
  return { required, optional, unmapped, statuses, linkTypesRequired, linkTypesOptional };
}

function loadCatalog(): Record<string, JiraFieldEntry> {
  if (!existsSync(CATALOG_PATH)) {
    console.error(`FATAL: ${relative(REPO_ROOT, CATALOG_PATH)} does not exist.`);
    console.error('Run `bun run jira:sync-fields` first to populate the catalog.');
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  }
  catch (err) {
    console.error(`FATAL: cannot parse ${relative(REPO_ROOT, CATALOG_PATH)}: ${(err as Error).message}`);
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`FATAL: ${relative(REPO_ROOT, CATALOG_PATH)} must be a JSON object.`);
    process.exit(1);
  }
  return parsed as Record<string, JiraFieldEntry>;
}

/**
 * Split a `jira_issue_type` declaration into ordered alternatives.
 *
 * `Sub-task | Task | Subtarea` -> ['Sub-task', 'Task', 'Subtarea']. A plain single
 * name returns a one-element list, so every existing declaration is unchanged.
 */
function issueTypeNameCandidates(declared: string): string[] {
  return declared.split('|').map(name => name.trim()).filter(Boolean);
}

/**
 * Walk `.agents/jira-required.yaml` and pull out the `work_types:` section.
 *
 * The YAML grammar this script accepts mirrors what's already in the
 * boilerplate: 2-space-indented work_type slugs, 4-space-indented sub-keys
 * (`jira_issue_type`, `description`, `required_statuses`, `required_transitions`,
 * `used_by`), and 6-space-indented entries inside the two `required_*` maps
 * using the inline-flow form `{ from: <slug>, to: <slug>, description: "..." }`.
 *
 * Defensive about whitespace and quoting; ignores lines outside the
 * `work_types:` block. Returns `[]` if the section is absent or empty so the
 * caller can short-circuit.
 *
 * Copied from `scripts/sync-jira-workflows.ts` rather than imported: that module
 * calls `main()` on load, so importing it would run a Jira sync.
 */
function loadManifestWorkTypes(): ManifestWorkType[] {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`FATAL: ${relative(REPO_ROOT, MANIFEST_PATH)} does not exist.`);
    process.exit(1);
  }
  const text = readFileSync(MANIFEST_PATH, 'utf8');
  const lines = text.split(/\r?\n/);

  const workTypes: ManifestWorkType[] = [];
  let inWorkTypes = false;
  let currentWorkType: ManifestWorkType | null = null;
  let currentMap: 'required_statuses' | 'required_transitions' | null = null;

  const sectionRe = /^work_types:\s*$/;
  const topLevelRe = /^[a-z_][\w-]*:\s*(?:#.*)?$/;
  const workTypeHeaderRe = /^ {2}([a-z_][a-z0-9_]*):\s*$/;
  const subKeyRe = /^ {4}([a-z_][a-z0-9_]*):[ \t]*(\S.*)?$/;
  const entryRe = /^ {6}([a-z_][a-z0-9_]*):[ \t]*(\S.*)?$/;

  function finalizeWorkType(): void {
    if (currentWorkType) {
      workTypes.push(currentWorkType);
    }
    currentWorkType = null;
    currentMap = null;
  }

  for (const line of lines) {
    // Closing condition: a new top-level key ends the work_types: block.
    if (topLevelRe.test(line)) {
      if (inWorkTypes) {
        finalizeWorkType();
      }
      inWorkTypes = sectionRe.test(line);
      continue;
    }
    if (!inWorkTypes) { continue; }
    if (line.trim() === '' || line.trimStart().startsWith('#')) { continue; }

    const wtHeader = workTypeHeaderRe.exec(line);
    if (wtHeader) {
      finalizeWorkType();
      currentWorkType = {
        slug: wtHeader[1],
        jiraIssueType: '',
        requiredStatuses: [],
        requiredTransitions: [],
      };
      currentMap = null;
      continue;
    }

    if (!currentWorkType) { continue; }

    const subKey = subKeyRe.exec(line);
    if (subKey) {
      const key = subKey[1];
      const rawValue = (subKey[2] ?? '').trim();
      currentMap = null;
      if (key === 'jira_issue_type') {
        currentWorkType.jiraIssueType = stripYamlScalar(rawValue);
      }
      else if (key === 'description') {
        currentWorkType.description = stripYamlScalar(rawValue);
      }
      else if (key === 'required_statuses') {
        currentMap = 'required_statuses';
      }
      else if (key === 'required_transitions') {
        currentMap = 'required_transitions';
      }
      // `used_by` and any other sub-keys are ignored — not relevant here.
      continue;
    }

    const entry = entryRe.exec(line);
    if (entry && currentMap) {
      const slug = entry[1];
      const inlineBody = entry[2] ?? '';
      const parsed = parseInlineMapping(inlineBody);
      if (currentMap === 'required_statuses') {
        currentWorkType.requiredStatuses.push({
          slug,
          description: parsed.description,
        });
      }
      else {
        currentWorkType.requiredTransitions.push({
          slug,
          from: parsed.from,
          to: parsed.to,
          description: parsed.description,
        });
      }
    }
  }
  // Last work_type if EOF terminates the block.
  if (inWorkTypes) { finalizeWorkType(); }

  return workTypes;
}

/** Strip surrounding quotes (single or double) from a YAML scalar string. */
function stripYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') { return ''; }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse a YAML inline-flow mapping like `{ from: ready_for_dev, to: in_progress, description: "Developer picks up the story" }`.
 * Returns the three keys we care about; ignores everything else.
 *
 * We intentionally do NOT use a real YAML parser here — the grammar in our
 * manifest is narrow and stable, and this stays byte-compatible with the
 * producer in `scripts/sync-jira-workflows.ts`.
 */
function parseInlineMapping(body: string): { from?: string, to?: string, description?: string } {
  const result: { from?: string, to?: string, description?: string } = {};
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return result;
  }
  const inner = trimmed.slice(1, -1);
  // Split on commas that are NOT inside quotes.
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inSingle) {
      buf += ch;
      if (ch === '\'') { inSingle = false; }
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '\\') { buf += inner[++i] ?? ''; continue; }
      if (ch === '"') { inDouble = false; }
      continue;
    }
    if (ch === '\'') { inSingle = true; buf += ch; continue; }
    if (ch === '"') { inDouble = true; buf += ch; continue; }
    if (ch === '{' || ch === '[') { depth++; buf += ch; continue; }
    if (ch === '}' || ch === ']') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== '') { parts.push(buf); }

  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) { continue; }
    const key = part.slice(0, colonIdx).trim();
    const value = stripYamlScalar(part.slice(colonIdx + 1));
    if (key === 'from') { result.from = value; }
    else if (key === 'to') { result.to = value; }
    else if (key === 'description') { result.description = value; }
  }
  return result;
}

// -----------------------------------------------------------------------------
// Comparison
// -----------------------------------------------------------------------------

/**
 * Loose type compatibility: jira-fields.json sometimes reports types more specifically
 * than the manifest cares about (e.g. `datetime` vs declared `date`). Treat
 * common families as equivalent.
 */
function typesMatch(declared: string, found: string | undefined): boolean {
  if (!found) { return false; }
  if (declared === found) { return true; }
  // Accept date/datetime equivalence.
  if (declared === 'date' && found === 'datetime') { return true; }
  if (declared === 'datetime' && found === 'date') { return true; }
  // Accept `multi-option` <-> `array` (Jira reports multi-selects as `array`).
  if (declared === 'multi-option' && found === 'array') { return true; }
  if (declared === 'array' && found === 'multi-option') { return true; }
  // `any` is a wildcard.
  if (declared === 'any') { return true; }
  return false;
}

function checkRequired(
  slug: string,
  expected: RequiredEntry,
  catalog: Record<string, JiraFieldEntry>,
  scope: 'required' | 'optional',
): CheckResult {
  const found = catalog[slug];
  const notes: string[] = [];
  const missingOptions: string[] = [];

  if (!found) {
    return {
      slug,
      scope,
      severity: scope === 'required' ? 'missing' : 'info',
      expected,
      notes: ['not present in .agents/jira-fields.json'],
      missingOptions: [],
    };
  }

  let severity: Severity = 'ok';

  if (!typesMatch(expected.type, found.type)) {
    severity = 'mismatch';
    notes.push(`type mismatch: declared "${expected.type}", found "${found.type ?? '<unknown>'}"`);
  }

  if (expected.type === 'option' && Array.isArray(expected.options) && expected.options.length > 0) {
    const presentOptionKeys = new Set(Object.keys(found.options ?? {}));
    for (const opt of expected.options) {
      if (!presentOptionKeys.has(opt)) { missingOptions.push(opt); }
    }
    if (missingOptions.length > 0) {
      if (severity === 'ok') { severity = 'mismatch'; }
      notes.push(`missing option(s): ${missingOptions.join(', ')}`);
    }
  }

  return { slug, scope, severity, expected, found, notes, missingOptions };
}

function checkUnmapped(slug: string, expected: UnmappedEntry): CheckResult {
  return {
    slug,
    scope: 'unmapped',
    severity: 'info',
    expected,
    notes: ['unmapped marker — see .agents/jira-required.yaml for migration path'],
    missingOptions: [],
  };
}

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------

interface Counters {
  ok: number
  missing: number
  mismatch: number
  info: number
  required: number
  optional: number
  unmapped: number
}

function tally(results: CheckResult[]): Counters {
  const c: Counters = { ok: 0, missing: 0, mismatch: 0, info: 0, required: 0, optional: 0, unmapped: 0 };
  for (const r of results) {
    c[r.severity]++;
    c[r.scope]++;
  }
  return c;
}

function printHumanReport(
  results: CheckResult[],
  counters: Counters,
  catalogSize: number,
  verbose: boolean,
): void {
  console.log('Jira Setup Status');
  console.log('=================');
  console.log('Manifest:  .agents/jira-required.yaml');
  console.log(`Catalog:   .agents/jira-fields.json (${catalogSize} fields)`);
  console.log('');
  console.log(`Required: ${counters.required} · Optional: ${counters.optional} · Unmapped: ${counters.unmapped}`);
  console.log(
    `Summary:  ✅ ${counters.ok} OK   ❌ ${counters.missing} missing   ⚠️ ${counters.mismatch} mismatched   💡 ${counters.info} informational`,
  );
  console.log('');

  const missing = results.filter(r => r.severity === 'missing');
  const mismatch = results.filter(r => r.severity === 'mismatch');
  const info = results.filter(r => r.severity === 'info');
  const ok = results.filter(r => r.severity === 'ok');

  if (missing.length > 0) {
    console.log('❌ MISSING required fields (must create in Jira):');
    console.log('');
    for (const r of missing) {
      const exp = r.expected as RequiredEntry;
      console.log(`  - ${r.slug}`);
      if (exp.name) { console.log(`    Suggested name: "${exp.name}"`); }
      console.log(`    Type: ${exp.type}`);
      if (exp.type === 'option' && exp.options?.length) {
        console.log(`    Suggested options: ${exp.options.join(', ')}`);
      }
      if (exp.used_by?.length) { console.log(`    Used by: ${exp.used_by.join(', ')}`); }
      console.log(
        '    Action: create a custom field in Jira admin → Issues → Custom fields,',
      );
      console.log(
        '            assign to the relevant issue type, then re-run',
      );
      console.log(
        '            `bun run jira:sync-fields --force` followed by `bun run jira:check`.',
      );
      console.log('');
    }
  }

  if (mismatch.length > 0) {
    console.log('⚠️ MISMATCHED fields (review):');
    console.log('');
    for (const r of mismatch) {
      const exp = r.expected as RequiredEntry;
      const found = r.found!;
      console.log(`  - ${r.slug}`);
      console.log(`    Found in jira-fields.json: type=${found.type ?? '<unknown>'}, name=${JSON.stringify(found.name ?? '')}`);
      console.log(`    Expected: type=${exp.type}${exp.name ? `, name="${exp.name}"` : ''}`);
      if (r.missingOptions.length > 0) {
        console.log(`    Missing option(s): ${r.missingOptions.join(', ')}`);
      }
      for (const note of r.notes) { console.log(`    Note: ${note}`); }
      console.log('    Action: rename / convert in Jira OR update the manifest to match reality.');
      console.log('');
    }
  }

  if (info.length > 0) {
    console.log('💡 INFO:');
    console.log('');
    for (const r of info) {
      if (r.scope === 'optional') {
        const exp = r.expected as RequiredEntry;
        console.log(`  - ${r.slug} (optional)`);
        console.log('    Not present in your Jira. Methodology works without it.');
        if (exp.description) { console.log(`    Purpose: ${exp.description.trim().split('\n')[0]}`); }
      }
      else if (r.scope === 'unmapped') {
        const exp = r.expected as UnmappedEntry;
        console.log(`  - ${r.slug} (unmapped)`);
        const desc = (exp.description ?? '').trim().split('\n')[0];
        if (desc) { console.log(`    ${desc}`); }
        console.log('    See .agents/jira-required.yaml `unmapped:` for the migration path.');
      }
      console.log('');
    }
  }

  if (verbose && ok.length > 0) {
    console.log(`✅ OK (${ok.length}):`);
    for (const r of ok) {
      const exp = r.expected as RequiredEntry;
      console.log(`  - ${r.slug}  (type=${exp.type}${r.scope === 'optional' ? ', optional' : ''})`);
    }
    console.log('');
  }

  const exitCode = missing.filter(r => r.scope === 'required').length > 0
    || mismatch.filter(r => r.scope === 'required').length > 0
    ? 1
    : 0;
  console.log(`Exit: ${exitCode} (${exitCode === 0 ? 'no missing required fields' : 'required fields missing or mismatched'})`);
}

function printJsonReport(
  results: CheckResult[],
  counters: Counters,
  catalogSize: number,
  liveOutcome: LiveCheckOutcome | null,
): void {
  const exitCode = results.some(
    r => r.scope === 'required' && (r.severity === 'missing' || r.severity === 'mismatch'),
  )
    ? 1
    : 0;

  const summary = {
    manifest: '.agents/jira-required.yaml',
    catalog: '.agents/jira-fields.json',
    catalog_size: catalogSize,
    counters,
    exit_code: exitCode,
    results: results.map(r => ({
      slug: r.slug,
      scope: r.scope,
      severity: r.severity,
      expected_type: (r.expected as RequiredEntry).type ?? null,
      expected_name: (r.expected as RequiredEntry).name ?? null,
      expected_options: (r.expected as RequiredEntry).options ?? null,
      found: r.found
        ? { id: r.found.id, type: r.found.type ?? null, name: r.found.name ?? null }
        : null,
      missing_options: r.missingOptions,
      notes: r.notes,
    })),
    live: liveOutcome === null
      ? null
      : {
          requested: true,
          ran: liveOutcome.ran,
          skipped_reason: liveOutcome.skippedReason ?? null,
          base_url: liveOutcome.baseUrl ?? null,
          project_key: liveOutcome.projectKey ?? null,
          project_key_source: liveOutcome.projectKeySource ?? null,
          issue_types_seen: liveOutcome.issueTypesSeen ?? null,
          work_types_compared: liveOutcome.workTypesCompared ?? null,
          statuses_compared: liveOutcome.statusesCompared ?? null,
          drift_count: liveOutcome.findings.length,
          findings: liveOutcome.findings.map(f => ({
            work_type: f.workType,
            kind: f.kind,
            entity: f.entity,
            cached: f.cached,
            live: f.live,
            note: f.note,
          })),
        },
  };

  console.log(JSON.stringify(summary, null, 2));
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

/**
 * Pull `--project <KEY>` / `--project=<KEY>` out of argv. Only consumed by
 * `--live`; ignored (and harmless) otherwise.
 */
function readProjectFlag(args: string[]): string | null {
  const inline = args.find(a => a.startsWith('--project='));
  if (inline) {
    const value = inline.slice('--project='.length).trim();
    return value === '' ? null : value;
  }
  const idx = args.indexOf('--project');
  if (idx !== -1 && idx + 1 < args.length) {
    const value = args[idx + 1].trim();
    if (value !== '' && !value.startsWith('-')) { return value; }
  }
  return null;
}

function printHelp(): void {
  console.log(`Usage: bun run jira:check [--json] [--verbose] [--live] [--project <KEY>] [--help]

Compares .agents/jira-required.yaml (the methodology's required-fields manifest)
against .agents/jira-fields.json (your Jira workspace's custom-field catalog) and
reports MISSING / MISMATCHED / OK status for each required and optional slug.

Offline by default. \`--live\` adds one read-only Jira call that compares the
CACHED .agents/jira-workflows.json against what Jira reports right now — the one
staleness class the offline checks structurally cannot see.

Flags:
  --json           Emit a machine-readable JSON summary.
  --verbose        Include OK entries in the human-readable report (default hides
                   them for brevity).
  --live           Also compare the cached workflow catalog against live Jira
                   (issue-type + status ids). Needs ATLASSIAN_EMAIL /
                   ATLASSIAN_API_TOKEN and only the non-admin Browse Projects
                   permission. Findings are warnings; the exit code never moves.
  --project <KEY>  Project key for --live. Precedence: this flag >
                   JIRA_PROJECT_KEY env > .agents/project.yaml project_key.
  -h, --help       Show this help.

Exit code:
  0 — all required fields present and matching
  1 — at least one required field missing or type-mismatched
      (--live drift is reported as a warning and never sets 1)
`);
}

// -----------------------------------------------------------------------------
// link_types validation (K6 — product-management refactor, May 2026)
// -----------------------------------------------------------------------------

interface LinkTypeReport {
  slug: string
  scope: 'required' | 'optional'
  severity: 'ok' | 'fallback' | 'missing' | 'deferred'
  expected: LinkTypeEntry
  fallbackSlug?: string
}

interface LinkTypeCatalogEntry {
  id?: string
  name?: string
  outward?: string
  inward?: string
  exists_in_workspace?: boolean
}

function loadLinkTypesCatalog(): Record<string, LinkTypeCatalogEntry> | null {
  if (!existsSync(LINK_TYPES_PATH)) { return null; }
  try {
    const parsed = JSON.parse(readFileSync(LINK_TYPES_PATH, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, LinkTypeCatalogEntry>;
    }
  }
  catch {
    // fall through — treat malformed as missing
  }
  return null;
}

/**
 * A slug counts as "resolved in workspace" only when its catalog entry exists
 * AND its `exists_in_workspace` flag is not explicitly false. The sync script
 * keeps declared-but-missing slugs in the catalog as stubs with
 * `exists_in_workspace: false` — those must NOT pass validation.
 */
function isWorkspaceResolved(entry: LinkTypeCatalogEntry | undefined): boolean {
  if (!entry) { return false; }
  return entry.exists_in_workspace !== false;
}

function checkLinkTypes(
  manifest: Manifest,
  catalog: Record<string, LinkTypeCatalogEntry> | null,
): { results: LinkTypeReport[], deferred: boolean } {
  const results: LinkTypeReport[] = [];
  const deferred = catalog === null;

  for (const [slug, entry] of Object.entries(manifest.linkTypesRequired)) {
    if (deferred) {
      results.push({ slug, scope: 'required', severity: 'deferred', expected: entry });
      continue;
    }
    if (isWorkspaceResolved(catalog[slug])) {
      results.push({ slug, scope: 'required', severity: 'ok', expected: entry });
      continue;
    }
    const fb = entry.fallback ?? null;
    if (fb && isWorkspaceResolved(catalog[fb])) {
      results.push({
        slug,
        scope: 'required',
        severity: 'fallback',
        expected: entry,
        fallbackSlug: fb,
      });
      continue;
    }
    results.push({ slug, scope: 'required', severity: 'missing', expected: entry });
  }

  for (const [slug, entry] of Object.entries(manifest.linkTypesOptional)) {
    if (deferred) {
      results.push({ slug, scope: 'optional', severity: 'deferred', expected: entry });
      continue;
    }
    const present = isWorkspaceResolved(catalog[slug]);
    results.push({
      slug,
      scope: 'optional',
      severity: present ? 'ok' : 'missing',
      expected: entry,
    });
  }

  return { results, deferred };
}

function printLinkTypesReport(results: LinkTypeReport[], deferred: boolean): boolean {
  if (results.length === 0) { return false; }
  console.log('Link Types');
  console.log('==========');
  if (deferred) {
    console.log('💡 DEFERRED — .agents/jira-link-types.json not found.');
    console.log('   Run `bun run jira:sync-link-types` once the script lands (follow-up PR).');
    console.log('   Validation skipped; degrade gracefully.');
    console.log('');
    return false;
  }

  let hasMissingRequired = false;
  const okCount = results.filter(r => r.severity === 'ok').length;
  const fallbackCount = results.filter(r => r.severity === 'fallback').length;
  const missingRequired = results.filter(r => r.scope === 'required' && r.severity === 'missing');
  const missingOptional = results.filter(r => r.scope === 'optional' && r.severity === 'missing');

  console.log(
    `Summary: ✅ ${okCount} OK   ⚠️ ${fallbackCount} via fallback   `
    + `❌ ${missingRequired.length} required missing   💡 ${missingOptional.length} optional absent`,
  );
  console.log('');

  if (missingRequired.length > 0) {
    hasMissingRequired = true;
    console.log('❌ MISSING required link types (workspace lacks the type AND its fallback):');
    for (const r of missingRequired) {
      console.log(`  - ${r.slug} (expected name "${r.expected.name ?? r.slug}")`);
      console.log('    Action: create the link type in Jira admin → Issues → Issue link types,');
      console.log('            then re-run `bun run jira:sync-link-types`.');
    }
    console.log('');
  }

  if (fallbackCount > 0) {
    console.log('⚠️ DEGRADED — required link types resolved via fallback (direction may be lost):');
    for (const r of results.filter(x => x.severity === 'fallback')) {
      console.log(`  - ${r.slug} → fallback "${r.fallbackSlug}" — consumers must flag direction loss.`);
    }
    console.log('');
  }

  return hasMissingRequired;
}

// -----------------------------------------------------------------------------
// statuses validation (K6 — product-management refactor, May 2026)
// -----------------------------------------------------------------------------

function loadWorkflowsCatalog(): WorkflowsCatalog | null {
  if (!existsSync(WORKFLOWS_PATH)) { return null; }
  try {
    return JSON.parse(readFileSync(WORKFLOWS_PATH, 'utf8')) as WorkflowsCatalog;
  }
  catch {
    return null;
  }
}

function printStatusesReport(manifest: Manifest): void {
  const slugs = Object.keys(manifest.statuses);
  if (slugs.length === 0) { return; }

  console.log('Statuses (default transitions)');
  console.log('==============================');
  const workflowsCatalog = loadWorkflowsCatalog();
  if (workflowsCatalog === null) {
    console.log('💡 DEFERRED — .agents/jira-workflows.json not found.');
    console.log('   Run `bun run jira:sync-workflows` to populate; validation skipped meanwhile.');
    console.log('');
    return;
  }

  for (const slug of slugs) {
    const entry = manifest.statuses[slug];
    const literal = entry.fallback_literal ?? '<unset>';
    const wt = entry.work_type_slug ?? '<unset>';
    console.log(`  - ${slug}: fallback_literal="${literal}", work_type_slug="${wt}"`);
  }
  console.log('  (Status-name reachability validation is best-effort; workspace transition');
  console.log('   catalogs vary widely, methodology consumers degrade gracefully.)');
  console.log('');
}

// -----------------------------------------------------------------------------
// Live drift detection (--live)
// -----------------------------------------------------------------------------

/**
 * Everything above this line is OFFLINE: it compares the manifest against the
 * CACHED catalogs. That is structurally blind to the failure mode where the
 * cache itself went stale — a Jira admin reconfigures the project after the last
 * `jira:sync-workflows` run, every id in `jira-workflows.json` starts pointing at
 * the wrong thing, and `jira:check` keeps passing clean the whole time.
 *
 * `--live` closes that gap with ONE read-only call:
 *
 *   GET /rest/api/3/project/{projectIdOrKey}/statuses
 *
 * chosen deliberately over `createmeta/{key}/issuetypes`: it needs the same
 * (non-admin) *Browse Projects* project permission but returns the project's
 * issue types AND each one's full status list, so it detects status drift too —
 * and statuses are what skills actually dereference as
 * `{{jira.status.<work_type>.<slug>}}`.
 *
 * NOT covered, deliberately: `workflow`, `workflow_scheme` and `transitions`.
 * Those come from `/workflowscheme/project` + `POST /workflows`, which require
 * ADMINISTER — the exact permission the audience for this check does not have
 * (`jira:sync-workflows` probes for it and exits early with
 * `[JIRA_SYNC_SKIPPED_NO_ADMIN]`). Re-running the admin-gated sync stays the only
 * way to revalidate those three. The report says so out loud rather than letting
 * a clean `--live` pass imply the whole catalog was verified.
 *
 * Findings are WARNINGS and never move the exit code. An out-of-date catalog is
 * a legitimate state: a non-admin operator literally cannot re-sync, and the
 * `--upex` path intentionally ships upstream's catalog. The point here is signal,
 * not a gate.
 */

interface LiveStatus {
  id: string
  name: string
  statusCategory?: { key?: string }
}

interface LiveIssueType {
  id: string
  name: string
  statuses?: LiveStatus[]
}

type LiveDriftKind
  = | 'issue_type_absent'
    | 'issue_type_id_changed'
    | 'issue_type_renamed'
    | 'status_absent'
    | 'status_id_changed'
    | 'status_renamed';

interface LiveDriftFinding {
  workType: string
  kind: LiveDriftKind
  /** Status slug, or the work_type slug itself for issue-type-level rows. */
  entity: string
  cached: string
  live: string
  note: string
}

interface LiveCheckOutcome {
  ran: boolean
  skippedReason?: string
  baseUrl?: string
  projectKey?: string
  projectKeySource?: string
  issueTypesSeen?: number
  workTypesCompared?: number
  statusesCompared?: number
  findings: LiveDriftFinding[]
}

async function liveFetch<T>(baseUrl: string, auth: string, endpoint: string): Promise<T> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`${response.status} ${response.statusText} — ${body}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Project key precedence, mirroring `scripts/sync-jira-issues.ts`:
 * `--project` flag > `JIRA_PROJECT_KEY` env > `.agents/project.yaml`.
 *
 * Never prompts and never writes: this is a read-only validator, and the
 * boilerplate ships `project_key: null` on purpose.
 */
function resolveLiveProjectKey(flagValue: string | null): { key: string | null, source: string } {
  if (flagValue) { return { key: flagValue, source: '--project flag' }; }
  const envKey = process.env.JIRA_PROJECT_KEY?.trim();
  if (envKey) { return { key: envKey, source: 'JIRA_PROJECT_KEY env var' }; }
  if (existsSync(PROJECT_YAML_PATH)) {
    try {
      const parsed = parseYaml(readFileSync(PROJECT_YAML_PATH, 'utf8')) as Record<string, unknown> | null;
      const project = parsed?.project as Record<string, unknown> | undefined;
      const raw = project?.project_key;
      if (typeof raw === 'string' && raw.trim() !== '') {
        return { key: raw.trim(), source: '.agents/project.yaml → project.project_key' };
      }
    }
    catch {
      // Unparseable project.yaml is not this validator's problem — treat the
      // key as unresolved and let the caller report a clean SKIPPED.
    }
  }
  return { key: null, source: 'none' };
}

async function runLiveDriftCheck(
  workTypes: ManifestWorkType[],
  catalog: WorkflowsCatalog | null,
  projectKeyFlag: string | null,
): Promise<LiveCheckOutcome> {
  const findings: LiveDriftFinding[] = [];

  if (catalog === null || Object.keys(catalog).length === 0) {
    return {
      ran: false,
      findings,
      skippedReason: '.agents/jira-workflows.json is absent or empty — nothing cached to compare '
        + 'against. Run `bun run jira:sync-workflows` (or `--upex`) first.',
    };
  }

  // Host resolution goes through the canonical resolver, never a bare env read:
  // a stale host would silently compare this project's catalog against another
  // site and report every single id as drift.
  let instance: ReturnType<typeof resolveAtlassianInstance>;
  try {
    instance = resolveAtlassianInstance();
  }
  catch (err) {
    return { ran: false, findings, skippedReason: (err as Error).message };
  }

  const email = process.env.ATLASSIAN_EMAIL?.trim();
  const apiToken = process.env.ATLASSIAN_API_TOKEN?.trim();
  if (!email || !apiToken) {
    return {
      ran: false,
      findings,
      baseUrl: instance.baseUrl,
      skippedReason: 'ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN missing from the environment — add them to .env.',
    };
  }

  const { key: projectKey, source: projectKeySource } = resolveLiveProjectKey(projectKeyFlag);
  if (!projectKey) {
    return {
      ran: false,
      findings,
      baseUrl: instance.baseUrl,
      skippedReason: 'no project key — pass `--project <KEY>`, set JIRA_PROJECT_KEY, or fill '
        + '`project.project_key` in .agents/project.yaml.',
    };
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  let liveTypes: LiveIssueType[];
  try {
    liveTypes = await liveFetch<LiveIssueType[]>(
      instance.baseUrl,
      auth,
      `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`,
    );
  }
  catch (err) {
    return {
      ran: false,
      findings,
      baseUrl: instance.baseUrl,
      projectKey,
      projectKeySource,
      skippedReason: `Jira read failed for project ${projectKey}: ${(err as Error).message}`,
    };
  }

  const liveByName = new Map<string, LiveIssueType>();
  const liveById = new Map<string, LiveIssueType>();
  for (const it of liveTypes) {
    liveByName.set(it.name.trim().toLowerCase(), it);
    liveById.set(String(it.id), it);
  }
  const manifestBySlug = new Map(workTypes.map(w => [w.slug, w]));

  let workTypesCompared = 0;
  let statusesCompared = 0;

  for (const [slug, entry] of Object.entries(catalog)) {
    const cachedType = entry?.jira_issue_type;
    // Unsynced shells (`jira_issue_type: null`) are the offline block's job —
    // it already reports them as MISSING with the re-sync hint.
    if (!cachedType || !cachedType.name || !cachedType.id) { continue; }
    workTypesCompared++;

    const cachedName = cachedType.name.trim();
    const cachedId = String(cachedType.id);
    let live = liveByName.get(cachedName.toLowerCase());

    if (live) {
      if (String(live.id) !== cachedId) {
        findings.push({
          workType: slug,
          kind: 'issue_type_id_changed',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: `${live.name} (id ${live.id})`,
          note: 'same issue-type name, different id — the project was reconfigured after the last sync',
        });
      }
    }
    else {
      // The cached name is gone. Before calling it absent, try the two ways it
      // can still be the same thing: another alternative declared in the
      // manifest (`Sub-task | Task`), or the same id under a new name.
      const declared = manifestBySlug.get(slug)?.jiraIssueType;
      const alternative = declared
        ? issueTypeNameCandidates(declared)
            .map(name => liveByName.get(name.trim().toLowerCase()))
            .find(candidate => candidate !== undefined)
        : undefined;
      const byId = liveById.get(cachedId);

      if (alternative) {
        findings.push({
          workType: slug,
          kind: 'issue_type_renamed',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: `${alternative.name} (id ${alternative.id})`,
          note: 'cached name is gone, but another alternative declared in jira-required.yaml is present',
        });
        live = alternative;
      }
      else if (byId) {
        findings.push({
          workType: slug,
          kind: 'issue_type_renamed',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: `${byId.name} (id ${byId.id})`,
          note: 'id still exists but the issue type was renamed in Jira',
        });
        live = byId;
      }
      else {
        findings.push({
          workType: slug,
          kind: 'issue_type_absent',
          entity: slug,
          cached: `${cachedName} (id ${cachedId})`,
          live: '(not in project)',
          note: `neither the cached name nor the cached id exists in ${projectKey} any more`,
        });
        continue;
      }
    }

    const liveStatusByName = new Map<string, LiveStatus>();
    const liveStatusById = new Map<string, LiveStatus>();
    for (const st of live.statuses ?? []) {
      liveStatusByName.set(st.name.trim().toLowerCase(), st);
      liveStatusById.set(String(st.id), st);
    }

    for (const [statusSlug, cachedStatus] of Object.entries(entry.statuses ?? {})) {
      if (!cachedStatus?.id || !cachedStatus.name) { continue; }
      statusesCompared++;
      const cachedStatusName = cachedStatus.name.trim();
      const cachedStatusId = String(cachedStatus.id);

      const byName = liveStatusByName.get(cachedStatusName.toLowerCase());
      if (byName) {
        if (String(byName.id) !== cachedStatusId) {
          findings.push({
            workType: slug,
            kind: 'status_id_changed',
            entity: statusSlug,
            cached: `${cachedStatusName} (id ${cachedStatusId})`,
            live: `${byName.name} (id ${byName.id})`,
            note: 'status name matches but the id moved — every {{jira.status.*}} reference to it is stale',
          });
        }
        continue;
      }

      const byStatusId = liveStatusById.get(cachedStatusId);
      if (byStatusId) {
        findings.push({
          workType: slug,
          kind: 'status_renamed',
          entity: statusSlug,
          cached: `${cachedStatusName} (id ${cachedStatusId})`,
          live: `${byStatusId.name} (id ${byStatusId.id})`,
          note: 'same status id, renamed in Jira — ids still resolve, printed names are wrong',
        });
        continue;
      }

      findings.push({
        workType: slug,
        kind: 'status_absent',
        entity: statusSlug,
        cached: `${cachedStatusName} (id ${cachedStatusId})`,
        live: '(not on this issue type)',
        note: `neither the cached name nor the cached id is on "${live.name}" in ${projectKey} any more`,
      });
    }
  }

  return {
    ran: true,
    findings,
    baseUrl: instance.baseUrl,
    projectKey,
    projectKeySource,
    issueTypesSeen: liveTypes.length,
    workTypesCompared,
    statusesCompared,
  };
}

function printLiveReport(outcome: LiveCheckOutcome): void {
  console.log('Live Jira Drift (cached catalog ⇄ live Jira)');
  console.log('===========================================');

  if (!outcome.ran) {
    console.log(`💡 SKIPPED — ${outcome.skippedReason}`);
    console.log('   Offline validation above is unaffected; the exit code does not change.');
    console.log('');
    return;
  }

  console.log(
    `Source: ${outcome.baseUrl}  project ${outcome.projectKey} (via ${outcome.projectKeySource})`,
  );
  console.log(
    `Compared: ${outcome.workTypesCompared} work_type(s) and ${outcome.statusesCompared} cached status(es) `
    + `against ${outcome.issueTypesSeen} live issue type(s).`,
  );
  console.log('');

  if (outcome.findings.length === 0) {
    console.log('✅ No drift — every cached issue-type and status id still matches live Jira.');
  }
  else {
    console.log(`⚠️ ${outcome.findings.length} drift finding(s) — the cached catalog is stale:`);
    console.log('');
    let current = '';
    for (const f of outcome.findings) {
      if (f.workType !== current) {
        current = f.workType;
        console.log(`  ${current}`);
      }
      console.log(`    ⚠️  ${f.entity} [${f.kind}]`);
      console.log(`        cached: ${f.cached}`);
      console.log(`        live:   ${f.live}`);
      console.log(`        ${f.note}`);
    }
    console.log('');
    console.log('   Action: ask someone with Jira ADMINISTER (or ADMINISTER_PROJECTS) to run');
    console.log('           `bun run jira:sync-workflows --force` on this checkout and commit the result.');
  }

  console.log('');
  console.log('   Scope: issue-type and status ids only. `workflow`, `workflow_scheme` and');
  console.log('          `transitions` are admin-gated (POST /workflows) and are NOT verified here —');
  console.log('          a clean pass does not mean the whole catalog is current.');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const asJson = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const live = args.includes('--live');
  const projectKeyFlag = readProjectFlag(args);

  const manifest = loadManifest();
  const catalog = loadCatalog();

  const results: CheckResult[] = [];
  for (const [slug, expected] of Object.entries(manifest.required)) {
    results.push(checkRequired(slug, expected, catalog, 'required'));
  }
  for (const [slug, expected] of Object.entries(manifest.optional)) {
    results.push(checkRequired(slug, expected, catalog, 'optional'));
  }
  for (const [slug, expected] of Object.entries(manifest.unmapped)) {
    results.push(checkUnmapped(slug, expected));
  }

  const counters = tally(results);
  const catalogSize = Object.keys(catalog).length;

  const linkTypesCatalog = loadLinkTypesCatalog();
  const { results: linkTypeResults, deferred: linkTypesDeferred } = checkLinkTypes(
    manifest,
    linkTypesCatalog,
  );
  const linkTypesMissingRequired = !linkTypesDeferred
    && linkTypeResults.some(r => r.scope === 'required' && r.severity === 'missing');

  // ----- live drift block (opt-in, --live) ------------------------------------
  // Purely additive: the offline verdict above and the exit code below are
  // untouched whether this runs, is skipped, or reports drift.
  const liveOutcome: LiveCheckOutcome | null = live
    ? await runLiveDriftCheck(loadManifestWorkTypes(), loadWorkflowsCatalog(), projectKeyFlag)
    : null;

  if (asJson) {
    printJsonReport(results, counters, catalogSize, liveOutcome);
  }
  else {
    printHumanReport(results, counters, catalogSize, verbose);
    printLinkTypesReport(linkTypeResults, linkTypesDeferred);
    printStatusesReport(manifest);
    if (liveOutcome) { printLiveReport(liveOutcome); }
  }

  // `--live` findings are deliberately absent from this expression — see the
  // rationale on the live-drift block.
  const fieldsExit = results.some(
    r => r.scope === 'required' && (r.severity === 'missing' || r.severity === 'mismatch'),
  )
    ? 1
    : 0;
  const exitCode = fieldsExit || (linkTypesMissingRequired ? 1 : 0);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
