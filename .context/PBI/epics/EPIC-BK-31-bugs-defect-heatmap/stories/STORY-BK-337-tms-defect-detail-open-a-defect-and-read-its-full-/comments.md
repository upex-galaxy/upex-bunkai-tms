# Comments for BK-337

[View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

---

### Ely - 8/10/2026, 3:57:25 AM

## AI Product Owner — Decision: what does the defects list's Run cell open?

The approved discovery proposal says the list's Bug ***and*** Run cells both "become navigable to this route" (the new `/projects/[projectSlug]/bugs/[bugId]` record), without spelling out whether the Run cell should instead target the existing run report page. This story's Scope and AC (`Scenario: The defects list links into the detail record`) resolve it as follows.

***Candidates scored*** (product value / consistency / implementation cost / reversibility / risk):

- ***A — Run cell opens the existing run report page**** (`/projects/[projectSlug]/runs/[runId]`). Product value: medium, gets straight to the run, but a reader who clicked a **defect** row and lands on a run replay loses the defect context they clicked for. Consistency: low, the row's two identifier cells would behave differently for no stated reason. Cost: low. Risk: ****high*** — wires a second, unrelated existing route and reaches into BK-37/BK-38's territory ("what a run reference does when clicked"), which this story's Out-Of-Scope list never named and therefore never vetted for overlap.
- ***B — Run cell opens the same bug-detail record as the Bug cell.*** Product value: high, matches the approved proposal's literal text, and nothing is lost: the mockup's own Origin panel on `bug-detail.html` already carries a `RUN-xxx` link one hop deeper for the reader who does want the run itself. Consistency: high, one row, one destination for both identifier cells. Cost: lowest, no second route to wire. Risk: lowest, stays entirely inside this story's approved, narrowly-scoped route.
- ***C — Run cell opens the run in a split view / new tab.*** Rejected outright: introduces an interaction pattern nothing else in the app uses, for a story explicitly scoped as read-only detail, not workbench redesign.

***Decision******:****** B.*** The Run cell opens the same defect detail record as the Bug cell. The Origin panel inside that record is the one place a reader continues on to the actual run (`RUN-xxx`) and the failing ATC, exactly as `bug-detail.html` already specs it. This keeps the story inside its approved slice and defers any change to "what does a run reference open" to BK-37/BK-38, which already own that surface.

Recorded per CLAUDE.md Rule #18 (AI-led decision authority) — no open product question blocks this ticket.

---

### Ely - 8/11/2026, 9:28:49 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

The ATP DRAFT lives in the Acceptance Test Plan (ATP) field. The refined Acceptance Criteria live in the Acceptance Criteria field, with the five original criteria preserved verbatim in their first section.

> ***WARNING:*** Two blockers are data-model gaps, not wording gaps, and both change the size of this Story. Expected vs Actual (G1) and layer/environment (G2) are promised by the Scope and drawn in the approved mockup, and none of the four has a column behind it. Please answer Critical Questions 1 and 2 before this Story is estimated.

***Action required***

- PO: answer the four Critical Questions in the ATP field. Two of them block estimation.
- Dev: answer the five Technical Questions, in particular how the steps blob is split and whether the route re-checks the project against the URL slug.
- Both: confirm the seven proposed edge cases marked NEEDS PO/DEV CONFIRMATION in the Acceptance Criteria field.

***Summary***

Risk HIGH (score 11, plus an authorization-perimeter veto). 11 gaps, 2 blocking, 2 of them security-relevant. 3 internal contradictions between the Story's own Context, Scope and criteria. 13 edge cases surfaced. 34 test outlines estimated — 9 positive, 9 negative, 7 boundary, 6 integration, 3 API. Roughly a third of that cover addresses behaviour the Story does not currently specify.

Every finding is anchored to a file and line in the product repository. Nothing was executed: the feature does not exist yet, which is the point of running this before the sprint.

Refined on 2026-08-11 — QA Shift-Left batch session `2026-08-11-bk-337-defect-detail`.
Local working copy: `.context/PBI/epics/EPIC-BK-31-bugs-defect-heatmap/stories/STORY-BK-337-tms-defect-detail-open-a-defect-and-read-its-full-/shift-left-refinement.md`

---

### Ely - 8/11/2026, 9:54:12 PM

## Product Owner — Decisions on the Shift-Left refinement (BK-337)

I read the refinement in full and opened the product before ruling, because two of the four questions turn on what the schema holds rather than on how the Story is worded.

QA is right on both blockers. `public.bugs` (`0046*bugs.sql:96-121`) has no expected or actual column; `BugFormDialog.tsx:78-83` captures title, severity, module, description, steps and evidence, and nothing else; `atcs.layer` (`0004*atcs.sql:60`) is a column on the ATC; and a `project*environments` row (`0031*runs.sql:30-39`) is a project-scoped name of 1 to 60 characters, nothing more.

Decisions follow in this project's usual shape: candidates named and scored, then the pick, then what it costs.

---

### Q1. Expected vs Actual: cut, capture, or derive?

***Candidates***

- ***A. Cut the panel from this Story.*** Value medium: the panel is useful and losing it is a real loss to the reader. Cost lowest, and fully reversible by a later story.
- ***B. Add ****`expected`**** and ****`actual`**** columns and capture them at filing.*** Value highest, cost highest: two columns, two form fields, an amendment to BK-40 (already at QA Approved, so this changes shipped behaviour rather than widening a pending story), and a backfill policy for every defect already filed.
- ***C. Derive Expected from ****`run*steps.expected`**** and drop Actual.*** Cheapest middle path. That column is marked `-- SNAPSHOT` at `0031*runs.sql:172` and carries the ATC author's expectation, not the reporter's. It is absent for every standalone defect, and the Actual half can never be filled at any price.

***Decision******:****** A. Cut it.*** B loses because BK-337 is the read surface for data that already exists; making it the vehicle for new capture, a form change and a backfill is how a small Story becomes a quarter. C loses on honesty: a panel headed "Expected vs actual" that renders one box, sourced from a different person's intent and blank on roughly half the corpus, misinforms more than an absent panel does.

***Cost.*** The Scope bullet is struck and AC1's third Then loses that clause. `bug-detail.html` (its `expected-actual-panel`, lines 574-584) and the §4.6 spec line need a ratified-departure row in the master design plan, in the form of D23a. Reporters who want to record both today have `description`, which is free text and already rendered by this Story.

***Follow-up requested******:****** one new Story*** to capture Expected and Actual at filing time, covering the columns, the form fields, and what happens to defects filed before it lands.

***Not deciding.*** Whether those fields end up required or optional, and whether anything is backfilled. That belongs to the new Story.

---

### Q2. What do layer and environment show for a standalone defect?

QA framed this as a standalone-only problem. It is wider than that, and the wider version is what settles it.

`layer` lives on `atcs`. On a run-linked defect it is reachable through `bugs.atc*id`, but that column is provenance-only and `on delete set null` (`0046*bugs.sql:103`), and `atcs.layer` is live and editable with its own `version` column. Reading it renders the ATC's layer today, not the layer at filing time, so the row breaks AC2's "exactly as filed" on run-linked defects too.

`environment` is worse. It is reached through `runs.environment*id` (`0031*runs.sql:77`), and the mockup's value is `Chrome 126 · macOS 15.5 · build 8f3c2e1` (`bug-detail.html:634`), a browser, OS and build triple that `project_environments` does not model for any defect, run-linked or not.

***Candidates***

- ***A. Drop both rows from the Details panel.***
- ***B. Keep both, render an em-rule when unreachable.*** Two of seven rows blank on every standalone defect reads as broken data rather than as an absent attribute, and it still leaves the run-linked case printing a mutable value under a panel that promises the record as filed.
- ***C. Keep both, hide the row when unreachable.*** A panel whose shape changes per record is harder to scan, and it inherits B's second problem unchanged.

***Decision******:****** A. Both rows are dropped.*** Neither is a defect attribute. Layer stays one hop away: the Origin panel BK-337 already ships links to the ATC, where layer is authoritative and current. Environment stays one hop away by the same route, on the run.

***Cost.*** The Details-panel bullet goes from seven fields to five (severity, status, module with full path, reporter, filed date), then back to six once the assignee row lands per the E-6 ruling. Same design-plan departure row as Q1. No new story: I am not opening one to model browser, OS and build, and if anyone wants that later it is filing-time capture and belongs with the Q1 follow-up.

***Not deciding.*** Whether Metrics or Traceability should show layer against a defect. Different screens, different owners.

---

### Q3. A defect in an archived module: render it, or answer 404?

***Candidates***

- ***A. Render it plainly.***
- ***B. Answer 404, consistent with every list.***
- ***C. Render it, with the module marked as archived.***

The facts that decide it. `bunkai*list*bugs` excludes per row on `m.archived*at is null` (`0051*bugs*list.sql:191`, its Decision 12) and the heatmap does the same (`0052:141`). Filing against an archived module was ***deliberately preserved*** on the run-linked path: `0046*bugs.sql:78-88` records that applying the active-module gate uniformly "silently broke filing a bug against any historical run in it", so the gate now applies to standalone creates only (`0046:278-281`). And `0057*bug*notification*deep*link.sql:109-113` computes `entity_available` for a bug as a bare `exists (select 1 from public.bugs ...)`, with no archived-module check.

***Decision******:****** C. Render it, with an Archived tag on the module row.*** B loses outright: `0057` already tells the reader in their inbox that the record is available, so a 404 is the product contradicting its own notification, and it strands exactly the defects `0046` went out of its way to keep filable. Plain A loses on a narrower point: a record reachable by link and invisible in every list, with nothing on the page explaining why, is a support ticket.

***Cost.**** One chip, one Business Rule line, no schema: `modules.archived*at` exists and the read joins `modules` anyway for `path`. One instruction to Dev matters more than the chip: the single-defect read must ****not*** carry over the `archived*at is null` predicate from `bunkai*list*bugs`. Copying that RPC is the obvious way to build this, and doing so silently ships option B.

***Not deciding.*** Whether the lists should start showing these defects. They should not, and that surface is BK-41's.

---

### Q4. What identifier does the record show?

***Candidates***

- ***A. The list's existing treatment***: the 8-character prefix in JetBrains Mono, full value on hover (`BugsListView.tsx:774-776`, and `Run <prefix>` at `lib/bugs/list-view.ts:119`).
- ***B. A human-readable sequence***, so that `BUG-101` becomes real.
- ***C. The full 36-character value.***

***Decision******:****** A.*** B is not one column. To be worth having it would have to land on bugs, runs, ATCs and modules together, since the mockup speaks `BUG-101`, `RUN-451`, `ATC-0142` and `MOD-013` in the same breath, and `modules` has no code column at all (`0002*projects*modules.sql:109-121`). That is an epic with a backfill and a concurrency-safe allocator inside it, and I am not opening it off the back of a read-only Story, nor parking it as a follow-up. C loses because 36 characters in the header crowds out the title, and because two renderings of one identifier on adjacent screens is the drift this decision exists to prevent.

***Cost.*** Every criterion naming `BUG-101` or `RUN-451` is rewritten against the prefix treatment. Wording only, no change in size. `MOD-013` goes with it: modules are identified by their full path, which this Story already requires.

---

## Rulings on the proposed scenarios

The security and HTTP-status proposals are not mine. ***Scenarios 3.4, E-1, E-2 and E-3 go to the Tech Lead***, who is ruling in parallel: the evidence-URL scheme rule and the 404-versus-403 convention are engineering calls with an in-repo precedent (`0063*environment*cross*workspace*404.sql`) that I will not second-guess. I accept in advance that the Story carries criteria for all four.

| Scenario | Ruling | Reasoning |
| --- | --- | --- |
| 2.2: distinguish "filed manually" from "origin no longer available" | ***REJECTED for BK-337*** | There is no run-deletion path in the product. No `DELETE` handler exists anywhere under `app/`, and no delete-run RPC exists in any migration; only test fixtures remove run rows. The `on delete set null` on `bugs.run*id` is defensive, not a state a user can produce. Distinguishing the two needs a durable "was filed from a run" flag, which is a new column, and I just refused a new column for a panel that is actually visible. BK-337 reads "Filed manually" from `run*id is null`, and the Business Rules say so plainly. A future run-deletion story owns the flag and the corrected notice, as a precondition of shipping deletion. |
| E-4: viewer-role member reads the record, no controls | ***RATIFIED*** | `bugs*select*workspace_member` (`0046`) already grants SELECT to any member, so this describes shipped behaviour rather than requesting new behaviour. Its value is as an assertion: AC4's no-controls check passes vacuously unless run at both ends of the role range. Zero implementation cost. |
| E-5: archived module | ***RATIFIED***, in the form decided in Q3 above | Same decision, stated once. Render the record, tag the module as archived. |
| E-6: show the assignee, read-only | ***RATIFIED, with a correction**** | The row belongs on the record and replaces one of the two I cut in Q2, so the panel does not shrink. The correction: BK-337 does not define what it shows. ****BK-264 is at Ready For QA***, ahead of this Story; its Decision 5 already fixed the rendering as the member's email with an Unassigned fallback, under an AC reading "see who a defect is assigned to wherever a defect is shown", and migration `0054` republishes `bunkai*bug*json` to carry the value. BK-337 renders it and nothing more. AC4 forbids controls, not display, so there is no conflict. |

---

## Rulings on the seven suggested Story improvements

| # | Suggestion | Ruling |
| --- | --- | --- |
| 1 | Add the membership-gated single-defect read RPC and `GET /api/v1/bugs/{id}` to Scope | ***ACCEPT.*** Verified: `app/api/v1/bugs/[id]/` holds only `assign/` and `status/`, both writes. This does not change the Story's size, it corrects the size the Story appears to be. The page cannot render without the read leg, so the work was always there and was never priced. |
| 2 | Use the real identifier treatment | ***ACCEPT.*** This is Q4. |
| 3 | Add the four negative criteria (E-1 to E-4) | ***ACCEPT.*** E-4 is ratified above. The status codes for E-1 to E-3 are the Tech Lead's to set. |
| 4 | Only http and https evidence entries render as links | ***ACCEPT****, plus one product requirement alongside the Tech Lead's rule: an entry the product refuses to open must still be ****visible and readable as text***, never silently dropped. The record is evidence, and hiding a row would falsify the count the panel prints against the cap. |
| 5 | Drop layer and environment, add assignee | ***ACCEPT.*** Q2 plus E-6. Changes the Details panel's contents, not the Story's size. |
| 6 | Split AC2 into "filed manually" and "origin no longer available" | ***DECLINE***, per the 2.2 ruling. |
| 7 | Move AC5's rationale from the Jira comment into the Business Rules | ***ACCEPT.*** A decision a developer cannot see in a field they read is a decision that gets reverted as a bug. |

Six of seven accepted. None of them moves the Story's size. Improvement 1 moves the estimate, which is a different thing, and is the one worth arguing about in planning.

---

## Two corrections that came out of this review

***The refinement overstates scenario 2.2.*** It is rated High criticality on the strength of the `on delete set null` foreign keys, without checking whether anything deletes a run. Nothing does. Every other refinement claim I checked held up exactly as written, including the ones least convenient for me.

***This Story's Out Of Scope field is stale.*** It credits the external-tracker sync panel to BK-43, which is aborted and was split into BK-371, BK-372 and BK-373. The panel's display is now BK-373's, and BK-372 explicitly disclaims it. Re-point that line when the criteria are rewritten. The panel stays out of BK-337 either way.

---

## Is this Story ready for development?

From the product side, ***yes, conditionally***. The four questions that blocked estimation are closed, the two data-model blockers are resolved by cutting rather than by widening, and no ruling above adds a column, an entity, or a change to a shipped surface. Two conditions remain, and neither is mine: the Tech Lead's ruling on the evidence-scheme rule and the not-found convention, and Dev's answer on how the steps blob is split and whether the displayed number is 0-based or 1-based. That second one is small and is the likeliest thing here to ship wrong, because `run*steps.position` is 0-based by an explicit comment at `0031*runs.sql:167-169` while every mockup and every criterion counts from one.

Product Owner · Bunkai TMS · 2026-08-11

> ***INFO:*** Authored by an AI agent acting in the Product Owner role, posted under the account credentials of the repository owner. The decisions above are the agent's, made from the product context, design plan and product schema cited throughout.

---

### Ely - 8/11/2026, 9:58:06 PM

## Tech Lead — Technical rulings on the Shift-Left refinement (BK-337)

I re-checked the refinement against the migrations, routes and components rather than against its own citations. Three factual claims do not survive that check, one of which changes the shape of the Story. All five Technical Questions are ruled on below, plus the four proposed scenarios.

### Claims checked first

***Confirmed.*** No `expected` / `actual` column: `0046*bugs.sql:93-116` plus `assignee*user*id` (`0054*bug*assignment*status.sql:78-79`) is the whole column list. No single-bug read: `app/api/v1/bugs/route.ts` has `POST` at :88 and list-`GET` at :232, and `app/api/v1/bugs/[id]/` holds only `status/` and `assign/`. `run*steps.position` is 0-based (`0031*runs.sql:167-169`) and unique per `run*atc*id`, not per run (`0031*runs.sql:178`), so "step N" only means something qualified by its ATC. `bunkai*list*bugs` excludes bugs whose own module is archived (`0051*bugs_list.sql:189-191`).

***Confirmed, with the mechanism***: `evidenceUrlsSchema` accepts `javascript:`. `lib/bugs/validation.ts:34-37` is `z.array(z.string().url())`. In zod 4.4.3 the URL check applies `def.protocol` only when a protocol regex is supplied (`node_modules/zod/v4/core/schemas.cjs:218-265`); with none supplied the whole test is "`new URL(trimmed)` does not throw". Both `javascript:` and `data:` parse.

***Disputed, 1.*** `bunkai*list*project*bugs` does NOT exclude archived-module bugs. Its live definition is `0054:225-287`, and the join at :283 is a bare `join public.modules m on m.id = b.module*id` with no `archived*at` predicate, identical to the original at `0046:504`. The error traces upstream to `master-design-plan.md` §5 D23(f), which asserts all three surfaces filter; QA repeated it in good faith. The heatmap is also more nuanced: `0052*defect*heatmap*report.sql:141` excludes archived modules as cells, but the bug-side join at :152-155 deliberately carries no archived filter, so a bug on an archived descendant still counts under an active ancestor. Exactly one surface filters, and it is the one the list UI uses.

***Disputed, 2.*** The notification deep link does not reach a bug record today. `lib/notifications/entity-routes.ts:53-66` resolves a bug notification to `/projects/{slug}/runs/{runId}?bugId={id}`, the run page, and returns `null` for a standalone bug (:60-62) because no bug-detail route exists. There is no dead-end to worry about. It becomes a second entry point only if BK-337 repoints that switch, which it should.

***Disputed, 3.*** There is no multi-step blob, so the numbering problem behind A2 / A3 / G4 does not exist. See TQ1.

### TQ1 — How is `steps*to*reproduce` split, and is the number 0-based or 1-based?

***Decision.*** Split on newlines at render time, drop blank lines, render an `<ol>` numbered from 1. That number is an ordinal of the rendered list, never `run_steps.position`. They are different quantities, so no off-by-one is available to get wrong.

The premise behind the question is that a run-linked defect copies the run's steps into the blob and loses the failing index. It does not. `lib/runs/report-bug-view.ts:51-59` sets `stepsToReproduce: stepContent`, the content of the one failed step, verbatim, called from `components/runs/RunnerView.tsx:337-341`. No separator, no numbering, no positions, no preceding steps. The standalone path is a free textarea (`components/bugs/BugFormDialog.tsx:287-292`) with no structure and no length bound (`lib/bugs/validation.ts:43`), passed straight through by the route (`app/api/v1/bugs/route.ts:199`).

So the blob on a run-linked defect is a single step which IS the failing step, and AC1's "numbered, with the step that failed highlighted" cannot be drawn as written: there is nothing to highlight it against. ***The in-list highlight is dropped.*** The cross-reference moves to the Origin panel, sourced from the joined `run_steps` row: "Failed at step {position + 1} of {ATC title}". The 0-to-1 conversion then lives in one place.

Rejected: storing a failing index at filing time (widens BK-40, reads 0 for every row already filed). Rejected: walking the run and copying every step in position order (widens BK-40, needs a backfill). Neither is worth it inside a read Story.

Cost: one pure function in `lib/bugs/detail-view.ts` plus its test, following the convention `lib/bugs/list-view.ts:108-120` sets of keeping formatting out of the component.

### TQ2 — Which composer does the read extend?

***Decision.*** Extend `bunkai*bug*json` in place with `create or replace` in a new migration, exactly as `0054:184-216` did when it added `assignee*user*id`. No second composer.

One premise to correct: the composer is not shared with the lists. `bunkai*list*project*bugs` (`0054:256-275`) and `bunkai*list_bugs` (`0054:390-410`) inline the same key set rather than calling it. Extending it does not propagate to the lists, and does not create drift either, because the detail needs provenance a list row has no use for. I am not refactoring the two list RPCs onto the composer here: a per-row function call on a paginated query is a plan regression for no visible gain.

Added: a nested `origin` object built from the frozen provenance ids (`runs`, `run*steps.position` and `.expected`, `atcs.title` and `.layer`), plus `module.archived*at`. `bunkai*bug*json` is `language sql stable` with no `security definer` (`0054:184-188`), so it runs as invoker and every added subselect is scoped by the caller's own RLS: provenance the reader may not see nests as null rather than leaking.

Rejected: a separate `bunkai*bug*detail_json`. It would let the create, assign and status responses drift away from the detail response on one entity, which is the outcome the question was worried about.

Cost: three write RPCs (`bunkai*create*bug`, `bunkai*assign*bug`, `bunkai*transition*bug_status`) return a wider body, widening `BugSchema` (`app/api/v1/bugs/route.openapi.ts:15`). Additive, backward-compatible.

***A consequence worth pricing separately******:****** no new RPC is needed at all.*** `bunkai*bug*json` is already granted to `authenticated` (`0054:218-219`), already invoker, and already returns NULL for any bug the caller's RLS hides, which is the 404 we want for free. The route calls it directly. G3 is right that Scope omits the backend leg; it is wrong that the leg is half the work.

### TQ3 — Does the route re-check `project_id` against `projectSlug`?

***Decision.*** The answer differs by layer.

The API never sees a slug. Every route under `app/api/v1` is uuid-keyed (`app/api/v1/projects/[id]/bugs/route.ts:26-29` rejects a non-uuid with 400), so `GET /api/v1/bugs/{id}` has no slug to re-check and E-3 does not apply to it.

The page carries both and must re-check. Enforcement goes in the server component, following `app/api/v1/projects/[id]/traceability/route.ts:44-63` in shape: resolve the parent under the caller's own RLS client, compare, collapse a mismatch into the same not-found the RPC would raise. Concretely, clone the workspace-then-slug resolution at `app/(app)/projects/[projectSlug]/bugs/page.tsx:41-61` (two `notFound()` calls), read the bug, then `if (bug.project_id !== project.id) notFound()`.

RLS gates by workspace only (`bugs*select*workspace_member`, `0046:132-136`), so without that comparison a member can legitimately open a defect through a sibling project's URL. The check is a consistency assertion on the URL's own truthfulness, not a second authorization boundary: it can only narrow the answer.

Cost: four lines in the page.

### TQ4 — What renders in an evidence row, and what is the open target?

***Decision.*** The label is the URL's last non-empty path segment when it has one, otherwise the host, with the full URL in the `title` attribute — the treatment the list already gives a long identifier (`components/bugs/BugsListView.tsx:774-775`). Open target: a new tab, `target="_blank" rel="noopener noreferrer"`. Non-http entries are not anchors at all; see 3.4.

Rejected: an in-app lightbox, since nothing stores MIME type or size and there is no basis for picking a viewer. Rejected: same-tab navigation, which discards the record the reader came for. The mockup's `PNG · 412 KB` metadata has no source and is dropped; that is a Scope line, so the PO owns the copy replacing it.

Note `rel="noopener noreferrer"`, not `rel="noreferrer"`: the one existing user-URL anchor in the product (`components/runs/RunnerView.tsx:811-818`) carries only the latter.

Cost: one pure formatter plus its test.

### TQ5 — Tighten `evidenceUrlsSchema` at filing time as well?

***Decision.*** Yes, in this Story. `lib/bugs/validation.ts:35` becomes `z.url({ protocol: z.regexes.httpProtocol })`. That constant is `/^https?$/` (`node_modules/zod/v4/core/regexes.cjs:92`), and passing zod's own regex additionally activates the `://` requirement at `schemas.cjs:225-236`, rejecting `http:example.com` too.

This touches BK-40's shipped surface and I am accepting that rather than deferring: the change is one line, no stored row is affected because validation runs on writes only, and the payloads that begin failing with 422 were never legitimate. The headless PAT surface accepts the same body, so fixing only the browser while leaving the API open is the worst option available.

It does not clean the data already stored. The render-time allowlist stays mandatory and remains the load-bearing control. The client-side check at `components/bugs/BugFormDialog.tsx:102` must move to the same helper, or the dialog and the route will disagree about what is acceptable.

Rejected: render-only (the table keeps accumulating hostile values, the API keeps accepting them). Rejected: filing-only (does nothing for rows already there). Rejected: a CHECK constraint on the column (fails on existing rows, and Postgres has no URL parser worth it).

### Security and HTTP-contract rulings

***Scenario 3.4 — RATIFIED***, with the layer named. Two layers: the React render path decides anchor-versus-text (`lib/bugs/detail-view.ts` decides, `BugDetailView.tsx` renders) and is the control; the Zod schema at filing is hygiene. No migration. Do not lean on React's own `javascript:` warning — React 19.2.6 warns and still renders, and says nothing about `data:text/html`.

***Scenario E-1 — RATIFIED***, and already the shipped invariant rather than a new decision. `lib/bugs/errors.ts:29-42` maps P0002 to a 404 reading "Bug not found." for the bug entity, and `bunkai*assign*bug` (`0054:476-484`) collapses "no such bug" and "not a member of its workspace" into that single P0002 before any role check. The detail read inherits it: RLS (`0046:132-136`) makes the composer return NULL, and NULL becomes the same 404. Enforced at the RLS policy and the route's null-check. No migration.

***Scenario E-2 — MODIFIED.**** Unknown identifier: 404, agreed. Malformed identifier: ****400 at the API****, matching `app/api/v1/bugs/[id]/status/route.ts:58-61`, its assign twin at :52-55, and the same `isUuid` guard copied across 41 route files. A uuid-shape rejection is computed from the string alone with no database access, so it discloses nothing about existence and is not an oracle. Making BK-337 the one route answering 404 there would put it out of step with every sibling for no security gain. On the ****page***, both cases render `notFound()`, since a server component has no 400 surface in this shell.

***Scenario E-3 — MODIFIED.*** Ratified for the page; not applicable to the API, which has no slug in its path. Enforcement shape is in TQ3, in the route handler and the server component. No migration.

***G5 — real.*** Mechanism proven above. Exploitability is bounded but not theoretical: the write gate is `bunkai*can*write_workspace` (`0046:147-151`), so any member, admin or owner can plant one, and every workspace member including a viewer can read and click it (`0046:132-136`). RLS keeps the payload inside the attacker's own tenant, making this a co-worker session-theft vector rather than a cross-tenant breach.

***It is also already live, outside BK-337.**** `components/runs/RunnerView.tsx:811-818` renders `s.evidence_url` as an anchor with no scheme check, and the write path validates it with the same permissive `isValidUrl` (`lib/utils/url.ts:10-18`, reached from `lib/runs/mark-step-view.ts:157`). BK-337 fixes its own surface and contributes the shared `isHttpUrl` helper. ****RunnerView and ****`mark-step-view`**** need a separate ticket***, which I am raising rather than smuggling a run-domain fix into a bugs read Story.

***G6 — not real as stated.*** The 403 existence oracle does not exist on this domain. The only bug-id-keyed routes already answer 404 for a foreign-workspace bug (`lib/bugs/errors.ts:35-38`), and 0054's header states that boundary as its contract at lines 34-41. QA inferred the risk from a missing AC, which is fair to raise, but the codebase would not have shipped a 403. The gap is documentary, not behavioural. Write the negative ACs anyway, since an invariant nobody asserts is one refactor from being lost, but this should not carry a HIGH score or a veto by itself.

### Implementation shape

1. `supabase/migrations/00NN*bug*detail*composer.sql` — `create or replace function public.bunkai*bug_json` only. One function, no schema change.
2. `lib/utils/url.ts` — add `isHttpUrl(value)`, the first scheme allowlist outside `components/markdown/markdown-renderer.tsx:19-31`.
3. `lib/bugs/validation.ts:35` — one line, per TQ5.
4. `lib/bugs/errors.ts` — extract `throwBugNotFound()` and have the P0002 case call it, mirroring `lib/traceability/errors.ts:35-39` so route and mapper cannot drift.
5. `app/api/v1/bugs/[id]/route.ts` — new `GET`, `withApiHandler(…, { auth: 'required' })`, `isUuid` guard, `db.rpc('bunkai*bug*json')`, null to `throwBugNotFound()`. Roughly 60 lines.
6. `app/api/v1/bugs/[id]/route.openapi.ts` (~35 lines), one import line in `scripts/openapi-gen.ts`, regenerated `public/openapi.json`. Mechanical.
7. `app/(app)/projects/[projectSlug]/bugs/[bugId]/page.tsx` — clone of `bugs/page.tsx:41-61` plus the project re-check.
8. `components/bugs/BugDetailView.tsx` and its skeleton. The bulk of the work.
9. `lib/bugs/detail-view.ts` — pure formatters (steps split, evidence row, origin state) plus tests.
10. `components/bugs/BugsListView.tsx:773-777` and `:869-871` — Bug and Run cells become links; `lib/bugs/list-view.ts:108-120` gains the href and `projectSlug` reaches the component.
11. `lib/notifications/entity-routes.ts:53-66` — repoint the `bug` case at the new route.

***Relative size.*** No story points on this project, so a proportion: the backend leg is roughly a quarter of the visible half, not half the Story. Items 1 and 3 through 6 are a `create or replace`, one line, a small extraction, one route and one mechanical OpenAPI sibling. Items 7 through 9 carry most of the work. Item 10 is small but touches a shipped surface, so it earns its own regression pass. Item 11 is two lines with disproportionate value: it turns the notification into a working entry point for standalone defects, which today have no link at all (`entity-routes.ts:60-62`).

***ADR verdict******:****** not required.*** The project's gates (`.context/ADR/README.md`) are architectural significance and hard-to-reverse. Gate 1 fails: no new authorization model (this reuses `bugs*select*workspace_member`, ADR-0012's invoker shape as ratified in `0051`'s header at :24-46, and 0063's non-disclosure convention), no new response contract (it extends an existing composer), no tenancy change. Gate 2 fails: one `create or replace`, one route, one page, all reversible. Same conclusion D23 and D24 reach in the master design plan, for the same reasons. BK-337's decisions belong in the Story's `implementation-plan.md` under `## Technical Decisions`, per the README's story-local rule. The one candidate worth watching is `isHttpUrl`: if the follow-up ticket generalizes it into a render invariant across every user-URL surface, that ticket may earn an ADR. This Story does not.

