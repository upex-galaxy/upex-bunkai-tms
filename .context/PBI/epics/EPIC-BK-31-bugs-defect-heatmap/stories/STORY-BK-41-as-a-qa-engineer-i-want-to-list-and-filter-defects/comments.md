# Comments for BK-41

[View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

---

### jesusgpythondev - 6/27/2026, 3:52:33 PM

***[ SHIFT-LEFT REFINED ]***
***[ CURRENT STATUS: ESTIMATION ]***

> ***SUCCESS:*** [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) is refined and ready for estimation from QA perspective. Current Jira status is Estimation. PO/Dev still own estimation and Ready For Dev.

## QA Handoff Mirror - [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41)

***Executive summary:*** [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) was refined from 7 DoD bullets into 8 Gherkin ACs, 6 contract decisions, and a 16-row ATP outline. Main value: QA can focus on defects in an active module subtree without wading through unrelated defects.

| ***Refinement Delta**** | ****Result*** |
| --- | --- |
| Contract decisions | 6: aggregates in response, recursive module subtree, live aggregation, bugs:read + RLS, empty-state 200, archived modules hidden by default |
| AC reconciliation | 7 original DoD bullets + 1 expert decision mapped to 8 Gherkin scenarios |
| High risks | 1 High risk: subtree correctness; covered by AC-2 + ATP-2 |
| ATP rows | 16 outline rows: positive, negative, boundary, integration, API |
| Open confirmations | None. Senior PO expert resolved archived-module default as hide-by-default, reversible with future include_archived=true. |

## Key Contract Decisions

| ***Decision**** | ****Evidence*** |
| --- | --- |
| GET /api/v1/bugs must return data plus aggregates.by*severity and aggregates.by*status | Source FR BK-026 + [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) DoD |
| Aggregates count the full filtered set, not only the current page | Expert panel decision |
| Module subtree uses recursive traversal via parent*module*id, not prefix-match on slug path | Repo tree model warning |
| Auth uses PAT scope bugs:read and RLS via project_membership | Repo API pattern |
| Empty state is 200 + [] + zeroed aggregates | UX + QA decision |
| Archived module defects hidden by default | Senior PO expert decision; now mirrored in AC scenario |

## ATP Draft Summary

| ***Positive**** | ****Negative**** | ****Boundary**** | ****Integration**** | ****API**** | ****Total*** |
| --- | --- | --- | --- | --- | --- |
| 6 | 5 | 4 | 2 | 16 | 16 |

## Risk Summary

| ***Risk**** | ****Severity**** | ****Coverage*** |
| --- | --- | --- |
| Subtree traversal correctness at depth 6 | :red_circle: High | AC-2 + ATP-2 |
| Aggregates drift with pagination | :large*orange*circle: Medium | AC-6 + ATP-7 |
| Cross-project IDOR / aggregate leak | :large*orange*circle: Medium | ATP-9 |
| [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) schema dependency | :large*orange*circle: Medium | Dev readiness gate |

> ***WARNING:*** Dev readiness is conditional: [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) should start after [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) ships the bugs schema and POST /bugs contract. [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) must not duplicate or own BK-40's migration.

## QA Story Points Recommendation

- Recommendation: 2 SP
- Confidence: 0.70
- Basis: effort=Med; complexity=Med; uncertainty=Low; risk=Low
- Rationale: read-only endpoint, but subtree CTE + aggregates + RLS/IDOR validation make Jira's current 1 SP optimistic.
- Re-estimation triggers: status transitions added to scope; [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) schema slips; subtree helper must be built from scratch; aggregates/pagination contract changes.
- Boundary: QA recommendation only; Jira Story Points / Epic / User Story fields remain canonical unless explicitly updated.

## Out of Scope

- Defect filing: [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40)
- Defect heatmap: FR 7.4 / separate Story
- Jira sync: FR 7.5 / separate Story
- Defect lifecycle transitions: future Story

## Publication Status

| ***Item**** | ****Status*** |
| --- | --- |
| Refined AC field | {status:green | PUBLISHED} |
| Archived-module AC patch | {status:green | PUBLISHED} |
| ATP Draft field | {status:green | PUBLISHED} |
| QA mirror comment | {status:green | UPDATED} |
| Labels | {status:green | APPLIED} |
| Story transition | {status:blue | CURRENTLY ESTIMATION} |

---

### Ely - 7/22/2026, 8:16:49 PM

@@jesusgpythondev Confirmó derivar esta US a @@micaelavirgagarcia para que se encargue del Testing.

---

### Ely - 7/30/2026, 1:28:17 PM

Mockup — Bug Reports index (List/Heatmap views). Source: .context/designs/bunkai-test-management-tool/bk-31-bug-reports/bug-reports-index.html · spec: master-design-plan §4.6



---

### Ely - 8/1/2026, 7:20:00 PM

## PO + Dev Ratification — explicit live authorization, 2026-08-01

Delegated by Ely (project owner) in a live conversation on 2026-08-01, NOT a blanket forward-dated batch comment. AI-authored, grounded in the evidence cited below. Answers are decisive engineering/product calls, not placeholders.

> ***INFO:*** The prior QA shift-left refinement (8 Gherkin ACs, business rules, ATP-16) is solid and stays as-is. This pass closes the six items that refinement could not resolve on its own: dependency readiness, two real API-contract gaps against the shipped codebase, and three product decisions the mockup answers but the AC never captured.

### 1. Is the BK-40 dependency actually cleared?

***Decision******:****** Yes — cleared. BK-41 can proceed to ****`/sprint-development`**** with no dependency blocker.***

`supabase/migrations/0046*bugs.sql` (the `bugs` table, its RLS policies, `bunkai*create*bug`, and `bunkai*list*project*bugs`) is present on `origin/staging` as of commit `f2188e8` ("fix(BK-40): address final-assembly review findings before the staging PR"). BK-40 itself is at Jira status ***Ready For QA*** — past Dev, In Progress, and In Review. The "Dev gate" note in the QA mirror comment is satisfied, not merely asserted.

### 2. GET /api/v1/bugs — what actually gates access?

***Decision******:****** ****`auth: 'required'`****, no PAT scope requirement. Drop "PAT scope ****`bugs:read`****" from the AC — that scope does not exist.***

`lib/api/pat.ts`'s `AccessTokenScope` union is exactly `'atc:read' | 'atc:write' | 'run:execute' | 'workspace:admin'`. There is no `bugs:read` scope anywhere in the codebase (`app/api/v1/auth/confirm/route.ts`'s `pat_scopes` enum confirms the same four values). The refined AC's "Auth uses PAT scope bugs:read" line describes a scope that was never implemented — it must not survive into Stage 1 planning as a real requirement.

