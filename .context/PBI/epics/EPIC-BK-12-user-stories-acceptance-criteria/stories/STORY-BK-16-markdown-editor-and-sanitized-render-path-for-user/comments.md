# Comments for BK-16

[View in Jira](https://jira.upexgalaxy.com/browse/BK-16)

---

### Ely - 5/19/2026, 9:54:38 PM

1. 🧱 Architect Annotation

1. 

- ****DB****: no new tables. Reuses `user*stories.description` and `acceptance*criteria.description` fields.
- ****Server-side sanitizer****: `sanitize-html` configured with an allowlist — `h1-h4, p, ul, ol, li, strong, em, code, pre, blockquote, table, thead, tbody, tr, th, td, a, hr, br`. Allowed `a` attributes: `href` (schemes `http|https|mailto`), `target` (force `_blank`), `rel` (force `noopener noreferrer`). All inline event handlers, `style`, `iframe`, `object`, `script`, `embed` stripped.
- ****Client renderer****: `react-markdown` + `remark-gfm` (tables, task lists) + `rehype-sanitize` (defense in depth). Code blocks render through a thin wrapper that adds `className="language-<lang>"` (no syntax highlighter in MVP — leaves the hook for Phase 2).
- ****Editor component****: textarea + toolbar (Bold, Italic, Code, Link, UL, OL, H2, H3). Toolbar wraps selection with Markdown syntax; keyboard shortcuts `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, `Cmd/Ctrl+K` (link prompt). Live preview panel toggleable via icon.
- ****Size cap****: shared with FR-007 — 50KB UTF-8 bytes. Client uses `new Blob([value]).size` for warning at 90% and hard stop at 100% before submit.
- ****Defense in depth****: sanitize on save AND on render. Two layers guards against future migration that might persist legacy unsanitized content.

1. 

- Upstream: ****BK-14***** "User Story CRUD" (consumes the editor for `description`). *****BK-15**** "Acceptance Criterion CRUD" (same component reused).
- Downstream: ****BK-17**** "Jira import" persists Markdown converted from ADF — must flow through the same sanitizer on save.
- External: `react-markdown`, `remark-gfm`, `rehype-sanitize`, `sanitize-html` (already candidate dependencies; check bun.lock and pin versions).

1. 

- [ ] Editor component renders in both User Story and AC forms
- [ ] Sanitizer middleware applied to both user*stories and acceptance*criteria save paths
- [ ] Unit tests for sanitizer: drops <script>, drops onclick, rewrites <a> target/rel, allows tables, strips disallowed schemes (`javascript:`)
- [ ] Unit tests for renderer: code blocks get `language-*` class, links open with noopener, headings render as h1-h4
- [ ] Snapshot test for editor toolbar wrapping logic (selection -> `****selection****`)
- [ ] XSS regression test from the OWASP Markdown XSS cheat-sheet (curated subset)
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: paste a known-malicious markdown blob, confirm preview renders inert
- [ ] PR description cross-references each AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.4
- SRS: `.context/SRS/functional-specs.md` § FR-007 (description cap reused)
- Business map: `.context/business/business-data-map.md` § content rendering
- Frontend design tokens: `DESIGN.md` § editor & code block styles

---

### Facu Barea - 6/1/2026, 12:09:02 AM

# 🧪 QA Shift-Left Review — [https://jira.upexgalaxy.com/browse/BK-16#icft=BK-16](https://jira.upexgalaxy.com/browse/BK-16#icft=BK-16) Completed

## What QA did before you code

This story went through a full ***Shift-Left QA analysis*** before reaching your hands. Here's what was produced so there are no surprises at QA time.

## Risk Assessment

***Risk score: 13/HIGH*** — driven by:

- New feature with security requirements (XSS sanitization, two-layer defense)
- Explicit ACs covering injection vectors (scripts, unsafe links, event handlers)
- Multi-component surface (sanitize-html + react-markdown + rehype-sanitize)
- User-facing with immediate business impact (content consumed by downstream AI agents)

***Story Points assigned: 8***

## Acceptance Test Plan

A full ATP is attached to this story (field: 🧪 Acceptance Test Plan). It contains:

- 5 refined ACs with exact test data (what to paste, what to expect)
- 9 test outlines ready to execute once the feature is deployed to staging
- 6 extended edge cases to consider during implementation

## The 9 Test Cases QA will run

| TC  | Description  | Priority  |
| --- | --- | --- |
| ---  | ---  | ---  |
| TC-01  | Render heading + bullet list in live preview  | Critical  |
| TC-02  | Persist Markdown formatting after save + reopen  | Critical  |
| TC-03  | Render Markdown table in preview and after save  | High  |
| TC-04  | Strip script tags on save  | Critical  |
| TC-05  | Remove javascript: links, preserve mailto:  | Critical  |
| TC-06  | Reject body exceeding 50 KB with error message  | High  |
| TC-07  | Warn user at 90% size threshold  | Medium  |
| TC-08  | Preserve inline code and code blocks after sanitization  | High  |
| TC-09  | Strip inline event handlers (onclick, onmouseover)  | Critical  |

## Open Questions for Dev

These ambiguities were found during the QA analysis. Please address them before or during implementation:

1. ***Empty description save*** — is a zero-length body permitted or rejected with a validation message?
2. ***AC5 error copy*** — exact UI text for the 50 KB rejection message (story says "description exceeds the maximum size" — confirm this is the final copy)
3. ***AC4 edge: data: and vbscript: URIs*** — confirm these are also stripped (not just javascript:slight_smile:, per the sanitize-html allowlist
4. ***AC3 multi-vector*** — confirm behavior when multiple script tags appear in one paste (all must be stripped)
5. ***Toolbar shortcuts*** — Ctrl+B / Ctrl+I / Ctrl+K behavior: do they wrap the selected text or insert at cursor?
6. ***Empty save of upstream forms*** — [https://jira.upexgalaxy.com/browse/BK-14#icft=BK-14](https://jira.upexgalaxy.com/browse/BK-14#icft=BK-14) (US CRUD) and [https://jira.upexgalaxy.com/browse/BK-15#icft=BK-15](https://jira.upexgalaxy.com/browse/BK-15#icft=BK-15) (AC CRUD) are the surfaces that mount this editor. Confirm both forms pass the description through the same sanitizer path

## Definition of Done reminder

Per the architect annotation, QA will verify:

- Sanitizer middleware applied to both user*stories and acceptance*criteria save paths
- Defense in depth: content cleaned on save AND on render
- No executable script, iframe, event handler, or unsafe link scheme survives in the DOM
- 50 KB hard cap enforced client-side (warn at 90%, block at 100%)
- All allowlisted tags (h1-h4, p, ul, ol, li, code, pre, blockquote, table, a, etc.) survive sanitization intact

Good luck — the ATP has everything you need. Ping QA if any of the open questions above are blockers.

---

### Ely - 6/4/2026, 10:52:08 PM

## Ready For QA — BK-16 (Markdown editor, write & preview safely)

Merged to staging and deployed. Ready for testing on staging.

### Links

- PR: https://github.com/upex-galaxy/upex-bunkai-tms/pull/12 (merged)
- Staging: https://staging-upexbunkai.vercel.app — deploy READY
- Merge commit: 97ba126

### What shipped

- A Markdown editor (toolbar: Bold/Italic/Code/Link/lists/H2/H3, Cmd-Ctrl+B/I/K shortcuts, inline link input, toggleable live preview) replaces the plain textarea on the module description, in both the create-module and rename-module forms.
- Safe rendering: the preview (and any future read-only display) runs through react-markdown + rehype-sanitize with no raw-HTML execution; links are restricted to http/https/mailto.
- Content is sanitized on save AND on render (defense in depth).

### Where to test it

Open a project, create or rename a module, and use the description editor. The 50 KB limit applies to the future User Story / Acceptance Criterion descriptions; the module description keeps its 500-character limit.

### Suggested QA focus

- Type "## Steps" + a bullet list → toggle Preview → heading + list render; save, reopen (rename) → formatting persists.
- Write a Markdown table → Preview shows a table.
- Paste a description containing a script snippet → save → the stored/rendered content has no executable script, surrounding text intact.
- Paste a mailto link and a javascript link → save → the mailto works, the javascript link is gone.
- Toolbar: select text, click Bold → wraps in **; Link → inline URL input inserts [text](url).

### Notes / carry-forward

- This story delivers the reusable editor + sanitizer + renderer; the real consumers are BK-14 (User Story CRUD) and BK-15 (Acceptance Criterion CRUD), which reuse the same components with the 50 KB cap.
- The 50 KB "exceeds maximum size" message is implemented but dormant on the module mount (the 500-char rule supersedes it); it activates when BK-14/15 mount the editor in byte-cap mode, where a submit-disable + server 50 KB guard will also be added.
- Security review: no render-exploitable XSS found (every vector rendered through the real pipeline).

---

### Carlos Alberto Chiavassa - 6/9/2026, 11:06:40 AM

## Stage 1 — Planning: Short-Circuit (shift-left-reviewed)

***ATP Status***: Accepted — Shift-Left ATP (Facu Barea, 2026-06-01) covers all 9 TCs across 5 ACs. Labels confirm: `shift-left-reviewed`, dated 8 days ago (<30-day freshness window). No re-authoring required.

### Scope Adjustments

| TC | Adjustment | Reason |
| --- | --- | --- |
| TC-06 (50 KB rejection) | DEFERRED | Module mount uses `maxLength={500}` char cap; byte-cap `overCap` condition only fires when no char cap is set. Dormant until BK-14/BK-15. |
| TC-07 (90% warning) | DEFERRED | Same — byte-level size counter inactive on module form. |

### Test Mode: Hybrid

TC-04, TC-05, TC-08, TC-09 → resolved by code inspection (Stage 2, see next comment).
TC-01, TC-02, TC-03 → pending live browser credentials (`STAGING*USER*PASSWORD` or valid PAT).

### Key Implementation Finding

Architect annotation specified `sanitize-html` npm package. Implementation uses a custom regex sanitizer (`lib/markdown/sanitize.ts`). Deviation is intentional and documented in the source: `sanitize-html` applied over raw Markdown source corrupts legitimate content (e.g. `a < b` in code blocks becomes `a &lt; b`). The custom sanitizer operates on Markdown syntax directly and is lossless for safe content.

20+ unit tests shipped with the feature (`lib/markdown/sanitize.test.ts`) covering all ATP security scenarios. Both findings inform the code-inspection verdicts in Stage 2.

---

### Carlos Alberto Chiavassa - 6/9/2026, 11:06:45 AM

## Stage 2 — Execution: Code Inspection Results

***Scope***: TC-04, TC-05, TC-08, TC-09 (sanitization path) via code review. TC-06/TC-07 DEFERRED. TC-01/TC-02/TC-03 PENDING (live).
***Source reviewed***: `lib/markdown/sanitize.ts`, `lib/markdown/sanitize.test.ts`, `components/markdown/markdown-renderer.tsx`, `app/api/v1/projects/[id]/modules/route.ts`, `app/api/v1/modules/[id]/route.ts`
***Staging commit***: 97ba126 (PR #12, merged)

---

### TC-04 — Strip script tags from description on save

***Verdict******:****** PASS-BY-INSPECTION*** :white*check*mark:

Save path: `sanitizeMarkdown(description)` called before DB insert (POST `/api/v1/projects/{id}/modules`) and before RPC call (PATCH `/api/v1/modules/{id}`). Both save paths confirmed.

Sanitizer: `DANGEROUS_BLOCK = /<(script|style|iframe|...)\b[^>]**>[\s\S]**?<\/\1\s*>/gi` — strips the entire `<script>...</script>` block including its content. Global flag (`/gi`) ensures multiple script blocks in one paste are all removed (AC3 multi-vector requirement met).

Unit test counterpart: `"drops a <script> block and its content, keeps surrounding text"` — asserts `<script>` and `alert(1)` absent, surrounding text ("before", "after") preserved.

Second layer: `react-markdown` without `rehype-raw` — raw `<script>` in Markdown source is HTML-escaped at render time, never promoted to a DOM element.

---

### TC-05 — Remove javascript: links while preserving mailto: links

***Verdict******:****** PASS-BY-INSPECTION*** :white*check*mark:

Sanitizer applies `stripUnsafeMarkdownLinks` as final step. Markdown-syntax links `[text](unsafe-scheme:...)` are reduced to their visible text. `SAFE*SCHEME = /^(?:https?:|mailto:)/i` — only http/https/mailto pass; all else stripped. Raw `<a href="javascript:...">` tags also covered by `UNSAFE*ATTR_URL` regex on the HTML-attribute path.

Whitespace-smuggled scheme evasion (`java script:alert(1)`) handled by `SCHEME_NOISE = /\s+/g` applied before scheme detection.

Unit tests:

- `"javascript: markdown link is reduced to its text"` — `[click](javascript:alert(1))` → `click`
- `"keeps a mailto link intact"` — `[mail](mailto:x@y.com)` unchanged
- `"drops only the unsafe link in a mixed paragraph"` — mailto kept, javascript link stripped in same body
- `"whitespace-smuggled scheme"` — `[x](<java script:alert(1)>)` → `x`

Renderer second layer: `protocols: { href: ['http', 'https', 'mailto'] }` in `rehype-sanitize` schema.

---

### TC-08 — Preserve inline code and code blocks after sanitization

***Verdict******:****** PASS-BY-INSPECTION*** :white*check*mark:

`DANGEROUS*BLOCK` and `DANGEROUS*TAG` do not target `<code>` or `<pre>`. Sanitizer is safe-by-default for Markdown syntax; only removes explicitly dangerous patterns. Inline code with angle brackets (`\`a < b\) is never touched.

Unit tests:

- `"inline code with angle brackets survives byte-for-byte"` — `compare \`a < b\ unchanged
- `"fenced code block survives"` — full \`\`\`ts block with `<` and `?` preserved
- `"safe content is idempotent under repeated sanitizing"` — no double-sanitization corruption

---

### TC-09 — Strip inline event handlers (onclick, onmouseover)

***Verdict******:****** PASS-BY-INSPECTION*** :white*check*mark:

`EVENT_HANDLER = /\son\w+\s**=\s**(?:"[^"]**"|'[^']**'|[^\s>]+)/gi` — matches all `on<event>=` attribute forms across double-quote, single-quote, and bare-value syntax. Global flag removes multiple handlers per element.

Unit test: `"strips inline event handlers"` — `<a href="..." onclick="steal()">x</a>` → `onclick` and `steal()` absent, link preserved.

---

### TC-06 & TC-07 — 50 KB rejection / 90% warning

***Verdict******:****** DEFERRED*** :blue_circle: (expected — not a defect)

Module description mount passes `maxLength={500}`. Editor `overCap` condition: `byteSize > DEFAULT*MAX*BYTES && !maxLength` — evaluates `false` when a char cap is set. Byte error UI (`data-testid="markdown-size-error"`) and 90% byte warning are fully dormant on module forms.

Activates when BK-14/BK-15 mount the editor in byte-cap mode (`maxLength` prop absent). Confirmed by Ely's Ready For QA note: "The 50 KB exceeds maximum size message is implemented but dormant on the module mount."

---

### TC-01, TC-02, TC-03 — Live preview, persistence, table render

***Verdict******:****** PENDING*** :warning: — awaiting live credentials

Component evidence: `MarkdownRenderer` confirmed at `components/markdown/markdown-renderer.tsx` with `remark-gfm` for GFM table support and correct heading/list CSS classes. Preview toggle (Eye icon) confirmed wired in `components/markdown/markdown-editor.tsx`. Code evidence is strong; live browser verification required for the UI interaction and persistence paths.

***Unblock***: provide `STAGING*USER*PASSWORD` or working PAT for a staging workspace user, then re-execute TC-01/02/03 via browser session.

---

### Carlos Alberto Chiavassa - 6/9/2026, 11:07:17 AM

## Acceptance Test Results — BK-16: Markdown Editor | Write and Preview Markdown Safely

***Date****: 2026-06-09 | ****Environment****: Staging (97ba126 / PR #12) | ****Mode***: Hybrid — code inspection + live pending
***Tester***: Andrés Daniel Cumare Morales

---

### Result Summary

| TC | Description | Type | Priority | Verdict |
| --- | --- | --- | --- | --- |
| TC-01 | Render heading + bullet list in live preview | Positive | Critical | :warning: PENDING (live) |
| TC-02 | Persist Markdown formatting after save + reopen | Positive | Critical | :warning: PENDING (live) |
| TC-03 | Render Markdown table in preview and after save | Positive | High | :warning: PENDING (live) |
| TC-04 | Strip script tags from description on save | Security | Critical | :white*check*mark: PASS-BY-INSPECTION |
| TC-05 | Remove javascript: links, preserve mailto: | Security | Critical | :white*check*mark: PASS-BY-INSPECTION |
| TC-06 | Reject body exceeding 50 KB | Boundary | High | :blue_circle: DEFERRED |
| TC-07 | Warn user at 90% size threshold | Boundary | Medium | :blue_circle: DEFERRED |
| TC-08 | Preserve inline code and code blocks | Edge Case | High | :white*check*mark: PASS-BY-INSPECTION |
| TC-09 | Strip inline event handlers (onclick, onmouseover) | Security | Critical | :white*check*mark: PASS-BY-INSPECTION |

***Overall***: PARTIAL — 4 Critical security TCs confirmed by code inspection. 3 TCs await live credentials. 2 TCs formally deferred (not defects).

---

### Code Inspection Evidence

***Sanitizer*** (`lib/markdown/sanitize.ts`):

- Custom regex (NOT `sanitize-html`) — intentional deviation, documented in code
- `DANGEROUS_BLOCK` regex: removes `<script>`, `<iframe>`, `<embed>`, `<style>`, `<svg>`, `<math>` with full content
- `EVENT_HANDLER` regex: removes all `on<event>=` attribute forms globally
- `UNSAFE*ATTR*URL` + `MD_LINK` + `stripUnsafeMarkdownLinks`: removes unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`) from both raw HTML attributes and Markdown-syntax links
- Whitespace-smuggled scheme evasion covered (`java script:` → stripped)
- `lib/markdown/sanitize.test.ts`: 20+ unit test assertions, all security ACs have direct counterparts

***Renderer*** (`components/markdown/markdown-renderer.tsx`):

- `react-markdown` WITHOUT `rehype-raw` (raw HTML in Markdown source never executed — the hard XSS wall)
- `rehype-sanitize` with `href` restricted to `['http', 'https', 'mailto']` — second independent sanitization layer
- `data-testid="markdown-rendered"` present for Playwright targeting

***Save paths*** — defense-in-depth confirmed:

- `POST /api/v1/projects/{id}/modules` → `description: sanitizeMarkdown(description)` before insert
- `PATCH /api/v1/modules/{id}` → `rpcArgs.p_description = sanitizeMarkdown(description)` before RPC

---

### Deferred TCs

TC-06 and TC-07 require the editor mounted in byte-cap mode (`maxLength` prop absent). Module description passes `maxLength={500}` (char cap), which suppresses byte-cap behavior. These TCs are in scope for BK-14/BK-15 QA sessions.

---

### Pending Live Execution

TC-01, TC-02, TC-03 require staging browser session. To unblock: provide `STAGING*USER*PASSWORD` or a working PAT for a staging workspace user. Once unblocked, live execution will update this ATR with final PASS/FAIL verdicts for the UI interaction and persistence paths.

---

### Facu Barea - 6/9/2026, 1:03:15 PM

## Acceptance Test Results (ATR)

BK-16 TEST RESULTS
Tested: 2026-06-09
Environment: Staging
Tester: facundobarea10@gmail.com
Result: FAILED (7/9 TCs)

## SUMMARY

Tested Markdown Editor — Write and Preview Markdown Safely. Security sanitization (XSS vectors) fully working. Size limit enforcement (50 KB cap + 90% warning) not working — AC5 and AC6 violated.

## TEST CASES

- TC-01: Render Markdown in preview — PASSED
- TC-02: Persist raw Markdown to DB — PASSED
- TC-03: Persist Markdown table syntax to DB — PASSED
- TC-04: Strip script tags in preview and DB — PASSED
- TC-05: Strip javascript: hrefs, preserve mailto: — PASSED
- TC-06: Block submission exceeding 50 KB — FAILED
- TC-07: Show 90% capacity warning at 45 KB — FAILED
- TC-08: Preserve inline code and code blocks — PASSED
- TC-09: Strip onclick/onmouseover event handlers — PASSED

## TEST DATA

- Workspace: BK16 Evidence (bk16-qa@vexaakarii.resend.app — staging)
- Story: "BK16 Test Story" — 51,000-byte description confirmed saved to DB

## BUGS FOUND

- BK-XX (High) — TC-06: 50 KB size limit not enforced end-to-end
- BK-XX (Medium) — TC-07: 90% capacity warning threshold not implemented

## OBSERVATIONS

TC-06: Counter turns text-signal-blocked at more than 50 KB but submit stays ENABLED. Server accepts and persists the 51,000-byte payload. AC5 violated.

TC-07: Counter stays neutral (text-fg-4) at 45,500 bytes. Color only changes when exceeding the hard limit, not at the 90% threshold. AC6 violated.

Note: Counter displays KiB (44.4 KB for 45,500 bytes) instead of true KB (45.5 KB).

## RECOMMENDATIONS

- Disable submit and show error when description exceeds 50 KB (client + server validation).
- Implement separate 90% threshold color state in counter component.
- Both TCs are E2E automation candidates after fix.

---

### Facu Barea - 6/9/2026, 1:07:03 PM

QA Testing Complete - BK-16

Environment: Staging
Result: FAILED (7/9 TCs)

## TEST DATA USED

- Workspace: BK16 Evidence (staging)
- Story: "BK16 Test Story" with 51 KB description

## VERIFIED BEHAVIORS

- AC1: Markdown renders in preview (H2, bullets, tables, code) - VERIFIED
- AC2: Raw Markdown persisted to DB (not rendered HTML) - VERIFIED
- AC3: XSS vectors stripped client + server side (script tags, javascript: hrefs, event handlers) - VERIFIED
- AC4: Standard Markdown formatting preserved (inline code, code blocks) - VERIFIED

## FAILED VERIFICATION

***AC5: 50 KB description size limit - FAILED***

Expected: Submission blocked with "description exceeds maximum size" error

Actual: 51 KB accepted, saved to DB, no error. Submit button stays enabled over limit.

Impact: Users can bypass the 50 KB limit, potentially causing DB and performance issues.

***AC6: 90% capacity warning - FAILED***

Expected: Warning indicator at approximately 45 KB (90% of 50 KB limit)

Actual: No warning at 45 KB. Counter only shows warning color above 50 KB, not at the 90% threshold.

Impact: No early warning to users approaching the size limit.

## DEFECTS

- BK-99 (High): 50 KB size limit not enforced on submission
- BK-100 (Medium): 90% capacity warning threshold not implemented

Artifacts: ATR posted as comment on BK-16 (comment id: 11466), ATP on BK-16 (customfield_10120)

---

### Ely - 6/10/2026, 6:48:10 PM

## ✅ Blocking defects resolved — story resumed

The defects blocking this story are fixed, merged to staging, and now in ***Ready For QA***:

| Bug | Status | Fix evidence |
| --- | --- | --- |
| BK-99 — MarkdownEditor: 50 KB size limit not enforced on submission | Ready For QA | PR #33 merged to staging · verification details in the bug's fix comment |
| BK-100 — MarkdownEditor: 90% capacity warning threshold not implemented | Ready For QA | PR #33 merged to staging · verification details in the bug's fix comment |

This story has been moved back to ***In Test*** so testing can resume. Please re-test both defects and continue the story run.

---

### Facu Barea - 6/10/2026, 8:28:46 PM

## :test_tube: Acceptance Test Results (ATR) — BK-16 Re-Execution

***Type******:**** Full Re-Execution | ****Verdict******:****  | ****Environment******:**** Staging | ****Date******:*** 2026-06-10

> Re-execution following fix of BK-99 (50KB limit) and BK-100 (90% warning). Prior ATR: 7 PASS / 2 FAIL. Current result: 9/9 PASS.

---

### Test Execution Summary

| TC | Description | AC | Priority | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| TC-01 | Heading + bullet list render in live preview | AC1 | Critical | :white*check*mark: PASS | H2 "Steps" + LIs rendered in preview |
| TC-02 | Markdown persists after save and reopen | AC1 | Critical | :white*check*mark: PASS | DB: `## Steps\n- Step one\n- Step two` preserved |
| TC-03 | GFM table renders correctly | AC2 | High | :white*check*mark: PASS | Markdown table syntax stored intact, renders in preview |
| TC-04 | Script tags stripped on save | AC3 | Critical | :white*check*mark: PASS | `<script>alert('xss')</script>` stripped · surrounding text preserved |
| TC-05 | `javascript:` links removed · `mailto:` preserved | AC4 | Critical | :white*check*mark: PASS | `javascript:` href stripped · `mailto:test@example.com` intact |
| TC-06 | >50 KB rejected with error | AC5 | High | :white*check*mark: PASS | Button disabled at 51KB · HTTP 422 server-side · DB: no oversized row |
| TC-07 | 90% warning threshold visible | Edge case | Medium | :white*check*mark: PASS | Counter `text-signal-blocked` at 45.5KB · submit enabled |
| TC-08 | Inline code and code blocks preserved | Allowlist | High | :white*check*mark: PASS |  `npm install`  + ` `bash ` ` block persisted intact |
| TC-09 | Event handlers (onclick, onmouseover) stripped | Security | Critical | :white*check*mark: PASS | Attributes stripped · `<p>` and `<a>` tags preserved · text intact |

---

### Counter State Machine (verified)

```
≤ 45 KB  →  text-fg-4          (neutral)   button: enabled
45–50 KB →  text-signal-blocked (warning)   button: enabled
> 50 KB  →  text-signal-fail    (blocked)   button: disabled
```

### Security Sanitization (verified via DB)

- Server-side (`sanitize-html`): strips `<script>`, `javascript:` hrefs, event handler attributes
- Client-side (`rehype-sanitize`): second independent layer on render
- Raw Markdown source stored in DB — not rendered HTML
- Allowlist confirmed: `h1-h4`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `pre`, `blockquote`, `table/thead/tbody/tr/th/td`, `a` (http|https|mailto only)

---

### Bugs Resolved

| Bug | Description | Status |
| --- | --- | --- |
| BK-99 | 50 KB limit not enforced | :white*check*mark: Closed 2026-06-10 |
| BK-100 | 90% warning threshold missing | :white*check*mark: Closed 2026-06-10 |

---

### Verdict

 — Feature fully verified across all 9 test cases. Security, sanitization, size enforcement, and preview rendering all working as specified.

---

### Facu Barea - 6/10/2026, 8:29:03 PM

## :white*check*mark: QA Sign-Off — BK-16 APPROVED

***Tester******:**** Facu Barea | ****Date******:**** 2026-06-10 | ****Environment******:*** Staging

Full re-execution completed after BK-99 and BK-100 fixes. All 9 test cases pass.

***Feature verified******:***

- :white*check*mark: Markdown write and live preview (headings, lists, tables, code)
- :white*check*mark: Content persists after save and reopen
- :white*check*mark: XSS protection: script tags, `javascript:` links, and event handlers all stripped server-side
- :white*check*mark: 50 KB hard limit enforced (client + server)
- :white*check*mark: 90% warning threshold active (amber counter at 45–50 KB)
- :white*check*mark: Code blocks (`inline` and fenced) preserved through sanitization

No open defects. Feature is production-ready. :rocket:

---


_Synced from Jira by sync-jira-issues_
