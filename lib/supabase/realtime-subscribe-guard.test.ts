import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'bun:test';

// BK-1279 — keeps every browser Realtime join authenticated.
//
// `subscribeWithUserAuth` (lib/supabase/realtime-auth.ts) is the only place
// allowed to call `channel.subscribe(...)`: a bare subscribe can join before
// the session token is resolved and land as `anon` (no live chat,
// notifications or runner updates). And a call site must invoke the canceller
// it returns from its effect cleanup, or a channel torn down while its token
// was resolving can still join afterwards.
//
// Pure filesystem scan (same shape as lib/api/route-capability-coverage.test.ts):
// no module imports, no credentials, always runs.

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SCANNED_DIRS = ['app', 'components', 'lib'];
const HELPER_PATH = 'lib/supabase/realtime-auth.ts';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        out.push(...sourceFiles(full));
      }
    }
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Comments mention `.subscribe()` while explaining the bug; only code counts.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = SCANNED_DIRS
  .flatMap(dir => sourceFiles(join(REPO_ROOT, dir)))
  .map(path => ({ path: relative(REPO_ROOT, path), code: stripComments(readFileSync(path, 'utf8')) }));

describe('realtime subscribe guard (BK-1279)', () => {
  it('scans the source tree (sanity: the helper and its call sites are found)', () => {
    expect(files.some(file => file.path === HELPER_PATH)).toBe(true);
    expect(files.filter(file => file.code.includes('subscribeWithUserAuth(')).length).toBeGreaterThan(1);
  });

  it('calls `.subscribe(` only inside the realtime auth helper', () => {
    const offenders = files
      .filter(file => file.path !== HELPER_PATH && /\.subscribe\s*\(/.test(file.code))
      .map(file => file.path);

    expect(offenders).toEqual([]);
  });

  it('invokes the canceller returned by every subscribeWithUserAuth call', () => {
    const problems: string[] = [];

    for (const file of files) {
      if (file.path === HELPER_PATH || !file.code.includes('subscribeWithUserAuth(')) {
        continue;
      }
      const calls = [...file.code.matchAll(/(?:const|let)\s+(\w+)\s*=\s*subscribeWithUserAuth\(/g)];
      const totalCalls = (file.code.match(/subscribeWithUserAuth\(/g) ?? []).length;

      if (calls.length !== totalCalls) {
        problems.push(`${file.path}: a subscribeWithUserAuth(...) result is not kept, so it can never be cancelled`);
      }
      for (const [, name] of calls) {
        if (!new RegExp(`\\b${name}\\(\\)`).test(file.code)) {
          problems.push(`${file.path}: \`${name}\` is never called (add it to the effect cleanup)`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
