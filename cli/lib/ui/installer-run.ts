/**
 * @fileoverview One `bun setup` run (installer-ui plan §2-§5, delivery 3): the
 * reporter the installer emits into, the page when the run has a screen, and
 * the terminal it always prints to.
 *
 *   const ui = await startInstallerUi({...})       // never null: headless runs get a reporter too
 *   if (await ui.preflight(result, recheck) === 'abort') ...
 *   if (!await ui.confirmStart(result)) ...        // Q4: "Empezamos?" for setup only
 *   ui.phase('team'); const s = ui.step({...}); await ui.ask({...}); s.end('ok')
 *   ui.report({...}); await ui.finish('done', 0)
 *
 * One code path for both surfaces. The journal is the truth; the terminal is a
 * printer of the journal (injected, because the clack rendering lives outside
 * this import-closed directory). Headless = no browser sink: every question
 * goes straight to the terminal (`TerminalFallback` with no client probe).
 * Page = the page answers; the terminal asks only when no page has been
 * connected for 10 s (owner answer Q6). A non-interactive run (no TTY,
 * `--non-interactive`) answers every question with its default, as `auto`.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { BrowserSink } from './browser-sink.ts';
import type { UiDecision } from './env-detect.ts';
import type { AskKind, AskSpec, Check, EndStatus, JournalEntry, Lang, NextStep, PhaseDef, PhaseStatus, Tile } from './events.ts';
import type { AskEvent, AskInput, FailEvent, FailInput, StepHandle, StepInput } from './reporter.ts';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { startBrowserSink } from './browser-sink.ts';
import { decideUi, parseUiFlags } from './env-detect.ts';
import { Journal } from './events.ts';
import { openBrowser } from './open-browser.ts';
import { renderPage } from './page.ts';
import { Reporter } from './reporter.ts';
import { pickLang } from './strings.ts';
import { writeSummary } from './summary.ts';
import { KEEP_ALIVE_ENV, NO_OPEN_ENV } from './updater-run.ts';

// ----------------------------------------------------------------------------
// Copy (owner answer Q1: both languages)
// ----------------------------------------------------------------------------

const COPY = {
  es: {
    phases: [
      { id: 'pre', title: 'Chequeo previo', hint: 'herramientas, red, disco' },
      { id: 'team', title: 'Tu equipo', hint: 'qué agentes de IA usan' },
      { id: 'install', title: 'Instalar', hint: 'descargas, memoria, skills' },
      { id: 'project', title: 'Tu proyecto', hint: 'nombre, entornos, URLs' },
      { id: 'creds', title: 'Credenciales', hint: 'dónde y cuáles' },
      { id: 'jira', title: 'Conectar Jira', hint: 'sesión y catálogos' },
      { id: 'github', title: 'GitHub', hint: 'repositorio remoto' },
      { id: 'verify', title: 'Verificar', hint: 'que todo responda' },
      { id: 'done', title: 'Listo', hint: 'resumen y siguientes pasos' },
    ] as PhaseDef[],
    preWhy: 'Revisamos en unos segundos todo lo que los pasos siguientes van a necesitar. Lo que <b>bloquea</b> se arregla antes de empezar; lo demás es un aviso y puedes seguir. [[preflight|Qué es esto?]]',
    open: (url: string): string => `Página de la instalación: ${url}`,
    noClient: 'Ninguna página se conectó en 10 s: las preguntas siguen en esta terminal (la página puede abrirse igual con la URL de arriba).',
    keep: (url: string): string => `La página sigue en ${url} (Ctrl-C para cerrarla).`,
    blockTitle: 'El chequeo previo encontró algo que impide empezar',
    blockWhat: 'La instalación no empieza con un bloqueo abierto, así nada queda a medias.',
    recheck: 'Volver a comprobar',
    abort: 'Cancelar',
    startKicker: 'Antes de empezar',
    startTitle: 'Empezamos la instalación?',
    startWhy: 'Tarda unos minutos, casi todo en descargas, y las descargas corren mientras respondes lo demás. Puedes dejar esta pestaña abierta y volver: si algo necesita tu respuesta, lo verás arriba en naranja.',
    startWhyWarn: (n: number): string => `Hay ${n} aviso(s) arriba: el paso que afectan se salta o queda pendiente, y el resto sigue. Tarda unos minutos, casi todo en descargas.`,
    startYes: 'Empezar',
    startNo: 'Ahora no',
    startNoWarn: 'Prefiero arreglar los avisos primero',
  },
  en: {
    phases: [
      { id: 'pre', title: 'Preflight', hint: 'tools, network, disk' },
      { id: 'team', title: 'Your team', hint: 'which AI agents it uses' },
      { id: 'install', title: 'Install', hint: 'downloads, memory, skills' },
      { id: 'project', title: 'Your project', hint: 'name, environments, URLs' },
      { id: 'creds', title: 'Credentials', hint: 'where and which' },
      { id: 'jira', title: 'Connect Jira', hint: 'session and catalogs' },
      { id: 'github', title: 'GitHub', hint: 'remote repository' },
      { id: 'verify', title: 'Verify', hint: 'that everything answers' },
      { id: 'done', title: 'Done', hint: 'summary and next steps' },
    ] as PhaseDef[],
    preWhy: 'In a few seconds we check everything the next steps will need. What <b>blocks</b> gets fixed before starting; the rest is a warning and you can go on. [[preflight|What is this?]]',
    open: (url: string): string => `Install page: ${url}`,
    noClient: 'No page connected within 10 s: questions continue in this terminal (the page can still be opened with the URL above).',
    keep: (url: string): string => `The page stays at ${url} (Ctrl-C to close it).`,
    blockTitle: 'The preflight found something that stops the start',
    blockWhat: 'The install does not start with a block open, so nothing is left half done.',
    recheck: 'Check again',
    abort: 'Cancel',
    startKicker: 'Before starting',
    startTitle: 'Shall we start the install?',
    startWhy: 'It takes a few minutes, mostly downloads, and the downloads run while you answer the rest. You can leave this tab open and come back: anything that needs your answer shows up in orange at the top.',
    startWhyWarn: (n: number): string => `There are ${n} warning(s) above: the step each one affects is skipped or left pending, and the rest goes on. It takes a few minutes, mostly downloads.`,
    startYes: 'Start',
    startNo: 'Not now',
    startNoWarn: 'I would rather fix the warnings first',
  },
} as const;

export function installerPhases(lang: Lang): PhaseDef[] {
  return COPY[lang].phases.map(p => ({ ...p }));
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface InstallerTerminal {
  /** Renders one journal entry in the terminal. `page`: a page is serving this run. */
  print: (entry: JournalEntry, ctx: { page: boolean }) => void
  /** Asks one question in the terminal. Must stop (reject) when `signal` fires: the page answered first. */
  ask: (question: AskEvent | FailEvent, signal: AbortSignal) => Promise<unknown>
}

