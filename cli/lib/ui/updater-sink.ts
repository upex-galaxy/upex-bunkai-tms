/**
 * @fileoverview The updater's `ReportSink` over the reporter (installer-ui plan §4,
 * delivery 2): every call of `runUpdate` becomes a journal event, and every
 * question becomes a card in the page.
 *
 * Two sinks, one run. The terminal sink (today's clack rendering, built by the
 * wrapper) keeps printing every log line, because the terminal always shows the
 * log (owner decision D3). Questions move to the page; the terminal sink asks
 * one only when no page has been connected for 10 s (owner answer Q6), and the
 * prompt is aborted the moment the page answers first.
 *
 * Read-only runs (an explicit `--auto` shown in the page) never put a question
 * in the page: the core asks nothing under `--auto`, and if a future call does,
 * the terminal sink answers it as it would without a page.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 * Type-only imports from the updater; node built-ins and sibling files at run time.
 */

import type { DeltaEntry, IgnoreLineOption, PackageJsonKeyOption, PairedDiff, ReportSink, ScopeOption } from '../updater-types.ts';
import type { AskOption, FileRow, Lang, PhaseDef, StepStatus } from './events.ts';
import type { AskEvent, AskInput, FailEvent, Reporter, StepHandle } from './reporter.ts';

// ----------------------------------------------------------------------------
// Copy (owner answer Q1: both languages)
// ----------------------------------------------------------------------------

