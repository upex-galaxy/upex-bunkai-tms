#!/usr/bin/env bun
/**
 * @fileoverview UPEX Boilerplate Updater v8 — thin wrapper.
 *
 * Drives the 5-phase delta sync via `runUpdate` in `./lib/updater-core.ts`.
 * Repo-specific concerns (DEV component registry, MCP template subsystem,
 * rollback flag) live here; everything else lives in core.
 */

import type { CompatibilityCheck } from './lib/agent-compatibility.ts';
import type { ProtectedWatchEntry } from './lib/updater-drift';
import type { HarnessMigrationResult } from './lib/updater-harness-migration.ts';
import type { GateResult, HeldBackComponent, ParityFinding, ParityReport } from './lib/updater-parity';
import type { Component, DeprecatedFile, ReportSink, RunSummary, UpdaterConfig } from './lib/updater-types';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import pc from 'picocolors';
import { parseEnvFile } from './install';
import { checkAgentCompatibility, COMMAND_ALIAS_MANIFEST, repairAgentSurfaces, SKILLS_ALIAS_DEFERRED_MARKER } from './lib/agent-compatibility.ts';
import * as tui from './lib/tui';
import {
  cleanupTempDir,
  detectGitVersion,
  gitVersionMeetsMin,
  isLocalTemplateSource,
  LAST_APPLY_FILE,
  readSyncState,
  runUpdate,
  suggestCommitMessage,
  UPDATER_UPSTREAM_DIR_ENV,
} from './lib/updater-core';
import { detectProtectedDrift, persistMarkers } from './lib/updater-drift';
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
import {
  archivedSkillsToReport,
  collectParityFindings,
  PARITY_PROMPT_PATH,
  persistArchivedSkillMarkers,
  renderParityReport,
  runVerdict,
} from './lib/updater-parity';
import { makePbiCacheMigrationHook } from './lib/updater-pbi';
import { DEPRECATED_VARS, parseDotEnvExampleKeys } from './lib/variables-manifest';

// --- CONFIGURATION ---
// Not tied to the lock schema (`schemaVersion: 7` stays): it stamps the lock's
// `cliVersion` and the ignore-file sentinel header, which is matched by prefix.
const CLI_VERSION = '8.1';
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
const GATE_SCRIPTS = ['types:check', 'lint:check'] as const;

const TOOLING_FILES = ['.editorconfig', '.prettierrc', '.gitattributes'];
// `agentsFrameworkFiles` overrides bootstrapOnlyPaths for the `agents`
// component: a basename listed here is synced even when the path also matches
// a bootstrap-only entry. Keep it to files the boilerplate genuinely owns.
const AGENTS_FRAMEWORK_FILES = ['README.md'];
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
// entry; `.claude/commands` + `.opencode/commands` DO sync (component `commands`)
// and are then re-rendered from `.agents/compatibility/command-aliases.json`.
const GENERATED_PATHS = ['CLAUDE.md', `${SKILLS_CANONICAL_DIR}/REGISTRY.md`];

const MCP_TEMPLATE_AGENTS = ['claude', 'opencode', 'codex', 'gemini'] as const;
type McpAgent = typeof MCP_TEMPLATE_AGENTS[number];
const MCP_TEMPLATE_FILE: Record<McpAgent, string> = {
  claude: 'claude.template.json',
  opencode: 'opencode.template.json',
  codex: 'codex.template.toml',
  gemini: 'gemini.template.json',
};

const DEPRECATED_FILES: DeprecatedFile[] = [
  { path: '.prompts/setup/kata-framework-setup.md', component: 'prompts', reason: 'renamed to monorepo-for-qa-setup.md', deprecatedSince: '2026-04-28' },
  { path: '.prompts/setup/kata-architecture-adaptation.md', component: 'prompts', reason: 'renamed to test-framework-adaptation.md', deprecatedSince: '2026-04-28' },
];