export interface InstallerUiOptions {
  argv: string[]
  repoRoot: string
  /** Shown in the page header ("· acme-qa"). */
  repoName: string
  version: string
  terminal: InstallerTerminal
  /** false: nobody can answer (no TTY, `--non-interactive`): every question takes its default, as `auto`. */
  interactive: boolean
  /** One plain line in the terminal (the URL, the no-page notice). */
  say: (line: string) => void
  env?: Record<string, string | undefined>
  stdinTTY?: boolean
  stdoutTTY?: boolean
  platform?: string
  open?: (url: string) => Promise<boolean>
  /** Q6 window, default 10 000 ms. */
  fallbackAfterMs?: number
  /** Port to try first (tests); default the browser sink's. */
  port?: number
}

export interface PreflightLike {
  checks: Check[]
  verdict: 'clear' | 'warn' | 'block'
  text: string
}

export interface InstallerReport {
  title: string
  tone: 'good' | 'warn' | 'bad'
  tiles: Tile[]
  next: NextStep[]
}

export interface InstallerUi {
  readonly reporter: Reporter
  readonly journal: Journal
  readonly lang: Lang
  /** A browser page serves this run. */
  readonly page: boolean
  readonly url: string | null
  readonly interactive: boolean
  readonly decision: UiDecision
  start: () => void
  /** Renders the checklist; on a block, waits for "check again" or "cancel". */
  preflight: (result: PreflightLike, recheck: () => Promise<PreflightLike>) => Promise<'go' | 'abort'>
  /** Q4: one confirmation before a run that downloads and writes for minutes. Non-interactive: true. */
  confirmStart: (result: PreflightLike) => Promise<boolean>
  phase: (id: string, why?: string) => void
  phaseEnd: (id: string, status?: PhaseStatus, note?: string) => void
  step: (input: StepInput) => StepHandle
  notice: (level: 'info' | 'warn' | 'error', text: string, phase?: string) => void
  ask: <T = unknown>(input: AskInput) => Promise<T>
  fail: (input: FailInput) => Promise<string>
  report: (r: InstallerReport) => void
  /** Ends the run; in page mode writes the saved summary and returns its repo-relative path. */
  finish: (status: EndStatus, exit: number) => Promise<string | null>
}