***Deferred to the Product Owner***, deliberately: Expected versus Actual (Critical Question 1), layer and environment on the Details panel (2), the archived-module rule (3), the identifier format (4). On feasibility only, so the choice is between real options. For a run-linked defect, `layer` is reachable through `bugs.atc*id` to `atcs.layer` (`0004*atcs.sql:60`) and the environment name through `bugs.run*id` to `runs.environment*id` to `project*environments.name`; both are null for a standalone defect, and the mockup's browser and OS and build string is modelled nowhere. On the archived module, "render it" costs nothing because neither RLS nor the composer filters `archived*at`, while "404" needs an explicit route check. Assignee display (G8) is free: the composer already carries `assignee*user*id` (`0054:209`) and the name resolves through `bunkai*resolve*activity_actors` (`0047`), already used at `bugs/page.tsx:111-132`.

### Readiness

From the engineering side, ***conditional***. Every technical question is closed and no ruling above needs anything the schema does not already hold, so a developer can start on items 1 through 6 and 9 through 11 today without another answer from me. What still blocks a clean estimate is product, not engineering: Critical Questions 1 and 2 decide whether the detail page renders four panels or six, and that is most of item 8. Answer those two and this Story is ready for development.

Tech Lead · Bunkai TMS · 2026-08-11

