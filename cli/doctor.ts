#!/usr/bin/env bun
/**
 * Setup doctor — read-only health check for the agentic-dev-boilerplate setup.
 *
 * Outputs a structured report (human-readable by default, JSON with --json)
 * describing what's wired correctly and what still needs action. Designed for
 * AI agents driving the setup: parse the JSON, take action on each
 * pending_actions entry, then re-run until status === "ok".
 *
 * Besides env vars / deps it diagnoses the cross-harness contract
 * (`agent_compatibility`): AGENTS.md + the CLAUDE.md shim, the canonical
 * `.agents/skills` store + its Claude alias, the commands that would shadow a
 * skill, the hook adapters and MCP parity across `.mcp.json` / `opencode.jsonc`
 * / `.codex/config.toml`, each only for a harness the project uses (ADR-0013).
 * Codex repository TRUST is runtime state no file check can verify, so it is
 * always a WARN row, never a FAIL.
 *
 * Usage:
 *   bun run setup:doctor              # human-readable summary
 *   bun run setup:doctor --json       # machine-readable JSON
 *   bun run setup:doctor --preflight  # alias of `bun cli/preflight.ts --for setup --gate`
 *
 * --preflight mode: an alias of the setup gate in `cli/preflight.ts` (Bun
 * recent enough, dependencies installed, `bun install` run when they are
 * missing). The full pre-run checklist runs inside `bun setup` itself.
 *
 * Exit code:
 *   0 if status === "ok"     (full mode) or preflight passes
 *   1 if status === "needs-action"  or preflight blocker hit
 *
 * Side effects: none. This script never edits files or installs anything.
 */

import type { CompatibilityCheck, CompatibilityErrorGroup } from './lib/agent-compatibility.ts';
import type { AtlassianUrlSource } from './lib/atlassian-instance.ts';
import type { CheckFinding as HarnessEnvFinding } from './lib/harness-env.ts';
import type { HarnessLevelVerdict } from './lib/harness-level-mcps.ts';
import type { Harness } from './lib/harness-selection.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { join, resolve } from 'node:path';
import { analyzeIsolation } from './lib/adopt-isolation.ts';
import {
  declaredMcpIds,
  validateHookCompatibility,
  validateMcpParity,
} from './lib/agent-compatibility-contracts.ts';
import {
  checkAgentCompatibility,
  describeAliasStatus,
  groupCompatibilityErrors,
  validateCanonicalSources,
} from './lib/agent-compatibility.ts';
import {
  formatInstanceMismatchWarning,
  resolveAtlassianInstance,
} from './lib/atlassian-instance.ts';
import { contextMapAdvice, contextMapStatuses } from './lib/context-maps.ts';
import { CORE_SCHEMA_FILE, deprecatedEnvKeysIn, neutralizeDeprecatedKeys, PROJECT_SCHEMA_FILE, varlockInstalled } from './lib/env-schema.ts';
import { harnessLevelMcpReport } from './lib/harness-level-mcps.ts';
import { HARNESS_LABEL } from './lib/harness-selection.ts';
import { detectHookManager } from './lib/hook-manager.ts';
import { DEPRECATED_VARS, varsFor } from './lib/variables-manifest.ts';
import { checkoutRoots } from './lib/worktree.ts';

// `tui` pulls third-party deps (boxen/cli-table3/figures/picocolors). It is
// imported lazily inside main() so `--preflight` loads only node built-ins and
// runs safely on a fresh clone before `bun install`.
let tui!: typeof import('./lib/tui.ts');

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '..');
const ENV_PATH = join(REPO_ROOT, '.env');
const MCP_PATH = join(REPO_ROOT, '.mcp.json');
const OPENCODE_PATH = join(REPO_ROOT, 'opencode.jsonc');
const CODEX_CONFIG_PATH = join(REPO_ROOT, '.codex', 'config.toml');
const NODE_MODULES_VARLOCK = join(REPO_ROOT, 'node_modules', 'varlock', 'package.json');

// Required MCP env vars (mirrors MCP_SERVER_SECRETS in cli/install.ts).
// ATLASSIAN_* are the canonical credentials consumed by acli and
// scripts/sync-jira-*.ts. The Atlassian MCP server is opt-in only — see
// docs/mcp/ for the templates to enable it manually. No JIRA_* credential
// overrides; the JIRA_* prefix is reserved for operational params (project
// key, output dir, custom field IDs).
// Env vars surfaced by doctor.
//
// Split into two tiers:
//   - DAY_ZERO_VARS — collectable on a fresh clone. Installer also prompts.
//   - PROJECT_BOUND_VARS — require an existing Supabase project / n8n
//     instance / Postgres connection. Deferred by the installer; doctor
//     reports them as pending.
//
// Legacy Supabase keys (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) are
// intentionally NOT listed — `.mcp.json` / `opencode.jsonc` map the new-style
// SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY into the legacy names the
// Supabase MCP server reads internally.
//
// ATLASSIAN_URL is deliberately absent: it is not a `.env` variable at all. The
// host lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url` and is
// checked separately (see the Atlassian-host block in `buildReport`). Listing it
// here would report `missing` forever on a correctly configured repo.
const DAY_ZERO_VARS = [
  'RESEND_API_KEY',
  'ATLASSIAN_EMAIL',
  'ATLASSIAN_API_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
] as const;

// Project-bound vars are derived from the canonical VAR_MANIFEST (single source
// of truth — kills the prior install/doctor drift where doctor knew 13 vars and
// the installer 5). They are the manifest's NON-critical vars (Supabase /
// Postgres / app-runtime / n8n). The CRITICAL tool credentials (ATLASSIAN_*,
// RESEND_API_KEY) also live in the manifest now but are day-zero
// (prompted at install), so they are excluded here to avoid double-listing with
// DAY_ZERO_VARS. SUPABASE_ACCESS_TOKEN stays day-zero (not in the manifest).
const PROJECT_BOUND_VARS: readonly string[] = varsFor('local')
  .filter(spec => !spec.critical)
  .map(spec => spec.name);

const REQUIRED_VARS: readonly string[] = [...DAY_ZERO_VARS, ...PROJECT_BOUND_VARS];

// Legacy credential keys some users may still have in `.env` from before the
// DRY rename or before the legacy-Supabase-keys removal. Detected so doctor
// can emit a migration hint — they're harmless (nothing reads them anymore)
// but signal a stale .env.
// Derived from the canonical DEPRECATED_VARS registry (same source of truth as
// the installer + updater migration hints). Covers the legacy JIRA_* credential
// family (pre-DRY rename). NOT the legacy Supabase anon / service_role keys —
// those coexist with the new sb_publishable / sb_secret keys (valid until end of
// 2026, still provisioned by Supabase↔Vercel), so they are not "deprecated".
const LEGACY_JIRA_CRED_KEYS: readonly string[] = DEPRECATED_VARS.map(d => d.name);

