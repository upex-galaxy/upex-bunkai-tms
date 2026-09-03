#!/usr/bin/env bun
/**
 * @fileoverview UPEX Boilerplate Updater v7 — thin wrapper.
 *
 * Drives the 5-phase delta sync via `runUpdate` in `./lib/updater-core.ts`.
 * Repo-specific concerns (DEV component registry, MCP template subsystem,
 * rollback flag) live here; everything else lives in core.
 */

import type { ProtectedWatchEntry } from './lib/updater-drift';
import type { Component, DeprecatedFile, ReportSink, RunSummary, UpdaterConfig } from './lib/updater-types';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import pc from 'picocolors';
import { parseEnvFile } from './install';
import {
  checkAgentCompatibility,
  COMMAND_ALIAS_MANIFEST,
  repairClaudeSkillsAlias,
  repairCommandWrappers,
} from './lib/agent-compatibility.ts';
import * as tui from './lib/tui';
import { cleanupTempDir, detectGitVersion, gitVersionMeetsMin, runUpdate } from './lib/updater-core';
import { makeProtectedDriftHook } from './lib/updater-drift';
import {
  applyHarnessMigration,
  describeHarnessMigration,
  MIGRATION_BACKUP_DIR,
  planHarnessMigration,
} from './lib/updater-harness-migration.ts';
import { groupIgnoreLines } from './lib/updater-ignore';
import { makePbiCacheMigrationHook } from './lib/updater-pbi';
import { DEPRECATED_VARS, parseDotEnvExampleKeys } from './lib/variables-manifest';

// --- CONFIGURATION ---
const CLI_VERSION = '7.0';
const TEMPLATE_REPO = 'upex-galaxy/agentic-dev-boilerplate';
const TEMP_DIR = path.join(os.tmpdir(), 'aicode-template-update');
const VERSION_FILE = '.template/boilerplate.lock.json';

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
const CLAUDE_CONFIG_FILES = ['settings.json'];
// `.codex/` is bootstrapOnly: `config.toml` is the Codex MCP registry (the pair of
// `.mcp.json` / `opencode.jsonc`, both on the protected watchlist) and ships ONCE.
// The hook adapter carries no project state and keeps flowing.
const CODEX_FRAMEWORK_FILES = ['hooks.json'];

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
  { name: 'agent-root-config', type: 'file-list', paths: ['.claude'], files: CLAUDE_CONFIG_FILES },
  { name: 'codex-config', type: 'directory', paths: ['.codex'], bootstrapOnly: true, frameworkFiles: CODEX_FRAMEWORK_FILES },
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
  updateMcpTemplate: McpAgent | null
}

const isMcpAgent = (v: string): v is McpAgent => (MCP_TEMPLATE_AGENTS as readonly string[]).includes(v);

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = { commands: [], help: false, dryRun: false, rollback: false, auto: false, force: false, updateMcpTemplate: null };
  const valid = new Set(COMPONENTS.map(c => c.name).concat(['all', 'help', 'rollback']));
  // Pre-cross-harness component names still typed from muscle memory.
  const aliases: Record<string, string> = {
    'claude': 'agent-compatibility',
    'claude-config': 'agent-root-config',
    'prompts': 'agent-compatibility',
    'books': 'agent-compatibility',
    'guidelines': 'context',
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'help' || a === '--help' || a === '-h') { out.help = true; }
    else if (a === '--auto') { out.auto = true; }
    else if (a === '--dry-run') { out.dryRun = true; }
    else if (a === '--rollback' || a === 'rollback') { out.rollback = true; }
    else if (a === '--force') { out.force = true; }
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
  --dry-run solo muestra el plan.

