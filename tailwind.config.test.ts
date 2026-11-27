import type { Config } from 'tailwindcss';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
// @ts-expect-error -- tailwindcss ships no types for the extractor its own content scan uses
import { defaultExtractor } from 'tailwindcss/lib/lib/defaultExtractor.js';
import tailwindConfig from './tailwind.config';

// BK-2546: a var() color token used to emit no CSS at all under an opacity modifier (border-accent/35).

type ColorFn = (options: { opacityValue?: string }) => string;
interface Palette { [key: string]: string | ColorFn | Palette }

const REPO_ROOT = import.meta.dir;
const SCANNED_DIRS = ['app', 'components', 'lib'];
const MODIFIED = /^(.*[^/[])\/(?:\d+(?:\.\d+)?|\[[^\]]+\])$/;
const COLOR_UTILITIES = ['bg', 'text', 'border', 'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l', 'border-s', 'border-e', 'ring', 'ring-offset', 'divide', 'outline', 'fill', 'stroke', 'caret', 'accent', 'decoration', 'shadow', 'from', 'via', 'to', 'placeholder'];
const OPACITY_VARIABLE = /--tw-(?:bg|text|border|divide|placeholder|ring)-opacity: 1;\s*/g;
const OPACITY_RGB = /rgb\((\d+) (\d+) (\d+) \/ var\(--tw-[a-z]+-opacity, 1\)\)/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        out.push(...sourceFiles(full));
      }
    }
    else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function flatten(palette: Palette, prefix = ''): Array<[string, string | ColorFn]> {
  return Object.entries(palette).flatMap(([key, value]) => {
    const name = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    return typeof value === 'object' ? flatten(value, name) : [[name, value] as [string, string | ColorFn]];
  });
}

function toPlainPalette(palette: Palette): Palette {
  return Object.fromEntries(Object.entries(palette).map(([key, value]) => [
    key,
    typeof value === 'function' ? value({}) : typeof value === 'object' ? toPlainPalette(value) : value,
  ]));
}

const palette = tailwindConfig.theme?.extend?.colors as unknown as Palette;
const tokenNames = flatten(palette).filter(([, value]) => String(typeof value === 'function' ? value({}) : value).startsWith('var(')).map(([name]) => name);
const plainConfig: Config = {
  ...tailwindConfig,
  corePlugins: undefined,
  theme: { ...tailwindConfig.theme, extend: { ...tailwindConfig.theme?.extend, colors: toPlainPalette(palette) as Record<string, string> } },
};

const extract = defaultExtractor({ tailwindConfig: { separator: ':', prefix: '' } });
const candidates = [...new Set(SCANNED_DIRS
  .flatMap(dir => sourceFiles(join(REPO_ROOT, dir)))
  .flatMap(path => extract(readFileSync(path, 'utf8'))))];
const modifiedInventory = candidates.filter(candidate => MODIFIED.test(candidate));
const tokenMatrix = tokenNames.flatMap(name => COLOR_UTILITIES.map(utility => `${utility}-${name}`));
const GRADIENT_START = /^(?:from|via)-/;

async function emittedRules(config: Config, classes: string[]): Promise<Map<string, string>> {
  const result = await postcss([tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] })])
    .process('@tailwind utilities;', { from: undefined });
  const rules = new Map<string, string>();
  result.root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      const match = /^\.((?:\\.|[^\s:>~+.\\[])+)/.exec(selector);
      if (match) {
        const cls = match[1].replace(/\\(.)/g, '$1');
        rules.set(cls, `${rules.get(cls) ?? ''}${rule.toString().replace(/\s+/g, ' ')}\n`);
      }
    }
  });
  return rules;
}

function asHex(css: string): string {
  return css.replace(OPACITY_VARIABLE, '').replace(OPACITY_RGB, (_, r, g, b) => `#${[r, g, b].map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`);
}

function shortHex(css: string): string {
  return css.replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3\b/g, '#$1$2$3');
}

const allClasses = [...candidates, ...modifiedInventory.map(candidate => MODIFIED.exec(candidate)![1]), ...tokenMatrix, ...tokenMatrix.map(cls => `${cls}/50`)];
const [current, plain] = await Promise.all([emittedRules(tailwindConfig, allClasses), emittedRules(plainConfig, allClasses)]);

describe('opacity modifiers on var() color tokens (BK-2546)', () => {
  it('scans the source tree and finds modified token classes', () => {
    expect(candidates.length).toBeGreaterThan(1000);
    expect(modifiedInventory).toContain('border-accent/35');
    expect(tokenNames).toContain('accent-soft');
    expect(tokenNames).toContain('primary');
  });

  it('emits CSS for every opacity-modified class in app, components and lib whose unmodified form emits CSS', () => {
    const silent = modifiedInventory.filter(candidate => current.has(MODIFIED.exec(candidate)![1]) && !current.has(candidate));

    expect(silent).toEqual([]);
  });

  it('accepts an opacity modifier on every token, every color utility', () => {
    const silent = tokenMatrix.map(cls => `${cls}/50`).filter(cls => current.has(cls.slice(0, -3)) && !current.get(cls)?.includes('color-mix(in srgb, var(--'));

    expect(silent).toEqual([]);
    expect(current.get('bg-accent-soft/50')).toContain('background-color: color-mix(in srgb, var(--accent-soft) 50%, transparent)');
  });

  it('compiles every class without a modifier on a token byte-identical to the plain var() palette', () => {
    const changed = tokenMatrix.filter(cls => !GRADIENT_START.test(cls) && current.get(cls) !== plain.get(cls));

    expect(tokenMatrix.filter(cls => current.has(cls)).length).toBeGreaterThan(tokenNames.length * 10);
    expect(changed).toEqual([]);
  });

  it('fades a gradient start on a token to that token, not to transparent white', () => {
    expect(plain.get('from-accent')).toContain('--tw-gradient-to: rgb(255 255 255 / 0)');
    expect(current.get('from-accent')).toBe(plain.get('from-accent')!.replace('rgb(255 255 255 / 0)', 'color-mix(in srgb, var(--accent) 0%, transparent)'));
    expect(current.get('via-accent')).toBe(plain.get('via-accent')!.replace('rgb(255 255 255 / 0)', 'color-mix(in srgb, var(--accent) 0%, transparent)'));
  });

  it('keeps every class the app uses without a modifier: token classes byte-identical, built-in colors the same color', () => {
    const used = candidates.filter(cls => plain.has(cls));
    const changed = used.filter((cls) => {
      const before = plain.get(cls)!;
      const after = current.get(cls);
      return after !== before && after !== shortHex(asHex(before)) && after !== asHex(before);
    });
    const added = candidates.filter(cls => current.has(cls) && !plain.has(cls) && !MODIFIED.test(cls));

    expect(used.length).toBeGreaterThan(500);
    expect(changed).toEqual([]);
    expect(added).toEqual([]);
  });
});
