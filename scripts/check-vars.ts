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
 *
 * Exit code: 0 if no ERRORs, 1 otherwise. Mirrors `scripts/lint-vars.ts`.
 */

import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  DEPRECATED_VARS,
  parseDotEnvExampleKeys,
  validateVarManifest,
  VAR_MANIFEST,
  VarManifestError,
} from '../cli/lib/variables-manifest.ts';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');

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

  const totalErrors = missingFromExample.length + deprecatedStillPresent.length;

  // ----- output -----
  console.log('Variable Manifest Parity Report');
  console.log('===============================');
  console.log(`Manifest vars:        ${manifestNames.length} (cli/lib/variables-manifest.ts)`);
  console.log(`.env.example keys:    ${exampleKeys.length} (${relative(REPO_ROOT, ENV_EXAMPLE)})`);
  console.log(`Deprecated vars:      ${DEPRECATED_VARS.length}`);
  console.log('');

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
  }
  console.log('');

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