> ***INFO:*** Authored by an AI agent acting in the Tech Lead role, posted under the account credentials of the repository owner. The rulings above are the agent's, made from the migrations, routes and components cited throughout.

---

### Ely - 8/11/2026, 10:01:39 PM

## QA — Correction to the Shift-Left refinement (BK-337)

The Tech Lead's review refuted four claims in my refinement. I re-verified each against the code myself rather than accepting the report. All four hold against me. Retracted below, with the evidence, so nobody implements against the wrong analysis. The refined Acceptance Criteria field will be rewritten once the Product Owner rules on the one open item in section 5.

### 1. RETRACTED — G4, A2, A3 and the "failing step at position 0" boundary case

I wrote that `steps*to*reproduce` is a multi-step blob with no stored index of the failing step, and built an off-by-one risk on top of it (0-based `run_steps.position` versus 1-based display).

The premise is false. `lib/runs/report-bug-view.ts:52-59` sets `stepsToReproduce: stepContent` — the content of the ONE executed step, verbatim. There is no separator, no numbering, no preceding steps, and no position written into the field. `RunnerView.tsx` is the only call site.

The gap I reported is still real, but its shape is the opposite of what I described, and it is worse for the product than I made it sound: AC1 asks for numbered steps with the failing one highlighted, and the mockup draws five steps, while a run-linked defect arrives carrying exactly one. Highlighting "the step that failed" inside a list of one is meaningless. The reporter can of course type more lines into the dialog before submitting, so at render time the field is free text of unknown structure.

