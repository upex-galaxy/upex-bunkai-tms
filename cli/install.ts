#!/usr/bin/env bun
/**
 * Project installer for agentic-dev-boilerplate (`bun setup`).
 *
 * The run is a sequence of named phases, shown in a local browser page when the
 * run has a screen and always in the terminal (installer-ui plan §3):
 *
 *   pre       Preflight: everything knowable in seconds, before any write
 *             (cli/preflight.ts), then one "Empezamos?" confirmation.
 *   team      Which AI agents this project supports, and the questions the
 *             Install phase needs (user-level skills, the Engram plugin).
 *   install   Background lane `downloads`, started as soon as Team is answered
 *             (owner answer Q2): Engram wiring, community skills, compatibility
 *             repair. The questions below are asked meanwhile.
 *   project   `.agents/project.yaml` identity and environments (agents:setup,
 *             absorbed: the page asks, `agents-setup --non-interactive` writes).
 *   creds     Where secrets live, MCP variables, day-0 credentials (Atlassian,
 *             Resend).
 *   jira      acli session, catalogs (workflow pickers through
 *             `jira:sync-workflows --plan-json` / `--answers`), manifest check.
 *   github    Optional repository + push (waits for the Install lane).
 *   verify    External CLIs (information only), state, plaintext copies.
 *   done      One report: what was done, what is pending, what to run next.
 *
 * Every step stamps `.template/installer.state.json` the moment it finishes, so
 * an interrupted run resumes where it stopped. The step keys keep their old
 * names (`agentsSetupRanAt` for the Engram wiring, ...) so state files written
 * by earlier installers still gate the re-run.
 *
 * Core code never prints and never imports a prompt library: it emits through
 * the run's reporter (`cli/lib/ui/installer-run.ts`), and the terminal printer
 * (`cli/lib/install-terminal.ts`) renders the same journal the page renders.
 *
 * Usage:
 *   bun setup                              Page when there is a screen, terminal otherwise
 *   bun setup --headless                   Terminal only (questions in clack)
 *   bun setup --ui                         Page even where the rules say terminal
 *   bun setup --non-interactive            Every question takes its default
 *   bun setup --sync-skills | --validate-skills
 *   bun setup --variables [--variables-local | --variables-remote] [--dry-run] [--yes] [--force]
 *
 * Env:
 *   INSTALL_AGENTS=claude-code,opencode,codex   Comma-list of agents to configure (non-interactive)
 *   INSTALL_SECRETS_PROVIDER=1password Opt in to a secret manager (default: .env); with
 *   INSTALL_SECRETS_VAULT=<vault>     the vault its references point at
 *   INSTALL_SKIP_ENGRAM=1             Treat Engram as skipped
 *   INSTALL_FORCE_ENGRAM=1            Force re-run of `engram setup` (legacy alias: INSTALL_FORCE_AGENTS_SETUP=1)
 *   INSTALL_FORCE_COMMUNITY_SKILLS=1  Force re-run of community skills install
 *   INSTALL_FORCE_GITHUB_REMOTE=1     Force re-run of GitHub remote setup
 *   INSTALL_SKIP_COMMUNITY=1          Skip `bunx skills add`
 *   INSTALL_SKIP_JIRA=1               Skip the Jira phase
 */

import type { Harness } from './lib/harness-selection.ts';
import type { NextStep, Tile } from './lib/ui/events.ts';
import type { InstallerUi } from './lib/ui/installer-run.ts';
import type { AskInput, StepHandle } from './lib/ui/reporter.ts';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import {
  checkAgentCompatibility,
  removeShadowingCommands,
  repairClaudeSkillsAlias,
  SHADOWING_COMMANDS_BACKUP_DIR,
} from './lib/agent-compatibility.ts';
import { classifyProjectYaml, SCHEMA_FILE, seedFromSchema } from './lib/agents-schema.ts';
import {
  resolveAtlassianInstance,
  toSiteSlug,
  writeAtlassianUrlToYaml,
} from './lib/atlassian-instance.ts';
import { HARNESS_LEVEL_MCPS } from './lib/harness-level-mcps.ts';
import {
  declaredHarnesses,
  explicitHarnesses,
  HARNESS_FILES,
  HARNESS_LABEL,
  HARNESSES,
  HARNESSES_KEY,
  withHarnesses,
} from './lib/harness-selection.ts';
import { createInstallerTerminal, PromptCancelled } from './lib/install-terminal.ts';
import {
  ADAPTERS,
  applySecretsChoice,
  isValidVaultName,
  PROVIDER_SCHEMA_FILE,
  readSecretsConfig,
  SECRET_PROVIDERS,
} from './lib/secret-providers.ts';
import * as tui from './lib/tui.ts';
import { startInstallerUi } from './lib/ui/installer-run.ts';
import { pickLang } from './lib/ui/strings.ts';
import { nextStepsVars, VAR_MANIFEST, varsFor } from './lib/variables-manifest.ts';
import { runSetupPreflight } from './preflight.ts';

// ============================================================================
// Types
// ============================================================================

export type AgentId = 'claude-code' | 'opencode' | 'codex';

type InstallStatus = 'installed' | 'skipped' | 'failed' | 'declined';

type McpStatus = 'configured-with-key' | 'configured-no-key' | 'placeholder' | 'skipped-by-user';

type CliStatus = 'found' | 'missing';

interface EngramInfo {
  found: boolean
  version?: string
  compatible?: boolean
  status: 'installed' | 'missing' | 'skipped' | 'incompatible'
}

export interface AgentDetection {
  claudeCode: boolean
  opencode: boolean
  /** `codex` executable on PATH. */
  codexCli: boolean
  /** `.codex/config.toml` present in the repo — Codex Desktop reads it without a CLI. */
  codexConfigured: boolean
}

interface GithubRemoteInfo {
  account: string
  repo: string
  visibility: 'private' | 'public' | 'internal' | 'unknown'
  url: string
  createdAt: string
  /**
   * Whether the first push reached the remote, verified with `git ls-remote`
   * (analysis §8 #7). Absent on state files written before it existed.
   */
  pushed?: boolean
}

interface InstallState {
  version: 1
  installedAt: string
  agents: AgentId[]
  engram: {
    status: EngramInfo['status']
    version?: string
    checkedAt: string
  }
  /**
   * Legacy: state files written while the installer drove `gentle-ai install`.
   * It recorded the gentle-ai binary, not engram, so it is read only to be
   * dropped; `engram` starts fresh when it is absent.
   */
  gentleAi?: {
    status: EngramInfo['status']
    version?: string
    checkedAt: string
  }
  skills: Record<string, InstallStatus>
  mcps: Record<string, McpStatus>
  externalClis: Record<string, CliStatus>
  pendingEnvVars: string[]
  github?: GithubRemoteInfo
  steps?: Record<string, string> // step name → ISO timestamp of last successful run; gates re-runs
  postInstall: {
    agentsSetup: 'pending' | 'completed' | 'skipped-non-interactive' | 'failed'
    acliAuth: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-binary' | 'skipped-no-auth' | 'failed'
    jiraSyncFields: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-auth' | 'skipped-no-admin' | 'failed'
    jiraSyncWorkflows: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-auth' | 'skipped-no-admin' | 'failed'
    jiraCheck: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-prereq' | 'failed'
  }
}

// ============================================================================
// Constants
// ============================================================================

const REPO_ROOT = resolve(import.meta.dir, '..');
const STATE_PATH = join(REPO_ROOT, '.template', 'installer.state.json');
const MARKER_PATH = join(REPO_ROOT, '.template', 'installer.lock.json');
const CLAUDE_MCP_PATH = join(REPO_ROOT, '.mcp.json');
const OPENCODE_CONFIG_PATH = join(REPO_ROOT, 'opencode.jsonc');
const CODEX_CONFIG_PATH = join(REPO_ROOT, '.codex', 'config.toml');
const ENV_PATH = join(REPO_ROOT, '.env');
const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example');
const PROJECT_YAML_FILE = join(REPO_ROOT, '.agents', 'project.yaml');

const REPO_NAME = 'agentic-dev-boilerplate';
const TEMPLATE_MARKER = 'upex-galaxy/agentic-dev-boilerplate';

const MIN_ENGRAM_VERSION = [3, 0, 0] as const;

const ENGRAM_COMPONENT = 'engram';

/**
 * Engram (persistent memory) is wired per agent with the engram binary's own
 * `engram setup <agent>`, which registers the Engram MCP server for that agent
 * and nothing else.
 *
 * Rationale: the installer no longer runs `gentle-ai install`. Even its
 * `minimal` preset installs more than Engram (the SDD skills ride along), and
 * gentle-ai writes its own orchestrator / agent-routing instructions, hooks
 * and telemetry into the user-level agent config, which compete with this
 * repo's orchestration doctrine (AGENTS.md §3). The repo's workflow skills
 * (sprint-development, project-foundation, ...) own the dev workflow, so
 * nothing from gentle-ai's workflow layer is needed.
 */

const CANONICAL_MCPS = ['context7', 'supabase', 'n8n'] as const;

interface CommunitySkill {
  package: string
  skill?: string // omit or '*' to install all skills from the package
}

/**
 * Canonical project-level skill store. `bunx skills add` (project level, no
 * `--agent`) writes the skill body here; Claude Code reaches it through the
 * generated `.claude/skills` alias, OpenCode and Codex read it natively.
 */
export const PROJECT_SKILL_DESTINATION = '.agents/skills';

/**
 * Argument list for one `bunx skills add` call.
 *
 * Project level deliberately passes NO `--agent`: the body must land once in
 * `.agents/skills/` (the canonical store every harness reads). Passing
 * `--agent` there would make the CLI create per-harness copies or a REAL
 * `.claude/skills/` directory, which collides with the directory-level alias
 * `repairRepositoryCompatibility()` maintains. User level (`--global`) has no
 * canonical store, so it keeps one `--agent` per selected harness.
 */
export function buildCommunitySkillArgs(
  item: CommunitySkill,
  level: 'project' | 'global',
  agents: AgentId[],
): string[] {
  const args = ['skills', 'add', item.package];
  if (item.skill && item.skill !== '*') { args.push('--skill', item.skill); }
  if (level === 'global') {
    args.push('--global');
    for (const agent of agents) { args.push('--agent', agent); }
  }
  args.push('--yes');
  return args;
}

// Community skills installed at PROJECT level (`bunx skills add`).
// Stack-aware defaults — tuned for Next.js + React + Tailwind + shadcn +
// Supabase + Vercel + Resend.
// Stack-specific CLI-companion skills (supabase, supabase-postgres-best-practices,
// deploy-to-vercel, resend-cli) live here because the underlying infrastructure
// choice (DB / deploy target / email provider) is per-project, not per-user.
// The truly universal CLI-companion skill (playwright-cli) lives at USER level
// instead — see USER_LEVEL_SKILLS.
// Users can run `bunx autoskills` later to refine for their concrete stack.
const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  { package: 'https://github.com/anthropics/skills', skill: 'frontend-design' },
  // Next.js ships its workflow skills from its own repo (vercel-labs/next-skills
  // is an empty pointer now). Reference knowledge and upgrades are no longer
  // skills: they come from [DOCS_TOOL] (Context7) and the docs bundled in the
  // app's `next` package; upgrades run `npx @next/codemod@latest upgrade`.
  { package: 'https://github.com/vercel/next.js', skill: 'next-cache-components-adoption' },
  { package: 'https://github.com/vercel/next.js', skill: 'next-cache-components-optimizer' },
  { package: 'https://github.com/pproenca/dot-skills', skill: 'react-hook-form' },
  { package: 'https://github.com/pproenca/dot-skills', skill: 'zod' },
  { package: 'https://github.com/shadcn/ui', skill: 'shadcn' },
  { package: 'https://github.com/giuseppe-trisciuoglio/developer-kit', skill: 'tailwind-css-patterns' },
  { package: 'https://github.com/wshobson/agents', skill: 'typescript-advanced-types' },
  { package: 'https://github.com/addyosmani/web-quality-skills', skill: 'accessibility' },
  { package: 'https://github.com/addyosmani/web-quality-skills', skill: 'seo' },
  { package: 'https://github.com/emilkowalski/skill', skill: 'emil-design-eng' },
  { package: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skill: 'ui-ux-pro-max' },
  { package: 'https://github.com/pbakaus/impeccable', skill: 'impeccable' },
  { package: 'https://github.com/Leonxlnx/taste-skill', skill: 'design-taste-frontend' },
  { package: 'https://github.com/Leonxlnx/taste-skill', skill: 'redesign-existing-projects' },
  // Stack-specific CLI-companion skills — pinned to project because the
  // underlying infrastructure choice (DB / deploy target / email provider)
  // varies per project.
  { package: 'supabase/agent-skills', skill: 'supabase' },
  { package: 'supabase/agent-skills', skill: 'supabase-postgres-best-practices' },
  { package: 'https://github.com/vercel-labs/agent-skills', skill: 'deploy-to-vercel' },
  { package: 'resend/resend-cli' },
  // Builder skills — project-level because a T1 workflow depends on them and
  // must not hinge on a user's global plugin list (a user-level install still
  // satisfies them). skill-creator (Anthropic) is the builder of every skill
  // this repo scaffolds: `project-context` mode `context-skill` (a project's
  // `<aspect>-context`) and any new T1 skill go through it, per
  // agentic-dev-core/references/skill-scaffold.md.
  { package: 'https://github.com/anthropics/skills', skill: 'skill-creator' },
  // diagram-design (Cathryn Lavery): the figures inside the business context
  // maps (`project-context` modes data / features / api and each map skill's
  // refresh). Capability `diagrams`, resolved by skill presence with a
  // point-of-use STOP (agentic-dev-core/references/business-context-maps.md §7).
  // Project-level because a T1 workflow depends on it; a user-level install
  // satisfies it too.
  { package: 'https://github.com/cathrynlavery/diagram-design', skill: 'diagram-design' },
];

// Community skills installed at USER (global) level — universal across every
// project the user works on (skill discovery, browser automation, CI docs,
// presentation authoring, decision decks). The user picks which of them to
// install (a per-skill multiselect, all pre-checked); an unchecked one is
// recorded as declined and left out of every later run (`partitionDeclinedSkills`).
export const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  { package: 'https://github.com/vercel-labs/skills', skill: 'find-skills' },
  { package: 'https://github.com/xixu-me/skills', skill: 'github-actions-docs' },
  { package: 'https://github.com/lewislulu/html-ppt-skill', skill: 'html-ppt' },
  // Universal CLI-companion skill — `playwright-cli` applies across any
  // project the user touches, regardless of stack.
  { package: 'https://github.com/microsoft/playwright-cli', skill: 'playwright-cli' },
  // Cross-project decision-deck CLI (`mkd`, Make Decision): the AI writes a spec
  // of items (decision / question / report / table) and the user answers in a
  // browser deck, pasting the Result JSON back into the chat (non-blocking).
  { package: 'https://github.com/upex-galaxy/agentic-user-skills', skill: 'mkd' },
];

// External CLIs the boilerplate's skills depend on. Installer NEVER auto-installs
// these — it only `which`-checks and points the user to the OFFICIAL docs.
// Rule: any install whose command depends on the user's OS must be deferred to
// the upstream docs (Rule 4). Single-shot cross-platform commands (e.g.
// `bun add -g X`) MAY ship as `install`; everything else uses `docs` only.
const EXTERNAL_CLIS: ReadonlyArray<{ name: string, install?: string, docs: string, purpose: string, required?: boolean }> = [
  {
    name: 'bun',
    docs: 'https://bun.com/',
    purpose: 'general-purpose runtime + package manager (this repo runs on bun)',
  },
  {
    name: 'gh',
    docs: 'https://github.com/cli/cli#installation',
    purpose: 'GitHub CLI — repos, PRs, releases, gh api',
  },
  {
    name: 'supabase',
    docs: 'https://supabase.com/docs/guides/local-development/cli/getting-started',
    purpose: 'database — migrations, types, local stack',
  },
  {
    name: 'vercel',
    install: 'bun add -g vercel',
    docs: 'https://vercel.com/docs/cli',
    purpose: 'deploys + project linking',
  },
  {
    name: 'resend',
    docs: 'https://resend.com/docs/cli',
    purpose: 'email development + transactional sending',
  },
  {
    // Required: the boilerplate ships the Atlassian MCP server as opt-in only
    // (docs/mcp/*.template.*), so acli is the sole default tool for Jira/
    // Confluence. Missing acli at install time is a hard abort.
    name: 'acli',
    docs: 'https://developer.atlassian.com/cloud/acli/guides/install-acli/',
    purpose: 'Atlassian (Jira/Confluence) CLI — used by /acli skill',
    required: true,
  },
  {
    // Binary produced by @playwright/cli is `playwright-cli`, NOT
    // @playwright/test (devDep test runner library producing no global
    // binary — `which playwright` would never find it).
    name: 'playwright-cli',
    install: 'bun add -g @playwright/cli@latest',
    docs: 'https://playwright.dev/agent-cli/introduction',
    purpose: 'browser automation — screenshots, traces, recordings',
  },
  {
    name: 'jq',
    docs: 'https://jqlang.org/',
    purpose: 'JSON processor — required by /acli skill for parsing acli --json output',
  },
];

// Matches Claude Code ${VAR} and ${VAR:-default} placeholders in .mcp.json.
// Exported for `cli/lib/harness-env.ts`, which builds its allowlist from the
// same patterns instead of keeping a second copy that could drift.
export const MCP_VAR_PATTERN = /\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g;
// Matches OpenCode {env:VAR} placeholders in opencode.jsonc.
export const OPENCODE_VAR_PATTERN = /\{env:([A-Z][A-Z0-9_]*)\}/g;
// Matches the legacy OpenCode {file:.auth/opencode/VAR} references the retired
// `harness:env` generator wrote: the same `.env` dependency by another route,
// still read so a downstream config on the old shape is discovered.
const OPENCODE_FILE_VAR_PATTERN = /\{file:\.auth\/opencode\/([A-Z][A-Z0-9_]*)\}/g;
// Matches the `.env` loader's `"--filter", "A,B"` pair, spelled the same in the
// three MCP configs (JSON, JSONC and TOML arrays). The names it lists are what
// the server reads from `.env` (MCP_ENV_LOADER_* in
// cli/lib/agent-compatibility-contracts.ts).
export const MCP_FILTER_PATTERN = /"--filter"\s*,\s*"([A-Z][A-Z0-9_,]*)"/g;
const SECRET_NAME_HINTS = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD'];

// Map MCP server → env vars its secrets depend on. Servers with empty arrays
// have no secrets (so they're always "configured-no-key").
//
// The supabase MCP server is admin-scoped via SUPABASE_ACCESS_TOKEN (PAT), the
// only variable it reads (measured on @supabase/mcp-server-supabase 0.13.0), so
// it is the whole of its `.env` loader filter. The app's own Supabase vars (URL +
// publishable/secret keys) are project-bound and reported by doctor.
export const MCP_SERVER_SECRETS: Record<string, readonly string[]> = {
  context7: [],
  supabase: ['SUPABASE_ACCESS_TOKEN'],
  n8n: ['N8N_API_URL', 'N8N_API_KEY'],
};

// Vars discovered from committed MCP configs that the installer should NOT
// prompt for at install time — they require an existing Supabase project /
// n8n instance / backend. Surfaced later by `bun run doctor`.
const INSTALLER_DEFERRED_VARS = new Set<string>([
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'N8N_API_URL',
  'N8N_API_KEY',
]);

// ============================================================================
// CLI flags (one interactivity decision, made once: analysis §8 #13)
// ============================================================================

const ARGV = process.argv.slice(2);

/** Every flag this installer understands; anything else is refused (analysis §8 #28). */
const KNOWN_FLAGS = new Set([
  '--non-interactive',
  '--variables',
  '--variables-local',
  '--variables-remote',
  '--local-only',
  '--remote-only',
  '--dry-run',
  '--yes',
  '--force',
  '--sync-skills',
  '--validate-skills',
  '--headless',
  '--ui',
  '--help',
  '-h',
]);

