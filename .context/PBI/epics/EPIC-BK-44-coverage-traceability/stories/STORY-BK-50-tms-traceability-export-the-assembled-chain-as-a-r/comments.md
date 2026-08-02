# Comments for BK-50

[View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

---

### Benjamin Segovia - 6/16/2026, 1:31:59 PM

# ATP DRAFT (continued) — truncated tail sections

> The ATP DRAFT custom field hit Jira's ~200KB ADF content-size limit. These sections did NOT fit in customfield_10067 and are posted here as a continuation. Read together with the field content for the full ATP DRAFT.

## Story Quality Assessment

***Verdict***: Significant Issues

***Key findings*** (1-3 bullets):

- The 3 ACs are clear in INTENT (export, immutability, empty-chain variant) but leave the single most consequential implementation decision completely open: HOW is "read-only snapshot" realized — a downloadable file, a frozen in-app view, or a DB-copy record? This decision changes the data model, the access-control model, and nearly every test outline in Phase 4, so it is a genuine blocker, not a nice-to-have clarification.
- Beyond the AC-level ambiguity, the dominant issue (same shape as sibling BK-48) is ***complete non-existence of the feature being exported***: BK-50 exports a chain (BK-45) that has no implementation, over entity types (BK-24 Tests, BK-30 Runs, BK-31 Defects) with no schema. BK-50 additionally has NO existing persistence/export tooling anywhere in the codebase to build on (confirmed by the repo scan — zero PDF/export libraries installed, zero export routes).
- The "read-only" framing and the Story's explicit goal of handing the artifact to EXTERNAL auditors (who have no system login) implies an access-control surface (a shareable, unauthenticated-or-differently-authenticated retrieval path) that none of the 3 ACs address — this is a security-relevant gap, not just a UX one.

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***What artifact format does "export" produce — a downloadable file (PDF/JSON/HTML) the QA Lead can hand to someone with no system login, or an in-app read-only view still gated by authentication?***

1. ***What mechanism guarantees the snapshot reflects the moment of export (AC2) — a deep copy of all chain data stored at export time, or a generated static document that is inherently frozen by nature?***

1. ***Who is allowed to trigger an export, and what access model governs who can later retrieve/view an already-exported snapshot (especially given that external auditors with no login are the Story's stated audience)?***

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. ***Will the export run synchronously (blocking the request/UI) or asynchronously (background job + "export ready" notification)?*** — Context: Phase 2 Gap #3; the Epic's risk map already flags an N+1/performance risk at the chain-assembly layer (inherited from BK-45), and export adds a serialization step on top. Testing impact: determines whether a large-chain export is tested as a simple synchronous-response assertion or requires polling/notification-flow test design.

1. ***If the snapshot is a DB-copy rather than a static file, what is the storage/retention policy — indefinite, time-limited, or subject to manual deletion by the QA Lead?*** — Context: Phase 2 Gap #1; no AC addresses retention. Testing impact: determines whether "list past exports" and expiry/cleanup test outlines are in scope at all for v1.

1. ***Does the export endpoint independently re-verify workspace/RLS scoping at generation time, or does it trust the caller's already-authenticated session context the same way the live chain view does?*** — Context: Phase 2 Gap #4; an artifact that leaves the system is a higher-stakes surface for a missed RLS check than an in-app read, since there's no second chance to catch a leak after the file is downloaded. Testing impact: determines whether the export endpoint needs its own dedicated tenant-isolation test, separate from BK-45's.

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
| --- | --- | --- | --- |
| 1 | "a read-only snapshot is produced" (AC1) | "exporting produces a downloadable [file format TBD by PO] containing the full chain, retrievable without requiring the recipient to log into Bunkai" | Removes Critical Q1's format ambiguity and makes the "without giving them system access" promise from the user story testable. |
| 2 | "the snapshot still shows the evidence as it was at export time" (AC2) | "the snapshot is generated as a [static document / versioned copy — PO to choose] that is structurally independent of the live chain, such that no later mutation to the live chain (including deletion of the source story) can alter or invalidate it" | Removes Critical Q2's mechanism ambiguity and makes the immutability guarantee concrete enough to test against deletion/mutation edge cases. |
| 3 | No AC on who can export or who can later view an exported snapshot | Add AC: "Only users with read access to the user story can trigger export; [exported snapshots are retrievable via a scoped, time-limited share mechanism for external recipients — TBD]" | Closes Critical Q3 and Gap #2 — prevents an unintentionally open access surface on an artifact designed to leave the system. |
| 4 | "the snapshot states the story had no coverage at export time" (AC3) | "the snapshot states the story had no coverage at export time, using the copy: '[exact wording TBD by PO]', consistent with the empty-coverage state shown elsewhere in the chain view" | Makes the AC3 assertion deterministic instead of relying on prose interpretation. |

---

## Data feasibility flags

***DATA-FEASIBILITY-RISK******:****** confirmed and concrete — same root cause as BK-48, plus an additional, Story-specific gap.***

BK-50 exports "the assembled evidence chain" — the same chain that BK-45 ("Render full US to bug evidence chain in one read") is responsible for producing. BK-45 is still in status ***Estimation*** (per the orchestrator's known facts). Reusing BK-48's confirmed finding on this shared dependency, then adding what is unique to BK-50:

- ***Entity / fixture missing (shared with BK-48)***: There is no queryable data structure to export. BK-45's own refinement confirms zero implementation of `tests`, `test*runs`/`run*results`, or `defects`/`bugs` tables across all reviewed migrations, and no `GET /api/v1/user-stories/{id}/traceability` endpoint exists. BK-50 has nothing to export — not "limited data," literally no chain-assembly capability at all.
- ***API contract gap (shared with BK-45/BK-48)***: An export capability needs a stable response shape to serialize. That shape is still under PO/Dev negotiation in BK-45's own open questions. Designing an export format against an undefined response shape risks rework.
- ***NEW gap specific to BK-50 — no persistence/export tooling exists at all***: A direct, scoped repo check of `upex-bunkai-tms` found zero PDF/document-generation libraries installed (`jspdf`, `puppeteer`, `exceljs`, `docx`, etc. — none present in `package.json`), zero export/snapshot/download routes, and zero UI export affordances anywhere in the codebase. Unlike filtering (BK-48), which only needs query logic once the chain exists, export needs an entirely new capability class (file generation and/or a new persisted-snapshot data model) that this Epic — and this codebase — has never needed before. This is a second, independent blocker on top of the shared chain-assembly dependency.
- ***Required pre-work***: (1) BK-45 must reach at least a stable, documented chain-assembly contract before BK-50 can be implemented or meaningfully estimated — same as BK-48. (2) PO/Dev must decide the export mechanism (static file vs DB-copy vs hybrid) and the external-access model (file download vs scoped share link) BEFORE estimation, since this decision changes the Story's complexity rating from Medium to High depending on the answer.

***Sequencing risk***: BK-50 should NOT enter sprint planning or receive an SP estimate ahead of BK-45, for the same reason as BK-48. Additionally, recommend the PO/Dev settle the export-mechanism and external-access-model questions (Critical Q1-Q3) in a short design conversation BEFORE estimation — this Story carries a unique "new capability class" risk that filtering (BK-48) does not.

---

## Recommended testing strategy

### Pre-implementation

- Do not write parametrized test-data or numbered test steps yet — defer to in-sprint planning once BK-45's chain contract is stable AND the export mechanism (file vs DB-copy) is decided.
- Track BK-45's status and the PO's answer to Critical Question 2 (persistence mechanism) specifically — that single decision reshapes most of Phase 4's outlines.
- Resolve the 3 Critical PO Questions and the 3 Dev questions before any SP estimation session.

### During implementation

- Verify the export endpoint independently enforces RLS/tenant scoping (Tech Q3) early — an artifact that leaves the system is a higher-stakes surface for a missed isolation check than any in-app read.
- Verify the chosen immutability mechanism (static file vs DB-copy) actually holds under the realistic mutation scenarios in Edge Cases #2 and #4 (source story deleted; linked defect later merged) — these are the scenarios most likely to silently break the "moment of export" promise if the underlying implementation takes a shortcut (e.g. storing a live foreign key instead of a true copy).

### Post-implementation (in-sprint by /sprint-testing)

- Expand the 10 DRAFT outlines into full parametrized test cases with concrete chain shapes, mutation timelines, and exact snapshot copy once BK-45's response shape and the export mechanism are known.
- Add the deferred edge cases (Phase 5, especially #2, #3, #4, #6) as formal ACs or test-only cases per PO's confirmation.
- Design the external-access-model test suite (tokenized link expiry, revocation, no-login retrieval) once Critical Question 3 is answered — this is wholly new test surface for this Epic.

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
| --- | --- | --- | --- | --- |
| 1 | BK-50 estimated/scheduled before BK-45 ships, committing sprint capacity to an unbuildable Story | High | High | N/A — mitigated by sequencing recommendation in `## Data feasibility flags`, not by a test outline |
| 2 | "Read-only snapshot" implemented as a live, re-fetched view rather than a true point-in-time copy, silently breaking AC2 the first time the live chain changes | Medium | Critical | Outline "Should preserve the original chain state in a previously exported snapshot after the live chain changes" |
| 3 | Exported artifact (file or share link) leaks data across workspace boundaries because the export endpoint trusts session context instead of independently re-verifying RLS | Low | Critical | Outline "Should verify the export action enforces the same RLS/tenant-scoping rules as the live chain view" + Critical Question 3 |
| 4 | Snapshot becomes inaccessible or corrupted once its source user story is deleted/archived, defeating the Story's "fixed record" promise | Medium | High | Outline "Should keep a previously exported snapshot retrievable after its source user story is deleted or archived" |
| 5 | No export permission gate implemented, allowing any authenticated user (not just QA Lead) to export and externally share sensitive evidence chains | Medium | Medium | Outline "Should reject the export action for a role without export permission, if such a role exists" + Critical Question 3 |

---

## Next steps

- [ ] PO answers Critical Questions before sprint planning
- [ ] Dev answers Technical Questions before estimation
- [ ] Story enters sprint at status Ready For Dev once estimated
- [ ] When Story reaches Ready For QA, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)
- [ ] ***BLOCKER***: Do not estimate or schedule BK-50 ahead of BK-45 reaching a stable chain-assembly contract
- [ ] ***BLOCKER***: Do not estimate BK-50 until PO/Dev decide the export-artifact format and the external-access model (Critical Questions 1-3) — this Story carries a "new capability class" risk that its sibling BK-48 does not

---

### Benjamin Segovia - 6/16/2026, 1:32:13 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

The ATP DRAFT lives in the Acceptance Test Plan field.

Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.
Refined on: 2026-06-16 — QA Shift-Left batch session
Local working copy: .context/PBI/epics/EPIC-BK-44-coverage-traceability/stories/STORY-BK-50-tms-traceability-export-the-assembled-chain-as-a-r/shift-left-refinement.md

---

### Alicia Juste - 7/9/2026, 5:26:41 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

ATP DRAFT lives in the Acceptance Test Plan field.

Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate outline coverage.
Refined on: 2026-07-09 — QA Shift-Left batch session
Local working copy: .context/PBI/epics/EPIC-BK-44-coverage-traceability/stories/STORY-BK-50-tms-traceability-export-the-assembled-chain-as-a-r/shift-left-refinement.md

---

### Alicia Juste - 7/10/2026, 1:58:51 PM

## PO Decision — Shift-Left Questions Answered

### Q1: What artifact format does "export" produce?

***Decision******:****** A static HTML file stored in Cloudflare R2, delivered via a time-limited signed URL that requires no Bunkai login to view.***

***Reasoning******:***

- The Story explicitly says "without giving them system access" — this rules out an in-app gated view. The recipient must not need a Bunkai login.
- We have no PDF/document-generation libraries in the project, and adding one for v1 is scope-creep. HTML is trivial to generate from any backend renderer (string templates or a light JSX render) and requires zero new dependencies.
- Cloudflare R2 already exists in our stack for file storage — no new infrastructure.
- A signed URL gives us basic security (time-expiring, scoped to a specific file) without requiring the recipient to authenticate.

***Implications for the team******:***

- BK-45 (chain assembly) must produce a data contract (JSON) that the export service can consume to render the HTML. The export service should NOT re-query the database — it should accept the assembled chain as input, render it, and ship it to R2.
- No PDF, no JSX server-side rendering, no new infra. A plain HTML template + a small render function is the v1 bar.
- The signed URL expiry is a configurable constant (suggested default: 30 days). We can extend or revoke in a future iteration.

### Q2: What mechanism guarantees "the snapshot reflects the moment of export"?

***Decision******:****** A static document generated at export time and immediately uploaded to R2. No deep-copy snapshots table in v1.***

***Reasoning******:***

- A static file is inherently frozen — once uploaded to R2, it cannot change. This satisfies AC2 ("reflects the moment of export") trivially, without a snapshots table, without an immutability-enforcement layer, without versioning logic.
- A deep copy in a `snapshots` table would allow re-query and survival of source-story deletion — but those are not v1 requirements (they are not in scope). Building a deep-copy mechanism now would be speculative generality.
- BK-45's chain assembly is a read query across live tables. The export service calls that assembly, takes its JSON output, renders HTML from it, and ships it. The "moment of export" is the instant the assembly query completed.

***Implications for the team******:***

- No new database table needed for v1. The snapshots table is a valid v2+ evolution if users request "re-query an old export" or "export survives source deletion."
- The export flow is: trigger → call BK-45 chain assembly → render HTML → upload to R2 → return signed URL. That's it.
- Test design: to verify immutability, create an export, modify the source story data, re-fetch the export URL — the content must be identical to the original. No extra mechanism to test.

### Q3: Who is allowed to trigger an export, and what access model governs retrieval?

***Decision******:****** Any workspace member with at least Viewer role can trigger an export (same RLS as viewing the chain). The resulting snapshot is accessible via a signed URL that requires NO login — anyone with the link can view it.***

***Reasoning******:***

- Export is a read action on data the user already has permission to see. Restricting it further (e.g., admin-only) would force QA Leads like Mateo to escalate every export to a workspace admin, breaking the workflow the feature is designed to support.
- External auditors explicitly have "no system login" per the Story. A signed URL is the simplest way to give them access without creating user accounts, inviting them to the workspace, or assigning roles.
- The signed URL is the only access mechanism for the **snapshot**. The **trigger** remains gated by Bunkai's existing RLS (workspace + role). These are two separate access layers — the trigger is per-workspace auth, the snapshot is per-link auth (essentially: knowledge of the URL).

***Implications for the team******:***

- No new access-control infrastructure for v1. We reuse workspace RLS for the trigger, and R2 signed URLs for the snapshot.
- v1 does NOT add link expiration or passcode protection — the signed URL has a built-in expiry (configurable, see Q1), and that is sufficient for v1.
- v2 considerations (not for now): link revocation, per-link passcodes, granular "who can see this snapshot" inside Bunkai for users who DO have accounts.

---

**Answered by PO (Ely) during shift-left review on 2026-07-09 — facilitated by Alicia Juste**

---

### Alicia Juste - 7/10/2026, 2:17:17 PM

## Dev Decision — Technical Questions Answered

### Q1: Sync vs Async Export

***Decision******:****** Async with polling, reusing the job-table pattern from imports.***

The PO decision (static HTML file in R2 with signed URL) is clear on the output format, but the generation mechanism is a separate architectural concern.

***Reasoning******:***

- Vercel serverless has a hard 10s timeout. A full chain snapshot for 500+ entities requires N+1-safe querying, DOM-like HTML assembly, and R2 upload — easily exceeding 10s even with optimised queries.
- The existing import feature already established the async pattern (`import_jobs` table, polling endpoint). Equipping the team with a second, inconsistent mechanism (sync for export, async for import) creates cognitive overhead and maintenance burden.
- The N+1/performance risk flagged at the chain-assembly layer means the slowest path is unpredictable. Sync would fail intermittently for large chains with no graceful degradation.

***Implementation implications******:***

- Create an `export*jobs` table mirroring `import*jobs` structure: `id, workspace*id, user*id, chain*id, status (pending|processing|completed|failed), r2*file*key, signed*url, signed*url*expires*at, error*message, created*at, updated*at`.
- The POST endpoint creates a job record (`status: pending`), returns `{ jobId, status: "pending" }` immediately.
- The Supabase Edge Function (or a lightweight Vercel background fn) picks up pending jobs, assembles the HTML, uploads to R2, generates a signed URL, and flips status to `completed`.
- The client polls `GET /api/export/jobs/:id` for the result. Existing frontend polling infrastructure from the import feature can be reused.
- If the chain is small (e.g., < 50 entities), a fast-path that completes synchronously and returns the URL directly is a future optimisation — not part of v1.

### Q2: Storage/Retention Policy

***Decision******:****** R2 object with 30-day lifecycle. Signed URL with 7-day expiry. No deep-copy table in v1.***

***Reasoning******:***

- There is no existing cleanup/expiry infrastructure in the project. Starting one is required regardless of the time window we choose — a smaller window reduces blast radius if a signed URL leaks or a snapshot contains stale data.
- R2 is inexpensive but not free at scale. An aggressive lifecycle policy keeps costs predictable and prevents unbounded storage growth.
- The 7-day signed URL window matches the typical sprint cycle: a snapshot created during sprint testing is relevant for the sprint's duration plus a few days for the QA sign-off.
- The 30-day R2 deletion gives a 23-day grace period where the signed URL is dead but the object still exists for admin recovery. This can be surfaced in the export_jobs table for workspace admins.

***Implementation implications******:***

- Three-layer cleanup:

  ***Layer 1 (R2 Lifecycle Rule)******:*** Bucket policy to `AbortIncompleteMultipartUpload` + `Expiration` after 30 days. This is zero-maintenance and survives deployment outages.
  ***Layer 2 (Cron Cleanup)******:**** Vercel Cron Job (`0 3 ** ** **`) runs a script that queries `export*jobs` for `status = completed AND updated*at < 30 days ago`, marks them `expired`, and optionally calls R2 `DeleteObject` (belt-and-suspenders with the lifecycle rule).
  ***Layer 3 (Signed URL TTL)******:*** The presigned URL is generated with `expiresIn: 604800` (7 days in seconds). The client side must handle 403 responses gracefully and prompt the user to regenerate.

- The export metadata record persists in the DB beyond 30 days even after the file is deleted. This is useful for auditing who exported what and when.
- No deep-copy table of the chain data — the R2 file IS the snapshot. If we need point-in-time recovery later, we version the R2 object key (`chains/{workspaceId}/{chainId}/{timestamp}.html`).

### Q3: RLS Re-verification

***Decision******:****** Independently re-verify RLS scoping at generation time — do NOT trust the caller's RLS-scoped ****`db`**** client alone.***

***Reasoning******:***

- BK-117/BK-134 explicitly document that PAT scope enforcement is incomplete. A PAT-authenticated caller currently bypasses parts of the RLS chain that browser-session callers do not. The `resolveIdentity()` function returns a `db` client that has RLS applied, but the scope of that RLS depends on how the client was built — and for PATs, the enforcement has known gaps.
- The export endpoint is a data exfiltration surface. A caller with a PAT that scopes to workspace A could potentially export entities they can see (via RLS) but should not be allowed to bulk-export without explicit workspace-level permission.
- The import pattern already has an analogous guard: import jobs are created scoped to a workspace, and the caller's membership is verified before processing begins.

***Implementation implications******:***

- At job creation time, perform a ***direct membership check*** (service*role client, bypassing RLS) against the `workspace*members` table using the caller's `userId` and the target `workspaceId` from the chain. Reject with 403 if the caller is not an active member.
- At generation time (in the background worker), use the RLS-scoped `db` client to query every entity type included in the export. If any query returns fewer rows than the chain expects (e.g., a chain with 500 entities returns only 490 rows), abort the job with `status: failed` and a specific error message. This catches both RLS filtering and data corruption.
- The `export*jobs` record stores `workspace*id` and `user_id` for audit. This creates an immutable trail of who exported what chain and when — essential for compliance.
- Future improvement: once BK-117/BK-134 are resolved and PAT scope enforcement is complete, the direct membership check can be relaxed to only flag (warn) rather than block, since the RLS-scoped `db` client would then be fully trustworthy. For now, hard block.

---

**Answered by Dev lead during shift-left review on 2026-07-09**

---

### Ely - 7/30/2026, 1:28:41 PM

Mockup — Traceability chain — export. Source: .context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/traceability-chain.html · spec: master-design-plan §4.7



---


_Synced from Jira by sync-jira-issues_
