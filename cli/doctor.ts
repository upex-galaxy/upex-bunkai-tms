#!/usr/bin/env bun
/**
 * Setup doctor — read-only health check for the agentic-dev-boilerplate setup.
 *
 * Outputs a structured report (human-readable by default, JSON with --json)
 * describing what's wired correctly and what still needs action. Designed for
 * AI agents driving the setup: parse the JSON, take action on each
 * pending_actions entry, then re-run until status === "ok".
 *
 * Usage:
 *   bun run setup:doctor              # human-readable summary
 *   bun run setup:doctor --json       # machine-readable JSON
 *   bun run setup:doctor --preflight  # blocker-only gate for `bun run setup`
 *
 * --preflight mode: minimal pre-install gate. Checks only the things that
 * would crash `cli/install.ts` at module-load time (Bun runtime present and
 * recent enough, `node_modules/@inquirer/prompts` resolvable). Skips env
 * vars, MCPs, direnv, external CLIs — those are install.ts's job. Uses only
 * node built-ins so it runs safely before `bun install`. Wired into the
 * `setup` npm script as `bun cli/doctor.ts --preflight && bun cli/install.ts`.
 *
 * Exit code:
 *   0 if status === "ok"     (full mode) or preflight passes
 *   1 if status === "needs-action"  or preflight blocker hit
 *
 * Side effects: none. This script never edits files or installs anything.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

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
const NODE_MODULES_DOTENV = join(REPO_ROOT, 'node_modules', 'dotenv-cli');
// --preflight mode resolves install.ts's only third-party import.
const INQUIRER_MARKER = join(REPO_ROOT, 'node_modules', '@inquirer', 'prompts', 'package.json');

// Minimum Bun version that install.ts is known to work with.
const MIN_BUN: readonly [number, number, number] = [1, 0, 0];

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
const DAY_ZERO_VARS = [
  'TAVILY_API_KEY',
  'RESEND_API_KEY',
  'ATLASSIAN_URL',
  'ATLASSIAN_EMAIL',
  'ATLASSIAN_API_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
] as const;

const PROJECT_BOUND_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_JWT_SECRET',
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DATABASE',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL',
  'N8N_API_URL',
  'N8N_API_KEY',
] as const;

const REQUIRED_VARS = [...DAY_ZERO_VARS, ...PROJECT_BOUND_VARS] as const;

// Legacy credential keys some users may still have in `.env` from before the
// DRY rename or before the legacy-Supabase-keys removal. Detected so doctor
// can emit a migration hint — they're harmless (nothing reads them anymore)
// but signal a stale .env.
const LEGACY_JIRA_CRED_KEYS = [
  'JIRA_URL',
  'JIRA_USERNAME',
  'JIRA_API_TOKEN',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const VAR_HINTS: Record<string, { hint: string, where: string }> = {
  TAVILY_API_KEY: {
    hint: 'Tavily web-search MCP API key',
    where: 'https://app.tavily.com/  →  account  →  API keys',
  },
  RESEND_API_KEY: {
    hint: 'Resend API key (transactional email + resend CLI auth)',
    where: 'https://resend.com/api-keys  (docs: https://resend.com/docs/api-reference/introduction)',
  },
  ATLASSIAN_URL: {
    hint: 'Atlassian credentials (canonical) — see .env.example',
    where: 'e.g. https://yourorg.atlassian.net',
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

type PendingActionType = 'credential' | 'shell_hook' | 'system_install' | 'shell_command';

interface PendingAction {
  type: PendingActionType
  target: string
  hint: string
  where?: string
}

interface DirenvState {
  installed: boolean
  version?: string
  envrc_allowed?: boolean
  hook_in_rc?: boolean
  rc_file?: string
}

interface DoctorReport {
  status: 'ok' | 'needs-action'
  repo_root: string
  platform: NodeJS.Platform
  shell: string
  is_tty: boolean
  env_file_exists: boolean
  env_vars: Record<string, 'set' | 'missing'>
  legacy_jira_cred_keys: string[]
  mcp_json_exists: boolean
  opencode_jsonc_exists: boolean
  deps_installed: boolean
  direnv: DirenvState
  pending_actions: PendingAction[]
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

async function detectDirenv(): Promise<DirenvState> {
  const version = tryRun('direnv', ['version']);
  if (!version.ok) { return { installed: false }; }

  const status = tryRun('direnv', ['status']);
  // Modern direnv prints `Found RC allowed 0` (0 = Allow); older variants used
  // `true`. Match the numeric enum and treat 0 (or legacy true) as allowed.
  const allowMatch = status.stdout.match(/Found RC allowed (\d+|true)/);
  const envrcAllowed = allowMatch !== null && (allowMatch[1] === '0' || allowMatch[1] === 'true');

  const candidates = ['.bashrc', '.zshrc', '.bash_profile', '.profile'];
  let hookInRc = false;
  let rcFile: string | undefined;
  for (const file of candidates) {
    const path = join(homedir(), file);
    if (!existsSync(path)) { continue; }
    try {
      const content = await readFile(path, 'utf8');
      if (/\bdirenv\s+hook\b/.test(content)) {
        hookInRc = true;
        rcFile = path;
        break;
      }
    }
    catch {
      // skip unreadable files (permissions, broken symlinks)
    }
  }

  return {
    installed: true,
    version: version.stdout.trim(),
    envrc_allowed: envrcAllowed,
    hook_in_rc: hookInRc,
    rc_file: rcFile,
  };
}

function installCommandForPlatform(): string {
  if (process.platform === 'win32') {
    return 'winget install direnv';
  }
  if (process.platform === 'darwin') {
    return 'brew install direnv';
  }
  return 'sudo apt install direnv  (or: dnf install direnv / pacman -S direnv)';
}

function shellHookLine(): { line: string, rc: string } {
  const shell = (process.env.SHELL ?? '').toLowerCase();
  if (shell.endsWith('zsh')) {
    return { line: 'eval "$(direnv hook zsh)"', rc: '~/.zshrc' };
  }
  if (shell.endsWith('fish')) {
    return { line: 'direnv hook fish | source', rc: '~/.config/fish/config.fish' };
  }
  if (shell.endsWith('bash')) {
    return { line: 'eval "$(direnv hook bash)"', rc: '~/.bashrc' };
  }
  // No POSIX $SHELL (typical on native Windows PowerShell) — advise the pwsh hook
  // instead of mis-instructing the user to edit ~/.bashrc.
  if (process.platform === 'win32') {
    return { line: 'Invoke-Expression "$(direnv hook pwsh)"', rc: '$PROFILE' };
  }
  return { line: 'eval "$(direnv hook bash)"', rc: '~/.bashrc' };
}

function parseBunVersion(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) { return null; }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersion(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) { return a[i] - b[i]; }
  }
  return 0;
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
    legacy_jira_cred_keys: [],
    mcp_json_exists: existsSync(MCP_PATH),
    opencode_jsonc_exists: existsSync(OPENCODE_PATH),
    deps_installed: existsSync(NODE_MODULES_DOTENV),
    direnv: { installed: false },
    pending_actions: [],
  };

  // .env presence
  if (!report.env_file_exists) {
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

  // Legacy detection: ATLASSIAN_* is now the single credential family. Any
  // JIRA_URL / JIRA_USERNAME / JIRA_API_TOKEN still in `.env` is leftover from
  // before the DRY rename and should be removed. Nothing reads them anymore;
  // acli and the sync scripts read ATLASSIAN_* directly, and the Atlassian
  // MCP server is opt-in via docs/mcp/.
  for (const key of LEGACY_JIRA_CRED_KEYS) {
    const value = envValues[key];
    if (value !== undefined && value.trim().length > 0) {
      report.legacy_jira_cred_keys.push(key);
    }
  }
  if (report.legacy_jira_cred_keys.length > 0) {
    report.pending_actions.push({
      type: 'shell_command',
      target: '.env cleanup',
      hint: `Remove legacy credential keys from .env: ${report.legacy_jira_cred_keys.join(', ')}. ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN are now the single source — acli and the sync scripts read ATLASSIAN_* directly; the Atlassian MCP server is opt-in via docs/mcp/.`,
    });
  }

  // node_modules / dotenv-cli
  if (!report.deps_installed) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun install',
      hint: 'Install project dependencies including dotenv-cli (needed for `bun claude`).',
    });
  }

  // direnv (optional — wrapper still works without it)
  report.direnv = await detectDirenv();
  if (!report.direnv.installed) {
    report.pending_actions.push({
      type: 'system_install',
      target: 'direnv',
      hint: 'Optional. Without direnv, launch with `bun claude` / `bun opencode` (wrapper). Install if you want `claude` to work directly via shell autoload.',
      where: installCommandForPlatform(),
    });
  }
  else {
    if (!report.direnv.envrc_allowed) {
      report.pending_actions.push({
        type: 'shell_command',
        target: 'direnv allow',
        hint: 'Approve this repo\'s .envrc so direnv auto-loads .env on cd.',
      });
    }
    if (!report.direnv.hook_in_rc) {
      const hook = shellHookLine();
      report.pending_actions.push({
        type: 'shell_hook',
        target: hook.rc,
        hint: `Add the direnv shell hook to ${hook.rc} so 'cd' into this repo auto-loads .env.`,
        where: hook.line,
      });
    }
  }

  // .mcp.json / opencode.jsonc presence
  if (!report.mcp_json_exists) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore .mcp.json',
      hint: '.mcp.json is missing. Restore from git — it is the committed Claude Code config.',
    });
  }
  if (!report.opencode_jsonc_exists) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore opencode.jsonc',
      hint: 'opencode.jsonc is missing. Restore from git — it is the committed OpenCode config.',
    });
  }

  if (report.pending_actions.length > 0) {
    report.status = 'needs-action';
  }
  return report;
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
  const checks: string[][] = [
    ['.env file', report.env_file_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['.mcp.json', report.mcp_json_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['opencode.jsonc', report.opencode_jsonc_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['node_modules', report.deps_installed ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    [`direnv binary${report.direnv.version ? ` (${report.direnv.version})` : ''}`, report.direnv.installed ? tui.statusIcon('ok') : tui.statusIcon('warn')],
  ];
  if (report.direnv.installed) {
    checks.push(['  .envrc allowed', report.direnv.envrc_allowed ? tui.statusIcon('ok') : tui.statusIcon('fail')]);
    checks.push([`  shell hook${report.direnv.rc_file ? ` (in ${report.direnv.rc_file})` : ''}`, report.direnv.hook_in_rc ? tui.statusIcon('ok') : tui.statusIcon('warn')]);
  }
  process.stdout.write(`${tui.table(['Check', 'Status'], checks)}\n`);

  // Env vars as a table
  tui.section('Env vars');
  const envRows = Object.entries(report.env_vars).map(([k, v]) => [
    k,
    v === 'set' ? tui.statusIcon('ok') : tui.statusIcon('fail'),
    v === 'set' ? 'set' : 'missing',
  ]);
  process.stdout.write(`${tui.table(['Variable', 'Status', 'Value'], envRows)}\n`);

  // Legacy JIRA_* credential keys (pre-DRY .env leftover)
  if (report.legacy_jira_cred_keys.length > 0) {
    tui.section('Legacy JIRA_* credential keys in .env');
    for (const key of report.legacy_jira_cred_keys) {
      process.stdout.write(`  ${tui.statusIcon('warn')} ${key} — remove (replaced by ATLASSIAN_* family)\n`);
    }
    process.stdout.write(`  ${COLORS.dim}acli and the sync scripts read ATLASSIAN_* directly; the Atlassian MCP server is opt-in via docs/mcp/.${COLORS.reset}\n\n`);
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
    process.stdout.write(`${tui.successBox(['All green. Launch agent: bun claude  /  bun opencode'])}\n`);
  }
}

// ----------------------------------------------------------------------------
// Preflight (blocker-only gate for `bun run setup`)
// ----------------------------------------------------------------------------

function preflightFail(msg: string, fix: string): never {
  // Dependency-free output — preflight may run before `bun install`, so no TUI.
  process.stderr.write(`Preflight failed: ${msg}\n`);
  process.stderr.write(`  Fix: ${fix}\n`);
  process.exit(1);
}

function runPreflight(): never {
  // Dependency-free header — preflight loads no TUI (third-party) modules.
  process.stdout.write('\nPreflight check\n');

  const bunVersion = process.versions.bun;
  if (!bunVersion) {
    preflightFail(
      'Bun runtime not detected (process.versions.bun is undefined).',
      'Install Bun from https://bun.sh, then re-run `bun run setup`.',
    );
  }
  const parsed = parseBunVersion(bunVersion);
  if (!parsed || compareVersion(parsed, MIN_BUN) < 0) {
    preflightFail(
      `Bun ${bunVersion} is older than required ${MIN_BUN.join('.')}.`,
      'Upgrade Bun: `bun upgrade` (or reinstall from https://bun.sh).',
    );
  }
  if (!existsSync(INQUIRER_MARKER)) {
    preflightFail(
      'Project dependencies not installed (node_modules/@inquirer/prompts missing).',
      'Run `bun install` first, then re-run `bun run setup`.',
    );
  }
  process.stdout.write(`Preflight OK (Bun ${bunVersion}, deps installed)\n`);
  process.exit(0);
}

// ----------------------------------------------------------------------------
// Entry
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes('--preflight')) {
    runPreflight(); // never returns
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

void main();