export function unknownFlags(argv: readonly string[]): string[] {
  return argv.filter(a => !KNOWN_FLAGS.has(a));
}

// Auto-detect non-TTY (an AI agent or a CI pipeline invoking the installer) so
// questions never hang waiting for stdin: they take their defaults. `--ui`
// keeps them, because the page answers. The ONE decision every phase reads.
const NON_INTERACTIVE
  = ARGV.includes('--non-interactive') || (!process.stdin.isTTY && !ARGV.includes('--ui'));
const SKIP_ENGRAM = process.env.INSTALL_SKIP_ENGRAM === '1';
const FORCE_ENGRAM = process.env.INSTALL_FORCE_ENGRAM === '1' || process.env.INSTALL_FORCE_AGENTS_SETUP === '1';
// --sync-skills: standalone repair mode — re-installs community skills so
// project skills land in the canonical `.agents/skills/` store (reachable by
// Claude Code through the generated `.claude/skills` alias) and user-level
// skills reach every selected harness. Implies a forced community re-run.
const SYNC_SKILLS = ARGV.includes('--sync-skills');
const FORCE_COMMUNITY_SKILLS = process.env.INSTALL_FORCE_COMMUNITY_SKILLS === '1' || SYNC_SKILLS;
const FORCE_GITHUB_REMOTE = process.env.INSTALL_FORCE_GITHUB_REMOTE === '1';
// INSTALL_SKIP_JIRA=1: the Jira phase is skipped (a project that does not use Jira; also the e2e fixtures).
const SKIP_JIRA = process.env.INSTALL_SKIP_JIRA === '1';
// INSTALL_SKIP_COMMUNITY=1: no `bunx skills add` (offline runs, the e2e fixtures).
const SKIP_COMMUNITY = process.env.INSTALL_SKIP_COMMUNITY === '1';

// ============================================================================
// Language (owner answer Q1) and output
// ============================================================================

const LANG = pickLang(process.env);
/** The run's copy in the run's language: Spanish when unsure. */
const tr = (es: string, en: string): string => (LANG === 'en' ? en : es);

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  bold: '\x1B[1m',
};

/** Where a helper's lines go: a step row of the run, or the bare terminal (tests, `--variables`). */
export interface Out {
  info: (msg: string) => void
  success: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
  dim: (msg: string) => void
}

const consoleOut: Out = {
  info: msg => tui.log.info(msg),
  success: msg => tui.log.success(msg),
  warn: msg => tui.log.warn(msg),
  error: msg => tui.log.error(msg),
  dim: msg => process.stdout.write(`${COLORS.dim}${msg}${COLORS.reset}\n`),
};

/** Lines of one step: they land under its row in the page and indented in the terminal. */
function stepOut(step: StepHandle): Out {
  return {
    info: msg => step.log(msg.trim()),
    success: msg => step.log(`✔ ${msg.trim()}`),
    warn: msg => step.log(`▲ ${msg.trim()}`),
    error: msg => step.log(`✖ ${msg.trim()}`, 'err'),
    dim: msg => step.log(msg.trim()),
  };
}

/** The run in progress (null in tests and in the `--variables` / `--validate-skills` modes). */
let UI: InstallerUi | null = null;

/** Ask through the run; with no run (a helper called from a test), take the default. */
async function ask<T>(input: AskInput): Promise<T> {
  if (UI) { return UI.ask<T>(input); }
  return input.default as T;
}

/** A yes/no through the run, the shape the injectable `confirm` seams expect. */
async function askConfirm(message: string, defaultYes: boolean): Promise<boolean> {
  return ask<boolean>({ kind: 'confirm', title: message, default: defaultYes });
}

// ============================================================================
// State — written after EVERY step (analysis §8 #2)
// ============================================================================

/** The state of THIS run; every stamp and every postInstall change is persisted at once. */
let RUN_STATE: InstallState | null = null;

function saveState(state: InstallState = RUN_STATE!): void {
  if (!state) { return; }
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function markStepDone(state: InstallState, key: string): void {
  state.steps = state.steps ?? {};
  state.steps[key] = new Date().toISOString();
  saveState(state);
}

// ============================================================================
// Subprocess helpers (children are piped: no child owns the terminal any more)
// ============================================================================

function which(binary: string): string | null {
  // Cross-platform binary detection — POSIX `which` fails on raw Windows
  // PowerShell/cmd. Git Bash and WSL ship the MSYS port, but native Windows
  // shells use `where`. Mirror the scaffolder's helper.
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [binary], { encoding: 'utf8' });
  if (result.status !== 0) { return null; }
  const out = result.stdout.trim();
  // `where` prints one match per line; take the first.
  const first = out.split(/\r?\n/)[0]?.trim() ?? '';
  return first.length > 0 ? first : null;
}

function tryRun(binary: string, args: string[]): { ok: boolean, stdout: string, stderr: string } {
  try {
    const stdout = execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  }
  catch (err) {
    const e = err as { stdout?: Buffer | string, stderr?: Buffer | string };
    return {
      ok: false,
      stdout: typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString() ?? '',
      stderr: typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '',
    };
  }
}

export interface StreamResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;?]*[\x20-\x2F]*[\x40-\x7E]|\x1B\][^\x07]*\x07/g;

/**
 * Runs a child with stdout and stderr piped, streaming each line into `step`
 * (redacted by the journal before it reaches the page or the terminal). Lines
 * ended by a carriage return (progress bars) are thinned to about two a second.
 * Never throws: a missing binary is `code: null`.
 */
export async function runStreamed(
  cmd: string,
  args: string[],
  o: { step?: StepHandle, env?: NodeJS.ProcessEnv, input?: string, timeoutMs?: number, cwd?: string } = {},
): Promise<StreamResult> {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let lastProgress = 0;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { cwd: o.cwd ?? REPO_ROOT, env: o.env ?? process.env, stdio: [o.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    }
    catch (err) {
      resolvePromise({ code: null, stdout: '', stderr: (err as Error).message, timedOut: false });
      return;
    }
    const feed = (stream: 'out' | 'err') => {
      let buf = '';
      return (chunk: Buffer): void => {
        const text = chunk.toString('utf8');
        if (stream === 'out') { stdout += text; }
        else { stderr += text; }
        buf += text;
        const parts = buf.split(/(\r\n|\n|\r)/);
        buf = parts.pop() ?? '';
        for (let i = 0; i < parts.length; i += 2) {
          const line = parts[i].replace(ANSI, '').trimEnd();
          const sep = parts[i + 1];
          if (!line.trim() || !o.step) { continue; }
          if (sep === '\r') {
            const now = Date.now();
            if (now - lastProgress < 500) { continue; }
            lastProgress = now;
          }
          o.step.log(line, stream);
        }
      };
    };
    child.stdout?.on('data', feed('out'));
    child.stderr?.on('data', feed('err'));
    if (o.input !== undefined) {
      child.stdin?.end(o.input);
    }
    const timer = o.timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, o.timeoutMs) : null;
    child.on('error', (err) => {
      if (timer) { clearTimeout(timer); }
      resolvePromise({ code: null, stdout, stderr: stderr || err.message, timedOut });
    });
    child.on('close', (code) => {
      if (timer) { clearTimeout(timer); }
      resolvePromise({ code, stdout, stderr, timedOut });
    });
  });
}

/**
 * The line of a failed child's output that says why: the last one that names an
 * error, else the last line. The skills CLI prints its reason mid-output and a
 * routine line ("Saved lockfile") last.
 */
export function failureReason(output: string): string {
  const lines = output.replace(ANSI, '').split(/\r?\n|\r/).map(l => l.replace(/^[\s│└┌◇◒◐◓◑]+/, '').trim()).filter(Boolean);
  const named = lines.filter(l => /error|fail|not found|no valid|no skills|denied|timed? ?out|could not|cannot/i.test(l));
  return (named.at(-1) ?? lines.at(-1) ?? 'unknown error').slice(0, 160);
}

/** The environment of a child that must not see stray seeds from the parent shell. */
function childEnv(drop: (name: string) => boolean, add: Record<string, string> = {}): NodeJS.ProcessEnv {
  // A plain record, cast once: a host that augments ProcessEnv (Next.js adds a
  // required NODE_ENV) must still compile this file (cli/updater-host-types.test.ts).
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!drop(k)) { env[k] = v; }
  }
  return { ...env, ...add } as NodeJS.ProcessEnv;
}

// ============================================================================
// Engram detection
// ============================================================================

/** Subprocess seams, injectable so tests never run a real binary. */
export type CommandRunner = (binary: string, args: string[]) => { ok: boolean, stdout: string, stderr: string };
export type BinaryFinder = (binary: string) => string | null;

