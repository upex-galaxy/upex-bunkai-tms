#!/usr/bin/env bun
/**
 * @fileoverview UPEX Boilerplate Updater v6 — git-SHA-tracked, per-file delta sync
 * from the upstream boilerplate (`upex-galaxy/agentic-dev-boilerplate`).
 *
 * ## Overview
 *
 * v6 replaces bulk `cpSync` with a partial clone + sparse-checkout approach:
 *   1. Reads `.template/boilerplate.lock.json` (schema v6) to determine the last-synced SHA
 *      per component (`perComponentCommit`).
 *   2. Runs `git log <lastSha>..HEAD` per component to find changed files.
 *   3. Classifies each file into one of 5 buckets:
 *      `clean-fastforward | locally-diverged | new-upstream | deleted-upstream | binary-skip`.
 *   4. In interactive mode: presents a Spanish checkbox UI; diverged files get a
 *      paired-diff prompt (`[t]heirs / [m]ine / [s]kip`).
 *   5. In auto/CI mode (`--auto` or `CI=true` or non-TTY stdin): applies
 *      `clean-fastforward` and `new-upstream` silently; defers `locally-diverged`.
 *
 * ## `.template/boilerplate.lock.json` schema v6
 *
 * ```jsonc
 * {
 *   "schemaVersion": 6,
 *   "lastSync": "<ISO-8601 UTC>",
 *   "templateCommit": "<last successfully synced HEAD SHA>",
 *   "cliVersion": "6.0",
 *   "syncedComponents": ["claude", "agents", ...],
 *   "variableSystemVersion": 1,
 *   "perComponentCommit": {
 *     "claude": "<sha>",
 *     "agents": "<sha>",
 *     ...
 *   }
 * }
 * ```
 *
 * ## Requirements
 *
 * - **git ≥ 2.25** — required for `--filter=blob:none` partial clone and sparse-checkout.
 * - **gh CLI** — authenticated with `gh auth login` for template repo access.
 * - **bun runtime** — script executed via `bun cli/update-boilerplate.ts` (or `bun up`).
 *
 * ## CLI flags
 *
 * - `--auto`                  Force non-interactive / CI mode; skips diverged files silently.
 * - `--dry-run`               Simulate sync, no writes to disk (includes `.template/boilerplate.lock.json`).
 * - `--rollback`              Restore files from the most recent `.backups/update-{ISO-ts}/`.
 * - `--update-mcp-template <agent>`
 *                             Legacy MCP template subsystem — short-circuits before delta flow.
 *
 * ## Bootstrap path (first run — missing state file)
 *
 * When `.template/boilerplate.lock.json` is absent, the CLI performs a one-time bulk sync using
 * the existing `mergeDirectory()` primitive per component, then writes an initial v6 state
 * with `perComponentCommit` entries populated from the template HEAD SHA.
 *
 * In `--dry-run`, the bootstrap previews synced files without writing to disk.
 *
 * ## v5 → v6 migration (prompt-driven)
 *
 * When `.template/boilerplate.lock.json` has no `schemaVersion: 6`, the CLI prompts the user:
 *
 *   ```
 *   Detectado: esquema v5 en .template/boilerplate.lock.json.
 *   Se actualizará al esquema v6 (rastreo per-component SHA, --auto, --rollback).
 *   ¿Migrar ahora? [Y/n]:
 *   ```
 *
 * - User accepts (default Y): migration happens in-memory; disk write deferred to post-sync.
 * - User declines: legacy flow executes; `.template/boilerplate.lock.json` is untouched.
 * - `--dry-run`: prompt still fires (user must be informed), disk write skipped.
 *
 * ## Backup strategy
 *
 * Before every file write, the original is copied to `.backups/update-{ISO-ts}/`.
 * A `RESTORE.txt` manifest records all backed-up files for `--rollback`.
 * The backup directory is created once per run via `createBackup()`.
 *
 * ## Per-component SHA tracking
 *
 * Only files whose component has been fully applied (no skipped/failed entries) advance
 * the component SHA in `perComponentCommit`. Partial syncs are re-offered on the next run.
 *
 * ## UX language
 *
 * All user-facing strings are in Spanish. Internal logs, error stacks, and code comments
 * are in English.
 *
 * @example
 *   bun up                           # interactive menu (v6 delta if state exists)
 *   bun up all                       # legacy: sync everything
 *   bun up --auto                    # non-interactive delta sync
 *   bun up --auto --dry-run          # preview what would be synced
 *   bun up --rollback                # restore latest backup
 *   bun up --update-mcp-template claude   # refresh docs/mcp/claude.template.json
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLI_VERSION = '6.0';
const TEMPLATE_REPO = 'upex-galaxy/agentic-dev-boilerplate';
const TEMP_DIR = path.join(os.tmpdir(), 'aicode-template-update');
const VERSION_FILE = '.template/boilerplate.lock.json';

const TOOLING_FILES: string[] = ['.editorconfig', '.prettierrc', '.prettierignore'];
const EXAMPLE_FILES: string[] = [];

// `.agents/` framework universals — always overwritten.
const AGENTS_FRAMEWORK_FILES: string[] = [
  'README.md',
  'jira-required.yaml',
];

// `.agents/` bootstraps — copied only if missing locally; never overwritten.
const AGENTS_BOOTSTRAP_FILES: string[] = [
  'project.yaml',
  'jira-fields.json',
  'jira-workflows.json',
];

const SCRIPTS_FILES: string[] = [
  'lint-vars.ts',
  'agents-setup.ts',
  'check-jira-setup.ts',
  'sync-jira-issues.ts',
  'sync-jira-fields.ts',
  'sync-jira-workflows.ts',
];

/**
 * Granular `.agents/` documentation files synced by the `agents-docs` command.
 *
 * Why granular: the legacy `agents` command also bootstraps protected files
 * (project.yaml, jira-fields.json, jira-workflows.json) on first install. When
 * the consumer just wants to refresh the framework-owned README without
 * touching their project state, `agents-docs` is the safer, faster path.
 *
 * NEVER sync from `.agents/` here:
 *   - project.yaml          (consumer-owned project values)
 *   - jira-fields.json      (auto-generated by `bun run jira:sync-fields`)
 *   - jira-workflows.json   (auto-generated by `bun run jira:sync-workflows`)
 *   - jira-required.yaml    (manifest the consumer customises with optional/unmapped entries)
 */
const AGENTS_DOCS_FILES: string[] = [
  'README.md',
];

/**
 * Granular `.claude/` configuration files synced by the `claude-config` command.
 *
 * NEVER sync from `.claude/` here:
 *   - settings.local.json   (per-developer permissions; gitignored)
 *   - skills/, commands/    (handled by the broader `claude` command)
 */
const CLAUDE_CONFIG_FILES: string[] = [
  'settings.json',
];

// Supported MCP template agents. Keep in sync with `docs/mcp/`.
const MCP_TEMPLATE_AGENTS = ['claude', 'opencode', 'codex', 'gemini'] as const;
type McpAgent = typeof MCP_TEMPLATE_AGENTS[number];

const MCP_TEMPLATE_FILE: Record<McpAgent, string> = {
  claude: 'claude.template.json',
  opencode: 'opencode.template.json',
  codex: 'codex.template.toml',
  gemini: 'gemini.template.json',
};

interface DeprecatedFile {
  path: string
  component: string
  reason: string
  deprecatedSince: string
}

const DEPRECATED_FILES: DeprecatedFile[] = [
  {
    path: '.prompts/setup/kata-framework-setup.md',
    component: 'prompts',
    reason: 'renamed to monorepo-for-qa-setup.md',
    deprecatedSince: '2026-04-28',
  },
  {
    path: '.prompts/setup/kata-architecture-adaptation.md',
    component: 'prompts',
    reason: 'renamed to test-framework-adaptation.md',
    deprecatedSince: '2026-04-28',
  },
];

interface MergeResult {
  success: number
  errors: number
}

interface ParsedArgs {
  commands: string[]
  help: boolean
  dryRun: boolean
  rollback: boolean
  auto: boolean
  updateMcpTemplate: McpAgent | null
}

interface SyncVersion {
  lastSync: string
  templateCommit: string
  cliVersion: string
  syncedComponents: string[]
  variableSystemVersion: boolean
}

// writeSyncState uses tmp+rename atomic write. Assumes .template/boilerplate.lock.json and its .tmp.<pid>
// sibling are on the same filesystem (POSIX rename guarantee). Cross-FS writes (e.g. tmpdir on a
// separate partition) are out of scope.

// v6 — target schema
interface SyncStateV6 {
  schemaVersion: 6
  lastSync: string // ISO-8601 UTC
  templateCommit: string // last successfully synced HEAD SHA
  cliVersion: string // CLI_VERSION at sync time (e.g. '6.0')
  syncedComponents: string[] // component names that have been synced at least once
  variableSystemVersion: number // forward-compat flag (default 1; v5→v6 migration sets to 1)
  perComponentCommit: Record<string, string> // component-name → last applied template SHA
}

// v5 — legacy schema, detection only (still exists in the wild as SyncVersion)
interface SyncStateV5 {
  lastSync: string
  templateCommit: string
  cliVersion: string
  syncedComponents: string[]
  variableSystemVersion: boolean // v5 used boolean; v6 uses number
  // NOTE: no schemaVersion field, no perComponentCommit
}

type SyncState = SyncStateV6 | SyncStateV5;

type ComponentKind = 'directory' | 'file-list' | 'mixed';

interface Component {
  name: string
  type: ComponentKind
  paths: string[] // top-level paths inside repo (e.g. ['.claude/skills'])
  files?: string[] // when type !== 'directory'
  /**
   * When true, the component's files are bootstrap-only:
   *   - if local file EXISTS → classifier forces `unchanged` (never offered as diverged)
   *   - if local file MISSING → classifier forces `new-upstream` (bootstrap copy)
   * Used for AGENTS_BOOTSTRAP_FILES (.agents/project.yaml etc.) so user-filled
   * values are never overwritten by `bun up`.
   */
  bootstrapOnly?: boolean
}

type ChangeStatus = 'M' | 'A' | 'D';

type FileClass
  = 'clean-fastforward'
    | 'locally-diverged'
    | 'new-upstream'
    | 'deleted-upstream'
    | 'binary-skip'
    | 'unchanged';

interface DeltaEntry {
  component: string // component name from COMPONENTS
  path: string // repo-relative path
  status: ChangeStatus
  fromSha: string // perComponentCommit[component] or empty for new-upstream
  toSha: string // new HEAD SHA
  added: number // numstat +N (0 for binary)
  removed: number // numstat -N (0 for binary)
  isBinary: boolean // true when numstat reports "-\t-\t<path>" (binary file)
  templateOldSha: string | null // blob SHA at fromSha commit; null for new-upstream (status A)
  templateNewSha: string | null // blob SHA at HEAD; null for deleted-upstream (status D)
  classification: FileClass
}

type Resolution = 'theirs' | 'mine' | 'skip' | 'delete' | 'keep';

interface AppliedFile {
  entry: DeltaEntry
  resolution: Resolution
}

interface FailedFile {
  entry: DeltaEntry
  reason: string
}

interface RunSummary {
  applied: AppliedFile[]
  skipped: DeltaEntry[]
  failed: FailedFile[]
  newHeadSha: string
  componentsAdvanced: string[]
  componentsHeldBack: string[] // components with skipped/failed files — SHA does NOT advance
}

class CorruptStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptStateError';
  }
}

interface GitVersion {
  major: number
  minor: number
  patch: number
  raw: string
}

// ============================================================================
// COMPONENTS REGISTRY
// ============================================================================

/**
 * Canonical component registry for the new per-file delta flow (v6).
 * Each entry drives sparse-checkout path patterns (via `paths`) and
 * perComponentCommit key (via `name`). 14 components total.
 *
 * The `agents` component covers all of .agents/ in the delta flow.
 * Bootstrap-only files within it (.agents/project.yaml, .agents/jira-fields.json,
 * .agents/jira-workflows.json) are handled inside classifyFile via AGENTS_BOOTSTRAP_FILES.
 */
const COMPONENTS: Component[] = [
  { name: 'claude', type: 'directory', paths: ['.claude/skills', '.claude/commands'] },
  { name: 'claude-config', type: 'file-list', paths: ['.claude'], files: CLAUDE_CONFIG_FILES },
  { name: 'agents', type: 'mixed', paths: ['.agents'], bootstrapOnly: false },
  { name: 'agents-docs', type: 'file-list', paths: ['.agents'], files: AGENTS_DOCS_FILES },
  { name: 'scripts', type: 'file-list', paths: ['scripts'], files: SCRIPTS_FILES },
  { name: 'cli', type: 'directory', paths: ['cli'] },
  { name: 'docs', type: 'directory', paths: ['docs'] },
  { name: 'context', type: 'directory', paths: ['.context'] },
  { name: 'context-engineering', type: 'file-list', paths: ['.'], files: ['CONTEXT.md'] },
  { name: 'docs-mcp', type: 'directory', paths: ['docs/mcp'] },
  { name: 'vscode', type: 'directory', paths: ['.vscode'] },
  { name: 'husky', type: 'directory', paths: ['.husky'] },
  { name: 'tooling', type: 'file-list', paths: ['.'], files: TOOLING_FILES },
  { name: 'examples', type: 'file-list', paths: ['.'], files: EXAMPLE_FILES },
];

// ============================================================================
// TERMINAL COLORS
// ============================================================================

const colors = {
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  blue: '\x1B[34m',
  cyan: '\x1B[36m',
  magenta: '\x1B[35m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  reset: '\x1B[0m',
} as const;

function logHeader(message: string): void {
  console.log(`\n${colors.bold}${colors.cyan}${message}${colors.reset}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logWarning(message: string): void {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logError(message: string): void {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message: string): void {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logStep(message: string): void {
  console.log(`${colors.yellow}📦 ${message}${colors.reset}`);
}

function logMerge(message: string): void {
  console.log(`${colors.magenta}🔀 ${message}${colors.reset}`);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) { return err.message; }
  return String(err);
}

// ============================================================================
// DEPENDENCY CHECK
// ============================================================================

function isPackageInstalled(packageName: string): boolean {
  const nodeModulesPath = path.join(process.cwd(), 'node_modules', packageName);
  if (fs.existsSync(nodeModulesPath)) {
    return true;
  }

  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    const scopedPath = path.join(process.cwd(), 'node_modules', scope, name);
    if (fs.existsSync(scopedPath)) {
      return true;
    }
  }

  return false;
}

async function nativePrompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function ensureDependencies(): Promise<boolean> {
  if (isPackageInstalled('@inquirer/prompts')) {
    return true;
  }

  console.log(`
${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}${colors.yellow}⚠️  Dependencia faltante: @inquirer/prompts${colors.reset}
${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

Esta dependencia es necesaria para el ${colors.cyan}menú interactivo${colors.reset} del script.

${colors.dim}Sin ella, solo puedes usar comandos directos como:${colors.reset}
  ${colors.green}bun up all${colors.reset}              - Actualizar todo
  ${colors.green}bun up docs${colors.reset}             - Actualizar docs/
  ${colors.green}bun up claude agents${colors.reset}    - Skills/commands + agents config

${colors.bold}¿Deseas instalar la dependencia ahora?${colors.reset}
`);

  const answer = await nativePrompt(`${colors.cyan}[Y/n]:${colors.reset} `);

  if (answer === '' || answer === 'y' || answer === 'yes' || answer === 'si' || answer === 's') {
    console.log(`\n${colors.blue}📦 Instalando @inquirer/prompts...${colors.reset}\n`);

    try {
      execSync('bun add @inquirer/prompts', { stdio: 'inherit' });
      console.log(`
${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}${colors.green}✅ Dependencia instalada correctamente${colors.reset}
${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

Ahora puedes ejecutar el script nuevamente:

  ${colors.cyan}bun up${colors.reset}          - Menú interactivo
  ${colors.cyan}bun up all${colors.reset}      - Actualizar todo
  ${colors.cyan}bun up help${colors.reset}     - Ver opciones

`);
      process.exit(0);
    }
    catch (err) {
      logError(`Error instalando dependencia: ${errorMessage(err)}`);
      console.log(`\n${colors.yellow}Intenta instalar manualmente:${colors.reset}`);
      console.log(`  ${colors.green}bun add @inquirer/prompts${colors.reset}\n`);
      process.exit(1);
    }
  }
  else {
    console.log(`\n${colors.yellow}Instalación cancelada.${colors.reset}`);
    console.log('\nPuedes usar comandos directos sin el menú interactivo:');
    console.log(`  ${colors.green}bun up all${colors.reset}      - Actualizar todo`);
    console.log(`  ${colors.green}bun up help${colors.reset}     - Ver todas las opciones\n`);
    process.exit(0);
  }
}

// ============================================================================
// MERGE UTILITIES
// ============================================================================

function mergeDirectory(srcDir: string, destDir: string, prefix = ''): MergeResult {
  let success = 0;
  let errors = 0;

  fs.mkdirSync(destDir, { recursive: true });

  const items = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const item of items) {
    const srcPath = path.join(srcDir, item.name);
    const destPath = path.join(destDir, item.name);

    try {
      if (item.isDirectory()) {
        const sub = mergeDirectory(srcPath, destPath, `${prefix}  `);
        success += sub.success;
        errors += sub.errors;
        logSuccess(`${prefix}${item.name}/`);
      }
      else {
        fs.cpSync(srcPath, destPath);
        success++;
        logSuccess(`${prefix}${item.name}`);
      }
    }
    catch (err) {
      logWarning(`${prefix}Skipped ${item.name}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

function countFilesInDir(dir: string): number {
  if (!fs.existsSync(dir)) { return 0; }
  let count = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      count += countFilesInDir(path.join(dir, item.name));
    }
    else {
      count++;
    }
  }
  return count;
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) { return files; }

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...collectFiles(fullPath));
    }
    else {
      files.push(fullPath);
    }
  }
  return files;
}

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}📦 UPEX Boilerplate Updater v${CLI_VERSION} - Ayuda${colors.reset}

