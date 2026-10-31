#!/usr/bin/env bun
/**
 * @fileoverview UPEX Boilerplate Updater v8 — thin wrapper.
 *
 * Drives the 5-phase delta sync via `runUpdate` in `./lib/updater-core.ts`.
 * Repo-specific concerns (DEV component registry, MCP template subsystem,
 * rollback flag) live here; everything else lives in core.
 */

import type { ReincludeOutcome } from './lib/adopt-gitignore.ts';
import type { CompatibilityCheck } from './lib/agent-compatibility.ts';
import type { UpdaterUi } from './lib/ui/updater-run.ts';
import type { AdoptOutcome } from './lib/updater-adopt.ts';
import type { ProtectedWatchEntry } from './lib/updater-drift';
import type { HarnessMigrationResult } from './lib/updater-harness-migration.ts';
import type { GateResult, HeldBackComponent, ParityFinding, ParityReport } from './lib/updater-parity';
import type { PbiCacheFact } from './lib/updater-pbi';
import type { Component, DeprecatedFile, ReportSink, RunSummary, UpdaterConfig } from './lib/updater-types';
import type { PreflightCheck, PreflightResult } from './preflight.ts';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import * as os from 'node:os';
import * as path from 'node:path';
import pc from 'picocolors';
import { parseEnvFile } from './install';
import { reincludeAgenticStore } from './lib/adopt-gitignore.ts';
import { checkAgentCompatibility, repairAgentSurfaces, SHADOWING_COMMANDS_BACKUP_DIR, SKILLS_ALIAS_DEFERRED_MARKER } from './lib/agent-compatibility.ts';
import { applyInsertions, planInsertions, projectDelta, SCHEMA_FILE, SCHEMA_SOURCE } from './lib/agents-schema.ts';
import { declaredHarnesses, isUnderAny, unusedHarnessPaths } from './lib/harness-selection.ts';
import { collectUpstreamOwned, writeUpstreamOwned } from './lib/tooling-scope.ts';
import * as tui from './lib/tui';
import { startUpdaterUi } from './lib/ui/updater-run.ts';
import { ADOPT_REPO_ONLY_PATTERNS, INSTALLER_LOCK_FILE, isAdopted, runAdopt } from './lib/updater-adopt.ts';
import {
  buildPairedDiff,
  cleanupTempDir,
  createBackupDir,
  isLocalTemplateSource,
  isRepoOnlyPath,
  LAST_APPLY_FILE,
  readSyncState,
  runUpdate,
  suggestCommitMessage,
  UPDATER_UPSTREAM_DIR_ENV,
} from './lib/updater-core';
import { DOCTRINE_FILE, runDoctrineLedger } from './lib/updater-doctrine.ts';
import { detectProtectedDrift, mergeProtectedWatchlist, persistMarkers, readProjectProtectedPaths, splitFirstProjectAdvice } from './lib/updater-drift';
import {
  applyHarnessMigration,
  describeHarnessMigration,
  HARNESS_MIGRATION_RESULT_ENV,
  harnessMigrationTouchedPaths,
  MIGRATION_BACKUP_DIR,
  planHarnessMigration,
  readHarnessMigrationResultFromEnv,
} from './lib/updater-harness-migration.ts';
import { groupIgnoreLines } from './lib/updater-ignore';
import { deliverProjectInstructionsStub, INSTRUCTIONS_DIR, LEGACY_PROJECT_INSTRUCTIONS_FILE, migrateLegacyProjectInstructions, PROJECT_INSTRUCTIONS_FILE, PROJECT_INSTRUCTIONS_TEMPLATE, RENAMED_SECTION_FILES } from './lib/updater-instructions.ts';
import {
  ABORTED_OUTRO,
  archivedSkillsToReport,
  collectParityFindings,
  PARITY_PROMPT_PATH,
  persistArchivedSkillMarkers,
  renderParityReport,
  RETIRED_HARNESS_LAUNCHER,
  runVerdict,
} from './lib/updater-parity';
import { makePbiCacheMigrationHook } from './lib/updater-pbi';
import { CLAUDE_SETTINGS_FILE, formatHookCommand, mergeHookGroups, mergePermissionLists, readDeclinedDenies, readDeclinedHooks } from './lib/updater-settings.ts';
import { DEPRECATED_VARS, parseDotEnvExampleKeys } from './lib/variables-manifest';
import { checkoutRoots } from './lib/worktree.ts';
import { plainMsg, runUpPreflight } from './preflight.ts';

// --- CONFIGURATION ---
// Not tied to the lock schema (`schemaVersion: 7` stays): it stamps the lock's
// `cliVersion` and the ignore-file sentinel header, which is matched by prefix.
const CLI_VERSION = '8.8';
// `UPEX_TEMPLATE_REPO` points the updater at another source: a fork, or a LOCAL
// clone (absolute path / file:// URL, cloned with plain git, no gh session) to
// exercise an unpublished boilerplate branch against a consumer repo.
const TEMPLATE_REPO = process.env.UPEX_TEMPLATE_REPO || 'upex-galaxy/agentic-dev-boilerplate';
const TEMP_DIR = path.join(os.tmpdir(), 'aicode-template-update');
// Where the upstream clone sits while the afterApply hooks read it: our own
// temp dir, or the clone a parent process handed down for the --dry-run
// preview of a pending self-update (see UPDATER_UPSTREAM_DIR_ENV).
const UPSTREAM_DIR = process.env[UPDATER_UPSTREAM_DIR_ENV] || TEMP_DIR;
const VERSION_FILE = '.template/boilerplate.lock.json';
/** Post-apply gates: each gets this long, then it is skipped with a note. */
const GATE_TIMEOUT_MS = 120_000;
/**
 * Scripts run as gates when `package.json` defines them (a missing one is
 * skipped). `skills:check` is here because a release can ship a skill and the
 * vocabulary hunk that makes it lintable in two different files: when the
 * second one is protected, only this gate sees the half-delivered pair (see
 * `PATH_PREREQUISITES` in `./lib/updater-parity.ts`).
 */
export const GATE_SCRIPTS = ['types:check', 'lint:check', 'skills:check'] as const;
/**
 * The same gates on an ADOPTED app: `types:check` / `lint:check` there would
 * judge the app's code by the tooling's rules (or be the app's own scripts),
 * so the tooling's scoped checks run instead, as in `.husky/framework-gates.sh`.
 */
export const ADOPTED_GATE_SCRIPTS = ['tooling:types:check', 'tooling:lint:check', 'skills:check'] as const;

/** Which post-sync gates this repo runs. */
export function gateScriptsFor(adopted: boolean): readonly string[] {
  return adopted ? ADOPTED_GATE_SCRIPTS : GATE_SCRIPTS;
}

/**
 * The line a finished `--adopt` run closes with. The install layer stops here:
 * teaching the agentic layer the app (identity, the `stack:` block, tracker
 * catalogs, protected paths) is the `project-adoption` skill's job, behind its
 * own analysis and approval gate.
 */
export const ADOPT_NEXT_STEP = 'Adopción instalada: nada de la app se sobrescribió. Siguiente: revisa la tabla, commitea la adopción y carga la skill `project-adoption` (`/project-adoption` en Claude Code; en OpenCode y Codex, pídelo por su nombre): analiza la app sin escribir, propone un plan y solo con tu aprobación completa identidad, `stack:` y Jira.';

// `eslint.config.base.js` is the SYNCED half of the lint config: the shared
// options and the `cli/` import-closure block the updater's self-update depends
// on. The project-owned `eslint.config.js` (watchlisted) spreads it.
// `tsconfig.tooling.json` + `eslint.config.tooling.mjs` are the tooling's OWN
// scope (`cli/`, `scripts/`): an adopted app keeps its root `tsconfig.json` and
// ESLint config, so `tooling:types:check` / `tooling:lint:check` (and the
// framework gates on an adopted repo) judge the tooling through these instead.
const TOOLING_FILES = ['.editorconfig', '.prettierrc', '.gitattributes', 'eslint.config.base.js', 'eslint.config.tooling.mjs', 'tsconfig.tooling.json'];
// `agentsFrameworkFiles` overrides bootstrapOnlyPaths for the `agents`
// component: a basename listed here is synced even when the path also matches
// a bootstrap-only entry. Keep it to files the boilerplate genuinely owns.
// The GENERATED schema is plainly SYNCED, never bootstrapOnly: it is
// upstream's template, not the project's identity, and a project must receive
// each release's copy or the back-fill compares it against a template frozen
// at scaffold time and reports nothing to do.
const AGENTS_FRAMEWORK_FILES = ['README.md', 'project.schema.yaml'];
const AGENTS_BOOTSTRAP_FILES = ['project.yaml', 'jira-fields.json', 'jira-workflows.json', 'jira-link-types.json', 'jira-required.yaml'];
// The `agents` component is a file-list of the `.agents/` ROOT on purpose: the
// subtrees (`skills/`, `hooks/`, `compatibility/`) belong to `agent-compatibility`
// and the registry validator rejects two components claiming one path.
const AGENTS_ROOT_FILES = [...AGENTS_FRAMEWORK_FILES, ...AGENTS_BOOTSTRAP_FILES];
// `.claude/settings.json` holds the project's permission allow/deny lists and
// the hook wiring. Component `agent-root-config` delivers it ONCE (bootstrapOnly:
// a project without the file gets upstream's copy, exactly like `.codex/`); once
// present it sits on PROTECTED_WATCHLIST (never overwritten; the parity report
// shows its section diff, and the compatibility check still catches a stale
// hook command).
// `.codex/` is bootstrapOnly: `config.toml` is the Codex MCP registry (the pair of
// `.mcp.json` / `opencode.jsonc`, both on the protected watchlist) and ships ONCE.
// The hook adapter carries no project state and keeps flowing.
const CODEX_FRAMEWORK_FILES = ['hooks.json'];
const CLAUDE_ROOT_CONFIG_FILES = ['settings.json'];
// The gitignored files a Claude Code or Codex-managed worktree copies in.
const WORKTREE_INCLUDE_FILES = ['.worktreeinclude'];
// Orca's committed repo hooks: provision a new worktree, audit it before removal.
const ORCA_CONFIG_FILES = ['orca.yaml'];
// `playwright-cli` session defaults: in memory, headless, no shared profile, so a
// session name is the isolation (sprint-development/references/live-ui-validation.md).
const PLAYWRIGHT_CLI_CONFIG_FILES = ['cli.config.json'];
// The varlock env schema, in two halves: `.env.core.schema` is GENERATED from
// cli/lib/variables-manifest.ts by `bun run vars:schema` and plainly synced;
// `.env.schema` imports it, carries the root decorators and the project's own
// variables, and is delivered ONCE (PROTECTED_WATCHLIST below folds it into
// bootstrapOnlyPaths). Neither file holds a value. `env-template` stays
// alongside: `.env.example` is still the file a human copies into `.env`.
const ENV_SCHEMA_FILES = ['.env.schema', '.env.core.schema'];

/** Canonical cross-harness skill source. Claude consumes it through an alias. */
const SKILLS_CANONICAL_DIR = '.agents/skills';

// Generated surfaces: the sync never delivers, overwrites, or reports these, and
// the afterApply hooks rebuild them from their sources on every run.
//  - CLAUDE.md: the one-line `@AGENTS.md` shim (written by the cross-harness
//    migration for legacy repos, by the scaffold for fresh ones). Its source is
//    AGENTS.md, which IS on the watchlist.
//  - .agents/skills/REGISTRY.md: built by `bun run skills:registry` from the
//    repo's own installed skill set, including local community skills.
// `.claude/skills` (alias) is gitignored and never in upstream, so it needs no
// entry. `.claude/commands` + `.opencode/commands` are the project's own: the
// boilerplate ships no command file (a skill is invoked by name plus mode).
const GENERATED_PATHS = ['CLAUDE.md', `${SKILLS_CANONICAL_DIR}/REGISTRY.md`];

// Project-owned files INSIDE a synced component: each repo keeps its own copy
// and the sync never delivers, overwrites, deletes or reports it. Today only the
// project instructions overlay: the boilerplate's own `agent-project.md` carries this
// repository's exceptions, so a project that has none gets the generic stub
// (`agent-project.md.template`, behind a leak gate) from `makeProjectInstructionsHook`.
// Its pre-rename name, `project.md`, is the same project-owned file: the hook
// moves it to the new name, so the sync never touches it either.
const PROJECT_OWNED_PATHS = [PROJECT_INSTRUCTIONS_FILE, LEGACY_PROJECT_INSTRUCTIONS_FILE];

// One opt-in template per supported host (`.agents/instructions/agent-harnesses.md` section 5.5: three hosts).
export const MCP_TEMPLATE_AGENTS = ['claude', 'opencode', 'codex'] as const;
type McpAgent = typeof MCP_TEMPLATE_AGENTS[number];
export const MCP_TEMPLATE_FILE: Record<McpAgent, string> = {
  claude: 'claude.template.json',
  opencode: 'opencode.template.json',
  codex: 'codex.template.toml',
};

// The command-alias layer is retired: a skill is invoked by its own name plus a
// mode (`/project-context data` on Claude Code, in prose on OpenCode and Codex).
// These are the files upstream generated for it. `cleanupDeprecated` removes
// them without a backup, which is right for wrappers that carried no workflow
// (the compat contract rejected any body). A command the PROJECT declared is
// not here and stays; one that carries a skill's name is moved aside by the
// compat hook instead (`removeShadowingCommands`).
const RETIRED_ALIAS_NAMES = [
  'business-api-map',
  'business-data-map',
  'business-feature-map',
  'dev-roadmap',
  'jira-components',
  'jira-instance-migration',
  'master-implementation-plan',
  'sync-ai-memory',
];
const RETIRED_ALIAS_REASON = 'command aliases retired: invoke the skill by name plus its mode (`.agents/instructions/agent-skills-and-mcps.md` section 5)';
export const RETIRED_COMMAND_WRAPPERS: DeprecatedFile[] = [
  { path: '.agents/compatibility/command-aliases.json', component: 'agent-compatibility', reason: RETIRED_ALIAS_REASON, deprecatedSince: '8.5' },
  ...['.claude/commands', '.opencode/commands'].flatMap(dir => RETIRED_ALIAS_NAMES.map(name => ({
    path: `${dir}/${name}.md`,
    component: 'commands',
    reason: RETIRED_ALIAS_REASON,
    deprecatedSince: '8.5',
  }))),
];

// Skills retired upstream leave here (they sit in a synced component, so
// without this `--auto` would defer their `deleted-upstream` entries and hold
// the component back). `cleanupDeprecated` also removes the folders it empties,
// because a skill folder with no SKILL.md fails skills:check.
const RETIRED_SYNC_REASON = 'skill retired: bun run docs:check gates the skill router and quoted scripts; the docs follow-through lives in agentic-dev-core/references/docs-follow-through.md';
export const RETIRED_SKILL_FILES: DeprecatedFile[] = [
  '.agents/skills/sync-ai-memory/SKILL.md',
  '.agents/skills/sync-ai-memory/references/sync.md',
].map(path => ({ path, component: 'agent-compatibility', reason: RETIRED_SYNC_REASON, deprecatedSince: '8.5' }));

// Docs pages removed upstream. `docs` is a synced directory component, so
// without these `--auto` would defer their `deleted-upstream` entries and hold
// the whole component back.
const RETIRED_HOST_REASON = 'host outside the three-host contract (`.agents/instructions/agent-harnesses.md` section 5.5)';
export const RETIRED_DOCS_FILES: DeprecatedFile[] = [
  ...['docs/setup/mcp/copilot-cli.md', 'docs/setup/mcp/gemini-cli.md', 'docs/setup/mcp/vscode.md', 'docs/mcp/gemini.template.json']
    .map(path => ({ path, component: 'docs', reason: RETIRED_HOST_REASON, deprecatedSince: '8.7' })),
  { path: 'docs/setup/jira-setup-guide.md', component: 'docs', reason: 'Xray test-management setup belongs to the QA boilerplate; dev-side Jira setup is in docs/setup/README.md', deprecatedSince: '8.7' },
  ...['docs/methodology/early-game-testing.md', 'docs/methodology/mid-game-testing.md', 'docs/methodology/late-game-testing.md']
    .map(path => ({ path, component: 'docs', reason: 'QA methodology lives in the QA boilerplate; the dev-to-QA handoff is docs/methodology/IQL-methodology.md', deprecatedSince: '8.7' })),
];