function parseEngramVersion(output: string): string | undefined {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

function isCompatible(version: string): boolean {
  const parts = version.split('.').map(n => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const got = parts[i] ?? 0;
    const min = MIN_ENGRAM_VERSION[i];
    if (got > min) { return true; }
    if (got < min) { return false; }
  }
  return true;
}

export function detectEngram(
  options: { skip?: boolean, find?: BinaryFinder, run?: CommandRunner } = {},
): EngramInfo {
  const { skip = SKIP_ENGRAM, find = which, run = tryRun } = options;
  if (skip) {
    return { found: false, status: 'skipped' };
  }
  if (!find('engram')) { return { found: false, status: 'missing' }; }

  const result = run('engram', ['version']);
  if (!result.ok) { return { found: true, status: 'incompatible' }; }

  // A `go install` build reports `dev` instead of a semver: no version to
  // compare, so it lands in `incompatible` and the user decides.
  const version = parseEngramVersion(result.stdout);
  if (!version) { return { found: true, status: 'incompatible' }; }

  const compatible = isCompatible(version);
  return {
    found: true,
    version,
    compatible,
    status: compatible ? 'installed' : 'incompatible',
  };
}

// ============================================================================
// Agents
// ============================================================================

/**
 * Detect which harnesses this machine (and this repo) can run.
 *
 * Claude Code and OpenCode count as present when their user config directory
 * exists OR the executable is on PATH. Codex is two independent signals: the
 * `codex` CLI on PATH, and `.codex/config.toml` in the repo — Codex Desktop
 * reads the repository config with no CLI installed, so a configured repo is a
 * valid Codex target on its own. Every input is injectable for tests.
 */
export async function detectAgents(options: {
  home?: string
  root?: string
  binaryExists?: (binary: string) => boolean
} = {}): Promise<AgentDetection> {
  const home = options.home ?? homedir();
  const root = options.root ?? REPO_ROOT;
  const binaryExists = options.binaryExists ?? (binary => which(binary) !== null);
  const claudePath = join(home, '.claude');
  const opencodePath = join(home, '.config', 'opencode');

  const [claudeDirectory, opencodeDirectory] = await Promise.all([
    stat(claudePath).then(s => s.isDirectory(), () => false),
    stat(opencodePath).then(s => s.isDirectory(), () => false),
  ]);

  return {
    claudeCode: claudeDirectory || binaryExists('claude'),
    opencode: opencodeDirectory || binaryExists('opencode'),
    codexCli: binaryExists('codex'),
    codexConfigured: existsSync(join(root, '.codex', 'config.toml')),
  };
}

/**
 * `INSTALL_AGENTS=claude-code,opencode,codex` — non-interactive override for
 * the agent selection prompt. Unknown entries are dropped, duplicates collapse.
 */
export function parseAgentsEnv(raw = process.env.INSTALL_AGENTS): AgentId[] | null {
  if (!raw) { return null; }
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const valid = new Set<AgentId>();
  for (const p of parts) {
    if (p === 'claude-code' || p === 'opencode' || p === 'codex') { valid.add(p); }
  }
  return [...valid];
}

export function describeAgentDetection(detected: AgentDetection): string {
  const codex = detected.codexCli
    ? 'CLI found; Desktop uses the repository config'
    : detected.codexConfigured
      ? 'repository configured for Desktop; CLI not found'
      : 'not found';
  return `Claude Code: ${detected.claudeCode ? 'found' : 'not found'} | OpenCode: ${detected.opencode ? 'found' : 'not found'} | Codex: ${codex}`;
}

/** The agents detected on this machine, in the order the question lists them. */
function detectedAgentIds(detected: AgentDetection): AgentId[] {
  const out: AgentId[] = [];
  if (detected.claudeCode) { out.push('claude-code'); }
  if (detected.opencode) { out.push('opencode'); }
  if (detected.codexCli || detected.codexConfigured) { out.push('codex'); }
  return out;
}

/**
 * Which agents this repository supports. All three are offered: a teammate may
 * use one this machine does not have. Non-interactive: `INSTALL_AGENTS`, else
 * whatever is detected.
 */
async function askAgents(detected: AgentDetection, prior: AgentId[]): Promise<AgentId[]> {
  const found = detectedAgentIds(detected);
  const fromEnv = parseAgentsEnv();
  const preset = fromEnv && fromEnv.length > 0 ? fromEnv : prior.length > 0 ? prior : found;
  const codexDesc = detected.codexCli
    ? tr('Instalado · CLI; la app de escritorio usa la misma configuración', 'Installed · CLI; the desktop app uses the same repository config')
    : detected.codexConfigured
      ? tr('Configurado en el repositorio para la app de escritorio; CLI no encontrada', 'Repository configured for the desktop app; CLI not found')
      : tr('No instalado en esta máquina', 'Not installed on this machine');
  const desc = (on: boolean): string => (on ? tr('Instalado en esta máquina', 'Installed on this machine') : tr('No instalado en esta máquina', 'Not installed on this machine'));
  const picked = await ask<string[]>({
    id: 'agents',
    kind: 'multi',
    kicker: tr('Agentes', 'Agents'),
    title: tr('Con qué agentes de IA va a trabajar este proyecto?', 'Which AI agents will this project work with?'),
    g: 'harness',
    why: tr(
      `Encontramos ${found.length} en esta máquina. Puedes elegir uno que no tengas instalado si alguien del equipo lo usa.`,
      `We found ${found.length} on this machine. You can pick one you do not have installed if someone on the team uses it.`,
    ),
    spec: {
      options: [
        { value: 'claude-code', label: 'Claude Code', desc: desc(detected.claudeCode), checked: preset.includes('claude-code') },
        { value: 'codex', label: 'Codex', desc: codexDesc, checked: preset.includes('codex') },
        { value: 'opencode', label: 'OpenCode', desc: desc(detected.opencode), checked: preset.includes('opencode') },
      ],
      min: 1,
      minMsg: tr('Elige al menos uno: sin agente no hay a quién configurar.', 'Pick at least one: without an agent there is nothing to configure.'),
      cta: tr('Guardar elección', 'Save choice'),
    },
    default: preset,
  });
  return migrateAgentIds(picked);
}

// ============================================================================
// Install lane: Engram wiring
// ============================================================================

/**
 * `engram setup` argument list per agent. The agent slugs this installer
 * uses (claude-code / opencode / codex) are the slugs `engram setup` accepts.
 * Passing the agent explicitly skips its interactive menu. Claude Code gets
 * `--protocol=slim`: the session protocol then arrives through the Engram
 * plugin's hooks instead of a block written into the user's instructions file.
 */
export function engramSetupArgs(agent: AgentId): string[] {
  return agent === 'claude-code'
    ? ['setup', agent, '--protocol=slim']
    : ['setup', agent];
}

export function runEngramSetup(agent: AgentId, run: CommandRunner = tryRun): { ok: boolean, reason?: string } {
  const result = run('engram', engramSetupArgs(agent));
  if (result.ok) { return { ok: true }; }
  return { ok: false, reason: result.stderr.trim() || result.stdout.trim() || 'unknown error' };
}

/** The two `claude` calls that install the Engram Claude Code plugin, in order. */
export const ENGRAM_PLUGIN_COMMANDS: readonly (readonly string[])[] = [
  ['plugin', 'marketplace', 'add', 'Gentleman-Programming/engram'],
  ['plugin', 'install', 'engram@engram'],
];

export const ENGRAM_PLUGIN_COMMAND_LINE = ENGRAM_PLUGIN_COMMANDS
  .map(args => `claude ${args.join(' ')}`)
  .join(' && ');

export type EngramPluginOutcome
  = | 'already-installed'
    | 'installed'
    | 'declined'
    | 'skipped-non-interactive'
    | 'skipped-no-claude-cli'
    | 'failed';

/**
 * OFFER to install the Engram Claude Code plugin (session hooks), never fatal.
 * `engram setup claude-code` registers the MCP server only; the hooks that
 * carry the memory protocol ship in the plugin, which lives at user level.
 * Non-interactive runs never install it: a user-level change needs a person
 * to say yes, so they get the command line instead.
 */
export async function offerEngramClaudePlugin(options: {
  nonInteractive: boolean
  confirm: (message: string) => Promise<boolean>
  find?: BinaryFinder
  run?: CommandRunner
}): Promise<{ outcome: EngramPluginOutcome, reason?: string }> {
  const { nonInteractive, confirm, find = which, run = tryRun } = options;
  if (!find('claude')) { return { outcome: 'skipped-no-claude-cli' }; }

  const listed = run('claude', ['plugin', 'list']);
  if (listed.ok && listed.stdout.includes('engram@engram')) {
    return { outcome: 'already-installed' };
  }
  if (nonInteractive) { return { outcome: 'skipped-non-interactive' }; }

  const yes = await confirm('Install the Engram Claude Code plugin now (session hooks, user level)?');
  if (!yes) { return { outcome: 'declined' }; }

  for (const args of ENGRAM_PLUGIN_COMMANDS) {
    const result = run('claude', [...args]);
    // `marketplace add` on a marketplace that is already registered is not a
    // reason to stop: the install call that follows is the one that matters.
    if (!result.ok && args[1] !== 'marketplace') {
      return { outcome: 'failed', reason: result.stderr.trim() || result.stdout.trim() || 'unknown error' };
    }
  }
  return { outcome: 'installed' };
}

function reportEngramPluginOutcome(out: Out, outcome: EngramPluginOutcome, reason?: string): void {
  switch (outcome) {
    case 'installed':
      out.success('installed: Engram Claude Code plugin (session hooks)');
      return;
    case 'already-installed':
      out.dim('Engram Claude Code plugin already installed.');
      return;
    case 'skipped-no-claude-cli':
      out.dim('`claude` not on PATH; install the Engram plugin later with:');
      break;
    case 'skipped-non-interactive':
      out.dim('Engram Claude Code plugin not installed (not asked in this run). Install it once with:');
      break;
    case 'declined':
      out.dim('Engram Claude Code plugin skipped. Install it later with:');
      break;
    case 'failed':
      out.warn(`Engram Claude Code plugin install failed — ${reason ?? 'unknown error'}. Retry with:`);
      break;
  }
  out.dim(`  ${ENGRAM_PLUGIN_COMMAND_LINE}`);
}

interface EngramPlan {
  run: boolean
  /** The plugin question, asked in Team (null = not offered in this run). */
  plugin: boolean | null
}

async function runEngramStep(agents: AgentId[], state: InstallState, plan: EngramPlan, lane: string): Promise<void> {
  // `agentsSetupRanAt` predates the switch to `engram setup`; the key keeps its
  // name so state files written by earlier installers still gate the re-run.
  const key = 'agentsSetupRanAt';
  const step = UI!.step({ id: 'engram', phase: 'install', lane, why: 'engram', title: tr('Memoria entre sesiones (Engram)', 'Memory across sessions (Engram)') });
  if (!plan.run) {
    for (const agent of agents) {
      const k = `${ENGRAM_COMPONENT}::${agent}`;
      if (!state.skills[k]) { state.skills[k] = 'skipped'; }
    }
    saveState(state);
    step.end('skipped', state.engram.status === 'missing' || state.engram.status === 'skipped'
      ? tr('Engram no está instalado (aviso del chequeo previo)', 'Engram is not installed (preflight warning)')
      : tr('versión de Engram sin confirmar', 'Engram version not confirmed'));
    return;
  }
  if (state.steps?.[key] && !FORCE_ENGRAM) {
    step.end('skipped', tr('ya conectado en una corrida anterior (INSTALL_FORCE_ENGRAM=1 para repetir)', 'already wired in an earlier run (INSTALL_FORCE_ENGRAM=1 to repeat)'));
    return;
  }
  const out = stepOut(step);
  let failed = 0;
  for (const agent of agents) {
    out.dim(`engram ${engramSetupArgs(agent).join(' ')}`);
    const r = await runStreamed('engram', engramSetupArgs(agent), { step, timeoutMs: 60_000 });
    const ok = r.code === 0;
    state.skills[`${ENGRAM_COMPONENT}::${agent}`] = ok ? 'installed' : 'failed';
    if (!ok) { failed += 1; out.error(`engram (${agent}): ${(r.stderr || r.stdout).trim().slice(0, 160) || 'unknown error'}`); }
    if (ok && agent === 'claude-code') {
      const plugin = await offerEngramClaudePlugin({ nonInteractive: plan.plugin === null, confirm: async () => plan.plugin === true });
      reportEngramPluginOutcome(out, plugin.outcome, plugin.reason);
    }
  }
  markStepDone(state, key);
  step.end(failed > 0 ? 'warn' : 'ok', agents.join(', '));
}

// ============================================================================
// Install lane: community skills
// ============================================================================

function describeSkill(item: CommunitySkill): string {
  if (!item.skill || item.skill === '*') {
    return item.package.split('/').slice(-2).join('/');
  }
  return item.skill;
}

/**
 * Splits the user-level list into the skills to offer in this run and the ones
 * the user declined in an earlier one (`state.skills['community:global:<slug>']
 * === 'declined'`). A declined skill is never offered again by default, not even
 * when INSTALL_FORCE_COMMUNITY_SKILLS forces a re-run.
 */
export function partitionDeclinedSkills(
  list: ReadonlyArray<CommunitySkill>,
  skills: Record<string, string>,
): { offered: CommunitySkill[], declined: CommunitySkill[] } {
  const offered: CommunitySkill[] = [];
  const declined: CommunitySkill[] = [];
  for (const item of list) {
    (skills[`community:global:${describeSkill(item)}`] === 'declined' ? declined : offered).push(item);
  }
  return { offered, declined };
}

const SKILL_STEP_KEY = { project: 'communitySkillsProjectRanAt', global: 'communitySkillsGlobalRanAt' } as const;

/**
 * The per-skill ask for the user level: every offered skill pre-checked; an
 * unchecked one is recorded as declined and never offered again. Asked in Team,
 * so the downloads can start without waiting for anyone. Null = nothing to ask.
 */
async function askUserLevelSkills(state: InstallState, agents: AgentId[]): Promise<CommunitySkill[] | null> {
  if (SKIP_COMMUNITY || USER_LEVEL_SKILLS.length === 0) { return null; }
  if (state.steps?.[SKILL_STEP_KEY.global] && !FORCE_COMMUNITY_SKILLS) { return null; }
  const { offered, declined } = partitionDeclinedSkills(USER_LEVEL_SKILLS, state.skills);
  if (offered.length === 0) { return []; }
  const declinedNote = declined.length > 0
    ? tr(
        ` Rechazadas antes, no se ofrecen: ${declined.map(describeSkill).join(', ')} (se instalan a mano con <code>bunx ${buildCommunitySkillArgs(declined[0], 'global', agents).join(' ')}</code>).`,
        ` Declined earlier, not offered: ${declined.map(describeSkill).join(', ')} (install by hand with <code>bunx ${buildCommunitySkillArgs(declined[0], 'global', agents).join(' ')}</code>).`,
      )
    : '';
  const picked = await ask<string[]>({
    id: 'user-skills',
    kind: 'multi',
    kicker: tr('Skills de usuario', 'User skills'),
    title: tr('Qué skills quieres para todos tus proyectos?', 'Which skills do you want for all your projects?'),
    g: 'skill',
    why: tr(
      `Se instalan una vez en tu usuario, no en este repositorio. La que desmarques queda rechazada y no se vuelve a ofrecer.${declinedNote}`,
      `They install once in your user, not in this repository. One you uncheck is declined and not offered again.${declinedNote}`,
    ),
    spec: {
      options: offered.map(item => ({ value: describeSkill(item), label: describeSkill(item), desc: item.package.replace(/^https:\/\/github\.com\//, ''), checked: true })),
      cta: tr('Guardar elección', 'Save choice'),
    },
    default: offered.map(describeSkill),
  });
  const set = new Set(picked);
  for (const item of offered) {
    if (!set.has(describeSkill(item))) { state.skills[`community:global:${describeSkill(item)}`] = 'declined'; }
  }
  saveState(state);
  return offered.filter(item => set.has(describeSkill(item)));
}

async function runCommunityStep(
  agents: AgentId[],
  state: InstallState,
  level: 'project' | 'global',
  picked: CommunitySkill[] | null,
  lane: string,
): Promise<void> {
  const key = SKILL_STEP_KEY[level];
  const step = UI!.step({
    id: `skills-${level}`,
    phase: 'install',
    lane,
    why: 'skill',
    title: level === 'project'
      ? tr('Skills de la comunidad para este proyecto', 'Community skills for this project')
      : tr('Skills de usuario (para todos tus proyectos)', 'User skills (for all your projects)'),
  });
  const list = level === 'project' ? PROJECT_LEVEL_SKILLS : USER_LEVEL_SKILLS;
  if (SKIP_COMMUNITY) {
    for (const item of list) {
      const k = `community:${level}:${describeSkill(item)}`;
      if (!state.skills[k]) { state.skills[k] = 'skipped'; }
    }
    saveState(state);
    step.end('skipped', 'INSTALL_SKIP_COMMUNITY=1');
    return;
  }
  if (list.length === 0) { step.end('skipped', tr('ninguna configurada', 'none configured')); return; }
  if (state.steps?.[key] && !FORCE_COMMUNITY_SKILLS) {
    step.end('skipped', tr('ya instaladas en una corrida anterior (INSTALL_FORCE_COMMUNITY_SKILLS=1 para repetir)', 'already installed in an earlier run (INSTALL_FORCE_COMMUNITY_SKILLS=1 to repeat)'));
    return;
  }
  const toInstall: ReadonlyArray<CommunitySkill> = level === 'project' ? list : (picked ?? []);
  if (toInstall.length === 0) {
    markStepDone(state, key);
    step.end('skipped', tr('ninguna elegida', 'none chosen'));
    return;
  }
  const out = stepOut(step);
  let ok = 0;
  for (const item of toInstall) {
    const slug = describeSkill(item);
    const stateKey = `community:${level}:${slug}`;
    // Project level: body lands once in `.agents/skills/` (PROJECT_SKILL_DESTINATION);
    // Claude Code reads it through the `.claude/skills` alias the compatibility
    // step restores right after. User level: one `--agent` per selected harness.
    const args = buildCommunitySkillArgs(item, level, agents);
    out.dim(`bunx skills add ${slug}${level === 'global' ? ' -g' : ''}`);
    const r = await runStreamed('bunx', args, { timeoutMs: 180_000 });
    if (r.code === 0) {
      ok += 1;
      state.skills[stateKey] = 'installed';
    }
    else {
      state.skills[stateKey] = 'failed';
      out.error(`${slug}: ${failureReason(`${r.stdout}\n${r.stderr}`)}`);
    }
    saveState(state);
  }
  markStepDone(state, key);
  const where = level === 'project' ? '<code>.agents/skills/</code>' : tr('tu usuario', 'your user');
  step.end(ok === toInstall.length ? 'ok' : 'warn', tr(`${ok} de ${toInstall.length} en ${where}`, `${ok} of ${toInstall.length} in ${where}`));
}

// ============================================================================
// .env helpers (shared with cli/lib/variables-flow.ts and cli/lib/harness-env.ts)
// ============================================================================
//
// The three MCP configs are committed with every server that needs `.env`
// values launched through the `.env` loader (`varlock run --filter <its vars>`),
// which reads `.env` itself at spawn time. The installer never rewrites those
// files: it only ensures `.env` contains the required values.

/**
 * Whether a variable's value must be masked. Decided by the manifest's
 * `secret:` flag (analysis §8 #14); the name suffix is only the fallback for a
 * variable the manifest does not declare.
 */
function isSecretName(name: string): boolean {
  const spec = VAR_MANIFEST.find(s => s.name === name);
  if (spec) { return spec.secret; }
  return SECRET_NAME_HINTS.some(hint => name.endsWith(hint) || name.endsWith(`_${hint}`));
}

function stripJsoncComments(input: string): string {
  // Strip /* … */ block comments + // line comments. Conservative: only strips
  // line comments that start the (trimmed) line, so URLs containing `//`
  // inside JSON string values survive.
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every name a `.env` loader `--filter` lists in `content`. */
function collectFilterNames(content: string, seen: Set<string>): void {
  for (const m of content.matchAll(MCP_FILTER_PATTERN)) {
    for (const name of m[1].split(',')) { if (name.length > 0) { seen.add(name); } }
  }
}

/**
 * Codex never expands `${VAR}`: `.codex/config.toml` forwards secrets BY NAME
 * through `env_vars = [...]` and `bearer_token_env_var = "..."`. Those names are
 * the Codex side of the env contract. `[mcp_servers.X.env]` tables hold literal
 * settings (log level, mode flags) and are deliberately NOT collected.
 */
function collectCodexMcpEnvVars(value: unknown, seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) { collectCodexMcpEnvVars(entry, seen); }
    return;
  }
  if (!value || typeof value !== 'object') { return; }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'bearer_token_env_var' && typeof entry === 'string') { seen.add(entry); }
    else if (key === 'env_vars' && Array.isArray(entry)) {
      for (const name of entry) { if (typeof name === 'string') { seen.add(name); } }
    }
    else if (key === 'env') { continue; }
    else { collectCodexMcpEnvVars(entry, seen); }
  }
}

/**
 * Union of the `.env` names the selected harnesses' committed MCP configs
 * depend on. Each host declares them differently (`${VAR}` in `.mcp.json`,
 * `{env:VAR}` or `{file:.auth/opencode/VAR}` in `opencode.jsonc`, forwarded
 * names in `.codex/config.toml`).
 */
export async function discoverRequiredEnvVars(
  agents: AgentId[],
  root = REPO_ROOT,
): Promise<string[]> {
  const seen = new Set<string>();
  const claudeMcpPath = root === REPO_ROOT ? CLAUDE_MCP_PATH : join(root, '.mcp.json');
  const openCodeConfigPath = root === REPO_ROOT ? OPENCODE_CONFIG_PATH : join(root, 'opencode.jsonc');
  const codexConfigPath = root === REPO_ROOT ? CODEX_CONFIG_PATH : join(root, '.codex', 'config.toml');
  if (agents.includes('claude-code') && existsSync(claudeMcpPath)) {
    const content = await readFile(claudeMcpPath, 'utf8');
    for (const m of content.matchAll(MCP_VAR_PATTERN)) { seen.add(m[1]); }
    collectFilterNames(content, seen);
  }
  if (agents.includes('opencode') && existsSync(openCodeConfigPath)) {
    const raw = await readFile(openCodeConfigPath, 'utf8');
    const content = stripJsoncComments(raw);
    for (const m of content.matchAll(OPENCODE_VAR_PATTERN)) { seen.add(m[1]); }
    for (const m of content.matchAll(OPENCODE_FILE_VAR_PATTERN)) { seen.add(m[1]); }
    collectFilterNames(content, seen);
  }
  if (agents.includes('codex') && existsSync(codexConfigPath)) {
    const raw = await readFile(codexConfigPath, 'utf8');
    collectCodexMcpEnvVars(Bun.TOML.parse(raw), seen);
    collectFilterNames(raw.replace(/^\s*#.*$/gm, ''), seen);
  }
  return [...seen].sort();
}

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) { continue; }
    const eq = line.indexOf('=');
    if (eq <= 0) { continue; }
    const key = line.slice(0, eq).trim();
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

/** Creates `.env` (from `.env.example` when it exists) with mode 600 from the first byte. */
export async function ensureEnvFileExists(out: Out = consoleOut): Promise<void> {
  if (existsSync(ENV_PATH)) { return; }
  const tmpl = existsSync(ENV_EXAMPLE_PATH) ? await readFile(ENV_EXAMPLE_PATH, 'utf8') : '';
  await writeFile(ENV_PATH, tmpl, { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(ENV_PATH, 0o600); }
  catch { /* best effort; a no-op on Windows */ }
  if (tmpl) { out.success('Created .env from .env.example (permissions 600).'); }
  else { out.warn('.env.example missing; created an empty .env (permissions 600).'); }
}

export async function appendVarsToEnv(vars: Record<string, string>): Promise<void> {
  if (Object.keys(vars).length === 0) { return; }
  const existing = existsSync(ENV_PATH) ? await readFile(ENV_PATH, 'utf8') : '';
  // Upsert: replace an existing declaration of KEY in place — whether it is an
  // active `KEY=`, a commented-out `# KEY=`, or an `export KEY=` line — so re-runs
  // and the acli retry loop never accumulate duplicate lines, and a commented
  // placeholder copied from `.env.example` is filled in place (uncommented)
  // instead of a second active copy being appended. Only genuinely-absent keys
  // are appended under the header.
  const lines = existing.split('\n');
  const remaining: Record<string, string> = { ...vars };
  // Optional indent, optional comment marker(s), optional `export`, then an
  // identifier immediately followed by `=`. Prose comments like
  // `# ===== Added by ... =====` never match (no identifier before the `=`).
  const declRe = /^(\s*)(?:#+\s*)?(export\s+)?([A-Za-z_]\w*)\s*=/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(declRe);
    if (m === null) { continue; }
    const indent = m[1];
    const exportPrefix = m[2] ?? '';
    const key = m[3];
    if (Object.prototype.hasOwnProperty.call(remaining, key)) {
      lines[i] = `${indent}${exportPrefix}${key}=${remaining[key]}`;
      delete remaining[key];
    }
  }
  let next = lines.join('\n');
  const toAppend = Object.entries(remaining);
  if (toAppend.length > 0) {
    const needsNewline = next.length > 0 && !next.endsWith('\n');
    const header = '\n# ===== Added by `bun setup` =====\n';
    const body = `${toAppend.map(([k, v]) => `${k}=${v}`).join('\n')}\n`;
    next = `${next}${needsNewline ? '\n' : ''}${header}${body}`;
  }
  // .env holds secrets — write 0600 (best effort; mode is a no-op on Windows).
  await writeFile(ENV_PATH, next, { mode: 0o600 });
  try { await chmod(ENV_PATH, 0o600); }
  catch { /* best effort */ }
}

/** One variable through the run: masked when the manifest marks it secret. Empty = skipped. */
async function askVar(name: string, opts: { title?: string, why?: string, kicker?: string } = {}): Promise<string> {
  const later = tr('Lo haré después', 'I will do it later');
  if (isSecretName(name)) {
    const v = await ask<string>({
      id: `var-${name}`,
      kind: 'secret',
      kicker: opts.kicker ?? tr('Secreto', 'Secret'),
      title: opts.title ?? name,
      ...(opts.why ? { why: opts.why } : {}),
      spec: { varName: name, label: tr('Valor', 'Value'), cta: tr('Guardar', 'Save'), secondary: [{ value: '__later__', label: later }] },
      default: '__later__',
    });
    return v === '__later__' ? '' : v;
  }
  const v = await ask<string[]>({
    id: `var-${name}`,
    kind: 'text',
    kicker: opts.kicker ?? '.env',
    title: opts.title ?? name,
    ...(opts.why ? { why: opts.why } : {}),
    spec: { fields: [{ id: name, label: name, hint: tr('Vacío = lo completas después en .env.', 'Empty = fill it later in .env.') }], cta: tr('Guardar', 'Save') },
    default: [''],
  });
  return (v[0] ?? '').trim();
}

// ============================================================================
// Credentials: where secrets live (ADR-0011), MCP variables, day-0 set
// ============================================================================

function suggestedVault(): string {
  try {
    const name = (parseYaml(readFileSync(PROJECT_YAML_FILE, 'utf8')) as { project?: { project_name?: unknown } })?.project?.project_name;
    const slug = typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    return `${slug || 'myproject'}-dev`;
  }
  catch { return 'myproject-dev'; }
}

/**
 * A project whose `.gitignore` (or the operator's global one) denies every
 * `.env*` would ignore the new file in silence and never share it with the
 * team. `.gitignore` is the project's: re-include the one file, which holds
 * references only, and say so.
 */
function ensureOverlayTracked(out: Out): void {
  const ignored = spawnSync('git', ['check-ignore', '-q', PROVIDER_SCHEMA_FILE], { cwd: REPO_ROOT }).status === 0;
  if (!ignored) { return; }
  const gitignore = join(REPO_ROOT, '.gitignore');
  const before = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const sep = before === '' || before.endsWith('\n') ? '' : '\n';
  writeFileSync(gitignore, `${before}${sep}# The secret-manager overlay holds references only (ADR-0011): it travels.\n!${PROVIDER_SCHEMA_FILE}\n`, 'utf8');
  out.success(`Re-included ${PROVIDER_SCHEMA_FILE} in .gitignore (it was ignored by an .env* rule).`);
}

async function secretsProviderStep(state: InstallState): Promise<void> {
  const key = 'secretsProviderRanAt';
  const title = tr('Dónde viven los secretos', 'Where secrets live');
  if (existsSync(join(REPO_ROOT, PROVIDER_SCHEMA_FILE))) {
    UI!.step({ phase: 'creds', why: 'secrets', title }).end('ok', tr(`gestor de secretos (<code>${PROVIDER_SCHEMA_FILE}</code>); un valor no vacío en .env sigue ganando`, `secret manager (<code>${PROVIDER_SCHEMA_FILE}</code>); a non-empty .env value still wins`));
    return;
  }
  let config;
  try { config = readSecretsConfig(PROJECT_YAML_FILE); }
  catch (err) {
    UI!.notice('warn', `${(err as Error).message} ${tr('Los secretos quedan en .env.', 'Secrets stay in .env.')}`);
    return;
  }
  if (state.steps?.[key] && !process.env.INSTALL_SECRETS_PROVIDER) {
    UI!.step({ phase: 'creds', why: 'secrets', title }).end('skipped', config.provider === 'local' ? tr('.env (elegido antes)', '.env (chosen earlier)') : `${config.provider} ${tr('(elegido antes)', '(chosen earlier)')}`);
    return;
  }

  const requested = process.env.INSTALL_SECRETS_PROVIDER?.trim();
  if (requested) {
    if (!(SECRET_PROVIDERS as readonly string[]).includes(requested)) {
      UI!.notice('warn', `INSTALL_SECRETS_PROVIDER=${requested} ${tr('no es uno de', 'is not one of')} ${SECRET_PROVIDERS.join(' | ')}; ${tr('los secretos quedan en .env.', 'secrets stay in .env.')}`);
      return;
    }
    config.provider = requested as typeof config.provider;
  }
  const vaultFromEnv = process.env.INSTALL_SECRETS_VAULT?.trim();
  if (vaultFromEnv) { config.onepassword.vault = vaultFromEnv; }

  config.provider = await ask<typeof config.provider>({
    id: 'secrets-provider',
    kind: 'select',
    kicker: tr('Dónde guardarlas', 'Where to keep them'),
    title: tr('Dónde viven los secretos de este proyecto?', 'Where do this project\'s secrets live?'),
    g: 'secrets',
    spec: {
      options: [
        { value: 'local', label: tr('En un archivo .env de esta máquina', 'In a .env file on this machine'), desc: tr('Lo más simple. El archivo está ignorado por git y solo tú lo ves.', 'The simplest. git ignores the file and only you see it.'), rec: true },
        { value: '1password', label: tr('En 1Password', 'In 1Password'), desc: tr('El repo guarda solo referencias. Útil si el equipo comparte una bóveda; CI usa un service account.', 'The repo keeps references only. Useful when the team shares a vault; CI uses a service account.') },
      ],
      cta: tr('Elegir', 'Choose'),
    },
    default: config.provider,
  });
  if (config.provider === '1password') {
    const [vault, account] = await ask<string[]>({
      id: 'op-vault',
      kind: 'text',
      kicker: '1Password',
      title: tr('Qué bóveda y qué cuenta?', 'Which vault and which account?'),
      spec: {
        fields: [
          { id: 'vault', label: tr('Bóveda', 'Vault'), short: tr('Bóveda', 'Vault'), value: config.onepassword.vault ?? suggestedVault(), required: true, pattern: '^[A-Za-z0-9._-]+$', patternMsg: tr('Solo letras, dígitos, ".", "_" o "-".', 'Letters, digits, ".", "_" or "-" only.'), hint: tr('Equipo: &lt;proyecto&gt;-dev; plan personal: Private.', 'Team: &lt;project&gt;-dev; personal plan: Private.') },
          { id: 'account', label: tr('Cuenta (de op account list)', 'Account (from op account list)'), short: tr('Cuenta', 'Account'), value: config.onepassword.account ?? '', hint: tr('Vacío = la cuenta por defecto de la CLI.', 'Empty = the CLI default account.') },
        ],
        cta: tr('Guardar', 'Save'),
      },
      default: [config.onepassword.vault ?? suggestedVault(), config.onepassword.account ?? ''],
    });
    config.onepassword.vault = isValidVaultName(vault) ? vault : suggestedVault();
    config.onepassword.account = account === '' ? null : account;
    config.onepassword.auth = await ask<typeof config.onepassword.auth>({
      id: 'op-auth',
      kind: 'select',
      kicker: '1Password',
      title: tr('Cómo se autentica una laptop?', 'How does a laptop authenticate?'),
      spec: {
        options: [
          { value: 'app', label: tr('App de escritorio (biometría; CI usa el token del service account)', 'Desktop app (biometric; CI uses the service-account token)'), rec: true },
          { value: 'service-account', label: tr('Solo token de service account (sin app)', 'Service-account token only (no desktop app)') },
        ],
      },
      default: config.onepassword.auth,
    });
  }

  const step = UI!.step({ phase: 'creds', why: 'secrets', title });
  const out = stepOut(step);
  if (config.provider === 'local') {
    applySecretsChoice(REPO_ROOT, PROJECT_YAML_FILE, config);
    markStepDone(state, key);
    step.end('ok', tr('.env (por defecto). Un gestor de secretos es opcional: INSTALLER.md, "Secret manager (advanced)".', '.env (default). A secret manager is optional: INSTALLER.md, "Secret manager (advanced)".'));
    return;
  }
  try {
    const result = applySecretsChoice(REPO_ROOT, PROJECT_YAML_FILE, config);
    const adapter = ADAPTERS[config.provider];
    if (result.overlayWritten) {
      out.success(`Wrote ${PROVIDER_SCHEMA_FILE} (${adapter.label} references only; commit it).`);
      ensureOverlayTracked(out);
    }
    if (result.yamlWritten) { out.success(`Recorded secrets.provider: ${config.provider} in .agents/project.yaml.`); }
    out.info(`${adapter.label} setup, once per person:`);
    for (const line of adapter.setupSteps(config)) { out.dim(`  ${line}`); }
    markStepDone(state, key);
    step.end('ok', `${adapter.label} · ${tr('lo que la bóveda tenga, déjalo vacío en las preguntas siguientes', 'leave what the vault holds empty in the next questions')}`);
  }
  catch (err) {
    step.end('warn', `${tr('Gestor no configurado', 'Manager not configured')}: ${(err as Error).message} ${tr('Los secretos quedan en .env.', 'Secrets stay in .env.')}`);
  }
}

async function configureMcps(agents: AgentId[], state: InstallState): Promise<void> {
  const title = tr('Variables de los servidores MCP', 'MCP server variables');
  if (agents.length === 0) {
    UI!.step({ phase: 'creds', why: 'mcp', title }).end('skipped', tr('sin agentes', 'no agents'));
    return;
  }
  const required = await discoverRequiredEnvVars(agents);
  const envValues = existsSync(ENV_PATH) ? parseEnvFile(await readFile(ENV_PATH, 'utf8')) : {};
  const newValues: Record<string, string> = {};
  const stillPending: string[] = [];
  const deferred: string[] = [];
  const toAsk: string[] = [];

  for (const name of required) {
    if ((envValues[name] ?? '').trim().length > 0) { continue; }
    const fromProcessEnv = process.env[name];
    if (fromProcessEnv && fromProcessEnv.trim().length > 0) { newValues[name] = fromProcessEnv.trim(); continue; }
    // Non-critical project-bound / infra var: NOT asked and NOT pending.
    // Supabase/Postgres/app vars are auto-provisioned and pulled later via
    // `bun setup --variables`; n8n vars are optional.
    if (INSTALLER_DEFERRED_VARS.has(name)) { deferred.push(name); continue; }
    toAsk.push(name);
  }
  for (const name of toAsk) {
    const value = NON_INTERACTIVE ? '' : await askVar(name, { kicker: 'MCP' });
    if (value.length === 0) { stillPending.push(name); }
    else { newValues[name] = value; }
  }

  const step = UI!.step({ phase: 'creds', why: 'mcp', title });
  const out = stepOut(step);
  await ensureEnvFileExists(out);
  if (Object.keys(newValues).length > 0) {
    await appendVarsToEnv(newValues);
    out.success(`${tr('Escritas en .env', 'Written to .env')}: ${Object.keys(newValues).join(', ')}`);
  }
  if (deferred.length > 0) {
    out.dim(tr(`Para después (se aprovisionan solas o son opcionales): ${deferred.join(', ')}. \`bun setup --variables\` las trae.`, `For later (auto-provisioned or optional): ${deferred.join(', ')}. \`bun setup --variables\` brings them.`));
  }
  state.pendingEnvVars = stillPending;

  // Per-server status — placeholder if any of its required vars are still pending.
  const merged = { ...envValues, ...newValues };
  for (const [server, secrets] of Object.entries(MCP_SERVER_SECRETS)) {
    if (secrets.length === 0) {
      state.mcps[server] = 'configured-no-key';
    }
    else {
      const anyMissing = secrets.some(s => !merged[s] || merged[s].trim().length === 0);
      state.mcps[server] = anyMissing ? 'placeholder' : 'configured-with-key';
    }
  }
  saveState(state);
  step.end('ok', required.length === 0
    ? tr('ninguna declarada', 'none declared')
    : tr(`${required.length} declaradas · ${stillPending.length + deferred.length} para después`, `${required.length} declared · ${stillPending.length + deferred.length} for later`));
}

/**
 * Day-0 credentials a person CAN provide on a fresh clone (no cloud project
 * needed): the Atlassian site (to `.agents/project.yaml`, project identity) and
 * email in one card, the Atlassian token and the optional Resend key in masked
 * cards. Skip is a first-class answer: nothing later blocks on them.
 */
async function configureDayZeroCredentials(state: InstallState): Promise<void> {
  if (!existsSync(ENV_PATH)) {
    const step = UI!.step({ phase: 'creds', title: tr('Crear <code>.env</code>', 'Create <code>.env</code>') });
    await ensureEnvFileExists(stepOut(step));
    step.end('ok', tr('permisos 600', 'permissions 600'));
  }
  const envValues = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const newValues: Record<string, string> = {};
  const has = (name: string): boolean => (envValues[name] ?? '').trim().length > 0 || (process.env[name] ?? '').trim().length > 0;

  let hostSet = true;
  try { resolveAtlassianInstance(); }
  catch { hostSet = false; }

  const plain: Array<'ATLASSIAN_URL' | 'ATLASSIAN_EMAIL'> = [];
  if (!hostSet) { plain.push('ATLASSIAN_URL'); }
  if (!has('ATLASSIAN_EMAIL')) { plain.push('ATLASSIAN_EMAIL'); }
  if (plain.length > 0) {
    const fields = plain.map(name => name === 'ATLASSIAN_URL'
      ? { id: name, label: tr('Sitio de Atlassian', 'Atlassian site'), short: tr('Sitio', 'Site'), prefix: 'https://', placeholder: 'acme.atlassian.net', pattern: '^(https?://)?[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+/?$', patternMsg: tr('Un nombre de sitio, por ejemplo acme.atlassian.net.', 'A site name, for example acme.atlassian.net.') }
      : { id: name, label: tr('Correo de tu cuenta Atlassian', 'Your Atlassian account email'), short: tr('Correo', 'Email'), placeholder: 'tu@acme.dev', pattern: '^\\S+@\\S+\\.\\S+$', patternMsg: tr('Escribe el correo con el que entras a Jira.', 'Type the email you sign in to Jira with.') });
    const values = await ask<string[]>({
      id: 'day0',
      kind: 'text',
      kicker: 'Jira',
      title: tr('Cuál es tu sitio de Atlassian y con qué correo entras?', 'What is your Atlassian site and which email do you sign in with?'),
      g: 'jira',
      why: tr('El sitio queda en <code>.agents/project.yaml</code> (no es secreto). El correo va a <code>.env</code>. Vacío = lo completas después y la fase de Jira se salta.', 'The site goes to <code>.agents/project.yaml</code> (it is not a secret). The email goes to <code>.env</code>. Empty = you fill it later and the Jira phase is skipped.'),
      spec: { fields, cta: tr('Guardar', 'Save') },
      default: plain.map(() => ''),
    });
    plain.forEach((name, i) => {
      const v = (values[i] ?? '').trim();
      if (!v) { return; }
      if (name === 'ATLASSIAN_URL') {
        try { writeAtlassianUrlToYaml(/^https?:\/\//.test(v) ? v : `https://${v}`); }
        catch (err) { UI?.notice('warn', `${tr('No se pudo escribir el sitio de Atlassian', 'Could not write the Atlassian host')}: ${(err as Error).message}`); }
      }
      else {
        newValues[name] = v;
        process.env[name] = v;
      }
    });
  }

  if (!has('ATLASSIAN_API_TOKEN')) {
    const token = await askVar('ATLASSIAN_API_TOKEN', {
      title: tr('Pega tu token de API de Atlassian', 'Paste your Atlassian API token'),
      why: tr('Lo creas en <code>id.atlassian.com/manage-profile/security/api-tokens</code> → Crear token de API. Copia el valor completo: Atlassian lo muestra una sola vez.', 'Create it at <code>id.atlassian.com/manage-profile/security/api-tokens</code> → Create API token. Copy the whole value: Atlassian shows it only once.'),
    });
    if (token) { newValues.ATLASSIAN_API_TOKEN = token; process.env.ATLASSIAN_API_TOKEN = token; }
  }
  if (!has('RESEND_API_KEY')) {
    const key = await askVar('RESEND_API_KEY', {
      kicker: tr('Opcional', 'Optional'),
      title: tr('Tu API key de Resend, si la usas', 'Your Resend API key, if you use it'),
      why: tr('La usan el código de la app y la CLI <code>resend</code>. La obtienes en <code>resend.com/api-keys</code>. Sin ella la app no envía correos hasta que la cargues.', 'The app code and the <code>resend</code> CLI use it. Get it at <code>resend.com/api-keys</code>. Without it the app sends no email until you add it.'),
    });
    if (key) { newValues.RESEND_API_KEY = key; process.env.RESEND_API_KEY = key; }
  }

  const step = UI!.step({ phase: 'creds', title: tr('Escribir <code>.env</code> (permisos 600)', 'Write <code>.env</code> (permissions 600)') });
  if (Object.keys(newValues).length > 0) {
    await appendVarsToEnv(newValues);
    reloadDotEnv();
  }
  const names = Object.keys(newValues);
  step.end('ok', names.length > 0
    ? tr(`${names.length} variable(s) guardada(s): ${names.join(', ')} · ningún valor secreto se imprime`, `${names.length} variable(s) saved: ${names.join(', ')} · no secret value is printed`)
    : tr('nada nuevo', 'nothing new'));

  // No `resend login` here: its only non-interactive form is `--key <key>`,
  // which puts the key on argv (visible in the process list). The resend CLI
  // reads RESEND_API_KEY from the environment on every command, and a stored
  // session is the user's own interactive `resend login` (closing next steps).
  saveState(state);
}

// ============================================================================
// GitHub
// ============================================================================

interface GhStatus {
  found: boolean
  version?: string
  authenticated: boolean
}

export function detectGh(): GhStatus {
  const path = which('gh');
  if (!path) { return { found: false, authenticated: false }; }

  const versionRes = tryRun('gh', ['--version']);
  const versionMatch = versionRes.stdout.match(/gh version (\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : undefined;

  const authRes = tryRun('gh', ['auth', 'status']);
  const authenticated = authRes.ok;

  return { found: true, version, authenticated };
}

function ghApi(args: string[]): { ok: boolean, stdout: string } {
  const res = tryRun('gh', ['api', ...args]);
  return { ok: res.ok, stdout: res.stdout.trim() };
}

function sanitizeRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** Whether `origin` has `branch`, read from the remote itself (a push can fail after the repo was created). */
function remoteHasBranch(branch: string): boolean {
  const r = spawnSync('git', ['ls-remote', '--heads', 'origin', branch], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15_000 });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function writeTemplateMarker(): void {
  if (existsSync(MARKER_PATH)) { return; }
  try {
    mkdirSync(dirname(MARKER_PATH), { recursive: true });
    writeFileSync(MARKER_PATH, `${JSON.stringify({ template: TEMPLATE_MARKER }, null, 2)}\n`, 'utf8');
  }
  catch { /* best effort */ }
}

async function setupGithubRemote(state: InstallState): Promise<void> {
  const key = 'githubRemoteRanAt';
  const title = tr('Repositorio en GitHub', 'GitHub repository');
  const skip = (note: string): void => { UI!.step({ phase: 'github', why: 'gh', title }).end('skipped', note); };

  const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const currentBranch = branchRes.status === 0 ? branchRes.stdout.trim() : 'main';

  // A recorded repo whose push never landed: retry the push only (analysis §8 #7).
  if (state.github && state.github.pushed === false) {
    const step = UI!.step({ phase: 'github', title: tr(`Subir la rama ${currentBranch}`, `Push the ${currentBranch} branch`) });
    const push = await runStreamed('git', ['push', '-u', 'origin', currentBranch], { step, timeoutMs: 600_000 });
    if (push.code === 0 && remoteHasBranch(currentBranch)) {
      state.github.pushed = true;
      markStepDone(state, key);
      step.end('ok', state.github.url);
    }
    else {
      saveState(state);
      step.end('failed', tr(`El repositorio existe pero la subida falló. Arregla lo que digan los hooks y corre <code>git push -u origin ${currentBranch}</code>.`, `The repository exists but the push failed. Fix what the hooks report and run <code>git push -u origin ${currentBranch}</code>.`));
    }
    return;
  }

  if (NON_INTERACTIVE) { skip(tr('modo no interactivo', 'non-interactive mode')); return; }

  // Idempotency: a recorded repo that `origin` still points at.
  if (state.github && !FORCE_GITHUB_REMOTE) {
    const originUrl = tryRun('git', ['remote', 'get-url', 'origin']);
    if (originUrl.ok && originUrl.stdout.trim().includes(`${state.github.account}/${state.github.repo}`)) {
      skip(tr(`ya conectado: ${state.github.url}`, `already wired: ${state.github.url}`));
      return;
    }
  }

  // An `origin` this installer did not create (a manual `gh repo create`, a clone): record it, create nothing.
  if (!state.github) {
    const originUrl = tryRun('git', ['remote', 'get-url', 'origin']);
    if (originUrl.ok) {
      const url = originUrl.stdout.trim();
      // SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo[.git]).
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
      if (match) {
        const [, account, repo] = match;
        state.github = { account, repo, visibility: 'unknown', url: `https://github.com/${account}/${repo}`, createdAt: 'pre-existing', pushed: remoteHasBranch(currentBranch) };
        markStepDone(state, key);
        skip(tr(`ya tiene remoto: ${state.github.url}`, `already has a remote: ${state.github.url}`));
        return;
      }
    }
  }

  const gh = detectGh();
  if (!gh.found) { skip(tr('GitHub CLI no está instalada. Después: <code>gh repo create --source=. --remote=origin --push</code>', 'GitHub CLI is not installed. Later: <code>gh repo create --source=. --remote=origin --push</code>')); return; }
  if (!gh.authenticated) { skip(tr('GitHub CLI sin sesión. <code>gh auth login</code> y vuelve a correr el instalador.', 'GitHub CLI has no session. <code>gh auth login</code> and run the installer again.')); return; }

  const want = await ask<boolean>({
    id: 'gh-create',
    kind: 'confirm',
    kicker: 'GitHub',
    title: tr('Creamos el repositorio en GitHub ahora?', 'Create the GitHub repository now?'),
    g: 'gh',
    spec: { yes: tr('Sí, crearlo', 'Yes, create it'), no: tr('No, solo local', 'No, local only') },
    default: true,
  });
  if (!want) { skip(tr('solo local. Después: <code>gh repo create --source=. --remote=origin --push</code>', 'local only. Later: <code>gh repo create --source=. --remote=origin --push</code>')); return; }

  let defaultRepoName = 'my-project';
  try {
    const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as { name?: string };
    if (pkg.name) { defaultRepoName = sanitizeRepoName(pkg.name); }
  }
  catch { /* fall through with default */ }

  const userRes = ghApi(['user', '--jq', '.login']);
  if (!userRes.ok || !userRes.stdout) { skip(tr('No se pudo leer tu usuario de GitHub (`gh api user`).', 'Could not read your GitHub user (`gh api user`).')); return; }
  const userLogin = userRes.stdout;
  const orgsRes = ghApi(['user/orgs', '--jq', '.[].login']);
  const orgs = orgsRes.ok && orgsRes.stdout.length > 0 ? orgsRes.stdout.split('\n').filter(Boolean) : [];

  const account = await ask<string>({
    id: 'gh-account',
    kind: 'select',
    kicker: tr('Repositorio', 'Repository'),
    title: tr('Dónde vive el repositorio?', 'Where does the repository live?'),
    spec: {
      options: [
        { value: userLogin, label: userLogin, desc: tr('Tu cuenta personal', 'Your personal account'), rec: true },
        ...orgs.map(org => ({ value: org, label: org, desc: tr('Organización', 'Organization') })),
      ],
      cta: tr('Elegir', 'Choose'),
    },
    default: userLogin,
  });
  const visibility = await ask<'private' | 'public' | 'internal'>({
    id: 'gh-visibility',
    kind: 'select',
    kicker: tr('Repositorio', 'Repository'),
    title: tr('Quién puede verlo?', 'Who can see it?'),
    spec: {
      options: [
        { value: 'private', label: tr('Privado', 'Private'), desc: tr('Solo quien invites.', 'Only the people you invite.'), rec: true },
        { value: 'public', label: tr('Público', 'Public'), desc: tr('Cualquiera en internet.', 'Anyone on the internet.') },
        { value: 'internal', label: tr('Interno', 'Internal'), desc: tr('Toda la organización (solo organizaciones).', 'The whole organization (organizations only).') },
      ],
    },
    default: 'private',
  });
  const [rawName] = await ask<string[]>({
    id: 'gh-name',
    kind: 'text',
    kicker: tr('Repositorio', 'Repository'),
    title: tr('Cómo se llama?', 'What is it called?'),
    spec: {
      fields: [{ id: 'repo', label: tr('Nombre', 'Name'), short: 'Repo', prefix: `${account}/`, value: defaultRepoName, required: true, pattern: '^[A-Za-z0-9._-]+$', patternMsg: tr('Letras, dígitos, ".", "_" o "-".', 'Letters, digits, ".", "_" or "-".') }],
      cta: tr('Crear y subir', 'Create and push'),
    },
    default: [defaultRepoName],
  });
  const repoName = sanitizeRepoName(rawName);
  if (!repoName) { skip(tr('nombre de repositorio inválido', 'invalid repository name')); return; }

  const create = UI!.step({ phase: 'github', title: tr(`Crear <code>${account}/${repoName}</code> (${visibility})`, `Create <code>${account}/${repoName}</code> (${visibility})`) });
  const createRes = await runStreamed('gh', ['repo', 'create', `${account}/${repoName}`, `--${visibility}`, '--source=.', '--remote=origin'], { step: create, timeoutMs: 120_000 });
  if (createRes.code !== 0) {
    create.end('failed', tr('No se creó el remoto; los archivos locales quedan intactos. Puedes reintentar después.', 'The remote was NOT created; local files are intact. You can retry later.'));
    return;
  }
  const url = `https://github.com/${account}/${repoName}`;
  // Recorded BEFORE the push: a failed push must not read as "(pushed)" next time (analysis §8 #7).
  state.github = { account, repo: repoName, visibility, url, createdAt: new Date().toISOString(), pushed: false };
  saveState(state);
  create.end('ok', url);

  const push = UI!.step({ phase: 'github', title: tr(`Subir la rama ${currentBranch}`, `Push the ${currentBranch} branch`), detail: tr('los hooks pre-push corren sus comprobaciones', 'the pre-push hooks run their checks') });
  const pushRes = await runStreamed('git', ['push', '-u', 'origin', currentBranch], { step: push, timeoutMs: 600_000 });
  if (pushRes.code === 0 && remoteHasBranch(currentBranch)) {
    state.github.pushed = true;
    markStepDone(state, key);
    push.end('ok', url);
  }
  else {
    saveState(state);
    push.end('failed', tr(`El repositorio se creó pero la subida falló (casi siempre un hook pre-push). Arréglalo y corre <code>git push -u origin ${currentBranch}</code>, o vuelve a correr el instalador.`, `The repository was created but the push failed (almost always a pre-push hook). Fix it and run <code>git push -u origin ${currentBranch}</code>, or run the installer again.`));
  }
}

// ============================================================================
// Verify: external CLIs (information only: a missing one never stops the run)
// ============================================================================

interface CliResult {
  name: string
  status: CliStatus
  purpose: string
  install?: string
  docs: string
}

function installHintForOS(cli: { name: string, install?: string }): string {
  if (cli.install) { return cli.install; }
  if (process.platform === 'win32') { return `winget install ${cli.name}`; }
  if (process.platform === 'darwin') { return `brew install ${cli.name}`; }
  return `apt install ${cli.name}`;
}

function verifyExternalClis(state: InstallState): CliResult[] {
  const step = UI!.step({ phase: 'verify', title: tr('Herramientas de línea de comandos', 'Command-line tools') });
  const results: CliResult[] = EXTERNAL_CLIS.map((cli) => {
    const found = which(cli.name) !== null;
    const status: CliStatus = found ? 'found' : 'missing';
    state.externalClis[cli.name] = status;
    return { name: cli.name, status, purpose: cli.purpose, install: cli.install, docs: cli.docs };
  });
  saveState(state);
  for (const r of results.filter(x => x.status === 'missing')) {
    step.log(`– ${r.name}: ${installHintForOS(r)}  (${r.purpose})`);
  }
  const found = results.filter(r => r.status === 'found').length;
  const missingRequired = EXTERNAL_CLIS.filter(cli => cli.required === true && state.externalClis[cli.name] !== 'found' && !SKIP_JIRA);
  step.end(found === results.length ? 'ok' : 'warn', tr(
    `${found} de ${results.length} encontradas${missingRequired.length ? ` · falta ${missingRequired.map(c => c.name).join(', ')} (Jira)` : ''}`,
    `${found} of ${results.length} found${missingRequired.length ? ` · ${missingRequired.map(c => c.name).join(', ')} missing (Jira)` : ''}`,
  ));
  return results;
}

// ============================================================================
// State persistence
// ============================================================================

/** Drop unknown / duplicated agent ids from a persisted state file. */
export function migrateAgentIds(value: unknown): AgentId[] {
  if (!Array.isArray(value)) { return []; }
  return [...new Set(value.filter((agent): agent is AgentId =>
    agent === 'claude-code' || agent === 'opencode' || agent === 'codex'))];
}

async function loadPriorState(): Promise<InstallState | null> {
  if (!existsSync(STATE_PATH)) { return null; }
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as InstallState;
    parsed.agents = migrateAgentIds(parsed.agents);
    // Back-fill postInstall for state files written before this field existed.
    parsed.postInstall ??= {
      agentsSetup: 'pending',
      acliAuth: 'pending',
      jiraSyncFields: 'pending',
      jiraSyncWorkflows: 'pending',
      jiraCheck: 'pending',
    };
    // Back-fill individual fields added after initial postInstall shape.
    parsed.postInstall.acliAuth ??= 'pending';
    parsed.postInstall.jiraSyncWorkflows ??= 'pending';
    return parsed;
  }
  catch {
    return null;
  }
}

async function writeInstallState(state: InstallState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function buildInitialState(prior: InstallState | null): InstallState {
  if (prior && prior.version === 1) {
    prior.agents = migrateAgentIds(prior.agents);
    prior.steps ??= {};
    prior.postInstall ??= {
      agentsSetup: 'pending',
      acliAuth: 'pending',
      jiraSyncFields: 'pending',
      jiraSyncWorkflows: 'pending',
      jiraCheck: 'pending',
    };
    prior.postInstall.acliAuth ??= 'pending';
    prior.postInstall.jiraSyncWorkflows ??= 'pending';
    // State written before the `engram setup` switch has only `gentleAi`,
    // which recorded the gentle-ai binary, not engram: start engram fresh.
    prior.engram ??= { status: 'missing', checkedAt: new Date().toISOString() };
    return prior;
  }
  return {
    version: 1,
    installedAt: new Date().toISOString(),
    agents: [],
    engram: { status: 'missing', checkedAt: new Date().toISOString() },
    skills: {},
    mcps: {},
    externalClis: {},
    pendingEnvVars: [],
    steps: {},
    postInstall: {
      agentsSetup: 'pending',
      acliAuth: 'pending',
      jiraSyncFields: 'pending',
      jiraSyncWorkflows: 'pending',
      jiraCheck: 'pending',
    },
  };
}

// ============================================================================
// Harness selection + compatibility repair
// ============================================================================

/**
 * Repair the generated surfaces and run the check. Only the harnesses in use
 * (`declaredHarnesses`, ADR-0012) count: a harness the project dropped is
 * never a reason to throw, and without Claude Code there is no alias to make
 * (`alias: null`).
 */
export function repairRepositoryCompatibility(
  root = REPO_ROOT,
  platform: NodeJS.Platform = process.platform,
): { alias: ReturnType<typeof repairClaudeSkillsAlias> | null, shadowingCommandsMoved: string[] } {
  const alias = declaredHarnesses(root).harnesses.includes('claude') ? repairClaudeSkillsAlias(root, platform) : null;
  const shadowingCommandsMoved = removeShadowingCommands(root);
  const check = checkAgentCompatibility(root, platform);
  if (!check.ok) {
    throw new Error(`Agent compatibility repair incomplete:\n${check.errors.join('\n')}`);
  }
  return { alias, shadowingCommandsMoved };
}

/** The `harnesses:` entry of each installer agent id. */
export function harnessOfAgent(agent: AgentId): Harness {
  return agent === 'claude-code' ? 'claude' : agent;
}

/**
 * The `harnesses:` list after an agent selection: the declared list plus the
 * agents just selected, never fewer. A re-run that selects one agent must not
 * silently drop a harness a teammate declared; dropping one is an edit to
 * `.agents/project.yaml`.
 */
export function mergedHarnesses(existing: readonly Harness[], agents: readonly AgentId[]): Harness[] {
  const out = [...existing];
  for (const harness of agents.map(harnessOfAgent)) {
    if (!out.includes(harness)) { out.push(harness); }
  }
  return out;
}

/**
 * Write the agent selection to `harnesses:` in `.agents/project.yaml`, then
 * OFFER to delete the files of every harness left out (default keep). The
 * boilerplate itself checks all three and is left alone.
 */
export async function recordHarnessSelection(
  agents: readonly AgentId[],
  root = REPO_ROOT,
  confirm: (message: string, defaultYes: boolean) => Promise<boolean> = askConfirm,
  out: Out = consoleOut,
): Promise<void> {
  const selection = declaredHarnesses(root);
  if (selection.source === 'boilerplate' || agents.length === 0) { return; }
  const yamlPath = join(root, '.agents', 'project.yaml');
  if (!existsSync(yamlPath)) {
    out.dim(`.agents/project.yaml not found: ${HARNESSES_KEY} not recorded (the gates detect the harnesses from the files present).`);
    return;
  }
  const existing = explicitHarnesses(root);
  const next = mergedHarnesses(existing, agents);
  if (next.join(',') !== existing.join(',')) {
    const before = readFileSync(yamlPath, 'utf8');
    writeFileSync(yamlPath, withHarnesses(before, next));
    // Read back from the destination, not from the value just computed.
    const written = explicitHarnesses(root);
    if (written.join(',') !== next.join(',')) {
      throw new Error(`${HARNESSES_KEY} in .agents/project.yaml reads [${written.join(', ')}] after writing [${next.join(', ')}]`);
    }
    out.success(`${HARNESSES_KEY}: [${next.join(', ')}]`);
  }

  for (const harness of HARNESSES.filter(h => !next.includes(h))) {
    const present = HARNESS_FILES[harness].filter(file => existsSync(join(root, file)));
    if (present.length === 0) { continue; }
    const remove = await confirm(
      `${HARNESS_LABEL[harness]} is not a harness this project uses. Delete its files (${present.join(', ')})?`,
      false,
    );
    if (!remove) {
      out.dim(`Kept ${present.join(', ')}: not checked while ${HARNESSES_KEY} leaves out ${harness}.`);
      continue;
    }
    for (const file of present) {
      rmSync(join(root, file), { force: true });
      removeEmptyParents(root, file);
    }
    out.success(`Deleted the ${HARNESS_LABEL[harness]} files: ${present.join(', ')}`);
  }
}

/** Remove the now-empty directories above a deleted file, never the root itself. */
function removeEmptyParents(root: string, file: string): void {
  let dir = dirname(join(root, file));
  while (dir !== root && dir.startsWith(root) && existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

function compatibilityStep(lane: string): void {
  const step = UI!.step({ id: 'compat', phase: 'install', lane, title: tr('Enlazar las skills a tus agentes', 'Link the skills to your agents') });
  try {
    const compatibility = repairRepositoryCompatibility();
    const moved = compatibility.shadowingCommandsMoved;
    step.end('ok', `${compatibility.alias ? '<code>.claude/skills</code> → <code>.agents/skills/</code>' : tr('sin alias de Claude', 'no Claude alias')}${moved.length > 0 ? tr(` · movidos a ${SHADOWING_COMMANDS_BACKUP_DIR}/: ${moved.join(', ')}`, ` · moved to ${SHADOWING_COMMANDS_BACKUP_DIR}/: ${moved.join(', ')}`) : ''}`);
  }
  catch (err) {
    for (const line of (err as Error).message.split('\n').slice(1, 8)) { step.log(line, 'err'); }
    step.end('failed', tr('El contrato de los agentes quedó incompleto: corre <code>bun run agents:compat</code>.', 'The agent contract is incomplete: run <code>bun run agents:compat</code>.'));
  }
}

// ============================================================================
// Project: .agents/project.yaml (agents:setup, absorbed into the run)
// ============================================================================

/**
 * GitHub "Use this template" copies the maintainers' own `.agents/project.yaml`.
 * Reseeded from the schema BEFORE anything writes to it (the Team phase writes
 * `harnesses:`), so nothing this run records is wiped later (analysis §8 #6).
 */
function reseedCopiedTemplate(): 'reseeded' | 'kept' | 'failed' {
  if (!existsSync(PROJECT_YAML_FILE)) { return 'kept'; }
  const origin = tryRun('git', ['remote', 'get-url', 'origin']);
  if (classifyProjectYaml(readFileSync(PROJECT_YAML_FILE, 'utf8'), origin.ok ? origin.stdout.trim() : null) !== 'copied-template') { return 'kept'; }
  const schemaPath = join(REPO_ROOT, SCHEMA_FILE);
  const seeded = existsSync(schemaPath) ? seedFromSchema(readFileSync(schemaPath, 'utf8')) : null;
  if (seeded === null) { return 'failed'; }
  writeFileSync(PROJECT_YAML_FILE, seeded, 'utf8');
  return 'reseeded';
}

interface ProjectValues {
  name: string
  key: string
  domain: string
  local: string
  staging: string
  defaultEnv: string
}

function readProjectValues(): ProjectValues {
  const empty: ProjectValues = { name: '', key: '', domain: '', local: '', staging: '', defaultEnv: '' };
  try {
    const y = parseYaml(readFileSync(PROJECT_YAML_FILE, 'utf8')) as {
      project?: { project_name?: unknown, project_key?: unknown, webapp_domain?: unknown }
      environments?: Record<string, { web_url?: unknown }>
      testing?: { default_env?: unknown }
    };
    const s = (v: unknown): string => (typeof v === 'string' ? v : '');
    return {
      name: s(y.project?.project_name),
      key: s(y.project?.project_key),
      domain: s(y.project?.webapp_domain),
      local: s(y.environments?.local?.web_url),
      staging: s(y.environments?.staging?.web_url),
      defaultEnv: s(y.testing?.default_env),
    };
  }
  catch { return empty; }
}

/** `localhost:3000` → `http://localhost:3000`; `staging.acme.shop` → `https://staging.acme.shop`. */
export function withScheme(raw: string, fallback: 'http' | 'https'): string {
  const v = raw.trim();
  if (!v) { return ''; }
  return /^https?:\/\//i.test(v) ? v : `${fallback}://${v}`;
}

const URL_PATTERN = '^(https?://)?(localhost|[^\\s/.]+(\\.[^\\s/.]+)+)(:\\d+)?(/\\S*)?$';

async function projectPhase(state: InstallState): Promise<void> {
  const title = tr('Guardar <code>.agents/project.yaml</code>', 'Save <code>.agents/project.yaml</code>');
  if (!existsSync(PROJECT_YAML_FILE)) {
    UI!.step({ phase: 'project', title }).end('skipped', tr('.agents/project.yaml no existe', '.agents/project.yaml does not exist'));
    return;
  }
  if (state.postInstall.agentsSetup === 'completed') {
    UI!.step({ phase: 'project', title }).end('skipped', tr('ya hecho; para cambiarlo: <code>bun run agents:setup</code>', 'already done; to change it: <code>bun run agents:setup</code>'));
    return;
  }
  if (NON_INTERACTIVE) {
    state.postInstall.agentsSetup = 'skipped-non-interactive';
    saveState(state);
    UI!.step({ phase: 'project', title }).end('skipped', tr('modo no interactivo. Después: <code>bun run agents:setup</code>', 'non-interactive mode. Later: <code>bun run agents:setup</code>'));
    return;
  }

  const cur = readProjectValues();
  // A first run proposes the package name, so Enter in a terminal moves on.
  if (!cur.name) {
    try { cur.name = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { name?: string }).name ?? ''; }
    catch { cur.name = ''; }
  }
  const [name, keyRaw, domain] = await ask<string[]>({
    id: 'project-identity',
    kind: 'text',
    kicker: tr('Identidad', 'Identity'),
    title: tr('Cómo se llama el proyecto que vas a probar?', 'What is the project you are going to test called?'),
    why: tr('La clave del proyecto es el prefijo de los tickets en Jira (en <code>ACME-123</code> es <code>ACME</code>).', 'The project key is the prefix of the Jira tickets (in <code>ACME-123</code> it is <code>ACME</code>).'),
    spec: {
      fields: [
        { id: 'pname', label: tr('Nombre del proyecto', 'Project name'), short: tr('Nombre', 'Name'), placeholder: 'Acme Shop', value: cur.name, required: true },
        { id: 'pkey', label: tr('Clave en Jira', 'Jira key'), short: tr('Clave', 'Key'), placeholder: 'ACME', value: cur.key, hint: tr('Letras y números, como en tus tickets. Vacío = lo completas después.', 'Letters and digits, like in your tickets. Empty = fill it later.'), pattern: '^[A-Za-z][A-Za-z0-9]{0,9}$', patternMsg: tr('Hasta 10 letras o números, empezando por letra (ej. ACME).', 'Up to 10 letters or digits, starting with a letter (e.g. ACME).') },
        { id: 'pdomain', label: tr('Dominio de la app', 'App domain'), short: tr('Dominio', 'Domain'), placeholder: 'acme.shop', value: cur.domain, hint: tr('Sin https://. Vacío si todavía no está publicada.', 'Without https://. Empty if it is not published yet.') },
      ],
      cta: tr('Guardar', 'Save'),
    },
    default: [cur.name, cur.key, cur.domain],
  });
  const [localRaw, stagingRaw] = await ask<string[]>({
    id: 'project-envs',
    kind: 'text',
    kicker: tr('Entornos', 'Environments'),
    title: tr('Dónde corre la app en cada entorno?', 'Where does the app run in each environment?'),
    why: tr('Los tests y las skills eligen la URL según el entorno activo. Empezamos con local y staging; agregas más después con <code>bun run agents:setup</code>.', 'Tests and skills pick the URL from the active environment. We start with local and staging; add more later with <code>bun run agents:setup</code>.'),
    spec: {
      fields: [
        { id: 'local', label: 'Local', short: 'local', placeholder: 'localhost:3000', value: cur.local || 'http://localhost:3000', pattern: URL_PATTERN, patternMsg: tr('Una URL: localhost:3000 o un dominio con punto.', 'A URL: localhost:3000 or a domain with a dot.') },
        { id: 'staging', label: 'Staging', short: 'staging', placeholder: 'staging.acme.shop', value: cur.staging, hint: tr('Vacío = lo completas después; nada se inventa por ti.', 'Empty = fill it later; nothing is made up for you.'), pattern: URL_PATTERN, patternMsg: tr('Una URL con dominio, por ejemplo staging.acme.shop.', 'A URL with a domain, for example staging.acme.shop.') },
      ],
      cta: tr('Guardar entornos', 'Save environments'),
    },
    default: [cur.local || 'http://localhost:3000', cur.staging],
  });
  const defaultEnv = await ask<string>({
    id: 'project-default-env',
    kind: 'select',
    kicker: tr('Entorno por defecto', 'Default environment'),
    title: tr('Contra qué entorno se prueba si nadie dice otra cosa?', 'Which environment do tests run against when nobody says otherwise?'),
    spec: {
      options: [
        { value: 'staging', label: 'Staging', desc: tr('Lo habitual para QA: datos de prueba, sin riesgo para usuarios reales.', 'The usual for QA: test data, no risk for real users.'), rec: true },
        { value: 'local', label: 'Local', desc: tr('Útil si levantas la app en tu máquina.', 'Useful if you run the app on your machine.') },
      ],
      cta: tr('Elegir', 'Choose'),
    },
    default: cur.defaultEnv === 'local' ? 'local' : 'staging',
  });

  // agents-setup writes the yaml (comments, order, validation): seeded from the
  // answers only, never from stray variables of the parent shell.
  const seedNames = new Set(['PROJECT_NAME', 'PROJECT_KEY', 'WEBAPP_DOMAIN', 'BACKEND_REPO', 'BACKEND_STACK', 'BACKEND_ENTRY', 'FRONTEND_REPO', 'FRONTEND_STACK', 'FRONTEND_ENTRY', 'DB_TYPE', 'ISSUE_TRACKER', 'ISSUE_TRACKER_CLI', 'DEFAULT_ENV', 'TMS_CLI']);
  const seeds: Record<string, string> = { DEFAULT_ENV: defaultEnv };
  if (name) { seeds.PROJECT_NAME = name; }
  if (keyRaw) { seeds.PROJECT_KEY = keyRaw.toUpperCase(); }
  if (domain) { seeds.WEBAPP_DOMAIN = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, ''); }
  if (localRaw) { seeds.WEB_URL_LOCAL = withScheme(localRaw, 'http'); }
  if (stagingRaw) { seeds.WEB_URL_STAGING = withScheme(stagingRaw, 'https'); }
  const env = childEnv(n => seedNames.has(n) || /^(?:WEB_URL|API_URL|DB_PROJECT_REF)_/.test(n), seeds);

  const step = UI!.step({ phase: 'project', title });
  const r = await runStreamed('bun', [join(REPO_ROOT, 'scripts', 'agents-setup.ts'), '--non-interactive'], { step, env, timeoutMs: 60_000 });
  state.postInstall.agentsSetup = r.code === 0 ? 'completed' : 'failed';
  saveState(state);
  if (r.code === 0) {
    step.end('ok', tr(`${Object.keys(seeds).length} valores escritos · el resto queda vacío a propósito (<code>bun run agents:setup</code>)`, `${Object.keys(seeds).length} values written · the rest stays empty on purpose (<code>bun run agents:setup</code>)`));
  }
  else {
    step.end('failed', tr('agents:setup no terminó. Corre <code>bun run agents:setup</code>.', 'agents:setup did not finish. Run <code>bun run agents:setup</code>.'));
  }
}

// ============================================================================
// Jira: acli session, catalogs, manifest check
// ============================================================================

/**
 * Reload .env in-process so that values written during the run (a retried
 * token) are visible without a shell restart.
 */
export function reloadDotEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) { return; }
    const content = readFileSync(envPath, 'utf8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) { continue; }
      const eq = line.indexOf('=');
      if (eq < 0) { continue; }
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      // Strip only a *matched* surrounding quote pair — a lone quote is part of
      // the value (e.g. a password) and must not be mangled.
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) {
        v = v.slice(1, -1);
      }
      // The FILE WINS over an inherited process value. This is deliberate and must
      // not be "corrected" to the usual non-override dotenv default: a stale value
      // inherited from whatever spawned this process (an agent session, a parent
      // shell) would otherwise shadow a corrected `.env` in silence and survive an
      // application restart. `bun run vars:env:check` guards the same class
      // repo-wide; see `cli/lib/atlassian-instance.ts` for the incident this comes
      // from. Only an EMPTY file value defers to an already-populated process value.
      if (k && (v !== '' || !process.env[k])) { process.env[k] = v; }
    }
  }
  catch {
    // best-effort — silently continue
  }
}

/** Asks for a new Atlassian token and writes it to `.env`. Empty = the person chose "later". */
async function askNewToken(round: number): Promise<string> {
  const token = await ask<string>({
    id: `token-retry-${round}`,
    kind: 'secret',
    kicker: tr('Secreto', 'Secret'),
    title: tr('Pega un token de API nuevo', 'Paste a new API token'),
    g: 'token',
    why: tr('Crea uno en <code>id.atlassian.com/manage-profile/security/api-tokens</code> con la misma cuenta del correo. El anterior se reemplaza en <code>.env</code>.', 'Create one at <code>id.atlassian.com/manage-profile/security/api-tokens</code> with the account of the email. The old one is replaced in <code>.env</code>.'),
    spec: { varName: 'ATLASSIAN_API_TOKEN', label: tr('Token nuevo', 'New token'), cta: tr('Reintentar', 'Retry'), secondary: [{ value: '__later__', label: tr('Saltar Jira por ahora', 'Skip Jira for now') }] },
    default: '__later__',
  });
  if (token === '__later__' || !token) { return ''; }
  process.env.ATLASSIAN_API_TOKEN = token;
  await appendVarsToEnv({ ATLASSIAN_API_TOKEN: token });
  reloadDotEnv();
  return token;
}

/** Probes `/rest/api/3/myself` with the `.env` pair; the host comes from `.agents/project.yaml`. */
async function probeJira(): Promise<{ ok: boolean, reason: string, status?: number }> {
  let url: string | null = null;
  try { url = resolveAtlassianInstance().baseUrl; }
  catch { url = null; }
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  const missing: string[] = [];
  if (!url) { missing.push('issue_tracker.atlassian_url (.agents/project.yaml)'); }
  if (!email) { missing.push('ATLASSIAN_EMAIL'); }
  if (!token) { missing.push('ATLASSIAN_API_TOKEN'); }
  if (missing.length > 0) { return { ok: false, reason: `${tr('Falta', 'Missing')}: ${missing.join(', ')}` }; }
  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const res = await fetch(`${url!.replace(/\/$/, '')}/rest/api/3/myself`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) { return { ok: true, reason: 'authenticated' }; }
    return { ok: false, status: res.status, reason: `HTTP ${res.status} ${tr('de', 'from')} ${url}/rest/api/3/myself` };
  }
  catch (err) {
    return { ok: false, reason: `${tr('Error de red', 'Network error')}: ${(err as Error).message}` };
  }
}

/**
 * The card a failed Atlassian sign-in shows: what happened, how to fix it, and
 * what next. A rejected token (401/403) offers a new token; missing data or a
 * network error cannot be fixed with a token, so it offers the reference
 * catalog instead.
 */
async function atlassianFail(what: string, round: number, rejected = true): Promise<'retry' | 'upex' | 'skip'> {
  const choice = await UI!.fail({
    id: `jira-fail-${round}`,
    step: 'jira',
    title: rejected
      ? tr('Atlassian rechazó las credenciales', 'Atlassian rejected the credentials')
      : tr('No pudimos entrar a tu Jira', 'We could not sign in to your Jira'),
    what,
    how: rejected
      ? [
          tr('Abre <code>id.atlassian.com/manage-profile/security/api-tokens</code> con la cuenta de <b>ATLASSIAN_EMAIL</b>.', 'Open <code>id.atlassian.com/manage-profile/security/api-tokens</code> with the <b>ATLASSIAN_EMAIL</b> account.'),
          tr('Crea un token nuevo y copia el valor entero.', 'Create a new token and copy the whole value.'),
          tr('Elige reintentar y pégalo en la tarjeta siguiente.', 'Choose retry and paste it in the next card.'),
        ]
      : [
          tr('El sitio va en <code>.agents/project.yaml</code> (<code>bun run agents:setup</code>); el correo y el token, en <code>.env</code>.', 'The site goes in <code>.agents/project.yaml</code> (<code>bun run agents:setup</code>); the email and the token, in <code>.env</code>.'),
          tr('Mientras tanto, el catálogo de referencia de UPEX deja el repositorio usable; después corres <code>bun run jira:sync-fields</code> contra tu Jira.', 'Meanwhile the UPEX reference catalog keeps the repository usable; later run <code>bun run jira:sync-fields</code> against your Jira.'),
        ],
    actions: rejected
      ? [{ value: 'retry', label: tr('Reintentar con un token nuevo', 'Retry with a new token') }, { value: 'skip', label: tr('Saltar Jira por ahora', 'Skip Jira for now') }]
      : [{ value: 'upex', label: tr('Usar el catálogo de referencia', 'Use the reference catalog') }, { value: 'skip', label: tr('Saltar Jira por ahora', 'Skip Jira for now') }],
  });
  return choice === 'retry' ? 'retry' : choice === 'upex' ? 'upex' : 'skip';
}

/**
 * Stderr marker emitted by `scripts/sync-jira-fields.ts` and
 * `scripts/sync-jira-workflows.ts` when the authenticated Jira user does not
 * have Administer permission. The script exits 0 in that case (lack of admin
 * is not a failure — the user can still use the repo with the boilerplate's
 * bundled JSON), so we rely on this marker to distinguish a true success from
 * a graceful skip.
 */
const JIRA_SKIP_NO_ADMIN_MARKER = '[JIRA_SYNC_SKIPPED_NO_ADMIN]';

/** Exit code of `jira:sync-workflows --plan-json`: questions are pending and nothing was written. */
const JIRA_PLAN_PENDING_EXIT = 10;

type JiraOutcome = 'completed' | 'failed' | 'skipped-no-admin';

function jiraOutcome(r: StreamResult): JiraOutcome {
  if (r.stderr.includes(JIRA_SKIP_NO_ADMIN_MARKER)) { return 'skipped-no-admin'; }
  return r.code === 0 ? 'completed' : 'failed';
}

async function runJiraSync(script: string, args: string[], title: string): Promise<JiraOutcome> {
  const step = UI!.step({ phase: 'jira', title });
  const r = await runStreamed('bun', ['run', script, '--', ...args], { step, timeoutMs: 300_000 });
  const outcome = jiraOutcome(r);
  step.end(outcome === 'completed' ? 'ok' : 'warn', outcome === 'skipped-no-admin'
    ? tr('Tu usuario de Jira no es administrador: queda el catálogo que trae el repo (sirve igual).', 'Your Jira user is not an administrator: the catalog the repo ships stays (it works).')
    : outcome === 'failed' ? tr('falló; el instalador sigue', 'failed; the installer goes on') : undefined);
  return outcome;
}

/** One picker of `jira:sync-workflows --plan-json` (its `PlanQuestion`; `cli/` cannot import from `scripts/`). */
interface WorkflowQuestion {
  id: string
  workType: string
  kind: 'status' | 'transition'
  slug: string
  reason: 'missing' | 'collision' | 'mismatch'
  description?: string
  expects?: { from: string, to: string }
  options: { value: string, label: string }[]
}

function workflowQuestionTitle(q: WorkflowQuestion): string {
  return q.kind === 'status'
    ? tr(`Qué estado de tu Jira es "${q.slug}" para ${q.workType}?`, `Which status of your Jira is "${q.slug}" for ${q.workType}?`)
    : tr(`Qué transición de tu Jira es "${q.slug}" para ${q.workType}?`, `Which transition of your Jira is "${q.slug}" for ${q.workType}?`);
}

function workflowQuestionWhy(q: WorkflowQuestion): string {
  const reason = q.reason === 'missing'
    ? tr('Ningún nombre de tu Jira coincide con el que espera la metodología.', 'No name in your Jira matches the one the methodology expects.')
    : q.reason === 'collision'
      ? tr('Varios nombres de tu Jira coinciden; elige el correcto.', 'Several names in your Jira match; pick the right one.')
      : tr(`La que coincide conecta estados distintos de los esperados (${q.expects?.from ?? 'any'} → ${q.expects?.to ?? 'any'}).`, `The one that matches connects different statuses than expected (${q.expects?.from ?? 'any'} → ${q.expects?.to ?? 'any'}).`);
  return `${reason}${q.description ? ` ${q.description}` : ''}`;
}

/**
 * `jira:sync-workflows` own mode: the status and transition pickers become
 * cards (owner answer Q5). Pass one plans (`--plan-json`): when every mapping
 * resolves by itself it writes the catalog and exits 0; when some need a person
 * it writes nothing and exits 10 with the questions. Pass two applies the
 * answers (`--answers`).
 */
async function runJiraWorkflowsOwn(): Promise<JiraOutcome> {
  const dir = mkdtempSync(join(tmpdir(), 'upex-jira-'));
  const planPath = join(dir, 'plan.json');
  const answersPath = join(dir, 'answers.json');
  try {
    const title = tr('Flujos y estados', 'Workflows and statuses');
    const step = UI!.step({ phase: 'jira', title });
    const plan = await runStreamed('bun', ['run', 'jira:sync-workflows', '--', '--force', '--plan-json', planPath], { step, timeoutMs: 300_000 });
    if (plan.code !== JIRA_PLAN_PENDING_EXIT) {
      const outcome = jiraOutcome(plan);
      step.end(outcome === 'completed' ? 'ok' : 'warn', outcome === 'skipped-no-admin' ? tr('sin permiso de administrador: queda el catálogo del repo', 'no administrator permission: the repo catalog stays') : outcome === 'failed' ? tr('falló; el instalador sigue', 'failed; the installer goes on') : undefined);
      return outcome;
    }
    const questions = (JSON.parse(readFileSync(planPath, 'utf8')) as { questions?: WorkflowQuestion[] }).questions ?? [];
    step.end('ok', tr(`${questions.length} mapeo(s) necesitan tu elección`, `${questions.length} mapping(s) need your choice`));
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id] = await ask<string>({
        id: `wf-${q.id}`,
        kind: 'select',
        kicker: tr('Flujos de Jira', 'Jira workflows'),
        title: workflowQuestionTitle(q),
        why: workflowQuestionWhy(q),
        spec: {
          options: q.options.map(o => o.value === '__skip__'
            ? { value: o.value, label: tr('Dejarlo sin mapear', 'Leave it unmapped'), desc: tr('La skill que lo use te lo va a pedir.', 'The skill that uses it will ask you for it.') }
            : { value: o.value, label: o.label }),
          cta: tr('Elegir', 'Choose'),
        },
        default: q.options[0]?.value,
      });
    }
    writeFileSync(answersPath, JSON.stringify(answers), { mode: 0o600 });
    const apply = UI!.step({ phase: 'jira', title: tr('Guardar flujos y estados', 'Save workflows and statuses') });
    const r = await runStreamed('bun', ['run', 'jira:sync-workflows', '--', '--force', '--answers', answersPath], { step: apply, timeoutMs: 300_000 });
    const outcome = jiraOutcome(r);
    apply.end(outcome === 'completed' ? 'ok' : 'warn', outcome === 'failed' ? tr('falló; el instalador sigue', 'failed; the installer goes on') : undefined);
    return outcome;
  }
  finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Jira catalog JSON files referenced by SKILL.md bodies. The lint-skills
 * STALE-PATH check (ERROR severity) fails repo:check / the pre-push hook when
 * any of these is missing on disk. The bootstrap scaffolder
 * (packages/create-agentic-qa) deletes jira-fields.json + jira-workflows.json
 * so a fresh project never inherits UPEX's cached catalogs — which leaves the
 * SKILL.md path references dangling until the user runs a sync.
 */
const JIRA_CATALOG_PLACEHOLDERS = [
  '.agents/jira-fields.json',
  '.agents/jira-workflows.json',
  '.agents/jira-link-types.json',
] as const;

/**
 * Write an empty `{}` placeholder for any Jira catalog still missing on disk
 * after the sync phase (skip, no-auth, no-admin, or a failed fetch). This:
 *   - satisfies the STALE-PATH lint check (the file now exists), and
 *   - is treated as "not yet populated" by sync-jira-*.ts, which only refuse to
 *     overwrite a file that is NOT the empty `{}` placeholder — so a later
 *     `bun run jira:sync-*` populates it cleanly without needing --force.
 */
async function ensureJiraCatalogPlaceholders(): Promise<string[]> {
  const written: string[] = [];
  for (const rel of JIRA_CATALOG_PLACEHOLDERS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      await writeFile(abs, '{}\n', 'utf8');
      written.push(rel);
    }
  }
  return written;
}

/** Recovery command for a manual acli login; the syntax differs per shell. */
const MANUAL_ACLI_LOGIN = process.platform === 'win32'
  ? '$env:ATLASSIAN_API_TOKEN | acli jira auth login --site (bun run --silent jira:url --slug) --email $env:ATLASSIAN_EMAIL --token'
  : 'echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$(bun run --silent jira:url --slug)" --email "$ATLASSIAN_EMAIL" --token';

async function acliAuthStep(state: InstallState): Promise<void> {
  const title = tr('Sesión de la CLI de Atlassian (acli)', 'Atlassian CLI session (acli)');
  if (state.postInstall.acliAuth === 'completed') { UI!.step({ phase: 'jira', title }).end('skipped', tr('ya iniciada en una corrida anterior', 'already started in an earlier run')); return; }
  if (!which('acli')) {
    state.postInstall.acliAuth = 'skipped-no-binary';
    saveState(state);
    UI!.step({ phase: 'jira', title }).end('skipped', tr('acli no está instalada (aviso del chequeo previo)', 'acli is not installed (preflight warning)'));
    return;
  }
  reloadDotEnv();
  const missing: string[] = ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'].filter(v => !(process.env[v] ?? '').trim());
  // `--site` wants the BARE host: the yaml value carries a scheme acli rejects.
  let site = '';
  try { site = toSiteSlug(resolveAtlassianInstance().baseUrl); }
  catch { missing.unshift('issue_tracker.atlassian_url (.agents/project.yaml)'); }
  if (missing.length > 0) {
    state.postInstall.acliAuth = 'skipped-no-auth';
    saveState(state);
    UI!.step({ phase: 'jira', title }).end('skipped', `${tr('Falta', 'Missing')}: ${missing.join(', ')}`);
    return;
  }
  const step = UI!.step({ phase: 'jira', title: tr(`Iniciar sesión en ${site}`, `Sign in to ${site}`) });
  // Probe an existing session: a read-only search exits 0 when one exists.
  const probe = await runStreamed('acli', ['jira', 'workitem', 'search', '--jql', 'created >= -1d', '--limit', '1', '--json'], { timeoutMs: 8000 });
  if (probe.code === 0) {
    state.postInstall.acliAuth = 'completed';
    saveState(state);
    step.end('ok', tr('sesión existente', 'existing session'));
    return;
  }
  const email = process.env.ATLASSIAN_EMAIL ?? '';
  let token = process.env.ATLASSIAN_API_TOKEN ?? '';
  let current = step;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // The token goes on stdin, never on argv.
    const login = await runStreamed('acli', ['jira', 'auth', 'login', '--site', site, '--email', email, '--token'], { step: current, input: token, timeoutMs: 15_000 });
    if (login.code === 0) {
      state.postInstall.acliAuth = 'completed';
      saveState(state);
      current.end('ok', tr(`sesión iniciada como ${email}`, `signed in as ${email}`));
      return;
    }
    current.end('failed');
    if (attempt === 3 || NON_INTERACTIVE) { break; }
    const what = tr(`<code>acli jira auth login</code> terminó con ${login.code ?? 'error'}: el correo existe, pero el token no corresponde a esa cuenta, se copió incompleto o fue revocado.`, `<code>acli jira auth login</code> exited with ${login.code ?? 'error'}: the email exists, but the token does not belong to that account, was copied incomplete or was revoked.`);
    if (await atlassianFail(what, attempt) === 'skip') { break; }
    token = await askNewToken(attempt);
    if (!token) { break; }
    current = UI!.step({ phase: 'jira', title: tr(`Iniciar sesión en ${site} (intento ${attempt + 1})`, `Sign in to ${site} (attempt ${attempt + 1})`) });
  }
  // Recorded, never fatal: the catalogs below still write their placeholders.
  state.postInstall.acliAuth = 'failed';
  saveState(state);
  UI!.notice('warn', `${tr('acli sin sesión. A mano', 'acli has no session. By hand')}: <code>${MANUAL_ACLI_LOGIN}</code>`);
}