const VAR_HINTS: Record<string, { hint: string, where: string }> = {
  RESEND_API_KEY: {
    hint: 'Resend API key (transactional email + resend CLI auth)',
    where: 'https://resend.com/api-keys  (docs: https://resend.com/docs/api-reference/introduction)',
  },
  ATLASSIAN_EMAIL: {
    hint: 'Atlassian credentials (canonical) — see .env.example',
    where: 'Your Atlassian account email',
  },
  ATLASSIAN_API_TOKEN: {
    hint: 'Atlassian credentials (canonical) — see .env.example',
    where: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  },
  SUPABASE_ACCESS_TOKEN: {
    hint: 'Supabase personal access token (PAT) for the Supabase MCP server',
    where: 'https://supabase.com/dashboard/account/tokens',
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    hint: 'Supabase project URL (project-bound — Vercel integration generates only this var, no server-only counterpart)',
    where: 'Supabase dashboard → Project Settings → API',
  },
  SUPABASE_PUBLISHABLE_KEY: {
    hint: 'Supabase new-style publishable key (browser-safe, replaces anon key)',
    where: 'Supabase dashboard → Project Settings → API',
  },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
    hint: 'Browser-side copy of SUPABASE_PUBLISHABLE_KEY (not provisioned by the Vercel integration: set by hand)',
    where: 'Supabase dashboard → Project Settings → API',
  },
  SUPABASE_SECRET_KEY: {
    hint: 'Supabase new-style secret key (server only, replaces service_role)',
    where: 'Supabase dashboard → Project Settings → API',
  },
  SUPABASE_JWT_SECRET: {
    hint: 'Secret used to sign / verify custom JWTs',
    where: 'Supabase dashboard → Project Settings → API → JWT Settings',
  },
  POSTGRES_HOST: {
    hint: 'Direct Postgres host for the Supabase project',
    where: 'db.<project-ref>.supabase.co',
  },
  POSTGRES_USER: {
    hint: 'Postgres user (default: postgres)',
    where: 'Supabase dashboard → Project Settings → Database',
  },
  POSTGRES_PASSWORD: {
    hint: 'Postgres password for the project',
    where: 'Supabase dashboard → Project Settings → Database',
  },
  POSTGRES_DATABASE: {
    hint: 'Postgres database name (default: postgres)',
    where: 'Supabase dashboard → Project Settings → Database',
  },
  POSTGRES_URL: {
    hint: 'Pooled Postgres connection string (port 6543)',
    where: 'Supabase dashboard → Project Settings → Database → Connection string (Pooler)',
  },
  POSTGRES_URL_NON_POOLING: {
    hint: 'Direct Postgres connection string (port 5432)',
    where: 'Supabase dashboard → Project Settings → Database → Connection string',
  },
  POSTGRES_PRISMA_URL: {
    hint: 'Pooled connection with pgbouncer=true (for Prisma ORM)',
    where: 'Same as POSTGRES_URL with &pgbouncer=true',
  },
  NEXT_PUBLIC_APP_URL: {
    hint: 'Base URL for auth redirects, OAuth callbacks, and email links',
    where: 'e.g. http://localhost:3000 (local) or your deployed Vercel URL',
  },
  N8N_API_URL: {
    hint: 'n8n instance API URL for the n8n MCP server (project-bound)',
    where: 'e.g. https://n8n.yourapp.com/api/v1',
  },
  N8N_API_KEY: {
    hint: 'n8n API key for the n8n MCP server',
    where: 'n8n instance → Settings → API',
  },
};

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type PendingActionType = 'credential' | 'system_install' | 'shell_command';

interface PendingAction {
  type: PendingActionType
  target: string
  hint: string
  where?: string
}

/** What setup a linked worktree lacks, as the worktree-aware fix reads it. */
export interface WorktreeSetupState {
  envFile: boolean
  deps: boolean
  /** `.husky/_/` exists: without it `core.hooksPath` points at nothing and no git hook runs. */
  gitHooks: boolean
}

/**
 * The fix for missing setup inside a LINKED worktree, or null when nothing is
 * missing. One command, `bun run worktree:provision`: it copies the real
 * `.env` (and `.vercel/`, local settings) from the primary checkout and
 * installs dependencies and git hooks. The primary-checkout answer
 * (`cp .env.example .env`) is the wrong one here: it leaves the worktree with
 * an empty template while the filled `.env` sits one directory away.
 */
/**
 * Split the retired credential names set in `.env` into the ones to remove
 * and the ones an adopted app declares as its own (`appOwned`: the keys of the
 * app's part of `.env.example`, empty on a greenfield repo). Telling the app
 * to delete its own variable would break whatever in the app reads it.
 */
export function legacyCredentialKeys(envValues: Record<string, string>, appOwned: ReadonlySet<string>): { remove: string[], appOwned: string[] } {
  const set = LEGACY_JIRA_CRED_KEYS.filter((key) => {
    const value = envValues[key];
    return value !== undefined && value.trim().length > 0;
  });
  return { remove: set.filter(k => !appOwned.has(k)), appOwned: set.filter(k => appOwned.has(k)) };
}

export function worktreeSetupAction(state: WorktreeSetupState): PendingAction | null {
  const missing = [
    state.envFile ? null : '.env',
    state.deps ? null : 'node_modules/',
    state.gitHooks ? null : '.husky/_ (git hooks)',
  ].filter((m): m is string => m !== null);
  if (missing.length === 0) { return null; }
  return {
    type: 'shell_command',
    target: 'bun run worktree:provision',
    hint: `This is a linked worktree missing ${missing.join(', ')}. Provisioning copies .env and the other gitignored inputs from the primary checkout and installs dependencies and git hooks. Do not copy .env.example here: every MCP server reads this worktree's own .env through the .env loader, and a template one hands them empty values.`,
  };
}

export interface AgentCompatibilityDiagnostic {
  /** Every file-verifiable part of the contract holds (alias, hooks, MCP parity, shim). */
  file_correct: boolean
  errors: string[]
  /** Errors bucketed per surface, so "alias pending" and "MCP drift" never read as one flat failure. */
  errors_by_surface: Array<{ group: CompatibilityErrorGroup, label: string, errors: string[] }>
  /** The alias on its own, whatever the verdict: `deferred` is expected right after the migration. */
  alias: CompatibilityCheck['alias']
  /**
   * The harnesses checked (`declaredHarnesses`, ADR-0013). A harness outside
   * this list is `not used`: its per-host flags below read `true` and no row
   * or action names its files.
   */
  harnesses: Harness[]
  /** One line per skipped harness (`CompatibilityCheck.notes`). */
  notes: string[]
  instructions: {
    agents_md: boolean
    claude_shim: boolean
    canonical_skills: boolean
    claude_alias: boolean
  }
  hooks: { claude: boolean, opencode: boolean, codex: boolean, ok: boolean }
  mcp: { expected_servers: number, claude: boolean, opencode: boolean, codex: boolean, parity: boolean }
  codex: {
    config_exists: boolean
    cli_detected: boolean
    repository_configured: boolean
    desktop_uses_repository_config: true
    trust_required: true
    /** Trust is granted inside Codex at runtime; no file on disk records it. */
    trust_status: 'required-not-verifiable'
  }
}

/**
 * Resolution state of the Atlassian site host. `source` distinguishes the
 * versioned yaml (the intended answer) from the transitional `ATLASSIAN_URL`
 * env fallback, which is worth nudging off of.
 */
interface AtlassianHostState {
  status: 'set' | 'missing'
  value?: string
  source?: AtlassianUrlSource
}