const COPY = {
  es: {
    phases: (auto: boolean): PhaseDef[] => [
      { id: 'pre', title: 'Chequeo previo', hint: 'git, gh, red, disco' },
      { id: 'fetch', title: 'Traer novedades', hint: 'desde upstream' },
      { id: 'self', title: 'Actualizar el actualizador', hint: 'si cambió' },
      { id: 'detect', title: 'Detectar cambios', hint: 'qué es nuevo y qué es tuyo' },
      { id: 'scope', title: auto ? 'Aplicar todo' : 'Elegir qué traer', hint: auto ? 'sin preguntas' : 'áreas y archivos' },
      { id: 'apply', title: 'Aplicar y verificar', hint: 'escribir, comprobar' },
      { id: 'report', title: 'Reporte', hint: 'paridad y resumen' },
    ],
    why: {
      pre: 'Comprobamos en segundos lo que haría fallar la actualización a mitad de camino. Nada se escribe todavía. [[preflight|Qué es esto?]]',
      fetch: 'Descargamos la versión actual del boilerplate ([[upstream|upstream]]) en una carpeta temporal. Tu proyecto no se toca todavía.',
      self: 'La versión nueva trae cambios en el propio actualizador. El proceso se reinicia con el código nuevo para que haga el resto. [[selfupdate|Por qué?]]',
      detect: 'Comparamos cada archivo con la versión anterior del boilerplate y con la tuya, para separar lo nuevo de lo que tú editaste.',
      scope: 'Tú decides qué entra. Nada se escribe hasta que respondas todo lo de esta fase.',
      scopeAuto: 'En modo automático se trae todo lo nuevo. Lo que exige decidir no se toca.',
      apply: 'Escribimos los cambios, mezclamos tu configuración sin borrar lo tuyo y corremos las comprobaciones del proyecto.',
      report: 'Lo que quedó distinto entre tu proyecto y el boilerplate, y por qué. [[parity|Qué es esto?]]',
    },
    confirmKicker: 'Confirmación',
    yes: 'Sí',
    no: 'No',
    scopesKicker: 'Áreas',
    scopesTitle: 'Qué áreas quieres actualizar ahora?',
    scopesWhy: 'Puedes traer solo una parte y volver por el resto en otra pasada. Los números dicen cuántos archivos cambian en cada área.',
    scopesDesc: (n: number, d: number): string => `${n} archivo(s)${d > 0 ? ` · ${d} [[divergence|cambió en los dos lados]]` : ''}`,
    scopesCta: 'Ver archivos',
    filesKicker: 'Archivos',
    filesTitle: (scope: string): string => `Cambios en ${scope}. Revisa los que quieras antes de aplicar.`,
    filesWhy: 'Abre cualquier archivo con <b>Ver cambios</b>. Lo que desmarques se queda como está y aparece de nuevo la próxima vez. Nada se escribe hasta el final.',
    filesCta: 'Aplicar selección',
    kindNew: 'Nuevo',
    kindMod: 'Modificado',
    kindDel: 'Borrado arriba',
    divKicker: 'Cambió en los dos lados',
    divWhy: 'Tú editaste este archivo y el boilerplate también lo cambió. Tomar una sola versión pierde el otro cambio.',
    divMineMeta: 'tus cambios',
    divTheirsMeta: 'cambios del boilerplate',
    divSkip: 'Decidir después',
    divSkipDesc: 'No se toca ahora; la próxima corrida lo vuelve a preguntar.',
    divMine: 'Quedarme con lo mío',
    divMineDesc: 'Tu archivo no cambia.',
    divTheirs: 'Tomar la versión nueva',
    divTheirsDesc: 'Se pierden tus cambios (quedan en la copia de seguridad, <code>bun sync --rollback</code>).',
    divCta: 'Resolver',
    delKicker: 'Ya no existe arriba',
    delTitle: (p: string): string => `El boilerplate quitó ${p}. Lo borramos también aquí?`,
    delWhy: 'Por defecto se conserva. Bórralo solo si no lo usas: si tu proyecto lo modificó, es tuyo.',
    delYes: 'Borrarlo',
    delNo: 'Conservarlo',
    ignoreKicker: 'Líneas nuevas',
    ignoreTitle: (f: string): string => `${f}: líneas nuevas del boilerplate`,
    ignoreWhy: 'Se agregan al final de tu archivo; nada tuyo se borra. Las líneas ligadas van todas o ninguna.',
    ignoreLinked: (n: number): string => `+${n} línea(s) ligadas, todo o nada`,
    pkgKicker: 'package.json',
    pkgTitle: (f: string, s: string): string => `${f} · ${s}: claves nuevas del boilerplate`,
    pkgWhy: 'Se agregan sin tocar las tuyas. Si entra una dependencia nueva, corre <code>bun install</code> al terminar.',
    pkgKeyTitle: (s: string, k: string): string => `${s}.${k} es distinto en tu proyecto`,
    pkgKeyWhy: 'Tu valor y el del boilerplate no coinciden. Elige con cuál te quedas.',
    pkgMine: 'Mantener la mía',
    pkgTheirs: 'Actualizar a la del boilerplate',
    pkgSkip: 'Decidir después',
    cta: 'Continuar',
    writesTitle: 'Escribir archivos',
    writesNote: (n: number): string => `${n} archivo(s)`,
  },
  en: {
    phases: (auto: boolean): PhaseDef[] => [
      { id: 'pre', title: 'Preflight', hint: 'git, gh, network, disk' },
      { id: 'fetch', title: 'Fetch updates', hint: 'from upstream' },
      { id: 'self', title: 'Update the updater', hint: 'if it changed' },
      { id: 'detect', title: 'Detect changes', hint: 'what is new and what is yours' },
      { id: 'scope', title: auto ? 'Apply everything' : 'Choose what to bring', hint: auto ? 'no questions' : 'areas and files' },
      { id: 'apply', title: 'Apply and verify', hint: 'write, check' },
      { id: 'report', title: 'Report', hint: 'parity and summary' },
    ],
    why: {
      pre: 'We check in seconds what would make the update fail halfway. Nothing is written yet. [[preflight|What is this?]]',
      fetch: 'We download the current boilerplate ([[upstream|upstream]]) into a temporary folder. Your project is not touched yet.',
      self: 'The new version changes the updater itself. The process restarts with the new code so it does the rest. [[selfupdate|Why?]]',
      detect: 'We compare every file with the previous boilerplate version and with yours, to tell what is new from what you edited.',
      scope: 'You decide what comes in. Nothing is written until you answer everything in this phase.',
      scopeAuto: 'Automatic mode brings everything new. Anything that needs a decision is left alone.',
      apply: 'We write the changes, merge your configuration without removing yours, and run the project checks.',
      report: 'What is still different between your project and the boilerplate, and why. [[parity|What is this?]]',
    },
    confirmKicker: 'Confirmation',
    yes: 'Yes',
    no: 'No',
    scopesKicker: 'Areas',
    scopesTitle: 'Which areas do you want to update now?',
    scopesWhy: 'You can bring one part now and the rest in another pass. The numbers say how many files change in each area.',
    scopesDesc: (n: number, d: number): string => `${n} file(s)${d > 0 ? ` · ${d} [[divergence|changed on both sides]]` : ''}`,
    scopesCta: 'See files',
    filesKicker: 'Files',
    filesTitle: (scope: string): string => `Changes in ${scope}. Review any of them before applying.`,
    filesWhy: 'Open any file with <b>Show changes</b>. What you untick stays as it is and comes back next time. Nothing is written until the end.',
    filesCta: 'Apply selection',
    kindNew: 'New',
    kindMod: 'Modified',
    kindDel: 'Removed upstream',
    divKicker: 'Changed on both sides',
    divWhy: 'You edited this file and the boilerplate changed it too. Taking one version loses the other change.',
    divMineMeta: 'your changes',
    divTheirsMeta: 'boilerplate changes',
    divSkip: 'Decide later',
    divSkipDesc: 'Left alone now; the next run asks again.',
    divMine: 'Keep mine',
    divMineDesc: 'Your file does not change.',
    divTheirs: 'Take the new version',
    divTheirsDesc: 'Your changes are lost (they stay in the backup, <code>bun sync --rollback</code>).',
    divCta: 'Resolve',
    delKicker: 'Gone upstream',
    delTitle: (p: string): string => `The boilerplate removed ${p}. Delete it here too?`,
    delWhy: 'Kept by default. Delete it only if you do not use it: if your project changed it, it is yours.',
    delYes: 'Delete it',
    delNo: 'Keep it',
    ignoreKicker: 'New lines',
    ignoreTitle: (f: string): string => `${f}: new lines from the boilerplate`,
    ignoreWhy: 'They are appended to your file; nothing of yours is removed. Linked lines go all or none.',
    ignoreLinked: (n: number): string => `+${n} linked line(s), all or none`,
    pkgKicker: 'package.json',
    pkgTitle: (f: string, s: string): string => `${f} · ${s}: new keys from the boilerplate`,
    pkgWhy: 'They are added without touching yours. If a new dependency comes in, run <code>bun install</code> afterwards.',
    pkgKeyTitle: (s: string, k: string): string => `${s}.${k} differs in your project`,
    pkgKeyWhy: 'Your value and the boilerplate one do not match. Pick the one to keep.',
    pkgMine: 'Keep mine',
    pkgTheirs: 'Update to the boilerplate one',
    pkgSkip: 'Decide later',
    cta: 'Continue',
    writesTitle: 'Write files',
    writesNote: (n: number): string => `${n} file(s)`,
  },
} as const;

