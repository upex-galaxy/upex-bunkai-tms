# Comments for BK-498

[View in Jira](https://jira.upexgalaxy.com/browse/BK-498)

---

### Automation for Jira - 8/19/2026, 3:17:54 PM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Ely - 8/19/2026, 4:04:15 PM

## AI Product Owner — Decision: does the import workflow need both scopes, now that reads are gated on `atc:read`?

> ***Attribution.**** Produced by the ****AI Product Owner / Business Analyst**** profile under CLAUDE.md Critical Rule #18. This is ****not*** a human sign-off and is not styled as one.

### The question, surfaced during BK-498's code review

The ratified verb mapping gates `POST /api/v1/imports` on `atc:write` and `GET /api/v1/imports/{id}` on `atc:read`. Those are the two halves of one workflow: the POST returns `202` plus a job id, and the GET is the only way to learn whether that job succeeded.

So a token scoped ***exactly*** `atc:write` — the shape AC-01 explicitly blesses — can start an import and then receives `403` polling its own job. Nothing is broken, but a real CI caller would hit it.

### Decision

***Keep the ratified verb mapping unchanged. Document the requirement instead.**** An import client needs `atc:read` ****and*** `atc:write`.

### Alternatives scored

| # | Candidate | Consistency with ratified rule | Product friction | Impl cost | Reversibility | Risk | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Keep verb mapping; document that import callers need both scopes**** | ****5**** | ****3**** | ****5**** | ****5**** | ****5**** | ****23*** |
| B | Let the status read accept `atc:read` OR `atc:write` | 2 | 5 | 1 | 3 | 2 | 13 |
| C | Gate the status read on `atc:write` (treat it as part of the write workflow) | 1 | 4 | 4 | 4 | 2 | 15 |

***B rejected on cost and mechanism.**** `WithApiHandlerOptions` declares `requires: NonEmpty<Capability>`, and the gateway loops `requireCapability` over every entry — the semantics are ****AND***, not OR. There is no any-of form, so B is not a per-route decision at all: it is a change to the capability machinery BK-497 just ratified, which would reopen a settled design in a story whose Out of scope explicitly excludes "the posture-declaration machinery itself".

***C rejected on contract grounds.*** `app/qa/qa-config.ts:625` publishes `atc:read` to QA as the scope covering reads across this domain. Gating one read on `atc:write` because of the workflow it happens to belong to makes the published vocabulary non-predictable — a caller could no longer infer a route's scope from its verb, which is the whole value of the ratified mapping.

***A chosen.**** The friction is real but small and bounded: `DEFAULT*PAT*SCOPES` (`lib/api/pat.ts`) mints `atc:read` + `atc:write` + `run:execute`, so every default token already satisfies both halves. Only a ****deliberately*** narrowed `atc:write`-only token is affected, and a caller narrow enough to do that deliberately is narrow enough to read which scopes the endpoints document. As of this Story both endpoints now state their required scope in the OpenAPI spec, so the requirement is discoverable rather than folklore.

### Consequence recorded for follow-up

This is the one place in the authoring domain where a single user-facing workflow spans both scopes. It is ***not*** a defect and does not block BK-498. Recorded here so that whoever writes the PAT-scope guidance for QA (and BK-499, which owns the remaining read routes) states plainly that an automation client driving imports end to end must be minted with both `atc:read` and `atc:write`.

---

Decided autonomously by the AI Product Owner / Business Analyst profile under CLAUDE.md Critical Rule #18, after scoring three alternatives against the ratified enforcement-shape ruling on BK-262 and the scope vocabulary published at `app/qa/qa-config.ts:625`. No human sign-off is implied or claimed.

---

### Automation for Jira - 8/19/2026, 4:06:11 PM

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---

### Ely - 8/19/2026, 4:12:27 PM

## Ready for QA — BK-498 merged to `staging`

@[Luis Eduardo Flores Villarroel](6305712749a5c6754d910401) — assigning to you as the QA owner who authored the shift-left refinement this Story inherits (the 2026-08-14 review on BK-262).

| | |
| --- | --- |
| PR | [#186](https://github.com/upex-galaxy/upex-bunkai-tms/pull/186) — merged via merge commit `0becadc` |
| Branch | `feature/BK-498-enforce-capability-scopes-authoring-domain` |
| Merged to | `staging` (ancestry verified, not just PR-reported) |
| Migration | ***none*** — the four-scope vocabulary is unchanged and no minted token is invalidated |

### What changed, in one line

All 22 authoring-domain handlers now require a capability: writes need `atc:write`, reads need `atc:read`. Until this merge they required none, so a read-only token could create and delete authoring content.

### What to test

The behaviour change is visible ***only to Personal Access Tokens***, and only to deliberately narrowed ones. A browser session carries the full capability set and is unaffected — worth confirming that first, since it is the regression that would hurt most.

| Scenario | Expected |
| --- | --- |
| PAT scoped exactly `atc:write` creates a module | `201` |
| PAT scoped exactly `atc:read` creates a module | `403`, and ***no module is created*** |
| PAT scoped `atc:write`, no workspace binding, user is an active member | `201` |
| PAT scoped `atc:read` lists a module's user stories | `200` |
| PAT scoped only `atc:write` lists a module's user stories | `403` |
| Browser session does any of the above | unchanged — full capability set |

Tokens minted through the UI get `DEFAULT*PAT*SCOPES` (`atc:read` + `atc:write` + `run:execute`), so a default token loses nothing. You need a deliberately narrowed token to observe the gate.

> [!NOTE]
> One workflow spans both scopes: `POST /api/v1/imports` needs `atc:write` but polling `GET /api/v1/imports/{id}` needs `atc:read`, so an import client must hold both. This was reviewed and deliberately kept — see the AI Product Owner decision comment above. Both endpoints now state their required scope in the OpenAPI spec.

### Evidence shipped with the change

`lib/api/capability-enforcement.test.ts` drives the real exported handlers with real minted PATs against the live database and reads rows back through an independent client, so the negative cases prove a 403 ***and*** that nothing was written. `lib/api/route-capability-coverage.test.ts` additionally holds all 22 handlers to the verb mapping, so a future edit flipping a write to `atc:read` fails the suite rather than being silently recorded.

### Known limitation, disclosed rather than hidden

The DB-integration suite is credential-gated (`describe.skip` without Supabase env) — the standing constraint recorded in the BK-262 Tech Lead ruling and ADR-0012. It was executed against the live database during this run and passed, but a CI run without credentials would report green having executed none of it.

### Out of scope here

Read, identity, notification and workspace routes are ***BK-499***, which is still `Backlog`. BK-499 must merge after this one: both rewrite `lib/api/route-capability-coverage.snapshot.json`, whose test asserts exact array equality.


---


_Synced from Jira by sync-jira-issues_
