# Comments for BK-315

[View in Jira](https://jira.upexgalaxy.com/browse/BK-315)

---

### Alfonso Hernandez - 8/17/2026, 12:26:29 AM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

The ATP DRAFT lives in the Acceptance Test Plan (ATP) field.

Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.
Refined on: 2026-08-16 — QA Shift-Left batch session
Local working copy: .context/PBI/epics/EPIC-BK-13-atc-library-acceptance-test-cases/stories/STORY-BK-315-tms-atc-library-export-a-project-s-atcs-to-csv/shift-left-refinement.md

---

### Alfonso Hernandez - 8/17/2026, 12:40:47 AM

## PO Answers — Critical Questions (BK-315)

Answered from the Product Owner perspective, 2026-08-16.

### Q1: Tag-join delimiter

***Decision***: Use `"; "` (semicolon-space) to join multiple tags into the Tags CSV cell.
***Rationale***: The export's whole purpose is a reviewable snapshot for auditors and stakeholders outside Bunkai — people opening this in Excel/Sheets, not developers reading raw CSV. A comma delimiter would silently force every multi-tag ATC's Tags cell into quoted form for a reason that has nothing to do with the tag content itself, which is confusing to a non-technical reviewer inspecting the file. Semicolon-space is the de facto standard for multi-value CSV cells and keeps the "quoted = contains a special character in the actual data" signal clean.
***AC impact***: `business-rules.md` "Tags" row gets the explicit delimiter added: "joined with `; ` (semicolon-space)". Scenario 1.4 in the refinement drops its "NEEDS PO/DEV CONFIRMATION" flag — delimiter is now `; ` as originally inferred.

### Q2: Tag content charset (comma/quote/line-break allowed?)

***Decision***: No new restriction. Tags keep their existing free-text nature (already unconstrained at the DB level — `atcs.tags` has no CHECK constraint, unlike `layer`/`status`), and the export escapes Tag content with the exact same RFC4180 rule as Title.
***Rationale***: Tags already exist in production as free text used for full-text/tag search across the workspace's ATC library (`tsv` search column indexes title + tags together) — introducing a charset restriction now would be a breaking behavior change for existing tag data across every workspace, entirely out of scope for a 1-point export story. It's simpler and lower-risk to make the export correctly handle whatever tag content already exists than to retroactively police tag content because of a CSV export requirement.
***AC impact***: Scenario 4.5 (tag-own-text escaping) and Scenario 4.4 (Title × Tags decision-table interaction) are confirmed IN SCOPE, both drop their "NEEDS PO/DEV CONFIRMATION" flag. `business-rules.md` "Escaping" row is clarified to explicitly cover the Tags cell, not just Title.

### Q3: ATC library export size ceiling

***Decision***: No hard cap for this MVP. AC5's "several hundred ATCs, no row missing or truncated" stands as-is — export must complete correctly regardless of library size, best-effort, no formal SLA. Revisit with a real ceiling only if usage data later shows libraries growing into the tens of thousands.
***Rationale***: This is explicitly the first export capability at the ATC-library level (per the Story's own Context), and the out-of-scope list already excludes scheduled/recurring exports and cross-project export — the intended usage is an occasional, human-triggered, single-Project pull for an audit, not a high-frequency or bulk operation. Committing to an artificial ceiling (e.g. 5,000) this early would just create a new, unrequested support ticket the day a growing workspace's library crosses it, for a problem we have no evidence exists yet. Dev owns the implementation approach (buffered vs. streamed) to make "no cap" safe.
***AC impact***: Scenario 5.2 (very-large-library behavior) drops its "NEEDS PO/DEV CONFIRMATION" flag with the answer "must succeed, no formal ceiling." Scenario 5.3 (slow-generation handling) stays open as a Dev-owned NFR — no performance budget is being set by PO; Dev's best-effort answer on Technical Question #4 governs what "reasonable" means operationally.

---

### Alfonso Hernandez - 8/17/2026, 12:41:58 AM

## Dev Answers — Technical Questions (BK-315)

Answered from the Developer perspective, 2026-08-16. Grounded against `upex-bunkai-tms` (product repo).

### Q1: Reuse non-disclosure 404 convention?

***Answer***: Yes — follow the identical `P0002` → `404` + ````` shape used by every sibling project-scoped reporting endpoint. Either import `mapCoverageRpcError` directly (the error shape is already generic — "Project not found" is not coverage-specific) or add a one-line domain mapper in a new `lib/atcs/export-errors.ts` that delegates to the same pattern, matching the precedent set by `lib/metrics/errors.ts` and `lib/traceability/errors.ts` (each domain gets its own thin mapper over the same shape).

***Evidence***: `lib/coverage/errors.ts` (`mapCoverageRpcError`, single `P0002` case → `ApiError('not*found', 'Project not found.', { details: { reason: 'not*found' } })`). Six call sites already share this exact convention: `app/api/v1/projects/[id]/coverage/route.ts`, `.../runs/report/route.ts`, `.../bugs/route.ts`, `.../bugs/heatmap/route.ts`, `app/api/v1/modules/[id]/route.ts`, `app/api/v1/imports/route.ts`. The `coverage` route's own comment states the underlying RPC collapses missing/foreign-workspace/non-member into the SAME 404, never a 403 — this is a deliberate, repeated architectural choice, not incidental.

### Q2: Status for fully unauthenticated request

***Answer****: `401` is already structurally guaranteed — no new code needed. A new export route built with the standard `withApiHandler(handler, { auth: 'required' })` wrapper (the default for every non-public route) automatically gets this: `resolveIdentity()` throws `ApiError('unauthorized', ...)` when there is no Bearer token and no cookie session, and `unauthorized` maps to HTTP `401` in the shared status table. This is fully distinct from the `404` non-disclosure path (Q1), which only fires for an **authenticated* caller hitting an inaccessible/nonexistent Project.

***Evidence***: `lib/api/principal.ts:63` — `resolveIdentity()`, cookie branch: `if (!user) throw new ApiError('unauthorized', 'Authentication required.')`. `lib/api/error-envelope.ts` `DEFAULT_STATUS.unauthorized = 401`. `lib/api/handler.ts` — `withApiHandler` calls `resolveIdentity(request)` before the handler body runs whenever `options.auth !== 'public'`, so this is enforced by the shared wrapper, not per-route logic that could be forgotten.

### Q3: Export trigger locked during generation?

***Answer****: Yes — disable the "Export as CSV" button while the request is in flight (`disabled={loading}`), matching the established action-trigger pattern in this codebase. This is different from filter **inputs*, which this same codebase deliberately leaves enabled during a fetch (superseding the in-flight request instead of blocking); a CSV export button is a one-shot action-trigger, not a filter input, so the disable-while-loading pattern applies.

***Evidence***: `components/runs/ProjectRunsReportView.tsx:495` (`disabled={loading}` on the report retry action) and `:563` (`disabled={loading || loadingOlder}` on the load-more action). Contrast with the explicit comment at `:334-336` — filters are "Deliberately NEVER disabled" because `startRequest()` supersedes an in-flight query; that rationale does not apply to a single-shot export trigger (there is no meaningful "supersede" semantics for a file download).

### Q4: Performance/timeout budget for large exports

***Answer****: ****NO PRECEDENT FOUND — proposed convention.*** No CSV/file-download/streaming code exists anywhere in the repo today (`Content-Disposition`, `text/csv`, `ReadableStream` all return zero hits). The closest architectural signal is `runs/report`, the codebase's other "potentially large Project-scoped dataset" endpoint — it does NOT return a full unbounded dump; it caps `?limit=<1..50>` and requires keyset cursor pagination for anything beyond that. That is the strongest available precedent against a single-shot unbounded CSV response.

Proposed convention for BK-315 (needs PO sign-off, since it also answers the PO's "unbounded export?" question): a ***hard row cap*** on the synchronous single-request export (suggest 5,000–10,000 ATCs) beyond which the endpoint returns a `422`-style `export*too*large` error rather than attempting the dump — cheaper to build than true streaming, and consistent with the codebase's general aversion to unbounded single-response payloads. Informal budget: best-effort, target p95 < 3s for a library up to 1,000 ATCs (in line with Vercel serverless function execution limits, which the rest of this app already runs under). If PO confirms exports must support truly unbounded libraries, escalate to a `ReadableStream`-based response instead of the row cap — genuinely new infrastructure for this codebase, size accordingly during estimation.

---


_Synced from Jira by sync-jira-issues_