SUPERFICIES GENERADAS (nunca se sincronizan ni se reportan como drift):
  CLAUDE.md (shim \`@AGENTS.md\`), .claude/skills (alias a .agents/skills),
  .claude/commands/*.md y .opencode/commands/*.md (wrappers). Tras cada sync se
  regeneran con la misma logica de \`bun run agents:compat\`.

FLAGS:
  --auto                          Modo no-interactivo: sincroniza TODO el
                                  boilerplate (copia archivos nuevos +
                                  sobreescribe divergencias con la versión
                                  upstream). NO borra archivos que upstream
                                  eliminó. El boilerplate es canónico (match 1:1).
  --force                         Como --auto pero TAMBIÉN borra archivos que el
                                  upstream eliminó. Hay backup + --rollback de
                                  respaldo.
  --dry-run                       Preview, sin escribir
  --rollback                      Restaura backup mas reciente
  --update-mcp-template <agent>   Refresca docs/mcp/<agent>.template.*
                                  (agentes: ${MCP_TEMPLATE_AGENTS.join(', ')})
  --help, -h                      Esta ayuda

EJEMPLOS:
  bun up                                    # Flujo interactivo (5 fases)
  bun up scripts                            # Un solo componente
  bun up agent-compatibility commands       # Multiples componentes
  bun up codex-config                       # Solo el adaptador de Codex
  bun up --auto                             # CI mode (seguro, preserva lo tuyo)
  bun up --force                            # Forzar todo del upstream (sin preguntar)
  bun up --dry-run                          # Preview
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
async function detectEnvVarDrift(
  templateDir: string,
  sink: ReportSink,
  nonInteractive: boolean,
): Promise<void> {
  const upstreamExample = path.join(templateDir, '.env.example');
  if (!fs.existsSync(upstreamExample)) { return; }

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

  const newKeys = upstreamKeys.filter(k => !localEnvKeys.has(k));

  // Deprecated keys still lingering as ACTIVE entries in the local `.env`.
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

// --- PROTECTED-FILE DRIFT ADVISORY (afterApply hook) ---
//
// Watchlist of files the updater NEVER syncs because every downstream project
// adapts them. When the boilerplate evolves one of them, the hook (in
// `./lib/updater-drift.ts`) prints an advisory + a copy-paste AI prompt for a
// surgical merge, and persists it to `.agents/prompts/` (gitignored). It never
// edits any watched file.
//
// Noise control: a local file ALWAYS differs from the generic upstream, so
// "they differ" alone would fire every run. The hook fires ONLY when the
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

const DRIFT_PROMPT_PATH = path.join('.agents', 'prompts', 'boilerplate-drift-prompt.md');
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
// the sync could not fix (a consumer's `.claude/settings.json` kept under
// --auto still pointing at the old hook, an MCP server added to one host only).
// Reports, never throws: the sync already landed, and a failed contract is
// something the user fixes with `bun run agents:compat`, not something to hide
// behind a generic "hook failed".
function makeAgentCompatibilityHook(sink: ReportSink): (summary: RunSummary) => Promise<void> {
  return async (): Promise<void> => {
    sink.step('Regenerando superficies de Claude/OpenCode (alias .claude/skills, wrappers de comandos)…');
    const alias = repairClaudeSkillsAlias();
    let wrappersWritten = 0;
    if (fs.existsSync(COMMAND_ALIAS_MANIFEST)) {
      wrappersWritten = repairCommandWrappers();
    }
    else {
      sink.warn(`Sin ${COMMAND_ALIAS_MANIFEST}: los wrappers de comandos no se regeneraron (llega con el componente agent-compatibility).`);
    }
    const check = checkAgentCompatibility();
    if (check.ok) {
      sink.step(`Compatibilidad lista: alias ${alias.status}; ${wrappersWritten} wrapper(s) actualizado(s).`);
      return;
    }
    sink.warn('La compatibilidad agéntica quedó incompleta:');
    for (const error of check.errors) { sink.warn(`  - ${error}`); }
    sink.step('Revisa lo anterior y ejecuta `bun run agents:compat` (o `agents:compat:check` para solo validar).');
  };
}

// --- CROSS-HARNESS MIGRATION (preflight) ---

/**
 * Reports what the cross-harness migration did, or exits with an actionable
 * message when it refuses. Nothing is deleted either way: content moves to its
 * canonical home or is archived under `.template/pre-agents-migration/`.
 */
function runHarnessMigration(sink: ReportSink, dryRun: boolean): void {
  const plan = planHarnessMigration();
  if (!plan.needed && plan.blockers.length === 0) { return; }

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
    return;
  }

  try {
    const result = applyHarnessMigration(process.cwd(), plan);
    if (!result.applied) { return; }
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
    if (result.unindexedFiles > 0) {
      sink.step(`${result.unindexedFiles} entrada(s) de .claude/skills quitadas del índice de git (solo el índice; el contenido ya vive en ${SKILLS_CANONICAL_DIR}/).`);
    }
    if (result.ignoredEntriesAdded.length > 0) {
      sink.step(`.gitignore: añadido ${result.ignoredEntriesAdded.join(', ')}.`);
    }
    tui.log.message(`  Copia de seguridad: ${MIGRATION_BACKUP_DIR}/ (gitignored). Revísala antes de borrarla.`);
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
  runHarnessMigration(sink, parsed.dryRun);

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
    bootstrapOnlyPaths: AGENTS_BOOTSTRAP_FILES.map(f => `.agents/${f}`),
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
    hooks: {
      // Runs after files land but before tempDir cleanup → upstream `.env.example`
      // is still on disk for the diff. Skipped entirely on dry-run (no files
      // were written, so there is nothing to regenerate or act on). Each hook
      // is isolated by composeHooks: one failure warns, never aborts the rest.
      afterApply: parsed.dryRun
        ? undefined
        : composeHooks(
            sink,
            // Alias + wrappers first: a Claude Code session opened right after
            // the sync must already resolve skills through `.claude/skills`.
            makeAgentCompatibilityHook(sink),
            makeSkillsRegistryHook(sink),
            async () => detectEnvVarDrift(TEMP_DIR, sink, parsed.auto),
            async () => upsertGitStrategyBlock(TEMP_DIR, sink, parsed.auto),
            async () => upsertAutomationIdentityBlock(TEMP_DIR, sink, parsed.auto),
            // Legacy git-tracked PBI cache detection: advisory + agent prompt
            // only — the hook NEVER mutates the git index.
            makePbiCacheMigrationHook({ promptOutPath: path.join(process.cwd(), PBI_MIGRATION_PROMPT_PATH) }, sink),
            // Generalized successor to the old CLAUDE.md-only advisory: same
            // one-nudge-per-upstream-change semantics, now across the whole
            // PROTECTED_WATCHLIST. AGENTS.md keeps the legacy CLAUDE.md marker.
            makeProtectedDriftHook({
              entries: PROTECTED_WATCHLIST,
              tempDir: TEMP_DIR,
              templateRepo: TEMPLATE_REPO,
              promptOutPath: path.join(process.cwd(), DRIFT_PROMPT_PATH),
            }, sink),
          ),
    },
  };

  tui.intro(tui.headline(`UPEX Boilerplate Updater v${CLI_VERSION}`));

  const summary = await runUpdate(cfg, sink, {
    auto: parsed.auto,
    dryRun: parsed.dryRun,
    rollback: false,
    force: parsed.force,
  });

  process.stdout.write(`${tui.successBox([
    `Aplicados:    ${summary.applied.length}`,
    `Saltados:     ${summary.skipped.length}`,
    `Con error:    ${summary.failed.length}`,
    `Avanzados:    ${summary.componentsAdvanced.join(', ') || '(ninguno)'}`,
    `Retenidos:    ${summary.componentsHeldBack.join(', ') || '(ninguno)'}`,
    'Git: si tu `git_strategy` está sin definir o es heredado, ejecuta "set up our git strategy" en Claude (git-flow-master).',
  ])}\n`);

  tui.outro(parsed.dryRun ? 'Dry-run completado.' : 'Sincronizacion completada.');
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