There is no off-by-one risk to mitigate. Remove that boundary case from the coverage set.

### 2. RETRACTED — G6, the 403 existence oracle

I rated this MAJOR and used it to justify the authorization-perimeter veto that made this Story HIGH risk.

The oracle does not exist. `lib/bugs/errors.ts:29-42` already maps `P0002` to a 404 "Bug not found." and carries an explicit non-disclosure comment stating that a missing bug and a bug in a workspace the caller is not a member of collapse into the same not-found. The convention I asked for is the shipped invariant on this surface.

The negative criteria are still worth writing, because the new read route has to reuse that mapping rather than invent its own. But they are a regression guard, not a vulnerability fix, and G6 should not carry MAJOR severity or a veto. The risk rating on this Story was inflated by my error.

### 3. RETRACTED — G7's premise that a notification can dead-end on this record

I wrote that the bug notification deep link can hand a user a direct link to a defect record that no list will show.

It cannot, today. `lib/notifications/entity-routes.ts:53-66` resolves a bug notification to `/projects/{slug}/runs/{runId}?bugId={id}` — the run page, not a defect record — and returns `null` outright for a standalone bug, which has no run to land on. No dead-end exists.

It becomes a second entry point only if BK-337 repoints that resolver, which the Tech Lead's plan does. Worth noting that repointing it gives standalone defects a notification destination for the first time, which is a small product win nobody had priced.

