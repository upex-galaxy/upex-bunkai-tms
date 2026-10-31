import type { ReportSink } from '../updater-types.ts';
import type { JournalEntry } from './events.ts';
import type { UpdaterUi } from './updater-run.ts';

import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { HANDOFF_ENV } from './events.ts';
import { buildUpdaterReport, startUpdaterUi } from './updater-run.ts';

const silent: ReportSink = {
  phase: () => {},
  subphase: () => {},
  step: () => {},
  warn: () => {},
  error: () => {},
  spinner: () => ({ start: () => {}, stop: () => {} }),
  confirm: async () => new Promise(() => {}),
  pickScopes: async () => new Promise(() => {}),
  pickFiles: async () => new Promise(() => {}),
  pickIgnoreLines: async () => new Promise(() => {}),
  resolveDiverged: async () => new Promise(() => {}),
  confirmDelete: async () => new Promise(() => {}),
};

const opened: UpdaterUi[] = [];
afterEach(async () => {
  for (const ui of opened.splice(0)) {
    try { await ui.finish('aborted', 1); }
    catch { /* already closed */ }
  }
}, 15_000);

/** A page run on a free port, nothing opened, the terminal sink silent. */
async function start(argv: string[], env: Record<string, string | undefined> = {}, repoRoot = mkdtempSync(join(tmpdir(), 'ui-run-'))): Promise<{ ui: UpdaterUi | null, lines: string[], repoRoot: string }> {
  const lines: string[] = [];
  const ui = await startUpdaterUi({
    argv,
    repoRoot,
    repoName: 'acme',
    version: '8.5',
    terminal: silent,
    print: l => lines.push(l),
    env: { LANG: 'es_ES.UTF-8', UPEX_UI_NO_OPEN: '1', ...env },
    stdinTTY: true,
    stdoutTTY: true,
    platform: 'darwin',
    fallbackAfterMs: 60_000,
  });
  if (ui) { opened.push(ui); }
  return { ui, lines, repoRoot };
}

async function events(url: string): Promise<JournalEntry[]> {
  const u = new URL(url);
  const res = await fetch(`${url}events`, { headers: { host: u.host } });
  const reader = res.body!.getReader();
  let text = '';
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    const r = await Promise.race([reader.read(), new Promise<null>(ok => setTimeout(ok, 100, null))]);
    if (!r || r.done) { break; }
    text += new TextDecoder().decode(r.value);
  }
  await reader.cancel();
  return text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)) as JournalEntry);
}

