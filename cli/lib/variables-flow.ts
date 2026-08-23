/**
 * @fileoverview `bun run setup --variables` flow — idempotent local + remote
 * env-var setup driven by the canonical `VAR_MANIFEST`
 * (`cli/lib/variables-manifest.ts`, Phase 1).
 *
 * Two halves:
 *   - LOCAL  : upsert every `destinations ∋ 'local'` var into `.env` (idempotent,
 *              skip already-set unless `--force`). Backs `.env` up to `.backups/`
 *              before mutating (D5).
 *   - REMOTE : push every `destinations ∋ 'vercel'` var with a resolvable value
 *              into Vercel env, per declared scope. Gated behind auth +
 *              project-link + an explicit confirm (or `--yes`); HARD-REFUSED in
 *              non-interactive / CI / `--auto` unless `--yes` is passed (D3).
 *
 * NOT EVERY VALUE LIVES IN `.env`. A spec may declare a `valueSource`, and
 * `ATLASSIAN_URL` does: it is read from (and written to) `.agents/project.yaml`
 * -> `issue_tracker.atlassian_url`, never `.env`. It was pulled out because a
 * stale copy in the process environment shadowed the file in silence and made
 * `jira:sync-issues` rebuild the PBI cache from a dead Jira site. Consequences
 * this module has to honour, each of which is a silent-corruption bug if missed:
 *   - `currentValueOf()` is the ONLY way to read a var's value. Reading `.env`
 *     directly makes a yaml-sourced var look unset, so it gets skipped.
 *   - the local walk uses `localWriteVars()`, not `varsFor('local')`, or the
 *     installer quietly stops asking for the host.
 *   - the Vercel PULL refuses yaml-sourced vars, or it re-creates the local
 *     copy from whatever the deploy scope holds.
 *
 * Security (D3, non-negotiable):
 *   - Every secret value is piped via **stdin** (`spawnSync({ input })`), NEVER on
 *     argv — argv is visible in `ps` / shell history. Mirrors the existing
 *     `acli jira auth login --token` stdin pattern in `cli/install.ts`.
 *   - Secret VALUES are never printed. Reports show names + scopes + status only.
 *   - `--dry-run` prints what WOULD be set (names + scopes) without executing any
 *     local or remote write.
 *
 * Idempotency (D4):
 *   - LOCAL : reuses `appendVarsToEnv` (in-place upsert, no duplicate lines).
 *   - VERCEL: `vercel env add` ERRORS if the key already exists for a scope, so
 *     each write is a precheck (`vercel env ls`) → `rm`+`add` (replace) OR a plain
 *     `add` (new). The whole flow is safely re-runnable.
 *
 * This module is self-contained: it owns ALL `--variables` logic. `install.ts`
 * only (a) exports the `.env` helpers reused here, and (b) adds the arg branch.
 *
 * Remote backend for THIS repo (agentic-dev-boilerplate) is **Vercel env**. The
 * sibling QA repo targets GitHub Actions secrets and has its own flow.
 */

import type { VarScope, VarSpec } from './variables-manifest.ts';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { password } from '@clack/prompts';
import {
  appendVarsToEnv,
  ensureEnvFileExists,
  parseEnvFile,
} from '../install.ts';
import {
  formatInstanceMismatchWarning,
  resolveAtlassianInstance,
  writeAtlassianUrlToYaml,
} from './atlassian-instance.ts';
import * as tui from './tui.ts';
import {
  criticalVars,
  DEPRECATED_VARS,
  valueSourceOf,
  VAR_MANIFEST,

  varsFor,
} from './variables-manifest.ts';

// ----------------------------------------------------------------------------
// Paths + colors (kept local so the module is self-contained)
// ----------------------------------------------------------------------------

// `import.meta.dir` is Bun-only; this lib has no shebang and inherits the
// importer's runtime — fall back to the portable URL-based form under Node.
const REPO_ROOT = resolve(import.meta.dir ?? dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_PATH = join(REPO_ROOT, '.env');
const BACKUPS_DIR = join(REPO_ROOT, '.backups');
const VERCEL_PROJECT_JSON = join(REPO_ROOT, '.vercel', 'project.json');

const C = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  bold: '\x1B[1m',
};

const DEFAULT_SCOPES: VarScope[] = ['production', 'preview', 'development'];

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** What a single local-var write resolved to. */
type LocalResult = 'set' | 'skipped' | 'failed';
/** What a single remote (per var+scope) write resolved to. */
type RemoteResult = 'set' | 'skipped' | 'failed';

