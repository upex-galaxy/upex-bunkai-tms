# BK-16 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-16)

# Acceptance Test Plan — BK-16: Markdown Editor | Write and Preview Markdown Safely

## Triage Result

***Risk Score: 13 — HIGH***

| Factor  | Score  |
| --- | --- |
| --- | --- |
| New feature  | +3  |
| Dynamic data (API/DB)  | +3  |
| Explicit ACs  | +2  |
| User-facing UI  | +2  |
| High effort (security + multi-layer sanitization)  | +2  |
| Multi-component (editor + sanitizer + renderer)  | +1  |
| Priority Medium  | +0  |
| ***Total****  | ****13 — HIGH***  |

Full ATP required. No veto applies (user-facing feature with explicit security ACs).

---

## Phase 1 — Critical Analysis

***Business context:*** Senior QA Engineers author User Stories and Acceptance Criteria inside Bunkai. The Markdown editor gives them rich formatting (headings, tables, code blocks) while keeping the stored content safe for downstream AI agents (BK-17 Jira import) and other consumers. Without sanitization, a malicious paste or injection could embed executable scripts into the TMS content, compromising every agent that reads it.

***Technical context:***

- Server-side sanitizer: `sanitize-html` with explicit allowlist (h1-h4, p, ul, ol, li, strong, em, code, pre, blockquote, table, thead, tbody, tr, th, td, a, hr, br). Allowed `a` attributes: href (http|https|mailto only), target (_blank), rel (noopener noreferrer). Strips: onclick, style, iframe, object, script, embed.
- Client renderer: `react-markdown` + `remark-gfm` (GFM tables, task lists) + `rehype-sanitize` (second sanitization layer on display).
- Editor surface: textarea + toolbar (Bold, Italic, Code, Link, UL, OL, H2, H3). Keyboard shortcuts: Cmd/Ctrl+B, Ctrl+I, Ctrl+K. Live preview toggleable.
- Size enforcement: client warns at 90% capacity (45 KB), hard blocks at 100% (50 KB) via `new Blob([value]).size`.
- Defense-in-depth: sanitize on save AND on render — two independent layers.
- No new DB tables. Content stored as plain text (Markdown source) in existing description fields.

***Story complexity:***

- Business logic: Medium (allowlist rules, link filtering, size cap)
- Integration: Low (single component, same repo, no new external API calls)
- Data validation: High (XSS vectors, event handler injection, unsafe URI schemes)
- UI complexity: Medium (live preview toggle, toolbar shortcuts, size warning UI)

---

## Phase 2 — Story Quality

***Ambiguities identified:***