async function answer(url: string, id: string, value: unknown): Promise<number> {
  const u = new URL(url);
  const res = await fetch(`${url}answer`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-run-token': url.split('/r/')[1].replace(/\/$/, ''), 'origin': u.origin, 'host': u.host }, body: JSON.stringify({ id, value }) });
  return res.status;
}

describe('when the page opens (plan §5)', () => {
  test('--headless, CI, an agent and a pipe never open it: null = today\'s terminal flow', async () => {
    expect((await start(['--headless'])).ui).toBeNull();
    expect((await start([], { CI: '1' })).ui).toBeNull();
    expect((await start([], { CLAUDECODE: '1' })).ui).toBeNull();
  });

  test('a real terminal opens it and prints the URL; explicit --auto makes it read-only', async () => {
    const { ui, lines } = await start([]);
    expect(ui).not.toBeNull();
    expect(ui!.readonly).toBe(false);
    expect(lines[0]).toContain(ui!.url);
    const ro = await start(['--auto']);
    expect(ro.ui!.readonly).toBe(true);
    const first = (await events(ro.ui!.url))[0];
    expect(first).toMatchObject({ t: 'run.start', cmd: 'up', mode: 'readonly', lang: 'es' });
  });
});

describe('preflight in the page', () => {
  test('a clear checklist starts directly (Q4: up asks no "Empezamos?")', async () => {
    const { ui } = await start([]);
    expect(await ui!.preflight({ checks: [{ label: 'git', state: 'ok' }], verdict: 'clear', text: 'ok' }, async () => { throw new Error('no recheck'); })).toBe('go');
  });

  test('a block waits for "check again" and runs the probes again', async () => {
    const { ui } = await start([]);
    let rounds = 0;
    const p = ui!.preflight({ checks: [{ label: 'gh', state: 'block', msg: 'gh auth login' }], verdict: 'block', text: 'blocked' }, async () => {
      rounds += 1;
      return { checks: [{ label: 'gh', state: 'ok' }], verdict: 'clear', text: 'ok' };
    });
    await Bun.sleep(20);
    const fail = (await events(ui!.url)).find(e => e.t === 'fail');
    expect(fail).toMatchObject({ actions: [{ value: 'recheck' }, { value: 'abort' }] });
    expect(await answer(ui!.url, fail!.t === 'fail' ? fail!.id : '', 'recheck')).toBe(200);
    expect(await p).toBe('go');
    expect(rounds).toBe(1);
  });

  test('a block in a read-only run aborts: nobody is there to fix it', async () => {
    const { ui } = await start(['--auto']);
    expect(await ui!.preflight({ checks: [{ label: 'gh', state: 'block' }], verdict: 'block', text: 'b' }, async () => { throw new Error('no'); })).toBe('abort');
  });
});

describe('self-update hand-off (plan §6)', () => {
  test('the child binds the same port and token, continues the journal and opens nothing', async () => {
    const { ui, repoRoot } = await start([]);
    ui!.sink.enter('self');
    const env = await ui!.beforeReexec({ kind: 'self-update', from: '8.5', to: 'abc1234' });
    opened.splice(opened.indexOf(ui!), 1);
    expect(Object.keys(env).sort()).toEqual([HANDOFF_ENV.journal, HANDOFF_ENV.port, HANDOFF_ENV.token].sort());
    const journalFile = env[HANDOFF_ENV.journal];
    expect((readFileSync(journalFile, 'utf8').match(/"restart"/g) ?? []).length).toBe(1);

    const child = await start([], env, repoRoot);
    expect(child.ui!.url).toBe(ui!.url);
    expect(child.ui!.resumed).toBe(true);
    expect(child.lines).toEqual([]);
    expect(existsSync(journalFile)).toBe(false);
    const seen = await events(child.ui!.url);
    expect(seen.filter(e => e.t === 'run.start')).toHaveLength(1);
    expect(seen.some(e => e.t === 'restart')).toBe(true);
    // The child's clear preflight stays silent: the parent already showed it.
    expect(await child.ui!.preflight({ checks: [], verdict: 'clear', text: '' }, async () => { throw new Error('no'); })).toBe('go');
    expect((await events(child.ui!.url)).filter(e => e.t === 'preflight')).toHaveLength(0);
  });
});

describe('end of run (D6, Q3)', () => {
  test('finish writes the saved summary under .session/runs and the run.end names it', async () => {
    const { ui, repoRoot } = await start([]);
    ui!.report(reportInput());
    opened.splice(opened.indexOf(ui!), 1);
    const path = await ui!.finish('done', 0);
    expect(path).toMatch(/^\.session\/runs\/up-\d{8}-\d{4}\.html$/);
    expect(readdirSync(join(repoRoot, '.session', 'runs'))).toHaveLength(1);
    const html = readFileSync(join(repoRoot, path!), 'utf8');
    expect(html).toContain('"t":"run.end"');
    expect(html).toContain('"t":"report"');
  });
});

function reportInput(extra: Partial<Parameters<typeof buildUpdaterReport>[0]> = {}): Parameters<typeof buildUpdaterReport>[0] {
  return { dryRun: false, auto: false, aborted: false, applied: 3, skipped: 0, failed: [], upstreamSha: 'abcdef1234', surfaces: [{ state: 'ok', label: 'Skills', cell: 'sin diferencias' }], findings: [], ...extra };
}

describe('the report event', () => {
  test('a clean run is good, names the upstream sha and suggests the commit', () => {
    const r = buildUpdaterReport(reportInput({ commit: 'chore(boilerplate): sync to abcdef1' }), 'es');
    expect(r).toMatchObject({ tone: 'good', title: 'Tu proyecto está en abcdef1.' });
    expect(r.next[0]).toMatchObject({ cmd: 'git commit -m "chore(boilerplate): sync to abcdef1"' });
    expect(r.tiles.map(t => t.n)).toEqual(['3', '0', '0', '0']);
  });

  test('--auto with deferred files is pending and tells to run bun sync; a blocking finding is bad', () => {
    const pending = buildUpdaterReport(reportInput({ auto: true, skipped: 2 }), 'en');
    expect(pending.tone).toBe('warn');
    expect(pending.next[0]).toMatchObject({ cmd: 'bun sync' });
    const bad = buildUpdaterReport(reportInput({ findings: [{ id: 1, surface: 'Hooks', path: '.claude/settings.json', evidence: 'missing <hook>', suggested: 'merge', blocking: true, side: 'kept' }], prompt: 'P', promptPath: '.agents/prompts/parity-plan.md' }), 'es');
    expect(bad.tone).toBe('bad');
    expect(bad.findings[0]).toMatchObject({ now: 'tuyo', evidence: 'missing &lt;hook&gt;', blocking: true });
    expect(bad.prompt).toBe('P');
  });

  test('a dry run says nothing was written', () => {
    expect(buildUpdaterReport(reportInput({ dryRun: true }), 'en').title).toBe('Preview: nothing was written to your project.');
  });
});
