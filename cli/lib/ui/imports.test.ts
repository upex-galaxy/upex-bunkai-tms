/**
 * Import graph of `cli/lib/ui/` (plan §8 and §12). Every module here must load with
 * node built-ins and sibling files only: it ships inside the updater's self-update
 * component (`cli/` is import-closed), it is shared byte for byte with the Dev
 * boilerplate (owner answer Q8), and the installer opens the page before
 * `bun install` may have finished.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const DIR = import.meta.dir;
const modules = readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

/** Run-time specifiers: `import type` lines are erased by the transpiler, so they never load anything. */
function specifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/g)) { out.push(m[1]); }
  for (const m of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) { out.push(m[1]); }
  return out;
}

/** Every file a module loads at run time, followed through relative imports. */
function runtimeGraph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const walk = (file: string): void => {
    if (seen.has(file)) { return; }
    const specs = specifiers(readFileSync(file, 'utf8'));
    seen.set(file, specs);
    for (const spec of specs) {
      if (spec.startsWith('.')) { walk(join(dirname(file), spec)); }
    }
  };
  walk(entry);
  return seen;
}

describe('cli/lib/ui import graph', () => {
  test('there are modules to check', () => {
    expect(modules).toContain('events.ts');
    expect(modules).toContain('browser-sink.ts');
  });

  for (const file of modules) {
    test(`${file} imports only node:* and sibling files`, () => {
      for (const spec of specifiers(readFileSync(join(DIR, file), 'utf8'))) {
        const ok = spec.startsWith('node:') || /^\.\/[\w-]+\.ts$/.test(spec);
        expect(ok, `${file} imports "${spec}"`).toBe(true);
      }
    });
  }

  // The preflight runs before `bun install` (preflight.md §1): its WHOLE graph is node:*.
  for (const entry of ['../../preflight.ts', '../probes.ts']) {
    test(`${entry} loads only node:* modules, transitively`, () => {
      for (const [file, specs] of runtimeGraph(join(DIR, entry))) {
        for (const spec of specs) {
          expect(spec.startsWith('node:') || spec.startsWith('.'), `${file} imports "${spec}"`).toBe(true);
        }
      }
    });
  }

  test('the page scripts are plain browser code: no import, no require, no remote fetch', () => {
    for (const f of ['app.js', 'asks.js']) {
      const src = readFileSync(join(DIR, 'page', f), 'utf8');
      expect(src).not.toMatch(/^\s*import\s/m);
      expect(src).not.toMatch(/\brequire\(/);
      expect(src).not.toMatch(/fetch\(\s*['"]https?:/);
    }
  });
});
