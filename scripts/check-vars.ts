#!/usr/bin/env bun
/**
 * check-vars.ts — asserts manifest ⇄ `.env.example` parity (D1 of the installer
 * `--variables` design).
 *
 * The canonical variable routing table lives in `cli/lib/variables-manifest.ts`
 * (`VAR_MANIFEST`). `.env.example` is the human-facing doc users copy from. This
 * script is the hard gate that keeps the two in lockstep so they never drift:
 *
 *   1. validateVarManifest() — the manifest itself is well-formed.
 *   2. Every manifest var IS documented in `.env.example` (active or commented).
 *      A manifest var absent from the human doc is a real bug → ERROR.
 *   3. `.env.example` keys NOT in the manifest are reported as INFO, not errors.
 *      DEV intentionally documents day-zero / control-plane vars (ATLASSIAN_*,
 *      TAVILY_API_KEY, SUPABASE_ACCESS_TOKEN) that the manifest does not *route*
 *      to a remote backend — they are local-only credentials surfaced by doctor.
 *   4. No deprecated var (DEPRECATED_VARS) still appears in `.env.example` →
 *      ERROR (a retired key left in the template would mislead new clones).
 *   5. No manifest var holds a DIFFERENT value in the process environment than in
 *      the repo's `.env`. The process value silently wins at load time, so a
 *      stale one makes a corrected `.env` a no-op. ERROR by default; WARNING when
 *      `VARS_ENV_CHECK_DRIFT=warn` (set by `.husky/pre-push`, because this rule
 *      describes the developer's machine and must not block an unrelated push).
 *      Skipped when `.env` is absent. See `collectEnvDrift` for the rationale.
 *
 * Exit code: 0 if no ERRORs, 1 otherwise. Mirrors `scripts/lint-vars.ts`.
 */

import type { VarSpec } from '../cli/lib/variables-manifest.ts';
import { existsSync } from 'node:fs';

import { join, relative } from 'node:path';
import {
  DEPRECATED_VARS,
  parseDotEnvExampleKeys,
  parseDotEnvPairs,
  validateVarManifest,
  VAR_MANIFEST,
  VarManifestError,
} from '../cli/lib/variables-manifest.ts';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');
const ENV_FILE = join(REPO_ROOT, '.env');

// -----------------------------------------------------------------------------
// Rule 5 — process environment ⇄ `.env` drift
// -----------------------------------------------------------------------------

/**
 * Masks a value for display. Secrets never print; non-secrets print in full,
 * because seeing the two values side by side IS the diagnosis.
 */
function display(spec: VarSpec | undefined, value: string): string {
  if (value === '') { return '(empty)'; }
  if (spec?.secret) { return `${'*'.repeat(8)} (${value.length} chars)`; }
  return value;
}

/**
 * A variable ALREADY present in the process wins over the `.env` file under both
 * loaders this repo uses: `bun` autoloads `.env` without overriding, and
 * `dotenv-cli` does the same unless `-o` is passed. So a stale value inherited
 * from whatever spawned the shell (or an agent session) silently shadows a
 * corrected `.env`, and a full application restart does not clear it because the
 * value is re-inherited from the same parent every time.
 *
 * That is not hypothetical: a stale `ATLASSIAN_URL` made `jira:sync-issues`
 * overwrite `.context/PBI/` with content from a pre-migration Atlassian site
 * while reporting success. Identity values are anchored to `.agents/project.yaml`
 * now (see `cli/lib/atlassian-instance.ts`), but that fixes one variable. This
 * rule attacks the whole class.
 *
 * SEVERITY IS CALLER-CONTROLLED. Rules 1-4 describe the REPOSITORY and are always
 * fatal. Drift describes the DEVELOPER'S MACHINE, so making it fatal everywhere
 * would block pushing an unrelated change because some ancestor shell carries a
 * stale value. Set `VARS_ENV_CHECK_DRIFT=warn` to report without failing;
 * `.husky/pre-push` does exactly that. Direct runs and `repo:check` leave it
 * unset, so there it stays a hard error.
 *
 * Skipped when `.env` is absent (CI, fresh clone): nothing to compare against.
 */
function collectEnvDrift(): { findings: string[], status: 'checked' | 'skipped' } {
  if (!existsSync(ENV_FILE)) { return { findings: [], status: 'skipped' }; }

  const findings: string[] = [];
  const filePairs = parseDotEnvPairs(ENV_FILE);
  const specByName = new Map(VAR_MANIFEST.map(s => [s.name, s]));

  for (const [name, fileValue] of filePairs) {
    // Only manifest vars are in scope; an unknown key is another rule's job.
    const spec = specByName.get(name);
    if (!spec) { continue; }

    // An EMPTY file value shadows nothing — the process is then the only source,
    // which is legitimate (a secret injected by the platform, a value the user
    // exports on purpose). Same carve-out `cli/install.ts` makes when it loads
    // `.env`: only a non-empty file value overrides the process. Without this the
    // rule fires on every blank slot in the template and becomes noise.
    if (fileValue === '') { continue; }

    const procValue = process.env[name];
    // Absent from the process is fine: the loader will supply the file value.
    if (procValue === undefined) { continue; }
    if (procValue === fileValue) { continue; }

    findings.push(
      `ENV_DRIFT: '${name}' differs between the process environment and .env — `
      + `process=${display(spec, procValue)} vs .env=${display(spec, fileValue)}. `
      + 'The process value WINS at load time, so .env is being ignored in silence.',
    );
  }

  return { findings, status: 'checked' };
}

