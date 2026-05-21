#!/usr/bin/env bun
/**
 * Project installer for agentic-dev-boilerplate.
 *
 * Drives the end-to-end setup flow:
 *   1. Detect gentle-ai (presence + version)
 *   2. Detect agents (Claude Code / OpenCode) and prompt selection
 *   3. Optionally install Engram persistent memory via gentle-ai (--preset minimal)
 *   4. Wire `.env` for MCP servers + offer direnv autoload
 *      (`.mcp.json` and `opencode.jsonc` are committed with ${VAR}/{env:VAR}
 *      expansion — installer only ensures `.env` has the required values)
 *   5. Verify external CLIs (bun, gh, supabase, vercel, resend, acli,
 *      playwright-cli, jq) — `which`-check only; no auto-install (Rule 4:
 *      OS-dependent installs are deferred to upstream docs)
 *   6. Persist `.template/installer.state.json` for idempotency (gitignored)
 *
 * Env:
 *   INSTALL_SKIP_DIRENV=1             Skip direnv autoload sub-step
 *   INSTALL_FORCE_AGENTS_SETUP=1      Force re-run of gentle-ai skill install (Step 5)
 *   INSTALL_FORCE_COMMUNITY_SKILLS=1  Force re-run of community skills install (Step 6)
 *   INSTALL_FORCE_GITHUB_REMOTE=1     Force re-run of GitHub remote setup (Step 9)
 *
 * Usage:
 *   bun run setup
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { checkbox, password } from '@inquirer/prompts';
import * as tui from './lib/tui.ts';

// ============================================================================
// Types
// ============================================================================

type AgentId = 'claude-code' | 'opencode';

type InstallStatus = 'installed' | 'skipped' | 'failed';

type McpStatus = 'configured-with-key' | 'configured-no-key' | 'placeholder' | 'skipped-by-user';

type CliStatus = 'found' | 'missing';

interface GentleAiInfo {
  found: boolean
  version?: string
  compatible?: boolean
  status: 'installed' | 'missing' | 'skipped' | 'incompatible'
}

interface AgentDetection {
  claudeCode: boolean
  opencode: boolean
}

interface GithubRemoteInfo {
  account: string
  repo: string
  visibility: 'private' | 'public' | 'internal' | 'unknown'
  url: string
  createdAt: string
}

interface InstallState {
  version: 1
  installedAt: string
  agents: AgentId[]
  gentleAi: {
    status: GentleAiInfo['status']
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
    jiraSyncFields: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-auth' | 'failed'
    jiraSyncWorkflows: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-auth' | 'failed'
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
const ENV_PATH = join(REPO_ROOT, '.env');
const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example');

const MIN_GENTLE_AI_VERSION = [1, 26, 5] as const;

const ENGRAM_COMPONENT = 'engram';

const CANONICAL_MCPS = ['context7', 'tavily', 'supabase', 'n8n'] as const;

interface CommunitySkill {
  package: string
  skill?: string // omit or '*' to install all skills from the package
}

// Community skills installed at PROJECT level (`bunx skills add`).
// Stack-aware defaults — tuned for Next.js + React + Tailwind + shadcn +
// Supabase + Vercel + Resend.
// Stack-specific CLI-companion skills (supabase, supabase-postgres-best-practices,
// deploy-to-vercel, resend-cli) live here because the underlying infrastructure
// choice (DB / deploy target / email provider) is per-project, not per-user.
// Truly universal CLI-companion skills (bun, playwright-cli) live at USER level
// instead — see USER_LEVEL_SKILLS.
// Users can run `bunx autoskills` later to refine for their concrete stack.
const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  { package: 'https://github.com/anthropics/skills', skill: 'frontend-design' },
  { package: 'https://github.com/vercel-labs/next-skills', skill: 'next-best-practices' },
  { package: 'https://github.com/vercel-labs/next-skills', skill: 'next-cache-components' },
  { package: 'https://github.com/vercel-labs/next-skills', skill: 'next-upgrade' },
  { package: 'https://github.com/pproenca/dot-skills', skill: 'react-hook-form' },
  { package: 'https://github.com/pproenca/dot-skills', skill: 'zod' },
  { package: 'https://github.com/shadcn/ui', skill: 'shadcn' },
  { package: 'https://github.com/giuseppe-trisciuoglio/developer-kit', skill: 'tailwind-css-patterns' },
  { package: 'https://github.com/wshobson/agents', skill: 'typescript-advanced-types' },
  { package: 'https://github.com/addyosmani/web-quality-skills', skill: 'accessibility' },
  { package: 'https://github.com/addyosmani/web-quality-skills', skill: 'seo' },
  { package: 'czlonkowski/n8n-skills' }, // whole repo (n8n MCP toolkit)
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
];

// Community skills installed at USER (global) level — universal across every
// project the user works on (meta-tooling, runtime, browser automation, CI
// docs, brainstorming, presentation authoring).
const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  { package: 'https://github.com/anthropics/skills', skill: 'skill-creator' },
  { package: 'https://github.com/vercel-labs/skills', skill: 'find-skills' },
  { package: 'https://github.com/xixu-me/skills', skill: 'github-actions-docs' },
  { package: 'https://github.com/obra/superpowers', skill: 'brainstorming' },
  { package: 'https://github.com/lewislulu/html-ppt-skill', skill: 'html-ppt' },
  // Universal CLI-companion skills — `bun` and `playwright-cli` apply across
  // any project the user touches, regardless of stack.
  { package: 'https://bun.sh/docs', skill: 'bun' },
  { package: 'https://github.com/microsoft/playwright-cli', skill: 'playwright-cli' },
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
const MCP_VAR_PATTERN = /\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g;
// Matches OpenCode {env:VAR} placeholders in opencode.jsonc.
const OPENCODE_VAR_PATTERN = /\{env:([A-Z][A-Z0-9_]*)\}/g;
const SECRET_NAME_HINTS = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD'];

// Map MCP server → env vars its secrets depend on. Servers with empty arrays
// have no secrets (so they're always "configured-no-key").
const MCP_SERVER_SECRETS: Record<string, readonly string[]> = {
  context7: [],
  tavily: ['TAVILY_API_KEY'],
  supabase: [
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
  n8n: ['N8N_API_URL', 'N8N_API_KEY'],
};

// ============================================================================
// CLI flags
// ============================================================================

// Auto-detect non-TTY (e.g. when an AI agent or CI pipeline invokes the
// installer) so prompts don't hang waiting for stdin. The flag still wins
// explicitly when passed; without it, lack of a TTY forces the same mode.
const NON_INTERACTIVE
  = process.argv.includes('--non-interactive') || !process.stdin.isTTY;
const AUTO_NON_INTERACTIVE
  = !process.argv.includes('--non-interactive') && !process.stdin.isTTY;
const SKIP_DIRENV = process.env.INSTALL_SKIP_DIRENV === '1';
const FORCE_AGENTS_SETUP = process.env.INSTALL_FORCE_AGENTS_SETUP === '1';
const FORCE_COMMUNITY_SKILLS = process.env.INSTALL_FORCE_COMMUNITY_SKILLS === '1';
const FORCE_GITHUB_REMOTE = process.env.INSTALL_FORCE_GITHUB_REMOTE === '1';

// ============================================================================
// Logger (internal — wraps tui + @clack/prompts log)
// ============================================================================

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  bold: '\x1B[1m',
};

const log = {
  info: (msg: string) => tui.log.info(msg),
  success: (msg: string) => tui.log.success(msg),
  warn: (msg: string) => tui.log.warn(msg),
  error: (msg: string) => tui.log.error(msg),
  banner: (msg: string) => tui.section(msg),
  step: (_n: number, _total: number, title: string) => tui.section(title),
  dim: (msg: string) => process.stdout.write(`${COLORS.dim}${msg}${COLORS.reset}\n`),
};

// ============================================================================
// Prompt helpers
// ============================================================================

async function maybeConfirm(message: string, defaultYes: boolean): Promise<boolean> {
  if (NON_INTERACTIVE) { return defaultYes; }
  const result = await tui.confirm({ message, initialValue: defaultYes });
  if (tui.isCancel(result)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  return result;
}

// ============================================================================
// Subprocess helpers
// ============================================================================

function which(binary: string): string | null {
  // Cross-platform binary detection — POSIX `which` fails on raw Windows
  // PowerShell/cmd. Git Bash and WSL ship the MSYS port, but native Windows
  // shells use `where`. Mirror the scaffolder's helper.
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [binary], { encoding: 'utf8' });
  if (result.status !== 0) { return null; }
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
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

// ============================================================================
// Step 1 — repo identity check
// ============================================================================

async function verifyRepoRoot(): Promise<void> {
  const pkgPath = join(REPO_ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    log.error(`No package.json found at ${pkgPath}. Run this from the repo root.`);
    log.dim('Re-run from the repo root with: bun run setup');
    process.exit(1);
  }
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { name?: string };

  if (pkg.name === 'agentic-dev-boilerplate') {
    return;
  }

  // Accept projects bootstrapped from this template — installer.lock.json
  // carries the `template` sentinel even when the consumer renames
  // package.json.name to their project name.
  if (existsSync(MARKER_PATH)) {
    try {
      const marker = JSON.parse(await readFile(MARKER_PATH, 'utf8')) as { template?: string };
      if (marker.template === 'upex-galaxy/agentic-dev-boilerplate') {
        log.info(`Bootstrapped project detected: ${pkg.name ?? '(unknown)'}`);
        return;
      }
    }
    catch {
      // marker present but unreadable — fall through to confirm
    }
  }

  const proceed = await tui.confirm({
    message: `package.json name is "${pkg.name ?? '(unknown)'}". Continue anyway?`,
    initialValue: false,
  });
  if (tui.isCancel(proceed) || !proceed) {
    log.dim('Aborted. Re-run from the correct repo root with: bun run setup');
    process.exit(0);
  }
}

// ============================================================================
// Step 2 — detect gentle-ai
// ============================================================================

function parseGentleAiVersion(output: string): string | undefined {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

function isCompatible(version: string): boolean {
  const parts = version.split('.').map(n => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const got = parts[i] ?? 0;
    const min = MIN_GENTLE_AI_VERSION[i];
    if (got > min) { return true; }
    if (got < min) { return false; }
  }
  return true;
}

function detectGentleAi(): GentleAiInfo {
  const path = which('gentle-ai');
  if (!path) { return { found: false, status: 'missing' }; }

  const result = tryRun('gentle-ai', ['version']);
  if (!result.ok) { return { found: true, status: 'incompatible' }; }

  const version = parseGentleAiVersion(result.stdout);
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
// Step 3 — gentle-ai install instructions / skip
// ============================================================================

async function handleMissingGentleAi(): Promise<'show-and-exit' | 'skip'> {
  log.warn('gentle-ai not detected on PATH.');
  log.info('gentle-ai installs Engram persistent memory (--preset minimal) into your agent.');
  process.stdout.write('\n');

  const choiceRaw = await tui.confirm({
    message: 'Show install commands and exit so you can install it? (No = continue without gentle-ai)',
    initialValue: true,
  });
  if (tui.isCancel(choiceRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const choice = choiceRaw;

  if (choice) {
    log.banner('Install gentle-ai');
    process.stdout.write('  Official docs : https://github.com/Gentleman-Programming/gentle-ai\n');
    process.stdout.write('  Quick install :\n');
    process.stdout.write('    macOS : brew install gentle-ai\n');
    process.stdout.write('    Linux : go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest\n\n');
    log.dim('After installing, re-run: bun run setup');
    return 'show-and-exit';
  }

  log.warn('Continuing without gentle-ai. Skills + engram will NOT be installed.');
  log.dim('  To enable later: install gentle-ai (see docs above), then re-run: bun run setup');
  return 'skip';
}

// ============================================================================
// Step 4 — detect agents
// ============================================================================

async function detectAgents(): Promise<AgentDetection> {
  const claudePath = join(homedir(), '.claude');
  const opencodePath = join(homedir(), '.config', 'opencode');

  const [claude, opencode] = await Promise.all([
    stat(claudePath).then(
      s => s.isDirectory(),
      () => false,
    ),
    stat(opencodePath).then(
      s => s.isDirectory(),
      () => false,
    ),
  ]);

  return { claudeCode: claude, opencode };
}

async function promptAgentSelection(detected: AgentDetection): Promise<AgentId[]> {
  if (!detected.claudeCode && !detected.opencode) {
    log.error('No agents detected. Install Claude Code (~/.claude/) or OpenCode (~/.config/opencode/) and rerun.');
    log.dim('  Claude Code : https://docs.claude.com/claude-code');
    log.dim('  OpenCode    : https://opencode.ai');
    log.dim('After installing one (or both), re-run: bun run setup');
    process.exit(1);
  }

  if (detected.claudeCode && !detected.opencode) {
    const ok = await tui.confirm({ message: 'Detected Claude Code. Configure for it?', initialValue: true });
    if (tui.isCancel(ok)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
    return ok ? ['claude-code'] : [];
  }

  if (detected.opencode && !detected.claudeCode) {
    const ok = await tui.confirm({ message: 'Detected OpenCode. Configure for it?', initialValue: true });
    if (tui.isCancel(ok)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
    return ok ? ['opencode'] : [];
  }

  const selected = await checkbox<AgentId>({
    message: 'Detected both agents. Which to configure?',
    choices: [
      { name: 'Claude Code', value: 'claude-code', checked: true },
      { name: 'OpenCode', value: 'opencode', checked: true },
    ],
    required: true,
  });
  return selected;
}

// ============================================================================
// Step 5/6 — install skills via gentle-ai
// ============================================================================

// We install only Engram (persistent memory) via gentle-ai's `--preset minimal`.
// The SDD bundle and foundation skills are intentionally NOT installed — this
// repo's own skills (sprint-development, project-foundation, etc.) own the
// dev workflow; SDD would duplicate or conflict with them.

function runGentleAiInstall(args: string[]): { ok: boolean, reason?: string } {
  // gentle-ai uses Go's `flag` package with a fixed schema (see source
  // internal/cli/install.go). Supported flags are: --agent(s), --component(s),
  // --skill(s), --persona, --preset, --sdd-mode, --dry-run. There is NO --yes
  // flag — passing one yields `flag provided but not defined: -yes`.
  // Interactive prompts inside the run (e.g. "Add to allowlist? (y/N)") fall
  // back to their default answer when stdin is not a TTY, so subprocess calls
  // are effectively non-interactive without any extra flag.
  const result = tryRun('gentle-ai', args);
  if (result.ok) { return { ok: true }; }
  return { ok: false, reason: result.stderr.trim() || result.stdout.trim() || 'unknown error' };
}

async function installSkillsViaGentleAi(
  agents: AgentId[],
  state: InstallState,
): Promise<void> {
  if (agents.length === 0) {
    log.info('No agents selected, skipping skill install.');
    return;
  }

  if (state.steps?.agentsSetupRanAt && !FORCE_AGENTS_SETUP) {
    log.dim(`  Skipping — Engram already installed at ${state.steps.agentsSetupRanAt}.`);
    log.dim('  Force re-run with: INSTALL_FORCE_AGENTS_SETUP=1 bun run setup');
    return;
  }

  // One call per agent: `gentle-ai install --preset minimal` installs only the
  // Engram component (persistent memory + MCP wiring). The SDD bundle and
  // foundation skills are deliberately skipped — this repo's own skills own
  // the dev workflow. gentle-ai re-applies components idempotently, so re-runs
  // are safe.
  const totalCalls = agents.length;
  log.info(`This will run ${totalCalls} gentle-ai install command(s) — one call per agent.`);
  log.dim('  Each call: gentle-ai install --agent <agent> --preset minimal (installs Engram only)');

  const proceedRaw = await tui.confirm({ message: 'Continue with Engram installation?', initialValue: true });
  if (tui.isCancel(proceedRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const proceed = proceedRaw;
  if (!proceed) {
    log.warn('Skipping Engram installation.');
    for (const agent of agents) {
      const key = `${ENGRAM_COMPONENT}::${agent}`;
      if (!state.skills[key]) { state.skills[key] = 'skipped'; }
    }
    return;
  }

  for (const agent of agents) {
    log.banner(`Installing for: ${agent}`);
    log.dim(`  gentle-ai install --agent ${agent} --preset minimal`);

    const result = runGentleAiInstall([
      'install',
      '--agent',
      agent,
      '--preset',
      'minimal',
    ]);

    const key = `${ENGRAM_COMPONENT}::${agent}`;
    if (result.ok) {
      log.success(`  installed: Engram (${agent})`);
      state.skills[key] = 'installed';
    }
    else {
      log.error(`  failed: Engram install for ${agent} — ${result.reason}`);
      state.skills[key] = 'failed';
    }
  }
  state.steps = state.steps ?? {};
  state.steps.agentsSetupRanAt = new Date().toISOString();
}

// ============================================================================
// Step 6.5 — install community skills via bunx skills CLI
// ============================================================================

function describeSkill(item: CommunitySkill): string {
  if (!item.skill || item.skill === '*') {
    return item.package.split('/').slice(-2).join('/');
  }
  return item.skill;
}

async function installCommunitySkills(
  state: InstallState,
  level: 'project' | 'global',
): Promise<void> {
  const list = level === 'project' ? PROJECT_LEVEL_SKILLS : USER_LEVEL_SKILLS;
  const label = level === 'project' ? 'project-level' : 'user-level (global)';

  log.banner(`Community skills — ${label}`);
  log.info(`This will run ${list.length} \`bunx skills add\` commands (${label}).`);

  const stepKey = `communitySkills${level === 'project' ? 'Project' : 'Global'}RanAt`;
  if (state.steps?.[stepKey] && !FORCE_COMMUNITY_SKILLS) {
    log.dim(`  Skipping — ${label} community skills already installed at ${state.steps[stepKey]}.`);
    log.dim('  Force re-run with: INSTALL_FORCE_COMMUNITY_SKILLS=1 bun run setup');
    return;
  }

  const proceedRaw = await tui.confirm({
    message: `Install ${label} community skills?`,
    initialValue: true,
  });
  if (tui.isCancel(proceedRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const proceed = proceedRaw;
  if (!proceed) {
    log.warn(`Skipping ${label} community skills.`);
    for (const item of list) {
      const slug = describeSkill(item);
      const key = `community:${level}:${slug}`;
      if (!state.skills[key]) { state.skills[key] = 'skipped'; }
    }
    return;
  }

  for (const item of list) {
    const slug = describeSkill(item);
    const key = `community:${level}:${slug}`;
    if (state.skills[key] === 'installed') {
      log.dim(`  skipping ${slug} (already installed)`);
      continue;
    }
    // Community skills install to `.agents/skills/<slug>/` by default (no `--agent`
    // flag passed). This is INTENTIONAL: T1 repo-owned skills live in
    // `.claude/skills/`, T3/T4 community skills live in `.agents/skills/`. Keeping
    // them separate prevents visual confusion and ensures community installs are
    // gitignored independently of T1 skill commits.
    const args = ['skills', 'add', item.package];
    if (item.skill && item.skill !== '*') {
      args.push('--skill', item.skill);
    }
    if (level === 'global') { args.push('--global'); }
    args.push('--yes');
    const result = tryRun('bunx', args);
    if (result.ok) {
      log.success(`  installed: ${slug}`);
      state.skills[key] = 'installed';
    }
    else {
      log.error(`  failed: ${slug} — ${(result.stderr || result.stdout).trim().slice(0, 120) || 'unknown error'}`);
      state.skills[key] = 'failed';
    }
  }
  state.steps = state.steps ?? {};
  state.steps[stepKey] = new Date().toISOString();
}

// ============================================================================
// Step 7 — Wire .env for MCP servers (+ direnv autoload offer)
// ============================================================================
//
// `.mcp.json` and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}`
// expansion. The installer no longer rewrites those files — it only ensures
// `.env` contains the required values, then optionally enables direnv.

function isSecretName(name: string): boolean {
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

async function discoverRequiredEnvVars(agents: AgentId[]): Promise<string[]> {
  const seen = new Set<string>();
  if (agents.includes('claude-code') && existsSync(CLAUDE_MCP_PATH)) {
    const content = await readFile(CLAUDE_MCP_PATH, 'utf8');
    for (const m of content.matchAll(MCP_VAR_PATTERN)) { seen.add(m[1]); }
  }
  if (agents.includes('opencode') && existsSync(OPENCODE_CONFIG_PATH)) {
    const raw = await readFile(OPENCODE_CONFIG_PATH, 'utf8');
    const content = stripJsoncComments(raw);
    for (const m of content.matchAll(OPENCODE_VAR_PATTERN)) { seen.add(m[1]); }
  }
  return [...seen].sort();
}

function parseEnvFile(content: string): Record<string, string> {
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

async function ensureEnvFileExists(): Promise<void> {
  if (existsSync(ENV_PATH)) { return; }
  if (existsSync(ENV_EXAMPLE_PATH)) {
    const tmpl = await readFile(ENV_EXAMPLE_PATH, 'utf8');
    await writeFile(ENV_PATH, tmpl, 'utf8');
    log.success('Created .env from .env.example (values are empty — fill them below).');
    return;
  }
  await writeFile(ENV_PATH, '', 'utf8');
  log.warn('.env.example missing; created empty .env.');
}

async function appendVarsToEnv(vars: Record<string, string>): Promise<void> {
  if (Object.keys(vars).length === 0) { return; }
  const existing = await readFile(ENV_PATH, 'utf8');
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const header = '\n# ===== Added by `bun run setup` =====\n';
  const body = `${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;
  await writeFile(ENV_PATH, `${existing}${needsNewline ? '\n' : ''}${header}${body}`, 'utf8');
}

async function promptForVar(name: string): Promise<string> {
  if (isSecretName(name)) {
    const entered = await password({
      message: `${name} (Enter to skip — fill later in .env):`,
      mask: '*',
    });
    return (entered ?? '').trim();
  }
  const entered = await tui.text({
    message: `${name} (Enter to skip — fill later in .env):`,
  });
  if (tui.isCancel(entered)) { return ''; }
  return (entered ?? '').trim();
}

async function configureMcps(agents: AgentId[], state: InstallState): Promise<void> {
  if (agents.length === 0) {
    log.info('No agents selected, skipping MCP config.');
    return;
  }

  await ensureEnvFileExists();

  const required = await discoverRequiredEnvVars(agents);
  if (required.length === 0) {
    log.warn('No env-var placeholders found in .mcp.json or opencode.jsonc.');
    state.pendingEnvVars = [];
    return;
  }

  log.info(`Required MCP env vars (from committed configs): ${required.join(', ')}`);

  const envValues = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const newValues: Record<string, string> = {};
  const stillPending: string[] = [];

  for (const name of required) {
    const fromEnvFile = envValues[name];
    if (fromEnvFile && fromEnvFile.trim().length > 0) {
      log.dim(`  ${name}: already set in .env`);
      continue;
    }
    const fromProcessEnv = process.env[name];
    if (fromProcessEnv && fromProcessEnv.trim().length > 0) {
      newValues[name] = fromProcessEnv.trim();
      log.dim(`  ${name}: captured from shell environment`);
      continue;
    }
    if (NON_INTERACTIVE) {
      stillPending.push(name);
      continue;
    }
    const value = await promptForVar(name);
    if (value.length === 0) {
      stillPending.push(name);
    }
    else {
      newValues[name] = value;
    }
  }

  if (Object.keys(newValues).length > 0) {
    await appendVarsToEnv(newValues);
    log.success(`Wrote ${Object.keys(newValues).length} var(s) to .env: ${Object.keys(newValues).join(', ')}`);
  }
  if (stillPending.length > 0) {
    log.warn(`Pending (fill in .env manually): ${stillPending.join(', ')}`);
  }

  state.pendingEnvVars = stillPending;

  // Per-server status — placeholder if any of its required vars are still pending.
  // For atlassian, .mcp.json maps ${ATLASSIAN_*} → internal JIRA_* at server
  // startup; no derivation written to .env (DRY: one family of credentials).
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
}

// ----------------------------------------------------------------------------
// direnv autoload sub-step (still part of Step 7)
// ----------------------------------------------------------------------------

interface DirenvInfo {
  installed: boolean
  version?: string
  supportsDotenvIfExists: boolean
  supportsPwshHook: boolean
  platform: NodeJS.Platform
}

function detectDirenv(): DirenvInfo {
  const platform = process.platform;
  const result = tryRun('direnv', ['version']);
  if (!result.ok) {
    return { installed: false, supportsDotenvIfExists: false, supportsPwshHook: false, platform };
  }
  const version = result.stdout.trim();
  const parts = version.split('.').map(n => Number.parseInt(n, 10));
  const maj = parts[0] ?? 0;
  const min = parts[1] ?? 0;
  const supportsDotenvIfExists = maj > 2 || (maj === 2 && min >= 30);
  const supportsPwshHook = maj > 2 || (maj === 2 && min >= 37);
  return { installed: true, version, supportsDotenvIfExists, supportsPwshHook, platform };
}

function installHintForPlatform(): string {
  if (process.platform === 'win32') {
    return 'winget install direnv  (then restart Git Bash or PowerShell)';
  }
  if (process.platform === 'darwin') {
    return 'brew install direnv';
  }
  return 'sudo apt install direnv  (or: dnf install direnv  /  pacman -S direnv)';
}

// OS-aware recommendation for installing EXTERNAL_CLIS. Kept for reference;
// closing summary now links to official docs per-CLI instead of a single pm command.
// Prefix _ signals intentionally unused per project lint convention.
function _recommendedPackageManager(): { label: string, url: string, install: string } {
  if (process.platform === 'win32') {
    return {
      label: 'Scoop',
      url: 'https://scoop.sh',
      install: 'iwr -useb get.scoop.sh | iex   # PowerShell, one-time',
    };
  }
  // macOS + Linux → Homebrew is cross-platform.
  return {
    label: 'Homebrew',
    url: 'https://brew.sh',
    install: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  };
}

function shellHookHint(info: DirenvInfo): string {
  const shell = (process.env.SHELL ?? '').toLowerCase();
  if (process.platform === 'win32' && shell.length === 0) {
    if (info.supportsPwshHook) {
      return 'Invoke-Expression "$(direnv hook pwsh)"  →  add to $PROFILE  (PowerShell)';
    }
    return 'eval "$(direnv hook bash)"  →  add to ~/.bashrc  (Git Bash; PowerShell needs direnv 2.37+)';
  }
  if (shell.endsWith('zsh')) {
    return 'eval "$(direnv hook zsh)"  →  add to ~/.zshrc';
  }
  if (shell.endsWith('fish')) {
    return 'direnv hook fish | source  →  add to ~/.config/fish/config.fish';
  }
  if (shell.endsWith('bash')) {
    return 'eval "$(direnv hook bash)"  →  add to ~/.bashrc';
  }
  return 'eval "$(direnv hook <your-shell>)"  →  see https://direnv.net/docs/hook.html';
}

async function offerDirenvAutoload(): Promise<void> {
  if (SKIP_DIRENV) {
    log.dim('  INSTALL_SKIP_DIRENV=1, skipping direnv setup.');
    return;
  }
  const info = detectDirenv();

  if (!info.installed) {
    log.info('direnv not installed (optional).');
    log.dim('  Launch agents with: bun claude  /  bun opencode  (dotenv-cli loads .env automatically).');
    log.dim(`  Or install direnv for shell autoload: ${installHintForPlatform()}`);
    return;
  }
  log.info(`direnv ${info.version} detected.`);
  if (info.platform === 'win32') {
    log.dim('  Tip: direnv on Windows works best in Git Bash. PowerShell support is experimental and requires direnv 2.37+.');
  }

  const proceed = await maybeConfirm(
    'Run `direnv allow` so the repo\'s .envrc auto-loads .env into your shell?',
    true,
  );
  if (!proceed) {
    log.dim('  Skipped. Launch agents with: bun claude  /  bun opencode.');
    return;
  }
  const result = tryRun('direnv', ['allow', REPO_ROOT]);
  if (result.ok) {
    log.success('direnv allow succeeded — .envrc will auto-load .env on cd.');
    log.dim(`  Reminder: add this to your shell rc if not already done: ${shellHookHint(info)}`);
  }
  else {
    log.warn('direnv allow failed. Launch agents with: bun claude  /  bun opencode.');
    log.dim(`  ${(result.stderr || result.stdout).trim().slice(0, 200)}`);
  }
}

// ============================================================================
// Step 8 — verify external CLIs
// ============================================================================

interface CliResult {
  name: string
  status: CliStatus
  install?: string
  docs: string
  purpose: string
}

function installHintForOS(cli: { name: string, install?: string }): string {
  if (cli.install) { return cli.install; }
  if (process.platform === 'win32') { return `winget install ${cli.name}`; }
  if (process.platform === 'darwin') { return `brew install ${cli.name}`; }
  return `apt install ${cli.name}`;
}

function verifyExternalClis(state: InstallState): CliResult[] {
  const results: CliResult[] = EXTERNAL_CLIS.map((cli) => {
    const found = which(cli.name) !== null;
    const status: CliStatus = found ? 'found' : 'missing';
    state.externalClis[cli.name] = status;
    return { name: cli.name, status, install: cli.install, docs: cli.docs, purpose: cli.purpose };
  });

  const rows = results.map(r => [
    r.name,
    r.status === 'found' ? tui.statusIcon('ok') : tui.statusIcon('fail'),
    r.status === 'found' ? '' : installHintForOS(r),
    r.purpose,
  ]);
  process.stdout.write(`${tui.table(['CLI', 'Found', 'Install hint', 'Purpose'], rows)}\n`);

  // Hard-abort on any missing CLI flagged as required. acli is the sole default
  // tool for Jira/Confluence (the Atlassian MCP server is opt-in via docs/mcp/),
  // so setup cannot proceed without it.
  for (const cli of EXTERNAL_CLIS) {
    if (cli.required === true && state.externalClis[cli.name] !== 'found') {
      process.stdout.write(`\n${tui.statusIcon('fail')} ${cli.name} is required for Jira/Confluence integration but was not found on PATH.\n`);
      process.stdout.write(`  Install via: ${cli.docs}\n`);
      process.stdout.write('  Then re-run: bun run setup\n');
      process.exit(1);
    }
  }

  return results;
}

// ============================================================================
// Step 9 — persist state
// ============================================================================

async function loadPriorState(): Promise<InstallState | null> {
  if (!existsSync(STATE_PATH)) { return null; }
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as InstallState;
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
    log.warn(`Could not parse ${STATE_PATH}, starting fresh.`);
    return null;
  }
}

async function writeInstallState(state: InstallState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  log.success(`Wrote ${STATE_PATH}`);
}

function buildInitialState(prior: InstallState | null): InstallState {
  if (prior && prior.version === 1) {
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
    return prior;
  }
  return {
    version: 1,
    installedAt: new Date().toISOString(),
    agents: [],
    gentleAi: { status: 'missing', checkedAt: new Date().toISOString() },
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
// Step 10 — GitHub remote (optional)
// ============================================================================

interface GhStatus {
  found: boolean
  version?: string
  authenticated: boolean
}

function detectGh(): GhStatus {
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

async function setupGithubRemote(state: InstallState): Promise<void> {
  if (NON_INTERACTIVE) {
    log.dim('Non-interactive mode — skipping GitHub remote creation.');
    return;
  }

  // Idempotency: if a prior run already created a repo and the local `origin`
  // points at the same URL, skip silently. Re-running `gh repo create` for the
  // same name would fail with `name already exists`.
  if (state.github && !FORCE_GITHUB_REMOTE) {
    const originUrl = tryRun('git', ['remote', 'get-url', 'origin']);
    if (originUrl.ok && originUrl.stdout.trim().includes(`${state.github.account}/${state.github.repo}`)) {
      log.dim(`GitHub remote already configured: ${state.github.url} — skipping. (Force: INSTALL_FORCE_GITHUB_REMOTE=1)`);
      return;
    }
  }

  // Hidrate state.github from an existing `origin` remote when state has no
  // record of it (e.g. user manually ran `gh repo create` between installer
  // runs, or cloned a repo that already had origin set). Parsing the URL
  // populates the closing-summary GitHub block without re-creating the repo.
  if (!state.github) {
    const originUrl = tryRun('git', ['remote', 'get-url', 'origin']);
    if (originUrl.ok) {
      const url = originUrl.stdout.trim();
      // Match SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo[.git]).
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
      if (match) {
        const [, account, repo] = match;
        state.github = {
          account,
          repo,
          visibility: 'unknown',
          url: `https://github.com/${account}/${repo}`,
          createdAt: 'pre-existing',
        };
        log.dim(`Detected existing GitHub remote: ${state.github.url} — hidrating state, skipping create.`);
        state.steps = state.steps ?? {};
        state.steps.githubRemoteRanAt = new Date().toISOString();
        return;
      }
    }
  }

  const gh = detectGh();
  if (!gh.found) {
    log.warn('gh CLI not found. Skipping GitHub repository creation.');
    log.dim('  Install: https://github.com/cli/cli#installation  (then run `gh auth login`).');
    log.dim('  To wire a remote later:  gh repo create --source=. --remote=origin --push');
    return;
  }
  if (!gh.authenticated) {
    log.warn(`gh ${gh.version ?? ''} detected but not authenticated.`);
    log.dim('  Run `gh auth login`, then re-run: bun run setup');
    return;
  }
  log.success(`gh ${gh.version ?? ''} detected (authenticated).`);

  const wantRepoRaw = await tui.confirm({
    message: 'Create a GitHub repository for this project now?',
    initialValue: true,
  });
  if (tui.isCancel(wantRepoRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const wantRepo = wantRepoRaw;
  if (!wantRepo) {
    log.dim('Skipped. To wire later:  gh repo create --source=. --remote=origin --push');
    return;
  }

  // Resolve current package name as default repo name.
  const pkgPath = join(REPO_ROOT, 'package.json');
  let defaultRepoName = 'my-app';
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { name?: string };
    if (pkg.name) { defaultRepoName = sanitizeRepoName(pkg.name); }
  }
  catch { /* fall through with default */ }

  // Resolve account choices: personal login + memberships.
  const userRes = ghApi(['user', '--jq', '.login']);
  if (!userRes.ok || !userRes.stdout) {
    log.error('Could not resolve GitHub user via `gh api user`. Skipping.');
    return;
  }
  const userLogin = userRes.stdout;

  const orgsRes = ghApi(['user/orgs', '--jq', '.[].login']);
  const orgs = orgsRes.ok && orgsRes.stdout.length > 0 ? orgsRes.stdout.split('\n').filter(Boolean) : [];

  const accountChoices: { name: string, value: string }[] = [
    { name: `${userLogin} (personal)`, value: userLogin },
    ...orgs.map(o => ({ name: `${o} (organization)`, value: o })),
  ];

  const accountRaw = await tui.select({
    message: 'Where should the repository live?',
    options: accountChoices.map(c => ({ value: c.value, label: c.name })),
    initialValue: userLogin,
  });
  if (tui.isCancel(accountRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const account = accountRaw;

  const visibilityRaw = await tui.select<'private' | 'public' | 'internal'>({
    message: 'Repository visibility?',
    options: [
      { label: 'private (default)', value: 'private' as const },
      { label: 'public', value: 'public' as const },
      { label: 'internal (org only)', value: 'internal' as const },
    ],
    initialValue: 'private' as const,
  });
  if (tui.isCancel(visibilityRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const visibility = visibilityRaw;

  const rawNameRaw = await tui.text({
    message: 'Repository name:',
    initialValue: defaultRepoName,
  });
  if (tui.isCancel(rawNameRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const rawName = rawNameRaw;
  const repoName = sanitizeRepoName(rawName);
  if (!repoName) {
    log.error('Invalid repository name. Skipping.');
    return;
  }

  log.info(`Creating ${account}/${repoName} (${visibility})…`);
  // Step 1: create remote (no push)
  const createRes = spawnSync('gh', [
    'repo',
    'create',
    `${account}/${repoName}`,
    `--${visibility}`,
    '--source=.',
    '--remote=origin',
  ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

  if (createRes.status !== 0) {
    log.error(`gh repo create failed (exit ${createRes.status}).`);
    if (createRes.stderr) { log.dim(`  ${createRes.stderr.trim()}`); }
    log.dim('  Remote was NOT created. Local files left intact. You can retry later.');
    return;
  }
  log.success(`Remote created: ${account}/${repoName}`);

  // Step 2: push (separate so we can distinguish failure modes)
  const pushRes = spawnSync('git', ['push', '-u', 'origin', 'main'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (pushRes.status !== 0) {
    log.warn(`Remote was created but local push failed (exit ${pushRes.status}).`);
    if (pushRes.stderr) { log.dim(`  ${pushRes.stderr.trim()}`); }
    log.dim('  This usually means pre-push hooks rejected the push.');
    log.dim('  Fix the hook errors then retry:');
    log.dim('    git push -u origin main');
    return;
  }
  log.success('Initial push succeeded.');

  const url = `https://github.com/${account}/${repoName}`;
  state.github = {
    account,
    repo: repoName,
    visibility,
    url,
    createdAt: new Date().toISOString(),
  };
  log.success(`Repository created and pushed: ${url}`);
  state.steps = state.steps ?? {};
  state.steps.githubRemoteRanAt = new Date().toISOString();

  // Write installer.lock.json sentinel so re-runs of verifyRepoRoot() accept
  // the renamed package.json (consumer projects rename their pkg name post-bootstrap).
  if (!existsSync(MARKER_PATH)) {
    try {
      await mkdir(dirname(MARKER_PATH), { recursive: true });
      await writeFile(
        MARKER_PATH,
        `${JSON.stringify({ template: 'upex-galaxy/agentic-dev-boilerplate' }, null, 2)}\n`,
        'utf8',
      );
    }
    catch { /* best-effort */ }
  }
}

// ============================================================================
// Step 12-14 — post-install steps (PHASE 5: INITIAL CONFIGURATION)
// ============================================================================

/**
 * Reload .env in-process so that values edited by the user during the Jira
 * auth-retry loop are visible without a shell restart. Minimal parser:
 * handles KEY=VALUE and KEY='VALUE' / KEY="VALUE"; skips comments and blank
 * lines. Does NOT handle quoted multi-line values — fine for typical .env usage.
 */
function reloadDotEnv(): void {
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
      const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (k) { process.env[k] = v; }
    }
  }
  catch {
    // best-effort — silently continue
  }
}

/**
 * Interactive loop that checks Atlassian credentials (ATLASSIAN_URL /
 * ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN) and probes /rest/api/3/myself.
 * Up to 5 attempts; lets the user skip at any time.
 *
 * Single credential family across every consumer (DRY):
 *   - scripts/sync-jira-*.ts  read ATLASSIAN_* directly
 *   - acli auth login         reads ATLASSIAN_* (token piped via stdin)
 *
 * The Atlassian MCP server is opt-in only (see docs/mcp/*.template.* for the
 * templates to enable it manually); it is not part of the default boilerplate.
 *
 * Returns 'authenticated' when the probe succeeds, or 'skipped' when the user
 * chooses to skip or max attempts are exhausted.
 */
async function jiraAuthLoop(): Promise<'authenticated' | 'skipped'> {
  const probe = async (): Promise<{ ok: boolean, reason: string }> => {
    const url = process.env.ATLASSIAN_URL;
    const email = process.env.ATLASSIAN_EMAIL;
    const token = process.env.ATLASSIAN_API_TOKEN;
    const missing: string[] = [];
    if (!url) { missing.push('ATLASSIAN_URL'); }
    if (!email) { missing.push('ATLASSIAN_EMAIL'); }
    if (!token) { missing.push('ATLASSIAN_API_TOKEN'); }
    if (missing.length > 0) {
      return { ok: false, reason: `Missing env vars: ${missing.join(', ')}` };
    }
    try {
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const res = await fetch(`${url!.replace(/\/$/, '')}/rest/api/3/myself`, {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) { return { ok: true, reason: 'authenticated' }; }
      return {
        ok: false,
        reason: `HTTP ${res.status} from ${url}/rest/api/3/myself — check ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN`,
      };
    }
    catch (err) {
      return { ok: false, reason: `Network error: ${(err as Error).message}` };
    }
  };

  for (let attempt = 1; attempt <= 5; attempt++) {
    const { ok, reason } = await probe();
    if (ok) {
      process.stdout.write(`${tui.statusIcon('ok')} Jira auth verified.\n`);
      return 'authenticated';
    }
    process.stdout.write(`${tui.statusIcon('fail')} Jira auth failed: ${reason}\n`);

    // Show actionable guidance once on first failure
    if (attempt === 1) {
      tui.note(
        [
          '1. Open .env in your editor.',
          '2. Set the three Atlassian variables:',
          '     ATLASSIAN_URL=https://your-org.atlassian.net',
          '     ATLASSIAN_EMAIL=your-email@example.com',
          '     ATLASSIAN_API_TOKEN=...',
          '     (Get a token at https://id.atlassian.com/manage-profile/security/api-tokens)',
          '3. Save the file. dotenv auto-loads on the next probe — no shell reload needed.',
        ].join('\n'),
        'Fix Atlassian credentials',
      );
    }

    const choice = await tui.select<'retry' | 'skip'>({
      message: `Attempt ${attempt} / 5 — what now?`,
      options: [
        { value: 'retry', label: 'I fixed .env — retry' },
        { value: 'skip', label: 'Skip Jira steps for now (re-run later with bun run jira:sync-fields)' },
      ],
    });
    if (tui.isCancel(choice) || choice === 'skip') { return 'skipped'; }

    // Re-load .env before next probe so edits the user just made are visible
    reloadDotEnv();
  }

  process.stdout.write(`${tui.statusIcon('warn')} Max attempts reached — skipping Jira steps.\n`);
  return 'skipped';
}

/**
 * PHASE 5 — INITIAL CONFIGURATION
 * Runs steps 12-14 after the main install phases.
 *
 * All three steps are:
 *   - Idempotent: persisted via state.postInstall so re-running `bun run setup`
 *     skips already-completed steps.
 *   - Skipped automatically when running non-interactively (no TTY / CI),
 *     with each step marked 'skipped-non-interactive' and surfaced in the
 *     closing summary as required manual follow-ups.
 */
async function runPostInstallSteps(state: InstallState): Promise<void> {
  // ── Step 12: Project metadata (.agents/project.yaml) ─────────────────────
  tui.section('Step 12: Project metadata (.agents/project.yaml)');

  if (state.postInstall.agentsSetup === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run. Re-run via: bun run agents:setup\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.agentsSetup = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run agents:setup\n`);
  }
  else {
    const res = spawnSync('bun', ['run', 'agents:setup'], { stdio: 'inherit' });
    state.postInstall.agentsSetup = res.status === 0 ? 'completed' : 'failed';
    if (res.status === 0) {
      process.stdout.write(`${tui.statusIcon('ok')} agents:setup completed\n`);
    }
    else {
      process.stdout.write(`${tui.statusIcon('fail')} agents:setup exited with ${res.status}. Continuing.\n`);
    }
  }

  // ── Step 12.4: Atlassian credentials & acli authentication ──────────────
  tui.section('Step 12.4: Atlassian credentials & acli authentication');

  const acliProbe = (): ReturnType<typeof spawnSync> => spawnSync(
    'acli',
    ['jira', 'workitem', 'search', '--jql', 'created >= -1d', '--limit', '1', '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 8000 },
  );
  const acliManualHint = 'echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$ATLASSIAN_URL" --email "$ATLASSIAN_EMAIL" --token';
  const ATLASSIAN_VARS = ['ATLASSIAN_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'] as const;

  if (state.postInstall.acliAuth === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} acli already authenticated in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    // Non-interactive: vars must already be present (env or .env). If so, run
    // probe + login non-interactively. If anything is missing, hard-fail —
    // the user decision was: no silent skips when acli auth cannot complete.
    reloadDotEnv();
    const missing = ATLASSIAN_VARS.filter(v => !(process.env[v] && process.env[v].trim().length > 0));
    if (missing.length > 0) {
      state.postInstall.acliAuth = 'skipped-non-interactive';
      process.stdout.write(`${tui.statusIcon('fail')} Missing ${missing.join(', ')} in environment / .env. Cannot authenticate acli non-interactively.\n`);
      process.stdout.write(`  Re-run manually: ${acliManualHint}\n`);
      process.exit(1);
    }
    const probe = acliProbe();
    if (probe.status === 0) {
      state.postInstall.acliAuth = 'completed';
      process.stdout.write(`${tui.statusIcon('ok')} acli already authenticated (existing session detected).\n`);
    }
    else {
      const loginRes = spawnSync(
        'acli',
        ['jira', 'auth', 'login', '--site', process.env.ATLASSIAN_URL!, '--email', process.env.ATLASSIAN_EMAIL!, '--token'],
        { input: process.env.ATLASSIAN_API_TOKEN!, stdio: ['pipe', 'inherit', 'inherit'], timeout: 15000 },
      );
      if (loginRes.status === 0) {
        state.postInstall.acliAuth = 'completed';
        process.stdout.write(`${tui.statusIcon('ok')} acli session created.\n`);
      }
      else {
        state.postInstall.acliAuth = 'failed';
        process.stdout.write(`${tui.statusIcon('fail')} acli auth login failed (exit ${loginRes.status}).\n`);
        process.stdout.write(`  Re-run manually: ${acliManualHint}\n`);
        process.exit(1);
      }
    }
  }
  else {
    // Interactive: collect any missing ATLASSIAN_* vars via the existing
    // promptForVar helper (which uses password() for *_TOKEN names), persist
    // them to .env, then probe + login.
    tui.note(
      'Used by acli + scripts/sync-jira-*.ts. Get a token at: https://id.atlassian.com/manage-profile/security/api-tokens',
      'Atlassian credentials',
    );

    reloadDotEnv();
    const envValues = existsSync(ENV_PATH) ? parseEnvFile(readFileSync(ENV_PATH, 'utf8')) : {};
    const newValues: Record<string, string> = {};
    for (const name of ATLASSIAN_VARS) {
      const fromFile = envValues[name];
      const fromShell = process.env[name];
      if ((fromFile && fromFile.trim().length > 0) || (fromShell && fromShell.trim().length > 0)) {
        continue;
      }
      const value = await promptForVar(name);
      if (value.length > 0) { newValues[name] = value; }
    }
    if (Object.keys(newValues).length > 0) {
      await appendVarsToEnv(newValues);
      reloadDotEnv();
    }

    // Probe first: any existing acli session short-circuits the login.
    const probe = acliProbe();
    if (probe.status === 0) {
      state.postInstall.acliAuth = 'completed';
      process.stdout.write(`${tui.statusIcon('ok')} acli already authenticated (existing session detected).\n`);
    }
    else {
      // Up to 3 attempts. URL + email are validated once; only the token is
      // re-prompted on each failure.
      let authenticated = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const url = process.env.ATLASSIAN_URL;
        const email = process.env.ATLASSIAN_EMAIL;
        const token = process.env.ATLASSIAN_API_TOKEN;
        if (!url || !email || !token) {
          // A missing var here means the user skipped the prompt above. Re-
          // prompt the missing one(s) so we have something to try.
          const need: Record<string, string> = {};
          for (const name of ATLASSIAN_VARS) {
            if (!process.env[name] || process.env[name].trim().length === 0) {
              const value = await promptForVar(name);
              if (value.length > 0) { need[name] = value; }
            }
          }
          if (Object.keys(need).length > 0) {
            await appendVarsToEnv(need);
            reloadDotEnv();
          }
          if (!process.env.ATLASSIAN_URL || !process.env.ATLASSIAN_EMAIL || !process.env.ATLASSIAN_API_TOKEN) {
            process.stdout.write(`${tui.statusIcon('fail')} Atlassian credentials still missing — cannot authenticate acli.\n`);
            break;
          }
        }

        const loginRes = spawnSync(
          'acli',
          ['jira', 'auth', 'login', '--site', process.env.ATLASSIAN_URL!, '--email', process.env.ATLASSIAN_EMAIL!, '--token'],
          { input: process.env.ATLASSIAN_API_TOKEN!, stdio: ['pipe', 'inherit', 'inherit'], timeout: 15000 },
        );
        if (loginRes.status === 0) {
          state.postInstall.acliAuth = 'completed';
          authenticated = true;
          process.stdout.write(`${tui.statusIcon('ok')} acli session created. Subsequent acli commands won't need re-auth.\n`);
          break;
        }
        process.stdout.write(`${tui.statusIcon('fail')} acli auth login failed (exit ${loginRes.status}) on attempt ${attempt} / 3.\n`);
        if (attempt < 3) {
          // Re-prompt token only (URL + email already validated).
          const newToken = await promptForVar('ATLASSIAN_API_TOKEN');
          if (newToken.length > 0) {
            await appendVarsToEnv({ ATLASSIAN_API_TOKEN: newToken });
            reloadDotEnv();
          }
        }
      }
      if (!authenticated) {
        state.postInstall.acliAuth = 'failed';
        process.stdout.write(`${tui.statusIcon('fail')} acli authentication failed after 3 attempts.\n`);
        process.stdout.write(`  Re-run manually: ${acliManualHint}\n`);
        process.exit(1);
      }
    }
  }

  // ── Step 13: Jira fields sync (with auth pre-flight loop) ─────────────────
  tui.section('Step 13: Jira fields sync');

  if (state.postInstall.jiraSyncFields === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.jiraSyncFields = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run jira:sync-fields\n`);
  }
  else {
    const authResult = await jiraAuthLoop();
    if (authResult === 'skipped') {
      state.postInstall.jiraSyncFields = 'skipped-no-auth';
      process.stdout.write(`${tui.statusIcon('warn')} Skipped by user. Re-run via: bun run jira:sync-fields\n`);
    }
    else {
      // We're here only when jiraSyncFields is not 'completed' (early-exit
      // upstream returns when it is). That means this is a first-run pass, so
      // we always force-overwrite the template's stale jira-fields.json. The
      // script's safety check still protects user edits in later sessions
      // because the early-exit guard above short-circuits subsequent runs.
      const syncArgs = ['run', 'jira:sync-fields', '--', '--force'];
      const res = spawnSync('bun', syncArgs, { stdio: 'inherit' });
      state.postInstall.jiraSyncFields = res.status === 0 ? 'completed' : 'failed';
      if (res.status === 0) {
        process.stdout.write(`${tui.statusIcon('ok')} jira:sync-fields completed\n`);
      }
      else {
        process.stdout.write(`${tui.statusIcon('fail')} jira:sync-fields exited with ${res.status}. Continuing.\n`);
      }
    }
  }

  // ── Step 13b: Jira workflows + statuses sync ─────────────────────────────
  tui.section('Step 13b: Jira workflows + statuses sync');

  if (state.postInstall.jiraSyncWorkflows === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.jiraSyncWorkflows = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run jira:sync-workflows\n`);
  }
  else if (state.postInstall.jiraSyncFields !== 'completed') {
    state.postInstall.jiraSyncWorkflows = 'skipped-no-auth';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped — jira:sync-fields did not complete (uses same Atlassian credentials).\n`);
  }
  else {
    const res = spawnSync('bun', ['run', 'jira:sync-workflows'], { stdio: 'inherit' });
    state.postInstall.jiraSyncWorkflows = res.status === 0 ? 'completed' : 'failed';
    if (res.status === 0) {
      process.stdout.write(`${tui.statusIcon('ok')} jira:sync-workflows completed\n`);
    }
    else {
      process.stdout.write(`${tui.statusIcon('fail')} jira:sync-workflows exited with ${res.status}. Continuing.\n`);
    }
  }

  // ── Step 14: Jira manifest check ─────────────────────────────────────────
  tui.section('Step 14: Jira manifest check');

  if (state.postInstall.jiraCheck === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.jiraCheck = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run jira:check\n`);
  }
  else if (state.postInstall.jiraSyncFields !== 'completed' || state.postInstall.jiraSyncWorkflows !== 'completed') {
    state.postInstall.jiraCheck = 'skipped-prereq';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped — Jira sync prerequisites incomplete (need both fields + workflows). Re-run via: bun run jira:check\n`);
  }
  else {
    const res = spawnSync('bun', ['run', 'jira:check'], { stdio: 'inherit' });
    state.postInstall.jiraCheck = res.status === 0 ? 'completed' : 'failed';
    if (res.status === 0) {
      process.stdout.write(`${tui.statusIcon('ok')} jira:check completed\n`);
    }
    else {
      process.stdout.write(`${tui.statusIcon('fail')} jira:check exited with ${res.status}. Continuing.\n`);
    }
  }
}

// ============================================================================
// Step 11 — closing summary
// ============================================================================

function statusFor(found: number, total: number): string {
  if (total === 0) { return `${tui.statusIcon('info')} n/a`; }
  if (found === total) { return `${tui.statusIcon('ok')} complete`; }
  return `${tui.statusIcon('warn')} ${total - found} pending`;
}

function printClosingSummary(state: InstallState): void {
  const allSkillEntries = Object.entries(state.skills);
  const gentleSkills = allSkillEntries.filter(([k]) => !k.startsWith('community:'));
  const projectCommunity = allSkillEntries.filter(([k]) => k.startsWith('community:project:'));
  const userCommunity = allSkillEntries.filter(([k]) => k.startsWith('community:global:'));

  const gentleInstalled = gentleSkills.filter(([, s]) => s === 'installed').length;
  const projectInstalled = projectCommunity.filter(([, s]) => s === 'installed').length;
  const userInstalled = userCommunity.filter(([, s]) => s === 'installed').length;

  const mcpConfigured = Object.values(state.mcps).filter(
    s => s === 'configured-with-key' || s === 'configured-no-key' || s === 'placeholder',
  ).length;
  const mcpTotal = CANONICAL_MCPS.length;
  const mcpStatus = statusFor(mcpConfigured, mcpTotal);

  const cliFound = Object.values(state.externalClis).filter(s => s === 'found').length;
  const cliTotal = Object.keys(state.externalClis).length;
  const cliStatus = statusFor(cliFound, cliTotal);
  const cliMissing = Object.entries(state.externalClis)
    .filter(([, s]) => s === 'missing')
    .map(([name]) => name);

  // Read project name from package.json for headline box
  let projectName = 'agentic-dev-boilerplate';
  try {
    const pkgRaw = readFileSync(join(REPO_ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { name?: string };
    if (pkg.name) { projectName = pkg.name; }
  }
  catch { /* fallback to default */ }

  // 4a — Headline box
  process.stdout.write('\n');
  process.stdout.write(`${tui.successBox([
    `${tui.statusIcon('ok')}  Installer complete.  Project: ${projectName}`,
  ])}\n`);

  // 4b — Stats table
  process.stdout.write(tui.table(
    ['Category', 'Installed', 'Total', 'Status'],
    [
      ['Engram (gentle-ai)', `${gentleInstalled}`, `${gentleSkills.length}`, statusFor(gentleInstalled, gentleSkills.length)],
      ['Project skills', `${projectInstalled}`, `${projectCommunity.length}`, statusFor(projectInstalled, projectCommunity.length)],
      ['User skills', `${userInstalled}`, `${userCommunity.length}`, statusFor(userInstalled, userCommunity.length)],
      ['MCPs configured', `${mcpConfigured}`, `${mcpTotal}`, mcpStatus],
      ['External CLIs', `${cliFound}`, `${cliTotal}`, cliStatus],
    ],
  ));
  process.stdout.write('\n');

  if (cliMissing.length > 0) {
    process.stdout.write(`${COLORS.dim}  Missing CLIs: ${cliMissing.join(', ')}${COLORS.reset}\n`);
  }

  // 4c — REQUIRED
  tui.section('REQUIRED — do these now, in this order');
  let stepNum = 0;
  const circled = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

  if (state.pendingEnvVars.length > 0) {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Fill missing env vars${COLORS.reset}  ${COLORS.yellow}(BLOCKS the agent from working with MCPs)${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}Edit .env → set: ${state.pendingEnvVars.join(', ')}${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Without these, MCP servers will 401/403 silently.${COLORS.reset}\n\n`);
    stepNum++;
  }

  // Post-install steps that did not complete — surface as required manual follow-ups.
  if (state.postInstall.agentsSetup !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Configure project metadata${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run agents:setup${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Writes .agents/project.yaml. Agents read this for every command.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.acliAuth !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Authenticate acli (Atlassian CLI)${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$ATLASSIAN_URL" --email "$ATLASSIAN_EMAIL" --token${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Writes a persistent session to ~/.config/acli/. The /acli skill needs this.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.jiraSyncFields !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Sync Jira custom fields${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run jira:sync-fields${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Caches your Jira workspace's custom field IDs. Required for acli.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.jiraSyncWorkflows !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Sync Jira workflows + statuses${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run jira:sync-workflows${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Caches your Jira workspace's statuses + transitions per work_type. Required for acli + skill prompts.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.jiraCheck !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Validate Jira manifest${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run jira:check${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Confirms .agents/jira-required.yaml matches your workspace.${COLORS.reset}\n\n`);
    stepNum++;
  }

  process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Open the agent${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}claude${COLORS.reset}                       ${COLORS.dim}(or: bun claude — works without direnv)${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.dim}Launches your AI in this project's context.${COLORS.reset}\n\n`);
  stepNum++;

  process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Define + scaffold${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}/project-foundation${COLORS.reset}  →  ${COLORS.cyan}/project-bootstrap${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.dim}First defines the PRD/SRS, then scaffolds backend + frontend.${COLORS.reset}\n\n`);
  stepNum++;

  process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Sync project memory${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}/sync-ai-memory${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.dim}AFTER foundation + bootstrap exist. Updates README, CLAUDE.md, and other docs from the new project state.${COLORS.reset}\n\n`);

  // 4d — IN PARALLEL
  tui.section('IN PARALLEL — open another terminal, run while bootstrapping');

  if (cliMissing.length > 0) {
    process.stdout.write('→  Install missing CLIs (links to official docs):\n');
    for (const name of cliMissing) {
      const cliDef = EXTERNAL_CLIS.find(c => c.name === name);
      const docsUrl = cliDef?.docs ?? '(see upstream docs)';
      process.stdout.write(`     • ${name.padEnd(16)} ${COLORS.cyan}${docsUrl}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  const cliAuthCandidates: Array<{ name: string }> = [
    { name: 'gh' },
    { name: 'supabase' },
    { name: 'vercel' },
    { name: 'resend' },
  ];
  const hasFoundAuthCli = cliAuthCandidates.some(c => state.externalClis[c.name] === 'found');
  if (hasFoundAuthCli) {
    process.stdout.write('→  Configure CLI auth (each opens its own login flow — run in a fresh terminal):\n');
    process.stdout.write(`     • ${'gh'.padEnd(12)} ${COLORS.cyan}gh auth login${COLORS.reset}${COLORS.dim}                                 (https://cli.github.com/manual/gh_auth_login)${COLORS.reset}\n`);
    process.stdout.write(`     • ${'supabase'.padEnd(12)} ${COLORS.cyan}supabase login${COLORS.reset}${COLORS.dim}                                (https://supabase.com/docs/reference/cli/supabase-login)${COLORS.reset}\n`);
    process.stdout.write(`     • ${'vercel'.padEnd(12)} ${COLORS.cyan}vercel login${COLORS.reset}${COLORS.dim}                                  (https://vercel.com/docs/cli/login)${COLORS.reset}\n`);
    process.stdout.write(`     • ${'resend'.padEnd(12)} ${COLORS.cyan}resend login${COLORS.reset}${COLORS.dim}                                  (uses RESEND_API_KEY in .env if set)${COLORS.reset}\n`);
    process.stdout.write(`     • ${'acli'.padEnd(12)} ${COLORS.dim}(handled by Step 12.4 above)${COLORS.reset}\n`);
    process.stdout.write('\n');
  }

  const caveman = process.platform === 'win32'
    ? 'irm https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 | iex'
    : 'curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash';
  process.stdout.write('→  Install caveman skill (token compression, ~30s):\n');
  process.stdout.write(`     ${COLORS.cyan}${caveman}${COLORS.reset}\n`);

  process.stdout.write('→  Warp terminal users — install Claude Code plugin:\n');
  process.stdout.write(`     ${COLORS.cyan}/plugin install warp@claude-code-warp${COLORS.reset}\n`);
  process.stdout.write(`     ${COLORS.dim}Docs: https://docs.warp.dev/agent-platform/cli-agents/claude-code/${COLORS.reset}\n`);

  process.stdout.write('\n');

  // 4e — OPTIONAL
  tui.section('OPTIONAL — when you have time');

  process.stdout.write('→  ccstatusline (Claude Code only — customizes the statusline):\n');
  process.stdout.write(`     ${COLORS.cyan}bunx -y ccstatusline@latest${COLORS.reset}\n`);
  process.stdout.write(`     ${COLORS.dim}Run in a separate terminal — concurrent TUIs fight over stdin.${COLORS.reset}\n`);

  if (!state.github) {
    process.stdout.write('→  GitHub repo setup:\n');
    process.stdout.write(`     ${COLORS.cyan}gh repo create --source=. --remote=origin --push${COLORS.reset}\n`);
  }

  process.stdout.write(`→  Read AI personality:  ${COLORS.cyan}docs/ai-personality.md${COLORS.reset}\n`);
  process.stdout.write(`→  Run ${COLORS.cyan}bunx autoskills${COLORS.reset} after foundation + bootstrap to auto-detect the concrete stack.\n`);

  process.stdout.write('\n');

  // 4f — REFERENCE
  tui.section('REFERENCE');
  process.stdout.write(`docs   ${COLORS.cyan}README.md${COLORS.reset}   ·   ${COLORS.cyan}INSTALLER.md${COLORS.reset}   ·   ${COLORS.cyan}.agents/README.md${COLORS.reset}\n`);
  if (state.github) {
    process.stdout.write(`GitHub repo: ${COLORS.cyan}${state.github.url}${COLORS.reset} (${state.github.visibility})\n`);
  }

  process.stdout.write('\n');

  // 4g — Final tip box
  process.stdout.write(`${tui.successBox([
    'Re-run anytime: bun run setup  (idempotent — completed steps are skipped)',
  ])}\n`);
}

// ============================================================================
// Skill URL validation (--validate-skills)
// ============================================================================
//
// Smoke-test mode: probes every entry in PROJECT_LEVEL_SKILLS + USER_LEVEL_SKILLS
// against the skills.sh registry via a HEAD request. Does NOT install anything.
// Exits 0 if every entry is reachable, 1 otherwise.

function normalizeOwnerRepo(pkg: string): { owner: string, repo: string } | null {
  // Accept `https://github.com/owner/repo[.git]` or shorthand `owner/repo`.
  // Skip non-github sources (e.g. https://bun.sh/docs) — those can't be probed
  // against skills.sh and are treated as 'skip'.
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
  log.banner('Skill URL validation (smoke test)');
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
  log.banner('Validation summary');
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

async function main(): Promise<void> {
  // --validate-skills: smoke-test mode. Probes skills.sh for every entry and
  // exits — no install, no prompts.
  if (process.argv.includes('--validate-skills')) {
    const code = await validateSkills();
    process.exit(code);
  }

  // Logo + headline (printed once at the top)
  process.stdout.write(`${tui.logo()}\n\n`);
  process.stdout.write(`${tui.headline('agentic-dev-boilerplate — installer')}\n\n`);
  if (AUTO_NON_INTERACTIVE) {
    log.warn('No TTY detected — running in --non-interactive mode (prompts will use defaults).');
    log.dim('  AI agents: parse pending vars from the closing summary, or run `bun run setup:doctor --json`.');
  }

  // ── PHASE 1 — DETECTION ──────────────────────────────────────────────────
  tui.phaseHeader(1, 'DETECTION');

  tui.section('Step 1: Verifying repo root');
  await verifyRepoRoot();

  tui.section('Step 2: Detecting gentle-ai');
  const gentleAi = detectGentleAi();
  if (gentleAi.found && gentleAi.version) {
    if (gentleAi.compatible) {
      log.success(`gentle-ai ${gentleAi.version} detected (>= ${MIN_GENTLE_AI_VERSION.join('.')}).`);
    }
    else {
      log.warn(`gentle-ai ${gentleAi.version} is older than required ${MIN_GENTLE_AI_VERSION.join('.')}. Upgrade with: gentle-ai update`);
    }
  }
  else {
    log.info('gentle-ai not found.');
  }

  const prior = await loadPriorState();
  const state = buildInitialState(prior);
  state.installedAt = new Date().toISOString();
  state.gentleAi = {
    status: gentleAi.status,
    version: gentleAi.version,
    checkedAt: new Date().toISOString(),
  };

  tui.section('Step 3: gentle-ai install / skip decision');
  let runSkillInstall = false;
  if (gentleAi.status === 'installed') {
    runSkillInstall = true;
  }
  else if (gentleAi.status === 'incompatible') {
    const contRaw = await tui.confirm({
      message: 'gentle-ai is installed but version is older than required. Try anyway?',
      initialValue: false,
    });
    if (tui.isCancel(contRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
    runSkillInstall = contRaw;
  }
  else {
    const decision = await handleMissingGentleAi();
    if (decision === 'show-and-exit') {
      await writeInstallState(state);
      process.exit(0);
    }
    state.gentleAi.status = 'skipped';
    runSkillInstall = false;
  }

  tui.section('Step 4: Detecting agents');
  const detected = await detectAgents();
  log.info(
    `Claude Code: ${detected.claudeCode ? 'found' : 'not found'} | OpenCode: ${detected.opencode ? 'found' : 'not found'}`,
  );
  const agents = await promptAgentSelection(detected);
  state.agents = agents;
  if (agents.length === 0) {
    log.warn('No agents selected, exiting.');
    log.dim('Re-run when ready: bun run setup');
    await writeInstallState(state);
    process.exit(0);
  }

  // ── PHASE 2 — INSTALLATION ───────────────────────────────────────────────
  tui.phaseHeader(2, 'INSTALLATION');

  // Step 5
  if (runSkillInstall) {
    tui.section('Step 5: Installing Engram persistent memory (gentle-ai --preset minimal)');
    const s = tui.spinner();
    s.start('Preparing Engram install…');
    // installSkillsViaGentleAi has its own confirm inside; stop spinner first so it doesn't conflict
    s.stop('Ready to install Engram.');
    await installSkillsViaGentleAi(agents, state);
  }
  else {
    tui.section('Step 5: Skipping Engram install (no compatible gentle-ai)');
    for (const agent of agents) {
      const key = `${ENGRAM_COMPONENT}::${agent}`;
      if (!state.skills[key]) { state.skills[key] = 'skipped'; }
    }
  }

  // Step 6 — community skills via bunx skills CLI (independent of gentle-ai)
  tui.section('Step 6: Installing community skills via bunx skills CLI');
  await installCommunitySkills(state, 'project');
  await installCommunitySkills(state, 'global');

  // ── PHASE 3 — CONFIGURATION ──────────────────────────────────────────────
  tui.phaseHeader(3, 'CONFIGURATION');

  // Step 7
  tui.section('Step 7: Wiring .env for MCP servers');
  await configureMcps(agents, state);
  await offerDirenvAutoload();

  // Step 9 — optional GitHub repo creation
  tui.section('Step 7b: GitHub repository (optional)');
  await setupGithubRemote(state);

  // ── PHASE 4 — VERIFICATION ───────────────────────────────────────────────
  tui.phaseHeader(4, 'VERIFICATION');

  // Step 8
  tui.section('Step 8: Verifying external CLIs');
  verifyExternalClis(state);

  // Step 10
  tui.section('Step 10: Persisting state');
  await writeInstallState(state);

  // ── PHASE 5 — INITIAL CONFIGURATION ─────────────────────────────────────
  tui.phaseHeader(5, 'INITIAL CONFIGURATION');
  await runPostInstallSteps(state);
  await writeInstallState(state);

  // Step 11 (closing summary)
  tui.section('Step 11: Closing summary');
  printClosingSummary(state);
}

main().catch((err) => {
  // Handle both @inquirer ExitPromptError and our own clack cancel wrappers
  const name = err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : '';
  if (name === 'ExitPromptError' || (err instanceof Error && err.message === 'Aborted by user.')) {
    log.warn('Aborted by user.');
    log.dim('Re-run anytime with: bun run setup');
    process.exit(130);
  }
  log.error(`Fatal: ${(err as Error).message ?? String(err)}`);
  if (err instanceof Error && err.stack) { log.dim(err.stack); }
  log.dim('After fixing the issue above, re-run: bun run setup  (installer is idempotent — completed steps are skipped)');
  process.exit(1);
});
