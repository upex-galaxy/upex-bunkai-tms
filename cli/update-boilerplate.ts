#!/usr/bin/env bun
/**
 * @fileoverview UPEX Boilerplate Updater v7 — thin wrapper.
 *
 * Drives the 5-phase delta sync via `runUpdate` in `./lib/updater-core.ts`.
 * Repo-specific concerns (DEV component registry, MCP template subsystem,
 * rollback flag) live here; everything else lives in core.
 */

import type { Component, DeprecatedFile, ReportSink, UpdaterConfig } from './lib/updater-types';
import { execSync, spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import pc from 'picocolors';
import { parseEnvFile } from './install';
import * as tui from './lib/tui';
import { cleanupTempDir, detectGitVersion, gitVersionMeetsMin, runUpdate } from './lib/updater-core';
import { DEPRECATED_VARS, parseDotEnvExampleKeys } from './lib/variables-manifest';

// --- CONFIGURATION ---
const CLI_VERSION = '7.0';
const TEMPLATE_REPO = 'upex-galaxy/agentic-dev-boilerplate';
const TEMP_DIR = path.join(os.tmpdir(), 'aicode-template-update');
const VERSION_FILE = '.template/boilerplate.lock.json';

const TOOLING_FILES = ['.editorconfig', '.prettierrc', '.gitattributes'];
const AGENTS_FRAMEWORK_FILES = ['README.md', 'jira-required.yaml'];
const AGENTS_BOOTSTRAP_FILES = ['project.yaml', 'jira-fields.json', 'jira-workflows.json', 'jira-link-types.json'];
const CLAUDE_CONFIG_FILES = ['settings.json'];

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

const COMPONENTS: Component[] = [
  { name: 'claude', type: 'directory', paths: ['.claude/skills', '.claude/commands'] },
  { name: 'claude-config', type: 'file-list', paths: ['.claude'], files: CLAUDE_CONFIG_FILES },
  { name: 'agents', type: 'mixed', paths: ['.agents'], bootstrapOnly: false },
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
  const aliases: Record<string, string> = { prompts: 'claude', books: 'claude', guidelines: 'context' };
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
  bun up claude agents                      # Multiples componentes
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

// --- CLAUDE.md UPSTREAM-DRIFT ADVISORY (afterApply hook) ---
//
// Root `CLAUDE.md` is a per-project file: heavily customized (project identity,
// env URLs, Jira fields, custom rules) and deliberately NOT a synced component —
// `bun up` never overwrites it. But the boilerplate's OWN `CLAUDE.md` keeps
// evolving (doctrine, behavioral rules, workflow conventions), so a downstream
// project would silently miss those improvements.
//
// This advisory NEVER edits `CLAUDE.md`. It prints a copy-paste prompt the user
// hands to their AI, which fetches the canonical `CLAUDE.md` and SEMANTICALLY
// merges the upstream improvements while preserving every project-specific value.
//
// Noise control: the local file ALWAYS differs from the generic upstream, so
// "they differ" alone would fire every run. Instead we fire ONLY when the
// upstream `CLAUDE.md` actually CHANGED since the last advice, tracked by a
// content hash in `.template/claude-md.upstream.sha`. One nudge per upstream
// change — never on dry-run (the whole afterApply hook is skipped there).

const CLAUDE_MD_SHA_MARKER = '.template/claude-md.upstream.sha';

/** Whitespace-insensitive normalization for the "already identical" short-circuit. */
function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '\n');
}

/**
 * Detect that the upstream `CLAUDE.md` improved since we last advised, and emit a
 * copy-paste AI prompt to merge those improvements into the local (per-project)
 * `CLAUDE.md`. Mirrors `detectEnvVarDrift` (reads upstream from `templateDir`,
 * never mutates the consumer file). `templateRepo` builds the canonical raw URL.
 */
