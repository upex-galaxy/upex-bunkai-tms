/**
 * @fileoverview The terminal side of a `bun setup` run (installer-ui plan §2,
 * delivery 3): prints the journal, and asks a question when no page answers it.
 *
 * The terminal ALWAYS shows the log (owner decision D3), in page mode and in
 * `--headless` alike, because both print the same journal through this one
 * printer: what differs is only who answers a question. That is the headless
 * parity guarantee (plan §12): the log a person reads in the terminal does not
 * depend on whether a page is open.
 *
 * Owner answer Q2 in a terminal: background steps (the `downloads` lane) keep
 * streaming while a question waits. A line that arrives while a clack prompt is
 * open would tear the prompt, so it is held and printed when the prompt closes.
 *
 * Lives outside `cli/lib/ui/` because it renders with clack (a third-party
 * module); the page side stays node-only.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { JournalEntry, Lang } from './ui/events.ts';
import type { InstallerTerminal } from './ui/installer-run.ts';
import type { AskEvent, FailEvent } from './ui/reporter.ts';

import * as tui from './tui.ts';

/** Markup the page understands (`<b>`, `<code>`, backticks, glossary terms) as plain text. */
export function plainText(s: string): string {
  return String(s ?? '')
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&');
}

const T = {
  es: { answerInPage: '(respóndelo en el navegador)', background: 'en segundo plano', saved: 'Resumen guardado en', end: 'Instalación terminada.', ended: { 'done': 'Instalación terminada.', 'done-with-pending': 'Instalación terminada, con pendientes.', 'failed': 'La instalación no terminó.', 'aborted': 'Instalación cancelada.' } },
  en: { answerInPage: '(answer it in the browser)', background: 'in the background', saved: 'Summary saved at', end: 'Install finished.', ended: { 'done': 'Install finished.', 'done-with-pending': 'Install finished, with pending items.', 'failed': 'The install did not finish.', 'aborted': 'Install cancelled.' } },
} as const;

export interface TerminalOptions {
  lang: Lang
  /** Where lines go. Defaults to stdout; tests capture them. */
  write?: (text: string) => void
  /** Prompts; injectable for tests. Defaults to clack through `tui`. */
  prompts?: Partial<Prompts>
  /** Called when the person cancels a prompt (Ctrl-C) that the page did not answer. */
  onCancel?: () => void
}

export interface Prompts {
  confirm: typeof tui.confirm
  select: typeof tui.select
  multiselect: typeof tui.multiselect
  text: typeof tui.text
  password: typeof tui.password
  isCancel: typeof tui.isCancel
}

export class PromptCancelled extends Error {
  constructor() {
    super('Aborted by user.');
    this.name = 'ExitPromptError';
  }
}

