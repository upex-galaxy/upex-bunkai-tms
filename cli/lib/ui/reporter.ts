/**
 * @fileoverview The single emitter of a run (plan §2, rule 1 and 2).
 *
 * Core code never prints and never imports a prompt library: it calls the
 * reporter. Log calls become journal events; `ask()` emits an `ask` event and
 * returns a promise that the FIRST valid answer settles, wherever it comes from:
 * the page (`POST answer`, browser sink), or the terminal fallback.
 *
 * Owner answer Q6: the page is the only input while it is connected. When no page
 * has been connected for `fallbackAfterMs` (10 s), the reporter hands the question
 * to `fallback.ask()` (the terminal sink, wired in delivery 3) and keeps listening
 * to the page; whichever answers first wins and the other is aborted.
 *
 * Owner answer Q2: steps are handles, not a stack. Any number may be open at once
 * (`lane` groups the background ones) and a question can be asked while another
 * step streams `step.log` lines.
 *
 * Secrets: an answer to a `secret` ask is added to the journal's redactor BEFORE
 * any event about it is appended, and its `answered` label is the mask. The value
 * itself is returned to the caller and never enters the journal.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { AskKind, AskSpec, Check, EndStatus, FailAction, JournalEntry, Lang, NextStep, ParityFinding, PhaseDef, PhaseStatus, RunCmd, RunEvent, RunMode, StepStatus, Surface, Tile } from './events.ts';

import { Journal, MASK } from './events.ts';
import { fill, strings } from './strings.ts';

export type AskEvent = Extract<RunEvent, { t: 'ask' }>;
export type FailEvent = Extract<RunEvent, { t: 'fail' }>;
export type AnsweredBy = 'page' | 'terminal' | 'auto';

export interface TerminalFallback {
  /** Ask the question in the terminal. Abort the prompt when `signal` fires (the page answered first). */
  ask: (question: AskEvent | FailEvent, signal: AbortSignal) => Promise<unknown>
}

export interface ReporterOptions {
  cmd: RunCmd
  args?: string[]
  repo: string
  version: string
  mode: RunMode
  lang: Lang
  phases: PhaseDef[]
  journal?: Journal
  fallback?: TerminalFallback
  /** Q6: how long without a connected page before the terminal asks. Default 10 000 ms. */
  fallbackAfterMs?: number
  /** How often the connection probes are read while a question waits. Default 250 ms. */
  pollMs?: number
  now?: () => number
}

export type AnswerResult
  = | { ok: true, label: string }
    | { ok: false, code: 'unknown' | 'answered' | 'invalid', message: string };

export interface StepHandle {
  readonly id: string
  log: (line: string, stream?: 'out' | 'err') => void
  end: (status?: StepStatus, note?: string) => void
}

export interface StepInput {
  id?: string
  phase: string
  title: string
  lane?: string
  why?: string
  detail?: string
}

export type AskInput = Omit<AskEvent, 't' | 'id' | 'secret' | 'spec'> & { id?: string, secret?: boolean, spec?: AskSpec };
export type FailInput = Omit<FailEvent, 't' | 'id'> & { id?: string };

interface Pending {
  question: AskEvent | FailEvent
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  abort: AbortController
  timer?: ReturnType<typeof setInterval>
}

export class ReadonlyAskError extends Error {
  constructor(title: string) {
    super(`A read-only run cannot ask a question: "${title}"`);
    this.name = 'ReadonlyAskError';
  }
}

export class Reporter {
  readonly journal: Journal;
  readonly opts: ReporterOptions;
  private readonly pending = new Map<string, Pending>();
  private readonly answered = new Set<string>();
  private readonly probes: (() => boolean)[] = [];
  private readonly now: () => number;
  private counter = 0;