// The instruction sections dropped their number for the `agent-` prefix (same
// frontmatter `id`). The numbered copies leave here, BACKED UP first: a project
// may have edited one. The overlay (`project.md`) is not here: it is moved,
// content kept, by `makeProjectInstructionsHook`.
export const RETIRED_SECTION_FILES: DeprecatedFile[] = Object.entries(RENAMED_SECTION_FILES).map(([from, to]) => ({
  path: `${INSTRUCTIONS_DIR}/${from}`,
  component: 'instructions',
  reason: `renamed to ${INSTRUCTIONS_DIR}/${to} (readable names; the frontmatter id is unchanged)`,
  deprecatedSince: '2026-10-04',
  backup: true,
}));

export const DEPRECATED_FILES: DeprecatedFile[] = [
  { path: '.prompts/setup/kata-framework-setup.md', component: 'prompts', reason: 'renamed to monorepo-for-qa-setup.md', deprecatedSince: '2026-04-28' },
  { path: '.prompts/setup/kata-architecture-adaptation.md', component: 'prompts', reason: 'renamed to test-framework-adaptation.md', deprecatedSince: '2026-04-28' },
  ...RETIRED_COMMAND_WRAPPERS,
  ...RETIRED_SKILL_FILES,
  ...RETIRED_DOCS_FILES,
  ...RETIRED_SECTION_FILES,
];

export const COMPONENTS: Component[] = [
  // One source, three harnesses: skills, the hook emitter and the OpenCode hook
  // adapter. `.claude/skills` is NOT here: it is the generated alias, rebuilt by
  // the afterApply compatibility hook. The `commands` component (the alias
  // wrappers) is retired; a lock that still carries its cursor is harmless,
  // because every walk iterates this list, never the lock's keys.
  { name: 'agent-compatibility', type: 'directory', paths: [SKILLS_CANONICAL_DIR, '.agents/hooks', '.opencode/plugins'] },
  { name: 'codex-config', type: 'directory', paths: ['.codex'], bootstrapOnly: true, frameworkFiles: CODEX_FRAMEWORK_FILES },
  // Delivered once when missing, then project-owned (watchlist). A file-list on
  // the `.claude` root: `.claude/commands` is the project's own (never synced),
  // `.claude/skills` is the generated alias.
  { name: 'agent-root-config', type: 'file-list', paths: ['.claude'], files: CLAUDE_ROOT_CONFIG_FILES, bootstrapOnly: true },
  { name: 'agents', type: 'file-list', paths: ['.agents'], files: AGENTS_ROOT_FILES },
  // The on-demand sections of the project instructions (L1 of progressive
  // disclosure; `AGENTS.md` is the always-on L0, on the watchlist). Shared
  // doctrine, synced like skills: overwritten on update, a project edit backed
  // up and reported, a path in `updater.protected_paths` kept. `agent-project.md` is
  // the project's own (PROJECT_OWNED_PATHS) and never travels.
  { name: 'instructions', type: 'directory', paths: [INSTRUCTIONS_DIR] },
  { name: 'scripts', type: 'directory', paths: ['scripts'] },
  { name: 'cli', type: 'directory', paths: ['cli'] },
  { name: 'docs', type: 'directory', paths: ['docs'] },
  { name: 'context', type: 'directory', paths: ['.context'], bootstrapOnly: true, frameworkFiles: ['README.md'], frameworkFilesExcept: ['.context/ADR/README.md'] },
  { name: 'context-engineering', type: 'file-list', paths: ['.'], files: ['CONTEXT.md'] },
  { name: 'vscode', type: 'directory', paths: ['.vscode'] },
  // `.husky/pre-commit`, `.husky/pre-push` and `.husky/commit-msg` are on
  // PROTECTED_WATCHLIST (the project's gates and their ordering live there):
  // delivered once when missing, never overwritten. Everything else under
  // `.husky/` keeps syncing, which is exactly how `framework-gates.sh` reaches
  // a project scaffolded earlier: the gates upstream owns sit in that synced
  // file, and each hook sources it.
  { name: 'husky', type: 'directory', paths: ['.husky'] },
  { name: 'tooling', type: 'file-list', paths: ['.'], files: TOOLING_FILES },
  // .env.example carries no secrets (every value is empty / placeholder) so it
  // fast-forwards safely to targets. Shipping it is the prerequisite for the
  // env-var drift detection in the afterApply hook — we can only diff a target's
  // .env against an .env.example we actually delivered.
  { name: 'env-template', type: 'file-list', paths: ['.'], files: ['.env.example'] },
  { name: 'env-schema', type: 'file-list', paths: ['.'], files: ENV_SCHEMA_FILES },
  // Delivered once when missing, then project-owned: a project appends its own
  // gitignored inputs (and its own hook lines), and a later sync must not drop
  // them. Without `.worktreeinclude` a Codex-managed worktree starts with no
  // `.env`, and every MCP loader in `.codex/config.toml` with it.
  { name: 'worktree-include', type: 'file-list', paths: ['.'], files: WORKTREE_INCLUDE_FILES, bootstrapOnly: true },
  { name: 'orca-config', type: 'file-list', paths: ['.'], files: ORCA_CONFIG_FILES, bootstrapOnly: true },
  // Delivered once when missing, then project-owned: a project tunes its own
  // viewport, timeouts or test-id attribute, and a later sync must not undo that.
  { name: 'playwright-cli-config', type: 'file-list', paths: ['.playwright'], files: PLAYWRIGHT_CLI_CONFIG_FILES, bootstrapOnly: true },
];

// --- ARG PARSE ---
interface ParsedArgs {
  commands: string[]
  help: boolean
  dryRun: boolean
  rollback: boolean
  auto: boolean
  force: boolean
  /** Exit 1 on a blocking parity finding (failed compatibility contract). Default: warn, exit 0. */
  strict: boolean
  /** Skip the post-apply quality gates (`types:check`, `lint:check`, `skills:check`). */
  noGates: boolean
  /** Keep the prompts even when stdin is not a TTY (the default there is `--auto`). */
  interactive: boolean
  /** First run on an EXISTING app: never overwrite what it already has (see `cli/lib/updater-adopt.ts`). */
  adopt: boolean
  updateMcpTemplate: McpAgent | null
}

const isMcpAgent = (v: string): v is McpAgent => (MCP_TEMPLATE_AGENTS as readonly string[]).includes(v);

export function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = { commands: [], help: false, dryRun: false, rollback: false, auto: false, force: false, strict: false, noGates: false, interactive: false, adopt: false, updateMcpTemplate: null };
  const valid = new Set(COMPONENTS.map(c => c.name).concat(['all', 'help', 'rollback']));
  // Pre-cross-harness component names still typed from muscle memory.
  const aliases: Record<string, string> = {
    claude: 'agent-compatibility',
    // The retired alias-wrapper component; its files now leave through deprecatedFiles.
    commands: 'agent-compatibility',
    prompts: 'agent-compatibility',
    books: 'agent-compatibility',
    guidelines: 'context',
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'help' || a === '--help' || a === '-h') { out.help = true; }
    else if (a === '--auto') { out.auto = true; }
    else if (a === '--dry-run') { out.dryRun = true; }
    else if (a === '--rollback' || a === 'rollback') { out.rollback = true; }
    else if (a === '--force') { out.force = true; }
    else if (a === '--strict') { out.strict = true; }
    else if (a === '--no-gates') { out.noGates = true; }
    else if (a === '--interactive') { out.interactive = true; }
    else if (a === '--adopt') { out.adopt = true; }
    else if (a === '--update-mcp-template') {
      const n = args[i + 1];
      if (!n || !isMcpAgent(n)) {
        tui.log.error(`--update-mcp-template requiere agente: ${MCP_TEMPLATE_AGENTS.join(', ')}`);
        process.exit(1);
      }
      out.updateMcpTemplate = n;
      i++;
    }
    else if (aliases[a]) { out.commands.push(aliases[a]); }
    else if (valid.has(a)) { out.commands.push(a); }
    // The page flags are read by cli/lib/ui/env-detect.ts.
    else if (a === '--headless' || a === '--ui') { /* known */ }
    else if (!a.startsWith('-')) { tui.log.error(`Comando/componente desconocido: ${a}. Usa --help para ver los validos.`); process.exit(1); }
    // An unknown flag used to be ignored, so `--dryrun` ran a REAL sync (analysis §8 #28).
    else { tui.log.error(`Opción desconocida: ${a}. Usa --help para ver las válidas.`); process.exit(1); }
  }
  return out;
}

// --- HELP ---
const HELP_TEXT = `
UPEX Boilerplate Updater v${CLI_VERSION} — Ayuda

USO:
  bun sync [comando] [flags]

COMPONENTES: ${COMPONENTS.map(c => c.name).join(', ')}
ATAJOS:      all, rollback, help

PREFLIGHT CROSS-HARNESS (automatico, una sola vez, ANTES de sincronizar):
  Si el proyecto todavia guarda sus instrucciones en CLAUDE.md, sus skills en
  .claude/skills/ y el hook en .claude/hooks/, la migracion los mueve a
  AGENTS.md, .agents/skills/ y ${MIGRATION_BACKUP_DIR}/ antes de tocar
  ningun componente. Corre con cualquier subcomando, porque sin ella el sync
  dejaria al proyecto sin instrucciones. No borra nada: lo que no se mueve queda
  en ${MIGRATION_BACKUP_DIR}/ (gitignored). Es idempotente y con
  --dry-run solo muestra el plan. En la corrida que migra, el alias
  .claude/skills NO se crea (git no puede quitar del indice lo que queda detras
  de un symlink y el pre-commit fallaria): commitea la migracion y luego corre
  \`bun run agents:compat\`.

SUPERFICIES GENERADAS (nunca se sincronizan ni se reportan como drift):
  CLAUDE.md (shim \`@AGENTS.md\`) y .claude/skills (alias a .agents/skills).
  Tras cada sync se regeneran con la misma logica de \`bun run agents:compat\`.
  .claude/commands/ y .opencode/commands/ son del proyecto: el boilerplate no
  envia comandos (una skill se invoca por su nombre mas un modo). Un comando con
  el nombre de una skill la oculta: se mueve a ${SHADOWING_COMMANDS_BACKUP_DIR}/.

INSTRUCCIONES POR SECCIONES (componente instructions):
  AGENTS.md es el L0 siempre cargado y es del proyecto (nunca se sobrescribe).
  Las secciones de ${INSTRUCTIONS_DIR}/ son doctrina compartida y se
  sincronizan como las skills (edicion local: backup en .backups/ y fila; para
  conservarla, updater.protected_paths). ${PROJECT_INSTRUCTIONS_FILE} es del
  proyecto: nunca viaja; si falta, se crea UNA vez desde
  ${PROJECT_INSTRUCTIONS_TEMPLATE} (stub generico; un stub con texto propio
  del boilerplate se rechaza). Un AGENTS.md anterior a la division (un solo
  archivo) recibe una fila con el mapa encabezado -> archivo de seccion y lo
  que va a agent-project.md; nunca se reescribe solo.

REPORTE DE PARIDAD (al final de cada corrida, incluido --dry-run):
  Una tabla "Estado por superficie" (9 filas: instrucciones y config, skills,
  hooks, MCP, env, componentes, package.json, git, verificacion) y UN
  prompt para tu IA con cada diferencia frente a upstream (archivo + evidencia:
  secciones, claves, servidores, hunks) para que decidas fila por fila: keep
  project | take upstream | merge. Se guarda en ${PARITY_PROMPT_PATH}
  (gitignored, un solo uso; con --dry-run no se guarda). "take upstream" solo
  se sugiere cuando al proyecto le falta ese contenido por completo: una fila
  con servidores, claves, secciones o ediciones que solo tiene el proyecto
  sugiere "merge", nunca un reemplazo, y una fila "merge" siempre dice que
  portar (lo que upstream agrego) y que conservar (lo que solo tiene el
  proyecto). Los archivos protegidos (AGENTS.md, .agents/project.yaml,
  .mcp.json, .claude/settings.json, .husky/pre-commit, .husky/pre-push,
  .husky/commit-msg, …)
  nunca se sobrescriben: solo aparecen en ese reporte. .claude/settings.json,
  .codex/ y los hooks de .husky/ se entregan UNA vez si faltan. De
  .claude/settings.json solo crecen permissions.allow, permissions.deny y
  hooks (se agrega lo que upstream tiene y falta, nunca se quita; un hook que
  falta llega como grupo nuevo, antes del chequeo de compatibilidad); una
  regla deny que el proyecto no quiere va en updater.declined_denies, un
  comando de hook en updater.declined_hooks. A opencode.jsonc
  nunca se le escribe: las reglas deny que le faltan salen como bloque para
  pegar en el reporte. El proyecto
  suma sus propias rutas protegidas en .agents/project.yaml ->
  updater.protected_paths (archivos sincronizados que fusiono a mano): mismo
  trato que la lista de upstream. Un archivo sincronizado que el proyecto
  habia editado y la corrida sobrescribio gana una fila (backup en .backups/)
  que dice como protegerlo. .agents/project.yaml y .agents/jira-required.yaml
  se comparan solo por estructura: fila "informational" cuando upstream agrego
  claves, ninguna fila por valores distintos. Las claves de package.json que
  se mantienen locales ganan una fila cada una.
  Una corrida que no aplica nada deja el arbol byte-identico (el lock no se
  reescribe solo para cambiar la fecha). Un abort (arbol sucio, lock corrupto,
  clone fallido, migracion o self-update rechazados, o un worktree enlazado en
  vez del checkout principal) termina en "Abortado." y exit 1, nunca en
  "Sincronizacion completada".

VERIFICACION POST-SYNC (gates):
  Tras aplicar archivos, corre \`types:check\`, \`lint:check\` y
  \`skills:check\` de tu package.json (120 s cada uno; un gate que no termina se omite). Un gate roto
  NO bloquea: aparece como fila "Verificacion" (codigo de salida, primeras
  lineas de error, que archivos aplicados esta corrida nombra) y como linea
  "Gates:" en el resumen. --no-gates lo desactiva.

RE-EJECUCION SEGURA:
  El sync deja sus archivos sin commitear a proposito (primero se revisa el
  prompt). La corrida registra lo que escribio en ${LAST_APPLY_FILE}
  (gitignored, con hash), y el guard del arbol sucio reconoce esas rutas
  mientras conserven el hash: volver a correr sin commitear NO aborta. Una
  ruta ajena, o una sincronizada que editaste despues, sigue abortando (con el
  commit sugerido y la ruta del prompt).

ADOPTAR UNA APP EXISTENTE (--adopt, solo la primera corrida):
  Para un repo de aplicacion que todavia no tiene ${VERSION_FILE}. Una ruta
  que upstream envia y la app NO tiene se entrega; una identica se marca vista;
  una que la app ya tiene con otro contenido NUNCA se sobrescribe: queda como
  fila de paridad y, si esta corrida sembro .agents/project.yaml, en
  updater.protected_paths. package.json solo agrega claves (los paquetes de la
  herramienta van a devDependencies; un script con el mismo nombre que uno de
  upstream se mantiene y es fila BLOQUEANTE). .env.example de la app recibe las
  variables de la herramienta en un bloque sentinel. .agents/project.yaml se
  siembra desde .agents/project.schema.yaml (identidad null, git_strategy
  inherited). Si la app trae su propio AGENTS.md o CLAUDE.md, ese texto pasa
  literal al skill local .agents/skills/<app>-context/ (references/
  app-instructions.md, fuera de la carga de cada sesion) con un puntero en
  .agents/instructions/agent-project.md, y se propone UN AGENTS.md = upstream + una
  fila de router hacia ese skill, con CLAUDE.md como shim: se aplica solo con
  un si explicito (con --auto queda guardado para revision y la fila bloquea). .mcp.json y
  opencode.jsonc se entregan si la app no los tiene. Los ADR numerados del
  boilerplate no viajan, ni en esa corrida ni en las siguientes. Escribe
  ${INSTALLER_LOCK_FILE} con adopted: true. Incompatible con --force y con subcomandos. Un repo que ya
  tiene lock: --adopt no hace nada (sale 0 si estaba adoptado).

--dry-run CON SELF-UPDATE PENDIENTE:
  Si upstream trae un updater mas nuevo, --dry-run no escribe cli/: ejecuta el
  updater nuevo directamente desde el clon upstream contra este proyecto, asi
  el preview muestra lo que hara la corrida real (plan de migracion,
  componentes, tabla de paridad) y no la opinion del codigo viejo.

SIN TTY:
  Si stdin no es una terminal y no pasaste --auto ni --interactive, la corrida
  asume --auto y lo avisa en una linea, en vez de quedarse esperando en el
  multi-select de la Fase 3.

PAGINA LOCAL (en una terminal con pantalla):
  La corrida se ve en una pagina local (127.0.0.1, con token) que abre sola:
  chequeo previo, fases, cada pregunta como tarjeta con sus diffs, y el
  reporte final. La terminal sigue mostrando el log; si ninguna pagina se
  conecta en 10 s, las preguntas siguen en la terminal. Con --auto la pagina
  es de solo lectura. Nunca se abre en CI, sin TTY, desde un agente ni por SSH
  sin pantalla. Al terminar guarda una copia en .session/runs/up-*.html.
  --headless             Sin pagina: el flujo de terminal de siempre
  --ui                   Abre la pagina aunque las reglas digan que no (SSH con
                         tunel, una terminal manejada por un agente)

FLAGS:
  --auto                          Modo no-interactivo: sincroniza TODO el
                                  boilerplate (copia archivos nuevos +
                                  sobreescribe divergencias con la versión
                                  upstream). NO borra archivos que upstream
                                  eliminó. El boilerplate es canónico (match 1:1).
  --force                         Como --auto pero TAMBIÉN borra archivos que el
                                  upstream eliminó. Hay backup + --rollback de
                                  respaldo.
  --dry-run                       Preview, sin escribir (tabla de paridad
                                  incluida; el prompt no se guarda)
  --strict                        Sale con codigo 1 si el sync termina con un
                                  hallazgo BLOQUEANTE de paridad (contrato de
                                  compatibilidad roto: alias, comandos, hooks,
                                  MCP). Por defecto solo avisa y sale 0. El
                                  drift de archivos protegidos nunca bloquea.
  --no-gates                      No corre types:check / lint:check /
                                  skills:check tras aplicar
  --interactive                   Mantiene los prompts aunque stdin no sea TTY
  --adopt                         Primera corrida sobre una app existente:
                                  nunca sobrescribe lo que la app ya tiene
                                  (ver ADOPTAR UNA APP EXISTENTE)
  --rollback                      Restaura backup mas reciente
  --update-mcp-template <agent>   Refresca docs/mcp/<agent>.template.*
                                  (agentes: ${MCP_TEMPLATE_AGENTS.join(', ')})
  --help, -h                      Esta ayuda

ENV:
  UPEX_TEMPLATE_REPO              Fuente alternativa del boilerplate: OWNER/REPO
                                  (via gh) o un clon LOCAL (ruta absoluta o
                                  file://, via git, sin sesion gh). Para probar
                                  una rama no publicada contra un consumidor.

EJEMPLOS:
  bun sync                                  # Flujo interactivo (5 fases)
  bun sync scripts                          # Un solo componente
  bun sync agent-compatibility scripts      # Multiples componentes
  bun sync codex-config                     # Solo el adaptador de Codex
  bun sync --auto                           # CI mode (seguro, preserva lo tuyo)
  bun sync --force                          # Forzar todo del upstream (sin preguntar)
  bun sync --dry-run                        # Preview (con el updater nuevo si hay self-update)
  bun sync --auto --strict                  # CI: falla si queda un contrato roto
  bun sync --auto --no-gates                # Sin gates (types / lint / skills) al final
  bun sync --rollback                       # Restaurar backup
  bun <clon>/cli/update-boilerplate.ts --adopt   # Adoptar una app existente
  bun sync --update-mcp-template claude     # Refrescar MCP template
`;