The correct model mirrors the two closest sibling read-list endpoints, both already shipped: `GET /api/v1/activity` and `GET /api/v1/tests/{id}/runs` — cookie session or Bearer PAT, ***no scope requirement***. Adding a new `bug:read`-style scope would mean extending the `AccessTokenScope` enum for a read-only list endpoint when no sibling list endpoint needs one; that's scope creep this story doesn't need.

### 3. RLS / authorization shape for the new list query

***Decision******:****** build BK-41's list path as ****`SECURITY INVOKER`**** over the existing RLS policy, not as a new Path-A ****`SECURITY DEFINER`**** function with an actor parameter.***

This is a hard-invariant question per `.context/ADR/ADR-0012` and `.claude/skills/sprint-development/references/rpc-authorization.md`: any `SECURITY DEFINER` function taking a caller-supplied identity/scope parameter needs an actor bind **and** separate result scoping, both proven by a DB-integration test — and the reference's own first preference is to avoid the class entirely by using `SECURITY INVOKER` where possible.

Two concrete facts make the call for BK-41 specifically:

- `0046*bugs.sql`'s own header says outright: **"the **`limit 200`** below is a defensive cap on an otherwise-unbounded query, not a real pagination contract — ******BK-41 replaces this RPC**** with proper keyset pagination + filters."** BK-41's list path is greenfield, not an edit to `bunkai*list*project*bugs`.
- The RLS policy it needs already exists and is already correct: `bugs*select*workspace*member` (`0046*bugs.sql`, "any active workspace member"). ADR-0012 names `bunkai*list*activity` (`0045*activity*stream.sql`) as the worked exemplar of exactly this shape — `SECURITY INVOKER`, no actor parameter, RLS does the scoping — and `GET /api/v1/activity` is the closest shipped precedent for a filtered, paginated, workspace-scoped list.

