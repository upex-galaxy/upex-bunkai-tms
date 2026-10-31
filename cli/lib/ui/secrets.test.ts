/**
 * Property test (plan §12): whatever is typed into a secret ask never reaches the
 * journal, the SSE stream or the saved summary, even when a child process echoes
 * it back in its output or a later notice repeats it.
 */

import type { BrowserSink } from './browser-sink.ts';

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { startBrowserSink } from './browser-sink.ts';
import { Reporter } from './reporter.ts';
import { writeSummary } from './summary.ts';

const sinks: BrowserSink[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const s of sinks.splice(0)) { await s.stop(); }
  for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); }
});

/** Deterministic pseudo-random secrets: shapes real tokens take, plus hostile ones. */
function secrets(n: number): string[] {
  let seed = 0x5EED;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return seed / 0x7FFFFFFF; };
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=+/.';
  const out = ['ATATT3xFfGF0-real-shaped-token=ABCDEF', '</script><script>alert(1)</script>', 'pa ss "quoted" \\ back', 'ñandú-contraseña-✓'];
  while (out.length < n) {
    const len = 8 + Math.floor(rnd() * 40);
    out.push(Array.from({ length: len }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(''));
  }
  return out;
}

test('no secret answer survives into the journal, the SSE stream or the saved summary', async () => {
  const values = secrets(24);
  const r = new Reporter({ cmd: 'setup', repo: 'acme', version: '1', mode: 'interactive', lang: 'es', phases: [{ id: 'creds', title: 'Credenciales' }] });
  const sink = await startBrowserSink({ journal: r.journal, answer: (id, v) => r.answer(id, v, 'page'), page: () => '', port: 0, portWalk: 0, stopAfterEndMs: null });
  sinks.push(sink);
  r.start();

  // Capture the stream exactly as a page receives it.
  const ctrl = new AbortController();
  const res = await fetch(`${sink.url}events`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  let streamed = '';
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) { break; }
        streamed += new TextDecoder().decode(value);
      }
    }
    catch { /* aborted */ }
  })();

  for (const [i, secret] of values.entries()) {
    const id = `secret-${i}`;
    const answer = r.ask<string>({ id, kind: 'secret', title: `Token ${i}`, phase: 'creds', spec: { varName: `VAR_${i}` } });
    const sent = await fetch(`${sink.url}answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${sink.port}`, 'x-run-token': sink.token },
      body: JSON.stringify({ id, value: secret }),
    });
    expect(sent.status).toBe(200);
    expect(await sent.text()).not.toContain(secret);
    expect(await answer).toBe(secret);
    // A child that echoes the value, and the core repeating it in a note and a notice.
    const s = r.step({ phase: 'creds', title: `acli login ${i}` });
    s.log(`using token ${secret} for login`);
    s.log(secret, 'err');
    s.end('ok', `stored ${secret}`);
    r.notice('warn', `retrying with ${secret}`);
  }
  r.end('done', 0);
  await Bun.sleep(100);
  ctrl.abort();
  await pump;

  const dir = mkdtempSync(join(tmpdir(), 'ui-secrets-'));
  dirs.push(dir);
  const summaryPath = writeSummary({ repoRoot: dir, cmd: 'setup', lang: 'es', journal: r.journal.all() });
  const summary = readFileSync(join(dir, summaryPath), 'utf8');
  const journal = JSON.stringify(r.journal.all());

  expect(streamed).toContain('"t":"run.end"');
  for (const secret of values) {
    expect(journal.includes(secret), `journal leaks ${secret}`).toBe(false);
    expect(streamed.includes(secret), `stream leaks ${secret}`).toBe(false);
    expect(summary.includes(secret), `summary leaks ${secret}`).toBe(false);
    // The summary escapes `<` inside its JSON: check the escaped form too.
    expect(summary.includes(JSON.stringify(secret).slice(1, -1).replace(/</g, '\\u003c'))).toBe(false);
  }
});