/** The page phases of `bun sync`, in the run's language. */
export function updaterPhases(lang: Lang, auto: boolean): PhaseDef[] {
  return COPY[lang].phases(auto);
}

/** The `why` line of a page phase of `bun sync`. */
export function updaterPhaseWhy(lang: Lang, id: string, auto = false): string | undefined {
  const why = COPY[lang].why as Record<string, string>;
  return id === 'scope' && auto ? why.scopeAuto : why[id];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;?]*[A-Z]/gi;
const DIFF_LINES = 300;

/** A diff string as page lines: colours stripped, capped so one card never carries a whole file. */
export function diffLines(diff: string): string[] {
  const lines = diff.replace(ANSI, '').replace(/\s+$/, '').split('\n').filter(l => l.length > 0);
  if (lines.length <= DIFF_LINES) { return lines; }
  return [...lines.slice(0, DIFF_LINES), `… ${lines.length - DIFF_LINES}`];
}

/** Updater phase number -> page phase id. 3 SCOPE and 4 FILES share one page phase. */
const PHASE_BY_NUMBER: Record<number, string> = { 1: 'fetch', 2: 'detect', 3: 'scope', 4: 'scope', 5: 'apply' };
const ORDER = ['pre', 'fetch', 'self', 'detect', 'scope', 'apply', 'report'];

export interface IgnoreGroup { atomic: boolean, lines: string[] }

export interface UpdaterPageSinkOptions {
  reporter: Reporter
  /** Today's terminal sink: mirrors every log line, answers when no page is connected (Q6). */
  terminal: ReportSink
  /** The wrapper's way to cancel the terminal prompt that is waiting when the page answers first. */
  setTerminalSignal?: (signal: AbortSignal | undefined) => void
  /** Ctrl-C at a terminal fallback prompt (not the page answering first): the person cancelled the run. */
  onTerminalCancel?: () => void
  /** Paired diff of one delta entry, for the inline "show changes" of the files card. */
  diffFor?: (entry: DeltaEntry) => PairedDiff | null
  /** Groups ignore-file lines that must travel together (`groupIgnoreLines` of the updater). */
  groupIgnoreLines?: (lines: string[]) => IgnoreGroup[]
  auto?: boolean
}

