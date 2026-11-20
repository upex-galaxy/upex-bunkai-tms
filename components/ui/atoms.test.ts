import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Textarea } from './textarea';

const ROOT = join(import.meta.dir, '..', '..');
const MOCKUP_CSS = readFileSync(join(ROOT, '.context/designs/bunkai-test-management-tool/project/styles.css'), 'utf8');
const APP_CSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');

const PORTED_SELECTORS = [
  '.divider',
  '.v-divider',
  '.seg',
  '.seg > button',
  '.seg > button:hover',
  '.seg > button[aria-pressed="true"]',
  '.tag',
  '.tag .x',
  '.tag .x:hover',
  '.t-pass',
  '.t-fail',
  '.t-blocked',
  '.t-skipped',
  '.t-running',
  '.t-accent',
  '.caret',
  '.bar',
  '.bar > .fill',
  '.bar > .fill[data-color="pass"]',
  '.bar > .fill[data-color="running"]',
  '.bar.seg-bar',
  '.bar.seg-bar > span',
];

function normalizeSelector(selector: string): string {
  return selector.trim().replace(/\s+/g, ' ').replace(/'/g, '"');
}

function rulesOf(css: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selectorList, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon === -1) {
        continue;
      }
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).replace(/\s+/g, '').replace(/'/g, '"');
      declarations.set(property, value);
    }
    for (const selector of selectorList.split(',')) {
      rules.set(normalizeSelector(selector), declarations);
    }
  }
  return rules;
}

describe('mockup atoms ported to app/globals.css', () => {
  const mockup = rulesOf(MOCKUP_CSS);
  const app = rulesOf(APP_CSS);

  for (const selector of PORTED_SELECTORS) {
    it(`declares ${selector} exactly as the mockup does`, () => {
      const canonical = mockup.get(selector);
      expect(canonical).toBeDefined();
      expect(app.get(selector)).toEqual(canonical);
    });
  }

  it('defines the caret blink keyframes the .caret rule animates', () => {
    expect(APP_CSS).toMatch(/@keyframes caret\s*\{\s*50%\s*\{\s*opacity:\s*0;?\s*\}\s*\}/);
  });
});

describe('textarea atom', () => {
  const html = renderToStaticMarkup(createElement(Textarea, { placeholder: 'Notes' }));
  const classes = /class="([^"]*)"/.exec(html)?.[1].split(/\s+/) ?? [];

  it('takes the mockup .textarea tokens: 12.5px, 7px 9px padding, bg-2, stroke-2, r-2', () => {
    expect(classes).toEqual(expect.arrayContaining([
      'text-[12.5px]',
      'leading-[1.4]',
      'px-[9px]',
      'py-[7px]',
      'bg-surface-2',
      'border',
      'border-stroke-2',
      'rounded-2',
      'text-fg-0',
      'placeholder:text-fg-4',
    ]));
  });

  it('resizes vertically from a 60px minimum height', () => {
    expect(classes).toEqual(expect.arrayContaining(['resize-y', 'min-h-[60px]']));
  });

  it('follows the mockup hover and focus states', () => {
    expect(classes).toEqual(expect.arrayContaining([
      'hover:border-stroke-3',
      'focus:border-accent',
      'focus:bg-surface-3',
      'outline-none',
    ]));
  });

  it('lets a caller extend the classes', () => {
    const extended = renderToStaticMarkup(createElement(Textarea, { className: 'font-mono' }));
    expect(extended).toContain('font-mono');
  });
});