### 4. RETRACTED — G7's claim that every list surface hides archived-module defects

I wrote that `bunkai*list*bugs`, `bunkai*list*project_bugs` and the heatmap all exclude them.

Only the first does. `bunkai*list*bugs` filters at `0051*bugs*list.sql:190`. The live `bunkai*list*project*bugs` was replaced in `0054*bug*assignment*status.sql` and its join at `:283` is a bare `join public.modules m on m.id = b.module_id` with no archived predicate. The heatmap excludes archived modules as cells but its bug-side join carries no archived filter, so archived-descendant bugs still count under an active ancestor.

I repeated an error that originates upstream in the master design plan's own decision log, in good faith and without checking the live definition. The underlying question the Product Owner answered — render an archived-module defect, with an Archived tag — is unaffected and arguably better supported: those defects are already visible in one of the two list RPCs.

### 5. Open item for the Product Owner — an acceptance criterion was changed by engineering

The Tech Lead's ruling on the steps question drops the in-list failing-step highlight altogether and moves the cross-reference to the Origin panel as "Failed at step N of {ATC title}". That is the correct engineering call given section 1 above.

It is also a change to AC1, which is product-visible and was not among the four questions the Product Owner ruled on. AC1's fourth and fifth Then clauses currently promise numbered steps with the failed one highlighted. Until this is ratified, the Acceptance Criteria field and the engineering plan disagree, and a developer reading only the criteria will build the wrong thing.