// --- RENAMED COMMAND ---
// The updater was `bun up` until 2026-10 and is `bun sync` now. `up` stays a
// hidden alias: a project whose package.json only has `up` runs it once, and
// the `scripts` key sync adds `sync`. The env flag keeps the self-update
// re-exec child, which inherits npm_lifecycle_event, from repeating the line.
const RENAMED_NOTICE_ENV = 'UPEX_SYNC_RENAME_NOTICED';
function noticeRenamedCommand(): void {
  if (process.env.npm_lifecycle_event !== 'up' || process.env[RENAMED_NOTICE_ENV] === '1') { return; }
  process.env[RENAMED_NOTICE_ENV] = '1';
  tui.log.info('Este comando ahora se llama `bun sync`; `bun up` sigue funcionando como alias.');
}

// --- PREREQ ---
// The git version, gh session and network checks of a run live in the preflight
// (`cli/preflight.ts`); `--update-mcp-template` still needs the gh check on its own.
async function validatePrerequisites(): Promise<void> {
  if (isLocalTemplateSource(TEMPLATE_REPO)) { return; } // plain `git clone`, no gh session involved
  try { execSync('gh --version', { stdio: 'ignore' }); }
  catch { tui.log.error('GitHub CLI (gh) no instalado.'); process.exit(1); }
  try { execSync('gh auth status', { stdio: 'ignore' }); }
  catch { tui.log.error('GitHub CLI no autenticado. Ejecuta: gh auth login'); process.exit(1); }
}

// --- ROLLBACK ---
function rollbackFromBackup(): void {
  const backupsDir = '.backups';
  if (!fs.existsSync(backupsDir)) { tui.log.error('No hay backups (.backups/ ausente).'); process.exit(1); }
  const backups = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('update-'))
    .map(d => d.name)
    .sort()
    .reverse();
  if (backups.length === 0) { tui.log.error('No hay backups en .backups/'); process.exit(1); }
  const latest = backups[0];
  tui.log.info(`Restaurando desde: ${latest}`);
  let restored = 0;
  const walk = (src: string, dst: string): void => {
    for (const it of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, it.name);
      const d = path.join(dst, it.name);
      if (it.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walk(s, d); }
      else { fs.cpSync(s, d); restored++; }
    }
  };
  try {
    walk(path.join(backupsDir, latest), process.cwd());
    tui.log.success(`Restaurados ${restored} archivos desde ${latest}`);
  }
  catch (err) {
    tui.log.error(`Rollback fallido: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// --- MCP TEMPLATE REFRESH (standalone) ---
async function updateMcpTemplateForAgent(agent: McpAgent): Promise<void> {
  tui.log.step(`MCP template refresh — agent: ${agent}`);
  await validatePrerequisites();
  if (fs.existsSync(TEMP_DIR)) { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); }
  try {
    execSync(`gh repo clone ${TEMPLATE_REPO} "${TEMP_DIR}" -- --depth 1 --quiet`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  }
  catch (err) {
    tui.log.error(`Error clonando: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const fileName = MCP_TEMPLATE_FILE[agent];
  const src = path.join(TEMP_DIR, 'docs', 'mcp', fileName);
  const dst = path.join('docs', 'mcp', fileName);
  if (!fs.existsSync(src)) {
    tui.log.error(`Upstream no contiene docs/mcp/${fileName}`);
    cleanupTempDir(TEMP_DIR);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst) && fs.readFileSync(src, 'utf-8') === fs.readFileSync(dst, 'utf-8')) {
    tui.log.info(`Sin cambios — docs/mcp/${fileName} ya sincronizado.`);
    cleanupTempDir(TEMP_DIR);
    return;
  }
  fs.cpSync(src, dst);
  tui.log.success(`docs/mcp/${fileName} actualizado.`);
  cleanupTempDir(TEMP_DIR);
}

// --- RUN FACTS (collected by the hooks, consumed by the end-of-run report) ---
//
// The afterApply hooks each learn one thing the parity report needs (the
// compatibility check, the env keys upstream added, what the preflight
// migration archived). They record it here instead of printing their own
// block, so the run ends with ONE table and ONE prompt (see makeParityHook).
interface RunFacts {
  compat: CompatibilityCheck | null
  envNewKeys: string[]
  /** Applied this invocation: by this process, or by the parent that re-exec'd us. */
  migration: HarnessMigrationResult | null
  /** --dry-run only: the preflight would migrate (so the compat check is not meaningful yet). */
  migrationPlanned: boolean
  /** The compat hook left `.claude/skills` for `bun run agents:compat` after the migration commit. */
  aliasDeferred: boolean
  /** Project commands that shadowed a skill, moved aside by the compat hook this run. */
  shadowingCommandsMoved: string[]
  /** Post-apply quality gates (`GATE_SCRIPTS`); empty when skipped. */
  gates: GateResult[]
  /** Why `gates` stayed empty this run: nothing to say when gates actually ran (even a fail leaves at least one `GateResult`). */
  gatesSkippedReason: 'no-gates' | 'no-changes' | 'adopt' | null
  /** A no-op run left the previous run's prompt file untouched. */
  promptKept: boolean
  /** `.context/PBI/` paths still tracked in git, and where the migration recipe was saved. */
  pbiCache: PbiCacheFact | null
  /** `permissions.allow` entries the additive merge appended to `.claude/settings.json` (on --dry-run: would append). */
  allowListAdded: string[]
  /** `permissions.deny` entries the same merge appended (on --dry-run: would append). */
  denyListAdded: string[]
  /** Upstream deny entries left out because the project lists them in `updater.declined_denies`. */
  denyListDeclined: string[]
  /** Hook commands the additive hook merge appended to `.claude/settings.json`, formatted (on --dry-run: would append). */
  hooksAdded: string[]
  /** Upstream hook commands left out because the project lists them in `updater.declined_hooks`. */
  hooksDeclined: string[]
  /** Upstream hook commands left out because the script they run is missing in the project. */
  hooksSkipped: string[]
  /** Keys `.claude/settings.json` repeated (a git auto-merge), folded into one list (on --dry-run: would fold). */
  settingsDuplicatesFolded: string[]
  /** One-line evidence for the unresolved-doctrine ledger row, when AGENTS.md carries debt. */
  doctrineDebt: string | null
  /** `--adopt` only: what the adopt hook did, and its parity rows. */
  adopt: AdoptOutcome | null
  /** `--adopt` only: the app's `.gitignore` hid the agentic store; what this run appended to re-include it. */
  reinclude: ReincludeOutcome | null
  parity: { findings: ParityFinding[], report: ParityReport } | null
}
const runFacts: RunFacts = { compat: null, envNewKeys: [], migration: null, migrationPlanned: false, aliasDeferred: false, shadowingCommandsMoved: [], gates: [], gatesSkippedReason: null, promptKept: false, pbiCache: null, allowListAdded: [], denyListAdded: [], denyListDeclined: [], hooksAdded: [], hooksDeclined: [], hooksSkipped: [], settingsDuplicatesFolded: [], doctrineDebt: null, adopt: null, reinclude: null, parity: null };

// --- ENV-VAR DRIFT DETECTION (afterApply hook) ---
/**
 * After a sync, diff the upstream `.env.example` (still sitting in the updater's
 * tempDir before cleanup) against the target's local `.env` + `.env.example`. If
 * upstream added keys the target lacks, warn and (interactive only) OFFER to run
 * `bun setup --variables` so the user can populate them locally + push the
 * Vercel-env subset. Deprecated keys lingering in the local `.env` are flagged
 * (never auto-deleted).
 *
 * D3-critical: this only PRINTS + OFFERS — it never auto-runs the remote push,
 * and the `--variables` flow itself stays gated. In non-interactive / CI mode it
 * prints the warning only (no prompt, no remote action).
 */
/**
 * Keys upstream `.env.example` documents that the target's `.env` and
 * `.env.example` both lack. Read-only; the dry-run parity table uses it too.
 */
function computeEnvNewKeys(templateDir: string): string[] {
  const upstreamExample = path.join(templateDir, '.env.example');
  if (!fs.existsSync(upstreamExample)) { return []; }

  // Upstream documents these keys (active or commented).
  const upstreamKeys = parseDotEnvExampleKeys(upstreamExample);

  // What the target already knows: active keys in local `.env` + documented keys
  // in local `.env.example`. A key absent from BOTH is genuinely new.
  const localEnvKeys = new Set<string>();
  const localEnvPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(localEnvPath)) {
    for (const k of Object.keys(parseEnvFile(fs.readFileSync(localEnvPath, 'utf-8')))) {
      localEnvKeys.add(k);
    }
  }
  const localExamplePath = path.join(process.cwd(), '.env.example');
  if (fs.existsSync(localExamplePath)) {
    for (const k of parseDotEnvExampleKeys(localExamplePath)) { localEnvKeys.add(k); }
  }
  return upstreamKeys.filter(k => !localEnvKeys.has(k));
}

async function detectEnvVarDrift(
  templateDir: string,
  sink: ReportSink,
  nonInteractive: boolean,
): Promise<void> {
  if (!fs.existsSync(path.join(templateDir, '.env.example'))) { return; }

  const newKeys = computeEnvNewKeys(templateDir);
  runFacts.envNewKeys = newKeys; // the parity report lists them as an `env` finding

  // Deprecated keys still lingering as ACTIVE entries in the local `.env`.
  const localEnvPath = path.join(process.cwd(), '.env');
  const activeEnvKeys = fs.existsSync(localEnvPath)
    ? new Set(Object.keys(parseEnvFile(fs.readFileSync(localEnvPath, 'utf-8'))))
    : new Set<string>();
  const deprecatedPresent = DEPRECATED_VARS.filter(d => activeEnvKeys.has(d.name));

  if (newKeys.length === 0 && deprecatedPresent.length === 0) { return; }

  if (newKeys.length > 0) {
    sink.warn(`Upstream añadió ${newKeys.length} variable(s) que tu .env no tiene: ${newKeys.join(', ')}`);
  }
  for (const d of deprecatedPresent) {
    sink.warn(`Variable obsoleta en tu .env: ${d.name} — ${d.reason} (no se elimina automáticamente).`);
  }

  if (newKeys.length === 0) { return; }

  if (nonInteractive) {
    sink.step('Para configurarlas localmente y subir el subconjunto de Vercel: bun setup --variables');
    return;
  }

  const run = await sink.confirm(
    'Ejecutar `bun setup --variables` ahora para configurar estas variables? (local + push opcional a Vercel, ambos gateados)',
    false,
  );
  if (!run) {
    sink.step('Omitido. Cuando quieras: bun setup --variables');
    return;
  }

  // Hand off to the gated --variables flow. The flow itself owns the remote-push
  // confirm — we never push from here (D3).
  const res = spawnSync('bun', ['run', 'setup', '--variables'], { stdio: 'inherit' });
  if (res.status !== 0) {
    sink.warn('`bun setup --variables` terminó con error o fue cancelado.');
  }
}

// --- SCHEMA-DRIVEN BACK-FILL for .agents/project.yaml (afterApply hook) ---
//
// ONE hook for every block upstream adds to `.agents/project.yaml`. It
// replaces the two hand-written ones that used to target the file
// (`upsertGitStrategyBlock`, which appended the MAINTAINER's `git_strategy`
// block at EOF, standing push authorization included, and
// `upsertAutomationIdentityBlock`). A key added upstream used to need a new
// hook written by hand, and every block after those two (`decision_authority`,
// `autonomous_delivery`, `updater`) is the proof that did not scale: nothing
// gave them to a project scaffolded before they existed.
//
// What arrives instead is derived from `.agents/project.schema.yaml`, which is
// generated from upstream's own yaml with every identity value blanked and
// gated against it (`agents:schema:check`), so a key cannot exist upstream and
// be missing from what this hook offers, and no maintainer value can travel.
//
// The promises the old hooks made are kept, because they are what make writing
// to a project's identity file acceptable at all: INSERT-ONLY (the result is
// re-parsed and every existing leaf proven unchanged before it reaches disk),
// never an edit to an existing line, idempotent, interactive confirm, and
// `--auto` warns without mutating. One prompt per BLOCK: per-key prompting on
// a project far behind is abusive, and a single all-or-nothing prompt hides
// what is being accepted. Each key lands at its schema position, not at EOF.