async function jiraCatalogsStep(state: InstallState): Promise<void> {
  const done = state.postInstall.jiraSyncFields === 'completed' && state.postInstall.jiraSyncWorkflows === 'completed';
  if (done) { UI!.step({ phase: 'jira', title: tr('Catálogos de Jira', 'Jira catalogs') }).end('skipped', tr('ya sincronizados', 'already synced')); return; }
  let key = '';
  try { key = readProjectValues().key; }
  catch { key = ''; }
  // Without the site or the pair there is no own catalog to read: the reference one is the useful default.
  reloadDotEnv();
  let siteKnown = true;
  try { resolveAtlassianInstance(); }
  catch { siteKnown = false; }
  const credsReady = siteKnown && Boolean((process.env.ATLASSIAN_EMAIL ?? '').trim()) && Boolean((process.env.ATLASSIAN_API_TOKEN ?? '').trim());
  let mode = await ask<'own' | 'upex' | 'skip'>({
    id: 'jira-catalogs',
    kind: 'select',
    kicker: tr('Catálogos', 'Catalogs'),
    title: tr('De dónde traemos los campos y flujos de Jira?', 'Where do we get the Jira fields and workflows from?'),
    g: 'jira',
    why: tr('Las skills mueven tickets entre estados y llenan campos. Necesitan saber cómo se llaman en tu Jira.', 'The skills move tickets between statuses and fill fields. They need to know what they are called in your Jira.'),
    spec: {
      options: [
        { value: 'own', label: key ? tr(`De mi proyecto ${key}`, `From my ${key} project`) : tr('De mi propio Jira', 'From my own Jira'), desc: credsReady ? tr('Lee tu Jira real. Necesita permiso de administrador del proyecto.', 'Reads your real Jira. Needs project administrator permission.') : tr('Lee tu Jira real. Faltan el sitio, el correo o el token de Atlassian.', 'Reads your real Jira. The Atlassian site, email or token is missing.'), rec: credsReady },
        { value: 'upex', label: tr('El catálogo de referencia de UPEX', 'The UPEX reference catalog'), desc: tr('Se descarga de GitHub. Sin permiso de administrador.', 'Downloads from GitHub. No administrator permission.'), rec: !credsReady },
        { value: 'skip', label: tr('Saltar', 'Skip'), desc: tr('Lo corres después con <code>bun run jira:sync-fields</code>.', 'Run it later with <code>bun run jira:sync-fields</code>.') },
      ],
      cta: tr('Traer catálogos', 'Get catalogs'),
    },
    default: credsReady ? 'own' : 'upex',
  });
  if (mode === 'own') {
    // own — live-fetch from the person's site: credentials first.
    for (let round = 1; ; round++) {
      const r = await probeJira();
      if (r.ok) { break; }
      const rejected = r.status === 401 || r.status === 403;
      const what = rejected
        ? tr(`El sitio respondió <code>${r.status}</code>: el correo existe, pero el token no corresponde a esa cuenta, se copió incompleto o fue revocado.`, `The site answered <code>${r.status}</code>: the email exists, but the token does not belong to that account, was copied incomplete or was revoked.`)
        : r.reason;
      const next = round > 5 || NON_INTERACTIVE ? 'skip' : await atlassianFail(what, 100 + round, rejected);
      if (next === 'upex') { mode = 'upex'; break; }
      if (next === 'skip' || !(await askNewToken(100 + round))) { mode = 'skip'; break; }
    }
  }
  if (mode === 'skip') {
    state.postInstall.jiraSyncFields = 'skipped-no-auth';
    state.postInstall.jiraSyncWorkflows = 'skipped-no-auth';
    saveState(state);
    UI!.step({ phase: 'jira', title: tr('Catálogos de Jira', 'Jira catalogs') }).end('skipped', tr('Después: <code>bun run jira:sync-fields</code> (agrega <code>--upex</code> para el estándar de UPEX)', 'Later: <code>bun run jira:sync-fields</code> (add <code>--upex</code> for the UPEX standard)'));
    return;
  }
  if (mode === 'upex') {
    // --upex downloads the reference catalogs from GitHub raw: no auth needed.
    // --force overwrites the bootstrap-pruned/stale copy unconditionally.
    state.postInstall.jiraSyncFields = await runJiraSync('jira:sync-fields', ['--upex', '--force'], tr('Campos personalizados (UPEX)', 'Custom fields (UPEX)'));
    saveState(state);
    state.postInstall.jiraSyncWorkflows = await runJiraSync('jira:sync-workflows', ['--upex', '--force'], tr('Flujos y estados (UPEX)', 'Workflows and statuses (UPEX)'));
    saveState(state);
    await runJiraSync('jira:sync-link-types', ['--upex'], tr('Tipos de vínculo (UPEX)', 'Link types (UPEX)'));
    return;
  }

  // --force: a stale bootstrap copy is refreshed; the script's own populated-file
  // guard protects user edits in later sessions.
  const fields = await runJiraSync('jira:sync-fields', ['--force'], tr('Campos personalizados', 'Custom fields'));
  state.postInstall.jiraSyncFields = fields;
  saveState(state);
  if (fields === 'skipped-no-admin') {
    state.postInstall.jiraSyncWorkflows = 'skipped-no-admin';
    UI!.step({ phase: 'jira', title: tr('Flujos y estados', 'Workflows and statuses') }).end('skipped', tr('mismo motivo (sin administrador). Con el estándar: <code>bun run jira:sync-workflows --upex</code>', 'same reason (no administrator). With the standard: <code>bun run jira:sync-workflows --upex</code>'));
  }
  else if (fields !== 'completed') {
    state.postInstall.jiraSyncWorkflows = 'skipped-no-auth';
    UI!.step({ phase: 'jira', title: tr('Flujos y estados', 'Workflows and statuses') }).end('skipped', tr('los campos no terminaron (mismas credenciales)', 'the fields did not finish (same credentials)'));
  }
  else {
    state.postInstall.jiraSyncWorkflows = await runJiraWorkflowsOwn();
  }
  saveState(state);
}