interface DoctorReport {
  status: 'ok' | 'needs-action'
  repo_root: string
  platform: NodeJS.Platform
  shell: string
  is_tty: boolean
  env_file_exists: boolean
  env_vars: Record<string, 'set' | 'missing'>
  /**
   * The Atlassian site host, resolved from `.agents/project.yaml`. Reported
   * apart from `env_vars` because it is NOT an env var — see `DAY_ZERO_VARS`.
   */
  atlassian_host: AtlassianHostState
  legacy_jira_cred_keys: string[]
  /** Retired tooling names an adopted app declares as its own variables: kept, never a removal. */
  app_owned_retired_keys: string[]
  mcp_json_exists: boolean
  opencode_jsonc_exists: boolean
  codex_config_exists: boolean
  agent_compatibility: AgentCompatibilityDiagnostic
  deps_installed: boolean
  /** Linked worktree: the primary checkout's root; null in the primary itself. */
  worktree_of: string | null
  /** Servers that run at harness level, classified against the user-level configs (never a value). */
  harness_level_mcps: { verdicts: HarnessLevelVerdict[], sources: string[] }
  /**
   * Business context maps still to generate, one line each (cli/lib/context-maps.ts).
   * Informational, never a pending action: a `project-context` mode writes the
   * map, and an old `.context/business/` markdown map beside it is kept as input.
   */
  context_maps: string[]
  /**
   * Whether a plaintext copy of an MCP credential is still on disk.
   *
   * Every MCP server reads `.env` itself through the `.env` loader (ADR-0012),
   * so the copies an older `bun run harness:env` generated
   * (`.claude/settings.local.json` env block, `.auth/opencode/`) are only a
   * leak surface the AI can read. A stale copy is a pending action
   * (`bun run harness:env` retires it); a copy a legacy host config still
   * reads, and a backup waiting for the human, are informational.
   *
   * `findings` carries variable NAMES and a verdict only, never a value.
   */
  harness_env: HarnessEnvDiagnostic
  /**
   * Where secret VALUES come from (`.agents/project.yaml` -> `secrets:`,
   * ADR-0011) and whether the committed overlay agrees. NAMES only.
   */
  secrets_provider: SecretsProviderDiagnostic
  /**
   * Which key paths upstream's `.agents/project.schema.yaml` declares that this
   * project's `.agents/project.yaml` does not have.
   *
   * NEVER a failure. Being behind upstream is not a broken repo, and the moment
   * an upstream key addition turns a project's own checks red, the project
   * learns to skip them. `bun sync` is where it becomes actionable; here it
   * is the answer to "why is my project behaving oddly".
   */
  project_schema: ProjectSchemaDiagnostic
  /**
   * The `stack:` block of `.agents/project.yaml` against the repo it
   * describes (cli/lib/stack-descriptor.ts). NEVER a failure, like
   * `project_schema`: a stale descriptor is a wrong command in a skill later,
   * and the fix is one `agents:setup --stack`, not a red doctor today.
   */
  stack: StackDiagnosticReport
  /**
   * On an ADOPTED app (installer lock `adopted: true`): the app configs that
   * still reach the tooling (`cli/lib/adopt-isolation.ts`). The adoption never
   * edits them, so after the `--adopt` run this is the only place that keeps
   * saying so. NEVER a failure: the fix is a hand edit of the app's file.
   */
  tooling_isolation: { adopted: boolean, pending: string[] }
  /**
   * The developer's `.env` against the committed varlock schema
   * (`.env.schema` + `.env.core.schema`), plus which varlock is reachable.
   * The verdict comes from `varlock load --agent`, whose output is redacted:
   * `errors` carries varlock's own diagnostic lines, item NAMES only.
   */
  env_schema: EnvSchemaDiagnostic
  pending_actions: PendingAction[]
}

export interface EnvSchemaDiagnostic {
  /** Both schema files present at the repo root. */
  schema_present: boolean
  /**
   * `standalone`: a `varlock` binary on PATH (what a harness-spawned process finds).
   * `devDependency`: only `node_modules/varlock` (what the gates use).
   * `missing`: neither.
   */
  binary: 'standalone' | 'devDependency' | 'missing'
  binary_version: string | null
  /** `skipped` when the schema or the devDependency is absent. */
  validation: 'ok' | 'invalid' | 'skipped'
  /** Resolved item count on `ok`; names only ever reach this report. */
  items: number
  /** varlock's redacted diagnostic lines on `invalid`. */
  errors: string[]
}

interface StackDiagnosticReport {
  present: boolean
  app_found: boolean
  issues: Array<{ path: string, message: string }>
  unsupported: Array<{ path: string, message: string }>
  drift: Array<{ path: string, declared: string | null, detected: string | null, evidence: string }>
  note: string | null
}

interface ProjectSchemaDiagnostic {
  /** Key paths the schema declares and this project lacks, grouped by block. */
  gaps: Array<{ block: string, paths: string[], wholeBlock: boolean }>
  /** Blocks silenced through `updater.schema_exempt`. */
  exempt: string[]
  /** Set when nothing could be compared: a parse failure, or no schema on disk. */
  note: string | null
  /**
   * True when `.agents/project.yaml` is the boilerplate maintainers' own copy
   * in a repo that is not the boilerplate (GitHub "Use this template"). A
   * warning, never a failure: `bun run agents:setup` is the fix.
   */
  copied_template: boolean
}

interface HarnessEnvDiagnostic {
  /** false when at least one blocking finding stands. */
  ok: boolean
  /** One line: how many stale copies remain, or that none does. */
  summary: string
  /** The MCP credential names the configs declare, for the record. Never their values. */
  allowlist: string[]
  findings: Array<Omit<HarnessEnvFinding, 'kind'> & { kind: HarnessEnvFinding['kind'] | 'check-failed' }>
}

export interface SecretsProviderDiagnostic {
  /** `secrets.provider`, or null when the block could not be read (see `note`). */
  provider: string | null
  /** `.env.provider.schema` (references only) is on disk. */
  overlay_present: boolean
  /** NAMES the overlay resolves from the manager (active item lines). */
  vault_items: string[]
  /** The manager's CLI is on PATH; null when the provider needs none. */
  cli_installed: boolean | null
  /** Set when the yaml block could not be parsed. */
  note: string | null
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function tryRun(binary: string, args: string[]): { ok: boolean, stdout: string } {
  try {
    const stdout = execFileSync(binary, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout };
  }
  catch {
    return { ok: false, stdout: '' };
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) { continue; }
    const eq = line.indexOf('=');
    if (eq <= 0) { continue; }
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Plaintext MCP credential copies
// ----------------------------------------------------------------------------

/**
 * The plaintext MCP credential copies an older install left on disk
 * (`bun run harness:env --check`, as data).
 *
 * DYNAMIC import: `cli/lib/harness-env.ts` imports `cli/install.ts`, which pulls
 * third-party packages at module load, and this module must stay loadable with
 * node built-ins only for `--preflight`. Try-wrapped because a doctor that
 * crashes on the thing it was meant to diagnose is useless.
 */
async function harnessEnvDiagnostic(): Promise<HarnessEnvDiagnostic> {
  try {
    const { check } = await import('./lib/harness-env.ts');
    const result = check(REPO_ROOT);
    return { ok: result.ok, summary: result.summary, allowlist: result.allowlist.all, findings: result.findings };
  }
  catch (err) {
    return {
      ok: false,
      summary: 'the harness-env check could not run',
      allowlist: [],
      findings: [{
        surface: 'claude',
        kind: 'check-failed',
        names: [],
        detail: `harness-env check threw: ${(err as Error).message}`,
        blocking: true,
      }],
    };
  }
}

/**
 * Where secret values come from. `local` is the default and needs nothing; a
 * manager needs its committed overlay (references only) and, for 1Password,
 * the `op` CLI on a developer machine. NAMES only: the overlay holds `op://`
 * references and this reads only which keys it activates.
 *
 * DYNAMIC import: `secret-providers.ts` pulls the `yaml` package, and this
 * module must stay loadable with node built-ins only for `--preflight`.
 */
async function secretsProviderDiagnostic(): Promise<SecretsProviderDiagnostic> {
  try {
    const { PROVIDER_SCHEMA_FILE, providerResolvedKeysIn, readSecretsConfig } = await import('./lib/secret-providers.ts');
    const overlay_present = existsSync(join(REPO_ROOT, PROVIDER_SCHEMA_FILE));
    const vault_items = providerResolvedKeysIn(REPO_ROOT);
    let provider: string | null = null;
    let note: string | null = null;
    try { provider = readSecretsConfig(join(REPO_ROOT, '.agents', 'project.yaml')).provider; }
    catch (err) { note = (err as Error).message; }
    const cli_installed = provider === '1password' ? tryRun('op', ['--version']).ok : null;
    return { provider, overlay_present, vault_items, cli_installed, note };
  }
  catch (err) {
    return { provider: null, overlay_present: false, vault_items: [], cli_installed: null, note: `provider check could not run: ${(err as Error).message}` };
  }
}

function gitOrigin(): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  }
  catch { return null; }
}

/**
 * `.agents/project.yaml` against upstream's generated schema (`bun run
 * agents:schema --project`, as data).
 *
 * DYNAMIC import for the same reason as the harness-env diagnostic: the
 * schema module pulls the `yaml` package, and this module must stay loadable
 * with node built-ins only for `--preflight`. Try-wrapped because a doctor
 * that crashes on the thing it was meant to diagnose is useless.
 */