/** Upstream's version, for the `NEW in <release>` marker. See `markRelease`. */
function upstreamRelease(templateDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(templateDir, 'package.json'), 'utf8');
    const version = (JSON.parse(raw) as { version?: string }).version;
    return typeof version === 'string' && version !== '' ? version : null;
  }
  catch { return null; }
}

async function backfillProjectYamlFromSchema(
  templateDir: string,
  sink: ReportSink,
  nonInteractive: boolean,
): Promise<void> {
  const consumerPath = path.join(process.cwd(), SCHEMA_SOURCE);
  const schemaPath = path.join(templateDir, SCHEMA_FILE);
  if (!fs.existsSync(consumerPath) || !fs.existsSync(schemaPath)) { return; }

  let consumer: string;
  let schema: string;
  try {
    consumer = fs.readFileSync(consumerPath, 'utf8');
    schema = fs.readFileSync(schemaPath, 'utf8');
  }
  catch { return; }

  const delta = projectDelta(consumer, schema);
  if (delta.error) {
    // Say so. A silently skipped comparison that reports success is worse than
    // no comparison, because it certifies its own emptiness.
    sink.warn(`No se pudo comparar \`${SCHEMA_SOURCE}\` contra el schema: ${delta.error}`);
    return;
  }
  if (delta.gaps.length === 0) { return; }

  const release = upstreamRelease(templateDir);
  const total = delta.gaps.reduce((n, g) => n + g.paths.length, 0);

  if (nonInteractive) {
    sink.warn(`Tu \`${SCHEMA_SOURCE}\` no tiene ${total} clave(s) que el schema de upstream declara.`);
    for (const gap of delta.gaps) {
      sink.step(`  ${gap.block}${gap.wholeBlock ? ' (bloque completo)' : ''}: ${gap.paths.join(', ')}`);
    }
    sink.step('Modo --auto: no se modifica nada. Ejecuta el updater interactivo, o `bun run agents:schema --project`.');
    return;
  }

  let current = consumer;
  const applied: string[] = [];
  for (const gap of delta.gaps) {
    const what = gap.wholeBlock
      ? `el bloque \`${gap.block}\` completo (${gap.paths.length} clave(s))`
      : `${gap.paths.length} clave(s) nueva(s) en \`${gap.block}\`: ${gap.paths.join(', ')}`;
    const proceed = await sink.confirm(
      `Tu \`${SCHEMA_SOURCE}\` no tiene ${what}. Insertarlas ahora? (insert-only: ningún valor tuyo se modifica)`,
      false,
    );
    if (!proceed) { continue; }

    // A whole missing block is inserted as ONE unit, not leaf by leaf: its
    // children come with it, and asking for each would be the per-key
    // prompting this design rejected.
    const targets = gap.wholeBlock ? [gap.block] : gap.paths;
    const plan = planInsertions(current, schema, targets, release);
    const result = applyInsertions(current, plan);
    if (result.error) {
      sink.warn(`No se insertó \`${gap.block}\`: ${result.error}`);
      continue;
    }
    for (const skip of plan.skipped) { sink.warn(`  \`${skip.path}\` no se pudo ubicar: ${skip.reason}`); }
    current = result.text;
    applied.push(...plan.inserted);
  }

  if (applied.length === 0) {
    sink.step('Omitido. Ejecuta `bun run agents:schema --project` cuando quieras ver qué falta.');
    return;
  }
  try { fs.writeFileSync(consumerPath, current); }
  catch (err) {
    sink.warn(`No se pudo escribir \`${SCHEMA_SOURCE}\`: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  sink.step(`Insertadas ${applied.length} clave(s) en \`${SCHEMA_SOURCE}\`: ${applied.join(', ')}.`);
  sink.step(`Cada una lleva un comentario \`# NEW in ${release ?? '?'}\` y queda con el valor del template. Revísalas con \`git diff ${SCHEMA_SOURCE}\`.`);
  if (applied.some(p => p === 'git_strategy' || p.startsWith('git_strategy.'))) {
    sink.step('`git_strategy` llega como `inherited`: ejecuta "set up our git strategy" (git-flow-master) para definir la tuya.');
  }
}

// --- PROTECTED-FILE WATCHLIST (feeds the parity report) ---
//
// Files the updater NEVER syncs because every downstream project adapts them.
// When the boilerplate evolves one of them, `detectProtectedDrift` (in
// `./lib/updater-drift.ts`) flags it and the parity hook renders the
// section-level evidence + full diff into the single end-of-run prompt saved
// under `.agents/prompts/` (gitignored). Nothing ever edits a watched file.
//
// Noise control: a local file ALWAYS differs from the generic upstream, so
// "they differ" alone would fire every run. An entry fires ONLY when the
// UPSTREAM content changed since the last advice, tracked per entry by a
// content hash under `.template/upstream-sha/`. One nudge per upstream change,
// never on dry-run (the whole afterApply hook is skipped there).
//
// `AGENTS.md` (formerly `CLAUDE.md`, promoted by the cross-harness migration)
// keeps the legacy `claude-md.upstream.sha` marker path so repos that already
// received the old single-file advisory are not re-nudged on the first run
// after the rename. The marker file name is also listed in `.gitignore`, which
// is synced to consumers: renaming it would orphan every existing marker.

const PROTECTED_WATCHLIST: ProtectedWatchEntry[] = [
  { path: 'AGENTS.md', reason: 'per-project AI memory (identity, env URLs, custom rules); CLAUDE.md is only a generated shim onto it', markerPath: '.template/claude-md.upstream.sha' },
  // `structural`: project identity. Only keys upstream ADDED make a row
  // (informational); a value that differs from upstream's own scaffold never does.
  { path: '.agents/project.yaml', reason: 'per-project identity + env map, but upstream keeps ADDING structural blocks (e.g. git_strategy). A project scaffolded before a block existed never learns it should have one.', structural: true },
  { path: '.agents/jira-required.yaml', reason: 'methodology manifest: upstream owns the baseline work_types + field slugs, the project owns its fallbacks and omissions. It is the INPUT to jira:sync-workflows, which catalogs only the work_types declared in it — a stale manifest silently regenerates a truncated jira-workflows.json and still exits 0.', structural: true },
  { path: 'tsconfig.json', reason: 'path aliases are the contract every synced file imports through — a new upstream alias breaks synced code in a project whose tsconfig never learned it.' },
  { path: 'eslint.config.js', reason: 'project-owned overrides; lint-staged and lint:check run eslint against this local config. The shared rules and the cli/ import-closure block that guards the updater live in the synced `eslint.config.base.js` this file spreads (`agents:compat:check` fails on a base block it does not wire).' },
  { path: '.mcp.json', reason: 'MCP registry with project-specific servers/vars' },
  { path: 'opencode.jsonc', reason: 'OpenCode MCP registry (paired with .mcp.json)' },
  { path: '.codex/config.toml', reason: 'Codex MCP registry (paired with .mcp.json / opencode.jsonc; `agents:compat:check` enforces parity across the three)' },
  { path: '.claude/settings.json', reason: 'project permissions and hook wiring; never overwritten' },
  // Same split as the husky gates: the boilerplate half (`.env.core.schema`) is
  // generated and synced; this importer holds the project's own variables and
  // root decorators, so it is delivered once and then only reported on.
  { path: '.env.schema', reason: 'project-owned half of the varlock env schema (root decorators + the project\'s own variables). The boilerplate half is the synced, generated `.env.core.schema` it imports.' },
  // Synced component (`husky`) files that carry the project's own gates. Before
  // 8.2 every run force-applied upstream's copy over a committed merge and
  // re-raised the same row forever. Same delivery as `.claude/settings.json`:
  // once when missing (bootstrapOnlyPaths below), then project-owned.
  // The gates upstream owns live in the SYNCED `.husky/framework-gates.sh`,
  // which each hook sources and calls in one line; a hook that predates that
  // split gets a parity row with the block to paste (`frameworkGatesNote`).
  { path: '.husky/pre-commit', reason: 'project gates and their ordering live here; the gates upstream owns come from the synced .husky/framework-gates.sh, so a hook that does not source it never sees another one' },
  { path: '.husky/pre-push', reason: 'project gates and their ordering live here; the gates upstream owns come from the synced .husky/framework-gates.sh, so a hook that does not source it never sees another one' },
  // The forensic-trailer warning ships here, but a project's own commit-msg
  // gate (commitlint and the like) lives in the same file: deliver once, never
  // overwrite.
  { path: '.husky/commit-msg', reason: 'project commit-message checks live here (commitlint, ...); the warn-only checks upstream owns (forensic trailers) come from the synced .husky/framework-gates.sh, so a hook that does not source it never sees another one' },
];

/**
 * The watchlist this run enforces: the upstream entries above plus every
 * valid path the project declared in `.agents/project.yaml` ->
 * `updater.protected_paths` (a synced file it merged by hand and wants kept).
 * Project entries get the same treatment as upstream ones: never overwritten,
 * delivered once when missing, drift row with hunk evidence, sparse checkout.
 * An invalid entry (outside the repo, under `.git`, a directory, not a
 * string) is reported and ignored, never fatal.
 */
export function resolveProtectedWatchlist(cwd: string, warn: (message: string) => void = () => {}): ProtectedWatchEntry[] {
  const declared = readProjectProtectedPaths(cwd);
  for (const r of declared.rejected) {
    warn(`updater.protected_paths (.agents/project.yaml): entrada ignorada "${r.value}": ${r.reason}.`);
  }
  // A harness the project does not use (ADR-0013): its registries are neither
  // delivered when missing nor reported when upstream changes them.
  const unused = unusedHarnessPaths(cwd);
  return mergeProtectedWatchlist(PROTECTED_WATCHLIST.filter(e => !isUnderAny(e.path, unused)), declared.paths);
}

/**
 * Watched paths that are the APP's own root configs on an adopted repo. Their
 * drift row compares them with upstream's greenfield `tsconfig.json` /
 * `eslint.config.js` and would advise porting `bun-types`, `.ts` import
 * extensions or the antfu preset INTO the app's config: the opposite of
 * isolation. The tooling's halves are the synced `tsconfig.tooling.json` /
 * `eslint.config.tooling.mjs`, and what the app's configs owe the tooling (an
 * exclude, an ignore) is `cli/lib/adopt-isolation.ts`'s row. The entries stay
 * on the watchlist (never overwritten); only the drift row is dropped.
 */
/**
 * The retired paths `cleanupDeprecated` may delete: every entry, minus the
 * ones the project protects. An adopted app keeps its own copy of a file at a
 * path upstream retired (`--adopt` lists it in `updater.protected_paths`), and
 * a protected path is never overwritten, so never deleted either.
 */
export function deprecatedFilesToClean<T extends { path: string }>(deprecated: readonly T[], watchlist: readonly ProtectedWatchEntry[]): T[] {
  const kept = new Set(watchlist.map(e => e.path.replace(/\\/g, '/')));
  return deprecated.filter(d => !kept.has(d.path.replace(/\\/g, '/')));
}

export const ADOPTED_APP_CONFIGS: readonly string[] = ['tsconfig.json', 'eslint.config.js'];

/** The watchlist entries whose drift is reported: all of them, minus the app's own configs on an adopted repo. */
export function watchedForDrift(watchlist: readonly ProtectedWatchEntry[], adopted: boolean): ProtectedWatchEntry[] {
  return adopted ? watchlist.filter(e => !ADOPTED_APP_CONFIGS.includes(e.path)) : [...watchlist];
}

// NOT on the watchlist, deliberately — do not "fix" this asymmetry:
//
//  - `.agents/jira-fields.json` / `jira-workflows.json` / `jira-link-types.json`
//    are pure per-INSTANCE data. The upstream copies describe the boilerplate
//    authors' own Jira workspace. Advising a downstream project to merge them
//    would write field IDs from a workspace it has no relation to.
//  - `.agents/skills/REGISTRY.md`, `bun.lock` are generated artefacts;
//    upstream's copy carries no information for a downstream repo.
//  - `CLAUDE.md` is generated too (see GENERATED_PATHS): its only legitimate
//    content is `@AGENTS.md`, so "drift" there is a defect, not a merge.
//  - `CONTEXT.md` is a synced component (`context-engineering`), so it needs no
//    advisory — it arrives on its own.

/** The PBI cache migration recipe (gitignored, single-use); the parity table carries one row pointing here. */
const PBI_MIGRATION_PROMPT_PATH = path.join('.agents', 'prompts', 'pbi-cache-migration.md');

// --- REPO-ONLY PATHS ---
//
// The boilerplate's OWN material: tracked in this repo, but it must never reach
// a consumer project via `bun sync`. Matched as exact path or segment-aware
// directory prefix (see `isRepoOnlyPath` in updater-core). Mirrored in
// TEMPLATE_EXCLUDES (packages/create-agentic-dev/src/prepare.ts) — the scaffold
// prunes them on first install and this keeps `bun sync` from putting them
// back on the next sync.
//
// Reachability per TEMPLATE_EXCLUDES entry (only sync-reachable ones live here):
//  - `.github/workflows/pages.yml` + `ci.yml`: no component syncs `.github`
//    TODAY, so these are defense-in-depth — the moment a `.github` component (or
//    a root file-list entry) appears, the guard already stands. Both workflows
//    run the boilerplate's own publishing / quality gates; a consumer defines
//    its own CI.
//  - `.context/master-implementation-plan.md`: REACHABLE. `.context` is a
//    synced component with `bootstrapOnly: true`, so a consumer missing the
//    file gets a bootstrap copy — which would deliver the maintainer's plan of
//    THIS boilerplate. Consumers regenerate their own via
//    `/project-context master-plan`. (The business maps live in their context
//    skills now, delivered once as placeholders by `collectContextMapBootstrap`.)
//  - `.agents/jira-fields.json` + `jira-workflows.json`: REACHABLE. They sit in
//    `bootstrapOnlyPaths`, so a consumer missing them would receive the
//    boilerplate authors' per-instance Jira catalogs (and `jira:sync-fields`
//    then errors with "already populated"). Consumers regenerate their own.
//  - `packages/` and `CHANGELOG.md` (also in TEMPLATE_EXCLUDES): NOT here —
//    no synced component covers them (`packages` is no component; the root
//    file-lists name only CONTEXT.md, tooling files and .env.example), so the
//    sync cannot re-deliver what the scaffold pruned.
const REPO_ONLY_PATHS = [
  '.github/workflows/pages.yml',
  '.github/workflows/ci.yml',
  '.context/master-implementation-plan.md',
  '.agents/jira-fields.json',
  '.agents/jira-workflows.json',
];

// --- HOOK COMPOSITION ---

/** Run several afterApply hooks in sequence (each isolated; one failure warns, never aborts). */
function composeHooks(
  sink: ReportSink,
  ...hooks: Array<(summary: RunSummary) => Promise<void>>
): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    for (const hook of hooks) {
      try { await hook(summary); }
      catch (err) {
        sink.warn(`afterApply hook falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
}

// REGISTRY.md is excluded from the sync (generated, per-repo). When skills
// changed this run, regenerate it locally so it reflects the actual skill set —
// newly synced framework skills PLUS any local community skills the boilerplate
// never ships. Otherwise skills:registry:check (pre-push) would flag it stale
// after a sync that added or changed skills.
function makeSkillsRegistryHook(sink: ReportSink): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    if (!summary.applied.some(a => a.entry.path.startsWith(`${SKILLS_CANONICAL_DIR}/`))) { return; }
    sink.step(`Regenerando \`${SKILLS_CANONICAL_DIR}/REGISTRY.md\` (skills cambiaron)…`);
    const res = spawnSync('bun', ['run', 'skills:registry'], { stdio: 'inherit' });
    if (res.status !== 0) {
      sink.warn('No se pudo regenerar REGISTRY.md. Ejecuta `bun run skills:registry` manualmente.');
    }
  };
}

// --- PROJECT INSTRUCTIONS OVERLAY (afterApply hook) ---
//
// `.agents/instructions/agent-project.md` is excluded from the sync (PROJECT_OWNED_PATHS).
// A project that has none (scaffolded before the split, or an app adopted with
// `--adopt`) receives upstream's GENERIC stub once, never the boilerplate's own
// file; a stub that fails the leak gate is refused and named, nothing written.
// An existing `agent-project.md` is never read, compared or touched.
function makeProjectInstructionsHook(sink: ReportSink, dryRun: boolean): (summary: RunSummary) => Promise<void> {
  return async (): Promise<void> => {
    // The `agent-` rename: the overlay moves under its new name first, content
    // kept byte for byte, so the stub below never stands in for it.
    const migration = migrateLegacyProjectInstructions(process.cwd(), { dryRun });
    if (migration.kind === 'moved') {
      sink.step(`${dryRun ? '[dry-run] Se movería' : 'Movido'} \`${LEGACY_PROJECT_INSTRUCTIONS_FILE}\` a \`${PROJECT_INSTRUCTIONS_FILE}\` (mismo contenido, byte a byte): las secciones ahora llevan el prefijo \`agent-\`.`);
    }
    else if (migration.kind === 'both') {
      sink.warn(`Existen \`${LEGACY_PROJECT_INSTRUCTIONS_FILE}\` y \`${PROJECT_INSTRUCTIONS_FILE}\`: no se movió nada. Pasa lo propio del primero al segundo y borra el primero.`);
    }
    const outcome = deliverProjectInstructionsStub(process.cwd(), UPSTREAM_DIR, { dryRun });
    if (outcome.kind === 'delivered') {
      sink.step(`${dryRun ? '[dry-run] Se crearía' : 'Creado'} \`${PROJECT_INSTRUCTIONS_FILE}\` desde \`${PROJECT_INSTRUCTIONS_TEMPLATE}\`: las reglas propias de este proyecto van ahí; ninguna sincronización lo vuelve a tocar.`);
    }
    else if (outcome.kind === 'refused') {
      const first = outcome.leaks[0];
      sink.warn(`\`${PROJECT_INSTRUCTIONS_TEMPLATE}\` de upstream trae texto propio del boilerplate (${outcome.leaks.length} línea(s); la primera, línea ${first.line}: ${first.why}). No se creó \`${PROJECT_INSTRUCTIONS_FILE}\`: créalo a mano con frontmatter \`id: project\`, \`title\` y \`load_when\`, y reporta el stub a upstream.`);
    }
  };
}

// --- AGENT COMPATIBILITY (afterApply hook) ---
//
// Same engine as `bun run agents:compat`, imported from `cli/lib` so it travels
// with the self-updating `cli` component. Runs after EVERY apply, not only when
// skills changed: the alias is gitignored (a fresh clone has none), a project
// command that shadows a skill is moved to SHADOWING_COMMANDS_BACKUP_DIR, and
// the check reports anything
// the sync could not fix (a protected `.claude/settings.json` still pointing at
// the old hook, an MCP server added to one host only). Reports, never throws:
// the sync already landed, and a failed contract is something the user fixes
// with `bun run agents:compat`, not something to hide behind a generic "hook
// failed". The errors themselves are NOT listed here: they become BLOCKING rows
// of the parity report (see makeParityHook), one table for everything.
//
// In the invocation that ran the cross-harness migration the alias is NOT
// created: the migration just unindexed a committed `.claude/skills/` tree, and
// git refuses to rewrite index entries behind a symlink, so the alias would
// break lint-staged on the migration commit itself. The next step is printed
// here and in the closing box; `bun run agents:compat` creates it afterwards.
const ALIAS_DEFERRED_NEXT_STEP = 'Siguiente: commit de la migración, luego bun run agents:compat (crea el alias .claude/skills)';

/**
 * True while the cross-harness migration commit is still pending: the deferral
 * marker is there and the index still carries the unindexed `.claude/skills/*`
 * entries. A re-run over that tree (allowed since 8.1) must keep deferring the
 * alias, or the migration commit hits `is beyond a symbolic link`.
 */
function migrationCommitPending(cwd: string): boolean {
  if (!fs.existsSync(path.join(cwd, SKILLS_ALIAS_DEFERRED_MARKER))) { return false; }
  try {
    return execSync(`git -C "${cwd}" status --porcelain -- .claude/skills`, { encoding: 'utf8' }).trim() !== '';
  }
  catch {
    return false;
  }
}

function makeAgentCompatibilityHook(sink: ReportSink): (summary: RunSummary) => Promise<void> {
  return async (): Promise<void> => {
    // --adopt with the app's instructions still waiting for their composition:
    // CLAUDE.md is the app's own text, which the repair refuses by contract.
    // The BLOCKING instructions row already says what to do; repair after it.
    const adoptInstructions = runFacts.adopt?.instructions;
    if (adoptInstructions?.kind === 'compose' && !adoptInstructions.applied) {
      sink.step('Superficies de Claude/OpenCode/Codex sin regenerar: las instrucciones de la app esperan su composición (fila BLOQUEANTE); después, bun run agents:compat.');
      // The alias waits with them (it needs AGENTS.md): deferred, not missing,
      // so the adoption itself can be committed through the gates.
      // Only the real run's chain carries this hook, so nothing here is a dry run.
      const marker = path.join(process.cwd(), SKILLS_ALIAS_DEFERRED_MARKER);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
      runFacts.aliasDeferred = true;
      return;
    }
    const deferSkillsAlias = runFacts.migration?.applied === true || migrationCommitPending(process.cwd());
    sink.step(deferSkillsAlias
      ? 'Revisando superficies de Claude/OpenCode/Codex (el alias .claude/skills espera al commit de la migración)…'
      : 'Regenerando superficies de Claude/OpenCode/Codex (alias .claude/skills)…');
    const repair = repairAgentSurfaces(process.cwd(), { deferSkillsAlias });
    runFacts.compat = repair.check;
    runFacts.aliasDeferred = repair.aliasDeferred;
    runFacts.shadowingCommandsMoved = repair.shadowingCommandsMoved;
    for (const moved of repair.shadowingCommandsMoved) {
      sink.warn(`${moved} tenía el nombre de una skill y la ocultaba: movido a ${SHADOWING_COMMANDS_BACKUP_DIR}/${moved}.`);
    }
    if (repair.aliasDeferred) {
      sink.step(ALIAS_DEFERRED_NEXT_STEP);
    }
    if (repair.check.ok) {
      sink.step(`Compatibilidad lista: alias ${repair.alias?.status ?? 'pendiente'}.`);
      return;
    }
    sink.warn(`La compatibilidad agéntica quedó incompleta: ${repair.check.errors.length} contrato(s) roto(s). Detalle en la tabla de paridad al final (filas BLOCKING).`);
  };
}

// --- ADOPT (afterApply hook, `--adopt` only) ---
//
// FIRST in the chain: the compatibility repair reads the instruction files and
// the parity hook folds in the rows this hook builds. On --dry-run it writes
// nothing and reports what the real run would do.
function makeAdoptHook(sink: ReportSink, dryRun: boolean, nonInteractive: boolean): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    runFacts.adopt = await runAdopt({
      root: process.cwd(),
      upstreamDir: UPSTREAM_DIR,
      dryRun,
      nonInteractive,
      appliedPaths: summary.applied.filter(a => a.resolution === 'theirs').map(a => a.entry.path),
      collisions: summary.adoptCollisions ?? [],
      packageJsonKept: summary.packageJsonKept ?? [],
      backupDir: summary.backupDir ?? null,
      reinclude: runFacts.reinclude,
      ignoreLinesWithheld: summary.ignoreLinesWithheld ?? [],
      confirm: async message => sink.confirm(message, false),
      step: message => sink.step(message),
      warn: message => sink.warn(message),
    });
  };
}

