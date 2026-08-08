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
- Beyond the AC-level ambiguity, the dominant issue (same shape as sibling [https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48](https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48)) is ***complete non-existence of the feature being exported***: [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) exports a chain ([https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45)) that has no implementation, over entity types ([https://jira.upexgalaxy.com/browse/BK-24#icft=BK-24](https://jira.upexgalaxy.com/browse/BK-24#icft=BK-24) Tests, [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) Runs, [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) Defects) with no schema. [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) additionally has NO existing persistence/export tooling anywhere in the codebase to build on (confirmed by the repo scan — zero PDF/export libraries installed, zero export routes).
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

1. ***Will the export run synchronously (blocking the request/UI) or asynchronously (background job + "export ready" notification)?*** — Context: Phase 2 Gap #3; the Epic's risk map already flags an N+1/performance risk at the chain-assembly layer (inherited from [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45)), and export adds a serialization step on top. Testing impact: determines whether a large-chain export is tested as a simple synchronous-response assertion or requires polling/notification-flow test design.

1. ***If the snapshot is a DB-copy rather than a static file, what is the storage/retention policy — indefinite, time-limited, or subject to manual deletion by the QA Lead?*** — Context: Phase 2 Gap #1; no AC addresses retention. Testing impact: determines whether "list past exports" and expiry/cleanup test outlines are in scope at all for v1.

1. ***Does the export endpoint independently re-verify workspace/RLS scoping at generation time, or does it trust the caller's already-authenticated session context the same way the live chain view does?*** — Context: Phase 2 Gap #4; an artifact that leaves the system is a higher-stakes surface for a missed RLS check than an in-app read, since there's no second chance to catch a leak after the file is downloaded. Testing impact: determines whether the export endpoint needs its own dedicated tenant-isolation test, separate from BK-45's.

---

## Suggested Story Improvements

| ***#**** | ****Current state**** | ****Suggested change**** | ****Benefit*** |
| --- | --- | --- | --- |
| 1 | "a read-only snapshot is produced" (AC1) | "exporting produces a downloadable [file format TBD by PO] containing the full chain, retrievable without requiring the recipient to log into Bunkai" | Removes Critical Q1's format ambiguity and makes the "without giving them system access" promise from the user story testable. |
| 2 | "the snapshot still shows the evidence as it was at export time" (AC2) | "the snapshot is generated as a [static document / versioned copy — PO to choose] that is structurally independent of the live chain, such that no later mutation to the live chain (including deletion of the source story) can alter or invalidate it" | Removes Critical Q2's mechanism ambiguity and makes the immutability guarantee concrete enough to test against deletion/mutation edge cases. |
| 3 | No AC on who can export or who can later view an exported snapshot | Add AC: "Only users with read access to the user story can trigger export; [exported snapshots are retrievable via a scoped, time-limited share mechanism for external recipients — TBD]" | Closes Critical Q3 and Gap #2 — prevents an unintentionally open access surface on an artifact designed to leave the system. |
| 4 | "the snapshot states the story had no coverage at export time" (AC3) | "the snapshot states the story had no coverage at export time, using the copy: '[exact wording TBD by PO]', consistent with the empty-coverage state shown elsewhere in the chain view" | Makes the AC3 assertion deterministic instead of relying on prose interpretation. |

---

## Data feasibility flags

***DATA-FEASIBILITY-RISK:**** ****confirmed and concrete — same root cause as BK-48, plus an additional, Story-specific gap.***

[https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) exports "the assembled evidence chain" — the same chain that [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) ("Render full US to bug evidence chain in one read") is responsible for producing. [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) is still in status ***Estimation*** (per the orchestrator's known facts). Reusing BK-48's confirmed finding on this shared dependency, then adding what is unique to [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50):

- ***Entity / fixture missing (shared with BK-48)***: There is no queryable data structure to export. BK-45's own refinement confirms zero implementation of `tests`, `test*runs`/`run*results`, or `defects`/`bugs` tables across all reviewed migrations, and no `GET /api/v1/user-stories/{id}/traceability` endpoint exists. [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) has nothing to export — not "limited data," literally no chain-assembly capability at all.
- ***API contract gap (shared with BK-45/BK-48)***: An export capability needs a stable response shape to serialize. That shape is still under PO/Dev negotiation in BK-45's own open questions. Designing an export format against an undefined response shape risks rework.
- ***NEW gap specific to BK-50 — no persistence/export tooling exists at all***: A direct, scoped repo check of `upex-bunkai-tms` found zero PDF/document-generation libraries installed (`jspdf`, `puppeteer`, `exceljs`, `docx`, etc. — none present in `package.json`), zero export/snapshot/download routes, and zero UI export affordances anywhere in the codebase. Unlike filtering ([https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48](https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48)), which only needs query logic once the chain exists, export needs an entirely new capability class (file generation and/or a new persisted-snapshot data model) that this Epic — and this codebase — has never needed before. This is a second, independent blocker on top of the shared chain-assembly dependency.
- ***Required pre-work***: (1) [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) must reach at least a stable, documented chain-assembly contract before [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) can be implemented or meaningfully estimated — same as [https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48](https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48). (2) PO/Dev must decide the export mechanism (static file vs DB-copy vs hybrid) and the external-access model (file download vs scoped share link) BEFORE estimation, since this decision changes the Story's complexity rating from Medium to High depending on the answer.

***Sequencing risk***: [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) should NOT enter sprint planning or receive an SP estimate ahead of [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45), for the same reason as [https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48](https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48). Additionally, recommend the PO/Dev settle the export-mechanism and external-access-model questions (Critical Q1-Q3) in a short design conversation BEFORE estimation — this Story carries a unique "new capability class" risk that filtering ([https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48](https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48)) does not.

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

| ***#**** | ****Risk**** | ****Likelihood**** | ****Impact**** | ****Mitigated by which outlines*** |
| --- | --- | --- | --- | --- |
| 1 | [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) estimated/scheduled before [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) ships, committing sprint capacity to an unbuildable Story | High | High | N/A — mitigated by sequencing recommendation in `## Data feasibility flags`, not by a test outline |
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
- [ ] ***BLOCKER***: Do not estimate or schedule [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) ahead of [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) reaching a stable chain-assembly contract
- [ ] ***BLOCKER***: Do not estimate [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) until PO/Dev decide the export-artifact format and the external-access model (Critical Questions 1-3) — this Story carries a "new capability class" risk that its sibling [https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48](https://jira.upexgalaxy.com/browse/BK-48#icft=BK-48) does not

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

***Decision:**** ****A static HTML file stored in Cloudflare R2, delivered via a time-limited signed URL that requires no Bunkai login to view.***

***Reasoning:***

- The Story explicitly says "without giving them system access" — this rules out an in-app gated view. The recipient must not need a Bunkai login.
- We have no PDF/document-generation libraries in the project, and adding one for v1 is scope-creep. HTML is trivial to generate from any backend renderer (string templates or a light JSX render) and requires zero new dependencies.
- Cloudflare R2 already exists in our stack for file storage — no new infrastructure.
- A signed URL gives us basic security (time-expiring, scoped to a specific file) without requiring the recipient to authenticate.

***Implications for the team:***

- [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) (chain assembly) must produce a data contract (JSON) that the export service can consume to render the HTML. The export service should NOT re-query the database — it should accept the assembled chain as input, render it, and ship it to R2.
- No PDF, no JSX server-side rendering, no new infra. A plain HTML template + a small render function is the v1 bar.
- The signed URL expiry is a configurable constant (suggested default: 30 days). We can extend or revoke in a future iteration.

### Q2: What mechanism guarantees "the snapshot reflects the moment of export"?

***Decision:**** ****A static document generated at export time and immediately uploaded to R2. No deep-copy snapshots table in v1.***

***Reasoning:***

- A static file is inherently frozen — once uploaded to R2, it cannot change. This satisfies AC2 ("reflects the moment of export") trivially, without a snapshots table, without an immutability-enforcement layer, without versioning logic.
- A deep copy in a `snapshots` table would allow re-query and survival of source-story deletion — but those are not v1 requirements (they are not in scope). Building a deep-copy mechanism now would be speculative generality.
- BK-45's chain assembly is a read query across live tables. The export service calls that assembly, takes its JSON output, renders HTML from it, and ships it. The "moment of export" is the instant the assembly query completed.

***Implications for the team:***

- No new database table needed for v1. The snapshots table is a valid v2+ evolution if users request "re-query an old export" or "export survives source deletion."
- The export flow is: trigger → call [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) chain assembly → render HTML → upload to R2 → return signed URL. That's it.
- Test design: to verify immutability, create an export, modify the source story data, re-fetch the export URL — the content must be identical to the original. No extra mechanism to test.

### Q3: Who is allowed to trigger an export, and what access model governs retrieval?

***Decision:**** ****Any workspace member with at least Viewer role can trigger an export (same RLS as viewing the chain). The resulting snapshot is accessible via a signed URL that requires NO login — anyone with the link can view it.***

***Reasoning:***

- Export is a read action on data the user already has permission to see. Restricting it further (e.g., admin-only) would force QA Leads like Mateo to escalate every export to a workspace admin, breaking the workflow the feature is designed to support.
- External auditors explicitly have "no system login" per the Story. A signed URL is the simplest way to give them access without creating user accounts, inviting them to the workspace, or assigning roles.
- The signed URL is the only access mechanism for the **snapshot**. The **trigger** remains gated by Bunkai's existing RLS (workspace + role). These are two separate access layers — the trigger is per-workspace auth, the snapshot is per-link auth (essentially: knowledge of the URL).

***Implications for the team:***

- No new access-control infrastructure for v1. We reuse workspace RLS for the trigger, and R2 signed URLs for the snapshot.
- v1 does NOT add link expiration or passcode protection — the signed URL has a built-in expiry (configurable, see Q1), and that is sufficient for v1.
- v2 considerations (not for now): link revocation, per-link passcodes, granular "who can see this snapshot" inside Bunkai for users who DO have accounts.

---

**Answered by PO (Ely) during shift-left review on 2026-07-09 — facilitated by Alicia Juste**

---

### Alicia Juste - 7/10/2026, 2:17:17 PM

## Dev Decision — Technical Questions Answered

### Q1: Sync vs Async Export

***Decision:**** ****Async with polling, reusing the job-table pattern from imports.***

The PO decision (static HTML file in R2 with signed URL) is clear on the output format, but the generation mechanism is a separate architectural concern.

***Reasoning:***

- Vercel serverless has a hard 10s timeout. A full chain snapshot for 500+ entities requires N+1-safe querying, DOM-like HTML assembly, and R2 upload — easily exceeding 10s even with optimised queries.
- The existing import feature already established the async pattern (`import_jobs` table, polling endpoint). Equipping the team with a second, inconsistent mechanism (sync for export, async for import) creates cognitive overhead and maintenance burden.
- The N+1/performance risk flagged at the chain-assembly layer means the slowest path is unpredictable. Sync would fail intermittently for large chains with no graceful degradation.

***Implementation implications:***

- Create an `export*jobs` table mirroring `import*jobs` structure: `id, workspace*id, user*id, chain*id, status (pending|processing|completed|failed), r2*file*key, signed*url, signed*url*expires*at, error*message, created*at, updated*at`.
- The POST endpoint creates a job record (`status: pending`), returns {{{ jobId, status: "pending" }}} immediately.
- The Supabase Edge Function (or a lightweight Vercel background fn) picks up pending jobs, assembles the HTML, uploads to R2, generates a signed URL, and flips status to `completed`.
- The client polls `GET /api/export/jobs/:id` for the result. Existing frontend polling infrastructure from the import feature can be reused.
- If the chain is small (e.g., < 50 entities), a fast-path that completes synchronously and returns the URL directly is a future optimisation — not part of v1.

### Q2: Storage/Retention Policy

***Decision:**** ****R2 object with 30-day lifecycle. Signed URL with 7-day expiry. No deep-copy table in v1.***

***Reasoning:***

- There is no existing cleanup/expiry infrastructure in the project. Starting one is required regardless of the time window we choose — a smaller window reduces blast radius if a signed URL leaks or a snapshot contains stale data.
- R2 is inexpensive but not free at scale. An aggressive lifecycle policy keeps costs predictable and prevents unbounded storage growth.
- The 7-day signed URL window matches the typical sprint cycle: a snapshot created during sprint testing is relevant for the sprint's duration plus a few days for the QA sign-off.
- The 30-day R2 deletion gives a 23-day grace period where the signed URL is dead but the object still exists for admin recovery. This can be surfaced in the export_jobs table for workspace admins.

***Implementation implications:***

- Three-layer cleanup:

***Layer 1 (R2 Lifecycle Rule):*** Bucket policy to `AbortIncompleteMultipartUpload` + `Expiration` after 30 days. This is zero-maintenance and survives deployment outages.
***Layer 2 (Cron Cleanup):**** Vercel Cron Job (`0 3 ** ** **`) runs a script that queries `export*jobs` for `status = completed AND updated*at < 30 days ago`, marks them `expired`, and optionally calls R2 `DeleteObject` (belt-and-suspenders with the lifecycle rule).
***Layer 3 (Signed URL TTL):*** The presigned URL is generated with `expiresIn: 604800` (7 days in seconds). The client side must handle 403 responses gracefully and prompt the user to regenerate.

- The export metadata record persists in the DB beyond 30 days even after the file is deleted. This is useful for auditing who exported what and when.
- No deep-copy table of the chain data — the R2 file IS the snapshot. If we need point-in-time recovery later, we version the R2 object key (`chains/{workspaceId}/{chainId}/{timestamp}.html`).

### Q3: RLS Re-verification

***Decision:**** ****Independently re-verify RLS scoping at generation time — do NOT trust the caller's RLS-scoped**** `db` ****client alone.***

***Reasoning:***

- BK-117/BK-134 explicitly document that PAT scope enforcement is incomplete. A PAT-authenticated caller currently bypasses parts of the RLS chain that browser-session callers do not. The `resolveIdentity()` function returns a `db` client that has RLS applied, but the scope of that RLS depends on how the client was built — and for PATs, the enforcement has known gaps.
- The export endpoint is a data exfiltration surface. A caller with a PAT that scopes to workspace A could potentially export entities they can see (via RLS) but should not be allowed to bulk-export without explicit workspace-level permission.
- The import pattern already has an analogous guard: import jobs are created scoped to a workspace, and the caller's membership is verified before processing begins.

***Implementation implications:***

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

### Ely - 8/8/2026, 3:27:26 PM

## AI Tech Lead — Decision: BK-50's ratified export design rests on a false infrastructure premise. What is the correct delivery mechanism?

> ***ERROR:**** This comment ****supersedes the infrastructure half of the PO Decision of 2026-07-10 (comment 11047, Q1 and Q3)**** and ****supersedes the Dev Decision of 2026-07-10 (comment 11048, Q1, Q2 and its cleanup design) in full***. Verified against as-built code on `origin/staging` (`5d1c9df`), not against documents. Same supersession pattern used on BK-43 (comment 12170, 2026-08-05).

### 1. The false premise, stated plainly

Comment 11047 justifies its Q1 decision with: **"Cloudflare R2 already exists in our stack for file storage — no new infrastructure."**

***That is false. There is no object storage in this repository, in any form.*** A full sweep of `origin/staging@5d1c9df` returns zero hits for every one of:

| Probe | Result |
| --- | --- |
| `Cloudflare` / `R2` in application code | 0 hits |
| `@aws-sdk/*`, `S3Client`, `getSignedUrl`, `presign` | 0 hits; no storage SDK in `package.json` |
| `.storage.from(` (Supabase Storage) | 0 hits |
| `@vercel/blob` | 0 hits |
| Bucket / storage DDL across all 68 migrations | 0 hits |
| Storage credentials in `.env.example` / `.env` | 0 hits |

R2 is a ***planned Sprint-4 external dependency, not a provisioned one****: `master-implementation-plan.md:377-383` lists it under external dependencies with **"Lead-time***:**** R2 account + bucket provisioning + IAM keys"** and a stand-in for Sprints 1-3. `SRS/non-functional-specs.md:54` and `SRS/architecture-specs.md:168-171` name R2 as the intended blob backend, which is an architectural intent, not an existing capability.

Three further as-built facts that the ratified design assumed away:

- ***There is no export precedent at all.*** No CSV writer, no PDF library, no `Content-Disposition`, no `@media print`, no download route, no share-link or token-gated public page anywhere in the app.
- ***There is no anonymous data-access surface.**** `middleware.ts:10-11` gates `/home`, `/projects`, `/onboarding`, `/settings`, `/activity`; the only public prefixes are `/login`, `/auth`, `/api/auth`. Migration `0068:318` ****explicitly revokes*** the traceability RPC from `public` and `anon`, granting only `authenticated` and `service_role`.
- ***There is no scheduler.*** No `pg_cron`, no `supabase/functions`, no Vercel cron entry. Comment 11048's "Layer 2 (Cron Cleanup)" would be the first one in the project.

The 2026-08-06 delivery-record ruling on evidence-file hosting already established the shape of this work: activating blob storage is **"a tech-story trio plus a blob-authorization ADR (blobs sit outside ADR-0012's RLS/RPC invariant)"**. That is what comment 11047 unknowingly folded into a 5-point story.

### 2. The async premise is also refuted

Comment 11048 Q1 chose an async `export_jobs` job table because **"a full chain snapshot for 500+ entities requires N+1-safe querying, DOM-like HTML assembly, and R2 upload, easily exceeding 10s."**

As built, chain assembly is ***one round trip***: `bunkai*report*story*traceability(p*actor*user*id uuid, p*user*story*id uuid) returns jsonb` (`supabase/migrations/0068*story*traceability*report.sql:98-131`), served synchronously today at `app/api/v1/projects/[id]/traceability/route.ts` to an interactive page (`components/traceability/TraceabilityChainView.tsx`). If that single call were near the 10s budget, BK-45's shipped screen would already be timing out. Rendering a string template from a jsonb payload already in memory adds no meaningful time, and the R2 upload (the only genuinely slow leg) disappears under the ruling below.

***The ****`export_jobs`**** table, the background worker, the presigned URL, the 30-day lifecycle rule and the daily Vercel Cron cleanup are all cancelled.*** They exist only to serve a storage backend that does not exist and that this story should not provision.

### 3. Candidates scored

Criteria and weights, stated before the scores: product value against the story's actual goal (x3), security risk (x3), consistency with in-repo precedent and the ratified design contract (x2), implementation cost against a 5-point budget (x2), reversibility (x1). Scores /10.

| # | Option | Value x3 | Security x3 | Precedent x2 | Cost x2 | Revers. x1 | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Build as ratified: provision R2, presigned URL, anonymous access, `export_jobs`, cron cleanup | 7 | 2 | 3 | 2 | 3 | ***40*** |
| B | Swap backend to Supabase Storage, keep the no-login signed-URL model | 7 | 2 | 2 | 4 | 5 | ***44*** |
| C | Authenticated in-app persisted snapshot (`snapshots` table), no external storage, no anonymous access; split external sharing out | 4 | 9 | 6 | 5 | 6 | ***67*** |
| D | Keep BK-50 as scoped, slice it into follow-up tickets the way BK-43 was sliced | 3 | 5 | 5 | 6 | 8 | ***54*** |
| ***E**** | ****Client-initiated download of a self-contained static document, rendered synchronously by the existing authenticated route. No storage, no anonymous surface, no job table, no cron.**** | ****9**** | ****10**** | ****9**** | ****9**** | ****10**** | ****103*** |

Reasoning behind the scores that carry the result:

- ***A scores 2 on security**** because it creates the application's first anonymous data-access surface, in direct contradiction of `0068:318`'s explicit revoke from `anon`, and puts a full evidence chain behind bearer-link auth. It scores 2 on cost because R2 account plus bucket plus IAM keys plus an S3 SDK plus a migration plus a background worker plus a first-ever cron plus a blob-authorization ADR is not a 5-point story. It scores 7 rather than 9 on product value because a 7-day signed URL over a 30-day object is a ****self-destructing**** audit record; the story asks for a **fixed* record.
- ***B scores worse than A on precedent (2)**** despite being cheaper. The 2026-08-06 delivery-record ruling states the blob backend is **already chosen as R2, NOT Supabase Storage*, citing `SRS/non-functional-specs.md:54` and `SRS/architecture-specs.md:168-171`. Picking Supabase Storage inside a 5-point story would silently overturn a spec-level architecture choice as a side effect of an export feature. It keeps A's anonymous surface unchanged, so it keeps A's security score.
- ***C scores 9 on security and 4 on product value.*** It is safe and it is buildable, but it removes the story's headline value: an auditor would need a Bunkai login, which is the exact thing the user story rules out.
- ***D scores 3 on product value**** because slicing does not touch the false premise; it defers the same undeliverable design into more tickets. BK-43 was sliced because its scope genuinely exceeded its estimate. Here the scope **shrinks* once the premise is corrected, so slicing solves the wrong problem.
- ***E wins on every axis except none.*** It is not a near-tie: 103 against a runner-up of 67.

### 4. Decision

***Option E. BK-50 v1 produces a self-contained document file that the browser downloads directly to the requester's machine. No object storage, no hosted artifact, no anonymous access surface, no ****`export_jobs`**** table, no background worker, no cron, no new SDK, no new migration.***

Mechanism:

1. The Export snapshot button calls the ***already-shipped*** `GET /api/v1/projects/{id}/traceability?story={id}` path (or a sibling route reusing the same RPC) under the caller's existing authenticated session.
2. The returned `jsonb` chain is rendered into a ***single self-contained HTML document*** (inline styles, no external references, no network calls) carrying the export timestamp, the workspace/project/story identity, and every chain entity and field the screen shows.
3. The document is delivered as a file download (`Content-Disposition: attachment`, or an equivalent client-side `Blob` + object URL), named on the mockup's pattern `trace-<story>-YYYYMMDD-HHMM.html`.
4. The confirmation toast fires exactly as the ratified mockup specifies.

Why this is not a compromise but the better artifact:

- ***It is what the ratified design contract already says.**** `.context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/traceability-chain.html:536-537` uses the ****download**** icon (`#i-download`); `:1021` composes a ****filename**** (`trace-us-104-YYYYMMDD-HHMM`); `:859-866` is a "Snapshot exported" toast. `master-design-plan.md:241` ratifies it as **"a point-in-time export carrying its own real timestamp (confirmation toast, mono filename)"**. There is no link, no share sheet, no copy-URL control anywhere in the mockup. ****The mockup was posted to this ticket on 2026-07-30, twenty days after comment 11047***, so it is the later artifact and it contradicts 11047's hosted-link model. Per Critical Rule #15 the mockup is the design contract.
- ***It satisfies the story's goal more completely than the ratified design did.*** The auditor receives a file they keep permanently. No login (the goal), no expiry (11047's model expires in 7 days), no link to leak, no 30-day object deletion. Scenario E1 ("snapshot remains retrievable after the source story is deleted/archived") is satisfied absolutely rather than for 30 days.
- ***It satisfies AC2 immutability with less machinery than 11047 claimed for R2.**** A file on the recipient's disk is the strongest possible freeze. Comment 11047 Q2's conclusion (no snapshots table in v1) ****survives this ruling*** and is reaffirmed; only its delivery mechanism changes.

The one deliberate departure from the mockup: the mockup's toast composes a `.json` filename. This ruling ships `.html` instead, because the artifact's consumer is a human auditor and AC3.1 requires the empty-chain export to **"state the story had no coverage"**, which is rendered prose, not an empty array. This is a ***UI spec-only departure*** and must be recorded as a `master-design-plan.md` §5 divergence row before BK-50 merges, per Critical Rule #15. No ADR: no schema, auth model, or cross-cutting invariant is touched and the change is fully reversible (fails the ADR gate).

### 5. Security determination, and what is NOT mine to decide

***The ruling above is mine to make, and I have made it.**** Option E creates ****no new security surface***. It reads data the caller is already authorized to read, through an authenticated route that already exists and already carries the shipped non-disclosure contract (`mapTraceabilityRpcError` collapses missing, foreign-workspace and non-member stories into one 404). The artifact crosses the trust boundary only by the user's own deliberate act of forwarding a file, which is the same posture the product already accepts for a screenshot. `0068:318`'s revoke from `anon` stays intact, ADR-0012's invariant is untouched, and no blob-authorization ADR is needed. Per the decision protocol, applying an established ratified security posture to new code is implementation, not a new decision.

***The anonymous-link capability is a different matter, and it is NOT mine to decide.**** Serving a full evidence chain (story, ACs, ATCs, tests, run outcomes, defect titles and statuses) to an unauthenticated caller would be the application's ****first**** anonymous data-access surface and would accept a risk this project has never accepted. That falls squarely in the escalate-only category "deciding a **new** security posture, or accepting a risk nobody has accepted before", which Critical Rule #18 does ****not**** override (Rule #18 replaces the **product** escalation category only). ****A human must accept that posture before any anonymous-link story is built.*** I am stating that rather than quietly routing around it.

If and when a human does approve it, these controls are mandatory, not optional:

- Token entropy ***≥128 bits***, CSPRNG-generated, never derived from a row id or a sequence.
- Hard server-side expiry, independent of any storage-layer expiry, plus ***explicit revocation*** by the issuing workspace.
- ***No enumeration***: an unknown token, an expired token and a revoked token must return the identical response. No existence echo, matching the 404 contract already shipped for the authenticated path.
- ***Scope of exactly one story's chain***, resolved server-side from the token. No caller-supplied ids on the anonymous path.
- ***No PII beyond what the chain itself renders.*** Actor emails in particular must not ride along; note that `bunkai*resolve*activity_actors` already leaked exactly that class of data once (ADR-0012's context section).
- ***An audit row per issuance and per anonymous fetch***, including issuing user, workspace, story, timestamp and requester IP.
- Rate limiting on the anonymous endpoint, `X-Robots-Tag: noindex`, and no CDN edge caching of the response.
- A ***link-authorization ADR*** landing with it, since bearer-link access sits outside ADR-0012's actor-bind invariant by construction.

### 6. What this means for BK-50's status

BK-50 is ***buildable today**** under this ruling. Its dependency BK-45 is genuinely satisfied (merge `f75709e`, verified an ancestor of `origin/staging`), the data source is shipped and sound, and the corrected scope is materially ****smaller*** than 5 points: one render function, one route or client handler, one button, one toast. No migration.

It should ***stay ****`Ready For Dev` as re-scoped, with one precondition: the Acceptance Criteria field still carries stale `NEEDS PO/DEV CONFIRMATION` markers and Scenario E2 still contradicts comment 11047 Q3. See the companion ****AI Product Owner*** comment on this ticket for the AC ruling and the exact rewrite. This pass deliberately did not transition, reassign, or write any code or migration.

---

### Ely - 8/8/2026, 3:27:27 PM

## AI Product Owner — Decision: What is BK-50's correct v1 scope, and which of Scenario E2 or comment 11047 Q3 survives?

> ***ERROR:**** This comment ****supersedes the PO Decision of 2026-07-10 (comment 11047) on Q1's delivery channel and on Q3's anonymous-access clause****. Comment 11047 Q2 (no snapshots table in v1) is ****reaffirmed, not superseded****. Companion ruling: the ****AI Tech Lead*** comment on this ticket, which establishes the infrastructure facts this decision rests on. Same supersession pattern used on BK-43 (comment 12170, 2026-08-05).

### 1. Why this is being reopened

Comment 11047 is a well-formed decision built on a factual error. Its Q1 rationale asserts **"Cloudflare R2 already exists in our stack for file storage — no new infrastructure."** Verified against as-built code on `origin/staging@5d1c9df`: ***there is no object storage in this repository in any form*** (no R2, no S3 SDK, no Supabase Storage call, no `@vercel/blob`, no bucket DDL in 68 migrations, no storage credentials). The full evidence is in the AI Tech Lead comment.

That error propagated. The decision that felt free ("no new infrastructure") is in fact the most expensive option on the board, and it silently carried a second, larger decision with it: creating the application's first anonymous data-access surface.

### 2. The product question, restated

The user story is the authority: **"As a QA Lead, I want to export a user story's assembled evidence chain as a shareable, read-only pack so that I can hand auditors and stakeholders a fixed record ******without giving them system access****."**

Two requirements, both binding, and comment 11047 conflated them:

- ***No system access**** for the recipient. This is a requirement about the **recipient*, and it is satisfied by any artifact that does not require a Bunkai account.
- ***A fixed record.*** The artifact must not change, and it must still be there when the auditor opens it.

Comment 11047 read "no system access" as necessarily meaning "a public URL". It does not. Handing someone a file satisfies "no system access" completely, and satisfies "fixed record" ***better*** than a link that dies in 7 days.

### 3. Candidates scored

Criteria and weights, stated before the scores: product value against the story's own goal (x3), security risk (x3), consistency with in-repo precedent and the ratified design contract (x2), implementation cost against the 5-point budget (x2), reversibility (x1). Scores /10.

| # | Option | Value x3 | Security x3 | Precedent x2 | Cost x2 | Revers. x1 | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Build as ratified: provision R2, presigned URL, anonymous access, `export_jobs`, cron cleanup | 7 | 2 | 3 | 2 | 3 | ***40*** |
| B | Swap the backend to Supabase Storage, keep the no-login signed-URL model | 7 | 2 | 2 | 4 | 5 | ***44*** |
| C | Authenticated in-app persisted snapshot, no external storage, no anonymous access; split external sharing into a follow-up | 4 | 9 | 6 | 5 | 6 | ***67*** |
| D | Keep BK-50 as scoped and slice it into follow-up tickets the way BK-43 was sliced | 3 | 5 | 5 | 6 | 8 | ***54*** |
| ***E**** | ****Downloadable self-contained snapshot document, generated synchronously from the shipped chain endpoint. No hosting, no anonymous surface.**** | ****9**** | ****10**** | ****9**** | ****9**** | ****10**** | ****103*** |

The product-value column is where this decision actually turns, so it is worth being explicit about it:

- ***A and B score 7, not 9.*** They deliver the no-login recipient, but the artifact is temporary by design: a 7-day signed URL over an object deleted at 30 days (comment 11048 Q2). An audit record that expires in a week is a weak reading of "fixed record", and it makes Scenario E1 ("the snapshot remains retrievable after the source story is deleted") true only for 30 days.
- ***C scores 4, and I want to be unambiguous about why******:****** option C removes the story's headline value.*** An in-app authenticated snapshot means the auditor needs a Bunkai login, which is the exact condition the user story rules out. C is the safe option and it is genuinely buildable, but it delivers roughly half of what was asked. Had E not been available, C would have won on the weighted total and I would have ruled for it while saying plainly that the story's stated goal was being deferred to a follow-up. E makes that trade unnecessary.
- ***D scores 3.**** Slicing does not address the false premise; it distributes an undeliverable design across more tickets and buys another refinement cycle. BK-43 was sliced because its scope genuinely exceeded its estimate. BK-50's scope **shrinks* once the premise is corrected, so slicing is the wrong instrument here.
- ***E scores 9 on value*** because the auditor keeps the file permanently: no login, no expiry, no link to leak, no deletion window. It is a strictly better "fixed record" than the ratified design produced.

### 4. Decision

***Option E. BK-50 v1 delivers a downloadable, self-contained, read-only snapshot document. No hosted artifact, no public link, no anonymous access.***

The winner is also the option the project had already ratified visually. The design contract for this screen (`master-design-plan.md:241`, mockup `bk-44-metrics-coverage/traceability-chain.html`) specifies the Export action as **"a point-in-time export carrying its own real timestamp (confirmation toast, mono filename)"**, drawn with a ***download**** icon and a composed ****filename****. There is no link, share sheet, or copy-URL control anywhere in that mockup. ****The mockup was attached to this ticket on 2026-07-30, twenty days after comment 11047***, making it the later and governing artifact under Critical Rule #15. Comment 11047's hosted-link model was never reconciled with it.

***In scope for v1******:***

- Export action on the traceability screen, rendered per the mockup (accent button, download icon, confirmation toast with the real export timestamp and the composed filename).
- A single self-contained document containing every chain entity and field the screen shows, plus the export timestamp and the workspace / project / story identity.
- The empty-chain case renders as prose stating the story had no coverage as of the export timestamp (AC3.1), not as an empty structure.
- Any Viewer-or-above workspace member can trigger it. ***This half of comment 11047 Q3 survives unchanged*** and is already how the shipped endpoint behaves.

***Out of scope for v1 (unchanged from the ticket's Out Of Scope field, plus these)******:***

- Hosted artifacts, public links, signed URLs, anonymous retrieval.
- A `snapshots` table or any deep copy. ***Comment 11047 Q2 is reaffirmed****: the exported file **is* the snapshot.
- Job tables, background workers, retention lifecycles, scheduled cleanup. All of comment 11048's apparatus is cancelled by the AI Tech Lead ruling.
- PDF output and branding/layout configuration.

***Artifact format******:**** a self-contained ****HTML**** document. This preserves the format half of comment 11047 Q1, whose reasoning was sound and remains sound: no PDF or document-generation library exists in this project, adding one is scope creep, and HTML renders from a string template with zero new dependencies. Only Q1's **destination* was wrong. Note that the mockup's toast composes a `.json` filename; shipping `.html` instead is a deliberate, recorded departure, because the consumer is a human auditor and AC3.1 requires rendered prose for the empty case. It must be logged as a `master-design-plan.md` §5 spec-only divergence row before BK-50 merges (no ADR required: no schema, auth model or invariant is touched, and it is fully reversible).

### 5. Reconciling Scenario E2 against comment 11047 Q3

These two have been in direct contradiction on this ticket since 2026-07-10. E2 requires that unauthenticated retrieval be ***rejected****; 11047 Q3 requires that it be ****allowed***.

***Scenario E2 survives. Comment 11047 Q3's anonymous-access clause is superseded.***

Three reasons, in order of weight. First, under Option E there is no retrievable URL at all, so "anyone with the link can view it" describes a capability that v1 does not build. Second, E2 is consistent with the codebase as built: migration `0068:318` explicitly revokes the traceability RPC from `public` and `anon`, and `middleware.ts:10-11` admits only `/login`, `/auth` and `/api/auth` as public prefixes. Q3 would have required reversing both. Third, and decisively, the anonymous-access clause was never the PO's to grant unilaterally: it is a ***new security posture***, and per the AI Tech Lead ruling on this ticket it requires human acceptance before anything is built on it. Critical Rule #18 gives the AI product authority; it does not extend to accepting a first-of-its-kind security risk.

***The Acceptance Criteria field must be rewritten before development starts.*** Every `NEEDS PO/DEV CONFIRMATION` marker is now resolved and must be struck. Specifically:

| AC | Ruling |
| --- | --- |
| ***1.1*** | Confirmed. Strike the marker. "Artifact" is now defined: a downloaded self-contained HTML document. |
| ***1.2**** | Unchanged and already satisfied by shipped behaviour: a foreign-workspace or non-member story id returns ****404***, not 403, per `mapTraceabilityRpcError`'s non-disclosure contract. Write 404 explicitly rather than "403/404". |
| ***2.1*** | Confirmed, and now trivial to verify: re-open the downloaded file after the live chain changes; contents are identical. |
| ***2.2*** | Confirmed: two exports produce two independent files. |
| ***3.1*** | Confirmed. The empty-chain document states in prose that the story had no coverage as of the export timestamp. |
| ***E1**** | Confirmed and ****strengthened***. Under the R2 design this held for 30 days; under this ruling the file is on the recipient's machine and survives indefinitely. Rewrite as: the exported file remains readable after the source story is deleted or archived, with no dependency on Bunkai. |
| ***E2**** | ****Survives, reworded.*** v1 exposes no unauthenticated retrieval path. Rewrite as: an unauthenticated request to the export endpoint is rejected (redirect to login for a browser session, 401 for an API caller), and no anonymous retrieval path for an exported snapshot exists. |
| ***E3*** | Confirmed, unchanged: chain assembly failure produces a clear error and no partial file. |

### 6. Status recommendation, and the follow-up that is NOT being created here

***BK-50 should stay ****`Ready For Dev`****, conditional on the AC field being rewritten per §5 first.**** Its dependency BK-45 is genuinely shipped (merge `f75709e`, verified an ancestor of `origin/staging`), the data source is live, and the corrected scope is materially ****smaller**** than its 5-point estimate: a render function, a route or client handler, a button and a toast, with no migration. Re-pointing the estimate is a planning call, not this pass's. ****This pass deliberately did not transition or reassign the ticket, and wrote no code, migration, or new ticket.***

One follow-up is recommended but ***not created here***, and it must not start until a human accepts its security posture:

> ***Recommended follow-up (not created)******:****** share an exported snapshot by link, without a Bunkai login.*** This restores nothing that Option E removes (the auditor already gets a permanent file with no account); it adds the convenience of pasting a URL into an email rather than attaching a file. It is the story that would create the application's first anonymous data-access surface, and it therefore needs explicit human acceptance of that posture, plus a link-authorization ADR, plus the mandatory controls enumerated in §5 of the AI Tech Lead comment on this ticket. Do not fold it back into BK-50.

### 7. For the next agent reading this ticket

Do not re-derive any of the following. Refute the evidence or follow it.

1. ***"R2 already exists in our stack" is false.*** Verified against `origin/staging@5d1c9df`. R2 is an unprovisioned Sprint-4 external dependency (`master-implementation-plan.md:377-383`).
2. ***Supabase Storage is not the alternative.*** The delivery record's 2026-08-06 ruling fixes the intended blob backend as R2 (`SRS/non-functional-specs.md:54`, `SRS/architecture-specs.md:168-171`); do not overturn that inside an export story.
3. ***The mockup post-dates comment 11047 and governs.*** Download icon, composed filename, confirmation toast, no link anywhere.
4. ***The anonymous-link question is reserved for a human.*** It is not a product call and Rule #18 does not cover it.

---

### Automation for Jira - 8/8/2026, 3:53:48 PM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 8/8/2026, 4:03:13 PM

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---

### Ely - 8/8/2026, 4:04:53 PM

## Ready for QA — BK-50 merged to staging

Merged: [PR #145](https://github.com/upex-galaxy/upex-bunkai-tms/pull/145) → `staging` (merge commit `7b16c0cc4d744966e6a1fdff34bdcf2bf426f213`, verified an ancestor of `origin/staging`).

***What shipped***: the Export snapshot button on the traceability screen (`/projects/{slug}/traceability?story={id}`). Click it and the browser downloads a self-contained HTML document (`trace-<story>-YYYYMMDD-HHMM.html`) containing the full evidence chain as of that moment, with a confirmation toast. Implements Option E from this ticket's own ruling (comments 12238/12239) — no migration, no new route, no storage, no anonymous access.

***Suggested manual checks on staging*** (beyond the automated coverage in `lib/traceability/export-snapshot.test.ts`, 13 tests):

- Export a story with a populated chain (mixed pass/fail ATCs) → open the downloaded file offline, confirm every AC/ATC/test/run/defect visible on screen is present.
- Export a story with zero ACs → confirm the file states the story had no coverage as of the export timestamp (AC3.1), not an empty table.
- Export twice in a row → confirm two independent files with different timestamps in the name.
- Try reaching the export path signed out → confirm login redirect (browser) / 401 (API), same as the existing traceability screen.

Design-plan divergence D26 (filename `.html` vs. the mockup's `.json`) is logged in `.context/design/master-design-plan.md` §5.

---


_Synced from Jira by sync-jira-issues_