export const COMPONENTS: Component[] = [
  // One source, three harnesses: skills, the hook emitter, the command-alias
  // manifest and the OpenCode hook adapter. `.claude/skills` is NOT here: it is
  // the generated alias, rebuilt by the afterApply compatibility hook.
  { name: 'agent-compatibility', type: 'directory', paths: [SKILLS_CANONICAL_DIR, '.agents/hooks', '.agents/compatibility', '.opencode/plugins'] },
  // Generated wrappers for both hosts. Synced so a consumer receives new aliases,
  // then re-rendered from the manifest so a hand edit never survives a run.
  { name: 'commands', type: 'directory', paths: ['.claude/commands', '.opencode/commands'] },
  { name: 'codex-config', type: 'directory', paths: ['.codex'], bootstrapOnly: true, frameworkFiles: CODEX_FRAMEWORK_FILES },
  // Delivered once when missing, then project-owned (watchlist). A file-list on
  // the `.claude` root: `.claude/commands` belongs to `commands`, `.claude/skills`
  // is the generated alias.
  { name: 'agent-root-config', type: 'file-list', paths: ['.claude'], files: CLAUDE_ROOT_CONFIG_FILES, bootstrapOnly: true },
  { name: 'agents', type: 'file-list', paths: ['.agents'], files: AGENTS_ROOT_FILES },
  { name: 'scripts', type: 'directory', paths: ['scripts'] },
  { name: 'cli', type: 'directory', paths: ['cli'] },
  { name: 'docs', type: 'directory', paths: ['docs'] },
  { name: 'context', type: 'directory', paths: ['.context'], bootstrapOnly: true, frameworkFiles: ['README.md'], frameworkFilesExcept: ['.context/ADR/README.md'] },
  { name: 'context-engineering', type: 'file-list', paths: ['.'], files: ['CONTEXT.md'] },
  { name: 'vscode', type: 'directory', paths: ['.vscode'] },
  { name: 'husky', type: 'directory', paths: ['.husky'] },
  { name: 'tooling', type: 'file-list', paths: ['.'], files: TOOLING_FILES },
  // .env.example carries no secrets (every value is empty / placeholder) so it
  // fast-forwards safely to targets. Shipping it is the prerequisite for the
  // env-var drift detection in the afterApply hook — we can only diff a target's
  // .env against an .env.example we actually delivered.
  { name: 'env-template', type: 'file-list', paths: ['.'], files: ['.env.example'] },
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
  /** Skip the post-apply quality gates (`types:check`, `lint:check`). */
  noGates: boolean
  /** Keep the prompts even when stdin is not a TTY (the default there is `--auto`). */
  interactive: boolean
  updateMcpTemplate: McpAgent | null
}

const isMcpAgent = (v: string): v is McpAgent => (MCP_TEMPLATE_AGENTS as readonly string[]).includes(v);

export function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = { commands: [], help: false, dryRun: false, rollback: false, auto: false, force: false, strict: false, noGates: false, interactive: false, updateMcpTemplate: null };
  const valid = new Set(COMPONENTS.map(c => c.name).concat(['all', 'help', 'rollback']));
  // Pre-cross-harness component names still typed from muscle memory.
  const aliases: Record<string, string> = {
    claude: 'agent-compatibility',
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
    else if (!a.startsWith('-')) { tui.log.error(`Comando/componente desconocido: ${a}. Usa --help para ver los validos.`); process.exit(1); }
  }
  return out;
}

// --- HELP ---
const HELP_TEXT = `
UPEX Boilerplate Updater v${CLI_VERSION} — Ayuda

USO:
  bun up [comando] [flags]

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
  CLAUDE.md (shim \`@AGENTS.md\`), .claude/skills (alias a .agents/skills),
  .claude/commands/*.md y .opencode/commands/*.md (wrappers). Tras cada sync se
  regeneran con la misma logica de \`bun run agents:compat\`.

REPORTE DE PARIDAD (al final de cada corrida, incluido --dry-run):
  Una tabla "Estado por superficie" (10 filas: instrucciones y config, skills,
  comandos, hooks, MCP, env, componentes, package.json, git, verificacion) y UN
  prompt para tu IA con cada diferencia frente a upstream (archivo + evidencia:
  secciones, claves, servidores, hunks) para que decidas fila por fila: keep
  project | take upstream | merge. Se guarda en ${PARITY_PROMPT_PATH}
  (gitignored, un solo uso; con --dry-run no se guarda). "take upstream" solo
  se sugiere cuando al proyecto le falta ese contenido por completo: una fila
  con servidores, claves, secciones o ediciones que solo tiene el proyecto
  sugiere "merge", nunca un reemplazo. Los archivos protegidos (AGENTS.md,
  .agents/project.yaml, .mcp.json, .claude/settings.json, …) nunca se
  sobrescriben: solo aparecen en ese reporte. .claude/settings.json y .codex/
  se entregan UNA vez si faltan. Un archivo sincronizado que el proyecto habia
  editado y la corrida sobrescribio gana una fila (backup en .backups/). Las
  claves de package.json que se mantienen locales ganan una fila cada una.
  Una corrida que no aplica nada deja el arbol byte-identico (el lock no se
  reescribe solo para cambiar la fecha). Un abort (arbol sucio, lock corrupto,
  clone fallido, migracion o self-update rechazados) termina en "Abortado." y
  exit 1, nunca en "Sincronizacion completada".

VERIFICACION POST-SYNC (gates):
  Tras aplicar archivos, corre \`types:check\` y \`lint:check\` de tu
  package.json (120 s cada uno; un gate que no termina se omite). Un gate roto
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

--dry-run CON SELF-UPDATE PENDIENTE:
  Si upstream trae un updater mas nuevo, --dry-run no escribe cli/: ejecuta el
  updater nuevo directamente desde el clon upstream contra este proyecto, asi
  el preview muestra lo que hara la corrida real (plan de migracion,
  componentes, tabla de paridad) y no la opinion del codigo viejo.

SIN TTY:
  Si stdin no es una terminal y no pasaste --auto ni --interactive, la corrida
  asume --auto y lo avisa en una linea, en vez de quedarse esperando en el
  multi-select de la Fase 3.

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
                                  compatibilidad roto: alias, wrappers, hooks,
                                  MCP). Por defecto solo avisa y sale 0. El
                                  drift de archivos protegidos nunca bloquea.
  --no-gates                      No corre types:check / lint:check tras aplicar
  --interactive                   Mantiene los prompts aunque stdin no sea TTY
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
  bun up                                    # Flujo interactivo (5 fases)
  bun up scripts                            # Un solo componente
  bun up agent-compatibility commands       # Multiples componentes
  bun up codex-config                       # Solo el adaptador de Codex
  bun up --auto                             # CI mode (seguro, preserva lo tuyo)
  bun up --force                            # Forzar todo del upstream (sin preguntar)
  bun up --dry-run                          # Preview (con el updater nuevo si hay self-update)
  bun up --auto --strict                    # CI: falla si queda un contrato roto
  bun up --auto --no-gates                  # Sin types:check / lint:check al final
  bun up --rollback                         # Restaurar backup
  bun up --update-mcp-template claude       # Refrescar MCP template
`;

