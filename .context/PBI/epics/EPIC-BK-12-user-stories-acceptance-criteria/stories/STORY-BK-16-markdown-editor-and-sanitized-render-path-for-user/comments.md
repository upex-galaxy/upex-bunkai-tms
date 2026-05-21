# Comments for BK-16

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-16)

---

### Ely - 5/19/2026, 9:54:38 PM

# 🧱 Architect Annotation

## Technical Notes
- **DB**: no new tables. Reuses `user_stories.description` and `acceptance_criteria.description` fields.
- **Server-side sanitizer**: `sanitize-html` configured with an allowlist — `h1-h4, p, ul, ol, li, strong, em, code, pre, blockquote, table, thead, tbody, tr, th, td, a, hr, br`. Allowed `a` attributes: `href` (schemes `http|https|mailto`), `target` (force `_blank`), `rel` (force `noopener noreferrer`). All inline event handlers, `style`, `iframe`, `object`, `script`, `embed` stripped.
- **Client renderer**: `react-markdown` + `remark-gfm` (tables, task lists) + `rehype-sanitize` (defense in depth). Code blocks render through a thin wrapper that adds `className="language-<lang>"` (no syntax highlighter in MVP — leaves the hook for Phase 2).
- **Editor component**: textarea + toolbar (Bold, Italic, Code, Link, UL, OL, H2, H3). Toolbar wraps selection with Markdown syntax; keyboard shortcuts `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, `Cmd/Ctrl+K` (link prompt). Live preview panel toggleable via icon.
- **Size cap**: shared with {{PROJECT_KEY}}-007 — 50KB UTF-8 bytes. Client uses `new Blob([value]).size` for warning at 90% and hard stop at 100% before submit.
- **Defense in depth**: sanitize on save AND on render. Two layers guards against future migration that might persist legacy unsanitized content.

## Dependencies
- Upstream: **BK-14** "User Story CRUD" (consumes the editor for `description`). **BK-15** "Acceptance Criterion CRUD" (same component reused).
- Downstream: **BK-17** "Jira import" persists Markdown converted from ADF — must flow through the same sanitizer on save.
- External: `react-markdown`, `remark-gfm`, `rehype-sanitize`, `sanitize-html` (already candidate dependencies; check bun.lock and pin versions).

## Definition of Done (expanded)
- [ ] Editor component renders in both User Story and AC forms
- [ ] Sanitizer middleware applied to both user_stories and acceptance_criteria save paths
- [ ] Unit tests for sanitizer: drops <script>, drops onclick, rewrites <a> target/rel, allows tables, strips disallowed schemes (`javascript:`)
- [ ] Unit tests for renderer: code blocks get `language-*` class, links open with noopener, headings render as h1-h4
- [ ] Snapshot test for editor toolbar wrapping logic (selection -> `**selection**`)
- [ ] XSS regression test from the OWASP Markdown XSS cheat-sheet (curated subset)
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: paste a known-malicious markdown blob, confirm preview renders inert
- [ ] PR description cross-references each AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.4
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-007 (description cap reused)
- Business map: `.context/business/business-data-map.md` § content rendering
- Frontend design tokens: `DESIGN.md` § editor & code block styles


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:05.643Z_