// ----------------------------------------------------------------------------
// The default answer of a question (non-interactive runs)
// ----------------------------------------------------------------------------

/** What a question resolves to when nobody can answer it. Always a value `validateAnswer` accepts. */
export function defaultAnswer(q: { kind: AskKind, spec: AskSpec, default?: unknown }): unknown {
  const spec = q.spec;
  const secondary = spec.secondary?.[0]?.value;
  const options = spec.options ?? [];
  switch (q.kind) {
    case 'confirm':
      return typeof q.default === 'boolean' ? q.default : false;
    case 'select':
    case 'divergence': {
      const d = options.find(o => o.value === q.default) ?? options.find(o => o.rec) ?? options[0];
      return d ? d.value : secondary;
    }
    case 'multi':
    case 'package-keys':
      return Array.isArray(q.default) ? q.default : options.filter(o => o.checked).map(o => o.value);
    case 'text':
      return Array.isArray(q.default) ? q.default : (spec.fields ?? []).map(f => f.value ?? '');
    case 'secret':
      return secondary ?? '';
    case 'files':
      return (spec.files ?? []).filter(f => f.checked !== false).map(f => f.path);
    case 'deletions':
      return [];
    default:
      return q.default;
  }
}

// ----------------------------------------------------------------------------
// Start
// ----------------------------------------------------------------------------