// --- PREREQ ---
function ensureGitVersion(): void {
  try {
    const v = detectGitVersion();
    if (!gitVersionMeetsMin(v)) {
      tui.log.error(`git ${v.raw} detectado. Se requiere git >= 2.25.0.`);
      process.exit(2);
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tui.log.error(msg === 'GIT_NOT_FOUND' ? 'git no encontrado. Se requiere git >= 2.25.' : `git: ${msg}`);
    process.exit(2);
  }
}

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
  /** Post-apply quality gates (`types:check`, `lint:check`); empty when skipped. */
  gates: GateResult[]
  /** A no-op run left the previous run's prompt file untouched. */
  promptKept: boolean
  parity: { findings: ParityFinding[], report: ParityReport } | null
}
const runFacts: RunFacts = { compat: null, envNewKeys: [], migration: null, migrationPlanned: false, aliasDeferred: false, gates: [], promptKept: false, parity: null };

// --- ENV-VAR DRIFT DETECTION (afterApply hook) ---
/**
 * After a sync, diff the upstream `.env.example` (still sitting in the updater's
 * tempDir before cleanup) against the target's local `.env` + `.env.example`. If
 * upstream added keys the target lacks, warn and (interactive only) OFFER to run
 * `bun run setup --variables` so the user can populate them locally + push the
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
    sink.step('Para configurarlas localmente y subir el subconjunto de Vercel: bun run setup --variables');
    return;
  }

  const run = await sink.confirm(
    'Ejecutar `bun run setup --variables` ahora para configurar estas variables? (local + push opcional a Vercel, ambos gateados)',
    false,
  );
  if (!run) {
    sink.step('Omitido. Cuando quieras: bun run setup --variables');
    return;
  }

  // Hand off to the gated --variables flow. The flow itself owns the remote-push
  // confirm — we never push from here (D3).
  const res = spawnSync('bun', ['run', 'setup', '--variables'], { stdio: 'inherit' });
  if (res.status !== 0) {
    sink.warn('`bun run setup --variables` terminó con error o fue cancelado.');
  }
}

// --- GIT_STRATEGY UPSERT (afterApply hook) ---
//
// The `git_strategy:` block in `.agents/project.yaml` (git workflow definition,
// read by the git-flow-master skill) was added to the boilerplate AFTER some
// projects were already scaffolded. `.agents/project.yaml` is bootstrapOnly, so
// the regular sync NEVER overwrites it — a pre-feature project would silently
// stay without the block. This hook back-fills it ONCE, APPEND-ONLY.
//
// HARD CONSTRAINT: append-only. It NEVER edits, reorders, or deletes any
// existing line in the consumer's project.yaml — it only appends the missing
// block at EOF. This preserves every user-set value verbatim.
//
// Like detectEnvVarDrift, the upstream clone still sits in `tempDir` (cleanup
// happens after afterApply). We lift the `git_strategy:` block (with its leading
// comment header) out of the upstream copy and append it to the consumer's file.

/**
 * Extract the `git_strategy:` block from an upstream `.agents/project.yaml`,
 * INCLUDING the contiguous comment header immediately preceding it.
 *
 * Strategy: find the `git_strategy:` line, walk BACKWARDS over contiguous
 * leading `#` comment lines to capture the header, then walk FORWARDS over all
 * indented (space-prefixed) lines until the next top-level key or top-level
 * comment introducing another section. Returns the block as a trimmed string,
 * or null if no `git_strategy:` key exists upstream.
 */