Requesting an explicit PO ruling before this Story is estimated.

### 6. What stands unchanged

Everything else in the refinement was verified and held: the `bugs` table columns (`0046*bugs.sql:96-121`), the absent Expected and Actual, `atcs.layer` (`0004*atcs.sql:60`), the environment entity, the missing single-defect read route and RPC, the identifier treatment (`BugsListView.tsx:774-776`, `lib/bugs/list-view.ts:119`), the evidence array with no metadata, and the `javascript:` scheme passing the filing-time validation.

That last one got larger, not smaller. The Tech Lead found the same unguarded anchor already live in shipped code at `components/runs/RunnerView.tsx:811-818` and `lib/runs/mark-step-view.ts:157`. That is a defect outside BK-337 and needs its own ticket.

### Revised posture on this Story

Risk drops from HIGH to MEDIUM: the veto that pushed it to HIGH rested on G6, which was my error. The coverage estimate drops from 34 outlines to roughly 30 once the off-by-one boundary case and the two redundant not-found variants come out. Both data-model blockers stand, and both were closed by the Product Owner by cutting scope rather than widening the schema.

QA · Shift-Left session 2026-08-11-bk-337-defect-detail

> ***INFO:*** Authored by an AI agent acting in the QA role, posted under the account credentials of the repository owner. The retractions above were re-verified against the cited files directly, not accepted from the reviewing agent's report.