async function projectSchemaDiagnostic(): Promise<ProjectSchemaDiagnostic> {
  try {
    const { classifyProjectYaml, projectDelta, SCHEMA_FILE, SCHEMA_SOURCE } = await import('./lib/agents-schema.ts');
    const sourcePath = join(REPO_ROOT, SCHEMA_SOURCE);
    const schemaPath = join(REPO_ROOT, SCHEMA_FILE);
    if (!existsSync(sourcePath)) { return { gaps: [], exempt: [], note: `${SCHEMA_SOURCE} not found`, copied_template: false }; }
    const sourceText = await readFile(sourcePath, 'utf8');
    const copied_template = classifyProjectYaml(sourceText, gitOrigin()) === 'copied-template';
    if (!existsSync(schemaPath)) { return { gaps: [], exempt: [], note: `${SCHEMA_FILE} not found: run \`bun sync\` to receive it`, copied_template }; }
    const delta = projectDelta(sourceText, await readFile(schemaPath, 'utf8'));
    return { gaps: delta.gaps, exempt: delta.exempt, note: delta.error, copied_template };
  }
  catch (err) {
    return { gaps: [], exempt: [], note: `the schema comparison threw: ${(err as Error).message}`, copied_template: false };
  }
}

/**
 * The `stack:` block against the repo. Dynamic import and try-wrapped for the
 * same reasons as `projectSchemaDiagnostic`.
 */
async function stackDiagnostic(): Promise<StackDiagnosticReport> {
  const empty: StackDiagnosticReport = { present: false, app_found: false, issues: [], unsupported: [], drift: [], note: null };
  try {
    const { diagnoseStack } = await import('./lib/stack-descriptor.ts');
    const { SCHEMA_SOURCE } = await import('./lib/agents-schema.ts');
    const sourcePath = join(REPO_ROOT, SCHEMA_SOURCE);
    if (!existsSync(sourcePath)) { return { ...empty, note: `${SCHEMA_SOURCE} not found` }; }
    const d = diagnoseStack(REPO_ROOT, await readFile(sourcePath, 'utf8'));
    return { present: d.present, app_found: d.appFound, issues: d.issues, unsupported: d.unsupported, drift: d.drift, note: d.note };
  }
  catch (err) {
    return { ...empty, note: `the stack check threw: ${(err as Error).message}` };
  }
}

/** One line per app config that still reaches the tooling; silent on a greenfield repo. */
function toolingIsolationDiagnostic(): { adopted: boolean, pending: string[] } {
  const adopted = (() => {
    try { return (JSON.parse(readFileSync(join(REPO_ROOT, '.template', 'installer.lock.json'), 'utf8')) as { adopted?: unknown }).adopted === true; }
    catch { return false; }
  })();
  if (!adopted) { return { adopted, pending: [] }; }
  const a = analyzeIsolation(REPO_ROOT);
  const pending: string[] = [];
  for (const t of a.tsconfigs) { pending.push(`${t.path} type-checks ${t.reached.map(d => `${d}/`).join(', ')}: add them to its "exclude" (snippet: .agents/prompts/adopt-tooling-isolation.md)`); }
  if (a.eslint !== null) { pending.push(`${a.eslint.path} lints the tooling: ignore ${a.eslint.missing.join(', ')}`); }
  if (a.hooksPending) { pending.push(`${a.hooks.manager} (${a.hooks.evidence}) does not call .husky/framework-gates.sh: the framework gates never run`); }
  const repoCheck = (() => {
    try { return (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }).scripts?.['repo:check']; }
    catch { return undefined; }
  })();
  if (repoCheckRunsAppWideLegs(repoCheck)) {
    pending.push('package.json "repo:check" runs the app-wide format:check / lint:check / types:check: take upstream\'s value (`bun sync`, row scripts.repo:check), which opens with `bun scripts/tooling-check.ts repo` and scopes them to the tooling');
  }
  return { adopted, pending };
}

/**
 * Whether a `repo:check` script still opens with the legs that judge the whole
 * repo (`format:check`, `lint:check`, `types:check`). On an adopted app those
 * are the app's own scripts or tools run over the app's root configs; the
 * scoped form is `bun scripts/tooling-check.ts repo`. An app without the
 * script, or with its own composition, is not reported.
 */
export function repoCheckRunsAppWideLegs(script: unknown): boolean {
  if (typeof script !== 'string') { return false; }
  return /\bbun run (?:format:check|lint:check|types:check)\b/.test(script) && !script.includes('tooling-check.ts repo');
}

// ----------------------------------------------------------------------------
// Cross-harness compatibility
// ----------------------------------------------------------------------------

/**
 * Read-only diagnosis of the compatibility contract for `root`. Splits the
 * engine's flat error list into per-surface booleans so the human table can
 * point at the failing surface, and keeps file correctness apart from Codex
 * CLI availability (a machine fact) and repository trust (runtime state).
 */
export function diagnoseAgentCompatibility(
  root: string,
  options: { platform?: NodeJS.Platform, codexCliDetected?: boolean } = {},
): AgentCompatibilityDiagnostic {
  const platform = options.platform ?? process.platform;
  const compatibility = checkAgentCompatibility(root, platform);
  const harnesses = compatibility.harnesses;
  const uses = (harness: Harness): boolean => harnesses.includes(harness);
  const canonicalErrors = validateCanonicalSources(root, harnesses);
  const hookErrors = validateHookCompatibility(root, harnesses);
  const mcpErrors = validateMcpParity(root, { harnesses });
  let expectedServers = 0;
  try { expectedServers = declaredMcpIds(root, harnesses).length; }
  catch { /* mcpErrors already carries the canonical MCP config diagnostics */ }

  const hasHookError = (needle: string): boolean => hookErrors.some(error => error.includes(needle));
  const hasMcpError = (needle: string): boolean => mcpErrors.some(error => error.includes(needle));
  const codexConfigExists = existsSync(join(root, '.codex', 'config.toml'));
  const codexHooksExist = existsSync(join(root, '.codex', 'hooks.json'));
  const claudeShimError = canonicalErrors.some(error => error.includes('CLAUDE.md'));
  const agentsError = canonicalErrors.some(error => error.includes('Canonical instructions'));
  const skillsError = canonicalErrors.some(error => error.includes('Canonical skills'));

  return {
    file_correct: compatibility.ok,
    errors: [...new Set(compatibility.errors)],
    errors_by_surface: groupCompatibilityErrors([...new Set(compatibility.errors)]),
    alias: compatibility.alias,
    harnesses,
    notes: compatibility.notes,
    instructions: {
      agents_md: !agentsError,
      claude_shim: !claudeShimError,
      canonical_skills: !skillsError,
      claude_alias: compatibility.alias.status === 'valid' || compatibility.alias.status === 'not-used',
    },
    hooks: {
      claude: !uses('claude') || !hasHookError('.claude/settings.json'),
      opencode: !uses('opencode') || (!hasHookError('opencode.jsonc') && !hasHookError('.opencode/plugins')),
      codex: !uses('codex') || (codexHooksExist && !hasHookError('.codex/hooks.json') && !hasHookError('.codex/config.toml')),
      ok: hookErrors.length === 0,
    },
    mcp: {
      expected_servers: expectedServers,
      claude: !uses('claude') || !hasMcpError('.mcp.json'),
      opencode: !uses('opencode') || !hasMcpError('opencode.jsonc'),
      codex: !uses('codex') || (codexConfigExists && !hasMcpError('.codex/config.toml')),
      parity: mcpErrors.length === 0,
    },
    codex: {
      config_exists: codexConfigExists,
      // Not probed when Codex is not in use: the binary is irrelevant there.
      cli_detected: uses('codex') && (options.codexCliDetected ?? tryRun('codex', ['--version']).ok),
      repository_configured: codexConfigExists && codexHooksExist,
      desktop_uses_repository_config: true,
      trust_required: true,
      trust_status: 'required-not-verifiable',
    },
  };
}

// ----------------------------------------------------------------------------
// Main check
// ----------------------------------------------------------------------------