/**
 * Options for {@link runVariablesFlow}. Shared shape with the sibling QA flow
 * (the backend differs; the surface is identical).
 */
export interface VariablesFlowOptions {
  /** Which halves to run. `both` = local then remote. Default `both`. */
  mode?: 'local' | 'remote' | 'both'
  /** Re-write a local var even when it is already set (local idempotency override). */
  force?: boolean
  /** Print what WOULD be set (names + scopes), execute nothing. Never prints values. */
  dryRun?: boolean
  /** Skip the remote-push confirm. REQUIRED for any remote write in CI / non-interactive. */
  yes?: boolean
  /**
   * No TTY (CI / agent / `--auto`). Remote writes are HARD-REFUSED unless `yes`
   * is also set. Local writes still run (append-only, low blast radius).
   */
  nonInteractive?: boolean
  /**
   * Show the interactive menu (set/reset critical vars · push local → Vercel ·
   * pull infra vars from Vercel · everything). Only set by `install.ts` when
   * `--variables` is invoked with NO explicit mode flag AND a TTY is present.
   * When false, the flow runs `mode` directly (scriptable / non-interactive).
   */
  menu?: boolean
}

interface VercelStatus {
  found: boolean
  authenticated: boolean
  linked: boolean
  /** Reason auth/link failed (surfaced to the user). */
  reason?: string
}

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------

function scopesForSpec(spec: VarSpec): VarScope[] {
  return spec.scopes && spec.scopes.length > 0 ? spec.scopes : DEFAULT_SCOPES;
}

/** Read `.env` into a plain `{ KEY: value }` map (empty if `.env` is absent). */
/**
 * The current value of a manifest var, from whatever source its spec declares.
 *
 * `.env` is the source for almost everything, but not for all of it: a var with
 * `valueSource: 'atlassian-instance'` is read from `.agents/project.yaml` via
 * the canonical resolver. Every consumer that needs "the value of this var"
 * must go through here, or a yaml-sourced var silently reads as unset and gets
 * skipped — the failure would look exactly like "not configured yet".
 *
 * Returns `null` when the value is unset or unresolvable.
 */
function currentValueOf(spec: VarSpec, env: Record<string, string>): string | null {
  if (valueSourceOf(spec) === 'atlassian-instance') {
    try {
      return resolveAtlassianInstance().baseUrl;
    }
    catch {
      return null;
    }
  }
  const raw = env[spec.name];
  return raw !== undefined && raw.trim().length > 0 ? raw : null;
}

/** Human label for where a var's value is read from, used in prompts + reports. */
function sourceLabelOf(spec: VarSpec): string {
  return valueSourceOf(spec) === 'atlassian-instance'
    ? '.agents/project.yaml'
    : '.env';
}

/**
 * Vars written on THIS machine — `.env` plus the yaml-sourced ones.
 *
 * Deliberately wider than `varsFor('local')`: a var can be written locally
 * without being written to `.env`. Filtering the interactive walk by
 * destination alone would silently drop ATLASSIAN_URL from every prompt, and
 * "the installer stopped asking" is a bug users report as "it forgot my Jira".
 */
function localWriteVars(): VarSpec[] {
  return VAR_MANIFEST.filter(
    spec => spec.destinations.includes('local') || valueSourceOf(spec) !== 'env-file',
  );
}

async function readEnvValues(): Promise<Record<string, string>> {
  if (!existsSync(ENV_PATH)) { return {}; }
  return parseEnvFile(await readFile(ENV_PATH, 'utf8'));
}