async function jiraCheckStep(state: InstallState): Promise<void> {
  const title = tr('Manifiesto de Jira', 'Jira manifest');
  if (state.postInstall.jiraCheck === 'completed') { UI!.step({ phase: 'jira', title }).end('skipped', tr('ya validado', 'already validated')); return; }
  if (state.postInstall.jiraSyncFields === 'skipped-no-admin' || state.postInstall.jiraSyncWorkflows === 'skipped-no-admin') {
    state.postInstall.jiraCheck = 'skipped-prereq';
    saveState(state);
    UI!.step({ phase: 'jira', title }).end('skipped', tr('compararía contra el catálogo de referencia, no el tuyo', 'it would compare against the reference catalog, not yours'));
    return;
  }
  if (state.postInstall.jiraSyncFields !== 'completed' || state.postInstall.jiraSyncWorkflows !== 'completed') {
    state.postInstall.jiraCheck = 'skipped-prereq';
    saveState(state);
    UI!.step({ phase: 'jira', title }).end('skipped', tr('faltan campos y flujos. Después: <code>bun run jira:check</code>', 'fields and workflows are missing. Later: <code>bun run jira:check</code>'));
    return;
  }
  const step = UI!.step({ phase: 'jira', title });
  const r = await runStreamed('bun', ['run', 'jira:check'], { step, timeoutMs: 120_000 });
  state.postInstall.jiraCheck = r.code === 0 ? 'completed' : 'failed';
  saveState(state);
  step.end(r.code === 0 ? 'ok' : 'warn', r.code === 0 ? undefined : tr('Revisa la salida; después: <code>bun run jira:check</code>', 'Check the output; later: <code>bun run jira:check</code>'));
}