async function runDoctor(): Promise<DoctorReport> {
  const report: DoctorReport = {
    status: 'ok',
    repo_root: REPO_ROOT,
    platform: process.platform,
    shell: process.env.SHELL ?? '',
    is_tty: Boolean(process.stdin.isTTY),
    env_file_exists: existsSync(ENV_PATH),
    env_vars: {},
    atlassian_host: { status: 'missing' },
    legacy_jira_cred_keys: [],
    app_owned_retired_keys: [],
    mcp_json_exists: existsSync(MCP_PATH),
    opencode_jsonc_exists: existsSync(OPENCODE_PATH),
    codex_config_exists: existsSync(CODEX_CONFIG_PATH),
    agent_compatibility: diagnoseAgentCompatibility(REPO_ROOT),
    deps_installed: existsSync(NODE_MODULES_VARLOCK),
    worktree_of: ((): string | null => {
      const roots = checkoutRoots(REPO_ROOT);
      return roots !== null && roots.linked ? roots.primaryRoot : null;
    })(),
    harness_level_mcps: harnessLevelMcpReport(),
    context_maps: contextMapStatuses(REPO_ROOT).map(contextMapAdvice).filter((line): line is string => line !== null),
    harness_env: await harnessEnvDiagnostic(),
    secrets_provider: await secretsProviderDiagnostic(),
    project_schema: await projectSchemaDiagnostic(),
    stack: await stackDiagnostic(),
    tooling_isolation: toolingIsolationDiagnostic(),
    env_schema: envSchemaDiagnostic(),
    pending_actions: [],
  };

  // A linked worktree gets ONE fix for missing setup (worktree:provision),
  // replacing the primary-checkout `.env` copy and `bun install` below.
  const worktreeFix = report.worktree_of === null
    ? null
    : worktreeSetupAction({
        envFile: report.env_file_exists,
        deps: report.deps_installed,
        // A foreign hook manager (lefthook, simple-git-hooks, ...) installs its
        // own hooks: `.husky/_` is never created there, on purpose.
        gitHooks: existsSync(join(REPO_ROOT, '.husky', '_')) || detectHookManager(REPO_ROOT).foreign,
      });
  if (worktreeFix !== null) { report.pending_actions.push(worktreeFix); }

  // .env presence
  if (!report.env_file_exists && worktreeFix === null) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'cp .env.example .env',
      hint: 'Create .env from the template; then fill in the vars below.',
    });
  }

  // env vars
  const envValues = report.env_file_exists
    ? parseEnvFile(await readFile(ENV_PATH, 'utf8'))
    : {};
  for (const v of REQUIRED_VARS) {
    const value = envValues[v];
    const isSet = value !== undefined && value.trim().length > 0;
    report.env_vars[v] = isSet ? 'set' : 'missing';
    if (!isSet) {
      report.pending_actions.push({
        type: 'credential',
        target: v,
        hint: VAR_HINTS[v]?.hint ?? `Required env var: ${v}`,
        where: VAR_HINTS[v]?.where,
      });
    }
  }

  // Atlassian host — a yaml field, NOT an env var. Checking `process.env` here
  // would be worse than useless: the variable's absence is the desired state,
  // and its PRESENCE is the bug (a stale copy inherited from the parent shell is
  // exactly what silently pointed `jira:sync-issues` at a dead site).
  try {
    const instance = resolveAtlassianInstance();
    report.atlassian_host = { status: 'set', value: instance.baseUrl, source: instance.source };
    const warning = formatInstanceMismatchWarning(instance);
    if (warning !== null) {
      report.pending_actions.push({
        type: 'shell_command',
        target: 'unset ATLASSIAN_URL',
        hint: warning,
      });
    }
    else if (instance.source === 'env') {
      report.pending_actions.push({
        type: 'shell_command',
        target: 'bun run agents:setup',
        hint: 'Atlassian host is coming from an ATLASSIAN_URL env var, not from '
          + '.agents/project.yaml. That fallback exists for a repo that has not been set up '
          + 'yet; write the host to the yaml so it is versioned and cannot go stale.',
      });
    }
  }
  catch {
    report.atlassian_host = { status: 'missing' };
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun run agents:setup',
      hint: 'Atlassian host not set. Fill `issue_tracker.atlassian_url` in '
        + '.agents/project.yaml — it is the source of truth for every jira:sync-* script '
        + 'and for `acli --site`. Read it back with `bun run --silent jira:url`.',
    });
  }

  // Legacy detection: ATLASSIAN_* is now the single credential family. Any
  // JIRA_URL / JIRA_USERNAME / JIRA_API_TOKEN still in `.env` is leftover from
  // before the DRY rename and should be removed. Nothing reads them anymore;
  // acli and the sync scripts read ATLASSIAN_* directly, and the Atlassian
  // MCP server is opt-in via docs/mcp/. On an adopted app a retired name the
  // app declares in its own part of `.env.example` is the app's variable:
  // reported, never a removal (same rule as `vars:env:check`).
  const { appOwnedExampleKeys } = await import('./lib/updater-adopt.ts');
  const legacy = legacyCredentialKeys(envValues, appOwnedExampleKeys(REPO_ROOT));
  report.legacy_jira_cred_keys = legacy.remove;
  report.app_owned_retired_keys = legacy.appOwned;
  if (report.legacy_jira_cred_keys.length > 0) {
    report.pending_actions.push({
      type: 'shell_command',
      target: '.env cleanup',
      hint: `Remove legacy credential keys from .env: ${report.legacy_jira_cred_keys.join(', ')}. ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN are now the single source — acli and the sync scripts read ATLASSIAN_* directly; the Atlassian MCP server is opt-in via docs/mcp/.`,
    });
  }

  // node_modules / varlock
  if (!report.deps_installed && worktreeFix === null) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun install',
      hint: 'Install project dependencies including varlock (the env schema gates and `bunx varlock run -- <cmd>`).',
    });
  }

  // .mcp.json / opencode.jsonc presence, only for a harness in use: a project
  // that dropped one deleted its config on purpose (ADR-0013).
  const harnessInUse = (harness: Harness): boolean => report.agent_compatibility.harnesses.includes(harness);
  if (!report.mcp_json_exists && harnessInUse('claude')) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore .mcp.json',
      hint: '.mcp.json is missing. Restore from git — it is the committed Claude Code config.',
    });
  }
  if (!report.opencode_jsonc_exists && harnessInUse('opencode')) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore opencode.jsonc',
      hint: 'opencode.jsonc is missing. Restore from git — it is the committed OpenCode config.',
    });
  }
  if (!report.codex_config_exists && harnessInUse('codex')) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore .codex/config.toml',
      hint: '.codex/config.toml is missing. Restore from git — it is the committed Codex (CLI + Desktop) config.',
    });
  }

  // A missing `.env` (or an unprovisioned worktree) already has its own action
  // above: the retirement compares each copy with `.env`, so fix that first.
  if (!report.harness_env.ok && report.env_file_exists && worktreeFix === null) {
    const blocking = report.harness_env.findings.filter(f => f.blocking);
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun run harness:env',
      hint: 'A plaintext copy of an MCP credential is still on disk, readable by any agent, '
        + 'although every MCP server now reads .env through the .env loader. The command deletes a copy '
        + `.env reproduces and backs up the rest, naming them: ${
          blocking.map(f => `${f.kind} (${f.names.join(', ')})`).join('; ')}`,
      where: '.claude/settings.local.json + .auth/opencode/',
    });
  }

  // Secret manager: a provider without its overlay resolves nothing from the
  // vault, and an overlay with `provider: local` still does. Both are the yaml
  // and the committed file disagreeing; `bun setup` rewrites the pair.
  const sp = report.secrets_provider;
  if (sp.note !== null && sp.provider === null) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun setup',
      hint: `The secrets: block of .agents/project.yaml could not be read (${sp.note}). Fix it, or re-run the secret-manager step of setup.`,
      where: '.agents/project.yaml',
    });
  }
  else if (sp.provider !== null && sp.provider !== 'local' && !sp.overlay_present) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun setup',
      hint: `secrets.provider is ${sp.provider} but .env.provider.schema is missing, so nothing resolves from the vault and every launch reads .env alone. Re-run the secret-manager step of setup to write the overlay.`,
      where: '.env.provider.schema',
    });
  }
  else if (sp.provider === 'local' && sp.overlay_present && sp.vault_items.length > 0) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun setup',
      hint: `secrets.provider is local but .env.provider.schema still resolves ${sp.vault_items.join(', ')} from a vault. Pick one: re-run the secret-manager step of setup, or delete the overlay.`,
      where: '.env.provider.schema',
    });
  }
  if (sp.provider === '1password' && sp.cli_installed === false) {
    report.pending_actions.push({
      type: 'system_install',
      target: 'op',
      hint: 'secrets.provider is 1password and the 1Password CLI is not on PATH, so every vault-backed item resolves empty on this machine (CI uses OP_SERVICE_ACCOUNT_TOKEN instead).',
      where: 'https://developer.1password.com/docs/cli/get-started/',
    });
  }

  // Cross-harness contract. Repository trust is NOT a pending action: it lives
  // inside Codex, and nothing on disk can prove or disprove it.
  if (!report.agent_compatibility.file_correct) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun run agents:compat',
      hint: `Repair the generated compatibility artifacts (Claude skills alias; a command that shadows a skill moves to .backups/shadowing-commands/), then restore any canonical/config file doctor still reports: ${report.agent_compatibility.errors.join('; ')}`,
    });
  }

  // The env schema verdict. Only an INVALID load is an action: the schema
  // requires nothing (ADR-0010), so this fires on a malformed typed value.
  if (report.env_schema.validation === 'invalid') {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bunx varlock load --agent',
      hint: 'Your .env does not satisfy the committed env schema (.env.schema + .env.core.schema). '
        + 'The command names the failing items with sensitive values redacted; fix them in .env and re-run doctor.',
      where: report.env_schema.errors[0],
    });
  }

  if (report.pending_actions.length > 0) {
    report.status = 'needs-action';
  }
  return report;
}

