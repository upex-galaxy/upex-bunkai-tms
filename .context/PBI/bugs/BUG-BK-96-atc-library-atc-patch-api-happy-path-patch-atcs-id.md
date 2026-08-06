# BUG: ATC Library: ATC PATCH API: Happy-path PATCH /atcs/{id} returns 412 instead of 200 though the edit commits

**Jira Key:** [BK-96](https://jira.upexgalaxy.com/browse/BK-96)
**Priority:** High
**Status:** Closed
**Components:** ATC Library (Acceptance Test Cases)

---

## Description

## Summary

The happy-path edit endpoint `PATCH /api/v1/atcs/{id}`, called with the ***correct**** `If-Match` precondition (the ATC's current version), returns ****HTTP 412 PRECONDITION*************FAILED**** instead of the documented ****200****. The response is a non-JSON platform error page with no JSON error envelope and no `request*id`. Critically, the update still ****commits in full*** server-side: the version increments, the title updates, steps are cascade-replaced, assertions are cleared, and an `atc.updated` event is logged. So the client is told the edit failed while the database shows it succeeded.

## Steps to Reproduce

1. ***Precondition*** — authenticate with a PAT carrying scope `atc:write`. Create an ATC via `POST /api/v1/atcs` (it returns at version 1). Use ATC `51dc234f-2cb1-44d6-8372-87e07f8f7854` (version 1 at request time).
2. Send `PATCH /api/v1/atcs/51dc234f-2cb1-44d6-8372-87e07f8f7854` with header `If-Match: 1` (the correct current version) and a body that changes the title, sets 2 steps, and omits assertions.
3. Observe the HTTP response: ***412 PRECONDITION******_******FAILED***, a non-JSON platform error page (`gru1::iad1::qqg6j-...`).
4. Query the database for the same ATC: version is now ***2****, title is updated, `atc*steps` is ****2**** (cascade-replaced from 3), `atc*assertions` is ****0*** (cleared), and a new `atc.updated` row exists in `activity_log`.
5. Corroboration: a subsequent `PATCH` with the now-stale `If-Match: 1` returns ***409 conflict*** with `details.current_version: 2`, independently proving the update from step 2 advanced the version.

## Root-cause hypotheses

1. The `If-Match` precondition handler in `app/api/v1/atcs/[id]/route.ts` mis-evaluates a **matching** version as a precondition failure — e.g. it compares `If-Match` against the post-increment version, or runs the check after (or independently of) the RPC commit.
2. Vercel edge intercepts the `If-Match` request header and returns a 412 around the function, after the function body has already committed the mutation.

## Impact

- A contract-following client treats a successful edit as a failure and may retry — causing a double-apply or a 409 on the retry. PATCH cannot be trusted by any well-behaved consumer.
- ***Blocks BK-19*** (ATC builder UI — will surface the edit as failed to users).
- ***Blocks BK-21 / BK-23*** (downstream flows that PATCH ATCs).
- Data integrity itself is intact; only the HTTP response status and success body are wrong.

## Related Stories

- Related to: BK-18 (ATC create/edit REST API — story under test)
- Blocks: BK-19, BK-21, BK-23
- ATP: BK-94 · ATR: BK-95

## Evidence

- `evidence/h2-patch-412-bug.md` — full request/response + before/after DB table
- `evidence/h2-patch-response.json` — raw 412 response captured from the client
- `evidence/db-final.txt` — DB state confirming version 2 + cascade replace + `atc.updated`

---

## Related Issues

- relates to: [BK-18](https://jira.upexgalaxy.com/browse/BK-18) - TMS-ATC API | Create and edit ATCs with steps and assertions

---

## Metadata

- **Created:** 6/8/2026
- **Updated:** 6/26/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** api, atc, bug

---

_Synced from Jira by sync-jira-issues_