async function jiraPhase(state: InstallState): Promise<void> {
  if (SKIP_JIRA) {
    state.postInstall.acliAuth = 'skipped-non-interactive';
    state.postInstall.jiraSyncFields = 'skipped-non-interactive';
    state.postInstall.jiraSyncWorkflows = 'skipped-non-interactive';
    state.postInstall.jiraCheck = 'skipped-non-interactive';
    saveState(state);
    UI!.step({ phase: 'jira', title: 'Jira' }).end('skipped', 'INSTALL_SKIP_JIRA=1');
    return;
  }
  if (NON_INTERACTIVE) {
    // Nobody typed the credentials (no TTY): nothing to authenticate with.
    for (const k of ['acliAuth', 'jiraSyncFields', 'jiraSyncWorkflows', 'jiraCheck'] as const) {
      if (state.postInstall[k] !== 'completed') { (state.postInstall as Record<string, string>)[k] = 'skipped-non-interactive'; }
    }
    saveState(state);
    UI!.step({ phase: 'jira', title: 'Jira' }).end('skipped', tr('modo no interactivo. Después: <code>bun setup</code> en una terminal', 'non-interactive mode. Later: <code>bun setup</code> in a terminal'));
    const written = await ensureJiraCatalogPlaceholders();
    if (written.length > 0) { UI!.notice('info', `${tr('Catálogos vacíos escritos', 'Empty catalogs written')}: ${written.join(', ')}`); }
    return;
  }
  await acliAuthStep(state);
  await jiraCatalogsStep(state);
  // Safety net (anti STALE-PATH): every Jira catalog the skills reference exists.
  const written = await ensureJiraCatalogPlaceholders();
  if (written.length > 0) {
    UI!.step({ phase: 'jira', title: tr('Catálogos vacíos para después', 'Empty catalogs for later') }).end('ok', `${written.join(', ')} · ${tr('<code>bun run jira:sync-*</code> los llena', '<code>bun run jira:sync-*</code> fills them')}`);
  }
  await jiraCheckStep(state);
}

