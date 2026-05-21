# Markdown editor and sanitized render path for User Story and Acceptance Criterion bodies

**Jira Key:** [BK-16](https://upexgalaxy67.atlassian.net/browse/BK-16)
**Epic:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12) (User Stories & Acceptance Criteria)
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-007, FR-008 (renderer supporting both User Story and Acceptance Criterion bodies)

## User story

As a Project member, I want to write ***User Story**** and ****Acceptance Criterion*** bodies in Markdown with a small editor and a safe render path, so the content reads well to humans and stays AI-readable for downstream agents.

This story implements PRD US 3.4. It covers a lightweight Markdown editor in the SPA, a sanitized server-side store path, and a client-side renderer that supports headings, lists, code blocks, links, blockquotes and tables. XSS protection and the 50KB body cap (inherited from FR-007) are mandatory.

## Business rules

- Max body size 50KB UTF-8 (shared cap with FR-007).
- Server-side allowed-element whitelist; any disallowed tag stripped, attribute filtered.
- `<a>` hrefs must use `http`, `https`, or `mailto` schemes; anything else is dropped.
- Code blocks render with a language class but inner content is HTML-escaped.
- No inline event handlers; no `<style>`, `<iframe>`, or `<object>`.
- Both save path and read path go through the sanitizer (defense in depth).

## Workflow

The user opens a User Story or Acceptance Criterion form. The Markdown editor component mounts: a textarea with a thin toolbar above and an optional live-preview panel beside it. As the user types, the preview pane re-renders client-side via `react-markdown`. On submit, the raw Markdown is POSTed to the Next.js API route. The handler runs `sanitize-html` with the whitelist before persisting to Supabase. On read, the same content is returned and rendered through the same `react-markdown` pipeline.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

---

## Acceptance Criteria

```gherkin
Feature: Markdown editor and sanitized render path

  Scenario: Editor toolbar inserts Markdown syntax
    Given the user has the editor open on a User Story description
    When the user selects the text "hello" and clicks the "Bold" toolbar button
    Then the textarea contents become "***hello***"
    And the rendered preview shows "hello" in bold

  Scenario: Server sanitizes script tags on save
    Given the user submits a description containing "<script>alert(1)</script>"
    When the API stores the value
    Then the persisted description has no <script> tag
    And reading the description back never returns executable HTML

  Scenario: Renderer supports fenced code blocks with language hint
    Given a description containing a triple-backtick block tagged "ts"
    When the renderer outputs HTML
    Then the resulting node has class "language-ts" applied
    And the inner text is HTML-escaped (no markup execution)

  Scenario: Body size limit is enforced on save
    Given the user pastes 51KB of Markdown into the description
    When the user submits
    Then the API responds 422 with { error: "description*too*large", max_bytes: 51200 }
    And the client surfaces the limit message in-form

  Scenario: Links open with rel noopener noreferrer
    Given a description with a Markdown link [docs](https://example.com)
    When the renderer outputs HTML
    Then the <a> tag has target="_blank" and rel="noopener noreferrer"
```

---

## Business Rules

- max body size 50KB UTF-8 (shared cap with FR-007)

- allowed element whitelist enforced server-side (any disallowed tag stripped, attribute filtered)

- <a> hrefs must use http, https, or mailto schemes; anything else is dropped

- code blocks render with language class but content is HTML-escaped

- no inline event handlers, no <style>, no <iframe>, no <object>

- both save path and read path go through sanitizer (defense in depth)

---

## Scope

- Lightweight Markdown editor component (textarea + toolbar: bold, italic, code, link, list, heading)
- Live preview panel toggle
- Server-side sanitizer (sanitize-html) integrated into user*stories and acceptance*criteria validation pipelines
- Client-side renderer (react-markdown + remark-gfm + rehype-sanitize)
- Allowed elements whitelist: h1-h4, p, ul/ol/li, strong/em, code, pre, blockquote, table/thead/tbody/tr/th/td, a with rel rules
- 50KB UTF-8 byte cap enforced at API and surfaced in UI
- Keyboard shortcuts (Cmd/Ctrl+B, Cmd/Ctrl+I, Cmd/Ctrl+K for link)

---

## Workflow

The user opens a User Story or Acceptance Criterion form. The Markdown editor component mounts: a textarea with a thin toolbar above and an optional live-preview panel beside it. As the user types, the preview pane re-renders client-side via react-markdown. On submit, the raw Markdown is POSTed to the API. The route handler runs sanitize-html with the whitelist before persisting. On read, the same content is sent back to the client, which renders it through the same react-markdown pipeline.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** markdown, mvp, ux, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.135Z_
