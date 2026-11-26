import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'bun:test';
import tailwindConfig from '../../tailwind.config';

// BK-2095: a bare signal name (text-fail, bg-pass) matches no key under `signal` in tailwind.config.ts, so Tailwind emits no CSS for it.

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SCANNED_DIRS = ['app', 'components', 'lib'];

const signalNames = Object.keys(
  (tailwindConfig.theme?.extend?.colors as Record<string, Record<string, string>>).signal,
).sort((a, b) => b.length - a.length);

const COLOR_UTILITY = 'text|bg|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|from|via|to|decoration|accent|caret|placeholder|shadow';
const BARE_SIGNAL_CLASS = new RegExp(`(?<![\\w-])(?:${COLOR_UTILITY})-(?:${signalNames.join('|')})(?:/\\d+)?(?![\\w-])`, 'g');

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

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function bareSignalClasses(code: string): string[] {
  return [...code.matchAll(BARE_SIGNAL_CLASS)].map(match => match[0]);
}

const files = SCANNED_DIRS
  .flatMap(dir => sourceFiles(join(REPO_ROOT, dir)))
  .map(path => ({ path: relative(REPO_ROOT, path), code: stripComments(readFileSync(path, 'utf8')) }));

describe('signal color classes resolve to a Tailwind token (BK-2095)', () => {
  it('reads the signal names from tailwind.config.ts', () => {
    expect(signalNames).toContain('fail');
    expect(signalNames).toContain('pass');
    expect(signalNames).toContain('blocked');
  });

  it('flags a bare signal name and leaves the signal- token alone', () => {
    expect(bareSignalClasses('className="hover:text-fail border-fail/40 bg-fail-bg"')).toEqual(['text-fail', 'border-fail/40', 'bg-fail-bg']);
    expect(bareSignalClasses('className="text-signal-fail bg-signal-pass-bg"')).toEqual([]);
    expect(bareSignalClasses('data-testid="runner-step-mark-fail-1"')).toEqual([]);
  });

  it('scans the source tree', () => {
    expect(files.some(file => file.path === 'components/chat/ChatPanel.tsx')).toBe(true);
  });

  it('uses no bare signal name as a color class', () => {
    const offenders = files.flatMap(file => bareSignalClasses(file.code).map(cls => `${file.path}: ${cls}`));

    expect(offenders).toEqual([]);
  });
});