// ============================================================================
// Done: the report (one summary, owned by setup: analysis §8 #29)
// ============================================================================

function buildReport(state: InstallState, ui: InstallerUi): { title: string, tone: 'good' | 'warn' | 'bad', tiles: Tile[], next: NextStep[], pending: boolean } {
  const ends = ui.journal.all().filter(e => e.t === 'step.end') as Array<{ status: string }>;
  const ok = ends.filter(e => e.status === 'ok').length;
  const skipped = ends.filter(e => e.status === 'skipped').length;
  const warned = ends.filter(e => e.status === 'warn').length;
  const failed = ends.filter(e => e.status === 'failed').length;
  const last = ui.journal.all().at(-1);
  const secs = Math.round((last?.ts ?? 0) / 1000);
  const elapsed = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;

  let projectName = REPO_NAME;
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { name?: string };
    if (pkg.name) { projectName = pkg.name; }
  }
  catch { /* fallback to default */ }

  const next: NextStep[] = [];
  if (NON_INTERACTIVE && state.pendingEnvVars.length > 0) {
    // An AI agent drove the install: say exactly which keys to ask its human for, names only.
    next.push({ title: tr(`Pide a tu humano estas ${state.pendingEnvVars.length} claves`, `Ask your human for these ${state.pendingEnvVars.length} keys`), text: tr(`${state.pendingEnvVars.join(', ')}. Se escriben en <code>.env</code>, nunca en un chat ni en un commit. Después, reinicia la sesión del agente.`, `${state.pendingEnvVars.join(', ')}. They go in <code>.env</code>, never into a chat or a commit. Then restart the agent session.`) });
  }
  else if (state.pendingEnvVars.length > 0) {
    next.push({ title: tr('Completa las variables que faltan', 'Fill in the missing variables'), text: tr(`En <code>.env</code>: ${state.pendingEnvVars.join(', ')}. Sin ellas los servidores MCP fallan en silencio; reinicia la sesión del agente después.`, `In <code>.env</code>: ${state.pendingEnvVars.join(', ')}. Without them the MCP servers fail silently; restart the agent session afterwards.`) });
  }
  if (state.postInstall.agentsSetup !== 'completed') {
    next.push({ title: tr('Completa los datos del proyecto', 'Fill in the project data'), text: tr('Escribe <code>.agents/project.yaml</code>; los agentes lo leen en cada comando.', 'Writes <code>.agents/project.yaml</code>; the agents read it on every command.'), cmd: 'bun run agents:setup' });
  }
  if (!SKIP_JIRA && state.postInstall.acliAuth !== 'completed') {
    next.push({ title: tr('Inicia sesión en acli', 'Sign in to acli'), text: tr('La skill /acli la necesita. La sesión queda en <code>~/.config/acli/</code>.', 'The /acli skill needs it. The session lives in <code>~/.config/acli/</code>.'), cmd: MANUAL_ACLI_LOGIN });
  }
  if (!SKIP_JIRA && (state.postInstall.jiraSyncFields !== 'completed' || state.postInstall.jiraSyncWorkflows !== 'completed')) {
    next.push({ title: tr('Sincroniza los catálogos de Jira', 'Sync the Jira catalogs'), text: tr('Agrega <code>--upex</code> a cada uno para el estándar de UPEX si no eres administrador.', 'Add <code>--upex</code> to each for the UPEX standard if you are not an administrator.'), cmd: 'bun run jira:sync-fields && bun run jira:sync-workflows' });
  }
  else if (!SKIP_JIRA && state.postInstall.jiraCheck !== 'completed') {
    next.push({ title: tr('Valida el manifiesto de Jira', 'Validate the Jira manifest'), cmd: 'bun run jira:check' });
  }
  next.push({ title: tr('Variables de entorno (.env local y Vercel)', 'Environment variables (local .env and Vercel)'), text: tr(`Completa <code>.env</code> y sube ${varsFor('vercel').length} variable(s) de la app a Vercel. Necesita <code>vercel login</code> y <code>vercel link</code>; <code>--dry-run</code> para ver antes.`, `Fills <code>.env</code> and pushes ${varsFor('vercel').length} app variable(s) to Vercel. Needs <code>vercel login</code> and <code>vercel link</code>; <code>--dry-run</code> to preview.`), cmd: 'bun setup --variables' });
  const opener = state.agents.includes('claude-code') ? 'claude' : state.agents.includes('codex') ? 'codex' : 'opencode';
  next.push({ title: tr('Abre tu agente en esta carpeta', 'Open your agent in this folder'), text: tr('Ábrelo directo, sin envolverlo en otro comando: cada servidor MCP lee <code>.env</code> por su cuenta, así ningún secreto entra a la sesión del agente.', 'Open it directly, without wrapping it in another command: every MCP server reads <code>.env</code> itself, so no secret enters the agent session.'), cmd: opener });
  next.push({ title: tr('Define y arma el proyecto', 'Define and scaffold the project'), text: tr('Primero el PRD y el SRS, después el backend y el frontend.', 'First the PRD and the SRS, then the backend and the frontend.'), cmd: '/project-foundation  ->  /project-bootstrap' });
  next.push({ title: tr('Mantén la documentación al día', 'Keep the docs in step'), text: tr('Cada cambio corrige los documentos que nombran lo que movió; docs:check prueba enlaces, el router de skills y los scripts citados.', 'Every change patches the docs that name what it moved; docs:check proves links, the skill router and the quoted scripts.'), cmd: 'bun run docs:check' });
  if (state.engram.status !== 'installed' && !SKIP_ENGRAM) {
    next.push({ title: tr('Cuando quieras, instala Engram', 'When you like, install Engram'), text: tr('Y vuelve a correr el instalador: solo hace lo que falta.', 'And run the installer again: it only does what is missing.'), cmd: 'brew install gentleman-programming/tap/engram && bun setup' });
  }
  if (!state.github) {
    next.push({ title: tr('Cuando quieras, crea el repositorio', 'When you like, create the repository'), cmd: 'gh repo create --source=. --remote=origin --push' });
  }
  const logins = [['gh', 'gh auth login'], ['supabase', 'supabase login'], ['vercel', 'vercel login'], ['resend', 'resend login']].filter(([cli]) => state.externalClis[cli] === 'found');
  if (logins.length > 0) {
    next.push({ title: tr('Inicia sesión en tus CLIs', 'Sign in to your CLIs'), text: tr(`Cada una abre su propio login, en otra terminal: ${logins.map(([, c]) => `<code>${c}</code>`).join(', ')}.`, `Each opens its own login, in another terminal: ${logins.map(([, c]) => `<code>${c}</code>`).join(', ')}.`) });
  }
  const missingClis = Object.entries(state.externalClis).filter(([, s]) => s === 'missing').map(([n]) => n);
  if (missingClis.length > 0) {
    next.push({ title: tr('Herramientas que faltan', 'Missing tools'), text: missingClis.map(n => `<code>${n}</code>: ${EXTERNAL_CLIS.find(c => c.name === n)?.docs ?? ''}`).join('<br>') });
  }
  const later = nextStepsVars().map(s => s.name);
  if (later.length > 0) {
    next.push({ title: tr('Variables opcionales, cuando las necesites', 'Optional variables, when you need them'), text: tr(`${later.join(', ')}. Las de Supabase, Postgres y la URL de la app las aprovisiona la integración Supabase-Vercel: <code>bun setup --variables</code> y "Pull from Vercel".`, `${later.join(', ')}. The Supabase, Postgres and app URL ones are provisioned by the Supabase-Vercel integration: <code>bun setup --variables</code> and "Pull from Vercel".`) });
  }
  next.push({ title: tr('Búsqueda web a nivel del agente', 'Web search at agent level'), text: tr(`Una vez por máquina, no en .mcp.json: ${HARNESS_LEVEL_MCPS.map(m => m.id).join(', ')}. <code>bun run setup:doctor</code> dice cuáles ya declaraste.`, `Once per machine, not in .mcp.json: ${HARNESS_LEVEL_MCPS.map(m => m.id).join(', ')}. <code>bun run setup:doctor</code> says which you already declared.`) });
  next.push({ title: tr('Tu flujo de git', 'Your git flow'), text: tr('El proyecto heredó la estrategia de git del boilerplate. Dile a tu agente "set up our git strategy" para definir la tuya.', 'The project inherited the boilerplate\'s git strategy. Tell your agent "set up our git strategy" to define your own.') });

  const pending = state.pendingEnvVars.length > 0 || state.postInstall.agentsSetup !== 'completed' || (!SKIP_JIRA && state.postInstall.acliAuth !== 'completed');
  const tone: 'good' | 'warn' | 'bad' = failed > 0 ? 'bad' : (pending || warned > 0) ? 'warn' : 'good';
  const title = failed > 0
    ? tr(`${projectName}: la instalación terminó con ${failed} paso(s) fallido(s).`, `${projectName}: the install finished with ${failed} failed step(s).`)
    : pending
      ? tr(`${projectName} está instalado. Quedan cosas por completar.`, `${projectName} is installed. Some things are left to complete.`)
      : tr(`${projectName} está listo para definir y armar tu proyecto.`, `${projectName} is ready to define and scaffold your project.`);
  const tiles: Tile[] = [
    { n: String(ok), label: tr('pasos completos', 'steps done'), tone: 'good' },
    { n: String(skipped + warned), label: tr('saltados o con aviso', 'skipped or warned'), tone: skipped + warned > 0 ? 'warn' : '' },
    { n: String(failed), label: tr('errores', 'errors'), tone: failed > 0 ? 'bad' : '' },
    { n: elapsed, label: tr('en total', 'in total'), tone: '' },
  ];
  return { title, tone, tiles, next, pending };
}

// ============================================================================
// Skill URL validation (--validate-skills)
// ============================================================================
//
// Smoke-test mode: probes every entry in PROJECT_LEVEL_SKILLS + USER_LEVEL_SKILLS
// against the skills.sh registry via a HEAD request. Does NOT install anything.
// Exits 0 if every entry is reachable, 1 otherwise.

function normalizeOwnerRepo(pkg: string): { owner: string, repo: string } | null {
  const ghMatch = pkg.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (ghMatch) { return { owner: ghMatch[1], repo: ghMatch[2] }; }
  const shortMatch = pkg.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (shortMatch) { return { owner: shortMatch[1], repo: shortMatch[2] }; }
  return null;
}

async function probeSkillsRegistry(pkg: string, skill?: string): Promise<{ status: 'ok' | 'fail' | 'skip', detail: string }> {
  const norm = normalizeOwnerRepo(pkg);
  if (!norm) { return { status: 'skip', detail: 'non-github source — not on skills.sh' }; }
  const path = skill && skill !== '*'
    ? `${norm.owner}/${norm.repo}/${skill}`
    : `${norm.owner}/${norm.repo}`;
  const url = `https://skills.sh/${path}`;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) { return { status: 'ok', detail: `HTTP ${res.status}` }; }
    return { status: 'fail', detail: `HTTP ${res.status} at ${url}` };
  }
  catch (err: unknown) {
    return { status: 'fail', detail: `network error: ${(err as Error).message}` };
  }
}