/** Shared remedy block — printed whether drift lands as an error or a warning. */
function printDriftRemedy(): void {
  console.log('Fix (ENV_DRIFT): the process value is stale and shadows .env. Find who injected it —');
  console.log('  ps eww -p $PPID                          # walk the ancestry; repeat up the chain');
  console.log('  env -i HOME=$HOME zsh -l -c \'echo $VAR\'   # test the login shell in isolation');
  console.log('Testing from the contaminated shell inherits the bad value and gives a false negative.');
  console.log('Restarting the app does NOT fix it: the value is re-inherited from the same parent.');
  console.log('Relaunch the agent session through `bun run claude` / `bun run opencode` (they pass');
  console.log('dotenv -o, which forces .env over anything inherited).');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  // Step 1 — the manifest must be well-formed before we compare anything.
  try {
    validateVarManifest();
  }
  catch (err) {
    if (err instanceof VarManifestError) {
      console.error(`FATAL: malformed VAR_MANIFEST: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (!existsSync(ENV_EXAMPLE)) {
    console.error(`FATAL: ${relative(REPO_ROOT, ENV_EXAMPLE)} does not exist.`);
    process.exit(1);
  }

  const exampleKeys = parseDotEnvExampleKeys(ENV_EXAMPLE);
  const exampleSet = new Set(exampleKeys);
  const manifestNames = VAR_MANIFEST.map(s => s.name);
  const manifestSet = new Set(manifestNames);

  // ERROR: a manifest var that is NOT documented in `.env.example`.
  const missingFromExample = manifestNames.filter(n => !exampleSet.has(n));

  // ERROR: a deprecated var still present in `.env.example`.
  const deprecatedStillPresent = DEPRECATED_VARS
    .filter(d => exampleSet.has(d.name))
    .map(d => d.name);

  // INFO: `.env.example` keys not routed by the manifest (day-zero / local-only).
  const untrackedByManifest = exampleKeys.filter(k => !manifestSet.has(k));

  // ERROR (or WARNING under VARS_ENV_CHECK_DRIFT=warn): the process environment
  // holds a different value than `.env` for a manifest var.
  const drift = collectEnvDrift();
  const driftSoft = process.env.VARS_ENV_CHECK_DRIFT === 'warn';
  const driftErrors = driftSoft ? [] : drift.findings;
  const driftWarnings = driftSoft ? drift.findings : [];

  const totalErrors = missingFromExample.length + deprecatedStillPresent.length + driftErrors.length;

  // ----- output -----
  console.log('Variable Manifest Parity Report');
  console.log('===============================');
  console.log(`Manifest vars:        ${manifestNames.length} (cli/lib/variables-manifest.ts)`);
  console.log(`.env.example keys:    ${exampleKeys.length} (${relative(REPO_ROOT, ENV_EXAMPLE)})`);
  console.log(`Deprecated vars:      ${DEPRECATED_VARS.length}`);
  console.log(
    `Process env ⇄ .env:   ${drift.status === 'skipped' ? 'skipped (no .env)' : driftSoft ? 'checked (warn-only)' : 'checked'}`,
  );
  console.log('');

  if (driftWarnings.length > 0) {
    console.log(`WARNINGS (${driftWarnings.length}) — reported, not blocking:`);
    for (const w of driftWarnings) {
      console.log(`  - ${w}`);
    }
    console.log('');
    printDriftRemedy();
    console.log('');
  }

  console.log(`ERRORS (${totalErrors}):`);
  if (totalErrors === 0) {
    console.log('  <none>');
  }
  else {
    for (const name of missingFromExample) {
      console.log(`  - MISSING_FROM_ENV_EXAMPLE: ${name}  (in VAR_MANIFEST but not documented in .env.example — add it)`);
    }
    for (const name of deprecatedStillPresent) {
      console.log(`  - DEPRECATED_STILL_PRESENT: ${name}  (in DEPRECATED_VARS but still declared in .env.example — remove it)`);
    }
    for (const e of driftErrors) {
      console.log(`  - ${e}`);
    }
  }
  console.log('');

  if (driftErrors.length > 0) {
    printDriftRemedy();
    console.log('');
  }

  console.log('INFO:');
  if (untrackedByManifest.length === 0) {
    console.log('  - every .env.example key is routed by the manifest');
  }
  else {
    console.log(`  - ${untrackedByManifest.length} .env.example key(s) not routed by the manifest (local-only / day-zero, expected):`);
    for (const name of untrackedByManifest) {
      console.log(`      ${name}`);
    }
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