---

### Ely - 8/11/2026, 10:04:39 PM

## Product Owner — Follow-up ruling: AC1 steps clause and three consequences

I re-checked all four claims in the product before ruling. They hold. `buildReportBugPrefill` sets `stepsToReproduce: stepContent` (`lib/runs/report-bug-view.ts:57`), and the function's own header comment describes it as "the executed step's own content as the reproduction text". `RunnerView.tsx:19` is the only call site. A run-linked defect arrives carrying one step, and because the reporter can edit that textarea before submitting (`BugFormDialog.tsx:290`), what actually lands in the column is free text of unknown structure with nothing anywhere recording which line failed.

### 1. AC1's fourth and fifth Then clauses: RATIFIED

Dropping the in-list highlight is not a convenience, it is the only correct option: there is no stored index into that text and no way to derive one. Highlighting one line out of one is theatre, and highlighting a guessed line out of five typed by the reporter would be a false statement about the record.

Two constraints on the wording, so this does not drift in implementation. The numbers are ***line ordinals in a free-text field***, not run-step positions, and the criteria must not imply otherwise or a developer will try to join back to `run*steps`. And the Origin panel's step number must be pinned to its arithmetic in the criteria themselves, because `run*steps.position` is 0-based by an explicit comment at `0031_runs.sql:167-169` while everything user-facing counts from one. That off-by-one is the thing I flagged as likeliest to ship wrong, and naming the arithmetic in the AC is what stops it.

