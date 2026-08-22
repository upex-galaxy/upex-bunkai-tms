# BUG: Run-linked bug filing: Report bug dialog seeds the step evidence_url unfiltered, so a legacy non-http(s) value 422s on a field the tester never touched

**Jira Key:** [BK-500](https://jira.upexgalaxy.com/browse/BK-500)
**Priority:** Medium
**Status:** Ready For QA
**Components:** None
**Severity:** Moderada
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

The run-linked "Report bug" dialog seeds its first evidence row with the failing step's stored `evidence*url` ***without applying any scheme filter***. When that stored value carries a non-`http(s)` scheme, the tester's very first submit is rejected by the server with a generic `Invalid URL` error pointing at `evidence*urls` — a field the tester never typed into.

This is the adjacent defect that BK-466's own close-out comment named and deferred:

> `lib/runs/report-bug-view.ts:58` seeds an unfiltered legacy `javascript:` URL — adjacent defect, separate ticket.

BK-466 fixed the ***render**** path (the anchor's `href`). This is the ****prefill*** path. Different function, different failure, still open.

## Steps to reproduce

1. Have a run step whose `evidence_url` was stored with a non-`http(s)` scheme. This is not hypothetical: `lib/bugs/validation.ts` tightened filing-time validation only under BK-337 (TQ5), and its own comment states the render-time allowlist "stays the load-bearing control for ***rows already stored before this tightened***". There is no DB `CHECK` constraint on the column, an accepted residual risk recorded on BK-466.
2. Fail that step in the runner.
3. Click ***Report bug*** on the failed step.
4. Submit the dialog without touching the evidence field.

## Expected Result

The dialog seeds only evidence values that can pass the filing-time schema. A stored value the server will reject is filtered out at seed time — the same way `isHttpUrl` (`lib/utils/url.ts`) already gates every URL the tester types via `addEvidence` (`components/bugs/BugFormDialog.tsx:102`).

## Actual Result

The dialog seeds the raw value. Submit fails with a validation error on `evidence_urls`, a field the tester never edited, and the message does not say which row or why.

## Root cause

`lib/runs/report-bug-view.ts:58`

```ts
evidenceUrls: stepEvidenceUrl ? [stepEvidenceUrl] : [],
```

No allowlist is applied. The raw DB value arrives from `components/runs/RunnerView.tsx:339-342` (`stepEvidenceUrl: bugDialogStep.step.evidence_url`), is seeded into state unvalidated at `components/bugs/BugFormDialog.tsx:82`, and is posted verbatim at `:139`. The server then correctly rejects it at `lib/bugs/validation.ts` (`z.array(z.url({ protocol: z.regexes.httpProtocol }))`).

The asymmetry is the defect: ***typed**** input is filtered by `isHttpUrl`, ****seeded*** input is not.

## Reproduction evidence

Executed against the real production functions — no mocks, no fixtures. `buildReportBugPrefill` and `BugRunLinkedCreateBodySchema` are the same units the runner and the API route use.

```
1. buildReportBugPrefill() seeded evidenceUrls = ["javascript:alert(document.cookie)"]
2. server validation success = false
3. REJECTED field=evidence*urls.0 code=invalid*format msg=Invalid URL
4. control (http evidence) success = true
```

Line 4 is the control: an `https:` evidence URL through the identical path passes. Only the seeded non-`http(s)` value fails.

## Impact

Blocks the first submit of the run-linked bug-filing flow for any affected step. Recoverable — the tester can delete the seeded evidence row and resubmit — so this is a confusing-but-recoverable failure rather than a hard block, on the primary path of BK-40 ("File a defect from a failing run step").

## Suggested fix

Apply the existing `isHttpUrl` allowlist at seed time in `buildReportBugPrefill`, mirroring the gate already used for typed input. No new abstraction needed; the helper exists at `lib/utils/url.ts`.

## Filing provenance

Filed by the scheduled `bug` delivery routine under the `autonomous-delivery` skill's citation gate (`SKILL.md:45`, anti-pattern A28). All four citation limbs recorded: live reproduction above; two differently-worded backlog searches (`summary ~ "prefill"`, `summary ~ "report bug"`, both scoped to Bug/Defect/Improvement) returning zero matches; root cause at `lib/runs/report-bug-view.ts:58`; expected behaviour quoted from BK-466's close-out comment and from `lib/bugs/validation.ts`. Per A28 the filing run may not implement this defect — it is left for a later run so the QA retest remains a real checkpoint.

---

## Metadata

- **Created:** 8/17/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
