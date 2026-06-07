// Server-only Shiki bridge for the /qa page.
//
// Shiki runs at build/request time on the server and emits static HTML with
// dual-theme CSS variables (`--shiki` / `--shiki-dark`). Zero client JS: the
// generated markup is passed down as strings and rendered via
// `dangerouslySetInnerHTML`. The class-based dark-mode flip lives in
// globals.css (`html.dark .shiki ...`).
//
// A single highlighter instance is memoized per process — `createHighlighter`
// is expensive (loads WASM + grammars), so we never create one per call.

import type { Highlighter } from 'shiki';
import { createHighlighter } from 'shiki';

// Languages used across the QA snippets. `jsonc` covers opencode.jsonc,
// `toml` covers dbhub.toml / codex.toml, `json` covers .mcp.json /
// settings.json, `bash` covers curl/shell, `ts` covers the Playwright fixtures.
const LANGS = ['bash', 'json', 'jsonc', 'toml', 'typescript'] as const;
const THEMES = ['github-light', 'github-dark'] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      langs: [...LANGS],
      themes: [...THEMES],
    });
  }
  return highlighterPromise;
}

// Normalize loose language aliases to a grammar Shiki actually loaded.
const LANG_ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
};

function resolveLang(lang: string): string {
  const lower = lang.toLowerCase();
  const resolved = LANG_ALIASES[lower] ?? lower;
  return (LANGS as readonly string[]).includes(resolved) ? resolved : 'bash';
}

/**
 * Highlight `code` as `lang`, returning a Shiki `<pre class="shiki ...">` HTML
 * string with dual-theme CSS variables. Server-only — never call from a
 * 'use client' module.
 */
export async function highlight(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang: resolveLang(lang),
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}