// The SGR escape (`ESC [ ... m`) built from its code point: a literal control
// character in a regex trips `no-control-regex`, and that rule is right that a
// reader cannot see it.
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Runs `bunx varlock load --agent` at the repo root. `--agent` is the mode
 * built for exactly this consumer: JSON, sensitive values redacted. Stdout is
 * parsed for the item COUNT and discarded; the redacted lines are kept as the
 * diagnosis when the load fails. Skipped when the schema or the pinned
 * devDependency is absent, so a repo synced to this doctor but not to this
 * package.json is not told its env is broken.
 */
function envSchemaDiagnostic(): EnvSchemaDiagnostic {
  const schemaPresent = existsSync(join(REPO_ROOT, PROJECT_SCHEMA_FILE)) && existsSync(join(REPO_ROOT, CORE_SCHEMA_FILE));
  const devDep = varlockInstalled(REPO_ROOT);

  let binary: EnvSchemaDiagnostic['binary'] = 'missing';
  let binaryVersion: string | null = null;
  // `bun run setup:doctor` prepends node_modules/.bin to PATH, so a bare probe
  // would find the devDependency's shim and call it "standalone". Strip every
  // such segment: the question is what a process spawned outside the repo's
  // scripts finds.
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const binMarker = join('node_modules', '.bin');
  const outsidePath = (process.env.PATH ?? '').split(pathSep).filter(seg => !seg.includes(binMarker)).join(pathSep);
  const candidates = process.platform === 'win32' ? ['varlock', 'varlock.cmd'] : ['varlock'];
  for (const name of candidates) {
    const probe = spawnSync(name, ['--version'], { encoding: 'utf8', env: { ...process.env, PATH: outsidePath }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!probe.error && probe.status === 0) {
      binary = 'standalone';
      binaryVersion = (probe.stdout ?? '').trim() || null;
      break;
    }
  }
  if (binary === 'missing' && devDep) {
    binary = 'devDependency';
    try {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'node_modules', 'varlock', 'package.json'), 'utf8')) as { version?: string };
      binaryVersion = pkg.version ?? null;
    }
    catch {
      binaryVersion = null;
    }
  }

  const base: EnvSchemaDiagnostic = { schema_present: schemaPresent, binary, binary_version: binaryVersion, validation: 'skipped', items: 0, errors: [] };
  if (!schemaPresent || !devDep) { return base; }

  // A deprecated key still in `.env` is not declared, and an undeclared EMPTY
  // key fails varlock: neutralize them so this verdict is about the declared
  // items. The "Legacy JIRA_* credential keys" section asks for their removal.
  const deprecatedInFile = existsSync(ENV_PATH) ? deprecatedEnvKeysIn(readFileSync(ENV_PATH, 'utf8')) : [];
  const run = spawnSync('bunx', ['varlock', 'load', '--agent'], {
    cwd: REPO_ROOT,
    env: neutralizeDeprecatedKeys({ ...process.env }, deprecatedInFile),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (run.error) {
    return { ...base, validation: 'invalid', errors: [`could not run bunx varlock: ${run.error.message}`] };
  }
  if (run.status !== 0) {
    // Only stderr: varlock's diagnostics name the failing items, while stdout
    // carries the (redacted) values blob this report never needs.
    const lines = (run.stderr ?? '')
      .split(/\r?\n/)
      .map(l => l.replace(ANSI_SGR, '').trim())
      .filter(l => l !== '' && !l.startsWith('💥') && !l.startsWith('🚨'));
    return { ...base, validation: 'invalid', errors: lines.slice(0, 20) };
  }
  let items = 0;
  try {
    items = Object.keys(JSON.parse(run.stdout) as Record<string, unknown>).filter(name => !deprecatedInFile.includes(name)).length;
  }
  catch {
    // A non-JSON success is still a success; the count is informational.
  }
  return { ...base, validation: 'ok', items };
}

// ----------------------------------------------------------------------------
// Output formatters
// ----------------------------------------------------------------------------

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  bold: '\x1B[1m',
};