  constructor(opts: ReporterOptions) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
    this.journal = opts.journal ?? new Journal({ now: this.now });
    for (const e of this.journal.all()) {
      if (e.t === 'answered') { this.answered.add(e.id); }
    }
  }

  /** A sink that can answer reports here whether a page is connected right now. */
  attachClientProbe(probe: () => boolean): void {
    this.probes.push(probe);
  }

  private emit(ev: RunEvent): JournalEntry {
    return this.journal.append(ev);
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}${this.counter}`;
  }

  start(): void {
    const o = this.opts;
    this.emit({ t: 'run.start', cmd: o.cmd, args: o.args ?? [], repo: o.repo, version: o.version, mode: o.mode, lang: o.lang, phases: o.phases });
  }

  preflight(checks: Check[], verdict: 'clear' | 'warn' | 'block', text?: string): void {
    this.emit({ t: 'preflight', checks, verdict, ...(text ? { text } : {}) });
  }

  phaseStart(id: string, extra: { title?: string, why?: string } = {}): void {
    this.emit({ t: 'phase.start', id, ...extra });
  }

  phaseEnd(id: string, status: PhaseStatus = 'done', note?: string): void {
    this.emit({ t: 'phase.end', id, status, ...(note ? { note } : {}) });
  }

  step(input: StepInput): StepHandle {
    const id = input.id ?? this.nextId('s');
    const started = this.now();
    let open = true;
    this.emit({ t: 'step.start', id, phase: input.phase, title: input.title, ...(input.lane ? { lane: input.lane } : {}), ...(input.why ? { why: input.why } : {}), ...(input.detail ? { detail: input.detail } : {}) });
    return {
      id,
      log: (line, stream = 'out') => {
        if (open) { this.emit({ t: 'step.log', id, line, stream }); }
      },
      end: (status = 'ok', note) => {
        if (!open) { return; }
        open = false;
        this.emit({ t: 'step.end', id, status, ms: Math.max(0, this.now() - started), ...(note ? { note } : {}) });
      },
    };
  }

  notice(level: 'info' | 'warn' | 'error', text: string, phase?: string): void {
    this.emit({ t: 'notice', level, text, ...(phase ? { phase } : {}) });
  }

  restart(from: string, to: string): void {
    this.emit({ t: 'restart', reason: 'self-update', from, to });
  }

  report(r: { title?: string, tone?: 'good' | 'warn' | 'bad', tiles: Tile[], surfaces?: Surface[], findings?: ParityFinding[], next: NextStep[], prompt?: string }): void {
    this.emit({ t: 'report', ...r });
  }

  end(status: EndStatus, exit: number, summaryPath?: string): void {
    for (const p of this.pending.values()) {
      clearInterval(p.timer);
      p.abort.abort();
      p.reject(new Error('The run ended before the question was answered.'));
    }
    this.pending.clear();
    this.emit({ t: 'run.end', status, exit, ...(summaryPath ? { summaryPath } : {}) });
  }

  /** Ids of the questions still waiting for an answer. */
  waiting(): string[] {
    return [...this.pending.keys()];
  }

  async ask<T = unknown>(input: AskInput): Promise<T> {
    if (this.opts.mode === 'readonly') { return Promise.reject(new ReadonlyAskError(input.title)); }
    const { id: wantedId, secret, spec, ...rest } = input;
    const id = wantedId ?? this.nextId('q');
    const kind: AskKind = rest.kind;
    const question: AskEvent = { t: 'ask', ...rest, id, kind, spec: spec ?? {}, secret: secret ?? kind === 'secret' };
    return this.wait<T>(question);
  }

  async fail(input: FailInput): Promise<string> {
    const { id: wantedId, ...rest } = input;
    const question: FailEvent = { t: 'fail', ...rest, id: wantedId ?? this.nextId('f') };
    return this.wait<string>(question);
  }

  private async wait<T>(question: AskEvent | FailEvent): Promise<T> {
    if (this.pending.has(question.id) || this.answered.has(question.id)) {
      return Promise.reject(new Error(`Question id "${question.id}" was already used in this run.`));
    }
    return new Promise<T>((resolve, reject) => {
      const p: Pending = { question, resolve: resolve as (v: unknown) => void, reject, abort: new AbortController() };
      this.pending.set(question.id, p);
      this.emit(question);
      this.armFallback(p);
    });
  }

  private armFallback(p: Pending): void {
    const fb = this.opts.fallback;
    if (!fb) { return; }
    const startFallback = (): void => {
      clearInterval(p.timer);
      if (!this.pending.has(p.question.id)) { return; }
      fb.ask(p.question, p.abort.signal).then(
        (value) => { this.answer(p.question.id, value, 'terminal'); },
        () => { /* aborted (the page answered) or the prompt failed: the page can still answer */ },
      );
    };
    if (this.probes.length === 0) { startFallback(); return; }
    const after = this.opts.fallbackAfterMs ?? 10_000;
    let lastSeen = this.now();
    p.timer = setInterval(() => {
      if (this.probes.some(probe => probe())) { lastSeen = this.now(); return; }
      if (this.now() - lastSeen >= after) { startFallback(); }
    }, this.opts.pollMs ?? 250);
  }

  /**
   * Settle a waiting question. First valid answer wins; later ones get `answered`.
   * Validation runs against the question's own spec, so a page can never inject a
   * value the core did not offer.
   */
  answer(id: string, value: unknown, by: AnsweredBy): AnswerResult {
    const p = this.pending.get(id);
    if (!p) {
      return this.answered.has(id)
        ? { ok: false, code: 'answered', message: `Question "${id}" was already answered.` }
        : { ok: false, code: 'unknown', message: `No question "${id}" is waiting.` };
    }
    const checked = validateAnswer(p.question, value, this.opts.lang);
    if (!checked.ok) { return { ok: false, code: 'invalid', message: checked.message }; }
    // Secret first: the redactor must know the value before ANY event is appended.
    if (p.question.t === 'ask' && p.question.secret && typeof value === 'string') { this.journal.redactor.add(value); }
    this.pending.delete(id);
    this.answered.add(id);
    clearInterval(p.timer);
    p.abort.abort();
    this.emit({ t: 'answered', id, label: checked.label, by });
    p.resolve(checked.value);
    return { ok: true, label: checked.label };
  }
}

// ----------------------------------------------------------------------------
// Answer validation + display label
// ----------------------------------------------------------------------------

type Checked = { ok: true, value: unknown, label: string } | { ok: false, message: string };

const bad = (message: string): Checked => ({ ok: false, message });

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function subsetOf(values: string[], allowed: string[]): boolean {
  const set = new Set(allowed);
  return values.every(v => set.has(v)) && new Set(values).size === values.length;
}

export function validateAnswer(q: AskEvent | FailEvent, value: unknown, lang: Lang): Checked {
  const S = strings(lang);
  if (q.t === 'fail') {
    const action = q.actions.find((a: FailAction) => a.value === value);
    return action ? { ok: true, value, label: action.label } : bad('Not one of the offered actions.');
  }

  const spec = q.spec;
  const secondary = spec.secondary?.find(b => b.value === value);
  if (secondary) { return { ok: true, value, label: secondary.label }; }

  const options = spec.options ?? [];
  switch (q.kind) {
    case 'confirm': {
      if (typeof value !== 'boolean') { return bad('Expected true or false.'); }
      return { ok: true, value, label: value ? (spec.yes ?? S.yes) : (spec.no ?? S.no) };
    }
    case 'select':
    case 'divergence': {
      const opt = options.find(o => o.value === value);
      return opt ? { ok: true, value, label: opt.label } : bad('Not one of the offered options.');
    }
    case 'multi':
    case 'package-keys': {
      if (!isStringArray(value) || !subsetOf(value, options.map(o => o.value))) { return bad('Expected a subset of the offered options.'); }
      if (spec.min && value.length < spec.min) { return bad(spec.minMsg ?? S.pickOne); }
      const labels = options.filter(o => value.includes(o.value)).map(o => o.label);
      return { ok: true, value, label: labels.length ? labels.join(', ') : S.none };
    }
    case 'text': {
      const fields = spec.fields ?? [];
      if (!isStringArray(value) || value.length !== fields.length) { return bad(`Expected ${fields.length} text value(s).`); }
      for (const [i, f] of fields.entries()) {
        const v = value[i].trim();
        if (f.required && !v) { return bad(`${f.label}: ${S.required}`); }
        if (v && f.pattern && !new RegExp(f.pattern).test(v)) { return bad(`${f.label}: ${f.patternMsg ?? 'invalid value'}`); }
      }
      const trimmed = value.map(v => v.trim());
      return { ok: true, value: trimmed, label: fields.map((f, i) => `${f.short ?? f.label}: ${trimmed[i] || S.empty}`).join(' · ') };
    }
    case 'secret': {
      if (typeof value !== 'string' || value.length === 0) { return bad(S.secretMissing); }
      return { ok: true, value, label: `${fill(S.secretSaved, { var: spec.varName ?? 'value' })} (${MASK})` };
    }
    case 'files': {
      const paths = (spec.files ?? []).map(f => f.path);
      if (!isStringArray(value) || !subsetOf(value, paths)) { return bad('Expected a subset of the listed files.'); }
      return { ok: true, value, label: fill(S.filesApplied, { n: value.length, total: paths.length }) };
    }
    case 'deletions': {
      const paths = (spec.files ?? []).map(f => f.path);
      if (!isStringArray(value) || !subsetOf(value, paths)) { return bad('Expected a subset of the listed files.'); }
      return {
        ok: true,
        value,
        label: value.length ? fill(S.deletionsSome, { n: value.length, keep: paths.length - value.length }) : fill(S.deletionsNone, { total: paths.length }),
      };
    }
    default:
      return bad(`Unknown question kind "${String((q).kind)}".`);
  }
}
