import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { Journal } from './events.ts';
import { pruneSummaries, RUNS_DIR, summaryStamp, writeSummary } from './summary.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); }
});
function root(): string {
  const d = mkdtempSync(join(tmpdir(), 'ui-summary-'));
  dirs.push(d);
  return d;
}

function journal(): Journal {
  const j = new Journal();
  j.append({ t: 'run.start', cmd: 'up', args: [], repo: 'acme', version: '1', mode: 'interactive', lang: 'es', phases: [] });
  j.append({ t: 'notice', level: 'info', text: 'hello </script><b>x</b>' });
  j.append({ t: 'run.end', status: 'done', exit: 0 });
  return j;
}

describe('writeSummary (owner answer Q3)', () => {
  test('writes .session/runs/<cmd>-<yyyymmdd-hhmm>.html with the journal embedded', () => {
    const repo = root();
    const rel = writeSummary({ repoRoot: repo, cmd: 'up', lang: 'es', journal: journal().all(), now: new Date(2026, 9, 11, 14, 5) });
    expect(rel).toBe(join(RUNS_DIR, 'up-20261011-1405.html'));
    const html = readFileSync(join(repo, rel), 'utf8');
    expect(html).toContain('"mode":"saved"');
    expect(html).toContain('"t":"run.end"');
    // The embedded journal cannot close its script element.
    expect(html).not.toContain('hello </script>');
    expect(html).toContain('hello \\u003c/script>');
  });

  test('two runs in the same minute do not overwrite each other', () => {
    const repo = root();
    const now = new Date(2026, 9, 11, 14, 5);
    const a = writeSummary({ repoRoot: repo, cmd: 'setup', lang: 'en', journal: [], now });
    const b = writeSummary({ repoRoot: repo, cmd: 'setup', lang: 'en', journal: [], now });
    expect(a).not.toBe(b);
    expect(b.endsWith('setup-20261011-1405-2.html')).toBe(true);
  });

  test('keeps only the newest summaries and never touches other files', () => {
    const repo = root();
    const dir = join(repo, RUNS_DIR);
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      const f = join(dir, `up-2026100${i}-1200.html`);
      writeFileSync(f, 'x');
      utimesSync(f, new Date(2026, 9, i + 1), new Date(2026, 9, i + 1));
    }
    writeFileSync(join(dir, 'notes.md'), 'mine');
    const gone = pruneSummaries(dir, 3);
    expect(gone.sort()).toEqual(['up-20261000-1200.html', 'up-20261001-1200.html']);
    expect(readdirSync(dir).sort()).toEqual(['notes.md', 'up-20261002-1200.html', 'up-20261003-1200.html', 'up-20261004-1200.html']);
    expect(existsSync(join(dir, 'notes.md'))).toBe(true);
  });

  test('summaryStamp pads every field', () => {
    expect(summaryStamp(new Date(2026, 0, 2, 3, 4))).toBe('20260102-0304');
  });
});