function extractUpstreamGitStrategyBlock(upstreamYaml: string): string | null {
  const lines = upstreamYaml.split('\n');
  const keyIdx = lines.findIndex(l => l.startsWith('git_strategy:'));
  if (keyIdx === -1) { return null; }

  // Walk backwards over the contiguous comment header (stop at blank/non-comment).
  let start = keyIdx;
  while (start - 1 >= 0 && /^\s*#/.test(lines[start - 1])) { start -= 1; }

  // Walk forwards over indented body lines (block scalars, nested keys, lists).
  let end = keyIdx; // inclusive index of last block line
  for (let i = keyIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') { continue; } // blank lines inside the block are tolerated
    if (/^\s/.test(line)) { end = i; continue; } // indented → still part of the block
    break; // top-level key or top-level comment → block ended
  }

  return lines.slice(start, end + 1).join('\n').trimEnd();
}

/**
 * Back-fill a missing `git_strategy:` block into the consumer's
 * `.agents/project.yaml`. Mirrors detectEnvVarDrift's signature (tempDir, sink,
 * nonInteractive). Append-only; never modifies existing lines.
 */
async function upsertGitStrategyBlock(
  templateDir: string,
  sink: ReportSink,
  nonInteractive: boolean,
): Promise<void> {
  const consumerYaml = path.join(process.cwd(), '.agents', 'project.yaml');
  if (!fs.existsSync(consumerYaml)) { return; }

  let consumerContent: string;
  try {
    consumerContent = fs.readFileSync(consumerYaml, 'utf8');
  }
  catch {
    return; // unreadable consumer file — nothing to do.
  }

  // Already has a top-level git_strategy block → NO-OP. Never touch it.
  if (/^git_strategy:/m.test(consumerContent)) { return; }

  // Absent → pre-feature project. Lift the block from the upstream clone.
  const upstreamYaml = path.join(templateDir, '.agents', 'project.yaml');
  if (!fs.existsSync(upstreamYaml)) { return; }

  let block: string | null;
  try {
    block = extractUpstreamGitStrategyBlock(fs.readFileSync(upstreamYaml, 'utf8'));
  }
  catch {
    return; // unreadable upstream — skip.
  }
  if (!block) { return; }

  // CI / non-interactive: never modify the file — just flag it.
  if (nonInteractive) {
    sink.warn('Tu `.agents/project.yaml` no tiene el bloque `git_strategy` (definición del flujo de git).');
    sink.step('Modo --auto: ejecuta el updater de forma interactiva para agregarlo (o añádelo manualmente).');
    return;
  }

  // Interactive: OFFER to append (append-only — existing values untouched).
  const proceed = await sink.confirm(
    'Tu `.agents/project.yaml` no tiene el nuevo bloque `git_strategy` (definición del flujo de git). ¿Agregarlo ahora? (append-only — tus valores existentes nunca se modifican)',
    false,
  );
  if (!proceed) {
    sink.step('Omitido. Puedes agregar el bloque `git_strategy` más tarde.');
    return;
  }

  // APPEND ONLY — preserve the existing file verbatim, and prepend exactly one
  // blank line before the block regardless of the file's trailing-newline state:
  //  - ends with "\n"  → add "\n" (a blank line) then the block.
  //  - no trailing "\n" → add "\n\n" (close the last line + a blank line).
  const sep = consumerContent.endsWith('\n') ? '\n' : '\n\n';
  try {
    fs.appendFileSync(consumerYaml, `${sep}${block}\n`);
  }
  catch (err) {
    sink.warn(`No se pudo agregar el bloque \`git_strategy\`: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  sink.step('Bloque `git_strategy` agregado al final de `.agents/project.yaml` (append-only).');
  sink.step('Revisa la estrategia o ejecuta "set up our git strategy" en Claude (git-flow-master) para definir la tuya.');
}

// --- AUTOMATION_IDENTITY UPSERT (afterApply hook) ---
//
// `testing.automation_identity` declares WHICH account browser / HTTP automation
// logs in as during live-UI validation (variable NAMES only — values stay in
// `.env`). It was added to the boilerplate after some projects were scaffolded,
// and `.agents/project.yaml` is bootstrapOnly, so those projects would stay
// without the slot — and a missing slot is exactly what makes a stage subagent
// improvise a login. This hook back-fills it ONCE.
//
// Unlike `git_strategy` (a top-level block appended at EOF), this one is NESTED
// under `testing:`, so it is spliced in at the end of that block. Still additive:
// it only INSERTS lines, never edits, reorders, or deletes an existing one.

/**
 * Extract the `automation_identity:` sub-block (plus its contiguous comment
 * header) from an upstream `.agents/project.yaml`. Returns the block verbatim
 * with its original indentation, or null when the key is absent upstream.
 */
function extractUpstreamAutomationIdentityBlock(upstreamYaml: string): string | null {
  const lines = upstreamYaml.split('\n');
  const keyIdx = lines.findIndex(l => /^\s+automation_identity:/.test(l));
  if (keyIdx === -1) { return null; }

  const indent = (lines[keyIdx].match(/^\s*/) ?? [''])[0].length;

  // Walk backwards over the contiguous comment header at the SAME indent.
  let start = keyIdx;
  while (start - 1 >= 0 && new RegExp(`^\\s{${indent}}#`).test(lines[start - 1])) { start -= 1; }

  // Walk forwards while lines are indented deeper than the key itself.
  let end = keyIdx;
  for (let i = keyIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') { break; }
    const lineIndent = (line.match(/^\s*/) ?? [''])[0].length;
    if (lineIndent > indent) { end = i; continue; }
    break;
  }

  return lines.slice(start, end + 1).join('\n').trimEnd();
}

/**
 * Back-fill a missing `testing.automation_identity` block into the consumer's
 * `.agents/project.yaml`. Additive splice at the end of the `testing:` block.
 */
async function upsertAutomationIdentityBlock(
  templateDir: string,
  sink: ReportSink,
  nonInteractive: boolean,
): Promise<void> {
  const consumerYaml = path.join(process.cwd(), '.agents', 'project.yaml');
  if (!fs.existsSync(consumerYaml)) { return; }

  let consumerContent: string;
  try { consumerContent = fs.readFileSync(consumerYaml, 'utf8'); }
  catch { return; }

  // Already present → NO-OP. Never touch a slot the project already filled.
  if (/^\s+automation_identity:/m.test(consumerContent)) { return; }

  const consumerLines = consumerContent.split('\n');
  const testingIdx = consumerLines.findIndex(l => l.startsWith('testing:'));
  if (testingIdx === -1) {
    sink.warn('Tu `.agents/project.yaml` no tiene sección `testing:` — no se puede añadir `automation_identity` automáticamente.');
    return;
  }

  // Last line of the `testing:` block (contiguous indented lines).
  let insertAt = testingIdx;
  for (let i = testingIdx + 1; i < consumerLines.length; i += 1) {
    if (consumerLines[i].trim() === '') { continue; }
    if (/^\s/.test(consumerLines[i])) { insertAt = i; continue; }
    break;
  }

  const upstreamYaml = path.join(templateDir, '.agents', 'project.yaml');
  if (!fs.existsSync(upstreamYaml)) { return; }

  let block: string | null;
  try { block = extractUpstreamAutomationIdentityBlock(fs.readFileSync(upstreamYaml, 'utf8')); }
  catch { return; }
  if (!block) { return; }

  if (nonInteractive) {
    sink.warn('Tu `.agents/project.yaml` no declara `testing.automation_identity` (identidad de automatización para live-UI).');
    sink.step('Modo --auto: ejecuta el updater de forma interactiva para agregarlo (o añádelo manualmente).');
    return;
  }

  const proceed = await sink.confirm(
    'Tu `.agents/project.yaml` no declara `testing.automation_identity` (la cuenta con la que la automatización hace login en live-UI). ¿Agregar el slot ahora? (solo inserta líneas nuevas — tus valores existentes no se tocan)',
    false,
  );
  if (!proceed) {
    sink.step('Omitido. Sin este slot, /sprint-development se detendrá antes de cualquier validación live-UI.');
    return;
  }

  const next = [
    ...consumerLines.slice(0, insertAt + 1),
    ...block.split('\n'),
    ...consumerLines.slice(insertAt + 1),
  ].join('\n');

  try { fs.writeFileSync(consumerYaml, next); }
  catch (err) {
    sink.warn(`No se pudo agregar \`automation_identity\`: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  sink.step('Slot `testing.automation_identity` agregado a `.agents/project.yaml`.');
  sink.step('Rellena `email_var` / `password_var` / `scope` con una cuenta DEDICADA de no-producción y define esas variables en `.env`.');
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
  { path: '.agents/project.yaml', reason: 'per-project identity + env map, but upstream keeps ADDING structural blocks (e.g. git_strategy). A project scaffolded before a block existed never learns it should have one.' },
  { path: '.agents/jira-required.yaml', reason: 'methodology manifest: upstream owns the baseline work_types + field slugs, the project owns its fallbacks and omissions. It is the INPUT to jira:sync-workflows, which catalogs only the work_types declared in it — a stale manifest silently regenerates a truncated jira-workflows.json and still exits 0.' },
  { path: 'tsconfig.json', reason: 'path aliases are the contract every synced file imports through — a new upstream alias breaks synced code in a project whose tsconfig never learned it.' },
  { path: 'eslint.config.js', reason: 'lint rules evolve upstream and .husky/pre-commit (which IS synced) runs eslint against this local config.' },
  { path: '.mcp.json', reason: 'MCP registry with project-specific servers/vars' },
  { path: 'opencode.jsonc', reason: 'OpenCode MCP registry (paired with .mcp.json)' },
  { path: '.codex/config.toml', reason: 'Codex MCP registry (paired with .mcp.json / opencode.jsonc; `agents:compat:check` enforces parity across the three)' },
  { path: '.claude/settings.json', reason: 'project permissions and hook wiring; never overwritten' },
];

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

const PBI_MIGRATION_PROMPT_PATH = path.join('.agents', 'prompts', 'pbi-cache-migration-prompt.md');

// --- REPO-ONLY PATHS ---
//
// The boilerplate's OWN material: tracked in this repo, but it must never reach
// a consumer project via `bun run up`. Matched as exact path or segment-aware
// directory prefix (see `isRepoOnlyPath` in updater-core). Mirrored in
// TEMPLATE_EXCLUDES (packages/create-agentic-dev/src/prepare.ts) — the scaffold
// prunes them on first install and this keeps `bun run up` from putting them
// back on the next sync.
//
// Reachability per TEMPLATE_EXCLUDES entry (only sync-reachable ones live here):
//  - `.github/workflows/pages.yml` + `ci.yml`: no component syncs `.github`
//    TODAY, so these are defense-in-depth — the moment a `.github` component (or
//    a root file-list entry) appears, the guard already stands. Both workflows
//    run the boilerplate's own publishing / quality gates; a consumer defines
//    its own CI.
//  - `.context/business/business-*.md` + `.context/master-implementation-plan.md`:
//    REACHABLE. `.context` is a synced component with `bootstrapOnly: true`, so
//    a consumer missing the file gets a bootstrap copy — which would deliver the
//    maintainer's generated maps of THIS boilerplate. Consumers regenerate their
//    own via `/business-*-map` and `/master-implementation-plan`.
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
  '.context/business/business-data-map.md',
  '.context/business/business-feature-map.md',
  '.context/business/business-api-map.md',
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

// --- AGENT COMPATIBILITY (afterApply hook) ---
//
// Same engine as `bun run agents:compat`, imported from `cli/lib` so it travels
// with the self-updating `cli` component. Runs after EVERY apply, not only when
// skills changed: the alias is gitignored (a fresh clone has none), the
// wrappers are re-rendered from the manifest, and the check reports anything
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
    const deferSkillsAlias = runFacts.migration?.applied === true || migrationCommitPending(process.cwd());
    sink.step(deferSkillsAlias
      ? 'Regenerando wrappers de comandos (el alias .claude/skills espera al commit de la migración)…'
      : 'Regenerando superficies de Claude/OpenCode (alias .claude/skills, wrappers de comandos)…');
    const repair = repairAgentSurfaces(process.cwd(), { deferSkillsAlias });
    runFacts.compat = repair.check;
    runFacts.aliasDeferred = repair.aliasDeferred;
    if (repair.wrappersWritten === null) {
      sink.warn(`Sin ${COMMAND_ALIAS_MANIFEST}: los wrappers de comandos no se regeneraron (llega con el componente agent-compatibility).`);
    }
    if (repair.aliasDeferred) {
      sink.step(ALIAS_DEFERRED_NEXT_STEP);
    }
    if (repair.check.ok) {
      sink.step(`Compatibilidad lista: alias ${repair.alias?.status ?? 'pendiente'}; ${repair.wrappersWritten ?? 0} wrapper(s) actualizado(s).`);
      return;
    }
    sink.warn(`La compatibilidad agéntica quedó incompleta: ${repair.check.errors.length} contrato(s) roto(s). Detalle en la tabla de paridad al final (filas BLOCKING).`);
  };
}

// --- PARITY REPORT (afterApply hook, last) ---
//
// Folds everything the run learned into ONE set of findings: watched files
// that drifted (with sha markers so each upstream change nudges once), compat
// errors (blocking), MCP set per host, skills the migration archived, wrappers
// no manifest produced, components held back, env keys upstream added and the
// git_strategy provenance. Runs while the upstream clone is still on disk. The
// rendered table + prompt are printed by main() AFTER runUpdate returns, so
// they are the last thing on screen; the prompt (with full diffs) is saved to
// `.agents/prompts/parity-plan.md`.

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

function makeGatesHook(sink: ReportSink, enabled: boolean): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    if (!enabled || summary.applied.length === 0) { return; }
    const cwd = process.cwd();
    const scripts = packageScripts(cwd);
    const applied = summary.applied.map(a => a.entry.path);
    for (const script of GATE_SCRIPTS) {
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

function makeParityHook(sink: ReportSink, priorLockSha: string, dryRun: boolean): (summary: RunSummary) => Promise<void> {
  return async (summary: RunSummary): Promise<void> => {
    const cwd = process.cwd();
    const drifted = detectProtectedDrift(PROTECTED_WATCHLIST, UPSTREAM_DIR, cwd);
    // Markers FIRST: one nudge per upstream change even if the user ignores
    // it. A dry-run persists nothing: the real run will nudge.
    if (!dryRun) { persistMarkers(drifted, cwd); }

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
      }
    }
    const findings = collectParityFindings({
      root: cwd,
      upstreamDir: UPSTREAM_DIR,
      drift: drifted.map(d => ({ path: d.path, reason: d.reason })),
      compatErrors,
      archivedSkills,
      archivedSkillsDir,
      heldBack,
      envNewKeys: runFacts.envNewKeys,
      localEdits: (summary.localEditsOverwritten ?? []).map(edit => ({
        ...edit,
        backupPath: summary.backupDir ? path.join(summary.backupDir, edit.path) : null,
      })),
      packageJsonKept: summary.packageJsonKept ?? [],
      gates: runFacts.gates,
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
  const gates = summarizeGates(runFacts.gates);
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
function runHarnessMigration(sink: ReportSink, dryRun: boolean): HarnessMigrationResult | null {
  const plan = planHarnessMigration();
  if (!plan.needed && plan.blockers.length === 0) { return null; }

  tui.log.info('Migración cross-harness (Claude → Claude + OpenCode + Codex):');
  for (const line of describeHarnessMigration(plan)) { tui.log.message(`  · ${line}`); }

  // --dry-run must still SHOW this. Without it the preview would suggest the
  // project's memory is untouched while a real run promotes it to AGENTS.md
  // BEFORE syncing anything.
  if (dryRun) {
    if (plan.blockers.length > 0) {
      tui.log.warn(`Bloqueantes que detendrían la migración:\n  - ${plan.blockers.join('\n  - ')}`);
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
    return result;
  }
  catch (error) {
    tui.log.error(error instanceof Error ? error.message : String(error));
    tui.log.warn('El update se detuvo ANTES de tocar nada. Resuelve lo anterior y vuelve a correr `bun run up`.');
    process.exit(1);
  }
}

// --- SINK ---
function abortOnCancel<T>(v: T | symbol): T {
  if (tui.isCancel(v)) {
    throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' });
  }
  return v;
}

function buildSink(): ReportSink {
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
      const r = await tui.confirm({ message, initialValue: defaultValue });
      return abortOnCancel<boolean>(r);
    },

    pickScopes: async (scopes) => {
      if (scopes.length === 0) { return []; }
      const options = scopes.map(s => ({
        value: s.name,
        label: `${s.name} (${s.changedCount} cambiados${s.divergedCount > 0 ? `, ${s.divergedCount} divergente${s.divergedCount > 1 ? 's' : ''}` : ''})`,
      }));
      const r = await tui.multiselect({ message: 'Selecciona componentes a revisar:', options, required: false });
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
        message: `${scope} (${stats.changedCount} archivo(s)${divergedSuffix}${locSuffix}) — ¿como proceder?`,
        options: [
          { value: 'all', label: `aceptar todos (${stats.changedCount})` },
          { value: 'pick', label: 'elegir individualmente' },
          { value: 'skip', label: 'saltar scope completo' },
        ],
        initialValue: 'all',
      });
      return abortOnCancel<string>(r) as 'all' | 'pick' | 'skip';
    },

    pickFiles: async (scope, files) => {
      if (files.length === 0) { return []; }
      const options = files.map(f => ({ value: f.entry.path, label: f.label, hint: f.entry.classification }));
      const r = await tui.multiselect({ message: `Selecciona archivos en ${scope}:`, options, required: false });
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
      });
      // Expand atomic groups back into their individual lines for the core.
      return abortOnCancel<string[]>(r).flatMap(v => v.split('\n'));
    },

    resolvePackageJsonKey: async (file, section, key, drift) => {
      const body = `=== Tu versión (local) ===\n${drift.localValue}\n\n=== Versión del boilerplate (upstream) ===\n${drift.upstreamValue}`;
      tui.note(body, `${file} → ${section}.${key}`);
      const r = await tui.select({
        message: `${section}.${key} difiere — ¿qué hacemos?`,
        options: [
          { value: 'mine', label: 'Mantener la mía (predeterminado)' },
          { value: 'theirs', label: 'Actualizar a la del boilerplate' },
          { value: 'skip', label: 'Decidir después (preguntar de nuevo)' },
        ],
        initialValue: 'mine',
      });
      return abortOnCancel<string>(r) as 'theirs' | 'mine' | 'skip';
    },

    resolveDiverged: async (entry, diff) => {
      const body = `=== Cambios upstream ===\n${diff.templateDiff.trim() || '(sin diff)'}\n\n=== Tus cambios locales ===\n${diff.localDiff.trim() || '(sin diff)'}`;
      tui.note(body, `Divergencia en ${entry.path}`);
      const r = await tui.select({
        message: '¿Como resolver?',
        options: [
          { value: 'skip', label: 'skip (predeterminado — preservar tu version)' },
          { value: 'theirs', label: 'theirs (descartar locales, usar upstream)' },
          { value: 'mine', label: 'mine (conservar tu version explicitamente)' },
        ],
        initialValue: 'skip',
      });
      return abortOnCancel<string>(r) as 'skip' | 'theirs' | 'mine';
    },

    confirmDelete: async (entry) => {
      const r = await tui.confirm({ message: `¿Eliminar ${entry.path} localmente? (upstream lo borro)`, initialValue: false });
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
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) { process.stdout.write(HELP_TEXT); process.exit(0); }
  if (parsed.rollback) { rollbackFromBackup(); process.exit(0); }
  if (parsed.updateMcpTemplate) { await updateMcpTemplateForAgent(parsed.updateMcpTemplate); process.exit(0); }

  ensureGitVersion();
  await validatePrerequisites();

  // No terminal on stdin (CI, a pipe, an agent's shell) and no explicit mode:
  // the Phase 3 multi-select would hang forever. Default to --auto and say so.
  if (!parsed.auto && !parsed.force && !parsed.interactive && !process.stdin.isTTY) {
    parsed.auto = true;
    tui.log.info('stdin no es una terminal: se asume --auto (pasa --interactive para conservar los prompts).');
  }

  // Filter components if sub-commands passed (e.g. `bun run up scripts`).
  let components = COMPONENTS;
  if (parsed.commands.length > 0 && !parsed.commands.includes('all')) {
    const requested = new Set(parsed.commands);
    components = COMPONENTS.filter(c => requested.has(c.name));
    if (components.length === 0) {
      tui.log.error('Ningun componente valido. Usa --help.');
      process.exit(1);
    }
  }

  const sink = buildSink();

  // Cross-harness migration: runs BEFORE any component is synced, on purpose.
  // A repo scaffolded when instructions lived in CLAUDE.md and skills in
  // .claude/skills/ must reach the canonical layout FIRST: AGENTS.md is on the
  // watchlist (never synced), so nothing downstream would ever create it, and
  // the compatibility hook refuses a real .claude/skills directory. Idempotent:
  // a migrated repo plans nothing. Under --dry-run it reports the plan only.
  // In the self-update re-exec child the plan is empty (already migrated), and
  // the parent's result arrives through the environment instead.
  const migration = runHarnessMigration(sink, parsed.dryRun) ?? readHarnessMigrationResultFromEnv();
  if (migration?.applied && runFacts.migration === null) { runFacts.migration = migration; }
  // What the preflight just wrote is the updater's own dirt: the dirty-tree
  // guard in runUpdate (and in the self-update re-exec child) must not refuse
  // a tree that was clean before `bun run up` started.
  const updaterOwnedPaths = migration ? harnessMigrationTouchedPaths(migration) : [];
  // Lock cursor BEFORE this run advances it: the parity prompt names both shas.
  const priorLockSha = readLock(process.cwd()).templateCommit;

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
    // leaves `bun run up` crashing on import. `lint-staged` is here because
    // `.husky/pre-commit` is synced and shells out to `bunx lint-staged`,
    // which reads its config from this file.
    packageJsonSpecs: [
      { path: 'package.json', sections: ['scripts', 'devDependencies', 'dependencies', 'lint-staged'] },
    ],
    deprecatedFiles: DEPRECATED_FILES,
    bootstrapOnlyPaths: [...AGENTS_BOOTSTRAP_FILES.map(f => `.agents/${f}`), '.agents/compatibility/command-aliases.project.json'],
    agentsFrameworkFiles: AGENTS_FRAMEWORK_FILES,
    // Generated surfaces (see GENERATED_PATHS): never synced, never reported;
    // the afterApply hooks below rebuild them from their sources.
    excludePaths: GENERATED_PATHS,
    // The boilerplate's own material — never delivered to consumers. Mirrored
    // in TEMPLATE_EXCLUDES (packages/create-agentic-dev/src/prepare.ts); see
    // the REPO_ONLY_PATHS comment for per-entry reachability reasoning.
    repoOnlyPaths: REPO_ONLY_PATHS,
    // Watchlist files are NOT synced — included in the sparse clone only so
    // the protected-drift hook can read their upstream copies.
    sparseExtraPaths: PROTECTED_WATCHLIST.map(e => e.path),
    selfUpdateComponent: 'cli',
    promptFile: PARITY_PROMPT_PATH,
    hooks: {
      // Runs after files land but before tempDir cleanup → upstream `.env.example`
      // is still on disk for the diff. On dry-run only the read-only pieces
      // run (env keys, the parity table), nothing is regenerated or saved.
      // Each hook is isolated by composeHooks: one failure warns, never
      // aborts the rest.
      afterApply: parsed.dryRun
        ? composeHooks(
            sink,
            async () => { runFacts.envNewKeys = computeEnvNewKeys(UPSTREAM_DIR); },
            makeParityHook(sink, priorLockSha, true),
          )
        : composeHooks(
            sink,
            // Alias + wrappers first: a Claude Code session opened right after
            // the sync must already resolve skills through `.claude/skills`.
            makeAgentCompatibilityHook(sink),
            makeSkillsRegistryHook(sink),
            makeGatesHook(sink, !parsed.noGates),
            async () => detectEnvVarDrift(UPSTREAM_DIR, sink, parsed.auto),
            async () => upsertGitStrategyBlock(UPSTREAM_DIR, sink, parsed.auto),
            async () => upsertAutomationIdentityBlock(UPSTREAM_DIR, sink, parsed.auto),
            // Legacy git-tracked PBI cache detection: advisory + agent prompt
            // only — the hook NEVER mutates the git index.
            makePbiCacheMigrationHook({ promptOutPath: path.join(process.cwd(), PBI_MIGRATION_PROMPT_PATH) }, sink),
            // LAST: folds the watchlist drift (one nudge per upstream change;
            // AGENTS.md keeps the legacy CLAUDE.md marker), the compat check,
            // the gates, the migration archive and the rest into the single
            // parity report main() prints after runUpdate returns.
            makeParityHook(sink, priorLockSha, false),
          ),
    },
  };

  tui.intro(tui.headline(`UPEX Boilerplate Updater v${CLI_VERSION}`));

  const summary = await runUpdate(cfg, sink, {
    auto: parsed.auto,
    dryRun: parsed.dryRun,
    rollback: false,
    force: parsed.force,
    updaterOwnedPaths,
  });

  // An aborted run has nothing to report: no table, no box, no success line.
  const aborted = summary.aborted === true;
  if (!aborted) { printEndOfRun(summary, parsed.dryRun); }

  const verdict = runVerdict({ aborted, dryRun: parsed.dryRun, strict: parsed.strict }, runFacts.parity?.findings ?? []);
  if (verdict.reason) { tui.log.error(verdict.reason); }
  tui.outro(verdict.outro);
  if (verdict.exitCode !== 0) { process.exit(verdict.exitCode); }
}

// Guarded so tests can import COMPONENTS without kicking off a sync.
if (import.meta.main) {
  main().catch((err: unknown) => {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      tui.cancel('Aborted by user.');
      process.exit(130);
    }
    tui.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
