import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { handoffEnv, Journal, MASK, readHandoffEnv, Redactor } from './events.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); }
});

describe('Journal', () => {
  test('stamps a growing sequence and the time since the run started', () => {
    let now = 1000;
    const j = new Journal({ now: () => now });
    now = 1250;
    const a = j.append({ t: 'notice', level: 'info', text: 'one' });
    now = 1900;
    const b = j.append({ t: 'notice', level: 'info', text: 'two' });
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect([a.ts, b.ts]).toEqual([250, 900]);
    expect(j.lastSeq).toBe(2);
  });

  test('since() returns only the entries after a sequence number', () => {
    const j = new Journal();
    for (const text of ['a', 'b', 'c']) { j.append({ t: 'notice', level: 'info', text }); }
    expect(j.since(1).map(e => e.seq)).toEqual([2, 3]);
    expect(j.since(0)).toHaveLength(3);
    expect(j.since(3)).toEqual([]);
  });

  test('listeners get every entry in order and a throwing listener never stops the run', () => {
    const j = new Journal();
    const seen: number[] = [];
    j.subscribe(() => { throw new Error('boom'); });
    const off = j.subscribe(e => seen.push(e.seq));
    j.append({ t: 'notice', level: 'info', text: 'a' });
    off();
    j.append({ t: 'notice', level: 'info', text: 'b' });
    expect(seen).toEqual([1]);
    expect(j.lastSeq).toBe(2);
  });

  test('every string of an event is redacted before it is stored, keys included', () => {
    const j = new Journal();
    j.redactor.add('s3cr3t-value');
    const e = j.append({ t: 'report', tiles: [{ n: '1', label: 'token s3cr3t-value here' }], next: [{ title: 's3cr3t-value', cmd: 'echo s3cr3t-value' }] });
    expect(JSON.stringify(e)).not.toContain('s3cr3t-value');
    expect(JSON.stringify(e)).toContain(MASK);
  });

  test('a resumed journal continues the sequence and the clock (self-update hand-off)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-journal-'));
    dirs.push(dir);
    let now = 0;
    const parent = new Journal({ now: () => now });
    now = 400;
    parent.append({ t: 'notice', level: 'info', text: 'before restart' });
    parent.append({ t: 'restart', reason: 'self-update', from: '1', to: '2' });
    const file = join(dir, 'journal.json');
    parent.writeFile(file);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    now = 10_000;
    const child = new Journal({ now: () => now, resume: Journal.readFile(file) });
    now = 10_100;
    const next = child.append({ t: 'notice', level: 'info', text: 'after restart' });
    expect(next.seq).toBe(3);
    expect(next.ts).toBe(500);
    expect(child.since(0).map(e => e.seq)).toEqual([1, 2, 3]);
  });

  test('ended is true once run.end is in the journal', () => {
    const j = new Journal();
    expect(j.ended).toBe(false);
    j.append({ t: 'run.end', status: 'done', exit: 0 });
    expect(j.ended).toBe(true);
  });
});

describe('Redactor', () => {
  test('masks the longest value first, ignores values too short to be credentials', () => {
    const r = new Redactor();
    r.add('abc');
    r.add('token-1234');
    r.add('token-1234-extended');
    expect(r.size).toBe(2);
    expect(r.text('x token-1234-extended y token-1234 abc')).toBe(`x ${MASK} y ${MASK} abc`);
  });
});

describe('hand-off env', () => {
  test('round-trips port, token and journal path', () => {
    const env = handoffEnv({ port: 4381, token: 'tok', journalPath: '/tmp/j.json' });
    expect(readHandoffEnv(env)).toEqual({ port: 4381, token: 'tok', journalPath: '/tmp/j.json' });
  });

  test('is null when any part is missing or the port is not a number', () => {
    expect(readHandoffEnv({})).toBeNull();
    expect(readHandoffEnv({ UPEX_UI_PORT: 'x', UPEX_UI_TOKEN: 't', UPEX_UI_JOURNAL: '/j' })).toBeNull();
    expect(readHandoffEnv({ UPEX_UI_PORT: '4380', UPEX_UI_JOURNAL: '/j' })).toBeNull();
  });
});
