/**
 * @fileoverview Assembles the self-contained page from `page/` at run time:
 * `shell.html` + `engine.css` + `asks.js` + `app.js` + one JSON config block
 * (mode, token, language, the string table and the glossary, the brand, and the
 * embedded journal for a saved summary).
 *
 * Assembled on demand rather than committed as a built `page.html`, so there is no
 * generated file to drift from its sources; `cli/**` ships with the updater's
 * self-update, so the sources are always next to this module.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { JournalEntry, Lang } from './events.ts';

import { readFileSync } from 'node:fs';

import { BRAND } from './brand.ts';
import { glossary, strings } from './strings.ts';

export interface PageOptions {
  /** `live`: EventSource + answers. `saved`: render the embedded journal, nothing to answer. */
  mode: 'live' | 'saved'
  /** The footer line: a live run, a replay of a recorded run, or a saved copy. */
  note?: 'live' | 'replay' | 'saved'
  lang: Lang
  token?: string
  journal?: JournalEntry[]
}

const read = (name: string): string => readFileSync(new URL(`./page/${name}`, import.meta.url), 'utf8');

/**
 * JSON safe inside a `<script>` element: `<` is escaped so no string in the
 * journal can close the element, and the two JavaScript line separators too.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
}

function accentCss(): string {
  const a = BRAND.accent;
  if (!a) { return ''; }
  return `\n:root{--accent:${a.light}}\n@media (prefers-color-scheme: dark){:root:not([data-theme='light']){--accent:${a.dark}}}\n:root[data-theme='dark']{--accent:${a.dark}}\n`;
}

export function renderPage(opts: PageOptions): string {
  const config = {
    mode: opts.mode,
    note: opts.note ?? (opts.mode === 'saved' ? 'saved' : 'live'),
    lang: opts.lang,
    token: opts.token ?? '',
    S: strings(opts.lang),
    G: { ...glossary(opts.lang), ...BRAND.glossary[opts.lang] },
    brand: { name: BRAND.name },
    journal: opts.mode === 'saved' ? (opts.journal ?? []) : undefined,
  };
  const js = [read('asks.js'), read('app.js')].join('\n;\n').replaceAll('</script', '<\\/script');
  return read('shell.html')
    .replace('/*@@LANG@@*/', () => opts.lang)
    .replace('/*@@CSS@@*/', () => read('engine.css') + accentCss())
    .replace('/*@@CONFIG@@*/', () => scriptJson(config))
    .replace('/*@@JS@@*/', () => js);
}