function printHuman(report: DoctorReport): void {
  const statusLabel = report.status === 'ok' ? 'OK' : 'needs action';

  tui.section(`Setup doctor — ${statusLabel}`);

  tui.kv([
    { k: 'Platform', v: report.platform },
    { k: 'Shell', v: report.shell || '(unset)' },
    { k: 'TTY', v: report.is_tty ? 'yes' : 'no (running non-interactive)' },
  ]);

  process.stdout.write('\n');

  // File + dep checks as a table
  const compat = report.agent_compatibility;
  const inUse = (harness: Harness): boolean => compat.harnesses.includes(harness);
  const notUsed = `${tui.statusIcon('ok')} not used`;
  const hostList = (hosts: { claude: boolean, opencode: boolean, codex: boolean }): string =>
    compat.harnesses.map(host => `${host}:${hosts[host] ? 'ok' : 'FAIL'}`).join(' ');
  const fileRow = (exists: boolean, harness: Harness): string =>
    !inUse(harness) ? notUsed : exists ? tui.statusIcon('ok') : tui.statusIcon('fail');
  const harnessCount = `${compat.harnesses.length} harness${compat.harnesses.length === 1 ? '' : 'es'}`;
  const checks: string[][] = [
    ['.env file', report.env_file_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['Harnesses in use', compat.harnesses.map(h => HARNESS_LABEL[h]).join(', ')],
    ['.mcp.json', fileRow(report.mcp_json_exists, 'claude')],
    ['opencode.jsonc', fileRow(report.opencode_jsonc_exists, 'opencode')],
    ['.codex/config.toml', fileRow(report.codex_config_exists, 'codex')],
    [inUse('claude') ? 'AGENTS.md + CLAUDE.md shim' : 'AGENTS.md', compat.instructions.agents_md && compat.instructions.claude_shim ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    [inUse('claude') ? 'Canonical .agents/skills + Claude alias' : 'Canonical .agents/skills', compat.instructions.canonical_skills && compat.instructions.claude_alias ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    [`Hook adapters (${compat.harnesses.map(h => HARNESS_LABEL[h]).join('/')})`, compat.hooks.ok ? tui.statusIcon('ok') : `${tui.statusIcon('fail')} ${hostList(compat.hooks)}`],
    [`MCP parity (${compat.mcp.expected_servers} servers x ${harnessCount})`, compat.mcp.parity ? tui.statusIcon('ok') : `${tui.statusIcon('fail')} ${hostList(compat.mcp)}`],
  ];
  if (inUse('codex')) {
    checks.push(
      ['Codex repository config (config.toml + hooks.json)', compat.codex.repository_configured ? tui.statusIcon('ok') : tui.statusIcon('fail')],
      ['Codex CLI executable', compat.codex.cli_detected ? tui.statusIcon('ok') : `${tui.statusIcon('warn')} not on PATH; Desktop still reads the repository config`],
      ['Codex repository trust', `${tui.statusIcon('warn')} required; runtime state, not file-verifiable`],
    );
  }
  else {
    checks.push(['Codex', notUsed]);
  }
  checks.push(
    ['node_modules', report.deps_installed ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ...(report.worktree_of !== null ? [['Linked worktree of', `${tui.statusIcon('info')} ${report.worktree_of}`]] : []),
  );
  // The host is shown by VALUE, not as a set/missing tick. Reading which site
  // the repo is about to write to is the entire point — a green check that says
  // "configured" is exactly what let a dead instance go unnoticed.
  const hostRow = ((): string => {
    const host = report.atlassian_host;
    if (host.status !== 'set') { return tui.statusIcon('fail'); }
    const fromYaml = host.source === 'project.yaml';
    const icon = tui.statusIcon(fromYaml ? 'ok' : 'warn');
    const note = fromYaml ? '' : ' (from ATLASSIAN_URL env — not versioned)';
    return `${icon} ${host.value}${note}`;
  })();
  checks.push(['Atlassian host (.agents/project.yaml)', hostRow]);
  process.stdout.write(`${tui.table(['Check', 'Status'], checks)}\n`);

  // Env vars as a table
  tui.section('Env vars');
  const envRows = Object.entries(report.env_vars).map(([k, v]) => [
    k,
    v === 'set' ? tui.statusIcon('ok') : tui.statusIcon('fail'),
    v === 'set' ? 'set' : 'missing',
  ]);
  process.stdout.write(`${tui.table(['Variable', 'Status', 'Value'], envRows)}\n`);

  // Plaintext MCP credential copies. Its own section because it is
  // per-VARIABLE and per-file: an exit code says a copy remains, it does not say
  // WHICH credential sits in WHICH file.
  tui.section('Plaintext MCP credential copies (MCP servers read .env through the .env loader)');
  process.stdout.write(`  ${tui.statusIcon(report.harness_env.ok ? 'ok' : 'fail')} ${report.harness_env.summary}\n`);
  process.stdout.write(`  MCP credentials declared: ${report.harness_env.allowlist.join(', ') || '(none)'}\n`);
  for (const finding of report.harness_env.findings) {
    process.stdout.write(`  ${tui.statusIcon(finding.blocking ? 'fail' : 'warn')} ${finding.kind}: ${finding.names.join(', ') || '-'}\n`);
    process.stdout.write(`    ${finding.detail}\n`);
  }
  if (!report.harness_env.ok) {
    process.stdout.write('  Fix: bun run harness:env  (retires the copies; values are never printed by it or by this report)\n');
  }
  process.stdout.write('\n');

  // Secret source. Names where values come from and what reads them: only a
  // varlock launch (the MCP .env loader, `bunx varlock run -- <cmd>`, the
  // gates) reaches the vault; a shell that sourced .env does not.
  tui.section('Secret source (.agents/project.yaml -> secrets:)');
  const sp = report.secrets_provider;
  if (sp.provider === null) {
    process.stdout.write(`  ${tui.statusIcon('fail')} provider unknown: ${sp.note ?? 'not read'}\n`);
  }
  else if (sp.provider === 'local') {
    process.stdout.write(`  ${tui.statusIcon(sp.overlay_present && sp.vault_items.length > 0 ? 'warn' : 'ok')} local: values come from .env / .env.local${sp.overlay_present && sp.vault_items.length > 0 ? ` (but .env.provider.schema still resolves ${sp.vault_items.join(', ')})` : ''}\n`);
  }
  else {
    process.stdout.write(`  ${tui.statusIcon(sp.overlay_present ? 'ok' : 'fail')} ${sp.provider}: overlay ${sp.overlay_present ? `present, ${sp.vault_items.length} item(s) from the vault: ${sp.vault_items.join(', ') || '(none active)'}` : 'MISSING (nothing resolves from the vault)'}\n`);
    if (sp.cli_installed !== null) {
      process.stdout.write(`  ${tui.statusIcon(sp.cli_installed ? 'ok' : 'warn')} manager CLI ${sp.cli_installed ? 'on PATH' : 'not on PATH (vault items resolve empty here; CI uses its service-account token)'}\n`);
    }
    process.stdout.write('  Vault values reach: every MCP server (.env loader) and `bunx varlock run -- <cmd>`. The agent session itself holds none (ADR-0016).\n');
    process.stdout.write('  They do NOT reach a shell that sourced .env (`source .env`): run a shell CLI as `bunx varlock run -- <cmd>` instead.\n');
  }
  process.stdout.write('\n');

  // Env schema (varlock). Its own section because it carries three facts: is
  // the schema there, which varlock can run, does the developer's .env satisfy
  // it. Nothing here prints a value; `--agent` redacts and this report keeps
  // only names.
  tui.section('Env schema (varlock: .env.schema + .env.core.schema)');
  const es = report.env_schema;
  const binaryNote = es.binary === 'standalone'
    ? `standalone binary${es.binary_version ? ` ${es.binary_version}` : ''}`
    : es.binary === 'devDependency'
      ? `devDependency only${es.binary_version ? ` (${es.binary_version})` : ''}; enough for the gates and bunx varlock run -- <cmd>`
      : 'not found; run bun install (devDependency)';
  process.stdout.write(`  ${tui.statusIcon(es.schema_present ? 'ok' : 'fail')} schema files ${es.schema_present ? 'present' : 'missing (bun run vars:schema)'}\n`);
  process.stdout.write(`  ${tui.statusIcon(es.binary === 'missing' ? 'fail' : 'ok')} varlock: ${binaryNote}\n`);
  if (es.validation === 'ok') {
    process.stdout.write(`  ${tui.statusIcon('ok')} .env satisfies the schema (${es.items} items resolved, values redacted)\n`);
  }
  else if (es.validation === 'invalid') {
    process.stdout.write(`  ${tui.statusIcon('fail')} .env does not satisfy the schema:\n`);
    for (const line of es.errors) { process.stdout.write(`    ${line}\n`); }
    process.stdout.write('  Fix: correct the named items in .env, then: bunx varlock load --agent\n');
  }
  else {
    process.stdout.write(`  ${tui.statusIcon('warn')} validation skipped (schema or devDependency absent)\n`);
  }
  process.stdout.write('\n');

  // Project schema gap. Its own section and NOT a check row: nothing here is a
  // failure, and it must never push the report to `needs action`. It answers a
  // different question from the checks above: not "is something broken" but
  // "has upstream moved and am I still on the old shape".
  const ps = report.project_schema;
  if (ps.note !== null || ps.gaps.length > 0 || ps.copied_template) {
    tui.section('Project config vs upstream schema (.agents/project.yaml)');
    if (ps.copied_template) {
      process.stdout.write(`  ${tui.statusIcon('warn')} .agents/project.yaml is the boilerplate maintainers' own copy (GitHub "Use this template"): their git_strategy and push authorization\n`);
      process.stdout.write('  Fix: bun run agents:setup  (replaces it with the blank template after one confirm)\n');
    }
    if (ps.note !== null) {
      process.stdout.write(`  ${tui.statusIcon('warn')} ${ps.note}\n`);
    }
    else if (ps.gaps.length > 0) {
      const total = ps.gaps.reduce((n, g) => n + g.paths.length, 0);
      process.stdout.write(`  ${tui.statusIcon('warn')} upstream declares ${total} key path(s) this project does not have\n`);
      for (const gap of ps.gaps) {
        process.stdout.write(`  ${gap.block}${gap.wholeBlock ? ' (whole block)' : ''}: ${gap.paths.join(', ')}\n`);
      }
      process.stdout.write('  Fix: bun sync  (offers to insert them, one prompt per block, insert-only)\n');
    }
    if (ps.exempt.length > 0) {
      process.stdout.write(`  silenced via updater.schema_exempt: ${ps.exempt.join(', ')}\n`);
    }
    process.stdout.write('\n');
  }

  // Stack descriptor. Its own section and never a check row, for the same
  // reason as the schema gap above. Silent when the block is present, valid,
  // and either matches the repo or has no app to be compared against yet.
  const st = report.stack;
  if (st.note !== null || !st.present || st.issues.length > 0 || st.unsupported.length > 0 || st.drift.length > 0) {
    tui.section('Stack descriptor (.agents/project.yaml -> stack:)');
    if (st.note !== null) {
      process.stdout.write(`  ${tui.statusIcon('warn')} ${st.note}\n`);
    }
    else if (!st.present) {
      process.stdout.write(`  ${tui.statusIcon('warn')} no \`stack:\` block: skills fall back to the greenfield defaults\n`);
      process.stdout.write('  Fix: bun run agents:setup --stack  (inserts the block from the schema and fills it from the repo)\n');
    }
    else {
      for (const issue of st.issues) {
        process.stdout.write(`  ${tui.statusIcon('warn')} stack.${issue.path} ${issue.message}\n`);
      }
      for (const issue of st.unsupported) {
        process.stdout.write(`  ${tui.statusIcon('info')} stack.${issue.path} ${issue.message}\n`);
      }
      for (const d of st.drift) {
        process.stdout.write(`  ${tui.statusIcon('warn')} stack.${d.path}: declared ${d.declared ?? 'null'}, repo shows ${d.detected ?? 'null'} (${d.evidence})\n`);
      }
      if (st.issues.length > 0 || st.drift.length > 0) {
        process.stdout.write('  Fix: bun run agents:setup --stack  (one prompt per field, evidence shown)\n');
      }
    }
    process.stdout.write('\n');
  }

  // Tooling isolation on an adopted app. Its own section and never a check
  // row: the fix is a hand edit of one of the app's files.
  if (report.tooling_isolation.pending.length > 0) {
    tui.section('Tooling isolation (adopted app)');
    for (const line of report.tooling_isolation.pending) {
      process.stdout.write(`  ${tui.statusIcon('warn')} ${line}\n`);
    }
    process.stdout.write('  Fix: by hand in the app\'s own files; the exact lines are in .agents/prompts/adopt-tooling-isolation.md (written by the --adopt run)\n\n');
  }

  // Servers that are not in the project config because they run at harness
  // level. Its own section and never a check row: a claude.ai connector is
  // invisible to a file read, so "not detectable" must never look like "missing".
  tui.section('MCP servers provided at harness level (not in .mcp.json by design)');
  for (const verdict of report.harness_level_mcps.verdicts) {
    const icon = tui.statusIcon(verdict.state === 'provided elsewhere' ? 'ok' : 'info');
    process.stdout.write(`  ${icon} ${verdict.id} (${verdict.capability}): ${verdict.state}${verdict.hosts.length > 0 ? ` (${verdict.hosts.join(', ')})` : ''}\n`);
    process.stdout.write(`    ${verdict.detail}\n`);
  }
  process.stdout.write(`  read: ${report.harness_level_mcps.sources.length > 0 ? report.harness_level_mcps.sources.join(', ') : '(no user-level config found)'}\n\n`);

  if (report.context_maps.length > 0) {
    tui.section('Business context maps not generated yet');
    for (const line of report.context_maps) {
      process.stdout.write(`  ${tui.statusIcon('info')} ${line.replace(/`/g, '')}\n`);
    }
    process.stdout.write('\n');
  }

  // Legacy JIRA_* credential keys (pre-DRY .env leftover)
  if (report.legacy_jira_cred_keys.length > 0) {
    tui.section('Legacy JIRA_* credential keys in .env');
    for (const key of report.legacy_jira_cred_keys) {
      process.stdout.write(`  ${tui.statusIcon('warn')} ${key} — remove (replaced by ATLASSIAN_* family)\n`);
    }
    process.stdout.write(`  ${COLORS.dim}acli and the sync scripts read ATLASSIAN_* directly; the Atlassian MCP server is opt-in via docs/mcp/.${COLORS.reset}\n\n`);
  }
  if (report.app_owned_retired_keys.length > 0) {
    tui.section('Retired tooling names the app declares as its own');
    for (const key of report.app_owned_retired_keys) {
      process.stdout.write(`  ${tui.statusIcon('info')} ${key}: the app's own variable (declared above the tooling block of .env.example), kept; the tooling does not read it\n`);
    }
    process.stdout.write('\n');
  }

  if (compat.errors.length > 0) {
    tui.section('Cross-harness compatibility errors');
    // The alias line stands on its own: right after the migration it is
    // deferred on purpose, and that must not read as one more broken contract.
    process.stdout.write(`  ${tui.statusIcon(compat.alias.status === 'valid' || compat.alias.status === 'not-used' ? 'ok' : compat.alias.status === 'deferred' ? 'warn' : 'fail')} ${describeAliasStatus(compat.alias)}\n`);
    for (const bucket of compat.errors_by_surface) {
      process.stdout.write(`  ${COLORS.bold}${bucket.label}${COLORS.reset}\n`);
      for (const error of bucket.errors) {
        process.stdout.write(`    ${tui.statusIcon('fail')} ${error}\n`);
      }
    }
    process.stdout.write(`  ${COLORS.dim}Generated artifacts: bun run agents:compat. Canonical/config files: fix by hand, then re-run doctor.${COLORS.reset}\n\n`);
  }

  if (report.pending_actions.length > 0) {
    tui.section('Pending actions');
    for (const action of report.pending_actions) {
      process.stdout.write(`  ${COLORS.yellow}[${action.type}]${COLORS.reset} ${action.target}\n`);
      process.stdout.write(`    ${action.hint}\n`);
      if (action.where) {
        process.stdout.write(`    ${COLORS.dim}-> ${action.where}${COLORS.reset}\n`);
      }
    }
    process.stdout.write(`\n${COLORS.dim}For AI agents: bun run setup:doctor --json  (machine-readable)${COLORS.reset}\n`);
  }
  else {
    process.stdout.write('\n');
    process.stdout.write(`${tui.successBox([
      'All file checks green. Open the agent in this folder: claude  /  opencode  /  codex (or its desktop app)',
      'Codex Desktop reads the same repository config; approve repository trust there before hooks run.',
    ])}\n`);
  }
}

// ----------------------------------------------------------------------------
// Preflight (alias of the setup gate in cli/preflight.ts)
// ----------------------------------------------------------------------------

/**
 * `--preflight`: an alias of the setup gate (`cli/preflight.ts --for setup
 * --gate`, node:* only), kept for the scripts and docs that still call it.
 * `bun setup` calls the gate directly: this file statically imports modules
 * that need `node_modules`, so on a fresh clone it cannot load before
 * `bun install` (analysis §8 #3).
 */
async function runPreflight(): Promise<never> {
  const { runSetupGate } = await import('./preflight.ts');
  const env = process.env;
  const lang = (env.LC_ALL || env.LC_MESSAGES || env.LANG || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  process.exit(await runSetupGate({ cwd: REPO_ROOT, lang }));
}

// ----------------------------------------------------------------------------
// Entry
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes('--preflight')) {
    await runPreflight(); // never returns
    return;
  }

  // Full mode needs the TUI (boxen/cli-table3/figures/picocolors). Load it lazily
  // here — NOT at module top — so `--preflight` stays dependency-free and runs on
  // a fresh clone before `bun install`.
  tui = await import('./lib/tui.ts');

  const asJson = process.argv.includes('--json');
  try {
    const report = await runDoctor();
    if (asJson) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    else {
      printHuman(report);
    }
    process.exit(report.status === 'ok' ? 0 : 1);
  }
  catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Exit 2 = doctor internal error (distinct from 1 = needs-action). In --json
    // mode emit a JSON envelope so agent consumers don't choke on a bare string.
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ status: 'error', error: msg }, null, 2)}\n`);
    }
    else {
      process.stderr.write(`Doctor failed: ${msg}\n`);
    }
    process.exit(2);
  }
}

if (import.meta.main) { void main(); }
