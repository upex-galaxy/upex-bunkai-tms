import type { JournalEntry } from './events.ts';
import type { InstallerTerminal, InstallerUi } from './installer-run.ts';
import type { AskEvent, FailEvent } from './reporter.ts';

import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { defaultAnswer, installerPhases, startInstallerUi } from './installer-run.ts';

/** A terminal that records what it prints and answers from a script (or never). */
function fakeTerminal(answers: Record<string, unknown> = {}): InstallerTerminal & { printed: JournalEntry[], asked: string[] } {
  const printed: JournalEntry[] = [];
  const asked: string[] = [];
  return {
    printed,
    asked,
    print: (e) => { printed.push(e); },
    ask: async (q: AskEvent | FailEvent, signal: AbortSignal) => {
      asked.push(q.id);
      if (q.id in answers) { return answers[q.id]; }
      return new Promise((_, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted'))); });
    },
  };
}

const opened: InstallerUi[] = [];
afterEach(async () => {
  for (const ui of opened.splice(0)) {
    try { await ui.finish('aborted', 1); }
    catch { /* already closed */ }
  }
}, 15_000);

async function start(o: { argv?: string[], interactive?: boolean, terminal?: InstallerTerminal, tty?: boolean, fallbackAfterMs?: number } = {}): Promise<{ ui: InstallerUi, said: string[], repoRoot: string }> {
  const said: string[] = [];
  const repoRoot = mkdtempSync(join(tmpdir(), 'ui-setup-'));
  const ui = await startInstallerUi({
    argv: o.argv ?? [],
    repoRoot,
    repoName: 'acme-qa',
    version: '1',
    interactive: o.interactive ?? true,
    terminal: o.terminal ?? fakeTerminal(),
    say: l => said.push(l),
    env: { LANG: 'es_ES.UTF-8', UPEX_UI_NO_OPEN: '1' },
    stdinTTY: o.tty ?? true,
    stdoutTTY: o.tty ?? true,
    platform: 'darwin',
    fallbackAfterMs: o.fallbackAfterMs ?? 60_000,
  });
  opened.push(ui);
  return { ui, said, repoRoot };
}

async function post(url: string, id: string, value: unknown): Promise<Response> {
  const u = new URL(url);
  const token = url.split('/r/')[1].replace(/\/$/, '');
  return fetch(`${url}answer`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-run-token': token, 'origin': `http://${u.host}`, 'host': u.host }, body: JSON.stringify({ id, value }) });
}

describe('defaultAnswer: what a question takes when nobody can answer', () => {
  test('one valid value per kind', () => {
    expect(defaultAnswer({ kind: 'confirm', spec: {}, default: true })).toBe(true);
    expect(defaultAnswer({ kind: 'confirm', spec: {} })).toBe(false);
    expect(defaultAnswer({ kind: 'select', spec: { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', rec: true }] } })).toBe('b');
    expect(defaultAnswer({ kind: 'select', spec: { options: [{ value: 'a', label: 'A' }] }, default: 'a' })).toBe('a');
    expect(defaultAnswer({ kind: 'multi', spec: { options: [{ value: 'a', label: 'A', checked: true }, { value: 'b', label: 'B' }] } })).toEqual(['a']);
    expect(defaultAnswer({ kind: 'text', spec: { fields: [{ id: 'x', label: 'X', value: 'v' }, { id: 'y', label: 'Y' }] } })).toEqual(['v', '']);
    expect(defaultAnswer({ kind: 'secret', spec: { secondary: [{ value: 'later', label: 'Después' }] } })).toBe('later');
  });
});

describe('the surface', () => {
  test('--headless: no page; questions go straight to the terminal', async () => {
    const term = fakeTerminal({ q1: true });
    const { ui, said } = await start({ argv: ['--headless'], terminal: term });
    expect(ui.page).toBe(false);
    expect(ui.url).toBeNull();
    ui.start();
    expect(await ui.ask<boolean>({ id: 'q1', kind: 'confirm', title: 'Seguimos?', default: false })).toBe(true);
    expect(term.asked).toEqual(['q1']);
    expect(said.join('\n')).not.toContain('127.0.0.1');
  });

  test('non-interactive: every question takes its default as `auto`, the terminal is never asked', async () => {
    const term = fakeTerminal();
    const { ui } = await start({ interactive: false, tty: false, terminal: term });
    ui.start();
    expect(await ui.ask<string[]>({ id: 'agents', kind: 'multi', title: 'Agentes', spec: { options: [{ value: 'codex', label: 'Codex', checked: true }] } })).toEqual(['codex']);
    expect(await ui.confirmStart({ checks: [], verdict: 'clear', text: '' })).toBe(true);
    expect(term.asked).toEqual([]);
    const answered = ui.journal.all().filter(e => e.t === 'answered');
    expect(answered.every(e => e.t === 'answered' && e.by === 'auto')).toBe(true);
  });

  test('--ui on a run nobody can answer stays in the terminal: a page needs a person', async () => {
    const { ui } = await start({ argv: ['--ui'], interactive: false, tty: false });
    expect(ui.page).toBe(false);
  });

  test('the page answers; the terminal is not asked while a page is connected', async () => {
    const term = fakeTerminal();
    const { ui, said } = await start({ terminal: term });
    expect(ui.page).toBe(true);
    ui.start();
    expect(said[0]).toContain(ui.url!);
    const u = new URL(ui.url!);
    const ctrl = new AbortController();
    await fetch(`${ui.url}events`, { headers: { host: u.host }, signal: ctrl.signal });
    const p = ui.ask<string[]>({ id: 'ident', kind: 'text', title: 'Proyecto', spec: { fields: [{ id: 'n', label: 'Nombre', required: true }] } });
    expect((await post(ui.url!, 'ident', ['Acme Shop'])).status).toBe(200);
    expect(await p).toEqual(['Acme Shop']);
    expect(term.asked).toEqual([]);
    ctrl.abort();
  });

  test('Q6: with no page connected, the terminal takes the question after the window', async () => {
    const term = fakeTerminal({ late: 'b' });
    const { ui } = await start({ terminal: term, fallbackAfterMs: 50 });
    ui.start();
    const v = await ui.ask<string>({ id: 'late', kind: 'select', title: 'Cuál?', spec: { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } });
    expect(v).toBe('b');
    expect(ui.journal.all().find(e => e.t === 'answered')).toMatchObject({ id: 'late', by: 'terminal' });
  });
});

describe('preflight and the start (Q4)', () => {
  test('a block waits for "check again" and starts once the re-check is clear', async () => {
    const term = fakeTerminal({ 'pre-1': 'recheck' });
    const { ui } = await start({ argv: ['--headless'], terminal: term });
    ui.start();
    const blocked = { checks: [{ label: 'Node', state: 'block' as const, msg: 'instala Node' }], verdict: 'block' as const, text: 'bloquea' };
    const clear = { checks: [{ label: 'Node', state: 'ok' as const }], verdict: 'clear' as const, text: 'listo' };
    expect(await ui.preflight(blocked, async () => clear)).toBe('go');
    expect(ui.journal.all().filter(e => e.t === 'preflight')).toHaveLength(2);
  });

  test('a non-interactive run with a block aborts without asking', async () => {
    const { ui } = await start({ interactive: false, tty: false });
    ui.start();
    expect(await ui.preflight({ checks: [{ label: 'Bun', state: 'block' }], verdict: 'block', text: '' }, async () => { throw new Error('never'); })).toBe('abort');
  });

  test('the start question names the warnings, and has no opening question mark', async () => {
    const term = fakeTerminal({ start: false });
    const { ui } = await start({ argv: ['--headless'], terminal: term });
    ui.start();
    expect(await ui.confirmStart({ checks: [{ label: 'Engram', state: 'warn' }], verdict: 'warn', text: '' })).toBe(false);
    const ask = ui.journal.all().find(e => e.t === 'ask' && e.id === 'start');
    expect(ask && ask.t === 'ask' && ask.title).toBe('Empezamos la instalación?');
    expect(ask && ask.t === 'ask' && ask.why).toContain('1 aviso');
  });
});

describe('finish', () => {
  test('a page run saves its summary under .session/runs; a headless run saves none', async () => {
    const page = await start();
    page.ui.start();
    page.ui.report({ title: 'Listo', tone: 'good', tiles: [], next: [] });
    const path = await page.ui.finish('done', 0);
    expect(path).toMatch(/^\.session\/runs\/setup-\d{8}-\d{4}\.html$/);
    expect(readFileSync(join(page.repoRoot, path!), 'utf8')).toContain('"t":"run.end"');

    const headless = await start({ argv: ['--headless'] });
    headless.ui.start();
    expect(await headless.ui.finish('done', 0)).toBeNull();
    expect(existsSync(join(headless.repoRoot, '.session'))).toBe(false);
  });
});

describe('headless parity (plan §12)', () => {
  /** One scripted run through the reporter, the way install.ts emits it. */
  async function scripted(ui: InstallerUi, answerPage?: (id: string, v: unknown) => Promise<void>): Promise<void> {
    ui.start();
    ui.phase('team');
    const p = ui.ask<string[]>({ id: 'agents', kind: 'multi', title: 'Agentes', spec: { options: [{ value: 'codex', label: 'Codex', checked: true }] }, default: ['codex'] });
    if (answerPage) { await answerPage('agents', ['codex']); }
    await p;
    const s = ui.step({ phase: 'install', title: 'Chromium', lane: 'descargas' });
    s.log('Downloading Chromium 140.0');
    s.end('ok', 'una sola vez por máquina');
    ui.notice('warn', 'sin <code>acli</code>: Jira se salta');
    ui.phaseEnd('team');
    ui.report({ title: 'Listo', tone: 'good', tiles: [{ n: '3', label: 'pasos' }], next: [{ title: 'Abre tu agente', cmd: 'claude' }] });
  }

  test('the terminal prints the same journal in both modes; only who answers differs', async () => {
    const headlessTerm = fakeTerminal({ agents: ['codex'] });
    const headless = await start({ argv: ['--headless'], terminal: headlessTerm });
    await scripted(headless.ui);

    const pageTerm = fakeTerminal();
    const page = await start({ terminal: pageTerm });
    const u = new URL(page.ui.url!);
    const ctrl = new AbortController();
    await fetch(`${page.ui.url}events`, { headers: { host: u.host }, signal: ctrl.signal });
    await scripted(page.ui, async (id, v) => { await post(page.ui.url!, id, v); });
    ctrl.abort();

    const shape = (es: JournalEntry[]): string[] => es.map((e) => {
      const { seq: _s, ts: _t, ...rest } = e as JournalEntry & Record<string, unknown>;
      if (rest.t === 'step.end') { delete (rest as Record<string, unknown>).ms; }
      if (rest.t === 'answered') { delete (rest as Record<string, unknown>).by; }
      // The flag that chose the surface is the one expected difference.
      if (rest.t === 'run.start') { delete (rest as Record<string, unknown>).args; }
      return JSON.stringify(rest);
    });
    expect(shape(pageTerm.printed)).toEqual(shape(headlessTerm.printed));
    expect(shape(headlessTerm.printed)).toMatchSnapshot();
  });
});

describe('secrets (property test through the terminal printer)', () => {
  test('a secret answer never reaches what the terminal is handed, nor the journal or the summary', async () => {
    const values = ['ATATT3xFfGF0-real-shaped-token=ABCDEF', '</script><script>alert(1)</script>', 'pa ss "quoted" \\ back', 'ñandú-contraseña-✓', 'x'.repeat(64)];
    for (const secret of values) {
      const term = fakeTerminal({ tok: secret });
      const { ui, repoRoot } = await start({ argv: ['--headless'], terminal: term });
      ui.start();
      const v = await ui.ask<string>({ id: 'tok', kind: 'secret', title: 'Token', spec: { varName: 'ATLASSIAN_API_TOKEN', secondary: [{ value: 'later', label: 'Después' }] } });
      expect(v).toBe(secret);
      const s = ui.step({ phase: 'jira', title: 'acli login' });
      s.log(`echo ${secret} | acli jira auth login`);
      s.end('failed', `token ${secret} rechazado`);
      ui.notice('error', `no pudo usar ${secret}`);
      await ui.finish('done', 0);
      const everything = JSON.stringify(term.printed) + JSON.stringify(ui.journal.all());
      expect(everything).not.toContain(secret);
      const runs = existsSync(join(repoRoot, '.session', 'runs')) ? readdirSync(join(repoRoot, '.session', 'runs')) : [];
      for (const r of runs) { expect(readFileSync(join(repoRoot, '.session', 'runs', r), 'utf8')).not.toContain(secret); }
    }
  });
});

test('the phases follow plan §3 in both languages', () => {
  expect(installerPhases('es').map(p => p.id)).toEqual(['pre', 'team', 'install', 'project', 'creds', 'jira', 'github', 'verify', 'done']);
  expect(installerPhases('en').map(p => p.id)).toEqual(installerPhases('es').map(p => p.id));
});