// --- UPSTREAM-OWNED LIST (afterApply hook, adopted repos only) ---
//
// An adopted app shares `scripts/` and `.agents/skills/` with the tooling. The
// tooling gates (`scripts/tooling-check.ts`, `skills:check`) scope themselves
// to what upstream ships there, recorded in the installer lock on every sync
// while the upstream clone is on disk. After the adopt hook, which writes the
// lock on the first run.
function makeUpstreamOwnedHook(sink: ReportSink): (summary: RunSummary) => Promise<void> {
  return async (): Promise<void> => {
    const excluded = (rel: string): boolean => isRepoOnlyPath(rel, REPO_ONLY_PATHS)
      || ADOPT_REPO_ONLY_PATTERNS.some(re => re.test(rel))
      || GENERATED_PATHS.includes(rel);
    const owned = collectUpstreamOwned(UPSTREAM_DIR, excluded);
    if (writeUpstreamOwned(process.cwd(), owned)) {
      sink.step(`${INSTALLER_LOCK_FILE}: alcance del tooling registrado (lo que upstream posee en scripts/ y .agents/skills/); los gates no juzgan el código propio de la app.`);
    }
  };
}

// --- PARITY REPORT (afterApply hook) ---
//
// Folds everything the run learned into ONE set of findings: watched files
// that drifted (with sha markers so each upstream change nudges once), compat
// errors (blocking), MCP set per host, skills the migration archived, the
// retired alias overlay and any command moved aside, components held back, env keys upstream added and the
// git_strategy provenance. Runs while the upstream clone is still on disk. The
// rendered table + prompt are printed by main() AFTER runUpdate returns, so
// they are the last thing on screen; the prompt (with full diffs) is saved to
// `.agents/prompts/parity-plan.md`. Not the last hook in the chain any more:
// `makeSkillsRegistryHook` runs after it, so REGISTRY.md reflects whatever
// `.agents/skills/` looks like once this hook (and every other one) is done.

function readLock(cwd: string): { templateCommit: string, perComponentCommit: Record<string, string> } {
  try {
    const state = readSyncState(cwd, VERSION_FILE);
    if (!state) { return { templateCommit: '', perComponentCommit: {} }; }
    return {
      templateCommit: state.templateCommit ?? '',
      perComponentCommit: 'perComponentCommit' in state ? state.perComponentCommit : {},
    };
  }
  catch {
    return { templateCommit: '', perComponentCommit: {} };
  }
}

// --- POST-APPLY GATES (afterApply hook) ---
//
// A synced file can land cleanly and still break the project's type-check
// (Bunkai: `cli/**/*.test.ts` under a Next.js host whose `ProcessEnv` requires
// `NODE_ENV`). A diff-based parity row cannot see that; running the project's
// own gates right after the apply can. Informational only: a failed gate is
// a `gates` row in the parity table plus a `Gates:` line in the closing box,
// never an abort and never blocking. Each gate is timeboxed; one that does not
// finish is skipped with a note. `--no-gates` turns the hook off.

function packageScripts(cwd: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  }
  catch {
    return {};
  }
}

/** Lines that read as errors: `tsc` (`error TSxxxx`), eslint (`  12:3  error`), or a bare `error` prefix. */
function gateErrorLines(output: string): string[] {
  return output.split('\n').map(l => l.trimEnd()).filter(l => /(?:^|\s)error(?:\s|:|\b)/i.test(l) && !/\d+ problems? \(/.test(l));
}

/** Repo-relative paths named in the output that this run applied. */
function failingAppliedPaths(output: string, applied: readonly string[]): string[] {
  const set = new Set(applied);
  const hits = new Set<string>();
  for (const p of set) {
    if (output.includes(p)) { hits.add(p); }
  }
  return [...hits].sort();
}

export function runGate(script: string, cwd: string, applied: readonly string[], timeoutMs = GATE_TIMEOUT_MS): GateResult {
  const started = Date.now();
  const res = spawnSync('bun', ['run', '--silent', script], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
  const seconds = (Date.now() - started) / 1000;
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const timedOut = res.error !== undefined && 'code' in res.error && (res.error as { code?: string }).code === 'ETIMEDOUT';
  if (timedOut) {
    return { script, status: 'timeout', exitCode: null, seconds, errorCount: 0, firstErrors: [], failingApplied: [], output };
  }
  if (res.error) {
    return { script, status: 'error', exitCode: res.status, seconds, errorCount: 0, firstErrors: [res.error.message], failingApplied: [], output };
  }
  if (res.status === 0) {
    return { script, status: 'pass', exitCode: 0, seconds, errorCount: 0, firstErrors: [], failingApplied: [], output };
  }
  const errors = gateErrorLines(output);
  return {
    script,
    status: 'fail',
    exitCode: res.status,
    seconds,
    errorCount: errors.length,
    firstErrors: errors.slice(0, 3).map(l => (l.length > 160 ? `${l.slice(0, 157)}...` : l)),
    failingApplied: failingAppliedPaths(output, applied),
    output,
  };
}

// --- CLAUDE PERMISSION ALLOW + DENY LISTS (afterApply hook) ---
//
// `.claude/settings.json` is bootstrap-only AND watched, so a skill shipped
// upstream used to arrive without the `Skill(<name>)` entry that authorizes it,
// and a project scaffolded before the secret deny rules never received them.
// This merges TWO arrays additively, `permissions.allow` and
// `permissions.deny`, and leaves `ask`, `hooks`, `env` and every other key
// exactly as the project wrote them. A deny the project does not want is
// declined by name in `.agents/project.yaml` -> `updater.declined_denies`.
// See `updater-settings.ts` for why removals are deliberately not remembered.
//
// Backup before write, like every other mutation the run makes: the file is on
// the watchlist, so a consumer who dislikes an addition restores it from
// `.backups/` and expresses the removal (`deny` for an allow entry,
// `updater.declined_denies` for a deny entry).
//
// `adoptRun`: the `--adopt` run also CREATES the allow list when the app's own
// settings file has none (`createMissing` in `updater-settings.ts`); a plain
// update never does. The deny list arrives the same way on both runs.
function makePermissionListHook(
  templateDir: string,
  sink: ReportSink,
  dryRun: boolean,
  adoptRun: boolean,
): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    // No Claude Code here: its settings file is not this project's (ADR-0013).
    if (!declaredHarnesses(process.cwd()).harnesses.includes('claude')) { return; }
    const declined = readDeclinedDenies(process.cwd());
    if (declined.error) { sink.warn(`${declined.error}; se ignora y se agregan todas las reglas deny de upstream.`); }
    const opts = { createMissing: adoptRun, declinedDenies: declined.entries };
    const { allowAdded, denyAdded, denyDeclined, merged } = mergePermissionLists(process.cwd(), templateDir, opts);
    runFacts.denyListDeclined = denyDeclined;
    if (dryRun) {
      runFacts.allowListAdded = allowAdded;
      runFacts.denyListAdded = denyAdded;
      return;
    }
    if (merged === null) { return; }
    const localPath = path.join(process.cwd(), CLAUDE_SETTINGS_FILE);
    try {
      backupSettingsOnce(summary);
      fs.writeFileSync(localPath, merged, 'utf-8');
    }
    catch (err) {
      sink.warn(`No se pudieron fusionar los permisos de ${CLAUDE_SETTINGS_FILE}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    runFacts.allowListAdded = allowAdded;
    runFacts.denyListAdded = denyAdded;
    sink.step(`Permisos agregados a ${CLAUDE_SETTINGS_FILE}: ${allowAdded.length} allow, ${denyAdded.length} deny`);
  };
}

// The pre-write backup of `.claude/settings.json`, taken ONCE per run: the
// `--adopt` prompt-hook merge, the hook merge and the permission merge all
// write the file, and a second copy over the first would make `--rollback`
// restore the half-merged file. The first copy is the pre-run state, kept.
let settingsBackupTaken = false;

function backupSettingsOnce(summary: RunSummary): void {
  if (settingsBackupTaken) { return; }
  // This run's backup dir when it made one; otherwise its own, so the
  // pre-write backup contract holds even on a run that wrote nothing else.
  const dir = summary.backupDir ?? createBackupDir(process.cwd());
  const backupPath = path.join(dir, CLAUDE_SETTINGS_FILE);
  // The `--adopt` merge may have backed the file up already into the same dir.
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), CLAUDE_SETTINGS_FILE), backupPath);
  }
  settingsBackupTaken = true;
}

// --- CLAUDE HOOK GROUPS (afterApply hook, BEFORE the compatibility hook) ---
//
// The same additive merge for `hooks` (`mergeHookGroups`): an upstream hook
// command the project lacks under the same event and matcher is appended as a
// new group, and the project's own groups are never touched. It runs before
// `makeAgentCompatibilityHook` because `agents:compat:check` REQUIRES some of
// these groups (the route re-surface `PostToolUse` group, the `SessionStart`
// re-arm groups): run after it, the check would judge the old file and a
// project would leave the sync failing its own pre-commit. A command the
// project does not want is declined by exact text in
// `.agents/project.yaml` -> `updater.declined_hooks`. Only Claude: Codex's
// `hooks.json` and the OpenCode plugin are framework files the sync rewrites.
function makeHookMergeHook(
  templateDir: string,
  sink: ReportSink,
  dryRun: boolean,
): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    if (!declaredHarnesses(process.cwd()).harnesses.includes('claude')) { return; }
    const declined = readDeclinedHooks(process.cwd());
    if (declined.error) { sink.warn(`${declined.error}; se ignora y se agregan todos los hooks de upstream.`); }
    const { added, declined: left, skipped, duplicatesFolded, merged } = mergeHookGroups(process.cwd(), templateDir, { declinedHooks: declined.entries });
    runFacts.hooksDeclined = left.map(formatHookCommand);
    runFacts.hooksSkipped = skipped.map(formatHookCommand);
    if (dryRun) {
      runFacts.hooksAdded = added.map(formatHookCommand);
      runFacts.settingsDuplicatesFolded = duplicatesFolded;
      return;
    }
    if (merged === null) { return; }
    try {
      backupSettingsOnce(summary);
      fs.writeFileSync(path.join(process.cwd(), CLAUDE_SETTINGS_FILE), merged, 'utf-8');
    }
    catch (err) {
      sink.warn(`No se pudieron fusionar los hooks de ${CLAUDE_SETTINGS_FILE}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    runFacts.hooksAdded = added.map(formatHookCommand);
    runFacts.settingsDuplicatesFolded = duplicatesFolded;
    if (added.length > 0) { sink.step(`Hooks agregados a ${CLAUDE_SETTINGS_FILE}: ${added.length}`); }
    if (duplicatesFolded.length > 0) { sink.step(`${CLAUDE_SETTINGS_FILE}: clave(s) repetida(s) unificada(s) en una lista: ${duplicatesFolded.join(', ')}`); }
  };
}

function makeGatesHook(sink: ReportSink, enabled: boolean, adopted: boolean, adoptRun: boolean): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    if (!enabled) { runFacts.gatesSkippedReason = 'no-gates'; return; }
    if (summary.applied.length === 0) { runFacts.gatesSkippedReason = 'no-changes'; return; }
    // The --adopt run appends the tooling's devDependencies to package.json but
    // installs nothing: every gate would fail on a missing package, not on the
    // code. They run on the first commit (framework gates) after `bun install`.
    if (adoptRun) { runFacts.gatesSkippedReason = 'adopt'; return; }
    const cwd = process.cwd();
    const scripts = packageScripts(cwd);
    const applied = summary.applied.map(a => a.entry.path);
    for (const script of gateScriptsFor(adopted)) {
      if (!scripts[script]) { continue; }
      const spin = sink.spinner();
      spin.start(`Gate ${script} (máx. ${GATE_TIMEOUT_MS / 1000} s)…`);
      const result = runGate(script, cwd, applied);
      runFacts.gates.push(result);
      const took = `${Math.round(result.seconds)} s`;
      if (result.status === 'pass') { spin.stop(`Gate ${script}: OK (${took})`); }
      else if (result.status === 'timeout') { spin.stop(`Gate ${script}: omitido, sin veredicto en ${took}`); }
      else if (result.status === 'error') { spin.stop(`Gate ${script}: no se pudo ejecutar`); }
      else { spin.stop(`Gate ${script}: FAIL (${result.errorCount} error(es), ${took}); detalle en la fila "Verificación" de la tabla de paridad`); }
    }
  };
}