export interface UpdaterPageSink extends ReportSink {
  /** Opens a page phase by id (pre, report), closing the open one. */
  enter: (id: string) => void
  /** Closes the open phase and marks the phases never entered as skipped. */
  closeAll: (status?: 'done' | 'failed') => void
  /** The page phase open right now. */
  readonly current: string | null
  /** Q6 terminal fallback: the reporter calls it when no page has been connected for 10 s. */
  fallbackAsk: (question: AskEvent | FailEvent, signal: AbortSignal) => Promise<unknown>
  /** Registers the terminal answer of a question asked outside this sink (the preflight's fail card). */
  onFallback: (id: string, fn: (signal: AbortSignal) => Promise<unknown>) => void
}

// ----------------------------------------------------------------------------
// The sink
// ----------------------------------------------------------------------------

export function createUpdaterPageSink(o: UpdaterPageSinkOptions): UpdaterPageSink {
  const r = o.reporter;
  const lang = r.opts.lang;
  const C = COPY[lang];
  const t = o.terminal;
  const readonly = r.opts.mode === 'readonly';
  const fallbacks = new Map<string, (signal: AbortSignal) => Promise<unknown>>();
  const entered = new Set<string>();
  let current: string | null = null;
  // After a self-update the child continues the parent's journal: same phases, same open one.
  for (const e of r.journal.all()) {
    if (e.t === 'phase.start') { entered.add(e.id); current = e.id; }
    if (e.t === 'phase.end' && e.id === current) { current = null; }
  }
  let warned = false;
  let counter = 0;
  // Ids carry the pid: after a self-update the child continues the parent's
  // journal, and an id the parent already used would be refused (or mislabel a row).
  const uid = (kind: string): string => { counter += 1; return `${kind}${process.pid}-${counter}`; };

  const enter = (id: string): void => {
    closeWrites();
    if (current === id) { return; }
    // Never back: the child of a self-update fetches again, inside the restart phase.
    if (current && ORDER.indexOf(id) < ORDER.indexOf(current)) { return; }
    if (current) { r.phaseEnd(current, warned ? 'warn' : 'done'); }
    // A phase the run went past without entering (no self-update) is skipped, not pending.
    const at = ORDER.indexOf(id);
    for (const p of ORDER.slice(0, Math.max(0, at))) {
      if (!entered.has(p)) { entered.add(p); r.phaseEnd(p, 'skipped'); }
    }
    entered.add(id);
    current = id;
    warned = false;
    r.phaseStart(id, { why: updaterPhaseWhy(lang, id, o.auto) });
  };

  const closeAll = (status: 'done' | 'failed' = 'done'): void => {
    closeWrites();
    if (current) { r.phaseEnd(current, status === 'failed' ? 'failed' : warned ? 'warn' : 'done'); }
    current = null;
  };

  const phaseOf = (): string => current ?? 'pre';

  const done = (title: string, status: StepStatus = 'ok'): void => {
    closeWrites();
    r.step({ id: uid('s'), phase: phaseOf(), title: escapeMarkup(title) }).end(status);
  };

  // The per-file lines of the apply ("Aplicado: x") are one step in the page,
  // with each file as a live line, instead of one row per file.
  let writes: { handle: StepHandle, n: number } | null = null;
  const WRITE_LINE = /^(?:Aplicado|Eliminado|\[dry-run\] (?:aplicaría|eliminaría|sobreescribiría[^:]*)):\s/;
  function closeWrites(): void {
    if (!writes) { return; }
    writes.handle.end('ok', C.writesNote(writes.n));
    writes = null;
  }
  const write = (msg: string): void => {
    writes ??= { handle: r.step({ id: uid('s'), phase: phaseOf(), title: C.writesTitle }), n: 0 };
    writes.n += 1;
    writes.handle.log(msg);
  };

  /**
   * Ask in the page; the terminal sink is the fallback. `toAnswer` converts the
   * terminal method's result into a value the page question accepts.
   */
  const ask = async <T>(input: AskInput, terminalAsk: () => Promise<T>, toAnswer: (v: T) => unknown = v => v): Promise<unknown> => {
    closeWrites();
    if (readonly) { return toAnswer(await terminalAsk()); }
    const id = uid('q');
    fallbacks.set(id, async (signal) => {
      o.setTerminalSignal?.(signal);
      try { return toAnswer(await terminalAsk()); }
      catch (err) {
        if (!signal.aborted) { o.onTerminalCancel?.(); }
        throw err;
      }
      finally { o.setTerminalSignal?.(undefined); }
    });
    try { return await r.ask({ ...input, id, phase: input.phase ?? phaseOf() }); }
    finally { fallbacks.delete(id); }
  };

  const sink: UpdaterPageSink = {
    enter,
    closeAll,
    get current() { return current; },
    onFallback: (id, fn) => { fallbacks.set(id, fn); },
    fallbackAsk: async (q, signal) => {
      const fn = fallbacks.get(q.id);
      // Not one of this sink's questions: never answered from here.
      if (!fn) { return new Promise(() => {}); }
      return fn(signal);
    },

    phase: (n, label) => {
      t.phase(n, label);
      enter(PHASE_BY_NUMBER[n] ?? 'apply');
    },
    subphase: (label) => { t.subphase(label); },
    step: (msg) => {
      t.step(msg);
      if (WRITE_LINE.test(msg)) { write(msg); }
      else { done(msg); }
    },
    warn: (msg) => {
      t.warn(msg);
      // The core announces a self-update with this line before it asks or writes anything.
      if (msg.startsWith('Self-update') && current === 'fetch') { enter('self'); }
      warned = true;
      closeWrites();
      r.notice('warn', escapeMarkup(msg), phaseOf());
    },
    error: (msg) => {
      t.error(msg);
      warned = true;
      r.notice('error', escapeMarkup(msg), phaseOf());
    },
    spinner: () => {
      const ts = t.spinner();
      let handle: StepHandle | null = null;
      return {
        start: (m) => {
          closeWrites();
          ts.start(m);
          handle = r.step({ id: uid('s'), phase: phaseOf(), title: escapeMarkup(m) });
        },
        stop: (m) => {
          ts.stop(m);
          handle?.end('ok', m ? escapeMarkup(m) : undefined);
          handle = null;
        },
      };
    },

    confirm: async (message, defaultValue = false) => {
      const v = await ask({ kind: 'confirm', kicker: C.confirmKicker, title: escapeMarkup(message), default: defaultValue, spec: { yes: C.yes, no: C.no } }, async () => t.confirm(message, defaultValue));
      return v === true;
    },

    pickScopes: async (scopes: ScopeOption[]) => {
      if (scopes.length === 0) { return []; }
      const options: AskOption[] = scopes.map(s => ({ value: s.name, label: s.name, desc: C.scopesDesc(s.changedCount, s.divergedCount), checked: true }));
      const v = await ask({ kind: 'multi', kicker: C.scopesKicker, title: C.scopesTitle, why: C.scopesWhy, g: 'scope', spec: { options, cta: C.scopesCta } }, async () => t.pickScopes(scopes));
      return v as string[];
    },

    // The page reviews a scope as one files card (every row with its diff), which
    // replaces both "accept all / pick / skip" and the per-file "show diff?" prompts.
    pickScopeStrategy: async (scope, stats) => {
      if (readonly) { return t.pickScopeStrategy ? t.pickScopeStrategy(scope, stats) : 'all'; }
      return 'pick';
    },

    pickFiles: async (scope, files) => {
      if (files.length === 0) { return []; }
      const rows: FileRow[] = files.map(f => fileRow(f.entry, C, o.diffFor));
      const v = await ask(
        { kind: 'files', kicker: C.filesKicker, title: C.filesTitle(scope), why: C.filesWhy, spec: { files: rows, cta: C.filesCta } },
        async () => t.pickFiles(scope, files),
        picked => picked.map(e => e.path),
      );
      const chosen = new Set(v as string[]);
      return files.filter(f => chosen.has(f.entry.path)).map(f => f.entry);
    },

    pickIgnoreLines: async (file, lines: IgnoreLineOption[]) => {
      if (lines.length === 0) { return []; }
      const groups = o.groupIgnoreLines ? o.groupIgnoreLines(lines.map(l => l.value)) : lines.map(l => ({ atomic: false, lines: [l.value] }));
      const checked = new Set(lines.filter(l => l.checked).map(l => l.value));
      const options: AskOption[] = groups.map(g => ({
        value: g.lines.join('\n'),
        label: g.lines[0],
        desc: g.atomic ? C.ignoreLinked(g.lines.length - 1) : undefined,
        checked: g.lines.every(l => checked.has(l)),
      }));
      const v = await ask(
        { kind: 'multi', kicker: C.ignoreKicker, title: C.ignoreTitle(file), why: C.ignoreWhy, spec: { options, cta: C.cta } },
        async () => t.pickIgnoreLines(file, lines),
        // The terminal answers with lines; the page question offers groups.
        picked => options.filter(op => op.value.split('\n').some(l => picked.includes(l))).map(op => op.value),
      );
      return (v as string[]).flatMap(x => x.split('\n'));
    },

    pickPackageJsonKeys: async (file, section, keys: PackageJsonKeyOption[]) => {
      if (keys.length === 0) { return []; }
      const options: AskOption[] = keys.map(k => ({ value: k.value, label: k.label, checked: k.checked }));
      const terminalPick = t.pickPackageJsonKeys ? async () => t.pickPackageJsonKeys!(file, section, keys) : async () => keys.filter(k => k.checked).map(k => k.value);
      const v = await ask({ kind: 'package-keys', kicker: C.pkgKicker, title: C.pkgTitle(file, section), why: C.pkgWhy, spec: { options, cta: C.cta } }, terminalPick);
      return v as string[];
    },

    resolvePackageJsonKey: async (file, section, key, drift) => {
      const terminalResolve = t.resolvePackageJsonKey ? async () => t.resolvePackageJsonKey!(file, section, key, drift) : async () => 'mine' as const;
      const v = await ask({
        kind: 'divergence',
        kicker: C.pkgKicker,
        title: C.pkgKeyTitle(section, key),
        why: C.pkgKeyWhy,
        default: 'mine',
        spec: {
          mine: drift.localValue.split('\n'),
          theirs: drift.upstreamValue.split('\n'),
          mineMeta: file,
          theirsMeta: 'upstream',
          options: [
            { value: 'mine', label: C.pkgMine, rec: true },
            { value: 'theirs', label: C.pkgTheirs },
            { value: 'skip', label: C.pkgSkip },
          ],
          cta: C.divCta,
        },
      }, terminalResolve);
      return v as 'theirs' | 'mine' | 'skip';
    },

    resolveDiverged: async (entry, diff) => {
      const v = await ask({
        kind: 'divergence',
        kicker: C.divKicker,
        title: escapeMarkup(entry.path),
        why: C.divWhy,
        g: 'divergence',
        default: 'skip',
        spec: {
          mine: diffLines(diff.localDiff),
          theirs: diffLines(diff.templateDiff),
          mineMeta: C.divMineMeta,
          theirsMeta: C.divTheirsMeta,
          options: [
            { value: 'skip', label: C.divSkip, desc: C.divSkipDesc, rec: true },
            { value: 'mine', label: C.divMine, desc: C.divMineDesc },
            { value: 'theirs', label: C.divTheirs, desc: C.divTheirsDesc },
          ],
          cta: C.divCta,
        },
      }, async () => t.resolveDiverged(entry, diff));
      return v as 'skip' | 'mine' | 'theirs';
    },

    // The core asks one file at a time; each is its own card, default keep.
    confirmDelete: async (entry) => {
      const v = await ask({ kind: 'confirm', kicker: C.delKicker, title: C.delTitle(escapeMarkup(entry.path)), why: C.delWhy, default: false, spec: { yes: C.delYes, no: C.delNo } }, async () => t.confirmDelete(entry));
      return v === true;
    },

    // Not a question in the page: every row of the files card already has "show changes".
    showDiff: async (entry, diff) => {
      if (readonly && t.showDiff) { await t.showDiff(entry, diff); }
    },
  };

  return sink;
}

/** Updater messages are plain text; the page renders limited markup, so `<` must not open a tag. */
function escapeMarkup(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fileRow(entry: DeltaEntry, C: (typeof COPY)[Lang], diffFor?: (e: DeltaEntry) => PairedDiff | null): FileRow {
  const kind = entry.classification === 'new-upstream' ? 'new' : entry.classification === 'deleted-upstream' ? 'del' : 'mod';
  const kindLabel = entry.classification === 'new-upstream'
    ? C.kindNew
    : entry.classification === 'deleted-upstream'
      ? C.kindDel
      : C.kindMod;
  let diff: string[] | undefined;
  try {
    const d = diffFor?.(entry);
    if (d) { diff = diffLines(d.templateDiff); }
  }
  catch { /* a diff that cannot be built only hides "show changes" for that row */ }
  return { path: entry.path, add: entry.added, del: entry.removed, kind, kindLabel, checked: true, ...(diff && diff.length ? { diff } : {}) };
}