async function detectClaudeMdDrift(
  templateDir: string,
  templateRepo: string,
  sink: ReportSink,
): Promise<void> {
  const upstreamPath = path.join(templateDir, 'CLAUDE.md');
  const localPath = path.join(process.cwd(), 'CLAUDE.md');
  // Need BOTH the boilerplate's canonical copy and the project's own.
  if (!fs.existsSync(upstreamPath) || !fs.existsSync(localPath)) { return; }

  let upstreamContent: string;
  let localContent: string;
  try {
    upstreamContent = fs.readFileSync(upstreamPath, 'utf8');
    localContent = fs.readFileSync(localPath, 'utf8');
  }
  catch { return; }

  // Project tracks the boilerplate verbatim → nothing to suggest.
  if (normalizeForCompare(upstreamContent) === normalizeForCompare(localContent)) { return; }

  // Fire only when the UPSTREAM file changed since our last advice.
  const upstreamSha = crypto.createHash('sha256').update(upstreamContent, 'utf8').digest('hex');
  const markerPath = path.join(process.cwd(), CLAUDE_MD_SHA_MARKER);
  let lastSha = '';
  try {
    if (fs.existsSync(markerPath)) { lastSha = fs.readFileSync(markerPath, 'utf8').trim(); }
  }
  catch { /* unreadable marker — treat as first advice */ }

  if (lastSha === upstreamSha) { return; } // no NEW upstream change since last nudge

  // Persist the marker FIRST so this is one nudge per upstream change, even if the
  // user ignores it (non-fatal if the write fails — worst case we advise again).
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${upstreamSha}\n`);
  }
  catch { /* non-fatal */ }

  const rawUrl = `https://raw.githubusercontent.com/${templateRepo}/main/CLAUDE.md`;
  const firstAdvice = lastSha === '';

  sink.warn(firstAdvice
    ? 'El `CLAUDE.md` del boilerplate trae mejoras que tu `CLAUDE.md` local podría no tener (es un archivo per-proyecto: el updater nunca lo sobrescribe).'
    : 'El `CLAUDE.md` del boilerplate cambió desde la última vez. Tu `CLAUDE.md` local no se actualiza solo (es per-proyecto).');
  sink.step('No tocamos tu `CLAUDE.md`. Copia el prompt de abajo y pégalo en tu IA para traer SOLO las mejoras, preservando lo específico de tu proyecto:');

  const prompt = [
    'Sync the local ./CLAUDE.md with the upstream boilerplate, pulling ONLY the improvements.',
    '',
    `1. Fetch the canonical boilerplate CLAUDE.md: ${rawUrl}`,
    `   (use your web-fetch tool, or run: curl -fsSL ${rawUrl})`,
    '2. Diff it against the local ./CLAUDE.md.',
    '3. Merge in ONLY the upstream improvements: new or updated rules, doctrine, behavioral guidance, workflow conventions, and sections this project lacks.',
    '4. PRESERVE every project-specific value verbatim — project identity, env URLs, Jira keys/fields, credential references, and any custom rule or section this project added. Never replace a local customization with a generic boilerplate placeholder.',
    '5. On any genuine conflict (same rule, divergent intent), surface it for my decision instead of silently overwriting. Keep the rule numbering coherent after merging.',
    '6. Show me a concise before/after diff of what you changed and why BEFORE writing the file.',
  ].join('\n');

  // Plain stdout (no log-prefix bullets) so the block copy-pastes cleanly.
  process.stdout.write(`\n${pc.dim('────────  COPY PROMPT BELOW  ────────')}\n${prompt}\n${pc.dim('────────  COPY PROMPT ABOVE  ────────')}\n\n`);
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
      const opts = options.map(o => ({ value: o.value, label: o.label }));
      const initialValues = options.filter(o => o.checked).map(o => o.value);
      const r = await tui.multiselect({
        message: `${file} — líneas nuevas en upstream (no en tu archivo):`,
        options: opts,
        initialValues,
        required: false,
      });
      return abortOnCancel<string[]>(r);
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

  const cfg: UpdaterConfig = {
    templateRepo: TEMPLATE_REPO,
    cliVersion: CLI_VERSION,
    tempDir: TEMP_DIR,
    versionFile: VERSION_FILE,
    components,
    ignoreFiles: ['.gitignore', '.prettierignore'].map(p => ({ path: p, sentinel: '# ===== Synced from boilerplate' })),
    packageJsonSpecs: [
      { path: 'package.json', sections: ['scripts', 'devDependencies'] },
    ],
    deprecatedFiles: DEPRECATED_FILES,
    bootstrapOnlyPaths: AGENTS_BOOTSTRAP_FILES.map(f => `.agents/${f}`),
    agentsFrameworkFiles: AGENTS_FRAMEWORK_FILES,
    // Generated, per-repo file inside the `claude` component (which owns
    // .claude/skills) — never synced; each repo rebuilds it from its own
    // installed skill set (regenerated in afterApply below).
    excludePaths: ['.claude/skills/REGISTRY.md'],
    selfUpdateComponent: 'cli',
    hooks: {
      // Runs after files land but before tempDir cleanup → upstream `.env.example`
      // is still on disk for the diff. Skipped on dry-run (no files were written).
      afterApply: async (summary) => {
        if (parsed.dryRun) { return; }
        // REGISTRY.md is excluded from the sync (generated, per-repo). When skills
        // changed this run, regenerate it locally so it reflects the actual skill
        // set — newly synced framework skills PLUS any local community skills the
        // boilerplate never ships. Otherwise skills:registry:check (pre-push)
        // would flag it stale after a sync that added or changed skills.
        if (summary.applied.some(a => a.entry.path.startsWith('.claude/skills/'))) {
          sink.step('Regenerando `.claude/skills/REGISTRY.md` (skills cambiaron)…');
          const res = spawnSync('bun', ['run', 'skills:registry'], { stdio: 'inherit' });
          if (res.status !== 0) {
            sink.warn('No se pudo regenerar REGISTRY.md. Ejecuta `bun run skills:registry` manualmente.');
          }
        }
        await detectEnvVarDrift(TEMP_DIR, sink, parsed.auto);
        await upsertGitStrategyBlock(TEMP_DIR, sink, parsed.auto);
        await detectClaudeMdDrift(TEMP_DIR, TEMPLATE_REPO, sink);
      },
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

main().catch((err: unknown) => {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    tui.cancel('Aborted by user.');
    process.exit(130);
  }
  tui.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