${colors.bold}USO:${colors.reset}
  bun up                        ${colors.dim}# Menu interactivo${colors.reset}
  bun up <comando> [opciones]   ${colors.dim}# Ejecucion directa${colors.reset}

Sincroniza skills, commands, scripts, .agents/, y archivos de configuracion
desde el boilerplate upstream. Las skills viven en .claude/skills/ y los
slash commands en .claude/commands/.

${colors.bold}COMANDOS:${colors.reset}
  all           Actualiza todo (merge completo de todos los directorios)
  docs          Actualiza docs/ (merge completo del directorio)
  context       Actualiza .context/ (merge completo del directorio)
  docs-mcp      Actualiza docs/mcp/ (merge completo del directorio)
  scripts       Actualiza scripts/ (solo framework: agents + jira)
  cli           Actualiza cli/ (Xray CLI y otras herramientas)
  agents        Actualiza .agents/ (framework + bootstrap protegido)
  agents-docs   Solo .agents/README.md (granular — protege project.yaml + jira-*)
  claude        Actualiza .claude/ (settings.json + skills/ + commands/)
  claude-config Solo .claude/settings.json (granular — protege settings.local.json)
  vscode        Actualiza .vscode/ (extensions.json, settings.json)
  husky         Actualiza .husky/ (git hooks)
  tooling       Actualiza archivos de configuracion del framework
  examples      Actualiza archivos de ejemplo
  rollback      Restaura desde el backup mas reciente
  help          Muestra esta ayuda

${colors.bold}FLAGS GLOBALES:${colors.reset}
  --auto                          Modo no-interactivo: aplica clean-fastforward + new-upstream,
                                  omite diverged/deleted. Activa tambien con CI=true o stdin no-TTY.
  --dry-run                       Preview de cambios sin modificar archivos
  --rollback                      Restaura desde el backup mas reciente
  --update-mcp-template <agent>   Refresca docs/mcp/<agent>.template.* desde upstream
                                  (agents soportados: ${MCP_TEMPLATE_AGENTS.join(', ')})
  --help, -h                      Muestra esta ayuda

${colors.bold}MERGE INTELIGENTE:${colors.reset}
  Este script sincroniza TODOS los archivos del template:
  - Actualiza/agrega cualquier archivo que exista en el template
  - Preserva archivos/carpetas creados por el usuario (no en template)
  - No elimina nada que no exista en el template
  - Sin listas hardcodeadas: nuevos archivos del template se incluyen automaticamente

${colors.bold}EJEMPLOS:${colors.reset}
  bun up                                    ${colors.dim}# Menu interactivo${colors.reset}
  bun up all                                ${colors.dim}# Actualiza todo${colors.reset}
  bun up claude agents                      ${colors.dim}# Skills/commands + agents config${colors.reset}
  bun up docs context                       ${colors.dim}# Multiples componentes${colors.reset}
  bun up vscode husky                       ${colors.dim}# Config de VS Code y git hooks${colors.reset}
  bun up tooling examples                   ${colors.dim}# Archivos de configuracion${colors.reset}
  bun up all --dry-run                      ${colors.dim}# Preview sin modificar${colors.reset}
  bun up --rollback                         ${colors.dim}# Restaurar ultimo backup${colors.reset}
  bun up --update-mcp-template claude       ${colors.dim}# Refrescar el template MCP de Claude${colors.reset}
