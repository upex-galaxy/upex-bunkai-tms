/**
 * `bun sync` end to end on a throwaway fixture (installer-ui delivery 2, plan
 * §12): the page answered over its real HTTP contract, `--headless` against the
 * flow without the flag (headless parity), and `--auto` read-only in the page.
 *
 * The fixture is a local clone of this repo (`scripts/ui-up-fixture.ts`), so no
 * gh session and no network are needed. Skipped on a history too short for it
 * (a shallow CI clone).
 */

import type { JournalEntry } from '../cli/lib/ui/events.ts';
import type { UpFixture } from './ui-up-fixture.ts';

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { buildUpFixture } from './ui-up-fixture.ts';

const REPO = resolve(import.meta.dir, '..');
const deep = spawnSync('git', ['-C', REPO, 'rev-parse', '--verify', '-q', 'HEAD~30']).status === 0;
// Random per run: the sync page may show a diff of THIS file, so a literal value
// would leak through the test's own source (a removed line included) rather than
// through the run, whenever the fixture's HEAD~30 window holds an edit of it.
const SECRET = `fixture-secret-${crypto.randomUUID()}`;

interface Run { exit: number, out: string, events: JournalEntry[] }

/** The updater in `consumer`, stdin closed (no TTY), the page served and never opened. */
async function runUp(f: UpFixture, args: string[], answer?: (e: JournalEntry) => unknown): Promise<Run> {
  const child = spawn(process.execPath, ['cli/update-boilerplate.ts', ...args], {
    cwd: f.consumer,
    // A clean environment: `bun test` loads this repo's `.env` into process.env,
    // and none of it may reach the fixture run (nor its journal).
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, UPEX_TEMPLATE_REPO: f.upstream, UPEX_UI_NO_OPEN: '1', NO_COLOR: '1', LANG: 'es_ES.UTF-8' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  const events: JournalEntry[] = [];
  let following = false;
  const follow = async (url: string): Promise<void> => {
    const host = new URL(url).host;
    const token = url.split('/r/')[1].replace(/\/$/, '');
    const answered = new Set<string>();
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        const res = await fetch(`${url}events?last=${events.at(-1)?.seq ?? 0}`, { headers: { host } });
        const reader = res.body!.getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { break; }
          buf += new TextDecoder().decode(value);
          for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
            const data = buf.slice(0, i).split('\n').find(l => l.startsWith('data: '));
            buf = buf.slice(i + 2);
            if (!data) { continue; }
            const e = JSON.parse(data.slice(6)) as JournalEntry;
            events.push(e);
            if ((e.t === 'ask' || e.t === 'fail') && answer && !answered.has(e.id)) {
              answered.add(e.id);
              await fetch(`${url}answer`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-run-token': token, 'origin': `http://${host}`, host }, body: JSON.stringify({ id: e.id, value: answer(e) }) });
            }
            if (e.t === 'run.end') { await reader.cancel(); return; }
          }
        }
      }
      catch { /* the server restarts across the self-update: reconnect */ }
      await Bun.sleep(200);
    }
  };
  const onData = (d: Buffer): void => {
    out += d.toString();
    const m = /(http:\/\/127\.0\.0\.1:\d+\/r\/[\w-]+\/)/.exec(out);
    if (m && !following) { following = true; void follow(m[1]); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const exit = await new Promise<number>(ok => child.on('close', code => ok(code ?? 1)));
  return { exit, out, events };
}

/** Default answers, except: take every area and file, keep the project's edit. */
function defaults(e: JournalEntry): unknown {
  if (e.t === 'fail') { return e.actions.at(-1)!.value; }
  if (e.t !== 'ask') { return null; }
  if (e.kind === 'confirm') { return e.default ?? false; }
  if (e.kind === 'multi' || e.kind === 'package-keys') { return (e.spec.options ?? []).filter(o => o.checked).map(o => o.value); }
  if (e.kind === 'files') { return (e.spec.files ?? []).map(f => f.path); }
  if (e.kind === 'divergence') { return 'mine'; }
  return e.default ?? e.spec.options?.[0]?.value;
}

function normalize(out: string): string {
  return out
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\[[0-9;?]*[a-z]/gi, '')
    .replace(/[0-9a-f]{7,40}/g, '<sha>')
    .replace(/\d+(?:\.\d+)? ?(?:ms|s)\b/g, '<t>')
    .replace(/update-[\w:.-]+/g, 'update-<ts>')
    .split('\n')
    .filter(l => !/^[│\s]*$/.test(l))
    .join('\n');
}

describe.if(deep)('bun sync on a fixture project', () => {
  const root = mkdtempSync(join(tmpdir(), 'ui-up-e2e-'));

  test('--headless keeps exactly the terminal flow of a run without the page (headless parity)', async () => {
    const f = buildUpFixture(join(root, 'parity'));
    const plain = await runUp(f, ['--auto', '--dry-run', '--no-gates']);
    const headless = await runUp(f, ['--auto', '--dry-run', '--no-gates', '--headless']);
    expect(plain.exit).toBe(0);
    expect(headless.exit).toBe(0);
    expect(normalize(headless.out)).toBe(normalize(plain.out));
    expect(plain.out).not.toContain('127.0.0.1');
    expect(existsSync(join(f.consumer, '.session', 'runs'))).toBe(false);
  }, 180_000);

  test('the page: questions first, then one apply; the page survives the self-update; summary saved, no secret anywhere', async () => {
    const f = buildUpFixture(join(root, 'page'), { selfUpdate: true });
    writeFileSync(join(f.consumer, '.env'), `ATLASSIAN_API_TOKEN=${SECRET}\n`);
    const before = f.edited ? readFileSync(join(f.consumer, f.edited), 'utf8') : '';
    const run = await runUp(f, ['--ui', '--no-gates'], defaults);
    expect(run.exit).toBe(0);

    const kinds = run.events.filter(e => e.t === 'ask').map(e => e.t === 'ask' && e.kind);
    expect(kinds).toContain('confirm'); // the self-update OK
    expect(kinds).toContain('multi'); // areas
    expect(kinds).toContain('files');
    if (f.edited) { expect(kinds).toContain('divergence'); }
    expect(run.events.filter(e => e.t === 'run.start')).toHaveLength(1);
    expect(run.events.some(e => e.t === 'restart')).toBe(true);
    expect(run.events.at(-1)).toMatchObject({ t: 'run.end', exit: 0 });

    // Collect first, then write: every answer comes before the first written file.
    const lastAnswer = Math.max(...run.events.filter(e => e.t === 'answered').map(e => e.seq));
    const firstWrite = run.events.find(e => e.t === 'step.log' && e.line.startsWith('Aplicado: '));
    expect(firstWrite && firstWrite.seq).toBeGreaterThan(lastAnswer);
    // "Keep mine" kept the project's edit.
    if (f.edited) { expect(readFileSync(join(f.consumer, f.edited), 'utf8')).toBe(before); }

    const runs = readdirSync(join(f.consumer, '.session', 'runs'));
    expect(runs).toHaveLength(1);
    const summary = readFileSync(join(f.consumer, '.session', 'runs', runs[0]), 'utf8');
    expect(summary).toContain('"t":"report"');
    expect(summary).not.toContain(SECRET);
    expect(JSON.stringify(run.events)).not.toContain(SECRET);
    expect(run.out).not.toContain(SECRET);
  }, 240_000);

  test('an explicit --auto in the page is read-only: no question, the run applies and reports', async () => {
    const f = buildUpFixture(join(root, 'auto'));
    const run = await runUp(f, ['--auto', '--ui', '--no-gates']);
    expect(run.exit).toBe(0);
    expect(run.events[0]).toMatchObject({ t: 'run.start', mode: 'readonly' });
    expect(run.events.some(e => e.t === 'ask')).toBe(false);
    expect(run.events.some(e => e.t === 'report')).toBe(true);
    expect(run.events.at(-1)).toMatchObject({ t: 'run.end' });
  }, 180_000);
});