export async function startInstallerUi(o: InstallerUiOptions): Promise<InstallerUi> {
  const env = o.env ?? process.env;
  const lang = pickLang(env);
  const C = COPY[lang];
  const decision = decideUi(parseUiFlags(o.argv), {
    env,
    stdinTTY: o.stdinTTY ?? Boolean(process.stdin.isTTY),
    stdoutTTY: o.stdoutTTY ?? Boolean(process.stdout.isTTY),
    platform: o.platform ?? process.platform,
  });
  // `--ui` on a run nobody can answer would wait forever: a page needs a person.
  const wantPage = decision.surface === 'page' && o.interactive;
  const keepAlive = Boolean(env[KEEP_ALIVE_ENV]);

  const journal = new Journal();
  const reporter = new Reporter({
    cmd: 'setup',
    args: o.argv,
    repo: o.repoName,
    version: o.version,
    mode: 'interactive',
    lang,
    phases: installerPhases(lang),
    journal,
    fallbackAfterMs: o.fallbackAfterMs,
    // Non-interactive: no terminal prompt at all, the default answers (below).
    ...(o.interactive ? { fallback: { ask: async (q, signal) => o.terminal.ask(q, signal) } } : {}),
  });

  let server: BrowserSink | null = null;
  if (wantPage) {
    try {
      server = await startBrowserSink({
        journal,
        answer: (id, value) => reporter.answer(id, value, 'page'),
        page: ({ token }) => renderPage({ mode: 'live', lang, token }),
        ...(o.port ? { port: o.port } : {}),
        stopAfterEndMs: keepAlive ? null : 2_000,
      });
      reporter.attachClientProbe(() => server!.hasClient());
    }
    catch (err) {
      o.say(`${lang === 'en' ? 'Could not open the page' : 'No se pudo abrir la página'} (${err instanceof Error ? err.message : String(err)}).`);
      server = null;
    }
  }
  else if (decision.hint) {
    o.say(decision.hint);
  }
  const page = server !== null;

  journal.subscribe((entry) => {
    try { o.terminal.print(entry, { page }); }
    catch { /* a printing glitch never stops the run */ }
  });

  let currentPhase: string | null = null;
  let started = false;

  const ui: InstallerUi = {
    reporter,
    journal,
    lang,
    page,
    get url() { return server ? server.url : null; },
    interactive: o.interactive,
    decision,

    start: () => {
      if (started) { return; }
      started = true;
      reporter.start();
      if (!server) { return; }
      o.say(C.open(server.url));
      const opener = o.open ?? (async (url: string) => openBrowser(url, { checkout: o.repoRoot }));
      if (!env[NO_OPEN_ENV]) { void opener(server.url); }
      let seen = false;
      reporter.attachClientProbe(() => { if (server.hasClient()) { seen = true; } return false; });
      const timer = setTimeout(() => { if (!seen && !server.hasClient()) { o.say(C.noClient); } }, o.fallbackAfterMs ?? 10_000);
      timer.unref?.();
    },

    preflight: async (first, recheck) => {
      let result = first;
      ui.phase('pre', C.preWhy);
      let round = 0;
      for (;;) {
        reporter.preflight(result.checks, result.verdict, result.text);
        if (result.verdict !== 'block') { return 'go'; }
        if (!o.interactive) { return 'abort'; }
        round += 1;
        const blocks = result.checks.filter(c => c.state === 'block');
        const action = await reporter.fail({
          id: `pre-${round}`,
          step: 'pre',
          title: C.blockTitle,
          what: C.blockWhat,
          how: blocks.map(c => `${c.label}: ${c.msg ?? c.value ?? ''}`),
          actions: [{ value: 'recheck', label: C.recheck }, { value: 'abort', label: C.abort }],
        });
        if (action !== 'recheck') { return 'abort'; }
        result = await recheck();
      }
    },

    confirmStart: async (result) => {
      const warns = result.checks.filter(c => c.state === 'warn').length;
      const go = await ui.ask<boolean>({
        id: 'start',
        kind: 'confirm',
        phase: 'pre',
        kicker: C.startKicker,
        title: C.startTitle,
        why: warns > 0 ? C.startWhyWarn(warns) : C.startWhy,
        spec: { yes: C.startYes, no: warns > 0 ? C.startNoWarn : C.startNo },
        default: true,
      });
      return go;
    },

    phase: (id, why) => {
      currentPhase = id;
      reporter.phaseStart(id, why ? { why } : {});
    },

    phaseEnd: (id, status = 'done', note) => {
      reporter.phaseEnd(id, status, note);
      if (currentPhase === id) { currentPhase = null; }
    },

    step: input => reporter.step(input),

    notice: (level, text, phase) => { reporter.notice(level, text, phase ?? currentPhase ?? undefined); },

    ask: async <T = unknown>(input: AskInput): Promise<T> => {
      const withPhase: AskInput = { ...input, phase: input.phase ?? currentPhase ?? undefined };
      if (o.interactive) { return reporter.ask<T>(withPhase); }
      // Nobody can answer: show the question, then its default, as `auto`.
      const id = input.id ?? `auto-${journal.lastSeq + 1}`;
      const pending = reporter.ask<T>({ ...withPhase, id });
      const value = defaultAnswer({ kind: input.kind, spec: input.spec ?? {}, default: input.default });
      const r = reporter.answer(id, value, 'auto');
      if (!r.ok) { throw new Error(`No default answer for "${input.title}": ${r.message}`); }
      return pending;
    },

    fail: async (input) => {
      if (o.interactive) { return reporter.fail(input); }
      const id = input.id ?? `auto-${journal.lastSeq + 1}`;
      const pending = reporter.fail({ ...input, id });
      const last = input.actions[input.actions.length - 1];
      reporter.answer(id, last.value, 'auto');
      return pending;
    },

    report: (r) => {
      reporter.report({ title: r.title, tone: r.tone, tiles: r.tiles, next: r.next });
    },

    finish: async (status, exit) => {
      let path: string | null = null;
      if (server) {
        try { path = writeSummary({ repoRoot: o.repoRoot, cmd: 'setup', lang, journal: journal.all() }); }
        catch { /* a summary that cannot be written never fails the run */ }
      }
      reporter.end(status, exit, path ?? undefined);
      if (server && path) {
        try { writeFileSync(join(o.repoRoot, path), renderPage({ mode: 'saved', note: 'saved', lang, journal: journal.all() })); }
        catch { /* the first copy stays */ }
      }
      if (server) {
        if (keepAlive) { o.say(C.keep(server.url)); }
        await server.stopped;
      }
      return path;
    },
  };
  return ui;
}