async function validateSkills(): Promise<number> {
  const log = consoleOut;
  tui.section('Skill URL validation (smoke test)');
  log.dim('  Probes skills.sh registry for every entry. No install, no side effects.');
  process.stdout.write('\n');

  const all: Array<{ level: 'project' | 'user', item: CommunitySkill }> = [
    ...PROJECT_LEVEL_SKILLS.map(item => ({ level: 'project' as const, item })),
    ...USER_LEVEL_SKILLS.map(item => ({ level: 'user' as const, item })),
  ];

  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failures: string[] = [];

  for (const { level, item } of all) {
    const slug = describeSkill(item);
    const result = await probeSkillsRegistry(item.package, item.skill);
    const tag = `[${level}]`.padEnd(10);
    if (result.status === 'ok') {
      log.success(`  ${tag} ${slug}`);
      okCount++;
    }
    else if (result.status === 'skip') {
      log.dim(`  ${tag} ${slug} — skipped (${result.detail})`);
      skipCount++;
    }
    else {
      log.error(`  ${tag} ${slug} — ${result.detail}`);
      failures.push(`${level}:${slug}`);
      failCount++;
    }
  }

  process.stdout.write('\n');
  tui.section('Validation summary');
  process.stdout.write(`  ${COLORS.green}OK${COLORS.reset}      : ${okCount}\n`);
  process.stdout.write(`  ${COLORS.yellow}SKIPPED${COLORS.reset} : ${skipCount}  ${COLORS.dim}(non-github sources)${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.red}FAILED${COLORS.reset}  : ${failCount}\n`);
  if (failures.length > 0) {
    process.stdout.write('\n');
    process.stdout.write(`${COLORS.bold}Broken entries (fix cli/install.ts before next publish):${COLORS.reset}\n`);
    for (const f of failures) { process.stdout.write(`  - ${f}\n`); }
  }
  process.stdout.write('\n');
  return failCount > 0 ? 1 : 0;
}

// ============================================================================
// Main
// ============================================================================

const HELP = `bun setup — install and configure this project (see INSTALLER.md)

  bun setup                      page when there is a screen, terminal otherwise
  bun setup --headless           terminal only; questions in the terminal
  bun setup --ui                 page even where the rules say terminal
  bun setup --non-interactive    every question takes its default (agents, CI)
  bun setup --sync-skills        re-install the community skills only
  bun setup --validate-skills    probe the community skill sources, install nothing
  bun setup --variables [--variables-local | --variables-remote] [--dry-run] [--yes] [--force]
`;

/** Every secret value this machine already holds in `.env`: masked in the journal from the first event. */
function seedRedactor(ui: InstallerUi): void {
  if (!existsSync(ENV_PATH)) { return; }
  try {
    const values = parseEnvFile(readFileSync(ENV_PATH, 'utf8'));
    for (const [name, value] of Object.entries(values)) {
      if (value && isSecretName(name)) { ui.journal.redactor.add(value); }
    }
  }
  catch { /* unreadable .env: nothing to seed */ }
}

async function startRun(argv: string[]): Promise<InstallerUi> {
  const terminal = createInstallerTerminal({
    lang: LANG,
    onCancel: () => { void abortRun(130); },
  });
  const ui = await startInstallerUi({
    argv,
    repoRoot: REPO_ROOT,
    repoName: basename(REPO_ROOT),
    version: '1',
    interactive: !NON_INTERACTIVE,
    say: line => tui.log.info(line),
    terminal: {
      print: terminal.print,
      // A `--ui` run with no terminal on stdin: only the page can answer.
      ask: async (q, signal) => (process.stdin.isTTY ? terminal.ask(q, signal) : new Promise(() => {})),
    },
  });
  seedRedactor(ui);
  return ui;
}

let aborting = false;
async function abortRun(code: number): Promise<never> {
  if (!aborting && UI) {
    aborting = true;
    if (RUN_STATE) { saveState(RUN_STATE); }
    UI.notice('warn', tr('Cancelado. Vuelve a correr <code>bun setup</code>: lo ya hecho no se repite.', 'Cancelled. Run <code>bun setup</code> again: what is done is not repeated.'));
    try { await UI.finish('aborted', code); }
    catch { /* already ending */ }
  }
  process.exit(code);
}

async function main(): Promise<void> {
  if (ARGV.includes('--help') || ARGV.includes('-h')) { process.stdout.write(HELP); process.exit(0); }
  const unknown = unknownFlags(ARGV);
  if (unknown.length > 0) {
    process.stderr.write(`bun setup: unknown option${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}\n\n${HELP}`);
    process.exit(2);
  }

  // --validate-skills: smoke-test mode. Probes skills.sh for every entry and
  // exits — no install, no prompts.
  if (ARGV.includes('--validate-skills')) {
    process.exit(await validateSkills());
  }

  // --variables: standalone env-var setup (local .env upsert + remote Vercel
  // push), driven by the canonical VAR_MANIFEST. Runs ONLY runVariablesFlow,
  // then exits. All logic lives in the self-contained cli/lib/variables-flow.ts.
  if (ARGV.includes('--variables')) {
    const { runVariablesFlow } = await import('./lib/variables-flow.ts');
    // Explicit mode flags (scriptable / non-interactive) SKIP the interactive
    // menu. `--variables-local` / `--variables-remote` are the canonical names;
    // `--local-only` / `--remote-only` remain as aliases. Passing `--yes` or
    // `--force` alone also opts out of the menu (clearly scriptable intent).
    const wantLocal = ARGV.includes('--variables-local') || ARGV.includes('--local-only');
    const wantRemote = ARGV.includes('--variables-remote') || ARGV.includes('--remote-only');
    const hasModeFlag = wantLocal || wantRemote || ARGV.includes('--yes') || ARGV.includes('--force');
    await runVariablesFlow({
      mode: wantRemote ? 'remote' : wantLocal ? 'local' : 'both',
      force: ARGV.includes('--force'),
      dryRun: ARGV.includes('--dry-run'),
      yes: ARGV.includes('--yes'),
      nonInteractive: NON_INTERACTIVE,
      menu: !hasModeFlag && !NON_INTERACTIVE,
    });
    process.exit(0);
  }

  process.stdout.write(`${tui.logo()}\n\n`);
  process.stdout.write(`${tui.headline(`${REPO_NAME} — ${SYNC_SKILLS ? 'bun setup --sync-skills' : 'bun setup'}`)}\n\n`);

  // --sync-skills: standalone repair, always in the terminal. Re-installs the
  // community skills for the selected agents and the compatibility alias.
  const ui = await startRun(SYNC_SKILLS ? [...ARGV, '--headless'] : ARGV);
  UI = ui;
  process.on('SIGINT', () => { void abortRun(130); });
  ui.start();

  const state = buildInitialState(await loadPriorState());
  RUN_STATE = state;
  state.installedAt = new Date().toISOString();
  const lane = tr('descargas', 'downloads');

  if (SYNC_SKILLS) {
    ui.phase('team');
    const agents = await askAgents(await detectAgents(), state.agents);
    state.agents = agents;
    saveState(state);
    await recordHarnessSelection(agents, REPO_ROOT, askConfirm, stepOut(ui.step({ phase: 'team', title: tr('Registrar los agentes', 'Record the agents') })));
    const picked = await askUserLevelSkills(state, agents);
    ui.phase('install');
    await runCommunityStep(agents, state, 'project', null, lane);
    await runCommunityStep(agents, state, 'global', picked, lane);
    compatibilityStep(lane);
    saveState(state);
    await ui.finish('done', 0);
    process.exit(0);
  }

  // ── pre ────────────────────────────────────────────────────────────────
  const pre = await runSetupPreflight({ cwd: REPO_ROOT, lang: LANG });
  if (await ui.preflight(pre, async () => runSetupPreflight({ cwd: REPO_ROOT, lang: LANG })) === 'abort') {
    ui.phaseEnd('pre', 'failed');
    await ui.finish('aborted', 1);
    process.exit(1);
  }
  if (!NON_INTERACTIVE && !(await ui.confirmStart(pre))) {
    ui.phaseEnd('pre', 'skipped');
    ui.notice('info', tr('No empezamos. Cuando quieras: <code>bun setup</code>.', 'Not started. Whenever you like: <code>bun setup</code>.'));
    await ui.finish('aborted', 0);
    process.exit(0);
  }
  const reseed = reseedCopiedTemplate();
  if (reseed !== 'kept') {
    const step = ui.step({ phase: 'pre', title: tr('Plantilla limpia de <code>.agents/project.yaml</code>', 'Clean <code>.agents/project.yaml</code> template') });
    step.end(reseed === 'reseeded' ? 'ok' : 'failed', reseed === 'reseeded'
      ? tr(`desde ${SCHEMA_FILE}: cada campo vacío, la estrategia de git heredada`, `from ${SCHEMA_FILE}: every field empty, the git strategy inherited`)
      : tr(`${SCHEMA_FILE} falta o está dañado; restáuralo desde upstream`, `${SCHEMA_FILE} is missing or damaged; restore it from upstream`));
  }
  ui.phaseEnd('pre', pre.verdict === 'warn' ? 'warn' : 'done', pre.verdict === 'warn' ? tr(`${pre.checks.filter(c => c.state === 'warn').length} aviso(s)`, `${pre.checks.filter(c => c.state === 'warn').length} warning(s)`) : undefined);

  // ── team ───────────────────────────────────────────────────────────────
  ui.phase('team', tr('El boilerplate trae instrucciones y skills para tres agentes de IA. Configuramos solo los que uses.', 'The boilerplate ships instructions and skills for three AI agents. We configure only the ones you use.'));
  const engram = detectEngram();
  state.engram = { status: engram.status, version: engram.version, checkedAt: new Date().toISOString() };
  const detected = await detectAgents();
  const agents = await askAgents(detected, state.agents);
  state.agents = agents;
  saveState(state);
  {
    const step = ui.step({ phase: 'team', title: tr('Registrar los agentes en <code>.agents/project.yaml</code>', 'Record the agents in <code>.agents/project.yaml</code>') });
    try {
      await recordHarnessSelection(agents, REPO_ROOT, askConfirm, stepOut(step));
      step.end('ok', `${HARNESSES_KEY}: [${agents.map(harnessOfAgent).join(', ')}]`);
    }
    catch (err) {
      step.end('failed', (err as Error).message);
    }
  }
  let engramRun = engram.status === 'installed';
  if (engram.status === 'incompatible') {
    engramRun = await ask<boolean>({
      id: 'engram-incompatible',
      kind: 'confirm',
      kicker: 'Engram',
      title: tr('Engram está instalado pero no pudimos confirmar su versión. Lo intentamos igual?', 'Engram is installed but its version could not be confirmed. Try anyway?'),
      spec: { yes: tr('Intentarlo', 'Try it'), no: tr('Saltar Engram', 'Skip Engram') },
      default: false,
    });
  }
  else if (engram.status === 'missing') {
    state.engram.status = 'skipped';
  }
  let plugin: boolean | null = null;
  const pluginListed = (): boolean => { const r = tryRun('claude', ['plugin', 'list']); return r.ok && r.stdout.includes('engram@engram'); };
  if (engramRun && agents.includes('claude-code') && !NON_INTERACTIVE && which('claude') !== null && (!state.steps?.agentsSetupRanAt || FORCE_ENGRAM) && !pluginListed()) {
    plugin = await ask<boolean>({
      id: 'engram-plugin',
      kind: 'confirm',
      kicker: 'Engram',
      title: tr('Instalamos el plugin de Engram para Claude Code?', 'Install the Engram plugin for Claude Code?'),
      g: 'engram',
      why: tr('Trae los hooks de sesión que <code>engram setup</code> no escribe. Se instala una vez por máquina, en tu configuración de usuario de Claude Code.', 'It brings the session hooks <code>engram setup</code> does not write. It installs once per machine, in your Claude Code user config.'),
      spec: { yes: tr('Sí, instalarlo', 'Yes, install it'), no: tr('No por ahora', 'Not now') },
      default: true,
    });
  }
  const pickedUserSkills = await askUserLevelSkills(state, agents);
  ui.phaseEnd('team');

  // ── install (background lane, owner answer Q2) ─────────────────────────
  ui.phase('install', tr('Memoria y skills. Corren en segundo plano mientras respondes lo que sigue.', 'Memory and skills. They run in the background while you answer what comes next.'));
  const installLane = (async () => {
    await runEngramStep(agents, state, { run: engramRun, plugin }, lane);
    await runCommunityStep(agents, state, 'project', null, lane);
    await runCommunityStep(agents, state, 'global', pickedUserSkills, lane);
    compatibilityStep(lane);
    ui.phaseEnd('install');
  })().catch((err) => {
    ui.notice('error', `${tr('La tanda de descargas se cortó', 'The download lane stopped')}: ${(err as Error).message}`, 'install');
    ui.phaseEnd('install', 'failed');
  });

  // ── project ────────────────────────────────────────────────────────────
  ui.phase('project', tr('Los datos que las skills usan para no preguntarte cada vez: cómo se llama el proyecto, dónde corre y en qué entorno se trabaja. Quedan en <code>.agents/project.yaml</code> y los cambias cuando quieras.', 'The data the skills use so they do not ask you every time: what the project is called, where it runs and which environment you work in. It lives in <code>.agents/project.yaml</code> and you can change it whenever you like.'));
  await projectPhase(state);
  ui.phaseEnd('project');

  // ── creds ──────────────────────────────────────────────────────────────
  ui.phase('creds', tr('Las skills necesitan entrar a Jira en tu nombre. Te pedimos solo lo que se usa hoy; el resto lo cargas cuando lo necesites.', 'The skills need to sign in to Jira on your behalf. We ask only for what is used today; the rest you add when you need it.'));
  await secretsProviderStep(state);
  await configureMcps(agents, state);
  await configureDayZeroCredentials(state);
  ui.phaseEnd('creds');

  // ── jira ───────────────────────────────────────────────────────────────
  ui.phase('jira', tr('Iniciamos sesión con la herramienta de Atlassian y traemos los campos y flujos de tu proyecto, para que las skills hablen el mismo idioma que tu Jira. [[jira|Para qué?]]', 'We sign in with the Atlassian tool and bring your project\'s fields and workflows, so the skills speak the same language as your Jira. [[jira|What for?]]'));
  await jiraPhase(state);
  ui.phaseEnd('jira', SKIP_JIRA || NON_INTERACTIVE ? 'skipped' : state.postInstall.jiraSyncFields === 'completed' ? 'done' : 'warn');

  // ── github (needs the whole tree: the pre-push hooks lint what the lane wrote) ──
  ui.phase('github', tr('Opcional. Crea el repositorio remoto y sube este primer commit, para que el equipo y CI lo vean.', 'Optional. Creates the remote repository and pushes this first commit, so the team and CI see it.'));
  {
    const waiting = ui.journal.all().some(e => e.t === 'phase.end' && e.id === 'install') ? null : ui.step({ phase: 'github', title: tr('Esperar a que terminen las descargas', 'Wait for the downloads to finish') });
    await installLane;
    waiting?.end('ok');
  }
  await setupGithubRemote(state);
  ui.phaseEnd('github');

  // ── verify ─────────────────────────────────────────────────────────────
  ui.phase('verify', tr('Comprobamos que todo lo instalado responde y dejamos guardado el progreso, para que una próxima corrida no repita nada.', 'We check that everything installed answers and save the progress, so a next run repeats nothing.'));
  verifyExternalClis(state);
  {
    const step = ui.step({ phase: 'verify', why: 'mcp', title: tr('Servidores MCP del proyecto', 'Project MCP servers') });
    const configured = CANONICAL_MCPS.filter(id => state.mcps[id] === 'configured-with-key' || state.mcps[id] === 'configured-no-key');
    const placeholder = CANONICAL_MCPS.filter(id => state.mcps[id] === 'placeholder');
    step.end(configured.length === CANONICAL_MCPS.length ? 'ok' : 'warn', tr(
      `${configured.length} de ${CANONICAL_MCPS.length} listos${placeholder.length ? ` · esperan sus variables: ${placeholder.join(', ')}` : ''}`,
      `${configured.length} of ${CANONICAL_MCPS.length} ready${placeholder.length ? ` · waiting for their variables: ${placeholder.join(', ')}` : ''}`,
    ));
  }
  {
    const step = ui.step({ phase: 'verify', title: tr('Contrato de los agentes (instrucciones, skills, MCP)', 'Agent contract (instructions, skills, MCP)') });
    const check = checkAgentCompatibility(REPO_ROOT, process.platform);
    if (check.ok) { step.end('ok'); }
    else {
      for (const e of check.errors.slice(0, 8)) { step.log(e, 'err'); }
      step.end('warn', tr('Corre <code>bun run agents:compat</code>.', 'Run <code>bun run agents:compat</code>.'));
    }
  }
  await retireHarnessCopies();
  writeTemplateMarker();
  {
    const step = ui.step({ phase: 'verify', title: tr('Guardar el progreso', 'Save the progress') });
    await writeInstallState(state);
    step.end('ok', '<code>.template/installer.state.json</code>');
  }
  ui.phaseEnd('verify');

  // ── done ───────────────────────────────────────────────────────────────
  ui.phase('done');
  const report = buildReport(state, ui);
  ui.report(report);
  ui.phaseEnd('done', report.tone === 'bad' ? 'warn' : 'done');
  await ui.finish(report.pending ? 'done-with-pending' : 'done', 0);
}

/**
 * Retire the stale plaintext MCP credential copies an older install generated
 * (`.claude/settings.local.json` env block, `.auth/opencode/`). Never fatal: a
 * failure leaves the repo exactly as it was, because `bun run setup:doctor`
 * reports the same copies and `bun run harness:env` retires them. Variable
 * NAMES only, never a value.
 *
 * DYNAMIC import on purpose: `cli/lib/harness-env.ts` imports from THIS file,
 * and a static import here would close that cycle.
 */
async function retireHarnessCopies(): Promise<void> {
  const step = UI!.step({ phase: 'verify', title: tr('Copias de credenciales MCP en texto plano', 'Plaintext MCP credential copies') });
  try {
    const { retire } = await import('./lib/harness-env.ts');
    const result = retire();
    if (result.errors.length > 0) {
      step.end('warn', `${tr('No se retiraron: un archivo MCP no se pudo leer', 'Not retired: an MCP config could not be parsed')}: ${result.errors.join('; ')}`);
      return;
    }
    if (!result.changed) {
      step.end('ok', tr('ninguna: cada servidor MCP lee .env por su cuenta', 'none: every MCP server reads .env itself'));
      return;
    }
    const surfaces = [...result.claude, ...(result.opencode === null ? [] : [result.opencode])];
    step.log(`${tr('Retiradas', 'Retired')}: ${surfaces.flatMap(s => [...s.removed, ...s.backedUp]).join(', ')}`);
    step.end(result.backupDirs.length > 0 ? 'warn' : 'ok', result.backupDirs.length > 0
      ? tr(`.env no reproducía algunas; esperan en ${result.backupDirs.join(', ')}. Pon el valor correcto en .env y borra esa carpeta.`, `.env did not reproduce some of them; they wait in ${result.backupDirs.join(', ')}. Put the right value in .env yourself, then delete that directory.`)
      : undefined);
  }
  catch (err) {
    step.end('warn', `${(err as Error).message} · ${tr('<code>bun run setup:doctor</code> las reporta; <code>bun run harness:env</code> las retira', '<code>bun run setup:doctor</code> reports them; <code>bun run harness:env</code> retires them')}`);
  }
}

if (import.meta.main) {
  void main().catch(async (err) => {
    const name = err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : '';
    if (err instanceof PromptCancelled || name === 'ExitPromptError') {
      await abortRun(130);
    }
    if (UI) {
      if (RUN_STATE) { saveState(RUN_STATE); }
      UI.notice('error', `${tr('Error inesperado', 'Unexpected error')}: ${(err as Error).message ?? String(err)}`);
      UI.notice('info', tr('Vuelve a correr <code>bun setup</code>: lo ya hecho no se repite.', 'Run <code>bun setup</code> again: what is done is not repeated.'));
      try { await UI.finish('failed', 1); }
      catch { /* already ending */ }
    }
    else {
      tui.log.error(`Fatal: ${(err as Error).message ?? String(err)}`);
    }
    if (err instanceof Error && err.stack && process.env.DEBUG) { process.stderr.write(`${err.stack}\n`); }
    process.exit(1);
  });
}
