import type { DeltaEntry, ReportSink } from '../updater-types.ts';
import type { ReporterOptions } from './reporter.ts';
import type { UpdaterPageSink } from './updater-sink.ts';

import { describe, expect, test } from 'bun:test';

import { Reporter } from './reporter.ts';
import { createUpdaterPageSink, diffLines, updaterPhases } from './updater-sink.ts';

const sleep = async (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** A terminal sink that records every call and answers questions from `answers`. */
function fakeTerminal(answers: Record<string, unknown> = {}): ReportSink & { calls: string[] } {
  const calls: string[] = [];
  const answer = async (k: string): Promise<never> => {
    calls.push(`ask:${k}`);
    if (k in answers) { return answers[k] as never; }
    return new Promise(() => {}) as never;
  };
  return {
    calls,
    phase: (n, l) => { calls.push(`phase:${n}:${l}`); },
    subphase: (l) => { calls.push(`subphase:${l}`); },
    step: (m) => { calls.push(`step:${m}`); },
    warn: (m) => { calls.push(`warn:${m}`); },
    error: (m) => { calls.push(`error:${m}`); },
    spinner: () => ({ start: (m) => { calls.push(`spin:${m}`); }, stop: (m) => { calls.push(`stop:${m ?? ''}`); } }),
    confirm: async () => answer('confirm'),
    pickScopes: async () => answer('pickScopes'),
    pickFiles: async () => answer('pickFiles'),
    pickIgnoreLines: async () => answer('pickIgnoreLines'),
    resolveDiverged: async () => answer('resolveDiverged'),
    confirmDelete: async () => answer('confirmDelete'),
  };
}

function entry(path: string, classification: DeltaEntry['classification'] = 'clean-fastforward'): DeltaEntry {
  return { component: 'skills', path, status: 'M', fromSha: 'a', toSha: 'b', added: 2, removed: 1, isBinary: false, templateOldSha: 'o', templateNewSha: 'n', classification };
}

function setup(opts: Partial<ReporterOptions> & { answers?: Record<string, unknown>, connected?: boolean } = {}): { r: Reporter, sink: UpdaterPageSink, term: ReturnType<typeof fakeTerminal>, signals: (AbortSignal | undefined)[] } {
  const term = fakeTerminal(opts.answers);
  const signals: (AbortSignal | undefined)[] = [];
  let sink: UpdaterPageSink | null = null;
  const r = new Reporter({
    cmd: 'up',
    repo: 'acme',
    version: '8.5',
    mode: 'interactive',
    lang: 'es',
    phases: updaterPhases('es', false),
    fallbackAfterMs: 40,
    pollMs: 5,
    fallback: { ask: async (q, s) => sink!.fallbackAsk(q, s) },
    ...opts,
  });
  const connected = opts.connected ?? true;
  r.attachClientProbe(() => connected);
  sink = createUpdaterPageSink({ reporter: r, terminal: term, setTerminalSignal: (s) => { signals.push(s); } });
  return { r, sink, term, signals };
}

/** The id of the last `ask` the journal holds. */
function lastAsk(r: Reporter): string {
  const asks = r.journal.all().filter(e => e.t === 'ask');
  return asks[asks.length - 1].id;
}

describe('log mirroring (D3: the terminal always shows the log)', () => {
  test('every log call reaches the terminal sink AND the journal', () => {
    const { r, sink, term } = setup();
    sink.phase(1, 'FETCH');
    sink.step('HEAD upstream: abc1234');
    sink.warn('cuidado <b>esto</b>');
    sink.error('falló');
    expect(term.calls).toEqual(['phase:1:FETCH', 'step:HEAD upstream: abc1234', 'warn:cuidado <b>esto</b>', 'error:falló']);
    const kinds = r.journal.all().map(e => e.t);
    expect(kinds).toEqual(['phase.end', 'phase.start', 'step.start', 'step.end', 'notice', 'notice']);
    // Updater text is plain: markup is escaped before the page's limited-markup filter sees it.
    expect(r.journal.all().find(e => e.t === 'notice')).toMatchObject({ level: 'warn', text: 'cuidado &lt;b&gt;esto&lt;/b&gt;' });
  });

  test('the per-file apply lines are ONE step with a live line per file', () => {
    const { r, sink } = setup();
    sink.phase(5, 'APPLY');
    sink.step('Aplicado: a.md');
    sink.step('Aplicado: b.md');
    sink.step('Eliminado: c.md');
    sink.step('Version registrada');
    const steps = r.journal.all().filter(e => e.t === 'step.start');
    expect(steps.map(s => s.t === 'step.start' && s.title)).toEqual(['Escribir archivos', 'Version registrada']);
    expect(r.journal.all().filter(e => e.t === 'step.log')).toHaveLength(3);
    expect(r.journal.all().find(e => e.t === 'step.end')).toMatchObject({ note: '3 archivo(s)' });
  });

  test('phases: 3 and 4 share one page phase, the self-update line opens "self", skipped phases are marked, never back', () => {
    const { r, sink } = setup();
    sink.enter('pre');
    sink.phase(1, 'FETCH');
    sink.warn('Self-update: actualizando 1 archivo(s) del CLI antes de continuar…');
    sink.phase(1, 'FETCH'); // the re-exec child fetches again: stays in "self"
    sink.phase(2, 'DETECT');
    sink.phase(3, 'SCOPE');
    sink.phase(4, 'FILES');
    sink.phase(5, 'APPLY');
    const opened = r.journal.all().filter(e => e.t === 'phase.start').map(e => e.t === 'phase.start' && e.id);
    expect(opened).toEqual(['pre', 'fetch', 'self', 'detect', 'scope', 'apply']);

    const { r: r2, sink: s2 } = setup();
    s2.phase(2, 'DETECT');
    const skipped = r2.journal.all().filter(e => e.t === 'phase.end' && e.status === 'skipped').map(e => e.t === 'phase.end' && e.id);
    expect(skipped).toEqual(['pre', 'fetch', 'self']);
  });
});

describe('questions go to the page (Q6: page only while it is connected)', () => {
  test('resolveDiverged is a divergence card with both diffs; the page answer is returned, the terminal never asks', async () => {
    const { r, sink, term } = setup();
    const p = sink.resolveDiverged(entry('.agents/skills/acli/SKILL.md', 'locally-diverged'), { templateDiff: '\x1B[32m+new line\x1B[0m', localDiff: '+my rule' });
    const ask = r.journal.all().find(e => e.t === 'ask');
    expect(ask).toMatchObject({ kind: 'divergence', default: 'skip', spec: { theirs: ['+new line'], mine: ['+my rule'] } });
    expect(r.answer(lastAsk(r), 'mine', 'page').ok).toBe(true);
    expect(await p).toBe('mine');
    await sleep(60);
    expect(term.calls.filter(c => c.startsWith('ask:'))).toEqual([]);
  });

  test('pickFiles is one files card, every row checked, with its diff; the answer maps back to entries', async () => {
    const term = fakeTerminal();
    const r = new Reporter({ cmd: 'up', repo: 'acme', version: '1', mode: 'interactive', lang: 'en', phases: [] });
    r.attachClientProbe(() => true);
    const sink = createUpdaterPageSink({ reporter: r, terminal: term, diffFor: () => ({ templateDiff: '@@ -1 +1 @@\n-a\n+b', localDiff: '' }) });
    const files = [entry('a.md'), entry('b.md', 'new-upstream')].map(e => ({ entry: e, label: e.path }));
    const p = sink.pickFiles('skills', files);
    const ask = r.journal.all().find(e => e.t === 'ask');
    expect(ask).toMatchObject({ kind: 'files', spec: { files: [{ path: 'a.md', checked: true, kind: 'mod', diff: ['@@ -1 +1 @@', '-a', '+b'] }, { path: 'b.md', kind: 'new', kindLabel: 'New' }] } });
    r.answer(lastAsk(r), ['b.md'], 'page');
    expect((await p).map(e => e.path)).toEqual(['b.md']);
  });

  test('pickScopeStrategy asks nothing in the page: the files card replaces it', async () => {
    const { r, sink } = setup();
    expect(await sink.pickScopeStrategy!('skills', { changedCount: 3, divergedCount: 0, addedTotal: 1, removedTotal: 1 })).toBe('pick');
    expect(r.journal.all().some(e => e.t === 'ask')).toBe(false);
  });

  test('pickIgnoreLines offers linked lines as one all-or-nothing option and expands it back', async () => {
    const term = fakeTerminal();
    const r = new Reporter({ cmd: 'up', repo: 'acme', version: '1', mode: 'interactive', lang: 'es', phases: [] });
    r.attachClientProbe(() => true);
    const sink = createUpdaterPageSink({ reporter: r, terminal: term, groupIgnoreLines: () => [{ atomic: true, lines: ['.context/PBI/*', '!.context/PBI/README.md'] }, { atomic: false, lines: ['.auth/'] }] });
    const p = sink.pickIgnoreLines('.gitignore', ['.context/PBI/*', '!.context/PBI/README.md', '.auth/'].map(v => ({ value: v, label: v, checked: true })));
    const ask = r.journal.all().find(e => e.t === 'ask');
    expect(ask).toMatchObject({ kind: 'multi', spec: { options: [{ value: '.context/PBI/*\n!.context/PBI/README.md', checked: true }, { value: '.auth/' }] } });
    r.answer(lastAsk(r), ['.context/PBI/*\n!.context/PBI/README.md'], 'page');
    expect(await p).toEqual(['.context/PBI/*', '!.context/PBI/README.md']);
  });

  test('pickPackageJsonKeys is a package-keys card; a new key unticked stays out', async () => {
    const { r, sink } = setup();
    const p = sink.pickPackageJsonKeys!('package.json', 'scripts', [{ value: 'shared:check', label: 'shared:check: bun …', checked: true }, { value: 'x', label: 'x: y', checked: true }]);
    r.answer(lastAsk(r), ['shared:check'], 'page');
    expect(await p).toEqual(['shared:check']);
  });

  test('no page connected for the window: the terminal asks, and its answer settles the question', async () => {
    const { r, sink, term } = setup({ connected: false, answers: { confirmDelete: true } });
    const p = sink.confirmDelete(entry('old.md', 'deleted-upstream'));
    expect(await p).toBe(true);
    expect(term.calls).toContain('ask:confirmDelete');
    expect(r.journal.all().find(e => e.t === 'answered')).toMatchObject({ by: 'terminal' });
  });

  test('the page answering first aborts the terminal prompt through the signal', async () => {
    const { r, sink, signals } = setup({ connected: false });
    const p = sink.confirm('Seguimos?', true);
    await sleep(80); // the terminal prompt is open now (it never answers by itself)
    const signal = signals.find(Boolean)!;
    expect(signal.aborted).toBe(false);
    r.answer(lastAsk(r), false, 'page');
    expect(await p).toBe(false);
    expect(signal.aborted).toBe(true);
  });
});

describe('read-only run (explicit --auto in the page)', () => {
  test('a question never reaches the page: the terminal sink answers it as without a page', async () => {
    const { r, sink, term } = setup({ mode: 'readonly', answers: { confirm: true } });
    expect(await sink.confirm('Migrar?', true)).toBe(true);
    expect(term.calls).toContain('ask:confirm');
    expect(r.journal.all().some(e => e.t === 'ask')).toBe(false);
  });
});

describe('copy', () => {
  test('both languages have the same phases (Q1)', () => {
    expect(updaterPhases('es', false).map(p => p.id)).toEqual(updaterPhases('en', true).map(p => p.id));
    expect(updaterPhases('en', true).find(p => p.id === 'scope')?.title).toBe('Apply everything');
  });

  test('diff lines drop colours and are capped', () => {
    expect(diffLines('\x1B[31m-a\x1B[0m\n+b\n')).toEqual(['-a', '+b']);
    expect(diffLines(Array.from({ length: 400 }, (_, i) => `+${i}`).join('\n'))).toHaveLength(301);
  });
});