Building BK-41 as INVOKER removes the actor-bind/result-scoping bug class by construction instead of asking a reviewer to catch it — which is the same class ADR-0012 documents shipping live once already (BK-49) and pre-merge once on BK-40 itself. The exact SQL still goes through Stage 1's six-question checklist (`rpc-authorization.md` §4) before any migration is written; this ratifies the **direction**, not the final function signature.

### 4. Pagination contract

***Decision******:****** adopt the exact contract ****`GET /api/v1/activity`**** and ****`GET /api/v1/tests/{id}/runs`**** already use — ****`lib/pagination/keyset-cursor.ts`****.***

`?limit=<1..50>`, optional, default 30. `?cursor=<opaque>`, optional page token from the previous response's `next_cursor`; a malformed cursor is a 400, never a silent first page. No field in the current AC/business-rules/scope states a default or max — ATP-14 gestures at "limit > 100" but that number appears nowhere else and doesn't match any shipped endpoint. Standardizing on the platform's existing 1–50/default-30 contract keeps `/bugs` consistent with its two closest siblings instead of inventing a third pagination shape.

### 5. Default list sort order

***Decision******:****** severity ascending (P1 → P4), then most-recent-first as the tiebreak. Not user-configurable in v1.***

No AC, business rule, or DoD bullet specifies a sort order — a genuine gap. `bug-reports-index.html` (the frozen mockup, `master-design-plan.md` §4.6) settles it in its own render logic: `filteredBugs().sort((a, b) => a.sev.localeCompare(b.sev) || a.age - b.age)`. That is the only source of truth available, and per CLAUDE.md's design-fidelity rule the mockup's behavior is the contract absent an AC that overrides it. The mockup exposes no sort control, so this stays fixed, not a query parameter, for this story.

### 6. Status and severity filters — single-select or multi-select?

***Decision******:****** multi-select, OR-within-field, AND-across-fields. This is a real AC gap, not just a documentation nit.***

All 8 shipped Gherkin scenarios exercise only single-value `status=` and `severity=` filters. But the mockup's own filter state is a `Set` per field (`state.statuses`, `state.sevs`), driven by toggle chips, and its `list-filtered` demo preset applies `statuses: ["open", "in_progress"]` ***and*** `sevs: ["P1", "P2"]` simultaneously — i.e., "give me open OR in-progress bugs, that are also P1 OR P2." `filteredBugs()`'s predicate confirms OR-within-field: `state.statuses.size === 0 || state.statuses.has(b.status)`.

The wire contract: `status=open,in_progress&severity=P1,P2` (comma-separated), same pattern as the existing single-value scenarios generalized. AC-3/AC-4/AC-5 (single-value) remain valid as the n=1 case; they do not need to change. ***Follow-up required before Stage 2 implementation***: add one Gherkin scenario for the combined multi-select case and one ATP row — this is a mechanical addition of an already-decided behavior, not an open question, and does not block Stage 1 planning from starting.

---

## Summary

| # | Question | Decision |
| --- | --- | --- |
| 1 | Is the BK-40 dependency cleared? | Yes — `0046_bugs.sql` is on `origin/staging`, BK-40 is Ready For QA |
| 2 | What gates `GET /api/v1/bugs`? | `auth: required`, no PAT scope (the AC's `bugs:read` scope does not exist) |
| 3 | RLS shape for the new list query | `SECURITY INVOKER` over existing RLS, mirroring `bunkai*list*activity` per ADR-0012 |
| 4 | Pagination contract | `limit` 1–50, default 30; opaque `cursor`; matches `/activity` and `/tests/{id}/runs` |
| 5 | Default sort order | Severity ascending, then most-recent — per the shipped mockup |
| 6 | Status/severity filters | Multi-select, OR-within-field, AND-across-fields — per the shipped mockup |

None of the six required deferring to Ely directly — each resolves against a concrete, already-shipped artifact (a merged migration, an enum in `lib/api/pat.ts`, an ADR, a shared pagination helper, or the frozen mockup), not a guess.

***Refinement status******:****** READY.***

---


_Synced from Jira by sync-jira-issues_