/** The one-line `Gates:` verdict for the closing box, or null when no gate ran. */
export function summarizeGates(gates: readonly GateResult[]): string | null {
  if (gates.length === 0) { return null; }
  return gates.map((g) => {
    if (g.status === 'pass') { return `${g.script} OK`; }
    if (g.status === 'timeout') { return `${g.script} omitido (>${Math.round(g.seconds)} s)`; }
    if (g.status === 'error') { return `${g.script} no ejecutado`; }
    return `${g.script} FAIL (${g.errorCount} error${g.errorCount === 1 ? '' : 'es'})`;
  }).join('; ');
}

/**
 * The `Gates:` line for the closing box, including the skip reason when no
 * gate ran at all: a bare missing line reads as "nothing to say" when it
 * actually means "nothing ran", `--no-gates` and "no-op run" alike. Real
 * gate results (even a single failed one) always win over a skip reason.
 */
export function gatesSummaryLine(gates: readonly GateResult[], skippedReason: RunFacts['gatesSkippedReason']): string | null {
  const summary = summarizeGates(gates);
  if (summary) { return summary; }
  if (skippedReason === 'no-gates') { return 'omitidas (--no-gates)'; }
  if (skippedReason === 'no-changes') { return 'omitidas (sin cambios)'; }
  if (skippedReason === 'adopt') { return 'omitidas (--adopt: corren tras bun install)'; }
  return null;
}

