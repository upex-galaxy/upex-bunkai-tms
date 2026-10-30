/**
 * HTTP contract of the page server (plan §12): real fetch against a real server on
 * a free port. Token, Host / Origin checks, SSE replay from Last-Event-ID, first
 * answer wins, stop after run.end, and the self-update hand-off keeping the sequence.
 */

import type { BrowserSink } from './browser-sink.ts';
import type { JournalEntry } from './events.ts';

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { startBrowserSink } from './browser-sink.ts';
import { Journal } from './events.ts';
import { Reporter } from './reporter.ts';

const sinks: BrowserSink[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const s of sinks.splice(0)) { await s.stop(); }
  for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); }
});

const PAGE = ({ token }: { token: string }): string => `<!doctype html><title>page ${token.length}</title>`;

async function serve(reporter: Reporter, extra: Partial<Parameters<typeof startBrowserSink>[0]> = {}): Promise<BrowserSink> {
  const sink = await startBrowserSink({ journal: reporter.journal, answer: (id, v) => reporter.answer(id, v, 'page'), page: PAGE, port: 0, portWalk: 0, ...extra });
  reporter.attachClientProbe(sink.hasClient);
  sinks.push(sink);
  return sink;
}

function newReporter(): Reporter {
  return new Reporter({ cmd: 'up', repo: 'acme', version: '1', mode: 'interactive', lang: 'es', phases: [{ id: 'p', title: 'P' }] });
}

async function post(sink: BrowserSink, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${sink.url}answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${sink.port}`, 'x-run-token': sink.token, ...headers },
    body: JSON.stringify(body),
  });
}

/** Reads SSE entries until `count` arrived (or the stream ends), then cancels. */
async function readEvents(url: string, count: number, headers: Record<string, string> = {}): Promise<{ entries: JournalEntry[], raw: string }> {
  const ctrl = new AbortController();
  const res = await fetch(url, { headers, signal: ctrl.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  const entries: JournalEntry[] = [];
  const deadline = Date.now() + 3000;
  while (entries.length < count && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) { break; }
    raw += decoder.decode(value, { stream: true });
    entries.length = 0;
    for (const block of raw.split('\n\n')) {
      const data = block.split('\n').find(l => l.startsWith('data: '));
      if (data) { entries.push(JSON.parse(data.slice(6))); }
    }
  }
  ctrl.abort();
  return { entries, raw };
}

describe('routing and guards', () => {
  test('the page needs the token in the path; a wrong token is a 404', async () => {
    const sink = await serve(newReporter());
    expect((await fetch(sink.url)).status).toBe(200);
    expect((await fetch(sink.url)).headers.get('content-type')).toContain('text/html');
    expect((await fetch(`http://127.0.0.1:${sink.port}/r/wrong-token/`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${sink.port}/`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${sink.port}/r/wrong-token/events`)).status).toBe(404);
  });

  test('localhost is a valid Host; anything else is refused (DNS rebinding)', async () => {
    const sink = await serve(newReporter());
    expect((await fetch(sink.url.replace('127.0.0.1', 'localhost'))).status).toBe(200);
    expect((await fetch(sink.url, { headers: { Host: 'evil.example:80' } })).status).toBe(403);
  });

  test('a foreign Origin is refused on every route', async () => {
    const sink = await serve(newReporter());
    expect((await fetch(sink.url, { headers: { Origin: 'http://evil.example' } })).status).toBe(403);
    expect((await post(sink, { id: 'x', value: true }, { Origin: 'http://evil.example' })).status).toBe(403);
  });

  test('POST answer needs the x-run-token header, an Origin and JSON', async () => {
    const r = newReporter();
    const sink = await serve(r);
    const q = r.ask({ id: 'go', kind: 'confirm', title: 'Go?' });
    expect((await post(sink, { id: 'go', value: true }, { 'x-run-token': 'nope' })).status).toBe(403);
    const noOrigin = await fetch(`${sink.url}answer`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-run-token': sink.token }, body: '{}' });
    expect(noOrigin.status).toBe(403);
    expect((await post(sink, 'x', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(r.waiting()).toEqual(['go']);
    expect((await post(sink, { id: 'go', value: true })).status).toBe(200);
    expect(await q).toBe(true);
  });

  test('GET answer and POST events are not allowed', async () => {
    const sink = await serve(newReporter());
    expect((await fetch(`${sink.url}answer`)).status).toBe(405);
  });
});

describe('answers', () => {
  test('first answer wins: 200, then 409 for the second tab; invalid is 400; unknown is 404', async () => {
    const r = newReporter();
    const sink = await serve(r);
    const q = r.ask<string>({ id: 'env', kind: 'select', title: 'Env?', spec: { options: [{ value: 'staging', label: 'staging' }, { value: 'local', label: 'local' }] } });
    expect((await post(sink, { id: 'env', value: 'prod' })).status).toBe(400);
    const first = await post(sink, { id: 'env', value: 'staging' });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, label: 'staging' });
    expect((await post(sink, { id: 'env', value: 'local' })).status).toBe(409);
    expect((await post(sink, { id: 'ghost', value: 1 })).status).toBe(404);
    expect(await q).toBe('staging');
  });

  test('a replay server (no answer handler) refuses every answer', async () => {
    const journal = new Journal();
    const sink = await startBrowserSink({ journal, page: PAGE, port: 0, portWalk: 0 });
    sinks.push(sink);
    expect((await post(sink, { id: 'q1', value: true })).status).toBe(409);
  });
});

