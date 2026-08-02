# Comments for BK-43

[View in Jira](https://jira.upexgalaxy.com/browse/BK-43)

---

### Nahuel Gomez - 6/29/2026, 11:29:24 PM

## Shift-Left QA Refinement — 2026-06-29

### Quality Gaps Found

| Gap | Severity |
| --- | --- |
| Integration mechanism undefined (polling/event/webhook?) | HIGH |
| No Gherkin ACs | HIGH |
| Retry policy undefined | HIGH |
| Field mapping undefined | HIGH |
| Sync on update unaddressed | HIGH |
| Deletion semantics undefined | HIGH |
| Authentication mechanism undefined | MEDIUM |
| Duplicate detection | MEDIUM |

### Open Questions for PO

1. ***Sync on update:*** When a Bunkai bug is edited, should the change propagate to the external tracker?
2. ***Deletion semantics:*** If a Bunkai bug is deleted, should the external issue also be deleted?
3. ***External tracker:*** Confirm Jira Cloud?
4. ***Field mapping:*** severity→priority, module→component, evidence→attachment?

### Open Questions for Dev

1. ***Integration mechanism:*** DB event trigger, pg_cron poller, or event bus webhook?
2. ***Retry policy:*** max retries, backoff formula, permanent failure threshold
3. ***Deduplication key:*** external_id field, content hash, or idempotency key?
4. ***Rate limiting:*** Expected external API limits, 429 backoff strategy
5. ***Auth refresh:*** How does admin update expired credentials?

### ATP DRAFT — 13 outlines

1. TDS01 — New defect auto-syncs
2. TDS02 — Fire-and-forget on network failure
3. TDS03 — Failed sync auto-retried
4. TDS04 — Sync-failed badge + retry button
5. TDS05 — One-way: no reverse sync
6. TDS06 — Workspace without integration — no sync
7. TDS07 — Duplicate prevention
8. TDS08 — Permanent auth failure stops retries
9. TDS09 — Bug update propagates (if confirmed)
10. TDS10 — Deletion does not delete external
11. TDS11 — Rate limit backoff
12. TDS12 — Field mapping accuracy
13. TDS13 — Workspace isolation

Full refinement: `shift-left-bk43.md` in QA repo.

---

### Nahuel Gomez - 7/3/2026, 5:32:24 PM

## QA Refinements (Shift-Left Analysis)

### Quality Gaps Found

| Gap | Severity |
| --- | --- |
| Integration mechanism undefined (polling/event/webhook?) | HIGH |
| No Gherkin ACs | HIGH |
| Retry policy undefined | HIGH |
| Field mapping undefined | HIGH |
| Sync on update unaddressed | HIGH |
| Deletion semantics undefined | HIGH |
| Authentication mechanism undefined | MEDIUM |
| Duplicate detection | MEDIUM |

### Open Questions for PO

1. ***Sync on update:*** When a Bunkai bug is edited, should the change propagate to the external tracker?
2. ***Deletion semantics:*** If a Bunkai bug is deleted, should the external issue also be deleted?
3. ***External tracker:*** Confirm Jira Cloud?
4. ***Field mapping:*** severity→priority, module→component, evidence→attachment?

### Open Questions for Dev

1. ***Integration mechanism:*** DB event trigger, pg_cron poller, or event bus webhook?
2. ***Retry policy:*** max retries, backoff formula, permanent failure threshold
3. ***Deduplication key:*** external_id field, content hash, or idempotency key?
4. ***Rate limiting:*** Expected external API limits, 429 backoff strategy
5. ***Auth refresh:*** How does admin update expired credentials?

### ATP DRAFT — 13 outlines

ATP DRAFT lives in the 🧪 Acceptance Test Plan (ATP) field. Covers 13 outlines (7 positive, 4 negative/error, 2 boundary). Full detail in customfield_10067.

---

### Nahuel Gomez - 7/10/2026, 8:25:35 PM

## Estimation Completed

***Story Points:*** 1 SP
***Rationale:*** Shift-left refinement complete (13 AC outlines across 4 categories: 7 positive, 4 negative/error, 2 boundary). Low complexity — one-way sync integration with existing defect filing workflow (BK-40). ATP published to field.

***Estimated by:*** Nahuel Gomez
***Date:*** 2026-07-10
***Next:*** Ready For Dev

---

### Nahuel Gomez - 7/10/2026, 8:57:55 PM

## Estimation Completed

***Story Points******:*** 1 SP
***ATP******:*** Published to field (26 outlines)
***Rationale******:*** Shift-left refinement complete. Low complexity — one-way sync integration.

***Estimated by******:**** Nahuel Gomez | ****Date******:*** 2026-07-10

---

### Nahuel Gomez - 7/22/2026, 9:01:24 PM

## Automation — 14 KATA ATCs written

14 Test issues created and linked to [BK-43](https://jira.upexgalaxy.com/browse/BK-43) with KATA-compliant automated tests in the QA engineering repo:

| Test | ATC | Scenario | Status |
| --- | --- | --- | --- |
| [BK-234](https://jira.upexgalaxy.com/browse/BK-234) | TDS01 | New defect auto-syncs | Candidate |
| [BK-235](https://jira.upexgalaxy.com/browse/BK-235) | TDS02 | Fire-and-forget on network failure | Candidate |
| [BK-236](https://jira.upexgalaxy.com/browse/BK-236) | TDS03 | Failed sync auto-retried | Candidate |
| [BK-237](https://jira.upexgalaxy.com/browse/BK-237) | TDS04 | Sync-failed state | Candidate |
| [BK-238](https://jira.upexgalaxy.com/browse/BK-238) | TDS05 | One-way: no reverse sync | Candidate |
| [BK-239](https://jira.upexgalaxy.com/browse/BK-239) | TDS06 | Workspace without integration | Candidate |
| [BK-240](https://jira.upexgalaxy.com/browse/BK-240) | TDS07 | Duplicate prevention | Candidate |
| [BK-241](https://jira.upexgalaxy.com/browse/BK-241) | TDS08 | Permanent auth failure stops retries | Candidate |
| [BK-242](https://jira.upexgalaxy.com/browse/BK-242) | TDS09 | Bug update propagates | Candidate |
| [BK-243](https://jira.upexgalaxy.com/browse/BK-243) | TDS10 | Deletion does not delete external | Candidate |
| [BK-244](https://jira.upexgalaxy.com/browse/BK-244) | TDS11 | Rate limit backoff | Candidate |
| [BK-245](https://jira.upexgalaxy.com/browse/BK-245) | TDS12 | Field mapping accuracy | Candidate |
| [BK-246](https://jira.upexgalaxy.com/browse/BK-246) | TDS13 | Workspace isolation | Candidate |
| [BK-247](https://jira.upexgalaxy.com/browse/BK-247) | TDS14 | External link back to Bunkai | Candidate |

All tests are tagged `@critical @defect-sync` and included in the CI regression + smoke pipeline. Results auto-sync to Xray via AUTO_SYNC.

***Next:*** When the Defect Sync API ships to staging, run the regression suite — results will flow to Xray and flip these tests from Candidate to Automated.

PR: https://github.com/nelgoez/bunkai-qa-engineering/pull/1

---

### Nahuel Gomez - 7/22/2026, 9:26:10 PM

## PR #1 Merged — Automation Code on `main`

14 KATA ATCs now on the default branch. CI pipeline green (including pre-existing [BK-169](https://jira.upexgalaxy.com/browse/BK-169) fix).

| Key | Status | QA Assignee |
| --- | --- | --- |
| [BK-234](https://jira.upexgalaxy.com/browse/BK-234) — [BK-247](https://jira.upexgalaxy.com/browse/BK-247) | Candidate → AUTOMATED (once feature ships) | Ely |

***Next:*** Once [BK-43](https://jira.upexgalaxy.com/browse/BK-43) defect sync endpoints deploy to staging, running regression will execute these ATCs and sync results to Xray automatically.

---

### Ely - 7/30/2026, 1:28:25 PM

Mockup — Bug detail — Jira sync status states. Source: .context/designs/bunkai-test-management-tool/bk-31-bug-reports/bug-detail.html · spec: master-design-plan §4.6



---


_Synced from Jira by sync-jira-issues_