/** Seconds with one decimal, the way the page shows a step's duration. */
function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function createInstallerTerminal(o: TerminalOptions): InstallerTerminal & { lines: () => number } {
  const L = T[o.lang];
  const write = o.write ?? ((text: string) => { process.stdout.write(text); });
  const P: Prompts = {
    confirm: tui.confirm,
    select: tui.select,
    multiselect: tui.multiselect,
    text: tui.text,
    password: tui.password,
    isCancel: tui.isCancel,
    ...o.prompts,
  };
  const steps = new Map<string, { title: string, lane?: string }>();
  const phases = new Map<string, string>();
  let prompting = 0;
  let held: string[] = [];
  let count = 0;

  const out = (line: string): void => {
    count += 1;
    if (prompting > 0) { held.push(line); return; }
    write(`${line}\n`);
  };
  const flush = (): void => {
    if (prompting > 0 || held.length === 0) { return; }
    const lines = held;
    held = [];
    for (const l of lines) { write(`${l}\n`); }
  };

  const print = (e: JournalEntry, ctx: { page: boolean }): void => {
    switch (e.t) {
      case 'run.start':
        for (const p of e.phases) { phases.set(p.id, p.title); }
        break;
      case 'preflight':
        for (const c of e.checks) {
          const g = c.state === 'ok' ? '✔' : c.state === 'warn' ? '▲' : c.state === 'block' ? '✖' : '–';
          out(`  ${g} ${c.label}  ${c.value ?? ''}`.trimEnd());
          if (c.msg && c.state !== 'ok') { out(`      ${plainText(c.msg)}`); }
        }
        out(`  ${plainText(e.text ?? '')}`);
        break;
      case 'phase.start': {
        const title = e.title ?? phases.get(e.id) ?? e.id;
        out('');
        out(`◆ ${title}`);
        if (e.why) { out(`  ${plainText(e.why)}`); }
        break;
      }
      case 'phase.end':
        if (e.status !== 'done' && e.note) { out(`  ${e.status === 'failed' ? '✖' : '▲'} ${plainText(e.note)}`); }
        break;
      case 'step.start':
        steps.set(e.id, { title: plainText(e.title), lane: e.lane });
        out(`  … ${plainText(e.title)}${e.lane ? `  (${L.background})` : ''}`);
        break;
      case 'step.log':
        out(`      ${e.line}`);
        break;
      case 'step.end': {
        const s = steps.get(e.id);
        const g = e.status === 'ok' ? '✔' : e.status === 'warn' ? '▲' : e.status === 'skipped' ? '–' : '✖';
        out(`  ${g} ${s?.title ?? e.id}${e.note ? `  ${plainText(e.note)}` : ''}${e.status === 'skipped' ? '' : `  (${secs(e.ms)})`}`);
        break;
      }
      case 'notice': {
        const g = e.level === 'warn' ? '▲' : e.level === 'error' ? '■' : '●';
        out(`  ${g} ${plainText(e.text)}`);
        break;
      }
      case 'ask':
        if (ctx.page) { out(`  ? ${plainText(e.title)}  ${L.answerInPage}`); }
        break;
      case 'fail':
        out(`  ✖ ${plainText(e.title)}`);
        out(`      ${plainText(e.what)}`);
        for (const h of e.how) { out(`      - ${plainText(h)}`); }
        if (e.cmd) { out(`      $ ${e.cmd}`); }
        break;
      case 'answered':
        // A terminal answer is already on screen (clack prints it). Page and auto answers are not.
        if (e.by !== 'terminal') { out(`    → ${plainText(e.label)}`); }
        break;
      case 'report':
        out('');
        out(`◇ ${plainText(e.title ?? '')}`);
        if (e.tiles.length) { out(`  ${e.tiles.map(t => `${t.n} ${t.label}`).join(' · ')}`); }
        for (const n of e.next) {
          out(`  • ${plainText(n.title)}${n.text ? `: ${plainText(n.text)}` : ''}`);
          if (n.cmd) { out(`      $ ${n.cmd}`); }
        }
        break;
      case 'run.end':
        out('');
        if (e.summaryPath) { out(`  ${L.saved} ${e.summaryPath}`); }
        out(L.ended[e.status] ?? L.end);
        break;
      default:
        break;
    }
  };

  const cancelled = (value: unknown, signal: AbortSignal): boolean => {
    if (!P.isCancel(value)) { return false; }
    if (!signal.aborted) { o.onCancel?.(); }
    throw new PromptCancelled();
  };

  const ask = async (q: AskEvent | FailEvent, signal: AbortSignal): Promise<unknown> => {
    prompting += 1;
    try {
      if (q.t === 'fail') {
        const v = await P.select({ message: plainText(q.title), options: q.actions.map(a => ({ value: a.value, label: plainText(a.label) })), signal });
        cancelled(v, signal);
        return v;
      }
      const spec = q.spec;
      const message = plainText(q.title);
      if (q.why) { write(`  ${plainText(q.why)}\n`); }
      switch (q.kind) {
        case 'confirm': {
          const v = await P.confirm({ message, active: spec.yes ? plainText(spec.yes) : undefined, inactive: spec.no ? plainText(spec.no) : undefined, initialValue: typeof q.default === 'boolean' ? q.default : true, signal });
          cancelled(v, signal);
          return v;
        }
        case 'select':
        case 'divergence': {
          const options = [
            ...(spec.options ?? []).map(op => ({ value: op.value, label: plainText(op.label), ...(op.desc ? { hint: plainText(op.desc) } : {}) })),
            ...(spec.secondary ?? []).map(b => ({ value: b.value, label: plainText(b.label) })),
          ];
          const initial = typeof q.default === 'string' ? q.default : (spec.options ?? []).find(op => op.rec)?.value;
          const v = await P.select({ message, options, ...(initial ? { initialValue: initial } : {}), signal });
          cancelled(v, signal);
          return v;
        }
        case 'multi':
        case 'package-keys': {
          const options = (spec.options ?? []).map(op => ({ value: op.value, label: plainText(op.label), ...(op.desc ? { hint: plainText(op.desc) } : {}) }));
          for (;;) {
            const v = await P.multiselect({ message, options, initialValues: (spec.options ?? []).filter(op => op.checked).map(op => op.value), required: false, signal });
            cancelled(v, signal);
            const picked = v as string[];
            if (spec.min && picked.length < spec.min) { write(`  ${plainText(spec.minMsg ?? '')}\n`); continue; }
            return picked;
          }
        }
        case 'text': {
          const values: string[] = [];
          for (const f of spec.fields ?? []) {
            const v = await P.text({
              message: `${plainText(f.label)}${f.hint ? ` (${plainText(f.hint)})` : ''}`,
              ...(f.placeholder ? { placeholder: f.placeholder } : {}),
              ...(f.value ? { initialValue: f.value } : {}),
              validate: (raw) => {
                const t = (raw ?? '').trim();
                if (f.required && !t) { return o.lang === 'en' ? 'Required.' : 'Este dato es obligatorio.'; }
                if (t && f.pattern && !new RegExp(f.pattern).test(t)) { return plainText(f.patternMsg ?? 'Invalid value.'); }
                return undefined;
              },
              signal,
            });
            cancelled(v, signal);
            values.push(String(v ?? '').trim());
          }
          return values;
        }
        case 'secret': {
          const later = spec.secondary?.[0];
          const v = await P.password({
            message: `${spec.varName ?? message}${later ? ` (Enter = ${plainText(later.label)})` : ''}`,
            mask: '*',
            signal,
          });
          cancelled(v, signal);
          const s = String(v ?? '');
          return s.length > 0 ? s : (later?.value ?? '');
        }
        default:
          throw new Error(`The terminal cannot ask a "${q.kind}" question.`);
      }
    }
    finally {
      prompting -= 1;
      flush();
    }
  };

  return { print, ask, lines: () => count };
}
