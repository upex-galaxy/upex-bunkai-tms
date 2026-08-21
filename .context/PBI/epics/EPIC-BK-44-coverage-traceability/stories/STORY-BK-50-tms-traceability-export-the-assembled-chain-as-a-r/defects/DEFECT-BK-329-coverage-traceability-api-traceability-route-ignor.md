# DEFECT: Coverage & Traceability API: traceability route ignores the {projectId} path segment — any well-formed UUID returns the story chain

**Jira Key:** [BK-329](https://jira.upexgalaxy.com/browse/BK-329)
**Related Story:** [BK-50](https://jira.upexgalaxy.com/browse/BK-50) - TMS-Traceability | Export the assembled chain as a read-only snapshot
**Priority:** Low
**Status:** Closed
**Components:** Bunkai Traceability
**Severity:** Menor
**Fix Type:** Bugfix

---

## Description

***SUMMARY***

The traceability route accepts any well-formed UUID in its `{projectId}` path segment and answers with the requested story's full evidence chain, without ever checking that the story actually belongs to that project. A URL that asserts "project A" returns a story from project B. Found while testing BK-50 (Export snapshot), which reuses this route verbatim, so an exported snapshot can be produced from a URL that misstates its own project provenance.

This is ***not a proven cross-tenant data leak*** — the story itself remains RLS-scoped to the caller, and BK-45's DB-integration isolation suite (11/11) covers the foreign-workspace case. What is broken is the route's stated contract and its defence-in-depth posture: the project segment is decorative, so an authorization bug in the story-scoping layer would have no second gate behind it.

---

***STEPS TO REPRODUCE***

#### Step 1 - Precondition

Authenticated as a workspace member (Owner role) on staging. Note the real project UUID `129cbc2a-2f0e-432b-bd47-daea87a7a764` and the seeded story `d57804e8-d614-445e-b707-8c25d9ca5dac` that belongs to it.

#### Step 2 - Action

From the authenticated browser session, request the traceability route with a project UUID that exists nowhere in the database:

```
GET /api/v1/projects/11111111-2222-4333-8444-555555555555/traceability?story=d57804e8-d614-445e-b707-8c25d9ca5dac
```

#### Step 3 - Observe

The response is `200 OK` carrying the full chain for the story — title, criteria, ATCs, tests, latest runs and defects — exactly as if the correct project UUID had been supplied.

#### Step 4 - Contrast

The same route DOES validate the segment's shape: passing a slug instead of a UUID returns `400 bad_request` with `"Project id must be a UUID."`. So the parameter is parsed and format-checked, then discarded.

---

***TECHNICAL ANALYSIS***

- ***Route***: `GET /api/v1/projects/{projectId}/traceability` — shipped in BK-45, reused unchanged by BK-50's export
- ***Observed****: `projectId` is validated for UUID **shape* only; no ownership check ties it to `user*stories.project*id`
- ***Scoping today***: appears to rest entirely on the story lookup and its RLS policy
- ***Network***: reproduced 2/2 from the authenticated session
- ***Console***: no errors
- ***Counter-check****: the **UI* route behaves correctly — `/projects/does-not-exist-slug/traceability?story=<id>` returns `404` and renders no chain. The gap is API-only.

---

***IMPACT***

- No confirmed data exposure: the caller can already read the story the route returns, and cross-workspace access stays blocked.
- Defence-in-depth is reduced to a single gate. The project segment reads like an authorization boundary in the URL and in the OpenAPI contract, but enforces nothing.
- Provenance of an exported snapshot is weakened: BK-50's document prints "workspace / project" in its header, and that project label can be sourced from a URL that has no relationship to the story.
- Cross-project isolation **within one workspace** cannot be verified by QA on staging today — the workspace holds a single project — so the only evidence for that case is the DB-integration suite, not an end-to-end check.

---

***SUGGESTED FIX***

Reject the request with the existing uniform `404 not*found` / `"User story not found."` response when the story's `project*id` does not match the `{projectId}` path segment. Reusing the same non-disclosure message keeps the existing uniformity property intact and adds no new information channel.

---

***RELATED STORIES***

- Found during: BK-50 (Export the assembled chain as a read-only snapshot)
- Originates in: BK-45 (Render full US to bug evidence chain in one read) — the route is BK-45's, unchanged by BK-50
- Blocks: none — non-blocking, BK-50 sign-off is not gated on this

---

## Related Issues

- causes: [BK-50](https://jira.upexgalaxy.com/browse/BK-50) - TMS-Traceability | Export the assembled chain as a read-only snapshot

---

## Metadata

- **Created:** 8/9/2026
- **Updated:** 8/10/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia
- **Labels:** api, defect, exploratory-testing, traceability

---

_Synced from Jira by sync-jira-issues_