/** Back `.env` up to `.backups/.env.<timestamp>.bak` (D5). No-op if `.env` absent. */
async function backupEnv(): Promise<void> {
  if (!existsSync(ENV_PATH)) { return; }
  await mkdir(BACKUPS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(BACKUPS_DIR, `.env.${stamp}.bak`);
  await copyFile(ENV_PATH, dest);
  tui.log.info(`Backed up .env → ${dest}`);
}

// ----------------------------------------------------------------------------
// LOCAL half
// ----------------------------------------------------------------------------

/**
 * Set every `destinations ∋ 'local'` manifest var into `.env`. Mirrors the QA
 * sibling for parity (the `--variables-local` flag path):
 *   - INTERACTIVE (TTY, not dry-run): prompt each var. An already-set var is
 *     skipped unless `force`; a missing var is prompted (Enter skips). Secrets
 *     are masked; values are never printed.
 *   - NON-INTERACTIVE / DRY-RUN: never prompt — route/mark only the values that
 *     already exist in `.env` (the original append-only behavior, low blast radius).
 * Idempotent: re-running only (re-)writes what changed.
 */
async function runLocal(
  opts: VariablesFlowOptions,
  results: Record<string, LocalResult>,
): Promise<void> {
  tui.section('LOCAL — .env');

  const localVars = varsFor('local');
  const env = await readEnvValues();

  // --- Non-interactive / dry-run: route existing values only (never prompt). ---
  if (opts.nonInteractive || opts.dryRun) {
    const toWrite: Record<string, string> = {};
    for (const spec of localVars) {
      const current = env[spec.name];
      const hasValue = current !== undefined && current.trim().length > 0;
      if (!hasValue || !opts.force) {
        // Missing → nothing to route; already-set without --force → idempotent no-op.
        results[spec.name] = 'skipped';
        continue;
      }
      toWrite[spec.name] = current;
      results[spec.name] = 'set';
    }
    if (opts.dryRun) {
      for (const name of Object.keys(toWrite)) {
        process.stdout.write(`${C.dim}  would write ${name} → .env${C.reset}\n`);
      }
      if (Object.keys(toWrite).length === 0) {
        process.stdout.write(`${C.dim}  (no local writes — all tracked vars already set; pass --force to re-write)${C.reset}\n`);
      }
      return;
    }
    if (Object.keys(toWrite).length > 0) {
      await appendVarsToEnv(toWrite);
      tui.log.success(`Upserted ${Object.keys(toWrite).length} var(s) into .env.`);
    }
    else {
      tui.log.info('No local writes — all tracked vars already set (pass --force to re-write).');
    }
    return;
  }

  // --- Interactive: prompt each var (QA parity). Skip already-set unless --force. ---
  // Wider set than the routing loop above: a yaml-sourced var has nothing to
  // "route" from `.env`, but it is still a local write and must still be asked.
  await promptVarsInto(localWriteVars(), opts, results, false);
}

// ----------------------------------------------------------------------------
// CRITICAL vars (menu option a) — prompt + upsert the 5 tool credentials
// ----------------------------------------------------------------------------

/**
 * Prompt for each spec in `specs` and upsert non-empty answers into `.env`.
 * Shared engine behind the critical-set path AND the var-by-var walk (and the
 * interactive `--variables-local` flag path). Secrets are masked; their values
 * are never printed; Enter skips a var.
 *
 * `confirmOverwrite` controls already-set behavior (when `--force` is NOT set):
 *   - `true`  (walk / critical menu): ask "Overwrite it?" per already-set var.
 *   - `false` (flag path, QA parity): silently skip already-set vars; only
 *     `--force` re-prompts them.
 */
async function promptVarsInto(
  specs: VarSpec[],
  opts: VariablesFlowOptions,
  results?: Record<string, LocalResult>,
  confirmOverwrite = true,
): Promise<void> {
  const env = await readEnvValues();
  const toWrite: Record<string, string> = {};

  for (const spec of specs) {
    const alreadySet = currentValueOf(spec, env) !== null;

    if (alreadySet && !opts.force) {
      if (!confirmOverwrite) {
        // Flag-path parity: idempotent skip (only --force re-prompts).
        if (results) { results[spec.name] = 'skipped'; }
        continue;
      }
      const overwrite = await tui.confirm({
        message: `${spec.name} is already set (${sourceLabelOf(spec)}). Overwrite it?`,
        initialValue: false,
      });
      if (tui.isCancel(overwrite) || !overwrite) {
        process.stdout.write(`  ${C.dim}${spec.name}: kept existing value.${C.reset}\n`);
        if (results) { results[spec.name] = 'skipped'; }
        continue;
      }
    }

    const entered = spec.secret
      ? await password({ message: `${spec.name} (Enter to skip):`, mask: '*' })
      : await tui.text({ message: `${spec.name} (Enter to skip):` });
    if (tui.isCancel(entered)) {
      process.stdout.write(`  ${C.dim}${spec.name}: skipped.${C.reset}\n`);
      if (results) { results[spec.name] = 'skipped'; }
      continue;
    }
    const value = (entered ?? '').trim();
    if (value.length === 0) {
      process.stdout.write(`  ${C.dim}${spec.name}: skipped (empty).${C.reset}\n`);
      if (results) { results[spec.name] = 'skipped'; }
      continue;
    }

    // A yaml-sourced var is written to its own file immediately — batching it
    // into `toWrite` would put it back in `.env`, which is the whole point of
    // the split. A write failure is reported and does NOT abort the walk: the
    // remaining credentials are still worth collecting.
    if (valueSourceOf(spec) === 'atlassian-instance') {
      try {
        const written = writeAtlassianUrlToYaml(value);
        process.stdout.write(
          `  ${tui.statusIcon('ok')} ${spec.name} → .agents/project.yaml (${written})\n`,
        );
        if (results) { results[spec.name] = 'set'; }
      }
      catch (err) {
        tui.log.warn(`${spec.name}: ${(err as Error).message}`);
        if (results) { results[spec.name] = 'failed'; }
      }
      continue;
    }

    toWrite[spec.name] = value;
    if (results) { results[spec.name] = 'set'; }
  }

  if (Object.keys(toWrite).length > 0) {
    await appendVarsToEnv(toWrite);
    tui.log.success(`Upserted ${Object.keys(toWrite).length} var(s) into .env.`);
  }
  else {
    tui.log.info('No vars changed.');
  }
}

/**
 * Prompt for the CRITICAL tool credentials (ATLASSIAN_URL/EMAIL/API_TOKEN,
 * RESEND_API_KEY, TAVILY_API_KEY) and upsert them into `.env`. IDEMPOTENT: an
 * already-set var is shown and left untouched unless the user opts to overwrite
 * it. Secrets are masked at the prompt; their values are never printed.
 *
 * Reachable from the interactive menu (option "critical") — the normal installer
 * prompts these on a fresh clone; this is the "set / reset" power-tool path.
 */
async function setCriticalVars(opts: VariablesFlowOptions): Promise<void> {
  tui.section('CRITICAL — tool credentials (Atlassian, Resend, Tavily)');
  await promptVarsInto(criticalVars(), opts);
}

// ----------------------------------------------------------------------------
// REMOTE half — Vercel
// ----------------------------------------------------------------------------

function which(binary: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(probe, [binary], { encoding: 'utf8' });
  return res.status === 0;
}

/**
 * Detect Vercel CLI auth + project-link state (symmetric to `detectGh` in
 * `install.ts`): `vercel whoami` proves auth; `.vercel/project.json` proves the
 * repo is linked to a Vercel project. Both are required before any `env` write.
 */
function detectVercel(): VercelStatus {
  if (!which('vercel')) {
    return { found: false, authenticated: false, linked: false, reason: 'vercel CLI not found on PATH (install: bun add -g vercel)' };
  }
  const who = spawnSync('vercel', ['whoami'], { encoding: 'utf8', timeout: 15000 });
  const authenticated = who.status === 0;
  if (!authenticated) {
    return { found: true, authenticated: false, linked: false, reason: 'not logged in (run: vercel login)' };
  }
  const linked = existsSync(VERCEL_PROJECT_JSON);
  if (!linked) {
    return { found: true, authenticated: true, linked: false, reason: 'repo not linked to a Vercel project (run: vercel link)' };
  }
  return { found: true, authenticated: true, linked: true };
}

/**
 * Whether `name` already has a value set for `scope` in the linked project.
 * Parses `vercel env ls <scope>` output (the var name appears as a column). A
 * probe failure is treated as "not present" so we fall through to a plain `add`.
 */
function vercelHasEnv(name: string, scope: VarScope): boolean {
  const ls = spawnSync('vercel', ['env', 'ls', scope], { encoding: 'utf8', timeout: 20000 });
  if (ls.status !== 0) { return false; }
  // `vercel env ls` prints one row per var; the name is the first token. Match it
  // as a whole word so e.g. POSTGRES_URL doesn't match POSTGRES_URL_NON_POOLING.
  const re = new RegExp(`(^|\\s)${name}(\\s|$)`, 'm');
  return re.test(ls.stdout);
}

/**
 * Push a single var into a single Vercel scope. IDEMPOTENT: `vercel env add`
 * errors if the key exists for that scope, so when it already exists we `rm`
 * first then `add`. The value is piped via STDIN — NEVER on argv (D3).
 */
function pushVercelEnvVar(name: string, value: string, scope: VarScope): RemoteResult {
  if (vercelHasEnv(name, scope)) {
    const rm = spawnSync('vercel', ['env', 'rm', name, scope, '--yes'], {
      encoding: 'utf8',
      timeout: 20000,
    });
    if (rm.status !== 0) { return 'failed'; }
  }
  // value via stdin (input), name+scope on argv only.
  const add = spawnSync('vercel', ['env', 'add', name, scope], {
    input: value,
    encoding: 'utf8',
    timeout: 20000,
  });
  return add.status === 0 ? 'set' : 'failed';
}

/**
 * Push every `destinations ∋ 'vercel'` manifest var (with a non-empty `.env`
 * value) into Vercel, per declared scope. Gated + stdin-only (D3).
 *
 * Keys: `remoteResults['<NAME> [<scope>]'] = 'set'|'skipped'|'failed'`.
 */
async function runRemote(
  opts: VariablesFlowOptions,
  remoteResults: Record<string, RemoteResult>,
): Promise<void> {
  tui.section('REMOTE — Vercel env');

  // --- Gate 1: hard-refuse in CI / non-interactive unless --yes (D3). ---
  if (opts.nonInteractive && !opts.yes) {
    tui.log.warn('Remote push refused: non-interactive / CI mode requires an explicit --yes (secret mutation has blast radius the append-only auto policy never assumed).');
    return;
  }

  // --- Gate 2: auth + link. ---
  const vercel = detectVercel();
  if (!vercel.found || !vercel.authenticated) {
    tui.log.warn(`Skipping Vercel push: ${vercel.reason}`);
    return;
  }
  if (!vercel.linked) {
    const linked = await offerVercelLink(opts);
    if (!linked) { return; }
  }

  // --- Collect candidate vars (resolvable value, per the spec's source). ---
  // NOT every Vercel-bound var lives in `.env`: ATLASSIAN_URL is read from
  // `.agents/project.yaml`, so the yaml is the single origin for both the local
  // tooling and the deploy scope and the two cannot drift apart.
  const env = await readEnvValues();
  const values = new Map<string, string>();
  for (const spec of varsFor('vercel')) {
    const value = currentValueOf(spec, env);
    if (value !== null) { values.set(spec.name, value); }
  }
  const candidates: VarSpec[] = varsFor('vercel').filter(s => values.has(s.name));
  if (candidates.length === 0) {
    tui.log.info('No Vercel-bound vars have a value yet — nothing to push.');
    return;
  }

  // Surface a yaml/env divergence before writing it to a deploy scope: pushing
  // the wrong host to production is exactly the failure being defended against.
  const mismatchWarning = candidates.some(s => valueSourceOf(s) === 'atlassian-instance')
    ? formatInstanceMismatchWarning(resolveAtlassianInstance())
    : null;
  if (mismatchWarning !== null) {
    tui.log.warn(mismatchWarning);
  }

  // --- Dry-run: print plan (names + scopes), execute nothing. ---
  if (opts.dryRun) {
    process.stdout.write(`${C.dim}  Would push ${candidates.length} var(s) to Vercel (values redacted):${C.reset}\n`);
    for (const spec of candidates) {
      for (const scope of scopesForSpec(spec)) {
        process.stdout.write(`${C.dim}    would set ${spec.name} [${scope}]${C.reset}\n`);
      }
    }
    return;
  }

  // --- Gate 3: explicit confirm (skipped by --yes). ---
  if (!opts.yes) {
    const planLines = candidates.map(s => `${s.name} → [${scopesForSpec(s).join(', ')}]`);
    process.stdout.write(`${C.bold}  About to push these vars to Vercel (values never shown):${C.reset}\n`);
    for (const line of planLines) {
      process.stdout.write(`    ${C.cyan}${line}${C.reset}\n`);
    }
    const ok = await tui.confirm({
      message: `Push ${candidates.length} var(s) to Vercel env? (irreversible — no .backups rollback for remote)`,
      initialValue: false,
    });
    if (tui.isCancel(ok) || !ok) {
      tui.log.warn('Vercel push cancelled by user.');
      return;
    }
  }

  // --- Execute (stdin-only per var+scope). ---
  for (const spec of candidates) {
    const value = values.get(spec.name)!;
    for (const scope of scopesForSpec(spec)) {
      const key = `${spec.name} [${scope}]`;
      const result = pushVercelEnvVar(spec.name, value, scope);
      remoteResults[key] = result;
      const icon = result === 'set' ? tui.statusIcon('ok') : tui.statusIcon('fail');
      process.stdout.write(`  ${icon} ${spec.name} ${C.dim}[${scope}]${C.reset} → ${result}\n`);
    }
  }
}

// ----------------------------------------------------------------------------
// PULL half — Vercel → local .env (menu option c, DEV-only)
// ----------------------------------------------------------------------------

/**
 * When the repo is not linked to a Vercel project, offer to run `vercel link`
 * interactively — it lets the user select or create the project, which also
 * validates the project exists. Returns true once linked. Non-interactive: print
 * the instruction and return false (never auto-link without a TTY).
 */
async function offerVercelLink(opts: VariablesFlowOptions): Promise<boolean> {
  process.stdout.write(`${C.yellow}  Repo is not linked to a Vercel project.${C.reset}\n`);
  if (opts.nonInteractive) {
    process.stdout.write(`${C.cyan}  Run: vercel link${C.reset}  ${C.dim}(then re-run: bun run setup --variables)${C.reset}\n`);
    return false;
  }
  const doLink = await tui.confirm({
    message: 'Link this repo to a Vercel project now? (runs `vercel link` — select or create the project)',
    initialValue: true,
  });
  if (tui.isCancel(doLink) || !doLink) {
    process.stdout.write(`${C.dim}  Skipped. Run \`vercel link\` then re-run: bun run setup --variables${C.reset}\n`);
    return false;
  }
  // Interactive link — inherit stdio so the user can pick / create the project.
  const link = spawnSync('vercel', ['link'], { stdio: 'inherit', timeout: 180000 });
  if (link.status !== 0) {
    tui.log.warn(`vercel link did not complete (exit ${link.status}). Re-run \`bun run setup --variables\` after linking.`);
    return false;
  }
  const after = detectVercel();
  if (!after.linked) {
    tui.log.warn('Still not linked after `vercel link` — skipping.');
    return false;
  }
  tui.log.success('Vercel project linked.');
  return true;
}

/**
 * Pull the auto-provisioned infra vars (Supabase / Postgres / app URL) from the
 * linked Vercel project into local `.env`. These vars are generated by the
 * Supabase↔Vercel integration and do not exist at install time, so this is the
 * ONLY place they can be fetched.
 *
 * Flow (gated, never prints secret values):
 *   1. `detectVercel()` — auth + project-link. If unlinked, offer to run `vercel link`.
 *   2. Ask which environment, then `vercel env pull <tmpfile> --environment=<env>`
 *      → write the linked project's env to a tmp file, then parse it.
 *   3. Intersect the pulled keys with the manifest's `vercel`-dest vars (we only
 *      adopt vars we route) and show WHICH keys were pulled.
 *   4. Confirm before merging into `.env` (idempotent upsert via appendVarsToEnv).
 *
 * Mutates `.env` → refuses in non-interactive mode unless `--yes` is passed.
 */
async function pullVercelEnv(opts: VariablesFlowOptions): Promise<void> {
  tui.section('PULL — Vercel infra vars → local .env');

  // --- Gate 1: this mutates .env → require --yes in non-interactive mode. ---
  if (opts.nonInteractive && !opts.yes) {
    tui.log.warn('Vercel pull refused: non-interactive mode mutates .env — pass --yes to allow it.');
    return;
  }

  // --- Gate 2: auth + link. ---
  const vercel = detectVercel();
  if (!vercel.found || !vercel.authenticated) {
    tui.log.warn(`Skipping Vercel pull: ${vercel.reason}`);
    return;
  }
  if (!vercel.linked) {
    const linked = await offerVercelLink(opts);
    if (!linked) { return; }
  }

  // --- Choose which Vercel environment to pull from. Early on a single Supabase
  //     DB often backs several Vercel environments, so the user picks explicitly.
  //     (Custom branch previews: pull with `vercel env pull --git-branch=<branch>`.) ---
  let environment: 'production' | 'preview' | 'development' = 'development';
  if (!opts.nonInteractive) {
    const choice = await tui.select<'production' | 'preview' | 'development'>({
      message: 'Which Vercel environment to pull the infra vars from?',
      options: [
        { value: 'development', label: 'Development (local-dev env)' },
        { value: 'preview', label: 'Preview (staging / branch deploys)' },
        { value: 'production', label: 'Production' },
      ],
    });
    if (tui.isCancel(choice)) { tui.log.warn('Vercel pull cancelled.'); return; }
    environment = choice;
  }

  // --- Pull into a tmp file (so we never clobber .env with raw Vercel output). ---
  const tmpFile = join(tmpdir(), `vercel-env-pull-${Date.now()}.env`);
  const pull = spawnSync('vercel', ['env', 'pull', tmpFile, `--environment=${environment}`, '--yes'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  if (pull.status !== 0) {
    tui.log.warn(`vercel env pull failed (exit ${pull.status}). ${(pull.stderr ?? '').trim()}`);
    await rm(tmpFile, { force: true });
    return;
  }

  // --- Parse + intersect with the vars we actually route to Vercel. ---
  let pulled: Record<string, string> = {};
  try {
    pulled = parseEnvFile(await readFile(tmpFile, 'utf8'));
  }
  finally {
    await rm(tmpFile, { force: true });
  }

  // Pull only vars that BELONG in `.env`. A var sourced from
  // `.agents/project.yaml` must never be adopted back from Vercel: that would
  // recreate the local copy this design removed, and seed it with whatever the
  // deploy scope happens to hold — which is the stalest source of the three.
  const routedNames = new Set(
    varsFor('vercel')
      .filter(s => valueSourceOf(s) === 'env-file')
      .map(s => s.name),
  );
  const adopt: Record<string, string> = {};
  for (const [name, value] of Object.entries(pulled)) {
    if (routedNames.has(name) && value.trim().length > 0) {
      adopt[name] = value;
    }
  }

  if (Object.keys(adopt).length === 0) {
    tui.log.info('Nothing to pull — Vercel returned no values for the manifest infra vars yet.');
    return;
  }

  // --- Show WHICH keys were pulled (names only — never values). ---
  process.stdout.write(`${C.bold}  Pulled ${Object.keys(adopt).length} infra var(s) from Vercel (values redacted):${C.reset}\n`);
  for (const name of Object.keys(adopt)) {
    process.stdout.write(`    ${C.cyan}${name}${C.reset}\n`);
  }

  // --- Dry-run stops before writing. ---
  if (opts.dryRun) {
    process.stdout.write(`${C.dim}  (dry-run: would merge the above into .env — no write performed)${C.reset}\n`);
    return;
  }

  // --- Confirm before merging into .env (skipped by --yes). ---
  if (!opts.yes) {
    const ok = await tui.confirm({
      message: `Merge ${Object.keys(adopt).length} pulled var(s) into .env? (idempotent upsert)`,
      initialValue: true,
    });
    if (tui.isCancel(ok) || !ok) {
      tui.log.warn('Vercel pull cancelled — .env not modified.');
      return;
    }
  }

  await appendVarsToEnv(adopt);
  tui.log.success(`Merged ${Object.keys(adopt).length} infra var(s) into .env.`);
}

// ----------------------------------------------------------------------------
// Deprecated-var warnings
// ----------------------------------------------------------------------------

/** Warn (never auto-delete) when a deprecated var still lingers in `.env`. */
async function warnDeprecated(): Promise<void> {
  const env = await readEnvValues();
  const present = DEPRECATED_VARS.filter((d) => {
    const v = env[d.name];
    return v !== undefined && v.trim().length > 0;
  });
  if (present.length === 0) { return; }
  tui.section('DEPRECATED — consider removing from .env');
  for (const d of present) {
    process.stdout.write(`${C.yellow}  ${d.name}${C.reset} is deprecated (${d.reason}) ${C.dim}— consider removing${C.reset}\n`);
  }
}

// ----------------------------------------------------------------------------
// Observability table
// ----------------------------------------------------------------------------

function printResultsTable(
  localResults: Record<string, LocalResult>,
  remoteResults: Record<string, RemoteResult>,
  mode: 'local' | 'remote' | 'both',
): void {
  tui.section('RESULTS');

  if (mode !== 'remote') {
    // "Local" means written on this machine, which is not the same as written
    // to `.env`: a yaml-sourced var lands in `.agents/project.yaml` and still
    // belongs in this table. Naming the file per row keeps that visible instead
    // of leaving the operator to guess which one moved.
    const localRows = VAR_MANIFEST
      .filter(spec => spec.destinations.includes('local') || valueSourceOf(spec) !== 'env-file')
      .map(spec => [spec.name, sourceLabelOf(spec), localResults[spec.name] ?? 'skipped']);
    process.stdout.write(`${tui.table(['Var (local)', 'Written to', 'Result'], localRows)}\n`);
  }

  if (mode !== 'local') {
    const remoteKeys = Object.keys(remoteResults);
    if (remoteKeys.length > 0) {
      const remoteRows = remoteKeys.map(k => [k, remoteResults[k]]);
      process.stdout.write(`${tui.table(['Var [scope] (vercel)', 'Result'], remoteRows)}\n`);
    }
    else {
      process.stdout.write(`${C.dim}  (no remote writes recorded)${C.reset}\n`);
    }
  }
}

// ----------------------------------------------------------------------------
// Interactive menu (no explicit mode flag)
// ----------------------------------------------------------------------------

/** One of the menu actions, or `cancel` if the user aborts. */
type MenuChoice = 'walk' | 'critical' | 'push' | 'pull' | 'everything' | 'cancel';

/**
 * Show the interactive menu and run the chosen action. Returns the choice so the
 * caller can decide whether to print the local/remote results table (only the
 * walk/push/everything paths populate it).
 *
 * Actions:
 *   (a) walk       — set EVERY local var one by one (Enter skips; overwrite-confirm
 *                    on already-set). The flag-free human path; `--variables-local`
 *                    is now purely a scripting alias.
 *   (b) critical   — set / reset just the 5 CRITICAL vars (idempotent prompt).
 *   (c) push       — push local .env → Vercel env (the existing REMOTE half).
 *   (d) pull       — pull auto-provisioned infra vars from Vercel into .env.
 *   (e) everything — critical, then push, then leave the rest as-is.
 */
async function runMenu(
  opts: VariablesFlowOptions,
  localResults: Record<string, LocalResult>,
  remoteResults: Record<string, RemoteResult>,
): Promise<MenuChoice> {
  const selected = await tui.select({
    message: 'What do you want to do?',
    options: [
      { value: 'walk', label: 'Set variables one by one (walk all local vars)' },
      { value: 'critical', label: 'Set / reset the critical variables (Atlassian, Resend, Tavily)' },
      { value: 'push', label: 'Push local .env → Vercel env (production / preview / development)' },
      { value: 'pull', label: 'Pull infra vars from Vercel (Supabase / Postgres / app URL) into .env' },
      { value: 'everything', label: 'Everything (set critical, then push to Vercel)' },
    ],
    initialValue: 'walk',
  });

  if (tui.isCancel(selected)) { return 'cancel'; }
  const choice = selected as MenuChoice;

  switch (choice) {
    case 'walk':
      if (!opts.dryRun) { await backupEnv(); }
      tui.section('WALK — set every local var one by one');
      await promptVarsInto(localWriteVars(), opts, localResults);
      break;
    case 'critical':
      if (!opts.dryRun) { await backupEnv(); }
      await setCriticalVars(opts);
      break;
    case 'push':
      await runRemote(opts, remoteResults);
      break;
    case 'pull':
      if (!opts.dryRun) { await backupEnv(); }
      await pullVercelEnv(opts);
      break;
    case 'everything':
      if (!opts.dryRun) { await backupEnv(); }
      await setCriticalVars(opts);
      await runRemote(opts, remoteResults);
      break;
  }
  return choice;
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

/**
 * Run the `--variables` flow. Self-contained: owns backup, local upsert, remote
 * Vercel push/pull, the interactive menu, deprecated-var warnings, and the final
 * observability table.
 *
 * With `menu: true` (invoked via `bun run setup --variables` with NO explicit
 * mode flag, on a TTY) it shows the interactive menu. Otherwise it runs `mode`
 * directly (scriptable / non-interactive).
 *
 * Never prints secret values. Remote writes are gated + stdin-only (D3) and
 * idempotent (D4); `.env` is backed up before any local mutation (D5).
 */
export async function runVariablesFlow(opts: VariablesFlowOptions = {}): Promise<void> {
  const mode = opts.mode ?? 'both';

  process.stdout.write(`${tui.headline('Environment variables — local + remote setup')}\n\n`);
  if (opts.dryRun) {
    tui.log.info('Dry-run: printing what WOULD be set (no local or remote writes; values never shown).');
  }

  // Ensure .env exists before any read / mutation.
  await ensureEnvFileExists();

  const localResults: Record<string, LocalResult> = {};
  const remoteResults: Record<string, RemoteResult> = {};

  if (opts.menu) {
    // Interactive menu (each branch backs up .env before mutating, as needed).
    const choice = await runMenu(opts, localResults, remoteResults);
    if (choice === 'cancel') {
      tui.log.warn('Cancelled — nothing changed.');
      return;
    }
    await warnDeprecated();
    if (choice === 'walk') {
      printResultsTable(localResults, remoteResults, 'local');
    }
    else if (choice === 'push' || choice === 'everything') {
      printResultsTable(localResults, remoteResults, 'both');
    }
  }
  else {
    // Direct (scriptable) mode — back up .env before any local mutation (D5).
    if (!opts.dryRun && mode !== 'remote') {
      await backupEnv();
    }
    if (mode !== 'remote') {
      await runLocal(opts, localResults);
    }
    if (mode !== 'local') {
      await runRemote(opts, remoteResults);
    }
    await warnDeprecated();
    printResultsTable(localResults, remoteResults, mode);
  }

  process.stdout.write('\n');
  process.stdout.write(`${tui.successBox([
    'Variables flow complete. Re-run anytime: bun run setup --variables  (idempotent).',
  ])}\n`);
}