describe('server-sent events', () => {
  test('a new client gets the whole journal, then live events', async () => {
    const r = newReporter();
    r.start();
    r.notice('info', 'one');
    const sink = await serve(r);
    const reading = readEvents(`${sink.url}events`, 3);
    await Bun.sleep(50);
    r.notice('info', 'live');
    const { entries, raw } = await reading;
    expect(entries.map(e => e.seq)).toEqual([1, 2, 3]);
    expect(raw).toContain('id: 3\n');
    expect(raw.startsWith('retry: ')).toBe(true);
  });

  test('replay resumes after Last-Event-ID, without duplicates', async () => {
    const r = newReporter();
    r.start();
    for (const t of ['a', 'b', 'c', 'd']) { r.notice('info', t); }
    const sink = await serve(r);
    const { entries } = await readEvents(`${sink.url}events`, 2, { 'Last-Event-ID': '3' });
    expect(entries.map(e => e.seq)).toEqual([4, 5]);
  });

  test('hasClient follows the open streams', async () => {
    const r = newReporter();
    r.start();
    const sink = await serve(r);
    expect(sink.hasClient()).toBe(false);
    const ctrl = new AbortController();
    const res = await fetch(`${sink.url}events`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    await reader.read();
    expect(sink.hasClient()).toBe(true);
    ctrl.abort();
    await Bun.sleep(50);
    expect(sink.clients()).toBe(0);
  });

  test('a heartbeat comment keeps an idle stream alive', async () => {
    const r = newReporter();
    r.start();
    const sink = await serve(r, { heartbeatMs: 30 });
    const ctrl = new AbortController();
    const res = await fetch(`${sink.url}events`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    let raw = '';
    const until = Date.now() + 1000;
    while (!raw.includes(': hb') && Date.now() < until) { raw += new TextDecoder().decode((await reader.read()).value); }
    ctrl.abort();
    expect(raw).toContain(': hb');
  });
});

describe('lifecycle', () => {
  test('the server stops shortly after run.end', async () => {
    const r = newReporter();
    const sink = await serve(r, { stopAfterEndMs: 30 });
    r.start();
    r.end('done', 0);
    await sink.stopped;
    let refused = false;
    try { await fetch(sink.url); }
    catch { refused = true; }
    expect(refused).toBe(true);
  });

  test('a page still holding its stream open never keeps the run from ending', async () => {
    const r = newReporter();
    const sink = await serve(r, { stopAfterEndMs: 10 });
    const res = await fetch(`${sink.url}events`, { headers: { host: new URL(sink.url).host } });
    const reader = res.body!.getReader();
    void reader.read();
    await Bun.sleep(20);
    expect(sink.hasClient()).toBe(true);
    r.end('done', 0);
    const t0 = Date.now();
    await sink.stopped;
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(sink.hasClient()).toBe(false);
  });

  test('a process serving a page that stays connected still exits once the run ends', () => {
    const script = `
      import { startBrowserSink } from ${JSON.stringify(join(import.meta.dir, 'browser-sink.ts'))};
      import { Reporter } from ${JSON.stringify(join(import.meta.dir, 'reporter.ts'))};
      const r = new Reporter({ cmd: 'up', repo: 'a', version: '1', mode: 'interactive', lang: 'es', phases: [] });
      const s = await startBrowserSink({ journal: r.journal, page: () => 'p', port: 0, portWalk: 0, stopAfterEndMs: 10, heartbeatMs: 50 });
      const res = await fetch(s.url + 'events', { headers: { host: new URL(s.url).host } });
      void res.body.getReader().read();
      await Bun.sleep(30);
      r.end('done', 0);
      await s.stopped;
    `;
    const dir = mkdtempSync(join(tmpdir(), 'sink-exit-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'run.ts'), script);
    const t0 = Date.now();
    const out = Bun.spawnSync([process.execPath, join(dir, 'run.ts')], { timeout: 10_000 });
    expect(out.exitCode).toBe(0);
    expect(Date.now() - t0).toBeLessThan(8_000);
  });

  test('stopAfterEndMs null keeps a finished run online (demo, replay)', async () => {
    const r = newReporter();
    const sink = await serve(r, { stopAfterEndMs: null });
    r.start();
    r.end('done', 0);
    await Bun.sleep(60);
    expect((await fetch(sink.url)).status).toBe(200);
  });

  test('self-update hand-off: the child binds the same port and token and the sequence continues', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-handoff-'));
    dirs.push(dir);
    const parent = newReporter();
    parent.start();
    parent.notice('info', 'before');
    parent.restart('1.0', '1.1');
    const parentSink = await serve(parent, { stopAfterEndMs: null });
    const { port, token } = parentSink;
    const file = join(dir, 'journal.json');
    parent.journal.writeFile(file);
    await parentSink.stop();
    sinks.splice(sinks.indexOf(parentSink), 1);

    const child = new Reporter({ cmd: 'up', repo: 'acme', version: '1.1', mode: 'interactive', lang: 'es', phases: [], journal: new Journal({ resume: Journal.readFile(file) }) });
    const childSink = await serve(child, { port, token, portWalk: 0 });
    expect(childSink.port).toBe(port);
    expect(childSink.url).toBe(parentSink.url);
    child.notice('info', 'after');
    const { entries } = await readEvents(`${childSink.url}events`, 1, { 'Last-Event-ID': '3' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ seq: 4, t: 'notice', text: 'after' });
  });

  test('a taken port walks to the next one', async () => {
    const a = await serve(newReporter(), { port: 0, portWalk: 0 });
    const b = await serve(newReporter(), { port: a.port, portWalk: 3 });
    expect(b.port).not.toBe(a.port);
  });
});