- The story does not state whether the Markdown editor is already deployed to staging. A smoke test must confirm the editor surface is accessible before full AC execution.
- AC1 does not specify which type of record opens the editor (User Story vs. Acceptance Criteria form). Both should surface the same component per the architect annotation referencing BK-14 and BK-15.
- The story does not define behavior for an empty description save (zero-length body). Is an empty description permitted?
- AC3 specifies "surrounding text preserved" but does not clarify multi-vector payloads (multiple script tags in one body).
- AC4 specifies two link types (mailto, javascript:slight*smile: but does not address other unsafe schemes (data:, vbscript:, ftp:slight*smile:. The architect annotation confirms only http/https/mailto are kept; all others are dropped — this should be verified.
- AC5 defines the error message text only partially. The exact UI copy should be confirmed against implementation.

***Edge cases not covered by story ACs:***

- Toolbar keyboard shortcuts: does Ctrl+B correctly wrap selected text with `**`?
- 90% size threshold warning: client warns before hard stop — no AC covers this.
- Empty save: is a zero-length description saved without error, or rejected?
- Unicode/emoji in headings: does `## Hello 🔥` render and persist correctly?
- Deeply nested lists: does a 3-level nested list degrade gracefully or corrupt?
- Inline code in headings: does {{## Install }}npm\ survive sanitization?
- Consecutive unsafe tags: multiple script blocks in one paste — all must be stripped.
- `data:` URI scheme in links: should be stripped per architect allowlist.
- Event handlers on allowed tags: `<p onclick="alert()">text</p>` — onclick must be stripped.

---

## Phase 3 — Refined Acceptance Criteria

***AC1 — Write and preview Markdown (refined)***

Given the user is editing a User Story description in Bunkai staging
When the user types the following in the editor textarea:

```
## Steps
- Step one
- Step two
```

Then:

- The live preview pane immediately shows a rendered H2 heading "Steps" and a bullet list with "Step one" and "Step two"
- On save, the content is persisted
- On reopening the same record, the preview renders the identical heading and list structure

***AC2 — Table renders (refined)***

Given the user is editing a User Story description
When the user types the following Markdown table:

```
| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
```

Then:

- The live preview renders a two-column, two-row HTML table
- After saving and reopening the record, the same table is rendered in the preview

***AC3 — Script stripped on save (refined)***

Given the user pastes the following into the description textarea:

```
Normal intro text.
<script>alert('xss')</script>
More content after the script.
```

When the user saves the description
Then:

- The saved description does NOT contain `<script>`, `alert`, or any executable JavaScript
- "Normal intro text." and "More content after the script." are preserved in the saved content
- Rendering the saved content does not trigger any browser alert or script execution

***AC4 — Unsafe links dropped (refined)***

Given the user enters the following in the description textarea:

```
Contact us at [email us](mailto:test@example.com) or [click here](javascript:alert('xss')).
```

When the user saves and views the description
Then:

- The `mailto:test@example.com` link is preserved and renders as a clickable mailto link
- The `javascript:alert('xss')` link is removed (the text "click here" may appear without a link, or the entire link token may be stripped — no `javascript:` href survives)
- Rendering the saved content does not trigger any script execution

***AC5 — Body over 50 KB rejected (refined)***

Given the user has typed or pasted a description body whose byte size (UTF-8, measured via `new Blob([value]).size`) exceeds 50,000 bytes

When the user attempts to submit (save) the description
Then:

- The description is NOT saved to the database
- The UI displays a message containing the text "description exceeds the maximum size" (exact copy to be confirmed against implementation)
- The user's typed content remains in the editor (not discarded) so they can reduce the size

---

## Phase 4 — Test Outlines

### TC-01 — Should render heading and bullet list in live preview when typing valid Markdown

***Type:**** Positive | ****Coverage:**** AC1 | ****Priority:*** Critical

***Preconditions:*** User is logged in to staging. A User Story record is open in edit mode.

***Steps:***

1. Focus the description textarea.
2. Type `## Steps`, press Enter.
3. Type `- Step one`, press Enter.
4. Type `- Step two`.
5. Toggle or observe the live preview pane.

***Expected result:*** Preview pane renders an H2 heading "Steps" and a bulleted list with "Step one" and "Step two". No raw Markdown syntax visible in preview.

---

### TC-02 — Should persist Markdown formatting when story is reopened after save

***Type:**** Positive | ****Coverage:**** AC1 | ****Priority:*** Critical

***Preconditions:*** TC-01 has been completed. The record was saved.

***Steps:***

1. Navigate away from the record.
2. Reopen the same User Story.
3. Open the description in preview or edit mode.

***Expected result:*** The H2 heading "Steps" and bullet list items "Step one", "Step two" are rendered identically to before the save. No data loss or formatting corruption.

---

### TC-03 — Should render Markdown table correctly in preview and after save

***Type:**** Positive | ****Coverage:**** AC2 | ****Priority:*** High

***Preconditions:*** User is logged in to staging. A User Story or AC record is open in edit mode.

***Steps:***

1. Type the following into the description textarea:

{{

| Column A  | Column B  |
| --- | --- |
| ---------- | ---------- |
| Cell 1    | Cell 2    |

}}

1. Observe the live preview pane.
2. Save the record. Navigate away and reopen it.

***Expected result:*** Preview renders a two-column, two-row HTML table. After save and reopen, the table renders identically.

---

### TC-04 — Should strip script tags from description on save

***Type:**** Negative / Security | ****Coverage:**** AC3 | ****Priority:*** Critical

***Preconditions:*** User is logged in to staging. A User Story description editor is open.

***Steps:***

1. In the description textarea, type or paste:

{{

Normal intro text.
<script>alert('xss')</script>
More content after the script.
}}

1. Save the description.
2. View the saved record in read-only mode.
3. Inspect the rendered HTML in browser DevTools.

***Expected result:***

- No `<script>` tag or `alert` call appears in the DOM.
- "Normal intro text." and "More content after the script." are visible.
- No browser alert fires.
- DevTools shows clean rendered output with no script nodes.

---

### TC-05 — Should remove javascript: links while preserving mailto: links on save

***Type:**** Negative / Security | ****Coverage:**** AC4 | ****Priority:*** Critical

***Preconditions:*** User is logged in to staging. A description editor is open.

***Steps:***

1. Type or paste:

{{

Contact us at [email us]([test@example.com](mailto:test@example.com)) or [click here](javascript:alert('xss')).
}}

1. Save the description.
2. View the saved record. Inspect rendered HTML links.

***Expected result:***

- The mailto link (`mailto:test@example.com`) is present and functional.
- No `href` with `javascript:` scheme exists in the rendered output.
- No script execution occurs when the page renders.

---

### TC-06 — Should reject description body exceeding 50 KB with an error message

***Type:**** Boundary | ****Coverage:**** AC5 | ****Priority:*** High

***Preconditions:*** User is logged in to staging. A description editor is open.

***Steps:***

1. Generate a string of approximately 51,000 bytes (e.g., `'A'.repeat(51000)` in browser console, paste into textarea).
2. Attempt to save the description.

***Expected result:***

- The save is rejected. No data is written to the database.
- A visible error message containing "description exceeds the maximum size" is shown.
- The editor retains the user's typed content after the rejection.

---

### TC-07 — Should warn user at 90% size threshold before hard limit

***Type:**** Boundary | ****Coverage:**** Edge case (architect spec) | ****Priority:*** Medium

***Preconditions:*** User is logged in to staging. A description editor is open.

***Steps:***

1. Generate a string of approximately 45,500 bytes (between 45,000 and 50,000 bytes, simulating 90%+ capacity).
2. Paste or type this content into the description textarea.

***Expected result:***

- A warning indicator appears (progress bar, counter, or tooltip) signaling the user is approaching the size limit.
- The content is NOT blocked at this point — the user can still continue typing.
- No error message is shown (only a warning).

---

### TC-08 — Should preserve inline code and code blocks after sanitization

***Type:**** Edge Case | ****Coverage:**** Allowlist validation | ****Priority:*** High

***Preconditions:*** User is logged in to staging. A description editor is open.

***Steps:***

1. Type the following in the description textarea:

{{

Run }}npm install` to get started.

Then execute:

{{bash
npm run dev
}}
`

1. Save the description. Reopen the record.

***Expected result:***

- Inline code  `npm install`  is rendered as a `<code>` element.
- The fenced code block is rendered as a `<pre><code>` block with the bash content intact.
- No content is stripped (both `code` and `pre` are on the allowlist).

---

### TC-09 — Should strip inline event handlers (onclick, onmouseover) from saved content

***Type:**** Negative / Security | ****Coverage:**** Extended edge case | ****Priority:*** Critical

***Preconditions:*** User is logged in to staging. A description editor is open.

***Steps:***

1. Paste the following raw HTML into the description textarea:

{{

<p onclick="alert('xss')">Paragraph with handler</p>
<a onmouseover="alert('hover')">Hover link</a>
}}

1. Save the description.
2. Inspect the rendered HTML in browser DevTools.

***Expected result:***

- No `onclick`, `onmouseover`, or any other event handler attribute appears in the rendered DOM.
- The text content "Paragraph with handler" and "Hover link" may or may not be preserved (sanitizer may drop the entire tag or keep the text node) — but no executable handler survives.
- No browser alert fires on load, click, or hover.

---

## Phase 5 — Edge Cases (Extended)

***Toolbar keyboard shortcuts:***

- Ctrl+B: selects text "bold me" → Ctrl+B → text becomes `***bold me***` in textarea. Preview shows bold rendering.
- Ctrl+I: selects text → Ctrl+I → `**italic me**` in textarea.
- Ctrl+K: cursor inside a word or selection → Ctrl+K → inserts `[text](url)` link template.

***Empty save:***

- User opens a description editor and saves immediately (no content). Expected: empty description is saved or a specific empty-content validation message is shown. Behavior to confirm against implementation.

***Unicode and emoji in headings:***

- Type `## Launch 🚀 Checklist` in textarea. Expected: emoji renders in both preview and saved view without corruption or stripping. (Emoji is plain text — not a tag — so sanitizer should leave it untouched.)

***Multiple script tags in one paste:***

- Paste a body containing three separate `<script>alert(n)</script>` blocks. Expected: all three are stripped. No partial survival of any script block.

`data:` ***URI scheme in links:***

- Paste `[image](data:text/html,<script>alert()</script>)`. Expected: the `data:` href is stripped because it is not on the http|https|mailto allowlist. No executable content survives in the rendered link.

***Deeply nested list:***

- Type a 3-level nested list (indented with spaces/tabs). Expected: graceful degradation — either renders at a supported nesting depth or flattens to a single-level list. No crash or layout corruption.

---
_Synced from Jira by sync-jira-issues_
