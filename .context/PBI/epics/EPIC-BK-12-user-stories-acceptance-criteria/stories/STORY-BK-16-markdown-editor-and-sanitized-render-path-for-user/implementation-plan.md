# BK-16 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-16)

## Summary

A small, safe Markdown editor (textarea + toolbar + live preview) and a sanitized render path, built as reusable units and mounted on the existing module `description` field (BK-9 left a plain textarea explicitly for this story). BK-14 / BK-15 (the real US/AC consumers) do not exist yet, so this story ships the reusable component + sanitizer + renderer + tests, demonstrated end-to-end via module descriptions. Defense in depth: content is sanitized on save AND on render.

## Resolved decisions (confirmed with PO)

- Mount surface: replace the plain module-description textarea in create-module-form and rename-module-form with the new `MarkdownEditor`; apply the save-path sanitizer in the module create + rename description paths. BK-14/15 reuse the same components (with the 50 KB cap).
- Read-only render: the editor's live-preview pane is the render surface for this story (it uses `MarkdownRenderer`); a standalone read-only display lands with BK-14/15.
- Stack (architect-fixed): server `sanitize-html` allowlist; client `react-markdown` + `remark-gfm` + `rehype-sanitize`. No new DB tables — reuses `description` columns.
- Storage: store Markdown text (sanitized on save). The render layer (react-markdown WITHOUT rehype-raw + rehype-sanitize) is inherently safe against raw HTML and unsafe link schemes; the save sanitizer additionally cleans the stored text so AC "script stripped on save" / "javascript link removed" hold.

## Safety model

- Allowed formatting: headings (h1–h4), bullet/numbered lists, code (inline + fenced), links, blockquotes, tables (gfm), hr, br, strong/em.
- Link schemes kept: http, https, mailto. Everything else (javascript:, data:, vbscript:) dropped, link text preserved.
- Stripped: script, iframe, object, embed, inline styles, event handlers (on*).
- Save sanitizer = `sanitize-html` (allowlist + allowedSchemes + force a[target=_blank, rel=noopener noreferrer]) over the text, plus an MD-link-scheme filter for markdown-syntax links `[t](badscheme:...)`.
- Render = react-markdown + remark-gfm + rehype-sanitize (no rehype-raw), code blocks through a thin wrapper that adds `className="language-<lang>"` (no highlighter in MVP).
- Size cap: 50 KB UTF-8 default (`new Blob([value]).size`); warn at 90%, hard-stop at 100% before submit. The module mount keeps its existing 500-char rule.

## Tasks (slices)

Slice 1 — Deps + server sanitizer. `bun add react-markdown remark-gfm rehype-sanitize sanitize-html`, `bun add -d @types/sanitize-html` (pin in bun.lock). `lib/markdown/sanitize.ts`: `sanitizeMarkdown(input)` = sanitize-html(allowlist) + `stripUnsafeMarkdownLinks`. Unit tests incl. a curated OWASP Markdown-XSS subset (drops `<script>`, `onclick`, `javascript:` href + MD link, keeps tables + mailto).

Slice 2 — Renderer + editor. `components/markdown/markdown-renderer.tsx` (react-markdown + remark-gfm + rehype-sanitize; code → `language-*`; links open with target/rel). `components/markdown/markdown-editor.tsx` (textarea + toolbar Bold/Italic/Code/Link/UL/OL/H2/H3 wrapping selection, `Cmd/Ctrl+B/I/K` shortcuts, toggleable live preview, byte/char cap with warn+stop). Pure toolbar-wrap helper + unit tests; renderer unit tests (code class, link rel, headings).

Slice 3 — Wire-in. Replace the textarea in create-module-form + rename-module-form with `MarkdownEditor` (maxLength 500). Apply `sanitizeMarkdown` to the description in the module create POST route and the rename description path (defense-in-depth on save).

Slice 4 — Verification. `bun test` (sanitizer + renderer + toolbar), `bun run types:check`, `bun run lint:check`, `bun run build`; manual paste-malicious-blob smoke on staging.

## Out of scope

US/AC data model + CRUD (BK-14/15), full WYSIWYG, image/media upload, diagram (Mermaid) rendering, syntax highlighting (Phase 2 hook left via the language-* class).

## Review Workload Forecast

Estimated: about 600 additions + 30 deletions = about 630 total lines (excludes lockfile).
400-line budget risk: High.
Chain strategy: single feature branch, slices as atomic commits, one PR to staging. Same shape as prior stories.
Decision needed before apply: No.

---
_Synced from Jira by sync-jira-issues_