function makeParityHook(sink: ReportSink, priorLockSha: string, dryRun: boolean, watchlist: readonly ProtectedWatchEntry[], adopted: boolean): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    const cwd = process.cwd();
    // A freshly declared `updater.protected_paths` entry gets its marker
    // seeded and no row (the project just merged it by hand); the row comes
    // with the next upstream change. Same treatment, different reason, for
    // ANY first-advice entry whose upstream copy hasn't moved since the
    // project's own lock cursor, first-run noise on a migrated repo, not a
    // new upstream change to review.
    const { advised: drifted, seeded, seededNoUpstreamChange } = splitFirstProjectAdvice(
      detectProtectedDrift(watchedForDrift(watchlist, adopted), UPSTREAM_DIR, cwd),
      { tempDir: UPSTREAM_DIR, lockCursor: priorLockSha || null },
    );
    // Markers FIRST: one nudge per upstream change even if the user ignores
    // it. A dry-run persists nothing: the real run will nudge.
    if (!dryRun) { persistMarkers([...drifted, ...seeded, ...seededNoUpstreamChange], cwd); }
    if (seeded.length > 0) {
      sink.step(`${seeded.length} ruta(s) recién protegidas en updater.protected_paths sin fila esta vez (${seeded.map(s => s.path).join(', ')}); la fila llega con el próximo cambio upstream.`);
    }
    if (seededNoUpstreamChange.length > 0) {
      sink.step(`${seededNoUpstreamChange.length} ruta(s) vigiladas sin cambio upstream desde el cursor; markers sembrados sin fila.`);
    }

    const lock = readLock(cwd);
    const heldBack: HeldBackComponent[] = summary.componentsHeldBack.map(component => ({
      component,
      lockCommit: lock.perComponentCommit[component] ?? null,
    }));
    // Archived skills nudge once too: this run's (the migration result, also
    // handed to the re-exec child) plus any archive entry never reported.
    const archivedSkillsDir = path.join(cwd, MIGRATION_BACKUP_DIR, 'skills');
    const archivedSkills = archivedSkillsToReport(cwd, archivedSkillsDir, runFacts.migration?.archivedSkills ?? []);
    if (!dryRun) { persistArchivedSkillMarkers(cwd, archivedSkills); }
    // Compat errors: the repair hook's check on a real run. On a dry-run the
    // read-only check stands in, unless the preflight would migrate first
    // (then every contract is expectedly broken and the check says nothing).
    let compatErrors = runFacts.compat?.errors ?? [];
    if (dryRun && !runFacts.compat) {
      if (runFacts.migrationPlanned) {
        sink.step('[dry-run] Comprobación de compatibilidad omitida: la corrida real migra primero y la evalúa después.');
      }
      else {
        try { compatErrors = checkAgentCompatibility(cwd).errors; }
        catch (err) { compatErrors = [err instanceof Error ? err.message : String(err)]; }
        // The real run deletes the retired alias wrappers (deprecatedFiles)
        // BEFORE this check; the preview still has them on disk, and one whose
        // name is a skill (`sync-ai-memory`, while that skill is still there)
        // would read as a command shadowing it. It is already on the removal list.
        const retired = RETIRED_COMMAND_WRAPPERS.map(d => d.path);
        compatErrors = compatErrors.filter(error => !retired.some(p => error.includes(`: ${p};`)));
      }
    }
    const findings = collectParityFindings({
      root: cwd,
      upstreamDir: UPSTREAM_DIR,
      drift: drifted.map(d => ({ path: d.path, reason: d.reason, structural: d.structural === true, source: d.source })),
      compatErrors,
      archivedSkills,
      archivedSkillsDir,
      heldBack,
      envNewKeys: runFacts.envNewKeys,
      localEdits: (summary.localEditsOverwritten ?? []).map(edit => ({
        ...edit,
        backupPath: summary.backupDir ? path.join(summary.backupDir, edit.path) : null,
      })),
      // On --adopt a kept script is the adopt hook's BLOCKING row instead.
      packageJsonKept: (summary.packageJsonKept ?? []).filter(k => !(runFacts.adopt !== null && k.section === 'scripts')),
      adoptFindings: runFacts.adopt?.findings ?? [],
      adopting: runFacts.adopt !== null,
      gates: runFacts.gates,
      shadowingCommandsMoved: runFacts.shadowingCommandsMoved,
      pbiCache: runFacts.pbiCache,
      allowListAdded: runFacts.allowListAdded,
      denyListAdded: runFacts.denyListAdded,
      denyListDeclined: runFacts.denyListDeclined,
      hooksAdded: runFacts.hooksAdded,
      hooksDeclined: runFacts.hooksDeclined,
      hooksSkipped: runFacts.hooksSkipped,
      settingsDuplicatesFolded: runFacts.settingsDuplicatesFolded,
      doctrineDebt: runFacts.doctrineDebt,
      doctrineFile: DOCTRINE_FILE,
    });
    const report = renderParityReport(findings, {
      templateRepo: TEMPLATE_REPO,
      upstreamSha: summary.newHeadSha,
      lockSha: priorLockSha,
      promptFile: PARITY_PROMPT_PATH,
    });
    runFacts.parity = { findings, report };
    if (findings.length === 0 || dryRun) { return; }

    const out = path.join(cwd, PARITY_PROMPT_PATH);
    // A run that applied nothing keeps the previous run's prompt: the watched
    // files nudged then are not nudged again (markers), so overwriting would
    // drop rows the user may not have read yet.
    if (summary.applied.length === 0 && fs.existsSync(out)) {
      runFacts.promptKept = true;
      summary.promptSaved = true;
      return;
    }
    try {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, report.fileBody);
      summary.promptSaved = true;
    }
    catch (err) {
      sink.warn(`No se pudo guardar ${PARITY_PROMPT_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

/** End-of-run visual: per-surface table, the parity prompt, the summary box. */
function printEndOfRun(summary: RunSummary, dryRun: boolean): void {
  const parity = runFacts.parity;
  if (parity) {
    const glyph = (state: 'ok' | 'warn' | 'blocked'): string => tui.statusIcon(state === 'blocked' ? 'fail' : state);
    tui.section('Estado por superficie');
    process.stdout.write(`${tui.table(['', 'Superficie', 'Detalle'], parity.report.surfaces.map(r => [glyph(r.state), r.label, r.cell]))}\n`);
    if (parity.findings.length === 0) {
      tui.log.success('Paridad completa con upstream: nada que decidir.');
    }
    else {
      const blocking = parity.findings.filter(f => f.blocking).length;
      tui.log.info(`${parity.findings.length} hallazgo(s) de paridad${blocking > 0 ? ` (${blocking} bloqueante(s))` : ''}. Nada fue modificado en archivos protegidos.`);
      if (dryRun) {
        tui.log.info('[dry-run] prompt not saved (la corrida real lo escribe en '.concat(pc.cyan(PARITY_PROMPT_PATH), ' con los diffs completos).'));
      }
      else if (runFacts.promptKept) {
        tui.log.info(`Prompt de la corrida anterior conservado en ${pc.cyan(PARITY_PROMPT_PATH)} (esta corrida no aplicó nada; puede tener más filas que la tabla de arriba).`);
      }
      else {
        tui.log.info(`Prompt guardado en ${pc.cyan(PARITY_PROMPT_PATH)} (auto-generado, un solo uso; incluye los diffs completos).`);
      }
      // Plain stdout (no log-prefix bullets) so the block copy-pastes cleanly.
      process.stdout.write(`\n${pc.dim('────────  COPY PROMPT BELOW  ────────')}\n${parity.report.prompt}\n${pc.dim('────────  COPY PROMPT ABOVE  ────────')}\n\n`);
    }
  }

  const lines = [
    `Aplicados:    ${summary.applied.length}`,
    `Saltados:     ${summary.skipped.length}`,
    `Con error:    ${summary.failed.length}`,
    `Avanzados:    ${summary.componentsAdvanced.join(', ') || '(ninguno)'}`,
    `Retenidos:    ${summary.componentsHeldBack.join(', ') || '(ninguno)'}`,
  ];
  const gates = gatesSummaryLine(runFacts.gates, runFacts.gatesSkippedReason);
  if (gates) { lines.push(`Gates:        ${gates}`); }
  // A no-op run over a clean tree has nothing to commit; a no-op over the
  // previous sync's uncommitted output still does.
  if (!dryRun && summary.newHeadSha && (summary.applied.length > 0 || (summary.lastApplyPaths ?? 0) > 0)) {
    lines.push(`Commit sugerido: ${suggestCommitMessage(summary)}`);
  }
  if (runFacts.aliasDeferred) {
    lines.push(ALIAS_DEFERRED_NEXT_STEP);
  }
  process.stdout.write(`${tui.successBox(lines)}\n`);
}

// --- CROSS-HARNESS MIGRATION (preflight) ---

/**
 * Reports what the cross-harness migration did, or exits with an actionable
 * message when it refuses. Nothing is deleted either way: content moves to its
 * canonical home or is archived under `.template/pre-agents-migration/`.
 */
function runHarnessMigration(sink: ReportSink, dryRun: boolean, adopt: boolean): HarnessMigrationResult | null {
  const plan = planHarnessMigration(process.cwd(), { adopt });
  if (!plan.needed && plan.blockers.length === 0) { return null; }

  tui.log.info('Migración cross-harness (Claude → Claude + OpenCode + Codex):');
  for (const line of describeHarnessMigration(plan)) { tui.log.message(`  · ${line}`); }
  pageNote('info', ['Migración cross-harness (Claude → Claude + OpenCode + Codex):', ...describeHarnessMigration(plan).map(l => `· ${l}`)].join('\n'));

  // --dry-run must still SHOW this. Without it the preview would suggest the
  // project's memory is untouched while a real run promotes it to AGENTS.md
  // BEFORE syncing anything.
  if (dryRun) {
    if (plan.blockers.length > 0) {
      tui.log.warn(`Bloqueantes que detendrían la migración:\n  - ${plan.blockers.join('\n  - ')}`);
      pageNote('warn', `Bloqueantes que detendrían la migración: ${plan.blockers.join('; ')}`);
    }
    tui.log.message('  (--dry-run: nada de lo anterior se aplicó. La corrida real lo hace ANTES de sincronizar.)');
    runFacts.migrationPlanned = plan.needed;
    return null;
  }

  try {
    const result = applyHarnessMigration(process.cwd(), plan);
    runFacts.migration = result;
    if (!result.applied) { return result; }
    // The self-update re-exec child inherits the environment: it plans no
    // migration of its own (the repo is migrated by then) but still owns the
    // end-of-run report and the alias deferral, so it must know what happened.
    process.env[HARNESS_MIGRATION_RESULT_ENV] = JSON.stringify(result);
    if (result.promotedInstructions) {
      sink.step('AGENTS.md creado desde CLAUDE.md; CLAUDE.md ahora es el shim `@AGENTS.md`.');
    }
    if (result.movedSkills.length > 0) {
      sink.step(`${result.movedSkills.length} skill(s) movidas a ${SKILLS_CANONICAL_DIR}/: ${result.movedSkills.join(', ')}`);
    }
    if (result.archivedSkills.length > 0) {
      sink.warn(`${result.archivedSkills.length} skill(s) archivadas en ${MIGRATION_BACKUP_DIR}/skills/ porque ${SKILLS_CANONICAL_DIR} ya tenía ese nombre: ${result.archivedSkills.join(', ')}`);
    }
    if (result.archivedLegacyHook) {
      sink.step(`Hook legacy .claude/hooks/personality-reinject.js archivado en ${MIGRATION_BACKUP_DIR}/hooks/.`);
    }
    if (result.repointedSettingsHook) {
      sink.step('.claude/settings.json: comando del hook apuntado a .agents/hooks/personality-reinject.mjs (solo esa ruta; permisos intactos).');
    }
    if (result.unindexedFiles > 0) {
      sink.step(`${result.unindexedFiles} entrada(s) de .claude/skills quitadas del índice de git (solo el índice; el contenido ya vive en ${SKILLS_CANONICAL_DIR}/).`);
    }
    if (result.ignoredEntriesAdded.length > 0) {
      sink.step(`.gitignore: añadido ${result.ignoredEntriesAdded.join(', ')}.`);
    }
    tui.log.message(`  Copia de seguridad: ${MIGRATION_BACKUP_DIR}/ (gitignored). Revísala antes de borrarla.`);
    pageNote('info', `Copia de seguridad: ${MIGRATION_BACKUP_DIR}/ (gitignored). Revísala antes de borrarla.`);
    return result;
  }
  catch (error) {
    tui.log.error(error instanceof Error ? error.message : String(error));
    tui.log.warn('El update se detuvo ANTES de tocar nada. Resuelve lo anterior y vuelve a correr `bun sync`.');
    pageNote('error', error instanceof Error ? error.message : String(error));
    throw Object.assign(new Error('El update se detuvo ANTES de tocar nada.'), { name: 'UpdaterAbort', exitCode: 1 });
  }
}

// --- PAGE (installer-ui delivery 2) ---
/** The page of this run, when it opened; the error handler closes it too. */
let activeUi: UpdaterUi | null = null;
/** A line of output that bypasses the sink (migration block), mirrored into the page. */
function pageNote(level: 'info' | 'warn' | 'error', text: string): void {
  activeUi?.notice(level, text);
}

/** Closes the page (summary saved, server stopped) once; safe to call with no page. */
async function closeUi(status: 'done' | 'done-with-pending' | 'failed' | 'aborted', exit: number): Promise<void> {
  const ui = activeUi;
  activeUi = null;
  if (!ui) { return; }
  try {
    const saved = await ui.finish(status, exit);
    if (saved) { tui.log.info(`Resumen guardado en ${pc.cyan(saved)}`); }
  }
  catch { /* closing the page never changes the run's exit */ }
}

/** Terminal rows of the preflight: nothing when all is clear (today's output), every warn and block otherwise. */
function printPreflight(pre: PreflightResult): void {
  for (const c of pre.checks) {
    if (c.state !== 'warn' && c.state !== 'block') { continue; }
    const text = `${c.label}${c.value && c.value !== '-' ? ` (${c.value})` : ''}: ${plainMsg(c.msg ?? '')}`;
    if (c.state === 'block') { tui.log.error(text); }
    else { tui.log.warn(text); }
  }
}

// --- SINK ---
function abortOnCancel<T>(v: T | symbol): T {
  // A plain `typeof` narrowing: an adopted app resolves `@clack/prompts` to a
  // newer minor whose `isCancel` guard no longer narrows `T | symbol` to `T`.
  if (typeof v === 'symbol' || tui.isCancel(v)) {
    throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' });
  }
  return v;
}

/**
 * Today's terminal sink. With the page open it keeps printing every log line
 * and asks a question only when no page has been connected for 10 s; `signal`
 * then cancels the prompt the moment the page answers first (owner answer Q6).
 */
function buildSink(signal: () => AbortSignal | undefined = () => undefined): ReportSink {
  return {
    phase: (n, label) => tui.phaseHeader(n, label),
    subphase: (label) => {
      const text = `── ${label} ──`;
      process.stdout.write(`\n${pc.dim(pc.cyan(text))}\n\n`);
    },
    step: msg => tui.log.info(msg),
    warn: msg => tui.log.warn(msg),
    error: msg => tui.log.error(msg),
    spinner: () => tui.spinner(),

    confirm: async (message, defaultValue = false) => {
      const r = await tui.confirm({ message, initialValue: defaultValue, signal: signal() });
      return abortOnCancel<boolean>(r);
    },

    pickScopes: async (scopes) => {
      if (scopes.length === 0) { return []; }
      const options = scopes.map(s => ({
        value: s.name,
        label: `${s.name} (${s.changedCount} cambiados${s.divergedCount > 0 ? `, ${s.divergedCount} divergente${s.divergedCount > 1 ? 's' : ''}` : ''})`,
      }));
      const r = await tui.multiselect({ message: 'Selecciona componentes a revisar:', options, required: false, signal: signal() });
      return abortOnCancel<string[]>(r);
    },

    pickScopeStrategy: async (scope, stats) => {
      const divergedSuffix = stats.divergedCount > 0
        ? `, ${stats.divergedCount} divergente${stats.divergedCount > 1 ? 's' : ''}`
        : '';
      const locSuffix = (stats.addedTotal || stats.removedTotal)
        ? `, +${stats.addedTotal}/-${stats.removedTotal} líneas`
        : '';
      const r = await tui.select({
        message: `${scope} (${stats.changedCount} archivo(s)${divergedSuffix}${locSuffix}) — cómo proceder?`,
        options: [
          { value: 'all', label: `aceptar todos (${stats.changedCount})` },
          { value: 'pick', label: 'elegir individualmente' },
          { value: 'skip', label: 'saltar scope completo' },
        ],
        initialValue: 'all',
        signal: signal(),
      });
      return abortOnCancel<string>(r) as 'all' | 'pick' | 'skip';
    },

    pickFiles: async (scope, files) => {
      if (files.length === 0) { return []; }
      const options = files.map(f => ({ value: f.entry.path, label: f.label, hint: f.entry.classification }));
      const r = await tui.multiselect({ message: `Selecciona archivos en ${scope}:`, options, required: false, signal: signal() });
      const selected = new Set(abortOnCancel<string[]>(r));
      return files.filter(f => selected.has(f.entry.path)).map(f => f.entry);
    },

    pickIgnoreLines: async (file, options) => {
      if (options.length === 0) { return []; }
      // Collapse pattern+negation ladders (e.g. a `dir/*` exclusion with `!`
      // re-inclusions) into ONE all-or-nothing option: applying the exclusion
      // without its `!` re-inclusions (or vice versa) would corrupt what git
      // tracks.
      const byValue = new Map(options.map(o => [o.value, o]));
      const groups = groupIgnoreLines(options.map(o => o.value));
      const opts = groups.map((g) => {
        if (!g.atomic) {
          const o = byValue.get(g.lines[0])!;
          return { value: o.value, label: o.label };
        }
        return {
          value: g.lines.join('\n'),
          label: `${g.lines[0]}  (+${g.lines.length - 1} línea(s) ligadas — todo o nada)`,
        };
      });
      const initialValues = groups
        .filter(g => g.lines.every(l => byValue.get(l)?.checked))
        .map(g => (g.atomic ? g.lines.join('\n') : g.lines[0]));
      const r = await tui.multiselect({
        message: `${file} — líneas nuevas en upstream (no en tu archivo):`,
        options: opts,
        initialValues,
        required: false,
        signal: signal(),
      });
      // Expand atomic groups back into their individual lines for the core.
      return abortOnCancel<string[]>(r).flatMap(v => v.split('\n'));
    },

    pickPackageJsonKeys: async (file, section, keys) => {
      if (keys.length === 0) { return []; }
      const r = await tui.multiselect({
        message: `${file} → ${section}: claves nuevas en upstream (se agregan sin tocar las tuyas):`,
        options: keys.map(k => ({ value: k.value, label: k.label })),
        initialValues: keys.filter(k => k.checked).map(k => k.value),
        required: false,
        signal: signal(),
      });
      return abortOnCancel<string[]>(r);
    },

    resolvePackageJsonKey: async (file, section, key, drift) => {
      const body = `=== Tu versión (local) ===\n${drift.localValue}\n\n=== Versión del boilerplate (upstream) ===\n${drift.upstreamValue}`;
      tui.note(body, `${file} → ${section}.${key}`);
      const r = await tui.select({
        message: `${section}.${key} difiere — qué hacemos?`,
        options: [
          { value: 'mine', label: 'Mantener la mía (predeterminado)' },
          { value: 'theirs', label: 'Actualizar a la del boilerplate' },
          { value: 'skip', label: 'Decidir después (preguntar de nuevo)' },
        ],
        initialValue: 'mine',
        signal: signal(),
      });
      return abortOnCancel<string>(r) as 'theirs' | 'mine' | 'skip';
    },

    resolveDiverged: async (entry, diff) => {
      const body = `=== Cambios upstream ===\n${diff.templateDiff.trim() || '(sin diff)'}\n\n=== Tus cambios locales ===\n${diff.localDiff.trim() || '(sin diff)'}`;
      tui.note(body, `Divergencia en ${entry.path}`);
      const r = await tui.select({
        message: 'Cómo resolver?',
        options: [
          { value: 'skip', label: 'skip (predeterminado — preservar tu version)' },
          { value: 'theirs', label: 'theirs (descartar locales, usar upstream)' },
          { value: 'mine', label: 'mine (conservar tu version explicitamente)' },
        ],
        initialValue: 'skip',
        signal: signal(),
      });
      return abortOnCancel<string>(r) as 'skip' | 'theirs' | 'mine';
    },

    confirmDelete: async (entry) => {
      const r = await tui.confirm({ message: `Eliminar ${entry.path} localmente? (upstream lo borro)`, initialValue: false, signal: signal() });
      return abortOnCancel<boolean>(r);
    },

    showDiff: async (entry, diff) => {
      const isNew = entry.classification === 'new-upstream';
      const ask = await tui.confirm({
        message: isNew
          ? `Ver preview de contenido upstream para ${entry.path}?`
          : `Ver diff de ${entry.path} antes de aplicar?`,
        initialValue: false,
      });
      if (!abortOnCancel<boolean>(ask)) { return; }

      const PREVIEW_LIMIT = 40;
      const DIFF_LIMIT = 80;

      let body: string;
      let title: string;
      let limit: number;

      if (isNew) {
        title = `Nuevo archivo: ${entry.path}`;
        body = diff.templateDiff.trim() || '(contenido vacío)';
        limit = PREVIEW_LIMIT;
      }
      else {
        title = `Diff: ${entry.path}`;
        const t = diff.templateDiff.trim() || '(sin diff)';
        const l = diff.localDiff.trim() || '(sin diff)';
        body = `=== Upstream (template) ===\n${t}\n\n=== Local ===\n${l}`;
        limit = DIFF_LIMIT;
      }

      // Strip ANSI to render cleanly inside clack note box.
      // eslint-disable-next-line no-control-regex
      const plain = body.replace(/\x1B\[[0-9;]*m/g, '');
      const lines = plain.split('\n');
      const truncated = lines.length > limit;
      const shown = truncated
        ? `${lines.slice(0, limit).join('\n')}\n... ${lines.length - limit} línea(s) más`
        : plain;

      tui.note(shown, title);

      if (truncated) {
        const openExternal = await tui.confirm({
          message: 'Abrir contenido completo en editor externo?',
          initialValue: false,
        });
        if (abortOnCancel<boolean>(openExternal)) {
          const tmp = path.join(os.tmpdir(), `upex-diff-${process.pid}-${Date.now()}.txt`);
          fs.writeFileSync(tmp, plain);
          const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'less');
          try { spawnSync(editor, [tmp], { stdio: 'inherit' }); }
          catch { tui.log.warn(`No se pudo abrir ${editor}. Contenido en: ${tmp}`); return; }
          finally {
            try { fs.rmSync(tmp, { force: true }); }
            catch { /* ignore */ }
          }
        }
      }
    },
  };
}

// --- MAIN ---
/**
 * Why the updater must not run from `cwd`, or null when it may.
 *
 * Everything the updater keeps between runs is gitignored and cwd-relative:
 * the `.backups/` that `--rollback` restores, the `.template/` markers, the
 * single-use prompts under `.agents/prompts/`. Run from a linked worktree, all
 * of it lands in the worktree and dies with it, and the next run in the
 * primary sees none of it. So the updater runs in the primary checkout only.
 */
