# Comments for BK-262

[View in Jira](https://jira.upexgalaxy.com/browse/BK-262)

---

### Ely - 8/11/2026, 6:15:45 PM

## AI Tech Lead — Refinement input: the design questions on this story are already decided (on BK-97)

Posted by the autonomous `bug` delivery routine on 2026-08-11. This story carried ***no comments***, so the
two published rulings it depends on were invisible to whoever picks it up. Nothing here is a new decision —
this is a pointer plus a fresh measurement, so the refinement does not re-derive what is already settled.

### Where the decisions live

Both were decided under CLAUDE.md Critical Rule #18 and published on ***BK-97***, the Improvement this story
supersedes in scope:

| Question | Ruling | Where |
| --- | --- | --- |
| Which capability vocabulary? | ***Keep the existing four scopes**** (`atc:read`, `atc:write`, `run:execute`, `workspace:admin`) and redefine their reach. Zero DB — the CHECK at `0008*access*tokens.sql:33-36` is untouched and no minted token is invalidated. | BK-97 comment `12194` — **AI Product Owner — Decision***:**** PAT capability vocabulary** |
| How is enforcement shaped? | ***Enforce at each ****`withApiHandler`**** call site****, and make the declaration structurally unskippable by tightening `WithApiHandlerOptions` (`lib/api/handler.ts:40-49`) from `requires?: string[]` into a mandatory discriminated union over four auth postures, backed by a filesystem-driven coverage snapshot test. ****No migration.**** Ships as a ****five-slice chain****, not one PR. | BK-97 comment `12195` — **AI Tech Lead — Decision***:**** enforcement shape** |

> ***NOTE:**** The "Open product decision (do this first)" section in BK-97's description is ****stale*** — that question
was closed by ruling `12194`. Read the rulings before re-opening either question.

### Current-state measurement (2026-08-11, read from code, not from comments)

Ruling `12195` measured the surface on 2026-08-06 as 63 route files / 81 handlers / a 48-handler gap.
Re-measured today against `origin/staging`:

| Metric | Count |
| --- | --- |
| Exported handlers using `withApiHandler` | 82 (across 64 route files) |
| Declaring a non-empty `requires: [...]` | 25 |
| Omitting `requires` entirely — ***no capability check at all*** | 49 |
| `auth: 'public'` (no principal resolved) | 8 |
| Bypassing the gateway by design (`app/api/openapi/route.ts`) | 1 |

The gap is ***still open and has grown by one handler*** since the ruling was written. The mechanism, quoted:
`lib/api/handler.ts:75-82` iterates `options.requires ?? []`, so an omitted `requires` performs zero scope
checks. `lib/api/principal.ts:66-73` gives a cookie caller the full `ALL_CAPABILITIES` set while `:49-58`
gives a PAT caller exactly its token scopes — which is why the gap only affects tokens, never sessions.

### One thing the AC should account for

There is ***no regression test*** for an under-scoped PAT on a non-ATC route. The suite currently asserts the
opposite: `app/api/v1/projects/[id]/traceability/route.test.ts:127-134` mints a PAT scoped only
`['atc:write']`, POSTs to the non-ATC route `modules/[id]/user-stories`, and expects ***201***. That test
encodes today's gap as intended behaviour, so it has to be updated as part of this story rather than left
green — otherwise the fix lands and a passing suite still describes the old contract.

### Status note

This story is ***unassigned*** and has been in `Shift-Left QA` since 2026-08-02. The `bug` routine cannot take
it (story-shaped: five slices, 49 capability decisions, a type change touching all 82 call sites — see BK-97
comment `12203`), and it does not author shift-left refinement itself. It needs a QA owner assigned to
finish refinement before `/sprint-development` can pick it up.

---

Posted by the autonomous `bug` delivery routine. This is an AI Tech Lead pointer to existing rulings, not
human sign-off, and not a new decision.

---


_Synced from Jira by sync-jira-issues_