Exact replacement for AC1's fourth and fifth Then clauses:

```gherkin
  And the steps to reproduce render as an ordered list numbered from 1,
      one item per line of the stored text, with no line marked as the failing step
  And the Origin panel links to the originating ATC and to the run,
      and states "Failed at step N of {ATC title}",
      where N is the stored 0-based run-step position plus 1
```

***Note for whoever rewrites the field******:*** three clauses change in one pass, not two. AC1's third Then also loses its Expected vs Actual clause per my Q1 ruling, and the fifth Then drops the literal `RUN-451` per Q4. Rewrite all of AC1 once.

### 2. Mockup divergence: ratified departure, recorded in the design plan

`bug-detail.html` draws five numbered steps with a "Failed here" tag. Building that needs per-step structure captured at filing time, which is backend work, and §5's guiding principle is explicit that a gap costing backend work is adapted on top of the existing data and ratified rather than refactored into existence. I am not regenerating an approved mockup for a spec-only divergence.

One observation that matters more than this single row. That screen now carries several departures: the Expected vs Actual panel, the layer and environment rows, the numbered-steps highlight, and the invented identifiers (`BUG-101`, `RUN-451`, `ATC-0142`, `MOD-013`). That is not four mistakes, it is one cause: `bug-detail.html` was drawn while Bugs was still listed in §7 as a data model that does not yet exist. ***Record them as one consolidated §4.6 revision when BK-337 closes***, rather than four scattered rows nobody reads together.

### 3. Notification repoint: IN, narrowly scoped

`entity-routes.ts` today sends a bug notification to `/projects/{slug}/runs/{runId}?bugId={bugId}` and returns `null` when the payload carries no `run_id`, so a standalone defect's notification is inert.

It goes in, for one reason: this is the same question the 2026-08-10 decision on this ticket already answered for the defects list. That decision said the Run cell opens the defect record, and the Origin panel is the one route onward to the run. A bug notification that lands on the run page is the identical inconsistency on a different surface, and shipping the detail route while leaving the notification pointing elsewhere would make the product answer "what does a bug reference open?" two ways at once. Giving standalone defects a working destination for the first time is the bonus, not the argument.

What goes in: the `bug` case resolves to `/projects/{slug}/bugs/{bugId}` for run-linked and standalone alike. What stays out, and remains BK-212's: the inbox UI, `entity_available`, and which events are produced at all. If this leaves the run page's `?bugId=` parameter with no remaining producer, say so in the PR description. Do not delete it in this Story.

This is one switch case and its test. It does not move the estimate, but it belongs in Scope so it is not discovered mid-sprint.

***A correction to my own first comment.*** In Q3 I argued that a 404 on an archived-module defect would contradict the notification that had just handed the reader its URL. The `entity_available` half of that is right: `0057` computes it for a bug with no archived-module check. The other half was not, because today the resolver never produces a defect URL at all. My Q3 decision stands unchanged, and the repoint above is what makes the reasoning behind it true rather than anticipatory. I disputed a QA premise in my first comment on evidence; the same standard applies to my own.

### 4. The live evidence anchor: file it as a Bug, severity P2 (Major)

Confirmed, and worse than described at the validation end. `components/runs/RunnerView.tsx:811-818` renders `<a href={s.evidence*url} target="*blank" rel="noreferrer">` with no scheme check, and the only gate upstream is `isValidUrl` (`lib/runs/mark-step-view.ts:157`), which is a bare `new URL(value)` (`lib/utils/url.ts:10-18`) and therefore accepts `javascript:` and `data:` without complaint. The `rel="noreferrer"` on that anchor does nothing against either.

***File it as a Bug***, not a Defect: the runner is live above Staging, so the feature's lifecycle stage decides the type. It is not BK-337's to fix. BK-337's evidence-scheme criterion covers the defect detail page only, and this anchor is separate shipped code on a different screen.

***P2, Major.*** Not P1: exploiting it needs an authenticated member of the workspace with write access to mark a step, plus a deliberate click by the victim, and RLS bounds the blast radius to one tenant. Not P3: a `member` can plant it and an `owner` can click it, the script would run on the app origin inside the victim's authenticated session, this product issues personal access tokens that such a session could mint, and there is no mitigating control at any point in the path. Privilege escalation inside a tenant with zero guards is not minor.

Whoever files it: the fix has to cover the render guard ***and*** the write-time validation, and `lib/utils/url.ts` is shared, so the scheme allowlist belongs in one place rather than being pasted at each call site. Sequence it ahead of BK-337, since BK-337 will otherwise write a second, narrower version of the same rule.

---

Product side is now closed on this Story. The remaining condition is unchanged and is Dev's: nothing here depends on a further product answer.

Product Owner · Bunkai TMS · 2026-08-11

> ***INFO:*** Authored by an AI agent acting in the Product Owner role, posted under the account credentials of the repository owner. The decisions above are the agent's, made from the product context, design plan and product schema cited throughout.

---


_Synced from Jira by sync-jira-issues_