export function worktreeRefusal(cwd = process.cwd()): string | null {
  const roots = checkoutRoots(cwd);
  if (roots === null || !roots.linked) { return null; }
  return 'Este checkout es un worktree. `bun sync` guarda backups (para --rollback), marcadores y prompts '
    + 'dentro del checkout, y en un worktree se pierden al borrarlo. Ejecuta `bun sync` en el checkout '
    + `principal: ${roots.primaryRoot}`;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  noticeRenamedCommand();

  if (parsed.help) { process.stdout.write(HELP_TEXT); process.exit(0); }
  const refusal = worktreeRefusal();
  if (refusal !== null) {
    tui.log.error(refusal);
    tui.outro('Abortado.');
    process.exit(1);
  }
  if (parsed.adopt) {
    if (parsed.force || parsed.rollback || parsed.updateMcpTemplate || parsed.commands.length > 0) {
      tui.log.error('--adopt no se combina con --force, --rollback, --update-mcp-template ni subcomandos: adopta el boilerplate completo, sin sobrescribir nada.');
      process.exit(1);
    }
    // First-run only. A repo with a lock already went through a sync; on an
    // adopted one a second --adopt is the documented no-op.
    if (fs.existsSync(VERSION_FILE)) {
      if (isAdopted(process.cwd())) {
        tui.log.info(`Este repo ya está adoptado (${INSTALLER_LOCK_FILE}: adopted: true): nada que hacer. Para actualizarlo: bun sync.`);
        tui.outro('Sin cambios.');
        process.exit(0);
      }
      tui.log.error(`--adopt es solo para la primera corrida y este repo ya tiene ${VERSION_FILE}. Usa bun sync.`);
      tui.outro('Abortado.');
      process.exit(1);
    }
  }
  if (parsed.rollback) { rollbackFromBackup(); process.exit(0); }
  if (parsed.updateMcpTemplate) { await updateMcpTemplateForAgent(parsed.updateMcpTemplate); process.exit(0); }

  // The page opens on a real terminal with a screen; CI, a pipe, an agent or
  // SSH keep today's terminal flow, and so does `--headless`. A self-update
  // re-exec child picks up the page its parent opened (installer-ui plan §5-§6).
  let terminalSignal: AbortSignal | undefined;
  const terminalSink = buildSink(() => terminalSignal);
  try {
    activeUi = await startUpdaterUi({
      argv: process.argv.slice(2),
      repoRoot: process.cwd(),
      repoName: path.basename(process.cwd()),
      version: CLI_VERSION,
      terminal: terminalSink,
      setTerminalSignal: (sig) => { terminalSignal = sig; },
      onTerminalCancel: () => {
        tui.cancel('Aborted by user.');
        void closeUi('aborted', 130).then(() => process.exit(130));
      },
      diffFor: entry => buildPairedDiff(entry, UPSTREAM_DIR, process.cwd()),
      groupIgnoreLines: lines => groupIgnoreLines(lines),
      print: line => tui.log.info(line),
    });
  }
  catch (err) {
    tui.log.warn(`No se pudo abrir la página (${err instanceof Error ? err.message : String(err)}); la corrida sigue en la terminal.`);
  }
  const ui = activeUi;

  // PREFLIGHT (installer-ui preflight.md §3): what would fail halfway, in seconds.
  const migrationRows = (): PreflightCheck[] => {
    const plan = planHarnessMigration(process.cwd(), { adopt: parsed.adopt });
    if (!plan.needed && plan.blockers.length === 0) { return []; }
    return [{ id: 'harness-migration', group: ui?.lang === 'en' ? 'This machine' : 'Esta máquina', label: ui?.lang === 'en' ? 'Cross-harness migration' : 'Migración cross-harness', value: ui?.lang === 'en' ? 'pending' : 'pendiente', state: 'info', msg: describeHarnessMigration(plan).join(' · '), neededBy: 'fetch' }];
  };
  const preflightOpts = { cwd: process.cwd(), templateRepo: TEMPLATE_REPO, lockFile: VERSION_FILE, lang: ui?.lang ?? 'es' as const, extra: migrationRows() };
  const pre = await runUpPreflight(preflightOpts);
  printPreflight(pre);
  if (ui) {
    if (await ui.preflight(pre, async () => runUpPreflight(preflightOpts)) === 'abort') {
      tui.outro(ABORTED_OUTRO);
      await closeUi('aborted', 1);
      process.exit(1);
    }
  }
  else if (pre.verdict === 'block') {
    tui.outro(ABORTED_OUTRO);
    process.exit(pre.checks.some(c => c.id === 'git-version' && c.state === 'block') ? 2 : 1);
  }

  // No terminal on stdin (CI, a pipe, an agent's shell) and no explicit mode:
  // the Phase 3 multi-select would hang forever. Default to --auto and say so.
  // A page opened with `--ui` answers the questions itself, so it keeps them.
  if (!ui && !parsed.auto && !parsed.force && !parsed.interactive && !process.stdin.isTTY) {
    parsed.auto = true;
    tui.log.info('stdin no es una terminal: se asume --auto (pasa --interactive para conservar los prompts).');
  }

  // Filter components if sub-commands passed (e.g. `bun sync scripts`).
  let components = COMPONENTS;
  if (parsed.commands.length > 0 && !parsed.commands.includes('all')) {
    const requested = new Set(parsed.commands);
    components = COMPONENTS.filter(c => requested.has(c.name));
    if (components.length === 0) {
      tui.log.error('Ningun componente valido. Usa --help.');
      process.exit(1);
    }
  }

  const sink = ui?.sink ?? terminalSink;

  // Cross-harness migration: runs BEFORE any component is synced, on purpose.
  // A repo scaffolded when instructions lived in CLAUDE.md and skills in
  // .claude/skills/ must reach the canonical layout FIRST: AGENTS.md is on the
  // watchlist (never synced), so nothing downstream would ever create it, and
  // the compatibility hook refuses a real .claude/skills directory. Idempotent:
  // a migrated repo plans nothing. Under --dry-run it reports the plan only.
  // In the self-update re-exec child the plan is empty (already migrated), and
  // the parent's result arrives through the environment instead.
  // `--adopt`: an app whose `.gitignore` hides `.agents/` gets it re-included
  // FIRST, so neither the migration below nor the sync moves tracked app files
  // into a folder git ignores (`./lib/adopt-gitignore.ts`).
  if (parsed.adopt) {
    const reinclude = reincludeAgenticStore(process.cwd(), parsed.dryRun);
    if (reinclude.hidden.length > 0) {
      runFacts.reinclude = reinclude;
      const rules = [...new Set(reinclude.hidden.map(h => `${h.pattern} (${h.source})`))].join(', ');
      sink.step(`${parsed.dryRun ? '[dry-run] ' : ''}.gitignore de la app oculta ${SKILLS_CANONICAL_DIR.split('/')[0]}/ (${rules}): ${parsed.dryRun ? 'se añadiría' : 'añadido'} ${reinclude.added.join(' ')} en un bloque propio; las líneas de la app no cambian.`);
    }
  }
  const migration = runHarnessMigration(sink, parsed.dryRun, parsed.adopt) ?? readHarnessMigrationResultFromEnv();
  if (migration?.applied && runFacts.migration === null) { runFacts.migration = migration; }
  // What the preflight just wrote is the updater's own dirt: the dirty-tree
  // guard in runUpdate (and in the self-update re-exec child) must not refuse
  // a tree that was clean before `bun sync` started.
  const updaterOwnedPaths = migration ? harnessMigrationTouchedPaths(migration) : [];
  if (runFacts.reinclude !== null && runFacts.reinclude.added.length > 0 && !updaterOwnedPaths.includes('.gitignore')) {
    updaterOwnedPaths.push('.gitignore');
  }
  // Lock cursor BEFORE this run advances it: the parity prompt names both shas.
  const priorLockSha = readLock(process.cwd()).templateCommit;
  // Upstream watchlist + the project's own `updater.protected_paths`. Feeds the
  // never-overwrite rule (bootstrapOnlyPaths), the sparse checkout and the
  // drift rows below.
  const watchlist = resolveProtectedWatchlist(process.cwd(), msg => sink.warn(msg));
  const adoptedRepo = parsed.adopt || isAdopted(process.cwd());

  const cfg: UpdaterConfig = {
    templateRepo: TEMPLATE_REPO,
    cliVersion: CLI_VERSION,
    tempDir: TEMP_DIR,
    versionFile: VERSION_FILE,
    components,
    ignoreFiles: ['.gitignore', '.prettierignore'].map(p => ({ path: p, sentinel: '# ===== Synced from boilerplate' })),
    // Append-only per section: upstream-only keys are added, same-key/
    // different-value is reported FYI and NEVER overwritten. `dependencies` is
    // here because the `cli` component is synced wholesale and imports
    // packages declared only there — syncing the code without the package
    // leaves `bun sync` crashing on import. `lint-staged` is here because
    // `.husky/pre-commit` is synced and shells out to `bunx lint-staged`,
    // which reads its config from this file.
    packageJsonSpecs: [
      { path: 'package.json', sections: ['scripts', 'devDependencies', 'dependencies', 'lint-staged'] },
    ],
    // A retired path the project protects is its own file (an adopted app kept
    // its copy at that path): `cleanupDeprecated` never deletes it.
    deprecatedFiles: deprecatedFilesToClean(DEPRECATED_FILES, watchlist),
    // Every watched path is project-owned inside a synced component too:
    // delivered once when missing, never overwritten (`.husky/pre-push`, a
    // path from `updater.protected_paths`). Paths no component owns are
    // simply never walked.
    bootstrapOnlyPaths: [
      ...AGENTS_BOOTSTRAP_FILES.map(f => `.agents/${f}`),
      ...watchlist.map(e => e.path),
    ],
    agentsFrameworkFiles: AGENTS_FRAMEWORK_FILES,
    // Generated surfaces (see GENERATED_PATHS): never synced, never reported;
    // the afterApply hooks below rebuild them from their sources.
    // Plus the project-owned files inside synced components (PROJECT_OWNED_PATHS).
    // The retired harness launcher (ADR-0016) is reported as removable by the
    // parity table and never deleted, not even under `--force`.
    excludePaths: [...GENERATED_PATHS, ...PROJECT_OWNED_PATHS, RETIRED_HARNESS_LAUNCHER],
    // The boilerplate's own material — never delivered to consumers. Mirrored
    // in TEMPLATE_EXCLUDES (packages/create-agentic-dev/src/prepare.ts); see
    // the REPO_ONLY_PATHS comment for per-entry reachability reasoning.
    // Plus the files of a harness this project does not use (ADR-0013): it
    // deleted them on purpose, so no detection path re-delivers them.
    repoOnlyPaths: [...REPO_ONLY_PATHS, ...unusedHarnessPaths(process.cwd())],
    // An adopted app (this --adopt run, or any run after one): the
    // boilerplate's own numbered ADRs stay out of the app's decision log.
    ...(adoptedRepo ? { repoOnlyPatterns: ADOPT_REPO_ONLY_PATTERNS, adopted: true } : {}),
    // Watchlist files are NOT synced — included in the sparse clone only so
    // the protected-drift hook can read their upstream copies.
    sparseExtraPaths: watchlist.map(e => e.path),
    selfUpdateComponent: 'cli',
    promptFile: PARITY_PROMPT_PATH,
    hooks: {
      // The page survives the re-exec: the child binds the same port and token.
      ...(ui ? { beforeReexec: ui.beforeReexec } : {}),
      // Runs after files land but before tempDir cleanup → upstream `.env.example`
      // is still on disk for the diff. On dry-run only the read-only pieces
      // run (env keys, the parity table), nothing is regenerated or saved.
      // Each hook is isolated by composeHooks: one failure warns, never
      // aborts the rest.
      afterApply: parsed.dryRun
        ? composeHooks(
            sink,
            ...(parsed.adopt ? [makeAdoptHook(sink, true, true)] : []),
            async () => { runFacts.envNewKeys = computeEnvNewKeys(UPSTREAM_DIR); },
            // Read-only: records what the real run would add, writes nothing.
            makeHookMergeHook(UPSTREAM_DIR, sink, true),
            makePermissionListHook(UPSTREAM_DIR, sink, true, parsed.adopt),
            makeProjectInstructionsHook(sink, true),
            // A dry run neither ages nor writes the doctrine ledger.
            async () => { runFacts.doctrineDebt = runDoctrineLedger(process.cwd(), UPSTREAM_DIR, { dryRun: true }); },
            // Read-only detection so the preview's table matches the real run's.
            makePbiCacheMigrationHook({ promptOutPath: path.join(process.cwd(), PBI_MIGRATION_PROMPT_PATH), dryRun: true }, sink, (fact) => { runFacts.pbiCache = fact; }),
            makeParityHook(sink, priorLockSha, true, watchlist, adoptedRepo),
          )
        : composeHooks(
            sink,
            // --adopt: before everything else (instructions, project.yaml,
            // .env.example, installer lock), so the hooks below see the result.
            ...(parsed.adopt ? [makeAdoptHook(sink, false, parsed.auto)] : []),
            // Adopted app: what upstream owns in the shared namespaces, for the
            // tooling gates below and every later commit (`./lib/tooling-scope.ts`).
            ...(adoptedRepo ? [makeUpstreamOwnedHook(sink)] : []),
            // Hook groups before the compat check that requires them: a
            // sync must never leave the project failing its own gates.
            makeHookMergeHook(UPSTREAM_DIR, sink, false),
            // Alias next: a Claude Code session opened right after
            // the sync must already resolve skills through `.claude/skills`.
            makeAgentCompatibilityHook(sink),
            // Before the gates: `instructions:check` reads `agent-project.md`'s frontmatter.
            makeProjectInstructionsHook(sink, false),
            makeGatesHook(sink, !parsed.noGates, adoptedRepo, parsed.adopt),
            // After the compat check reads settings.json: this merge only ADDS
            // allow and deny entries, which no compatibility contract asserts on
            // (the hook groups, which one does, merged first).
            makePermissionListHook(UPSTREAM_DIR, sink, false, parsed.adopt),
            // The unresolved-doctrine ledger. Content-tracked, so unlike every
            // other watched-file nudge it survives `keep project` and clears
            // only when the section is actually written. Runs before the parity
            // hook, which folds its one row in.
            async () => { runFacts.doctrineDebt = runDoctrineLedger(process.cwd(), UPSTREAM_DIR); },
            async () => detectEnvVarDrift(UPSTREAM_DIR, sink, parsed.auto),
            // ONE schema-driven hook for `.agents/project.yaml`, replacing the
            // two hand-written ones (`git_strategy`, `automation_identity`).
            // Before the parity hook, so a block inserted here is not also
            // reported as a missing CONFIG_BLOCK_READERS block.
            async () => backfillProjectYamlFromSchema(UPSTREAM_DIR, sink, parsed.auto),
            // Legacy git-tracked PBI cache detection: the recipe goes to its
            // file, one parity row points at it; the hook NEVER mutates the
            // git index.
            makePbiCacheMigrationHook({ promptOutPath: path.join(process.cwd(), PBI_MIGRATION_PROMPT_PATH) }, sink, (fact) => { runFacts.pbiCache = fact; }),
            // Folds the watchlist drift (one nudge per upstream change;
            // AGENTS.md keeps the legacy CLAUDE.md marker), the compat check,
            // the gates, the migration archive and the rest into the single
            // parity report main() prints after runUpdate returns.
            makeParityHook(sink, priorLockSha, false, watchlist, adoptedRepo),
            // VERY LAST: rebuilds REGISTRY.md from whatever `.agents/skills/`
            // looks like once every other hook (parity included) has run. A
            // skill the parity hook just reported as "project edit
            // overwritten" still regenerates from the upstream content the
            // sync applied; that row's evidence tells the user to rerun this
            // same script by hand after they restore their own edit.
            makeSkillsRegistryHook(sink),
          ),
    },
  };

  // A re-exec child continues the parent's run: its intro is already on screen.
  if (process.env.UPEX_UPDATER_REEXEC !== '1') { tui.intro(tui.headline(`UPEX Boilerplate Updater v${CLI_VERSION}`)); }

  const summary = await runUpdate(cfg, sink, {
    auto: parsed.auto,
    dryRun: parsed.dryRun,
    rollback: false,
    force: parsed.force,
    updaterOwnedPaths,
    adopt: parsed.adopt,
  });

  // An aborted run has nothing to report: no table, no box, no success line.
  const aborted = summary.aborted === true;
  if (!aborted) { printEndOfRun(summary, parsed.dryRun); }
  if (parsed.adopt && !aborted && !parsed.dryRun) {
    tui.log.info(ADOPT_NEXT_STEP);
  }

  const verdict = runVerdict({ aborted, dryRun: parsed.dryRun, strict: parsed.strict }, runFacts.parity?.findings ?? []);
  if (verdict.reason) { tui.log.error(verdict.reason); }
  tui.outro(verdict.outro);
  if (ui) {
    const findings = runFacts.parity?.findings ?? [];
    const nonInteractive = parsed.auto || parsed.force;
    if (!aborted) {
      ui.report({
        dryRun: parsed.dryRun,
        auto: nonInteractive,
        aborted,
        applied: summary.applied.length,
        skipped: summary.skipped.length,
        failed: summary.failed.map(f => ({ path: f.entry.path, reason: f.reason })),
        upstreamSha: summary.newHeadSha,
        surfaces: runFacts.parity?.report.surfaces ?? [],
        findings,
        prompt: runFacts.parity?.report.prompt,
        promptPath: !parsed.dryRun && (summary.promptSaved || runFacts.promptKept) ? PARITY_PROMPT_PATH : null,
        commit: !parsed.dryRun && summary.newHeadSha && (summary.applied.length > 0 || (summary.lastApplyPaths ?? 0) > 0) ? suggestCommitMessage(summary) : null,
        extraNext: [
          ...(runFacts.aliasDeferred ? [{ title: 'Alias de skills pendiente', text: ALIAS_DEFERRED_NEXT_STEP }] : []),
          ...(parsed.adopt && !parsed.dryRun ? [{ title: 'Adopción', text: ADOPT_NEXT_STEP }] : []),
        ],
      });
    }
    const pending = (nonInteractive && summary.skipped.length > 0) || findings.length > 0;
    await closeUi(aborted ? 'aborted' : verdict.exitCode !== 0 ? 'failed' : pending ? 'done-with-pending' : 'done', verdict.exitCode);
  }
  if (verdict.exitCode !== 0) { process.exit(verdict.exitCode); }
}

// Guarded so tests can import COMPONENTS without kicking off a sync.
if (import.meta.main) {
  main().catch(async (err: unknown) => {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      tui.cancel('Aborted by user.');
      await closeUi('aborted', 130);
      process.exit(130);
    }
    if (err instanceof Error && err.name === 'UpdaterAbort') {
      await closeUi('aborted', 1);
      process.exit(1);
    }
    tui.log.error(err instanceof Error ? err.message : String(err));
    activeUi?.notice('error', err instanceof Error ? err.message : String(err));
    await closeUi('failed', 1);
    process.exit(1);
  });
}