`);
}

// ============================================================================
// INTERACTIVE MENUS
// ============================================================================

async function showMainMenu(): Promise<string[]> {
  const { checkbox } = await import('@inquirer/prompts');

  return checkbox({
    message: 'Que deseas actualizar? (flechas, ESPACIO selecciona, ENTER confirma)',
    choices: [
      { name: 'Todo (all)', value: 'all' },
      { name: 'Claude (.claude/) - Skills, commands y settings', value: 'claude' },
      { name: 'Claude config (.claude/settings.json) - Solo settings (granular)', value: 'claude-config' },
      { name: 'Agents (.agents/) - Framework + bootstrap protegido', value: 'agents' },
      { name: 'Agents docs (.agents/README.md) - Solo README (granular)', value: 'agents-docs' },
      { name: 'Scripts (scripts/) - Solo framework (agents + jira)', value: 'scripts' },
      { name: 'CLI Tools (cli/) - Xray CLI y otras herramientas', value: 'cli' },
      { name: 'Documentacion (docs/)', value: 'docs' },
      { name: 'Context (.context/)', value: 'context' },
      { name: 'Docs MCP (docs/mcp/)', value: 'docs-mcp' },
      { name: 'VS Code (.vscode/)', value: 'vscode' },
      { name: 'Husky (.husky/) - Git hooks', value: 'husky' },
      { name: 'Tooling - Archivos de configuracion', value: 'tooling' },
      { name: 'Examples - Archivos de ejemplo', value: 'examples' },
    ],
  });
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function isMcpAgent(value: string): value is McpAgent {
  return (MCP_TEMPLATE_AGENTS as readonly string[]).includes(value);
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    commands: [],
    help: false,
    dryRun: false,
    rollback: false,
    auto: false,
    updateMcpTemplate: null,
  };

  const validCommands = [
    'all',
    'docs',
    'context',
    'guidelines',
    'docs-mcp',
    'scripts',
    'cli',
    'agents',
    'agents-docs',
    'claude',
    'claude-config',
    'vscode',
    'husky',
    'tooling',
    'examples',
    'help',
    'rollback',
  ];
  const legacyAliases: Record<string, string> = {
    prompts: 'claude',
    books: 'claude',
    guidelines: 'context',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'help' || arg === '--help' || arg === '-h') {
      result.help = true;
    }
    else if (arg === '--auto') {
      result.auto = true;
    }
    else if (arg === '--dry-run') {
      result.dryRun = true;
    }
    else if (arg === '--rollback' || arg === 'rollback') {
      result.rollback = true;
    }
    else if (arg === '--update-mcp-template') {
      const next = args[i + 1];
      if (!next || next.startsWith('-')) {
        logError(`--update-mcp-template requiere un agente: ${MCP_TEMPLATE_AGENTS.join(', ')}`);
        process.exit(1);
      }
      if (!isMcpAgent(next)) {
        logError(`Agente desconocido: ${next}. Soportados: ${MCP_TEMPLATE_AGENTS.join(', ')}`);
        process.exit(1);
      }
      result.updateMcpTemplate = next;
      i++;
    }
    else if (arg === '--all' || arg === '--standalone' || arg === '--fase'
      || arg === '--phase' || arg === '--rol' || arg === '--role') {
      if (arg === '--fase' || arg === '--phase' || arg === '--rol' || arg === '--role') {
        i++;
      }
      logWarning(`Flag legacy ignorada: ${arg}`);
    }
    else if (legacyAliases[arg]) {
      const mapped = legacyAliases[arg];
      logWarning(`Comando legacy '${arg}' mapeado a '${mapped}'`);
      result.commands.push(mapped);
    }
    else if (validCommands.includes(arg)) {
      result.commands.push(arg);
    }
    else if (!arg.startsWith('-')) {
      logWarning(`Comando desconocido: ${arg}`);
    }
  }

  return result;
}

// ============================================================================
// PREREQUISITES
// ============================================================================

function checkCommand(command: string, name: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  }
  catch {
    logError(`${name} no esta instalado`);
    return false;
  }
}

async function validatePrerequisites(): Promise<void> {
  if (!checkCommand('gh', 'GitHub CLI (gh)')) {
    console.log('\nInstalalo con:');
    if (process.platform === 'darwin') {
      console.log('  brew install gh');
    }
    else if (process.platform === 'win32') {
      console.log('  winget install GitHub.cli');
    }
    else {
      console.log('  sudo apt install gh  # Ubuntu/Debian');
      console.log('  O visita: https://cli.github.com/');
    }
    process.exit(1);
  }

  try {
    execSync('gh auth status', { stdio: 'ignore' });
  }
  catch {
    logWarning('No estas autenticado en GitHub CLI');
    console.log('Ejecuta: gh auth login');
    process.exit(1);
  }
}

// ============================================================================
// BACKUP
// ============================================================================

function createBackup(components: string[]): string {
  logStep('Creando backup...');

  const dateSegment = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const timeSegment = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  const backupDir = path.join('.backups', `update-${dateSegment}-${timeSegment}`);

  fs.mkdirSync(backupDir, { recursive: true });

  const backupMap: Record<string, { src: string, dest: string }> = {
    'docs': { src: 'docs', dest: 'docs' },
    'context': { src: '.context', dest: '.context' },
    'docs-mcp': { src: 'docs/mcp', dest: 'docs/mcp' },
    'scripts': { src: 'scripts', dest: 'scripts' },
    'cli': { src: 'cli', dest: 'cli' },
    'agents': { src: '.agents', dest: '.agents' },
    'claude': { src: '.claude', dest: '.claude' },
    'vscode': { src: '.vscode', dest: '.vscode' },
    'husky': { src: '.husky', dest: '.husky' },
  };

  for (const comp of components) {
    const mapping = backupMap[comp];
    if (mapping && fs.existsSync(mapping.src)) {
      const destPath = path.join(backupDir, mapping.dest);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.cpSync(mapping.src, destPath, { recursive: true });
    }
  }

  if (components.includes('tooling')) {
    for (const file of TOOLING_FILES) {
      if (fs.existsSync(file)) {
        fs.cpSync(file, path.join(backupDir, file));
      }
    }
  }

  if (components.includes('examples')) {
    for (const file of EXAMPLE_FILES) {
      if (fs.existsSync(file)) {
        fs.cpSync(file, path.join(backupDir, file));
      }
    }
  }

  if (fs.existsSync('context-engineering.md')) {
    fs.cpSync('context-engineering.md', path.join(backupDir, 'context-engineering.md'));
  }

  logSuccess(`Backup guardado en: ${backupDir}`);
  return backupDir;
}

function cleanupDeprecatedFiles(components: string[]): { removed: number } {
  const allMode = components.includes('all');
  const relevant = DEPRECATED_FILES.filter(d => allMode || components.includes(d.component));
  const present = relevant.filter(d => fs.existsSync(d.path));

  if (present.length === 0) {
    return { removed: 0 };
  }

  console.log('');
  logStep(`Limpiando ${present.length} archivo(s) deprecated...`);

  let removed = 0;
  for (const dep of present) {
    try {
      fs.unlinkSync(dep.path);
      logSuccess(`  Eliminado: ${dep.path}`);
      logInfo(`             Razon: ${dep.reason} (deprecated desde ${dep.deprecatedSince})`);
      removed++;
    }
    catch (err) {
      logWarning(`  No se pudo eliminar ${dep.path}: ${errorMessage(err)}`);
    }
  }

  return { removed };
}

function previewDeprecatedCleanup(commands: string[]): void {
  const allMode = commands.includes('all');
  const relevant = DEPRECATED_FILES.filter(d => allMode || commands.includes(d.component));
  const present = relevant.filter(d => fs.existsSync(d.path));

  if (present.length === 0) {
    return;
  }

  console.log('');
  console.log(`   ${colors.yellow}Deprecated cleanup${colors.reset}  →  Eliminaria ${present.length} archivo(s):`);
  for (const dep of present) {
    console.log(`     ${colors.dim}- ${dep.path}${colors.reset}  ${colors.dim}(${dep.reason})${colors.reset}`);
  }
}

function rollbackFromBackup(): void {
  logHeader('🔄 Rollback desde Backup');

  const backupsDir = '.backups';
  if (!fs.existsSync(backupsDir)) {
    logError('No se encontraron backups. El directorio .backups/ no existe.');
    process.exit(1);
  }

  const backups = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('update-'))
    .map(d => d.name)
    .sort()
    .reverse();

  if (backups.length === 0) {
    logError('No se encontraron backups en .backups/');
    process.exit(1);
  }

  const latest = backups[0];
  const backupPath = path.join(backupsDir, latest);

  logInfo(`Se encontraron ${backups.length} backup${backups.length > 1 ? 's' : ''}:`);
  for (const b of backups.slice(0, 5)) {
    const marker = b === latest ? `${colors.green}  (mas reciente)${colors.reset}` : '';
    console.log(`   ${colors.dim}${b}${colors.reset}${marker}`);
  }
  if (backups.length > 5) {
    console.log(`   ${colors.dim}... y ${backups.length - 5} mas${colors.reset}`);
  }

  console.log('');
  logStep(`Restaurando desde: ${latest}`);

  let restored = 0;
  const restoreDir = (srcDir: string, destDir: string): void => {
    const items = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const item of items) {
      const srcPath = path.join(srcDir, item.name);
      const destPath = path.join(destDir, item.name);
      if (item.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        restoreDir(srcPath, destPath);
      }
      else {
        fs.cpSync(srcPath, destPath);
        restored++;
      }
    }
  };

  try {
    restoreDir(backupPath, process.cwd());
    logSuccess(`Restaurados ${restored} archivos desde ${latest}`);
  }
  catch (err) {
    logError(`Rollback fallido: ${errorMessage(err)}`);
    process.exit(1);
  }
}

function executeDryRun(commands: string[], allMode: boolean): void {
  logHeader('🔍 DRY RUN — No se modificaran archivos');
  console.log('');

  const components: { name: string, dir: string }[] = [];

  if (commands.includes('claude') || allMode) {
    components.push({ name: 'Claude (.claude/)', dir: path.join(TEMP_DIR, '.claude') });
  }
  if (commands.includes('context') || allMode) {
    components.push({ name: 'Context (.context/)', dir: path.join(TEMP_DIR, '.context') });
  }
  if (commands.includes('docs') || allMode) {
    components.push({ name: 'Documentation (docs/)', dir: path.join(TEMP_DIR, 'docs') });
  }
  if (commands.includes('docs-mcp') || allMode) {
    components.push({ name: 'Docs MCP (docs/mcp/)', dir: path.join(TEMP_DIR, 'docs', 'mcp') });
  }
  if (commands.includes('scripts') || allMode) {
    const scriptsCount = SCRIPTS_FILES.filter(f => fs.existsSync(path.join(TEMP_DIR, 'scripts', f))).length;
    console.log(`   ${colors.cyan}Scripts (scripts/)${colors.reset}  →  Sincronizaria ${scriptsCount} archivo${scriptsCount !== 1 ? 's' : ''} de framework`);
  }
  if (commands.includes('cli') || allMode) {
    components.push({ name: 'CLI Tools (cli/)', dir: path.join(TEMP_DIR, 'cli') });
  }
  if (commands.includes('agents') || allMode) {
    const frameworkCount = AGENTS_FRAMEWORK_FILES.filter(f => fs.existsSync(path.join(TEMP_DIR, '.agents', f))).length;
    const bootstrapCount = AGENTS_BOOTSTRAP_FILES.filter(f =>
      fs.existsSync(path.join(TEMP_DIR, '.agents', f)) && !fs.existsSync(path.join('.agents', f)),
    ).length;
    const total = frameworkCount + bootstrapCount;
    console.log(`   ${colors.cyan}Agents (.agents/)${colors.reset}  →  Sincronizaria ${total} archivo${total !== 1 ? 's' : ''} (${frameworkCount} framework + ${bootstrapCount} bootstrap)`);
  }
  if (commands.includes('vscode') || allMode) {
    components.push({ name: 'VS Code (.vscode/)', dir: path.join(TEMP_DIR, '.vscode') });
  }
  if (commands.includes('husky') || allMode) {
    components.push({ name: 'Git Hooks (.husky/)', dir: path.join(TEMP_DIR, '.husky') });
  }
  if (commands.includes('tooling') || allMode) {
    const toolingCount = TOOLING_FILES.filter(f => fs.existsSync(path.join(TEMP_DIR, f))).length;
    console.log(`   ${colors.cyan}Tooling${colors.reset}  →  Sincronizaria ${toolingCount} archivo${toolingCount !== 1 ? 's' : ''} de config`);
  }
  if (commands.includes('examples') || allMode) {
    const examplesCount = EXAMPLE_FILES.filter(f => fs.existsSync(path.join(TEMP_DIR, f))).length;
    console.log(`   ${colors.cyan}Examples${colors.reset}  →  Sincronizaria ${examplesCount} archivo${examplesCount !== 1 ? 's' : ''} de ejemplo`);
  }

  let totalFiles = 0;
  for (const comp of components) {
    const count = countFilesInDir(comp.dir);
    totalFiles += count;
    if (count > 0) {
      console.log(`   ${colors.cyan}${comp.name}${colors.reset}  →  Sincronizaria ${count} archivo${count !== 1 ? 's' : ''}`);
    }
    else {
      console.log(`   ${colors.dim}${comp.name}  →  No encontrado en template${colors.reset}`);
    }
  }

  console.log('');
  logInfo(`Total: ${totalFiles} archivos se sincronizarian`);
  logInfo('Ejecuta sin --dry-run para aplicar los cambios.');
}

// ============================================================================
// CLONE TEMPLATE
// ============================================================================

async function cloneTemplate(): Promise<void> {
  logStep('Descargando ultima version del template...');
  console.log(`${colors.dim}  Repo: ${TEMPLATE_REPO}${colors.reset}`);
  console.log(`${colors.dim}  Destino temporal: ${TEMP_DIR}${colors.reset}`);

  if (fs.existsSync(TEMP_DIR)) {
    console.log(`${colors.dim}  Limpiando directorio temporal anterior...${colors.reset}`);
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  console.log(`${colors.dim}  Verificando autenticacion de GitHub CLI...${colors.reset}`);
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    console.log(`${colors.green}  ✓ GitHub CLI autenticado${colors.reset}`);
  }
  catch {
    logError('GitHub CLI no esta autenticado');
    console.log(`\n${colors.yellow}Ejecuta primero:${colors.reset}`);
    console.log(`  ${colors.cyan}gh auth login${colors.reset}\n`);
    process.exit(1);
  }

  console.log(
    `${colors.dim}  Clonando repositorio (esto puede tomar unos segundos)...${colors.reset}`,
  );

  try {
    const cloneCommand = `gh repo clone ${TEMPLATE_REPO} "${TEMP_DIR}" -- --depth 1 --quiet`;
    execSync(cloneCommand, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    console.log(`${colors.green}  ✓ Template descargado correctamente${colors.reset}`);
  }
  catch (err) {
    const killed = typeof err === 'object' && err !== null && 'killed' in err
      ? Boolean((err as { killed?: unknown }).killed)
      : false;
    if (killed) {
      logError('Timeout: La descarga tardo demasiado (>60s)');
      console.log(`${colors.yellow}Posibles causas:${colors.reset}`);
      console.log('  • Conexion a internet lenta');
      console.log('  • Problemas con GitHub');
      console.log(`\n${colors.yellow}Intenta ejecutar manualmente:${colors.reset}`);
      console.log(`  ${colors.cyan}gh repo clone ${TEMPLATE_REPO}${colors.reset}\n`);
    }
    else {
      logError('Error al descargar el template');
      console.log(`${colors.yellow}Posibles causas:${colors.reset}`);
      console.log('  • No tienes acceso al repositorio privado de UPEX Galaxy');
      console.log('  • Problemas de conexion a internet');
      console.log('  • GitHub CLI no configurado correctamente');
      console.log(`\n${colors.yellow}Verifica tu acceso:${colors.reset}`);
      console.log(`  ${colors.cyan}gh repo view ${TEMPLATE_REPO}${colors.reset}\n`);
    }
    process.exit(1);
  }
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

function updateDocs(): MergeResult {
  logStep('Actualizando docs/ (merge)...');

  const docsPath = path.join(TEMP_DIR, 'docs');
  if (!fs.existsSync(docsPath)) {
    logWarning('No se encontro directorio docs en el template');
    return { success: 0, errors: 0 };
  }

  logMerge('Sincronizando directorio completo...');
  return mergeDirectory(docsPath, 'docs');
}

function updateContext(): MergeResult {
  logStep('Actualizando .context/ (merge)...');

  const contextPath = path.join(TEMP_DIR, '.context');
  if (!fs.existsSync(contextPath)) {
    logWarning('No se encontro directorio .context en el template');
    return { success: 0, errors: 0 };
  }

  logMerge('Sincronizando directorio completo...');
  return mergeDirectory(contextPath, '.context');
}

function updateDocsMcp(): MergeResult {
  logStep('Actualizando docs/mcp/ (merge)...');

  const docsMcpPath = path.join(TEMP_DIR, 'docs', 'mcp');
  if (!fs.existsSync(docsMcpPath)) {
    logWarning('No se encontro directorio docs/mcp en el template');
    return { success: 0, errors: 0 };
  }

  return mergeDirectory(docsMcpPath, 'docs/mcp');
}

function updateScripts(): MergeResult {
  logStep('Actualizando scripts/ (framework scripts only)...');

  let success = 0;
  let errors = 0;

  fs.mkdirSync('scripts', { recursive: true });

  logMerge('Sincronizando framework scripts:');
  for (const file of SCRIPTS_FILES) {
    const srcPath = path.join(TEMP_DIR, 'scripts', file);
    const destPath = path.join('scripts', file);
    try {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath);
        logSuccess(`  ${file}`);
        success++;
      }
      else {
        logWarning(`scripts/${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped scripts/${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

function updateCli(): MergeResult {
  logStep('Actualizando cli/ (merge)...');

  const cliPath = path.join(TEMP_DIR, 'cli');
  if (!fs.existsSync(cliPath)) {
    logWarning('No se encontro directorio cli en el template');
    return { success: 0, errors: 0 };
  }

  logMerge('Sincronizando directorio completo...');
  return mergeDirectory(cliPath, 'cli');
}

function updateVscode(): MergeResult {
  logStep('Actualizando .vscode/ (merge)...');

  const vscodePath = path.join(TEMP_DIR, '.vscode');
  if (!fs.existsSync(vscodePath)) {
    logWarning('No se encontro directorio .vscode en el template');
    return { success: 0, errors: 0 };
  }

  logMerge('Sincronizando directorio completo...');
  return mergeDirectory(vscodePath, '.vscode');
}

function updateHusky(): MergeResult {
  logStep('Actualizando .husky/ (merge)...');

  const huskyPath = path.join(TEMP_DIR, '.husky');
  if (!fs.existsSync(huskyPath)) {
    logWarning('No se encontro directorio .husky en el template');
    return { success: 0, errors: 0 };
  }

  logMerge('Sincronizando directorio completo...');
  return mergeDirectory(huskyPath, '.husky');
}

function updateTooling(): MergeResult {
  logStep('Actualizando archivos de tooling...');

  let success = 0;
  let errors = 0;

  for (const file of TOOLING_FILES) {
    const srcPath = path.join(TEMP_DIR, file);
    try {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, file);
        logSuccess(file);
        success++;
      }
      else {
        logWarning(`${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped ${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

function updateExamples(): MergeResult {
  logStep('Actualizando archivos de ejemplo...');

  let success = 0;
  let errors = 0;

  for (const file of EXAMPLE_FILES) {
    const srcPath = path.join(TEMP_DIR, file);
    try {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, file);
        logSuccess(file);
        success++;
      }
      else {
        logWarning(`${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped ${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

function extractVersion(content: string): string | null {
  const match = content.match(/const\s+CLI_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Auto-update this script from upstream before running other operations.
 *
 * Why: prefer the upstream `update-boilerplate.ts` first; fall back to the
 * legacy `update-template.js` filename so older consumers still get refreshed
 * in place during the transition.
 */
function selfUpdate(): boolean {
  const upstreamCandidates = [
    path.join(TEMP_DIR, 'cli', 'update-boilerplate.ts'),
    path.join(TEMP_DIR, 'cli', 'update-template.js'),
  ];

  const templateScriptPath = upstreamCandidates.find(p => fs.existsSync(p));
  if (!templateScriptPath) {
    return false;
  }

  const upstreamIsTs = templateScriptPath.endsWith('.ts');
  const localScriptPath = upstreamIsTs
    ? path.join(process.cwd(), 'cli', 'update-boilerplate.ts')
    : path.join(process.cwd(), 'cli', 'update-template.js');

  const currentContent = fs.existsSync(localScriptPath)
    ? fs.readFileSync(localScriptPath, 'utf-8')
    : '';
  const templateContent = fs.readFileSync(templateScriptPath, 'utf-8');

  if (currentContent !== templateContent) {
    const currentVer = extractVersion(currentContent) || 'unknown';
    const templateVer = extractVersion(templateContent) || 'unknown';

    const currentMajor = currentVer.split('.')[0];
    const templateMajor = templateVer.split('.')[0];

    if (currentMajor !== templateMajor && currentMajor !== 'unknown') {
      logWarning(`Cambio de version mayor detectado: v${currentVer} → v${templateVer}`);
      logInfo('Revisa el changelog por posibles cambios incompatibles despues de esta actualizacion.');
    }

    const baseName = path.basename(localScriptPath);
    logStep(`Auto-actualizando ${baseName} (v${currentVer} → v${templateVer})...`);
    fs.mkdirSync('cli', { recursive: true });
    fs.cpSync(templateScriptPath, localScriptPath);
    logSuccess(`${baseName} actualizado a v${templateVer}`);
    return true;
  }

  return false;
}

function updateAgents(): MergeResult {
  logStep('Actualizando .agents/ (framework files + bootstrap)...');

  let success = 0;
  let errors = 0;

  fs.mkdirSync('.agents', { recursive: true });

  logMerge('Framework files (overwrite):');
  for (const file of AGENTS_FRAMEWORK_FILES) {
    const srcPath = path.join(TEMP_DIR, '.agents', file);
    const destPath = path.join('.agents', file);
    try {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath);
        logSuccess(`  ${file}`);
        success++;
      }
      else {
        logWarning(`.agents/${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped .agents/${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  logMerge('Bootstrap files (only if missing):');
  for (const file of AGENTS_BOOTSTRAP_FILES) {
    const srcPath = path.join(TEMP_DIR, '.agents', file);
    const destPath = path.join('.agents', file);
    try {
      if (fs.existsSync(destPath)) {
        console.log(`${colors.dim}  ${file} (preservado — tu version)${colors.reset}`);
        continue;
      }

      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath);
        logSuccess(`  ${file} (bootstrapped)`);
        success++;
      }
      else if (file === 'jira-fields.json') {
        fs.writeFileSync(destPath, '{}\n');
        logSuccess(`  ${file} (bootstrapped: {})`);
        success++;
      }
      else if (file === 'jira-workflows.json') {
        fs.writeFileSync(
          destPath,
          '{\n  "story": {\n    "jira_issue_type": null,\n    "workflow_scheme": null,\n    "workflow": null,\n    "statuses": {},\n    "transitions": {}\n  },\n  "bug": {\n    "jira_issue_type": null,\n    "workflow_scheme": null,\n    "workflow": null,\n    "statuses": {},\n    "transitions": {}\n  }\n}\n',
        );
        logSuccess(`  ${file} (bootstrapped: empty work_types shell)`);
        success++;
      }
      else {
        logWarning(`.agents/${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped .agents/${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

function updateClaude(): MergeResult {
  logStep('Actualizando .claude/ (skills + commands + settings)...');

  let success = 0;
  let errors = 0;

  const settingsPath = path.join(TEMP_DIR, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      fs.mkdirSync('.claude', { recursive: true });
      fs.cpSync(settingsPath, '.claude/settings.json');
      logSuccess('settings.json');
      success++;
    }
    catch (err) {
      logWarning(`Skipped settings.json: ${errorMessage(err)}`);
      errors++;
    }
  }

  const upstreamSkillsDir = path.join(TEMP_DIR, '.claude', 'skills');
  if (fs.existsSync(upstreamSkillsDir)) {
    logMerge('skills/ (from upstream):');
    const result = mergeDirectory(upstreamSkillsDir, path.join('.claude', 'skills'), '  ');
    success += result.success;
    errors += result.errors;
  }

  const upstreamCommandsDir = path.join(TEMP_DIR, '.claude', 'commands');
  if (fs.existsSync(upstreamCommandsDir)) {
    logMerge('commands/ (from upstream):');
    const result = mergeDirectory(upstreamCommandsDir, path.join('.claude', 'commands'), '  ');
    success += result.success;
    errors += result.errors;
  }

  logInfo('settings.local.json preservado (nunca se sincroniza)');
  return { success, errors };
}

/**
 * Granular sync of `.agents/` documentation only — `.agents/README.md`.
 *
 * Why this exists: the broader `agents` command bootstraps + overwrites several
 * files. When the consumer just wants to pull a fresh README from upstream
 * without touching project.yaml / jira-fields.json / jira-workflows.json /
 * jira-required.yaml, this is the surgical path.
 */
function updateAgentsDocs(): MergeResult {
  logStep('Actualizando documentacion .agents/...');

  let success = 0;
  let errors = 0;

  fs.mkdirSync('.agents', { recursive: true });

  logMerge('Sincronizando docs de .agents/ (project.yaml / jira-fields.json / jira-workflows.json / jira-required.yaml NO se tocan)...');
  for (const file of AGENTS_DOCS_FILES) {
    const srcPath = path.join(TEMP_DIR, '.agents', file);
    const destPath = path.join('.agents', file);
    try {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath);
        logSuccess(`  .agents/${file}`);
        success++;
      }
      else {
        logWarning(`.agents/${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped .agents/${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

/**
 * Granular sync of `.claude/` config only — `.claude/settings.json`.
 *
 * Why this exists: the broader `claude` command also syncs skills/ and
 * commands/. When the consumer just wants the framework's settings.json
 * without touching their installed skills, this is the surgical path.
 * settings.local.json is never touched (gitignored, per-developer).
 */
function updateClaudeConfig(): MergeResult {
  logStep('Actualizando configuracion .claude/...');

  let success = 0;
  let errors = 0;

  fs.mkdirSync('.claude', { recursive: true });

  logMerge('Sincronizando config de .claude/ (settings.local.json NO se toca)...');
  for (const file of CLAUDE_CONFIG_FILES) {
    const srcPath = path.join(TEMP_DIR, '.claude', file);
    const destPath = path.join('.claude', file);
    try {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath);
        logSuccess(`  .claude/${file}`);
        success++;
      }
      else {
        logWarning(`.claude/${file} no encontrado en template`);
      }
    }
    catch (err) {
      logWarning(`Skipped .claude/${file}: ${errorMessage(err)}`);
      errors++;
    }
  }

  return { success, errors };
}

function updateContextEngineering(): MergeResult {
  const templateReadmePath = path.join(TEMP_DIR, 'README.md');
  if (fs.existsSync(templateReadmePath)) {
    logStep('Actualizando context-engineering.md...');
    try {
      fs.cpSync(templateReadmePath, 'context-engineering.md');
      logSuccess('context-engineering.md actualizado');
      return { success: 1, errors: 0 };
    }
    catch (err) {
      logWarning(`Skipped context-engineering.md: ${errorMessage(err)}`);
      return { success: 0, errors: 1 };
    }
  }
  return { success: 0, errors: 0 };
}

/**
 * Refresh a single MCP template file (docs/mcp/<agent>.template.*) from
 * upstream while leaving every other template untouched.
 *
 * Why: docs/mcp/ is user-managed (the user fills placeholders), but the updater
 * can opt-in refresh a specific agent's template when upstream adds new MCP
 * servers or fixes structure.
 */
async function updateMcpTemplateForAgent(agent: McpAgent): Promise<MergeResult> {
  logHeader(`📦 UPEX Boilerplate Updater v${CLI_VERSION} — MCP template refresh`);
  logInfo(`Agente: ${agent}`);

  await validatePrerequisites();
  await cloneTemplate();

  const fileName = MCP_TEMPLATE_FILE[agent];
  const srcPath = path.join(TEMP_DIR, 'docs', 'mcp', fileName);
  const destPath = path.join('docs', 'mcp', fileName);

  if (!fs.existsSync(srcPath)) {
    logError(`Upstream no contiene docs/mcp/${fileName}`);
    cleanup();
    return { success: 0, errors: 1 };
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (fs.existsSync(destPath)) {
    const localContent = fs.readFileSync(destPath, 'utf-8');
    const upstreamContent = fs.readFileSync(srcPath, 'utf-8');
    if (localContent === upstreamContent) {
      logInfo(`Sin cambios — tu docs/mcp/${fileName} ya esta sincronizado.`);
      cleanup();
      return { success: 0, errors: 0 };
    }
    logWarning(`Tu archivo local docs/mcp/${fileName} sera sobrescrito.`);
    logInfo('Tip: ejecuta "bun up --rollback" si necesitas revertir.');
  }

  try {
    const componentBackup = createBackup(['docs-mcp']);
    fs.cpSync(srcPath, destPath);
    logSuccess(`docs/mcp/${fileName} actualizado desde upstream`);
    logInfo(`Backup disponible en: ${componentBackup}`);
    cleanup();
    return { success: 1, errors: 0 };
  }
  catch (err) {
    logError(`No se pudo actualizar docs/mcp/${fileName}: ${errorMessage(err)}`);
    cleanup();
    return { success: 0, errors: 1 };
  }
}

function cleanup(): void {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

// ============================================================================
// VERSION TRACKING
// ============================================================================

function getTemplateCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: TEMP_DIR, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    return 'unknown';
  }
}

function recordSyncVersion(syncedComponents: string[]): void {
  const version: SyncVersion = {
    lastSync: new Date().toISOString(),
    templateCommit: getTemplateCommit(),
    cliVersion: CLI_VERSION,
    syncedComponents,
    variableSystemVersion: true,
  };

  fs.mkdirSync(path.dirname(VERSION_FILE), { recursive: true });
  fs.writeFileSync(VERSION_FILE, `${JSON.stringify(version, null, 2)}\n`);
  logSuccess(`Version registrada en ${VERSION_FILE}`);
}

function readSyncVersion(): SyncVersion | null {
  if (!fs.existsSync(VERSION_FILE)) { return null; }
  try {
    return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8')) as SyncVersion;
  }
  catch {
    return null;
  }
}

// ============================================================================
// GIT ENVIRONMENT GUARD
// ============================================================================

/**
 * Execute `git --version` and parse the result.
 * Throws Error('GIT_NOT_FOUND') if git binary is not on PATH.
 * Throws Error('GIT_VERSION_UNPARSEABLE: <raw>') if the version string does not match expected format.
 */
function detectGitVersion(): GitVersion {
  let raw: string;
  try {
    raw = execSync('git --version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  }
  catch {
    throw new Error('GIT_NOT_FOUND');
  }

  const match = /\bgit version (\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) {
    throw new Error(`GIT_VERSION_UNPARSEABLE: ${raw}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw,
  };
}

/**
 * Ensure git >= 2.25.0 is available. Exits process with code 2 on any failure.
 * Called from main() before any clone operation — wired in M2.
 */
function ensureGitVersion(): void {
  let version: GitVersion;
  try {
    version = detectGitVersion();
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'GIT_NOT_FOUND') {
      logError('git no encontrado en PATH. git >= 2.25 es requerido para soporte de sparse-checkout.');
      logInfo('Instala git:');
      if (process.platform === 'darwin') {
        logInfo('  brew install git');
      }
      else if (process.platform === 'win32') {
        logInfo('  winget install Git.Git  (o usa WSL2 con apt install git)');
      }
      else {
        logInfo('  sudo apt install git        # Ubuntu/Debian/WSL');
        logInfo('  apk add git                 # Alpine');
      }
    }
    else {
      logError(`No se pudo determinar la version de git: ${msg}`);
    }
    process.exit(2);
  }

  const { major, minor, raw } = version;
  const meetsReq = major > 2 || (major === 2 && minor >= 25);
  if (!meetsReq) {
    logError(`git ${raw} detectado. git >= 2.25.0 es requerido para soporte de sparse-checkout.`);
    logInfo('Actualiza git:');
    if (process.platform === 'darwin') {
      logInfo('  brew upgrade git');
    }
    else if (process.platform === 'win32') {
      logInfo('  winget upgrade Git.Git  (o actualiza via WSL2: sudo apt-get install --only-upgrade git)');
    }
    else {
      logInfo('  sudo apt-get install --only-upgrade git    # Ubuntu/Debian/WSL');
      logInfo('  apk upgrade git                             # Alpine');
    }
    process.exit(2);
  }
}

// ============================================================================
// SYNC STATE I/O
// ============================================================================

/**
 * Read .template/boilerplate.lock.json and return a typed SyncState.
 * Returns null when the file is absent (bootstrap path).
 * Throws CorruptStateError when JSON is invalid or unrecognized.
 * Discriminates v6 vs v5 by presence of `schemaVersion === 6` and `perComponentCommit`.
 * Wired in main() in M2.
 */
function readSyncState(repoRoot: string): SyncState | null {
  const filePath = path.join(repoRoot, VERSION_FILE);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  catch {
    throw new CorruptStateError(
      `Corrupt sync state: ${filePath}. Refusing to silently overwrite. Fix or delete the file.`,
    );
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'perComponentCommit' in parsed
    && (parsed as Record<string, unknown>).schemaVersion === 6
  ) {
    return parsed as SyncStateV6;
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'templateCommit' in parsed
  ) {
    return parsed as SyncStateV5;
  }

  throw new CorruptStateError(
    `Corrupt sync state: ${filePath}. Refusing to silently overwrite. Fix or delete the file.`,
  );
}

/**
 * Pure function — no I/O.
 * Converts a v5 SyncStateV5 to a SyncStateV6 with empty perComponentCommit.
 * templateCommit and syncedComponents are preserved from the old state.
 * variableSystemVersion is set to 1 (number, was boolean in v5).
 */
function migrateSyncState(old: SyncStateV5): SyncStateV6 {
  return {
    schemaVersion: 6,
    lastSync: new Date().toISOString(),
    templateCommit: old.templateCommit,
    cliVersion: CLI_VERSION,
    syncedComponents: old.syncedComponents,
    variableSystemVersion: 1,
    perComponentCommit: {}, // empty — every component appears as fresh delta on first v6 run
  };
}

/**
 * Ask the user for consent before migrating v5 → v6.
 * Returns true on Y/y/Enter (default yes); false on N/n.
 * No file writes — I/O is deferred to writeSyncState post-sync.
 * Prompt text is Spanish per project convention.
 */
async function promptForMigration(_old: SyncStateV5): Promise<boolean> {
  console.log('');
  logWarning('Detectado: esquema v5 en .template/boilerplate.lock.json.');
  logInfo('Se actualizará al esquema v6 (rastreo per-component SHA, --auto, --rollback).');
  const answer = await nativePrompt(
    `${colors.yellow}¿Migrar ahora? [Y/n]:${colors.reset} `,
  );
  return answer === '' || answer === 'y' || answer === 'yes' || answer === 's' || answer === 'si';
}

/**
 * Atomic write of SyncStateV6 to .template/boilerplate.lock.json.
 * Writes to a .tmp.<pid> sibling first, then renames to the final path.
 * Assumes the tmp file and the final path are on the same filesystem (POSIX rename guarantee).
 * Wired in main() in M2/M4.
 */
function writeSyncState(repoRoot: string, state: SyncStateV6): void {
  const finalPath = path.join(repoRoot, VERSION_FILE);
  const tmpPath = `${finalPath}.tmp.${process.pid}`;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  // Node's renameSync is POSIX-atomic on same-FS — no half-written JSON risk
  fs.renameSync(tmpPath, finalPath);
  logSuccess(`Version registrada en ${VERSION_FILE}`);
}

// ============================================================================
// REPOSITORY ACQUISITION
// ============================================================================

/**
 * Resolve the HEAD commit SHA of the already-cloned template repo.
 * Replaces getTemplateCommit() with an explicit repoDir argument.
 * Wired in main() in M2.
 */
function resolveTemplateHeadSha(repoDir: string): string {
  try {
    return execSync(`git -C "${repoDir}" rev-parse HEAD`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    return 'unknown';
  }
}

/**
 * Build sparse-checkout patterns from a component registry.
 *
 * Gitignore-style patterns (`--no-cone` mode) require explicit filenames for
 * root-level files. A bare `.` pattern matches nothing useful at root. For
 * components declared with `paths: ['.']`, expand to each entry in `files`
 * so root-level files like `.editorconfig` and `CONTEXT.md` actually land in
 * the partial clone.
 */
function buildSparseCheckoutPatterns(components: Component[]): string[] {
  const patterns = new Set<string>();
  for (const c of components) {
    for (const p of c.paths) {
      if (p === '.') {
        for (const f of c.files ?? []) {
          patterns.add(f);
        }
      }
      else {
        patterns.add(p);
      }
    }
  }
  return [...patterns];
}

/**
 * Partial clone of the template repository using sparse-checkout.
 * Replaces legacy cloneTemplate() — wired in M2.
 * When `allowedPaths` is omitted, defaults to patterns derived from COMPONENTS
 * via `buildSparseCheckoutPatterns` (root-level files expanded from `files`).
 *
 * Steps:
 *   1. Remove existing dest if present
 *   2. gh auth status (preserved from cloneTemplate)
 *   3. gh repo clone --filter=blob:none --no-checkout
 *   4. git sparse-checkout init --no-cone
 *   5. git sparse-checkout set <patterns>
 *   6. git checkout
 *
 * Throws on clone failure so callers can fall back to legacy cloneTemplate().
 */
async function partialCloneTemplate(
  repoUrl: string,
  dest: string,
  allowedPaths: string[] = buildSparseCheckoutPatterns(COMPONENTS),
): Promise<void> {
  logStep('Descargando ultima version del template (partial clone)...');
  logInfo(`Repo: ${repoUrl}`);
  logInfo(`Destino temporal: ${dest}`);

  if (fs.existsSync(dest)) {
    console.log(`${colors.dim}  Limpiando directorio temporal anterior...${colors.reset}`);
    fs.rmSync(dest, { recursive: true, force: true });
  }

  console.log(`${colors.dim}  Verificando autenticacion de GitHub CLI...${colors.reset}`);
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    console.log(`${colors.green}  ✓ GitHub CLI autenticado${colors.reset}`);
  }
  catch {
    logError('GitHub CLI no esta autenticado');
    console.log(`\n${colors.yellow}Ejecuta primero:${colors.reset}`);
    console.log(`  ${colors.cyan}gh auth login${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.dim}  Clonando repositorio con sparse-checkout (filter=blob:none)...${colors.reset}`);

  try {
    execSync(
      `gh repo clone ${repoUrl} "${dest}" -- --filter=blob:none --no-checkout --quiet`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 },
    );
  }
  catch (error) {
    const err = error as { killed?: boolean, message?: string };
    if (err.killed) {
      logError('Timeout: El clone tardo demasiado (>60s)');
    }
    else {
      logError('Error clonando el repositorio template');
      logInfo('Posibles causas: sin acceso al repo, problemas de red, gh CLI no configurado');
      logInfo(`Verifica: gh repo view ${repoUrl}`);
    }
    throw new Error('Error clonando el repositorio template');
  }

  try {
    execSync(`git -C "${dest}" sparse-checkout init --no-cone`, { stdio: ['pipe', 'pipe', 'pipe'] });
    const patterns = allowedPaths.map(p => `"${p}"`).join(' ');
    execSync(`git -C "${dest}" sparse-checkout set ${patterns}`, { stdio: ['pipe', 'pipe', 'pipe'] });
    execSync(`git -C "${dest}" checkout`, { stdio: ['pipe', 'pipe', 'pipe'] });
    logSuccess('Template descargado exitosamente (sparse checkout)');
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Fallo en configuracion de sparse-checkout: ${msg}`);
    throw new Error(`Fallo en configuracion de sparse-checkout: ${msg}`);
  }
}

// ============================================================================
// FILE CLASSIFICATION
// ============================================================================

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
  '.pdf',
  '.pyc',
]);

/**
 * Normalise whitespace for comparison purposes.
 * Normalises:
 *   1. CRLF → LF
 *   2. Trailing horizontal whitespace stripped per line
 *   3. Trailing whitespace on last line without newline
 *   4. Multiple trailing blank lines collapsed to single trailing newline
 */
function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+(?=\n)/g, '')
    .replace(/[ \t]+$/, '')
    .replace(/\n+$/, '\n');
}

/**
 * Classify a single delta entry into a FileClass.
 * Side-effects: reads local filesystem + executes git show (idempotent reads, no mutations).
 *
 * Classification rules (in order):
 *   1. Binary extension heuristic (locked decision #4) → 'binary-skip'
 *   2. status D + no local file → 'unchanged'
 *   3. status D + local file exists → 'deleted-upstream'
 *   4. Bootstrap-aware override: agents AGENTS_BOOTSTRAP_FILES or bootstrapOnly component:
 *        local exists → 'unchanged'  (NEVER offered as diverged — JSDoc invariant)
 *        local missing → 'new-upstream'
 *   5. status A + no local file → 'new-upstream'
 *   6. status A + local exists → 'locally-diverged'
 *   7. status M + no local file → 'clean-fastforward'
 *   8. status M + byte-identical to template-old → 'clean-fastforward'
 *   9. status M + whitespace-only diff → 'clean-fastforward'
 *  10. else → 'locally-diverged'
 *
 * JSDoc invariant: bootstrap files MUST NEVER appear as locally-diverged in --dry-run output.
 */
function classifyFile(
  entry: Omit<DeltaEntry, 'classification'>,
  templateDir: string,
  localRepoRoot: string,
): FileClass {
  // 1. Binary detection — extension heuristic (locked decision #4)
  const ext = path.extname(entry.path).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext) || entry.isBinary) {
    return 'binary-skip';
  }

  const localPath = path.join(localRepoRoot, entry.path);
  const localExists = fs.existsSync(localPath);

  // 2-3. Deleted upstream
  if (entry.status === 'D') {
    return localExists ? 'deleted-upstream' : 'unchanged';
  }

  // 4. Bootstrap-aware override (agents AGENTS_BOOTSTRAP_FILES or bootstrapOnly component)
  const component = COMPONENTS.find(c => c.name === entry.component);
  const basename = path.basename(entry.path);
  const isBootstrapFile = (
    (component?.bootstrapOnly === true)
    || (entry.component === 'agents' && AGENTS_BOOTSTRAP_FILES.includes(basename))
  );
  if (isBootstrapFile) {
    return localExists ? 'unchanged' : 'new-upstream';
  }

  // 5-6. Added upstream
  if (entry.status === 'A') {
    return localExists ? 'locally-diverged' : 'new-upstream';
  }

  // status === 'M' from here
  // 7. User deleted the file locally — fast-forward applies cleanly
  if (!localExists) {
    return 'clean-fastforward';
  }

  // 8. Byte-compare local vs template-old blob
  const localBytes = fs.readFileSync(localPath);

  if (entry.templateOldSha) {
    let templateOldBytes: Buffer;
    try {
      templateOldBytes = execSync(
        `git -C "${templateDir}" show ${entry.templateOldSha}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ) as unknown as Buffer;
    }
    catch {
      // Cannot retrieve blob — safe fallback to diverged
      return 'locally-diverged';
    }

    if (Buffer.compare(localBytes, templateOldBytes) === 0) {
      return 'clean-fastforward';
    }

    // 9. Whitespace-only divergence
    const localStr = localBytes.toString('utf8');
    const oldStr = templateOldBytes.toString('utf8');
    if (normalizeWhitespace(localStr) === normalizeWhitespace(oldStr)) {
      return 'clean-fastforward';
    }
  }

  return 'locally-diverged';
}

// ============================================================================
// DELTA COMPUTATION
// ============================================================================

/**
 * Compute per-component deltas using stored SHA cursors.
 *
 * For each component with a known perComponentCommit SHA:
 *   - Runs `git log <sha>..HEAD --name-status --no-renames -- <paths>`
 *   - Runs `git diff --numstat <sha>..HEAD -- <paths>` for line counts + binary detection
 *   - Resolves templateOldSha / templateNewSha per entry
 *   - Calls classifyFile() for each entry
 *
 * Components whose SHA equals HEAD → skipped (zero delta).
 * Components with no SHA entry → treated as all-files-added (status A).
 *
 * Returns: flat DeltaEntry[] (classified).
 */
function computeDelta(
  templateDir: string,
  components: readonly Component[],
  state: SyncStateV6,
): DeltaEntry[] {
  const delta: DeltaEntry[] = [];

  // Get current HEAD SHA of the template clone
  let headSha: string;
  try {
    headSha = execSync(`git -C "${templateDir}" rev-parse HEAD`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  }
  catch {
    logError('No se pudo resolver el HEAD SHA del template clone');
    return delta;
  }

  for (const component of components) {
    const componentSha = state.perComponentCommit[component.name];

    if (!componentSha) {
      // No SHA recorded — skip; bootstrap path handles this
      continue;
    }

    if (componentSha === headSha) {
      // Already at HEAD for this component
      continue;
    }

    // Build path args for git commands
    const pathArgs = component.paths.map(p => `"${p}"`).join(' ');

    // --- name-status (with --no-renames to demote R → D+A) ---
    let nameStatusOutput: string;
    try {
      nameStatusOutput = execSync(
        `git -C "${templateDir}" log ${componentSha}..HEAD --name-status --no-renames --diff-filter=ADM -- ${pathArgs}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      logWarning(`No se pudo computar el delta del componente '${component.name}'. Saltando.`);
      continue;
    }

    // --- numstat (for line counts + binary detection) ---
    let numstatOutput: string;
    try {
      numstatOutput = execSync(
        `git -C "${templateDir}" diff --numstat ${componentSha}..HEAD -- ${pathArgs}`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch {
      numstatOutput = '';
    }

    // Build numstat lookup: path → { added, removed, isBinary }
    const numstatMap = new Map<string, { added: number, removed: number, isBinary: boolean }>();
    for (const line of numstatOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      // Binary: "-\t-\t<path>"
      const binaryMatch = /^-\t-\t(.+)$/.exec(trimmed);
      if (binaryMatch) {
        numstatMap.set(binaryMatch[1], { added: 0, removed: 0, isBinary: true });
        continue;
      }
      const numMatch = /^(\d+)\t(\d+)\t(.+)$/.exec(trimmed);
      if (numMatch) {
        numstatMap.set(numMatch[3], {
          added: Number.parseInt(numMatch[1], 10),
          removed: Number.parseInt(numMatch[2], 10),
          isBinary: false,
        });
      }
    }

    // Parse name-status output — unique paths (git log may repeat a file across commits)
    const seenPaths = new Set<string>();
    const fileStatuses = new Map<string, ChangeStatus>();

    for (const line of nameStatusOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      const match = /^([MAD])\t(.+)$/.exec(trimmed);
      if (!match) { continue; }
      const status = match[1] as ChangeStatus;
      const filePath = match[2];
      // Most-recent status in git log order wins (git log prints newest-first)
      if (!seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        fileStatuses.set(filePath, status);
      }
    }

    for (const [filePath, status] of fileStatuses) {
      const numstat = numstatMap.get(filePath) ?? { added: 0, removed: 0, isBinary: false };

      // Resolve templateOldSha (blob at componentSha)
      let templateOldSha: string | null = null;
      if (status !== 'A') {
        try {
          const lsOld = execSync(
            `git -C "${templateDir}" ls-tree ${componentSha} -- "${filePath}"`,
            { stdio: ['pipe', 'pipe', 'pipe'] },
          ).toString().trim();
          const blobMatch = /\bblob\s+([0-9a-f]{40})\b/.exec(lsOld);
          templateOldSha = blobMatch ? blobMatch[1] : null;
        }
        catch {
          templateOldSha = null;
        }
      }

      // Resolve templateNewSha (blob at HEAD)
      let templateNewSha: string | null = null;
      if (status !== 'D') {
        try {
          const lsNew = execSync(
            `git -C "${templateDir}" ls-tree HEAD -- "${filePath}"`,
            { stdio: ['pipe', 'pipe', 'pipe'] },
          ).toString().trim();
          const blobMatch = /\bblob\s+([0-9a-f]{40})\b/.exec(lsNew);
          templateNewSha = blobMatch ? blobMatch[1] : null;
        }
        catch {
          templateNewSha = null;
        }
      }

      const partial: Omit<DeltaEntry, 'classification'> = {
        component: component.name,
        path: filePath,
        status,
        fromSha: componentSha,
        toSha: headSha,
        added: numstat.added,
        removed: numstat.removed,
        isBinary: numstat.isBinary,
        templateOldSha,
        templateNewSha,
      };

      const classification = classifyFile(partial, templateDir, process.cwd());

      delta.push({ ...partial, classification });
    }
  }

  return delta;
}

// ============================================================================
// APPLIER
// ============================================================================

/**
 * Append a RESTORE.txt manifest to the backup directory.
 * Records timestamp, SHAs, and one line per entry with status/classification/resolution/path.
 * Includes the prior .template/boilerplate.lock.json as base64 for full rollback.
 */
function appendBackupManifest(backupDir: string, entries: DeltaEntry[], state: SyncStateV6): void {
  const lines: string[] = [
    '# update-boilerplate rollback manifest',
    `timestamp: ${new Date().toISOString()}`,
    `priorTemplateCommit: ${state.templateCommit || 'none'}`,
    `newTemplateCommit: ${state.templateCommit}`,
    `cliVersion: ${CLI_VERSION}`,
    '',
    '# entries: <status> <classification> <resolution> <path>',
  ];

  for (const entry of entries) {
    lines.push(`${entry.status} ${entry.classification} applied ${entry.path}`);
  }

  // Encode prior state JSON as base64 for rollback
  const priorJson = JSON.stringify(state, null, 2);
  const priorBase64 = Buffer.from(priorJson).toString('base64');
  lines.push('');
  lines.push(`PRIOR_STATE_JSON_BASE64:${priorBase64}`);

  fs.writeFileSync(path.join(backupDir, 'RESTORE.txt'), `${lines.join('\n')}\n`);
}

/**
 * Apply a single resolution to a delta entry.
 * ALWAYS backs up the existing local file BEFORE any write/delete (pre-write backup).
 *
 * Resolutions:
 *   - 'theirs': write template-new blob bytes to local path (raw upstream bytes)
 *   - 'mine':   no-op (local file already preserved)
 *   - 'skip':   no-op
 *   - 'delete': rmSync local file (after backup)
 *   - 'keep':   no-op (deleted-upstream file kept locally)
 *
 * dryRun: when true, logs what would happen but makes no FS writes.
 */
async function applyResolution(
  entry: DeltaEntry,
  resolution: Resolution,
  templateDir: string,
  localRepoRoot: string,
  backupDir: string,
  dryRun = false,
): Promise<void> {
  const localPath = path.join(localRepoRoot, entry.path);

  // Pre-write backup for destructive resolutions (pre-write — before any mutation)
  if (!dryRun && (resolution === 'theirs' || resolution === 'delete') && fs.existsSync(localPath)) {
    const backupPath = path.join(backupDir, entry.path);
    fs.mkdirSync(path.join(backupPath, '..'), { recursive: true });
    fs.cpSync(localPath, backupPath);
  }

  try {
    switch (resolution) {
      case 'theirs': {
        if (!entry.templateNewSha) {
          throw new Error(`Sin templateNewSha para ${entry.path} — no se puede aplicar 'theirs'`);
        }
        if (dryRun) {
          logInfo(`[dry-run] aplicaría: ${entry.path}`);
          break;
        }
        // Write raw upstream bytes (not normalized)
        const templateBytes = execSync(
          `git -C "${templateDir}" show ${entry.templateNewSha}`,
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        fs.mkdirSync(path.join(localPath, '..'), { recursive: true });
        fs.writeFileSync(localPath, templateBytes);
        logSuccess(`Aplicado: ${entry.path}`);
        break;
      }
      case 'mine':
        logInfo(`Conservado (mine): ${entry.path}`);
        break;
      case 'skip':
        logInfo(`Saltado: ${entry.path}`);
        break;
      case 'delete':
        if (dryRun) {
          logInfo(`[dry-run] eliminaría: ${entry.path}`);
          break;
        }
        fs.rmSync(localPath, { force: true });
        logSuccess(`Eliminado: ${entry.path}`);
        break;
      case 'keep':
        logInfo(`Conservado (eliminado upstream, mantenido localmente): ${entry.path}`);
        break;
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`applyResolution falló para ${entry.path} (${resolution}): ${msg}`);
  }
}

// ============================================================================
// DIFF RENDERING
// ============================================================================

/**
 * Render a colorized unified diff of template changes: template-old → template-new.
 * For status=A (no old blob), uses the empty-tree SHA as the old side.
 */
function renderTemplateDiff(entry: DeltaEntry, repoDir: string): string {
  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const oldRef = entry.templateOldSha || EMPTY_TREE;
  const newRef = entry.templateNewSha || EMPTY_TREE;

  try {
    return execSync(
      `git -C "${repoDir}" diff --color=always ${oldRef} ${newRef}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString();
  }
  catch {
    return `(could not render template diff for ${entry.path})\n`;
  }
}

/**
 * Render a colorized unified diff of local changes: template-old → local-current.
 * Writes the template-old blob to a tmp file, then uses `git diff --no-index`.
 * ALWAYS cleans up the tmp file in a finally block (Design Risk #9).
 */
function renderLocalDiff(entry: DeltaEntry, repoDir: string, localRepoRoot: string): string {
  const localPath = path.join(localRepoRoot, entry.path);

  if (!fs.existsSync(localPath)) {
    return `(local file does not exist: ${entry.path})\n`;
  }

  if (!entry.templateOldSha) {
    // No old blob (e.g. A status with local collision) — diff empty → local
    return `(no template-old blob available for ${entry.path})\n`;
  }

  const tmpPath = path.join(os.tmpdir(), `upex-diff-old-${process.pid}-${Date.now()}`);

  try {
    // Write template-old blob to tmp file
    const blobBytes = execSync(
      `git -C "${repoDir}" show ${entry.templateOldSha}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    fs.writeFileSync(tmpPath, blobBytes);

    try {
      return execSync(
        `git diff --no-index --color=always "${tmpPath}" "${localPath}"`,
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ).toString();
    }
    catch (diffErr) {
      // git diff --no-index exits non-zero when files differ — that's expected
      // Extract stdout from the error object
      const err = diffErr as { stdout?: Buffer | string };
      if (err.stdout) {
        return err.stdout.toString();
      }
      return `(could not render local diff for ${entry.path})\n`;
    }
  }
  catch {
    return `(could not retrieve template-old blob for ${entry.path})\n`;
  }
  finally {
    // Always clean up tmp file regardless of success or failure
    try {
      fs.rmSync(tmpPath, { force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Print both diffs with clear section headers.
 * Used before the per-file resolution prompt.
 */
function printPairedDiffs(entry: DeltaEntry, repoDir: string, localRepoRoot: string): void {
  console.log('');
  console.log(`${colors.bold}${colors.cyan}=== Cambios upstream (template-old → template-new) ===${colors.reset}`);
  const templateDiff = renderTemplateDiff(entry, repoDir);
  if (templateDiff.trim()) {
    console.log(templateDiff);
  }
  else {
    console.log(`${colors.dim}  (sin salida de diff)${colors.reset}`);
  }

  console.log(`${colors.bold}${colors.cyan}=== Tus cambios locales (template-old → local-actual) ===${colors.reset}`);
  const localDiff = renderLocalDiff(entry, repoDir, localRepoRoot);
  if (localDiff.trim()) {
    console.log(localDiff);
  }
  else {
    console.log(`${colors.dim}  (sin salida de diff — los archivos pueden ser idénticos)${colors.reset}`);
  }
  console.log('');
}

// ============================================================================
// INTERACTIVE SELECTION UI
// ============================================================================

/**
 * Present a checkbox menu for user selection of changed files.
 *
 * Row format: `[M] path/to/file.ts  +12/-3` or `[M!] path/to/file.ts  +12/-3` for diverged.
 * [D] rows default to unchecked. All rows default to unchecked.
 * Group separators are inserted between components for visual segmentation.
 *
 * Returns the array of checked DeltaEntry objects.
 */
async function selectFilesInteractive(entries: DeltaEntry[]): Promise<DeltaEntry[]> {
  const { checkbox, Separator } = await import('@inquirer/prompts');

  // Filter: exclude unchanged and binary-skip (binary-skip warned separately upstream)
  const visible = entries.filter(
    e => e.classification !== 'unchanged' && e.classification !== 'binary-skip',
  );

  if (visible.length === 0) {
    logInfo('No hay archivos para actualizar.');
    return [];
  }

  // Build choices with component group separators
  interface CheckboxChoice { name: string, value: DeltaEntry, checked: boolean }
  const choices: (CheckboxChoice | InstanceType<typeof Separator>)[] = [];

  let lastComponent = '';
  for (const entry of visible) {
    if (entry.component !== lastComponent) {
      if (lastComponent !== '') {
        choices.push(new Separator());
      }
      choices.push(new Separator(`── ${entry.component} ──`));
      lastComponent = entry.component;
    }

    const badge = entry.classification === 'locally-diverged' ? `${entry.status}!` : entry.status;
    const stats = `  +${entry.added}/-${entry.removed}`;
    const label = `[${badge}] ${entry.path}${stats}`;

    choices.push({
      name: label,
      value: entry,
      // D rows default unchecked; all others also default unchecked per spec
      checked: false,
    });
  }

  const selected = await checkbox<DeltaEntry>({
    message: 'Selecciona archivos a sincronizar: (ESPACIO para marcar, ENTER para confirmar)',
    choices,
  });

  return selected;
}

// ============================================================================
// PER-FILE RESOLUTION
// ============================================================================

/**
 * Show paired diffs and prompt the user for a resolution on a locally-diverged file.
 * Prompt: `[t]heirs / [m]ine / [s]kip (predeterminado: skip): `
 * Default is skip (per Capability 6 — default action = skip).
 * Re-prompts on invalid input.
 */
async function resolveDivergedFile(
  entry: DeltaEntry,
  templateDir: string,
  localRepoRoot: string,
): Promise<Resolution> {
  printPairedDiffs(entry, templateDir, localRepoRoot);

  while (true) {
    const answer = await nativePrompt(
      `${colors.bold}${colors.cyan}[t]heirs / [m]ine / [s]kip${colors.reset} (predeterminado: skip): `,
    );

    if (answer === '' || answer === 's' || answer === 'skip') {
      return 'skip';
    }
    if (answer === 't' || answer === 'theirs') {
      return 'theirs';
    }
    if (answer === 'm' || answer === 'mine') {
      return 'mine';
    }

    logWarning(`Entrada inválida '${answer}'. Ingresa t (theirs), m (mine) o s (skip).`);
  }
}

/**
 * Prompt for explicit deletion confirmation on a deleted-upstream file.
 * Prompt: `¿Eliminar <path> localmente? [y/N]: ` with default N.
 * Returns 'delete' on y/Y; 'keep' on N/n/Enter.
 */
async function confirmDeletion(entry: DeltaEntry): Promise<Resolution> {
  const answer = await nativePrompt(
    `${colors.yellow}¿Eliminar ${entry.path} localmente?${colors.reset} [y/N]: `,
  );

  if (answer === 'y' || answer === 'yes') {
    return 'delete';
  }
  return 'keep';
}

// ============================================================================
// AUTO / CI MODE
// ============================================================================

/**
 * Returns true if the CLI should run in non-interactive (auto/CI) mode.
 * Checks: --auto flag, CI env var, or stdin is not a TTY.
 */
function isNonInteractive(args: ParsedArgs): boolean {
  if (args.auto) { return true; }
  if (process.env.CI === 'true') { return true; }
  if (!process.stdin.isTTY) { return true; }
  return false;
}

/**
 * Build the auto-mode apply plan from a set of delta entries.
 *
 * Rules (Capability 7):
 *   - clean-fastforward → apply 'theirs'
 *   - new-upstream      → apply 'theirs'
 *   - locally-diverged  → skip (not a CI error per OQ #4)
 *   - deleted-upstream  → deferred (NEVER delete in auto mode)
 *   - binary-skip       → skip
 *   - unchanged         → excluded (filtered upstream)
 */
function planAuto(entries: DeltaEntry[]): { plan: AppliedFile[], deferred: DeltaEntry[] } {
  const plan: AppliedFile[] = [];
  const deferred: DeltaEntry[] = [];

  for (const entry of entries) {
    switch (entry.classification) {
      case 'clean-fastforward':
      case 'new-upstream':
        plan.push({ entry, resolution: 'theirs' });
        break;
      case 'locally-diverged':
        plan.push({ entry, resolution: 'skip' });
        break;
      case 'deleted-upstream':
        deferred.push(entry);
        break;
      case 'binary-skip':
        plan.push({ entry, resolution: 'skip' });
        break;
      case 'unchanged':
        // Should not appear here — filtered upstream
        break;
    }
  }

  return { plan, deferred };
}

/**
 * Execute the auto-mode pipeline: apply plan, print summary table.
 * Exits 0 always (diverged skips are not CI errors per OQ #4).
 */
async function runAuto(
  entries: DeltaEntry[],
  templateDir: string,
  localRepoRoot: string,
  backupDir: string,
  state: SyncStateV6,
  args: ParsedArgs,
): Promise<RunSummary> {
  const { plan, deferred } = planAuto(entries);

  const applied: AppliedFile[] = [];
  const skipped: DeltaEntry[] = [];
  const failed: FailedFile[] = [];

  for (const item of plan) {
    if (item.resolution === 'skip') {
      logInfo(`[saltado] localmente divergente: ${item.entry.path}`);
      skipped.push(item.entry);
      continue;
    }

    if (args.dryRun) {
      logInfo(`[dry-run] aplicaría: ${item.entry.path}`);
      applied.push(item);
      continue;
    }

    try {
      await applyResolution(item.entry, item.resolution, templateDir, localRepoRoot, backupDir, args.dryRun);
      applied.push(item);
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Error aplicando ${item.entry.path}: ${msg}`);
      failed.push({ entry: item.entry, reason: msg });
    }
  }

  for (const entry of deferred) {
    logInfo(`[conservado] eliminado upstream (auto conserva locales): ${entry.path}`);
  }

  // Print summary table
  const appliedCount = applied.length;
  const skippedCount = skipped.length;
  const keptDeletedCount = deferred.length;
  const failedCount = failed.length;

  console.log('');
  console.log(`${colors.bold}${colors.cyan}  Resumen de sincronización${colors.reset}`);
  console.log(`${colors.dim}  ┌──────────────────┬───────┐${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.bold}Estado           ${colors.reset}${colors.dim}│${colors.reset} ${colors.bold}Total${colors.reset}${colors.dim} │${colors.reset}`);
  console.log(`${colors.dim}  ├──────────────────┼───────┤${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.green}Aplicados        ${colors.reset}${colors.dim}│${colors.reset}   ${String(appliedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.yellow}Saltados         ${colors.reset}${colors.dim}│${colors.reset}   ${String(skippedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.dim}Conservados-del. ${colors.reset}${colors.dim}│${colors.reset}   ${String(keptDeletedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${failedCount > 0 ? colors.red : colors.dim}Con error        ${colors.reset}${colors.dim}│${colors.reset}   ${String(failedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  └──────────────────┴───────┘${colors.reset}`);
  console.log('');

  if (deferred.length > 0) {
    logInfo('Archivos eliminados upstream (requieren confirmación interactiva):');
    for (const entry of deferred) {
      console.log(`${colors.dim}  ${entry.path}${colors.reset}`);
    }
    console.log('');
  }

  // Determine which components advanced (no skips or failures for that component)
  const allEntryComponents = new Set([
    ...applied.map(a => a.entry.component),
    ...skipped.map(s => s.component),
    ...failed.map(f => f.entry.component),
    ...deferred.map(d => d.component),
  ]);
  const blockedComponents = new Set([
    ...skipped.map(s => s.component),
    ...failed.map(f => f.entry.component),
  ]);
  const componentsAdvanced = [...allEntryComponents].filter(c => !blockedComponents.has(c));
  const componentsHeldBack = [...blockedComponents];

  return {
    applied,
    skipped,
    failed,
    newHeadSha: '', // filled in by caller
    componentsAdvanced,
    componentsHeldBack,
  };
}

// ============================================================================
// INTERACTIVE PLAN
// ============================================================================

/**
 * Orchestrate the full interactive per-file pipeline.
 *
 * Steps:
 *   1. selectFilesInteractive → user picks files
 *   2. For each selected entry:
 *      - clean-fastforward / new-upstream → resolution: 'theirs'
 *      - locally-diverged → resolveDivergedFile()
 *      - deleted-upstream → confirmDeletion()
 *   3. Unchecked entries → push to summary.skipped (as DeltaEntry[])
 *
 * Returns RunSummary (partial — newHeadSha filled in by caller).
 *
 * NOTE: RunSummary.skipped is DeltaEntry[] (dev schema), not AppliedFile[] (QA schema).
 */
async function planInteractive(
  entries: DeltaEntry[],
  templateDir: string,
  localRepoRoot: string,
  backupDir: string,
  state: SyncStateV6,
  args: ParsedArgs,
): Promise<RunSummary> {
  const selected = await selectFilesInteractive(entries);
  const selectedPaths = new Set(selected.map(e => e.path));

  const applied: AppliedFile[] = [];
  const skipped: DeltaEntry[] = [];
  const failed: FailedFile[] = [];

  // Unchecked entries are skipped
  for (const entry of entries.filter(
    e => e.classification !== 'unchanged' && e.classification !== 'binary-skip',
  )) {
    if (!selectedPaths.has(entry.path)) {
      skipped.push(entry);
    }
  }

  // For each selected entry, determine resolution and apply
  for (const entry of selected) {
    if (entry.classification === 'clean-fastforward' || entry.classification === 'new-upstream') {
      if (args.dryRun) {
        logInfo(`[dry-run] aplicaría: ${entry.path}`);
        applied.push({ entry, resolution: 'theirs' });
      }
      else {
        try {
          await applyResolution(entry, 'theirs', templateDir, localRepoRoot, backupDir, args.dryRun);
          applied.push({ entry, resolution: 'theirs' });
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logError(`Error aplicando ${entry.path}: ${msg}`);
          failed.push({ entry, reason: msg });
        }
      }
    }
    else if (entry.classification === 'locally-diverged') {
      if (args.dryRun) {
        // In dry-run, still prompt so user sees the menu — but resolution is advisory only
        console.log(`${colors.dim}[dry-run] archivo divergente: ${entry.path} — mostrando diff como vista previa...${colors.reset}`);
        const resolution = await resolveDivergedFile(entry, templateDir, localRepoRoot);
        console.log(`${colors.dim}[dry-run] resolvería como: ${resolution}${colors.reset}`);
        applied.push({ entry, resolution });
      }
      else {
        const resolution = await resolveDivergedFile(entry, templateDir, localRepoRoot);
        if (resolution === 'skip') {
          skipped.push(entry);
        }
        else {
          try {
            await applyResolution(entry, resolution, templateDir, localRepoRoot, backupDir, args.dryRun);
            applied.push({ entry, resolution });
          }
          catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logError(`Error aplicando ${entry.path}: ${msg}`);
            failed.push({ entry, reason: msg });
          }
        }
      }
    }
    else if (entry.classification === 'deleted-upstream') {
      if (args.dryRun) {
        console.log(`${colors.dim}[dry-run] eliminado upstream: ${entry.path} — se preguntaría por confirmación${colors.reset}`);
        applied.push({ entry, resolution: 'delete' });
      }
      else {
        const resolution = await confirmDeletion(entry);
        if (resolution === 'keep') {
          skipped.push(entry);
        }
        else {
          try {
            await applyResolution(entry, 'delete', templateDir, localRepoRoot, backupDir, args.dryRun);
            applied.push({ entry, resolution: 'delete' });
          }
          catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logError(`Error eliminando ${entry.path}: ${msg}`);
            failed.push({ entry, reason: msg });
          }
        }
      }
    }
  }

  // Print summary table
  const appliedCount = applied.length;
  const skippedCount = skipped.length;
  const failedCount = failed.length;

  console.log('');
  console.log(`${colors.bold}${colors.cyan}  Resumen de sincronización interactiva${colors.reset}`);
  console.log(`${colors.dim}  ┌──────────────────┬───────┐${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${colors.bold}Estado           ${colors.reset}${colors.dim}│${colors.reset} ${colors.bold}Total${colors.reset}${colors.dim} │${colors.reset}`);
  console.log(`${colors.dim}  ├──────────────────┼───────┤${colors.reset}`);
  if (args.dryRun) {
    console.log(`${colors.dim}  │${colors.reset} ${colors.green}Aplicados (sim.) ${colors.reset}${colors.dim}│${colors.reset}   ${String(appliedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  }
  else {
    console.log(`${colors.dim}  │${colors.reset} ${colors.green}Aplicados        ${colors.reset}${colors.dim}│${colors.reset}   ${String(appliedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  }
  console.log(`${colors.dim}  │${colors.reset} ${colors.yellow}Saltados         ${colors.reset}${colors.dim}│${colors.reset}   ${String(skippedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  │${colors.reset} ${failedCount > 0 ? colors.red : colors.dim}Con error        ${colors.reset}${colors.dim}│${colors.reset}   ${String(failedCount).padStart(2)}  ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}  └──────────────────┴───────┘${colors.reset}`);
  console.log('');

  // Determine which components advanced
  const allEntryComponents = new Set([
    ...applied.map(a => a.entry.component),
    ...skipped.map(s => s.component),
    ...failed.map(f => f.entry.component),
  ]);
  const blockedComponents = new Set([
    ...skipped.map(s => s.component),
    ...failed.map(f => f.entry.component),
  ]);
  const componentsAdvanced = [...allEntryComponents].filter(c => !blockedComponents.has(c));
  const componentsHeldBack = [...blockedComponents];

  // Unused param (state referenced in future M4 wiring for v5→v6 migration context)
  void state;

  return {
    applied,
    skipped,
    failed,
    newHeadSha: '', // filled in by caller
    componentsAdvanced,
    componentsHeldBack,
  };
}

// ============================================================================
// BOOTSTRAP PATH
// ============================================================================

/**
 * First-run bootstrap — called when `.template/boilerplate.lock.json` is absent OR when a
 * component has no `perComponentCommit` entry (i.e. it has never been delta-synced).
 *
 * Strategy (Capability 9):
 *   - For `type: 'directory'` components: delegate to the existing `mergeDirectory()`
 *     bulk-copy primitive (srcDir → destDir). This is the original "intelligent merge"
 *     behaviour — it does NOT overwrite bootstrapOnly files because the individual
 *     file-write guard below filters them before calling applyResolution.
 *   - For `type: 'file-list'` or `'mixed'` components: iterate `component.files` and
 *     per-path copy via `applyResolution` with resolution `'theirs'`.
 *   - `bootstrapOnly` files (or files in `AGENTS_BOOTSTRAP_FILES` for the `agents`
 *     component): only copy if the local file is MISSING — never overwrite user values.
 *
 * After all components are processed, the caller MUST call `advanceSyncState` and
 * `writeSyncState` to persist the initial v6 state with `perComponentCommit` entries
 * set to the template HEAD SHA for every successfully bootstrapped component.
 *
 * SUBSET INVARIANT: when `components` is a subset of ALL COMPONENTS (e.g. a single
 * re-bootstrap), only the provided components are touched.
 *
 * @param templateDir   Absolute path to the partial-clone temp directory.
 * @param components    Components to bootstrap (may be a subset of COMPONENTS).
 * @param localRepoRoot Absolute path to the consumer repo root (process.cwd()).
 * @param backupDir     Timestamped backup directory created by the caller.
 * @param dryRun        When true, log what would be copied without writing anything.
 * @returns             RunSummary with applied/skipped/failed.
 */
async function runBootstrapForComponents(
  templateDir: string,
  components: Component[],
  localRepoRoot: string,
  backupDir: string,
  dryRun: boolean,
): Promise<RunSummary> {
  const applied: AppliedFile[] = [];
  const skipped: DeltaEntry[] = [];
  const failed: FailedFile[] = [];
  const componentsAdvanced: string[] = [];
  const componentsHeldBack: string[] = [];

  for (const component of components) {
    logWarning(
      `Bootstrap para componente "${component.name}": sin historial SHA.\n`
      + '   Sincronizando todos los archivos. Cambios locales podrían sobrescribirse.\n'
      + '   Ejecuta `git diff HEAD` para revisar los cambios.',
    );

    // Collect all relative paths for this component from the template clone
    const filesToSync: string[] = [];

    // For file-list components, `files` are basenames within `paths[0]` (or
    // root when `paths[0] === '.'`). Resolve to repo-root-relative paths so
    // the template lookup hits the actual file location.
    const componentPaths = component.type === 'file-list'
      ? (component.files ?? []).map((f) => {
          const root = component.paths[0];
          return root === '.' || root === undefined ? f : path.join(root, f);
        })
      : component.paths;

    for (const componentPath of componentPaths) {
      const srcPath = path.join(templateDir, componentPath);
      if (!fs.existsSync(srcPath)) {
        logWarning(`Bootstrap: ruta "${componentPath}" no encontrada en template — omitiendo.`);
        continue;
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        // Walk directory recursively to collect relative paths
        const walkDir = (dir: string): void => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            }
            else {
              // Convert absolute path to repo-relative POSIX path
              const relPath = fullPath.slice(templateDir.length + 1).replace(/\\/g, '/');
              filesToSync.push(relPath);
            }
          }
        };
        walkDir(srcPath);
      }
      else {
        filesToSync.push(componentPath);
      }
    }

    if (filesToSync.length === 0) {
      logInfo(`Bootstrap: no se encontraron archivos para el componente "${component.name}" — omitiendo.`);
      continue;
    }

    let componentFailed = false;

    for (const relPath of filesToSync) {
      // bootstrapOnly guard: skip file if local already exists
      const isBootstrapFile = component.bootstrapOnly === true
        || (component.name === 'agents' && AGENTS_BOOTSTRAP_FILES.some(f => relPath.endsWith(f)));

      if (isBootstrapFile) {
        const localPath = path.join(localRepoRoot, relPath);
        if (fs.existsSync(localPath)) {
          // Already present locally — never overwrite user-filled bootstrap values
          const syntheticSkip: DeltaEntry = {
            component: component.name,
            path: relPath,
            status: 'M',
            fromSha: '',
            toSha: '',
            added: 0,
            removed: 0,
            isBinary: false,
            templateOldSha: null,
            templateNewSha: null,
            classification: 'unchanged',
          };
          skipped.push(syntheticSkip);
          continue;
        }
        // Local file missing → fall through to copy below (new-upstream)
      }

      // Resolve the template blob SHA for this file (for perComponentCommit init)
      let templateNewSha = '';
      try {
        const lsOutput = execSync(
          `git -C "${templateDir}" ls-tree HEAD -- "${relPath}"`,
          { stdio: ['pipe', 'pipe', 'pipe'] },
        ).toString().trim();
        if (lsOutput) {
          // Format: <mode> blob <sha>\t<path>
          const parts = lsOutput.split(/\s+/);
          templateNewSha = parts[2] ?? '';
        }
      }
      catch {
        // ls-tree failure is non-fatal — we still attempt the copy
      }

      // Build a synthetic DeltaEntry for applyResolution
      const syntheticEntry: DeltaEntry = {
        component: component.name,
        path: relPath,
        status: 'A',
        fromSha: '',
        toSha: templateNewSha,
        added: 0,
        removed: 0,
        isBinary: false,
        templateOldSha: null,
        templateNewSha: templateNewSha || null,
        classification: 'new-upstream',
      };

      if (dryRun) {
        logInfo(`[dry-run bootstrap] se sincronizaría: ${relPath}`);
        skipped.push(syntheticEntry);
        continue;
      }

      try {
        await applyResolution(syntheticEntry, 'theirs', templateDir, localRepoRoot, backupDir);
        applied.push({ entry: syntheticEntry, resolution: 'theirs' });
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Bootstrap falló al sincronizar ${relPath}: ${msg}`);
        failed.push({ entry: syntheticEntry, reason: msg });
        componentFailed = true;
      }
    }

    if (!componentFailed && !dryRun) {
      componentsAdvanced.push(component.name);
    }
    else if (componentFailed) {
      componentsHeldBack.push(component.name);
    }
  }

  return {
    applied,
    skipped,
    failed,
    newHeadSha: '', // filled in by caller
    componentsAdvanced,
    componentsHeldBack,
  };
}

// ============================================================================
// SYNC-STATE WRITEBACK
// ============================================================================

/**
 * Suggest a semantic commit message post-sync (Capability 13).
 * Printed as advisory — never auto-committed.
 */
function suggestCommitMessage(summary: RunSummary): string {
  return `chore(boilerplate): sync to ${summary.newHeadSha.slice(0, 7)}`;
}

/**
 * Pure function — advances perComponentCommit SHAs based on the run summary.
 *
 * Rules (Capability 1 / OQ #2):
 *   - For each component that appeared in the delta:
 *     - If ANY entry in summary.skipped or summary.failed belongs to that component
 *       → keep prior perComponentCommit[component] (SHA holds; re-offered on next run)
 *     - Else → advance to newHeadSha
 *   - Components untouched this run → prior value preserved
 *   - Top-level templateCommit advances to newHeadSha ONLY if ALL components advanced
 */
function advanceSyncState(
  prior: SyncStateV6,
  summary: RunSummary,
  components: readonly Component[],
  newHeadSha: string,
): SyncStateV6 {
  const next: SyncStateV6 = {
    ...prior,
    lastSync: new Date().toISOString(),
    cliVersion: CLI_VERSION,
    perComponentCommit: { ...prior.perComponentCommit },
  };

  // Advance SHAs per componentsAdvanced list
  const advancedSet = new Set(summary.componentsAdvanced);
  for (const name of advancedSet) {
    next.perComponentCommit[name] = newHeadSha;
  }

  // Top-level templateCommit advances only if every component advanced
  const allAdvanced = components.every(
    c => next.perComponentCommit[c.name] === newHeadSha,
  );
  next.templateCommit = allAdvanced ? newHeadSha : prior.templateCommit;

  return next;
}

// ============================================================================
// VARIABLE DETECTION
// ============================================================================

function detectUnfilledVariables(): void {
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    return;
  }

  const claudeContent = fs.readFileSync(claudeMdPath, 'utf-8');

  if (!claudeContent.includes('## Project Variables')) {
    return;
  }

  const definedVars = new Map<string, string>();
  const varLineRegex = /`\{\{([A-Z][A-Z_]+)\}\}`/;

  for (const line of claudeContent.split('\n')) {
    const varMatch = varLineRegex.exec(line);
    if (!varMatch) { continue; }

    const cells = line.split('|').map(c => c.trim());
    if (cells.length >= 4) {
      definedVars.set(varMatch[1], cells[3]);
    }
  }

  if (definedVars.size === 0) {
    return;
  }

  const VARIABLE_REGEX = /\{\{([A-Z][A-Z_]+)\}\}/g;
  const syncedDirs = ['.claude/skills', '.claude/commands', '.context/guidelines', 'docs'];
  const varUsage = new Map<string, number>();

  for (const dir of syncedDirs) {
    const files = collectFiles(dir);
    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.ts') && !file.endsWith('.json')) { continue; }

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const varsInFile = new Set<string>();

        for (const varMatch of content.matchAll(VARIABLE_REGEX)) {
          varsInFile.add(varMatch[1]);
        }

        for (const varName of varsInFile) {
          varUsage.set(varName, (varUsage.get(varName) || 0) + 1);
        }
      }
      catch {
        // Skip unreadable files
      }
    }
  }

  if (varUsage.size === 0) {
    return;
  }

  const PLACEHOLDER_PATTERNS = ['[', 'example', 'myproject', 'localhost', 'company.atlassian'];
  const unfilled: { name: string, files: number }[] = [];
  const filled: { name: string, files: number }[] = [];

  for (const [varName, fileCount] of varUsage) {
    const value = definedVars.get(varName) || '';
    const isPlaceholder = !value
      || PLACEHOLDER_PATTERNS.some(p => value.toLowerCase().includes(p));

    if (isPlaceholder) {
      unfilled.push({ name: varName, files: fileCount });
    }
    else {
      filled.push({ name: varName, files: fileCount });
    }
  }

  if (unfilled.length === 0) {
    return;
  }

  console.log('');
  logWarning('Variables necesitan configuracion en CLAUDE.md:\n');

  const maxNameLen = Math.max(...[...unfilled, ...filled].map(v => v.name.length + 4));
  const header = `   ${'Variable'.padEnd(maxNameLen + 2)}${'Usado en'.padEnd(12)}Estado`;
  console.log(`${colors.dim}${header}${colors.reset}`);
  console.log(`${colors.dim}   ${'─'.repeat(maxNameLen + 2 + 12 + 15)}${colors.reset}`);

  for (const v of unfilled) {
    const varStr = `{{${v.name}}}`.padEnd(maxNameLen + 2);
    const filesStr = `${v.files} archivo${v.files > 1 ? 's' : ''}`.padEnd(12);
    console.log(`   ${colors.yellow}${varStr}${colors.reset}${filesStr}${colors.yellow}⚠ Aun placeholder${colors.reset}`);
  }
  for (const v of filled) {
    const varStr = `{{${v.name}}}`.padEnd(maxNameLen + 2);
    const filesStr = `${v.files} archivo${v.files > 1 ? 's' : ''}`.padEnd(12);
    console.log(`   ${colors.green}${varStr}${colors.reset}${filesStr}${colors.green}✓ Configurado${colors.reset}`);
  }

  console.log('');
  logInfo('Abre CLAUDE.md y completa la tabla de Project Variables.');
}

// ============================================================================
// MIGRATION DETECTION
// ============================================================================

function checkMigrationNeeded(): void {
  const syncVersion = readSyncVersion();
  if (syncVersion && syncVersion.variableSystemVersion) {
    return;
  }

  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    return;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');

  if (content.includes('## Project Variables')) {
    return;
  }

  console.log(`
${colors.yellow}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.yellow}║${colors.reset}${colors.bold}                      UPGRADE NOTICE                        ${colors.reset}${colors.yellow}║${colors.reset}
${colors.yellow}╠══════════════════════════════════════════════════════════════╣${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  Este template ahora usa ${colors.cyan}Project Variables${colors.reset}.                 ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  Todos los prompts usan ${colors.cyan}{{VARIABLE}}${colors.reset} placeholders que       ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  se resuelven desde tu configuracion en CLAUDE.md.           ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  ${colors.bold}DESPUES${colors.reset} de que esta actualizacion termine, ejecuta:        ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}    ${colors.green}/sync-ai-memory${colors.reset}                                         ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  Esto actualizara tu CLAUDE.md con la nueva tabla de         ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}  variables y lo configurara para tu proyecto.                ${colors.yellow}║${colors.reset}
${colors.yellow}║${colors.reset}                                                            ${colors.yellow}║${colors.reset}
${colors.yellow}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

// ============================================================================
// POST-SYNC NOTICES
// ============================================================================

interface PackageJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function checkAgentsPackageJsonMigration(): void {
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return;
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
  }
  catch {
    return;
  }

  const expectedScripts: Record<string, string> = {
    'vars:check': 'bun run scripts/lint-vars.ts',
    'jira:sync-fields': 'bun run scripts/sync-jira-fields.ts',
    'jira:check': 'bun run scripts/check-jira-setup.ts',
  };

  const missingScripts: string[] = [];
  for (const [name, command] of Object.entries(expectedScripts)) {
    if (!pkg.scripts || pkg.scripts[name] !== command) {
      missingScripts.push(name);
    }
  }

  const hasYamlDep = Boolean(
    (pkg.dependencies && pkg.dependencies.yaml)
    || (pkg.devDependencies && pkg.devDependencies.yaml),
  );

  if (missingScripts.length === 0 && hasYamlDep) {
    return;
  }

  console.log(`
${colors.yellow}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.yellow}║${colors.reset}${colors.bold}              package.json — ACTUALIZACION MANUAL            ${colors.reset}${colors.yellow}║${colors.reset}
${colors.yellow}╚══════════════════════════════════════════════════════════════╝${colors.reset}

El sistema ${colors.cyan}.agents/${colors.reset} requiere scripts npm y una dependencia que
este CLI no puede agregar automaticamente (tu package.json es
especifico del proyecto y nunca se sobrescribe).
`);

  if (missingScripts.length > 0) {
    console.log(`${colors.bold}Agrega a ${colors.cyan}package.json${colors.reset}${colors.bold} > scripts:${colors.reset}\n`);
    for (const name of missingScripts) {
      console.log(`  ${colors.green}"${name}": "${expectedScripts[name]}"${colors.reset},`);
    }
    console.log('');
  }

  if (!hasYamlDep) {
    console.log(`${colors.bold}Agrega a ${colors.cyan}package.json${colors.reset}${colors.bold} > dependencies:${colors.reset}\n`);
    console.log(`  ${colors.green}"yaml": "^2.8.2"${colors.reset}\n`);
    console.log(`Luego ejecuta: ${colors.cyan}bun install${colors.reset}\n`);
  }

  console.log(`Despues de actualizar, valida la sincronizacion:
  ${colors.cyan}bun run vars:check${colors.reset}      # valida {{VAR}} y {{jira.<slug>}}
  ${colors.cyan}bun run jira:check${colors.reset}      # valida manifest de Jira vs catalogo

Mas detalles en: ${colors.cyan}.agents/README.md${colors.reset}
`);
}

// ============================================================================
// FRAMEWORK GAP ANALYSIS
// ============================================================================

/**
 * Inspect the consumer's `package.json` and surface scripts/deps the framework
 * expects but that are missing locally.
 *
 * Heuristic — only "framework infra" entries are reported, never user scripts:
 *   - A script qualifies if its command matches `bun run (scripts|cli)/<file>`
 *     AND that referenced file actually exists in the upstream template.
 *   - A dependency qualifies if it appears in the template's `dependencies`
 *     and is missing from the consumer's `dependencies` or `devDependencies`.
 *     `devDependencies` are intentionally NOT compared because they belong to
 *     the consumer's toolchain choice.
 *
 * `package.json` itself is never overwritten — the user copies the missing
 * lines manually after reviewing them.
 */
function detectMissingFrameworkScripts(): void {
  const consumerPath = path.join(process.cwd(), 'package.json');
  const templatePath = path.join(TEMP_DIR, 'package.json');

  if (!fs.existsSync(consumerPath) || !fs.existsSync(templatePath)) {
    return;
  }

  let consumer: { scripts?: Record<string, string>, dependencies?: Record<string, string>, devDependencies?: Record<string, string> };
  let template: { scripts?: Record<string, string>, dependencies?: Record<string, string> };

  try {
    consumer = JSON.parse(fs.readFileSync(consumerPath, 'utf-8'));
    template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  }
  catch (err) {
    logWarning(`No se pudo parsear package.json para gap analysis: ${errorMessage(err)}`);
    return;
  }

  const frameworkRefPattern = /bun run ((?:scripts|cli)\/\S+)/;
  const missingScripts: { name: string, command: string }[] = [];

  for (const [name, command] of Object.entries(template.scripts || {})) {
    if (typeof command !== 'string') { continue; }
    const match = frameworkRefPattern.exec(command);
    if (!match) { continue; }

    // Only treat it as framework infra if the referenced file actually exists in the template
    const referencedFile = match[1];
    if (!fs.existsSync(path.join(TEMP_DIR, referencedFile))) { continue; }

    if (!consumer.scripts || !(name in consumer.scripts)) {
      missingScripts.push({ name, command });
    }
  }

  const consumerHasDep = (depName: string): boolean =>
    Boolean(consumer.dependencies?.[depName]) || Boolean(consumer.devDependencies?.[depName]);

  const missingDeps: { name: string, version: string }[] = [];
  for (const [name, version] of Object.entries(template.dependencies || {})) {
    if (typeof version !== 'string') { continue; }
    if (!consumerHasDep(name)) {
      missingDeps.push({ name, version });
    }
  }

  if (missingScripts.length === 0 && missingDeps.length === 0) {
    return;
  }

  console.log('');
  logWarning('Gaps del framework detectados en tu package.json. Agrega manualmente las lineas debajo:\n');

  if (missingScripts.length > 0) {
    console.log(`${colors.bold}  Agregar a "scripts":${colors.reset}`);
    for (const { name, command } of missingScripts) {
      console.log(`    ${colors.green}"${name}"${colors.reset}: ${colors.dim}"${command}"${colors.reset},`);
    }
    console.log('');
  }

  if (missingDeps.length > 0) {
    console.log(`${colors.bold}  Agregar a "dependencies":${colors.reset}`);
    for (const { name, version } of missingDeps) {
      console.log(`    ${colors.green}"${name}"${colors.reset}: ${colors.dim}"${version}"${colors.reset},`);
    }
    console.log('');
  }

  logInfo('Ejecuta `bun install` despues de editar package.json para que los nuevos scripts funcionen.');
}

// ============================================================================
// SYNC SUMMARY
// ============================================================================

function printSyncSummary(totals: MergeResult): void {
  if (totals.errors > 0) {
    logWarning(`Sync finalizado con advertencias: ${totals.success} archivos sincronizados, ${totals.errors} omitidos`);
    logInfo('Revisa las advertencias arriba para detalles. Tu backup esta disponible en .backups/');
  }
  else {
    logSuccess(`${totals.success} archivos sincronizados exitosamente`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Pre-route --update-mcp-template: it's a standalone flow that does its own
  // clone/backup, so we short-circuit before the menu / regular component sync.
  if (args.includes('--update-mcp-template')) {
    const parsed = parseArgs(args);
    if (parsed.help) {
      showHelp();
      process.exit(0);
    }
    if (!parsed.updateMcpTemplate) {
      process.exit(1);
    }
    const result = await updateMcpTemplateForAgent(parsed.updateMcpTemplate);
    printSyncSummary(result);
    return;
  }

  logHeader(`📦 UPEX Boilerplate Updater v${CLI_VERSION}`);
  logInfo('Usando merge inteligente (preserva archivos del usuario)');

  const totals: MergeResult = { success: 0, errors: 0 };
  const addResult = (r: MergeResult): void => { totals.success += r.success; totals.errors += r.errors; };

  if (args.length === 0) {
    const depsReady = await ensureDependencies();
    if (!depsReady) { return; }

    const selected = await showMainMenu();

    if (selected.length === 0) {
      logWarning('No seleccionaste nada. Saliendo...');
      process.exit(0);
    }

    await validatePrerequisites();

    const components = selected.includes('all')
      ? ['docs', 'context', 'docs-mcp', 'scripts', 'cli', 'agents', 'claude', 'vscode', 'husky', 'tooling', 'examples']
      : selected;

    createBackup(components);
    await cloneTemplate();

    checkMigrationNeeded();
    selfUpdate();

    if (selected.includes('all')) {
      addResult(updateDocs());
      addResult(updateContext());
      addResult(updateDocsMcp());
      addResult(updateScripts());
      addResult(updateCli());
      addResult(updateAgents());
      addResult(updateClaude());
      addResult(updateVscode());
      addResult(updateHusky());
      addResult(updateTooling());
      addResult(updateExamples());
      addResult(updateContextEngineering());
    }
    else {
      for (const cmd of selected) {
        if (cmd === 'docs') {
          addResult(updateDocs());
        }
        else if (cmd === 'context') {
          addResult(updateContext());
        }
        else if (cmd === 'docs-mcp') {
          addResult(updateDocsMcp());
        }
        else if (cmd === 'scripts') {
          addResult(updateScripts());
        }
        else if (cmd === 'cli') {
          addResult(updateCli());
        }
        else if (cmd === 'agents') {
          addResult(updateAgents());
        }
        else if (cmd === 'agents-docs') {
          addResult(updateAgentsDocs());
        }
        else if (cmd === 'claude') {
          addResult(updateClaude());
        }
        else if (cmd === 'claude-config') {
          addResult(updateClaudeConfig());
        }
        else if (cmd === 'vscode') {
          addResult(updateVscode());
        }
        else if (cmd === 'husky') {
          addResult(updateHusky());
        }
        else if (cmd === 'tooling') {
          addResult(updateTooling());
        }
        else if (cmd === 'examples') {
          addResult(updateExamples());
        }
      }
    }

    cleanupDeprecatedFiles(components);
    recordSyncVersion(components);
    detectUnfilledVariables();
    if (components.includes('agents') || components.includes('scripts')) {
      checkAgentsPackageJsonMigration();
    }
    detectMissingFrameworkScripts();
    cleanup();
    logHeader('✅ Actualizacion completada!');
    printSyncSummary(totals);
    logInfo('Tus archivos personalizados han sido preservados.');
    return;
  }

  const parsed = parseArgs(args);

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }

  if (parsed.rollback) {
    rollbackFromBackup();
    return;
  }

  // MCP template subsystem — parallel feature, do not route through new flow
  // (already handled above via early short-circuit)

  // git version guard — required for sparse-checkout (M1/M2).
  ensureGitVersion();

  // === NEW BOOTSTRAP + MIGRATION PATH (M4) ===
  // Reads sync state and handles three scenarios BEFORE entering the M2/M3 delta paths:
  //   (a) NULL (file missing)  → bootstrap path: bulk-sync all components, write initial v6 state.
  //   (b) v5 schema detected   → prompt user for migration; accept → in-memory v6 state;
  //                              decline → fall through to legacy flow.
  //   (c) v6 schema            → proceed to M2/M3 auto/interactive paths below.
  const repoRoot = process.cwd();
  let rawState: SyncState | null = null;
  try {
    rawState = readSyncState(repoRoot);
  }
  catch (err) {
    if (err instanceof CorruptStateError) {
      logError(err.message);
      process.exit(1);
    }
    throw err;
  }

  // (a) Bootstrap path: .template/boilerplate.lock.json is missing
  if (rawState === null) {
    console.log('');
    logWarning('⚠  Primera ejecución detectada. No se encontró .template/boilerplate.lock.json.');
    logInfo('Inicializando sincronización del boilerplate...');

    // previewDeprecatedCleanup runs even on bootstrap (before any menu or write)
    previewDeprecatedCleanup(parsed.commands);

    await validatePrerequisites();

    let bootstrapTemplateDir: string;
    try {
      await partialCloneTemplate(TEMPLATE_REPO, TEMP_DIR, buildSparseCheckoutPatterns(COMPONENTS));
      bootstrapTemplateDir = TEMP_DIR;
    }
    catch {
      logWarning('partial clone falló — usando clone shallow legacy');
      await cloneTemplate();
      bootstrapTemplateDir = TEMP_DIR;
    }

    const bootstrapHeadSha = resolveTemplateHeadSha(bootstrapTemplateDir);
    const bootstrapBackupDir = createBackup(COMPONENTS.map(c => c.name));

    const bootstrapSummary = await runBootstrapForComponents(
      bootstrapTemplateDir,
      COMPONENTS,
      repoRoot,
      bootstrapBackupDir,
      parsed.dryRun,
    );
    bootstrapSummary.newHeadSha = bootstrapHeadSha;

    if (parsed.dryRun) {
      logInfo('[dry-run] bootstrap simulado — no se escribirá .template/boilerplate.lock.json');
    }
    else {
      const initialState: SyncStateV6 = {
        schemaVersion: 6,
        lastSync: new Date().toISOString(),
        templateCommit: bootstrapHeadSha,
        cliVersion: CLI_VERSION,
        syncedComponents: bootstrapSummary.componentsAdvanced,
        variableSystemVersion: 1,
        perComponentCommit: {},
      };
      const newState = advanceSyncState(initialState, bootstrapSummary, COMPONENTS, bootstrapHeadSha);
      writeSyncState(repoRoot, newState);

      // Advisory commit message
      logInfo(`Mensaje de commit sugerido: ${suggestCommitMessage(bootstrapSummary)}`);
    }

    logSuccess(
      `Bootstrap completo: ${bootstrapSummary.applied.length} archivos sincronizados${parsed.dryRun ? ' (simulación)' : ''}`,
    );
    cleanup();
    return;
  }

  // (b) v5 schema: prompt for migration before delta flow
  const isV5Schema = (s: SyncState): boolean =>
    !('schemaVersion' in s) || (s as { schemaVersion?: number }).schemaVersion !== 6;

  if (isV5Schema(rawState)) {
    // previewDeprecatedCleanup runs before any migration decision
    previewDeprecatedCleanup(parsed.commands);

    const userConsent = await promptForMigration(rawState as SyncStateV5);
    if (!userConsent) {
      logWarning('Migración cancelada. El CLI permanece en el flujo v5 hasta nueva ejecución.');
      process.exit(0);
    }

    if (parsed.dryRun) {
      logInfo('[dry-run] se migraría a v6 (no se escribirá al disco)');
    }

    // Migrate in-memory; disk write deferred to post-sync writeSyncState
    const migratedState = migrateSyncState(rawState as SyncStateV5);

    // With migration accepted and v6 state in memory, proceed to delta flow.
    // v6 state has empty perComponentCommit → computeDelta treats all files as new;
    // fall through to M2/M3 paths by replacing rawState for isV6WithShas check.
    rawState = migratedState;
  }
  else {
    // (c) v6 schema: preview deprecated cleanup before entering delta flow
    previewDeprecatedCleanup(parsed.commands);
  }
  // === END NEW BOOTSTRAP + MIGRATION PATH (M4) ===

  const isV6WithShas = (s: SyncState | null): s is SyncStateV6 =>
    s !== null
    && 'schemaVersion' in s
    && s.schemaVersion === 6
    && Object.keys(s.perComponentCommit).length > 0;

  // === NEW DELTA-DRIVEN AUTO PATH (M2) ===
  // Only activates when:
  //   1. --auto flag is passed (or CI env / non-TTY stdin makes isNonInteractive true)
  //   2. A v6 sync state with perComponentCommit entries exists on disk
  // If either condition is not met, fall through to the existing legacy flow below.
  if (isNonInteractive(parsed) && isV6WithShas(rawState)) {
    const v6State = rawState;

    await validatePrerequisites();

    // Partial clone template (new delta-driven path)
    let templateDir: string;
    try {
      await partialCloneTemplate(TEMPLATE_REPO, TEMP_DIR, buildSparseCheckoutPatterns(COMPONENTS));
      templateDir = TEMP_DIR;
    }
    catch {
      logWarning('partial clone falló — usando clone shallow legacy');
      await cloneTemplate();
      templateDir = TEMP_DIR;
    }

    const newHeadSha = resolveTemplateHeadSha(templateDir);
    const entries = computeDelta(templateDir, COMPONENTS, v6State);

    const backupDir = createBackup(COMPONENTS.map(c => c.name));

    if (entries.length > 0) {
      appendBackupManifest(backupDir, entries, v6State);
    }

    const summary = await runAuto(entries, templateDir, repoRoot, backupDir, v6State, parsed);
    summary.newHeadSha = newHeadSha;

    // DEPRECATED_FILES cleanup MUST run AFTER applier, BEFORE writeSyncState.
    // Reason: writeSyncState advances component SHAs; running cleanup AFTER
    // would mean next run thinks deprecated files are "new upstream".
    if (!parsed.dryRun) {
      cleanupDeprecatedFiles(parsed.commands);
    }

    if (!parsed.dryRun) {
      const newState = advanceSyncState(v6State, summary, COMPONENTS, newHeadSha);
      writeSyncState(repoRoot, newState);
    }

    // Post-sync notices (existing)
    detectUnfilledVariables();
    checkMigrationNeeded();
    if (parsed.commands.includes('agents') || parsed.commands.includes('scripts') || parsed.commands.length === 0) {
      checkAgentsPackageJsonMigration();
    }
    detectMissingFrameworkScripts();

    // Advisory commit message
    if (!parsed.dryRun && summary.newHeadSha) {
      logInfo(`Mensaje de commit sugerido: ${suggestCommitMessage(summary)}`);
    }

    cleanup();
    return;
  }
  // === END NEW DELTA-DRIVEN AUTO PATH (M2) ===

  // === NEW DELTA-DRIVEN INTERACTIVE PATH (M3) ===
  // Activates when:
  //   1. NOT non-interactive (no --auto, no CI env, TTY stdin)
  //   2. A v6 sync state with perComponentCommit entries exists on disk
  // Falls through to legacy flow if conditions are not met.
  if (!isNonInteractive(parsed) && isV6WithShas(rawState)) {
    const v6State = rawState;

    const depsReady = await ensureDependencies();
    if (!depsReady) { return; }

    await validatePrerequisites();

    // Partial clone template (delta-driven path)
    let templateDir: string;
    try {
      await partialCloneTemplate(TEMPLATE_REPO, TEMP_DIR, buildSparseCheckoutPatterns(COMPONENTS));
      templateDir = TEMP_DIR;
    }
    catch {
      logWarning('partial clone falló — usando clone shallow legacy');
      await cloneTemplate();
      templateDir = TEMP_DIR;
    }

    const newHeadSha = resolveTemplateHeadSha(templateDir);
    const entries = computeDelta(templateDir, COMPONENTS, v6State);

    const backupDir = createBackup(COMPONENTS.map(c => c.name));

    if (entries.length > 0) {
      appendBackupManifest(backupDir, entries, v6State);
    }

    const summary = await planInteractive(entries, templateDir, repoRoot, backupDir, v6State, parsed);
    summary.newHeadSha = newHeadSha;

    // DEPRECATED_FILES cleanup MUST run AFTER applier, BEFORE writeSyncState.
    // Reason: writeSyncState advances component SHAs; running cleanup AFTER
    // would mean next run thinks deprecated files are "new upstream".
    if (!parsed.dryRun) {
      cleanupDeprecatedFiles(parsed.commands);
    }

    if (!parsed.dryRun) {
      const newState = advanceSyncState(v6State, summary, COMPONENTS, newHeadSha);
      writeSyncState(repoRoot, newState);
    }

    // Post-sync notices (existing)
    detectUnfilledVariables();
    checkMigrationNeeded();
    if (parsed.commands.includes('agents') || parsed.commands.includes('scripts') || parsed.commands.length === 0) {
      checkAgentsPackageJsonMigration();
    }
    detectMissingFrameworkScripts();

    // Advisory commit message
    if (!parsed.dryRun && summary.newHeadSha) {
      logInfo(`Mensaje de commit sugerido: ${suggestCommitMessage(summary)}`);
    }

    cleanup();
    return;
  }
  // === END NEW DELTA-DRIVEN INTERACTIVE PATH (M3) ===

  if (parsed.commands.length === 0) {
    logError('No se especifico ningun comando valido');
    showHelp();
    process.exit(1);
  }

  await validatePrerequisites();

  let allMode = false;
  if (parsed.commands.includes('all')) {
    parsed.commands = ['docs', 'context', 'docs-mcp', 'scripts', 'cli', 'agents', 'claude', 'vscode', 'husky', 'tooling', 'examples'];
    allMode = true;
  }

  await cloneTemplate();

  if (parsed.dryRun) {
    executeDryRun(parsed.commands, allMode);
    previewDeprecatedCleanup(parsed.commands);
    cleanup();
    return;
  }

  checkMigrationNeeded();

  createBackup(parsed.commands);

  selfUpdate();

  for (const cmd of parsed.commands) {
    switch (cmd) {
      case 'docs':
        addResult(updateDocs());
        break;
      case 'context':
        addResult(updateContext());
        break;
      case 'docs-mcp':
        addResult(updateDocsMcp());
        break;
      case 'scripts':
        addResult(updateScripts());
        break;
      case 'cli':
        addResult(updateCli());
        break;
      case 'agents':
        addResult(updateAgents());
        break;
      case 'agents-docs':
        addResult(updateAgentsDocs());
        break;
      case 'claude':
        addResult(updateClaude());
        break;
      case 'claude-config':
        addResult(updateClaudeConfig());
        break;
      case 'vscode':
        addResult(updateVscode());
        break;
      case 'husky':
        addResult(updateHusky());
        break;
      case 'tooling':
        addResult(updateTooling());
        break;
      case 'examples':
        addResult(updateExamples());
        break;
    }
  }

  if (allMode) {
    addResult(updateContextEngineering());
  }

  cleanupDeprecatedFiles(parsed.commands);
  recordSyncVersion(parsed.commands);
  detectUnfilledVariables();
  if (parsed.commands.includes('agents') || parsed.commands.includes('scripts')) {
    checkAgentsPackageJsonMigration();
  }
  detectMissingFrameworkScripts();
  cleanup();
  logHeader('✅ Actualizacion completada!');
  printSyncSummary(totals);
  logInfo('Tus archivos personalizados han sido preservados.');
}

main().catch((err: unknown) => {
  logError('Error inesperado:');
  console.error(err);
  process.exit(1);
});
