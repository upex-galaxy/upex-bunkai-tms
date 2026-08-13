# Comments for BK-267

[View in Jira](https://jira.upexgalaxy.com/browse/BK-267)

---

### Facu Barea - 8/7/2026, 5:46:11 PM

## Shift-Left QA Handoff — BK-267

> Pre-sprint refinement completed | 2026-08-07 | QA: Facu Barea

***Story quality verdict***: Significant Issues — ACs confirmed (14 blocks, 19 scenarios). Pre-sprint blockers remain.

### What was updated in this session

- `✅ Acceptance Criteria (Gherkin)` — 14 AC blocks (19 Gherkin scenarios) from PO source of truth written to the field.
- `🧪 Acceptance Test Plan (ATP)` — ATP DRAFT written: 22 test outlines across Positive (9) · Negative (5) · Boundary (4) · Security/Integration (4). No test code — names only.
- ***Description*** — "QA Refinements" section appended with critical gap summary.

### Pre-sprint blockers (do not start sprint without these)

1. ***API contract gap*** — `GET /api/v1/atcs/search` requires `project*id` (BK-20 contract). A cross-project endpoint or optional `project*id` parameter is needed before implementation starts.
2. ***Design file missing*** — `atc-library-global.html` does not exist locally. UI assertions are ungrounded.
3. ***PO sign-off*** — Badge count semantics, filter state persistence on Back, and exact route URL are undefined.

### Next QA step

When this story reaches ***Ready For QA*** post-implementation, `/sprint-testing` will read the `shift-left-reviewed` label and short-circuit Phases 1–3 directly to execution validation.

Full shift-left analysis at: `.context/PBI/epics/EPIC-BK-13-.../stories/STORY-BK-267-.../shift-left-refinement.md`

---

### Facu Barea - 8/7/2026, 5:58:34 PM

@@Ely — necesito tu decisión en los siguientes puntos antes de poder estimar esta US. Son tanto preguntas de PO como de Dev, así que las junto acá para que las respondas de una vez.

---

## Bloqueantes para estimación

### Como PO — definición de alcance

***1. ¿Qué ATCs debe mostrar la Library?***

¿Todos los ATCs del workspace, o solo los de proyectos donde el usuario es miembro?

> La respuesta cambia el diseño de aislamiento y los casos de prueba de seguridad. Sugerencia: solo proyectos donde el usuario tiene membresía activa (`workspace_members`).

***2. ¿Qué cuenta el badge del sidebar?***

¿Total de ATCs en el workspace, total accesibles para el usuario, o total después de aplicar filtros?

> Son tres assertions distintas. Si esto queda sin definir, cualquier número pasa.

***3. ¿Está disponible el archivo de diseño?***

El campo ATP de esta US referencia `.context/designs/.../atc-library-global.html` pero el archivo no existe. Sin diseño, las assertions de UI son suposiciones.

> ¿Podés compartirlo o agregar el spec de UI inline en la descripción?

***4. ¿Se preserva el estado de filtros al navegar con browser Back?***

Si el usuario abre un ATC y vuelve con Back, ¿la Library vuelve con los mismos filtros activos?

> Si sí: hay un test case para eso. Si no: fuera de scope.

---

### Como Dev — contrato técnico

***5. ¿Cómo se implementa la búsqueda cross-project?***

El endpoint actual `GET /api/v1/atcs/search` (BK-20) requiere `project_id` obligatorio — no puede usarse para búsqueda workspace-wide sin cambios.

Las opciones son:

- Hacer `project_id` ***opcional***: cuando se omite, el endpoint devuelve ATCs de todos los proyectos accesibles para el usuario en el workspace.
- Crear un ***endpoint nuevo*** (ej. `GET /api/v1/atcs` sin scope de proyecto).

> Necesito saber cuál de las dos antes de escribir los test cases de API.

***6. ¿Cuál es la ruta de la ATC Library?***

`app/(app)/` no tiene ninguna ruta `/atc-library` todavía. ¿Cuál va a ser el path canonical?

> Afecta los assertions de navegación y deep-link.

---

## Lo que pido

Una vez que tengas las respuestas, respondé este comentario con las decisiones y ***devolveme la US*** para que pueda finalizar la estimación de testing y arrancar el sprint con todo claro.

Gracias!

---

### Ely - 8/13/2026, 3:43:52 PM

> ***INFO******:**** This comment is authored by the ****AI Product Owner / Business Analyst**** profile of the same AI team that designs, specifies and builds Bunkai TMS, under `CLAUDE.md` Critical Rule #18 (AI-led decision authority). It is ****not**** a human PO sign-off and must not be read as one. Every ruling below enumerates its alternatives, scores them, and states the reasoning. The **enforcement mechanism** for the scoping ruling in Q1 is decided separately by the ****AI Tech Lead*** (see the companion comment on this ticket).

### Evidence read before deciding

| Source | What it settled |
| --- | --- |
| `supabase/migrations/0001*tenancy.sql:27,40` + full `0001`-`0063` scan | `workspace*members` is the ***only*** membership table. There is no `project_members` table anywhere. Per-Project membership is not expressible in this schema today. |
| `supabase/migrations/0005*rls*helpers.sql:19-28,153-154,175-180` | Every SELECT policy on Project-owned data resolves to `bunkai*is*workspace*member(workspace*id)`. |
| `lib/home/active-runs.ts:157`, `lib/home/recent-projects.ts:116-119`, `lib/home/open-bugs.ts:123-125`, `lib/home/coverage.ts:221-223`, `supabase/migrations/0045*activity*stream.sql:141` | Every shipped cross-project read (BK-256..BK-260) scopes on `workspace_id` alone, with no per-Project filter. |
| `supabase/migrations/0027*atc*search.sql:45-58,116-135` and its header comment `:17-27` | `bunkai*search*atcs` requires `p*project*id`; the `workspace*members` join is the authorization boundary and `p*project_id` is explicitly "a product decision, additive to tenant isolation", not an access boundary. |
| `app/api/v1/atcs/route.ts` (POST only), `app/api/v1/atcs/search/route.ts` | No `GET /api/v1/atcs` list endpoint exists. The only ATC read endpoint is BK-20's Project-scoped search. |
| `components/layout/AppSidebar.tsx:77-83,165-175,598-615` + `app/(app)/layout.tsx:38-43` | The sole nav count badge is `Projects` = `projects.length`, a byproduct of shell data the layout already fetches. `ATC Library` is `href: null` and renders "soon". |
| `components/runs/RunHistoryView.tsx:233-258` and `components/traceability/TraceabilityChainView.tsx:294-344` | Both filter surfaces that touch the URL use ***replace*** semantics, both documenting the same reason: a filter click must not create a Back stop. |
| `.context/designs/bunkai-test-management-tool/bk-13-atc-library-global/BRIEF.md:50` + `.context/design/master-design-plan.md:285` | The route `/atcs` (workspace-scoped, not nested under a Project) is already named in the design contract. |
| `.context/designs/.../atc-library-global.html:430-431,462-463,471,631` | The badge is `623` with `aria-label="623 ATCs in workspace"`; the in-page chip separately shows `Showing N of 623`; the `⌘K` affordance is labelled "Command palette". |
| `.context/business/domain-glossary.md:78-80` | Workspace is the "Multi-tenant root. Owns Projects ***and membership***." Project owns content, not membership. |
| `.context/PBI/.../STORY-BK-20-**/story.md` | BK-20 is ****5 SP*** and is the only sized sibling in EPIC BK-13. |

> ***WARNING******:****** two corrections to the 2026-08-07 shift-left comment on this ticket.***
1. ***"Design file missing" is false.**** `.context/designs/bunkai-test-management-tool/bk-13-atc-library-global/atc-library-global.html` (769 lines) and its `BRIEF.md` exist and are committed: `927b62f1 docs(design): add BK-13 global ATC library mockup (1 screen)`, 2026-07-30, never amended. UI assertions are grounded. What is genuinely missing is BK-267's ****row in ****`master-design-plan.md`**** §8***.
2. ***"PO sign-off needed" is not a blocker.*** Under Critical Rule #18 an open product question is work to do, not a wait state. All four are answered below, and none of them was the reason this ticket was not sprint-ready. Q5 is.

---

## AI Product Owner — Decision: does "across every project" mean every Project in the workspace, or only Projects the caller is a member of?

***Context****: the shift-left comment asked whether the index shows all workspace ATCs or only ATCs in Projects the user belongs to, and suggested the latter ("solo proyectos donde el usuario tiene membresía activa (`workspace*members`)"). That suggestion contains its own answer and does not realise it: `workspace*members` ****is*** workspace membership, not Project membership. A full migration scan of `0001`-`0063` confirms no `project*members` table exists, and every RLS SELECT policy on Project-owned data resolves to `bunkai*is*workspace*member(workspace*id)` (`supabase/migrations/0005*rls_helpers.sql:19-28,153-154,175-180`).

***Candidates considered***

| # | Candidate answer | Product value | Consistency with existing precedent | Implementation cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Every ATC in every Project of the caller's active Workspace, gated by an active ****`workspace_members`**** row (chosen)**** | 5 | 5 | 5 | 5 | 4 | ****24*** |
| B | Only Projects the caller is individually a member of (introduces per-Project membership) | 3 | 1 | 1 | 3 | 2 | 10 |
| C | Workspace-scoped, but role-gated so `viewer` sees nothing | 2 | 1 | 4 | 4 | 3 | 14 |
| D | Every ATC across every Workspace the caller belongs to, merged into one index | 2 | 1 | 3 | 4 | 2 | 12 |

***Decision****: the ATC Library shows ****every ATC belonging to every Project of the caller's active Workspace****, for any caller holding an `active` row in `workspace_members` for that Workspace, at any role (`viewer`, `member`, `admin`, `owner`). The access boundary is the Workspace and nothing narrower. AC-12 stands unchanged in wording and is hereby given its binding reading: "a Project I cannot access" means ****a Project in a Workspace where I hold no active membership***. Cross-workspace isolation is absolute; intra-workspace Project isolation does not exist in this product and is not introduced by this story.

***Rationale***: candidate A is not a new decision, it is the decision this product already made and shipped five times. BK-256 shows "every run currently in progress across every project in the workspace" (`app/api/v1/workspaces/[id]/active-runs/route.ts:7-9`), BK-257 lists every Project in the Workspace (`lib/home/recent-projects.ts:116-119`), BK-258, BK-259 and BK-260 do the same. Not one AC, business rule or scope line in EPIC BK-254 mentions Project membership. `bunkai*search*atcs` says it outright in its own header (`0027*atc*search.sql:17-19`): "scope derives only from the actor's memberships", and its `p*project*id` narrow is documented as a product filter, not an authorization boundary. A cross-project ATC index that scoped differently from the Home dashboard would mean two contradictory answers to "what can this user see" inside one shell.

Candidate B lost on cost and on precedent together, and the cost is the interesting part: it is not a WHERE clause, it is a new membership table, a new RLS helper, a rewrite of the SELECT policies on `projects`, `modules`, `user_stories`, `atcs` and everything downstream, plus a Project-membership management UI that no story on the board owns. That is a tenancy model change, and a tenancy model change does not belong inside a browse story. If per-Project visibility is ever wanted it arrives as its own epic with its own ADR, and this ruling is fully reversible at that point because "everything the caller can read" is exactly the sentence that keeps working when the definition of readable narrows.

Candidate C lost because `viewer` reads every other surface in the app; inventing a read gate here would be the only one of its kind. Candidate D lost because the entire shell is built around one active Workspace (`app/(app)/layout.tsx` resolves `activeWorkspaceId` and every sidebar surface follows it); a cross-workspace merged index would be the only screen in the product that ignores the workspace switcher.

***The enforcement mechanism is not decided here.**** Whether the scope is enforced by the caller's RLS-scoped client, by a `SECURITY DEFINER` RPC with an `auth.uid()` bind, or by both, and how ADR-0012's actor-bind-plus-result-scoping invariant is satisfied, is an ****AI Tech Lead*** call, decided in the companion comment. The binding product constraint that call must satisfy: an ATC in a Workspace the caller does not actively belong to must never appear in the list, in a filter facet, in a search result, or in the badge count.

***Precedent cited***: `supabase/migrations/0001*tenancy.sql:40`; `supabase/migrations/0005*rls*helpers.sql:19-28,153-154`; `supabase/migrations/0027*atc_search.sql:17-27,116-135`; `lib/home/recent-projects.ts:116-119`; `lib/home/open-bugs.ts:123-125`; `lib/home/coverage.ts:135-140,221-223`; `app/api/v1/workspaces/[id]/active-runs/route.ts:7-9,27-28`; `.context/ADR/ADR-0006-consumption-side-scope-enforcement.md`; `.context/business/domain-glossary.md:78-80`.

---

## AI Product Owner — Decision: what does the sidebar's "ATC Library" count badge count?

***Context***: `components/layout/AppSidebar.tsx:170` currently renders `{ id: 'library', icon: Library, label: 'ATC Library', href: null }` with no badge. The mockup renders `623` with `aria-label="623 ATCs in workspace"` (`atc-library-global.html:430-431`), and `BRIEF.md:76-80` instructs that the badge be rendered "intact". The shift-left comment correctly observed that without a defined semantic, any number passes the test.

***Candidates considered***

| # | Candidate answer | Product value | Consistency with existing precedent | Implementation cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Unfiltered count of ATCs in the caller's Q1 scope, computed server-side in the app shell (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| B | No badge at all on this entry | 2 | 3 | 5 | 5 | 5 | 20 |
| C | Count reflecting the screen's currently active search and filters | 2 | 1 | 3 | 4 | 3 | 13 |
| D | Raw total of ATC rows in the Workspace, computed without regard to what the caller can read | 2 | 2 | 5 | 4 | 1 | 14 |

***Decision****: the badge shows the ****total number of ATCs the caller can read in the active Workspace, unfiltered***, computed server-side in the app shell and passed to `AppSidebar` as a prop. It never reflects the ATC Library screen's search term or active filters, and it does not change while the user types. Archived ATCs (`atcs.archived*at is not null`) are excluded, matching `bunkai*search*atcs`'s own predicate (`0027*atc_search.sql:118`). When the count is zero the badge is hidden rather than rendering `0`.

***Rationale***: the badge is global chrome. It is visible from `/home`, from a Run detail, from Settings. A number that reflected filter state on one screen would be undefined on every other screen, and would flicker on each keystroke while the user is looking somewhere else, which is why candidate C lost despite being the only candidate the shift-left comment treated as plausible. The screen already has a filtered counter and it is a different control: the mockup's `Showing N of 623 ATCs` line (`atc-library-global.html:631`, `role="status" aria-live="polite"`). Two counters, two jobs, no ambiguity.

Candidate A also matches the only badge precedent that exists. `Projects` shows `projects.length` from a list the shell already fetched (`app/(app)/layout.tsx:38-43`, `AppSidebar.tsx:169`), and the notifications bell is server-seeded from the layout then maintained client-side. Both rules are the same rule: the shell computes the number on the server, never a client-fetch waterfall. Note the honest cost that keeps candidate A off a perfect score: unlike `projects.length`, an ATC count is ***not*** a byproduct of data the shell already needs, so it is a new server-side count on every app page load. That is a real charge against every route in the app, and it is the AI Tech Lead's call whether it is a `count` head request, a cached aggregate, or something else. The product requirement is only that the number be correct at page load and not require a client round-trip to appear.

Candidate D lost on risk alone and would be a defect: a count that includes ATCs the caller cannot read tells the caller that data exists which the index then refuses to show, contradicting `business-rules.md` line 7 and AC-12. Under Q1's ruling A and D produce the same integer today, which is exactly why the rule must be stated as A: it stays correct if the definition of readable ever narrows. Candidate B (no badge) scored respectably and is the graceful fallback if the count query proves expensive, but it loses fidelity the design contract explicitly asks for, and the badge is genuinely useful: it is the one place in the product that tells a QA Engineer how large the reusable library is before they decide whether searching it is worth the trouble.

Note for implementation: `.context/design/master-design-plan.md:487` (D5) already rules that shell nav badges "can read live counts from existing APIs; missing-domain badges render `0`/hidden until those domains exist". The literal `623` in the mockup is a fixture, not a data contract.

***Precedent cited***: `components/layout/AppSidebar.tsx:77-83,169,598-615`; `app/(app)/layout.tsx:11-13,30-35,38-43,58-60`; `lib/notifications/view.ts` (`formatUnreadBadgeCount`); `.context/design/master-design-plan.md:487` (D5); `.context/designs/bunkai-test-management-tool/bk-13-atc-library-global/atc-library-global.html:430-431,471,631`.

---

## AI Product Owner — Decision: is filter and search state restored when the user presses browser Back?

***Context***: the shift-left comment asked whether opening an ATC and returning with Back brings the filters back, and framed it as "if yes there is a test case, if no it is out of scope". The app has already answered the underlying question twice, in two separate shipped surfaces, with the same semantic and two different mechanisms.

***Candidates considered***

| # | Candidate answer | Product value | Consistency with existing precedent | Implementation cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Search term and filters live in the URL query string, written with replace semantics, rehydrated on load and on ****`popstate`**** (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| B | Same, but written with push semantics so every filter change is its own history entry | 2 | 1 | 4 | 4 | 2 | 13 |
| C | Local component state only, nothing restored (the `BugsListView` pattern) | 1 | 2 | 5 | 5 | 4 | 17 |
| D | Restore from `sessionStorage`, leave the URL clean | 3 | 1 | 3 | 4 | 3 | 14 |

***Decision****: ****yes, the state is restored.*** The active search term and every active filter are held in the URL query string of `/atcs`. Three behaviours follow and are all binding:

1. Changing a filter or typing in the search field ***replaces*** the current history entry, so filtering never adds a Back stop. Pressing Back from a filtered library goes wherever the user came from, not backwards through their own keystrokes.
2. Opening an ATC row is a real navigation (a push), so Back from the ATC returns to `/atcs` with the exact search term and filters that were active, and the list re-renders narrowed.
3. The resulting URL is shareable: pasting it into a new tab reproduces the same narrowed view.

Esc clearing the search term (AC-04) and "Clear all" (AC-07) both update the URL under the same replace semantics, so neither becomes a Back stop either.

***Rationale***: this is the loop the story exists to serve. `workflow.md` describes a QA Engineer narrowing a list, opening a candidate ATC to check whether it is really reusable, and, when it is not, continuing the hunt. Candidate C breaks that loop on the second iteration: the user returns to an unfiltered list of hundreds of rows and has to retype everything, every time, which converts the screen's core use into a chore. That is why C lost despite being the cheapest option and despite having a real precedent (`components/bugs/BugsListView.tsx:42-45`, which declines URL sync explicitly because that story had no deep-link requirement). This story does have one: the whole point is leaving the screen and coming back.

Candidate B lost to the app's own written reasoning, twice. `components/runs/RunHistoryView.tsx:233-235`: "The URL is the source of truth for deep links, so it moves with the filter (replace, not push, filtering is not a navigation step to walk back through)". `components/traceability/TraceabilityChainView.tsx:294-305` reaches the same conclusion for BK-48 and adds that `replaceState` "(never `pushState`) keeps one history entry per PAGE VISIT rather than one per filter click". Candidate D lost because invisible state that cannot be shared or bookmarked is strictly worse than the same state in the address bar, and no surface in this codebase does it.

***Which mechanism is not decided here.**** BK-37 used `router.replace(..., { scroll: false })` and accepted a documented cost: a wasted Server Component re-run per filter change (`RunHistoryView.tsx:238-246`, "COST, ACCEPTED"). BK-48 later chose `window.history.replaceState` specifically to avoid that cost, and added a `popstate` listener to stay correct (`TraceabilityChainView.tsx:309-344`). Both satisfy this ruling. The choice between them is an ****AI Tech Lead*** call.

***One defect to not inherit.*** BK-48's `syncFilterUrl` rebuilds the query string from the filter axes alone and drops any unrelated param already in the URL (`TraceabilityChainView.tsx:309-315` against the separately-read `?story=` param at `app/(app)/projects/[projectSlug]/traceability/page.tsx:13,31`). Whichever mechanism is chosen for `/atcs`, unrelated query parameters must survive a filter change.

***Precedent cited***: `components/runs/RunHistoryView.tsx:233-258`; `app/(app)/projects/[projectSlug]/tests/[testId]/runs/page.tsx:12,30-36`; `components/traceability/TraceabilityChainView.tsx:294-344`; `lib/traceability/chain-view.ts:433-459`; `components/bugs/BugsListView.tsx:42-45` (the declining precedent, and why it does not apply here).

---

## AI Product Owner — Decision: what is the canonical route for the ATC Library?

***Context***: the shift-left comment noted that `app/(app)/` has no `/atc-library` route and asked for the canonical path. The design contract already names one, in two places, and `/atc-library` is not it.

***Candidates considered***

| # | Candidate answer | Product value | Consistency with existing precedent | Implementation cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | `/atcs`**** (chosen)**** | 5 | 5 | 5 | 4 | 5 | ****24*** |
| B | `/atc-library` | 3 | 2 | 5 | 4 | 4 | 18 |
| C | `/library` | 2 | 2 | 5 | 4 | 4 | 17 |
| D | `/workspaces/[id]/atcs` | 2 | 2 | 4 | 3 | 4 | 15 |

***Decision****: the ATC Library lives at `/atcs`, a workspace-level route implemented at `app/(app)/atcs/page.tsx`, scoped to the caller's active Workspace and never nested under a Project. Opening a row navigates to the ****existing*** ATC detail route, `/projects/{projectSlug}/atcs/{atcId}`, which is what "land inside the owning Project's context" in AC-11 means concretely; the toast names the destination Project as the mockup specifies. Deep-linking `/atcs` with query parameters is supported; there is no `/atcs/{id}` at workspace level, because an ATC's canonical home is its Project.

***Rationale***: `/atcs` is already the decided route. `BRIEF.md:50` states it verbatim ("Route: `/atcs` (workspace-scoped, sits alongside Home/Projects/Test Runs/Bug Reports/Metrics in the persistent App Shell, not nested under any single Project)") and `.context/design/master-design-plan.md:285` repeats it in the §4.9 screen-file table. Under Critical Rule #15 the design plan is the contract; re-picking the route here would be an unratified divergence invented to answer a question that was already answered. It also matches the route tree's actual naming: every workspace-level segment in `app/(app)/` is a single lowercase noun, plural for collections (`home`, `activity`, `projects`, `settings`, `workspaces`), and `atcs` is the exact segment the Project subtree already uses for the same entity.

Candidate B, `/atc-library`, is the shift-left comment's assumption and has no source of authority behind it. It would be the first multi-word workspace-level page route in the app, and it names a screen rather than a resource, which is the opposite of how every other route here is named. Candidate C is worse on the same axis and means nothing. Candidate D lost on reversibility as much as precedent: no workspace-level content route in this app carries the workspace id in the path (the active Workspace is resolved by the shell in `app/(app)/layout.tsx`), and `/workspaces/[id]/*` is reserved for workspace administration (`app/(app)/workspaces/[id]/members/page.tsx`).

***ADR-0003 is satisfied, and constrains one thing here.*** Its scope is the Project subtree; it neither forbids nor shapes workspace-level routes, so `/atcs` sits outside its remit. What it does bind is the row-open behaviour: its stated invariant is that "open" is navigation to a real route, never a bespoke client-only panel. `/projects/{projectSlug}/atcs/{atcId}` is that real route, it already ships, and it renders as tab content inside the persistent Project shell. This also closes the gap the design artifacts left open: the mockup's row-open handler fires a toast and specifies no destination URL (`atc-library-global.html:724-730`).

***One frozen-contract conflict that must be recorded.**** `master-design-plan.md:500` (D18, BK-265) ratified that the global sidebar's workspace-wide entries, including "ATC Library", "stay `soon` + non-focusable". AC-01 requires the opposite. That is not an oversight in this story, it is D18 being overtaken: D18 ruled the entry `soon` ****because the destination did not exist****, and this story builds the destination. ****D18 is superseded for the ****`ATC Library`**** entry only.*** "Test Runs", "Bug Reports" and "Metrics" remain `soon` and non-focusable, exactly as AC-14 requires. Under Rule #15 this needs a new §5 row in `master-design-plan.md` recording the supersession, plus §8 US-to-Screen rows for the successor stories named below. Both must land before development starts.

***Precedent cited***: `.context/designs/bunkai-test-management-tool/bk-13-atc-library-global/BRIEF.md:50`; `.context/design/master-design-plan.md:285,487,500`; `.context/ADR/ADR-0003-app-shell-route-driven-workbench-tabs.md`; the `app/(app)/` route tree; `app/(app)/projects/[projectSlug]/atcs/[atcId]/page.tsx`.

---

## AI Product Owner — Decision: is BK-267 implementable as written at 1 story point?

***Context****: BK-267 is recorded at ****1 SP**** and carries ****14 AC blocks / 19 Gherkin scenarios***. Independent verification against the live code this run establishes that it requires a new page route, a new cross-project read, a new API endpoint, a sidebar promotion, a new count badge, keyboard shortcuts with no precedent in the app, four combinable filter facets and four screen states.

***What the story actually requires, verified against migrations and live code***

| Required piece | Exists today? |
| --- | --- |
| Workspace-level page route for the library | ***No.*** `app/(app)/` holds `home`, `activity`, `projects`, `onboarding`, `settings`, `workspaces`. No `/atcs`. |
| A cross-project ATC read | ***No.*** `bunkai*search*atcs` (`0027*atc*search.sql:45-58`) takes `p*project*id` as a required parameter and filters `a.project*id = p*project_id` (`:124`). |
| A list endpoint | ***No.*** `app/api/v1/atcs/route.ts` exports POST only. |
| Sidebar entry live instead of "soon" | ***No.*** `components/layout/AppSidebar.tsx:170` is `href: null`. Also requires superseding D18. |
| A count badge on that entry | ***No.*** The shell fetches only Projects; the sole nav badge is `projects.length`. |
| "Used in N tests" as a bulk column across Projects | ***No.*** BK-22 delivers usage on the ATC detail surface, one ATC at a time, not as a list aggregate. |
| Anchored User Story / Acceptance Criterion per row, cross-project | ***No.*** |
| Four combinable filter facets, Module cascading from Project | ***No.*** |
| URL filter state with Back restore | Pattern exists; not on this screen. |
| `/` and Esc keyboard shortcuts on a list screen | ***No precedent anywhere in the app.*** |

***Candidates considered***

| # | Candidate answer | Product value | Consistency with existing precedent | Implementation cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Not implementable at 1 SP. Split into three sequential slices (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| B | Keep as one story, re-estimate to 10 SP | 3 | 2 | 2 | 3 | 2 | 12 |
| C | Two slices (browse + search, then filters) | 4 | 4 | 4 | 4 | 4 | 20 |
| D | Ship browse-only; drop search and filters from v1 entirely | 2 | 1 | 5 | 4 | 3 | 15 |

***Decision****: ****BK-267 is not implementable as written at 1 SP, and must not enter a sprint as one.**** Split it into three sequential stories, sized 5 + 2 + 3 = ****10 SP****. BK-267 itself is transitioned to ****ABORTED***, not deleted, with a comment pointing at its successors, matching the disposition of BK-43.

The in-epic calibration makes the sizing gap unarguable. BK-20 (`TMS-ATC Search | Search and autocomplete ATCs`) is ***5 SP**** for full-text search with `ts_rank`, autocomplete, two optional narrowing dimensions and recency ranking, all ****inside a single Project's toolbar, against a table and an RPC that already exist***. BK-267 as filed contains more search surface than BK-20, plus a route that does not exist, an endpoint that does not exist, a cross-project read that does not exist, a sidebar promotion and a badge. It is the only sized sibling in this epic, and BK-267 is recorded at one fifth of it.

***Proposed slices, in execution order***

1. ***BK-267a — ****`TMS-ATC Library | Browse every ATC in the workspace from one index`****.**** The `/atcs` route, the sidebar entry going live with its unfiltered count badge, the cross-project read at the Q1 scope with its endpoint, the dense row carrying all eight columns, row-open navigation to `/projects/{slug}/atcs/{id}` with the destination-naming toast, and the four screen states: default, loading skeleton, empty, and named error with retry. ****No search field and no filter controls at all.**** Covers AC-01, AC-02, the empty-workspace scenario of AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14. ****Estimated 5 SP.***
2. ***BK-267b — ****`TMS-ATC Library | Find an ATC by name as you type`****.**** Incremental narrowing with no submit, the `/` shortcut focusing the search field, Esc clearing the term, the search term carried in the URL with restore-on-Back, and the no-match empty state made distinct from the empty-workspace state. ****No facet filters.**** Covers AC-03, the `/` and Esc scenarios of AC-04, the no-match scenario of AC-08. ****Estimated 2 SP.***
3. ***BK-267c — ****`TMS-ATC Library | Narrow the index by Project, Module, layer and anchor`****.**** The four facets with Module cascading from the selected Project, strict AND combination, combination with an active search term, "Clear all" as a single gesture, and all facets carried in the URL under the same replace semantics. Covers AC-05, AC-06, AC-07. ****Estimated 3 SP.***

***Why this order and not another.**** The slicing is by user-visible capability milestone, each slice a full vertical stack (read, endpoint, route, UI), which is the shape ruling `12170` established and BK-371/BK-372/BK-373 materialised. It is deliberately ****not*** sliced by layer: an "API first, UI second" split produces two stories neither of which a QA Engineer can use.

Slice 1 is the independently shippable one, and it ships the story's actual promise. A complete, dense, cross-project index that a user can scan and launch from answers "does this ATC already exist" on day one. Slice 1 also pays the entire structural cost (route, cross-project read, endpoint, sidebar, badge), which is why it carries the largest estimate and why the two slices after it are cheap: they add controls to a surface that already exists and already reads the right rows.

Slice 2 before slice 3 because name search is the higher-frequency gesture by a wide margin, and because slice 2 establishes the URL-state and clear-a-term machinery that slice 3's "Clear all" extends. Candidate C (fold search and filters together) scored well and is a reasonable fallback if the team prefers two tickets over three, but it bundles the cheapest work with the second-most-expensive and loses the natural demo boundary between "I can find it" and "I can narrow it".

Candidate D lost because an index of hundreds of rows with no search is a demo, not a tool; browse-only is defensible as a **first slice** precisely because slices 2 and 3 are already committed to follow it, and indefensible as a **final scope**.

### Scope amendment inside this ruling: the ⌘K binding is retired from AC-04

AC-04's second scenario claims `Cmd+K` / `Ctrl+K` for this screen's search field. ***Retire it.**** `⌘K` is the command-palette binding, and BK-398 (`Command palette: search and jump across the workspace`, ruling `12297`) is a live story delivering an app-shell overlay spanning six entity types including ATCs. Two different behaviours on one chord, one global and one screen-local, is a defect waiting to be filed. The mockup itself shows the confusion: its `⌘K` button is labelled "Command palette" (`atc-library-global.html:462-463`) but is wired to focus this screen's own input (`:747`). Alternatives weighed: keep `⌘K` here and let BK-398 pick another chord (rejected, it inverts the convention); keep both and let the screen-local handler win while on `/atcs` (rejected, a global shortcut that silently means something else on one route is worse than not having it); ****retire ****`⌘K`**** from BK-267 and keep ****`/`**** and Esc (chosen)****. `/` is a list-search convention that composes with a palette rather than competing with it. ****Action for QA***: delete the `Cmd+K` scenario from AC-04 when authoring BK-267b, and re-scope its linked ATP outline as invalid by decision.

### Two further product constraints, binding on whoever implements

- ***AC-02's "no artificial cap" is a reachability requirement, not a rendering requirement.**** Paging, infinite scroll, or full render all satisfy it. What it forbids is a silent `LIMIT` that hides ATCs with no way to reach them. The mockup renders all 623 rows into the DOM at once and gives every row `tabindex="0"`; that is a fixture, not a performance or accessibility commitment, and the mechanism is an ****AI Tech Lead*** call.
- ***Search matches name only.**** The three design artifacts disagree (`BRIEF.md:57-66` says name, `master-design-plan.md:285` says "incremental name search", the mockup's handler matches name ****or*** id at `atc-library-global.html:478,618`). `scope.md` and AC-03 both say name. Ruling: name only in BK-267b; matching on ATC id is a small, additive follow-up if anyone asks for it.

***Precedent cited***: ruling `12170` on BK-43 and its materialisation as BK-371/BK-372/BK-373; `supabase/migrations/0027*atc*search.sql:45-58,124`; `app/api/v1/atcs/route.ts`; `components/layout/AppSidebar.tsx:170`; `app/(app)/layout.tsx:38-43`; `STORY-BK-20` (5 SP); `atc-library-global.html:462-463,478,618,747`.

---

## Proposed successor stories

| Proposed title | Scope boundary | Depends on | Independently shippable? | Rough size |
| --- | --- | --- | --- | --- |
| `TMS-ATC Library | Browse every ATC in the workspace from one index` | `/atcs` route, sidebar entry live with unfiltered count badge, cross-project read at Q1 scope plus its endpoint, eight-column dense row, row-open navigation with destination toast, four screen states. ***No search field, no filter controls.**** | Nothing. Needs the §5 D18 supersession row and the §8 map row landed first (Rule #15). | ****Yes.*** Delivers the story's stated value. | 5 SP |
| `TMS-ATC Library | Find an ATC by name as you type` | Incremental name-only narrowing with no submit, `/` focuses the field, Esc clears the term, term carried in the URL with restore-on-Back, no-match empty state distinct from empty-workspace. ***No facet filters. ⌘K retired.*** | Slice 1 | No. Extends slice 1's surface. | 2 SP |
| `TMS-ATC Library | Narrow the index by Project, Module, layer and anchor` | Four facets with Module cascading from Project, strict AND combination, combines with an active search term, one-gesture "Clear all", all facets in the URL under replace semantics. | Slices 1 and 2 | No. | 3 SP |

***Until the successors are materialised, treat BK-267 as NOT sprint-ready at 1 SP.*** No question on this ticket required a human decider.

---

### Ely - 8/13/2026, 3:43:57 PM

> ***INFO******:**** This comment is authored by the ****AI Tech Lead**** profile of the same AI team that designs, specifies and builds Bunkai TMS, under `CLAUDE.md` Critical Rule #18 (AI-led decision authority). It is ****not*** a human sign-off and must not be read as one. It is the technical companion to the AI Product Owner ruling posted alongside it. No migration was applied and no file was changed by this pass — it specifies a design, it does not execute one.

---

## AI Tech Lead — Decision: Do we widen `GET /api/v1/atcs/search` to cross-project scope, or add a new list endpoint?

***Context***: `supabase/migrations/0027*atc*search.sql` declares `public.bunkai*search*atcs(p*actor*user*id uuid, p*query text, p*project*id uuid, p*module*id uuid default null, p*layer text default null, p*limit int default 20)`. `p*project*id` has no default and line 122 filters `a.project*id = p*project*id`; the header (lines 22-27) records single-project scope as a deliberate product decision. `lib/atcs/search-validation.ts:22` makes `project*id` a required uuid. `app/api/v1/atcs/route.ts` is POST-only — no `GET` list handler exists anywhere. The shift-left comment on BK-267 (2026-08-07, question 5) names exactly these two options and blocks on the answer.

***Candidates considered***

| # | Candidate | Correctness / safety | Consistency with precedent | Impl. cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Make `p*project*id` optional on `bunkai*search*atcs` + optional on `AtcSearchQuerySchema`; widen its output to carry AC-10's columns | ***Fails**** — see rationale | Violates ADR-0009 §31 and ADR-0012 Consequences | Low upfront, high blast radius | Poor (live object, live route) | High | ****1/5*** |
| B | New sibling RPC `bunkai*list*atcs(p*actor*user*id, …)`, `SECURITY DEFINER` + actor bind, explicit `workspace*members` join; new `GET /api/v1/atcs` | Correct if written perfectly | Matches `0068`/`0069` | Medium | Good (additive) | Medium — grows ADR-0012's guarded-function count for no privilege gain | ***3/5*** |
| C | ***New sibling RPC ****`bunkai*list*atcs`****, ****`SECURITY INVOKER`****, NO actor parameter; new ****`GET /api/v1/atcs`****; ****`0027`**** and ****`/atcs/search`**** untouched**** | Highest — removes the bug class rather than guarding it | Matches `0051*bugs*list.sql` verbatim (its ratified Decision 3) | Medium | Good (additive) | Low | ****5/5*** |
| D | No RPC — assemble the list in TypeScript through `getAuth(ctx).db` with PostgREST embeds, like `lib/home/active-runs.ts` | Correct (RLS does it) | Matches BK-256/257 | Medium-high | Good | Medium — 4-5 round trips, PostgREST truncation risk `active-runs.ts` had to defend against explicitly | ***3/5*** |

***Decision****: ****Candidate C.***

1. Add `public.bunkai*list*atcs(p*workspace*id uuid, p*query text default null, p*project*id uuid default null, p*module*id uuid default null, p*layer text default null, p*limit int default 30, p*cursor*updated*at timestamptz default null, p*cursor*id uuid default null) returns jsonb`, `language plpgsql`, `SECURITY INVOKER`*** (clause omitted — plpgsql defaults to it)***, `set search*path = ''`. Returns `{ data, facets, next*cursor }`, mirroring `bunkai*list*bugs`'s `{ data, aggregates, next_cursor }`.
2. Add `export const GET` to the ***existing*** `app/api/v1/atcs/route.ts` (today POST-only), reading `?workspace*id=&query=&project*id=&module_id=&layer=&limit=&cursor=`. Wire it through `getAuth(ctx).db` — never `createAdminClient()`.
3. `bunkai*search*atcs` (`0027`), `app/api/v1/atcs/search/route.ts` and `lib/atcs/search-validation.ts` are ***not touched***. BK-20's project-scoped toolbar keeps its contract.
4. Route naming: `GET /api/v1/atcs?workspace*id=…`, following BK-41's `GET /api/v1/bugs?project*id=…`, not `GET /api/v1/workspaces/{id}/atcs`. Both precedents exist, but this endpoint carries ***two*** scope levels — workspace and an optional project narrow — and putting one in the path while the other rides a query param splits the same concept across two syntaxes. The resource root also already has a file, so the diff is one added export.

***Rationale****: Candidate A loses on two independent grounds, either of which is fatal. First, `bunkai*search*atcs` returns six keys (`id, slug, title, layer, status, module*path`); AC-10 needs the owning Project, the Module identity, the anchored User Story / Acceptance Criterion, and a "used in N tests" count. Adding those keys is a return-shape change to a live function a deployed route depends on — the exact invariant ADR-0009 §31 states: **"no migration to the shared project may change an RPC's return shape while a deployed route still depends on the old shape."** Second, `0027` is `SECURITY DEFINER` with a `p*actor*user*id` and ****no actor bind**** — one of the 22 unbound live functions ADR-0012 records as a closed, tracked debt set. Widening it to workspace scope leaves only two moves, and ADR-0012 forbids both: ship a workspace-wide DEFINER read with no bind, or retrofit the guard inline, which its Consequences section calls **"an untested security change smuggled into a diff that was never planned or reviewed for it."*

Candidate B loses to C on ADR-0012's own stated preference and on `0051`'s already-ratified reasoning. There is no privilege gap for a DEFINER function to bridge here: `atcs*select*workspace*member` (`0004*atcs.sql:93-108`) already scopes ATCs to the caller's active workspace memberships. Escalating anyway means adding a 25th function that takes a caller-supplied identity, which ADR-0012 says the invariant is forward-binding against. Candidate D is genuinely viable and is the runner-up for a browse-only first slice, but the per-row usage rollup, the cross-project keyset ordering and the facet lists cost 4-5 round trips and reintroduce the truncation hazard `lib/home/active-runs.ts:290-296` had to detect and refuse around.

***Migration classification****: ****ADDITIVE.*** One new function (`create or replace` on a name that does not exist yet), one new index, plus `revoke`/`grant`. No DDL on any existing object, no `create or replace` over a live function, no output-shape change to anything deployed. Same class as `0051`, `0059`, `0060`, `0061`.

***Precedent cited***: `supabase/migrations/0051*bugs*list.sql` (lines 25-52) · `supabase/migrations/0045*activity*stream.sql` · `app/api/v1/bugs/route.ts` + `app/api/v1/bugs/list-response.ts` · `lib/supabase/rpc.ts:611-619` · `app/api/v1/atcs/route.ts` · ADR-0009 §31 · ADR-0012 Consequences

---

## AI Tech Lead — Decision: How exactly does a workspace-wide ATC read satisfy ADR-0012's two requirements?

***Context****: ADR-0012's invariant: **"A DEFINER function taking a caller-supplied identity or scope parameter is not authorized until (a) the parameter is bound to **`auth.uid()`** at step 0, before any table read, and (b) every row that leaves the function is separately constrained to the boundary that was asserted. Satisfying (a) does not satisfy (b), and asserting the caller's own membership satisfies neither."** The live cross-tenant email disclosure fixed in `0047*activity*actor*resolve*scope.sql` came from a function whose membership assert was ****present and correct*** — `bunkai*is*workspace*member(p*workspace*id)`, unconditional, at step 0 — while the `auth.users` rows it returned were filtered only on the caller-supplied `p*user_ids`, with nothing tying those ids to the workspace that passed the gate. The assert and the disclosed resource were two different queries.

***Candidates considered***

| # | Candidate | Correctness / safety | Consistency with precedent | Cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ***INVOKER, no actor parameter; RLS ****`atcs*select*workspace*member`**** is the enforcement; ****`p*workspace*id`**** is a filter only**** | Highest — the bind requirement is discharged by construction | `0051` `bunkai*list*bugs`, `0045` `bunkai*list_activity` | Low | Good | Low, and the one residual risk is a single reviewable line | ****5/5*** |
| 2 | DEFINER + actor bind + a `scoped*atc` CTE constraining `projects.workspace*id`, every later CTE joining `scoped_atc` | Correct if written and reviewed perfectly | `0068`/`0069` | Medium | Good | Medium — every future edit must re-prove (b) | ***3/5*** |
| 3 | DEFINER + actor bind + `bunkai*assert*actor*can*read_workspace`, then select from `atcs` join `projects` with no workspace predicate | ***This is the ****`0047`**** incident, verbatim**** | None | Low | — | Critical | ****0/5*** |

***Decision****: ****Candidate 1.*** Concretely:

***(a) Actor bind.*** There is no actor parameter to bind. `bunkai*list*atcs` is `SECURITY INVOKER` and takes no identity argument, so the function cannot be told who the caller is and therefore cannot be lied to about it — ADR-0012's own preferred outcome ("prefer `SECURITY INVOKER`, or delete the identity parameter, over guarding it"), applied here for the same reason `0051` applied it. Requirement (a) is discharged by construction, not by a guard that must fire.

This holds on ***one**** condition, and it is the single load-bearing line of the whole design: ****the route MUST pass ****`getAuth(ctx).db`**** and MUST NEVER pass ****`createAdminClient()`****.*** An admin client carries no authenticated `auth.uid()`, so every RLS policy below evaluates against NULL and returns no rows — or, in a future definer variant, is bypassed entirely. `lib/supabase/rpc.ts:611-619` already writes this rule out for `listBugs` in exactly these words; the `bunkai*list*atcs` wrapper must carry the identical comment, and Stage 3 review must check that one import. Both call paths are covered: cookie sessions and PAT-minted user JWTs both produce a populated `auth.uid()` under ADR-0001 Path B, which is why `/api/v1/bugs` and `/api/v1/workspaces/{id}/active-runs` already work this way for PAT callers.

***(b) Per-row scoping.*** Every row is constrained by `atcs*select*workspace*member` (`0004*atcs.sql:93-108`), evaluated by Postgres per ATC row:

```
exists (select 1 from public.projects p
          join public.workspace*members wm on wm.workspace*id = p.workspace_id
         where p.id = atcs.project_id
           and wm.user_id = auth.uid()
           and wm.status = 'active')
```

The constraining column chain is `atcs.project*id → projects.workspace*id → workspace*members.user*id = auth.uid()`, with `wm.status = 'active'`. That is exactly AC-12 and Business Rule 3, enforced by the database rather than by a hand-written predicate a future edit can drop.

Every other table the query reaches must be reached the same way:

| CTE / join | Table | What constrains it |
| --- | --- | --- |
| `scoped*atc` | `public.atcs` | `atcs*select*workspace*member` (RLS), plus `p*workspace*id` as a ***filter*** via `projects.workspace_id` |
| `scoped_atc` | `public.projects` | `projects` RLS (`0002`); also the join source for the workspace narrow |
| `scoped_atc` | `public.modules` | `modules` RLS (`0002`); joined for `module.name` and the archived-module exclusion |
| anchors | `public.atc*acceptance*criteria`, `public.acceptance*criteria`, `public.user*stories` | RLS on each, ***and*** joined outward from `scoped_atc.id` — never inward from the raw join table |
| usage count | `public.test*steps`, `public.tests` | RLS on each, ***and*** entered only via `test*steps.atc*id in (select id from scoped*atc)` |

The join-direction rule is not stylistic. `0068*story*traceability*report.sql`'s `pair` CTE comment (lines 168-176) records that `atc*acceptance*criteria` carries no `project*id`/`workspace_id` column and no DB constraint tying the ATC and the AC to the same project — so joining against the already-scoped set, never against raw `atcs`, is the only thing preventing a mis-linked cross-project ATC from entering. BK-267 reaches the same table from the other side and inherits the same requirement.

***Stated plainly, because it is the thing that shipped as a live disclosure here****: asserting the caller's own workspace membership does ****not**** scope the result set. If a future refactor converts this to DEFINER, `perform bunkai*assert*actor*can*read*workspace(p*actor*user*id, p*workspace*id)` followed by `select … from public.atcs a join public.projects p on p.id = a.project*id` ****with no ****`p.workspace*id = p*workspace*id`**** predicate**** returns every ATC in the database to any signed-in user who self-provisions a workspace via `bunkai*bootstrap*workspace` (`0006`, granted to `authenticated`, no precondition). That is `0047`'s incident with `atcs` substituted for `auth.users`. Under Candidate 2 the mandatory shape is: a `scoped*atc` CTE that itself carries `p.workspace*id = v*workspace*id and a.archived*at is null`, with ****every*** subsequent CTE joining `scoped*atc` and none of them touching `public.atcs` again — `0068`'s `live_atc` → `pair` chain is the template to copy line for line.

`p*workspace*id`*** is a filter, not an authorization key.**** It narrows a member of several workspaces to the one the UI has active (`lib/workspaces/active.ts`, the `bk*active*ws` cookie). A forged or foreign workspace id returns `{ data: [], facets: …, next_cursor: null }` — zero rows, not an error — because RLS, not the parameter, decides what is visible. This is the documented non-disclosure posture of `GET /api/v1/workspaces/{id}/active-runs` ("a forged path segment selects nothing"). It is deliberately ****not*** an ADR-0012 scope parameter requiring a bind, and the migration header must say so, so a later reviewer does not mistake its absence of a guard for the missing-guard defect.

***If the product intent is "membership-scoped" instead of "workspace-wide"******:**** verified against the schema — ****there is no ****`project*members`**** table anywhere in ****`supabase/migrations/` (zero hits). Membership in this product exists only at workspace grain. So today the two product intents resolve to the ****same**** enforcement, and the RPC body needs no edit either way, because under Candidate 1 the boundary lives in the RLS policy rather than in the function. If genuinely per-project membership is ever intended, that is a new `project*members` table plus a rewrite of the SELECT policy on `atcs` and every sibling table scoping through `project_id`. That ****is*** a new tenancy posture, needs its own ADR, and is out of BK-267's scope — the one item in this ticket a Tech Lead should not decide inside a browse story.

***Rationale***: Candidate 1 wins because it deletes the failure class instead of defending against it, which is ADR-0012's own stated preference and `0051`'s ratified precedent for the structurally identical problem. Candidate 2 is correct but pays a permanent tax: every future edit must independently re-prove requirement (b), and this codebase's own history says that re-proof fails about as often as it succeeds. Candidate 3 is listed only so it is recognizable in review; it is the shipped-live defect.

***Migration classification****: ****ADDITIVE*** — a new function, no existing object altered.

***ADR-0012 compliance***: (a) discharged by construction (no identity parameter exists), conditional on the route passing `getAuth(ctx).db`. (b) enforced per row by `atcs*select*workspace*member`, with every secondary table either RLS-covered or entered exclusively through the already-scoped `scoped*atc.id` set. The DB-integration test is `lib/atcs/library-isolation.test.ts`, modelled on `lib/bugs/list-isolation.test.ts` and `lib/traceability/story-traceability-isolation.test.ts`, proving: a legitimate caller sees their workspace's ATCs; a foreign workspace id yields zero rows, not an error; and an ATC in a workspace the caller does not belong to never appears in the list, in a facet, or in a search result.

***Precedent cited***: `0004*atcs.sql:93-108` · `0047*activity*actor*resolve*scope.sql` · `0051*bugs*list.sql:25-52` · `0068*story*traceability*report.sql:168-176` · `lib/supabase/rpc.ts:611-619` · `lib/home/active-runs.ts:82-86` · `app/api/v1/workspaces/[id]/active-runs/route.ts:30-34` · `.claude/skills/sprint-development/references/rpc-authorization.md` §3-§5

---

## AI Tech Lead — Decision: What index does a cross-project ATC browse need that does not exist today?

***Context****: `atcs` today carries `atcs*project*id*idx (project*id)`, `atcs*module*id*idx`, `atcs*user*story*id*idx`, `atcs*tsv*gin*idx using gin (tsv)` (all `0004*atcs.sql:71-74`), plus `atcs*project*id*updated*at*idx (project*id, updated*at desc) where archived*at is null` added by `0059*home*recent*projects*indexes.sql:46-48`. Verified structural fact: `public.atcs`**** has no ****`workspace*id`**** column***. A workspace-wide read must reach the boundary through `projects`, which `projects*workspace*id*idx` (`0002*projects_modules.sql:27`) covers.

***Candidates considered***

| # | Candidate | Correctness | Consistency with precedent | Cost | Reversibility | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Add nothing — rely on `atcs*project*id*updated*at_idx` (`0059`) | Works, but the keyset's `id` tiebreak falls out of the index; heap re-check + partial sort on every page | — | Zero | — | Degrades exactly as the workspace grows | ***2/5*** |
| 2 | ***Add ****`atcs*project*id*updated*at*id*idx (project*id, updated*at desc, id desc) where archived*at is null`****; keep ****`0059`****'s index; touch nothing else**** | Full keyset tuple in index order | `0051`'s `bugs*project*id*severity*created*at*id*idx` extending `0046`'s index, exactly | One `create index if not exists` | Trivially droppable | Low | ****5/5*** |
| 3 | Candidate 2 ***plus**** `drop index atcs*project*id*updated*at_idx` | Same read path | Contradicts `0051` ("Additive: the existing index stays") | Same | Requires a restore migration | Medium — drops a live access path `listRecentProjects` uses | ****3/5*** |
| 4 | Denormalize `workspace_id` onto `atcs` + index it | Removes the `projects` join | No precedent | Column + backfill + trigger + policy review | Poor | Schema change in a browse story | ***1/5*** |

***Decision****: ****Candidate 2 — one new index, nothing else.***

```sql
create index if not exists atcs*project*id*updated*at*id*idx
  on public.atcs (project*id, updated*at desc, id desc)
  where archived_at is null;
```

Rulings on the rest of the access surface:

- ***Search path (****`p*query`**** present)******:****** no new index.*** `atcs*tsv*gin*idx` (`0004:74`) is project-agnostic — it already serves a workspace-wide `a.tsv @@ v_query` unchanged. The new RPC must build its `tsquery` with the same `'english'` regconfig `0027` uses (`0027:70-85`), for the same index-compatibility reason recorded there as Risk R1. Ranked output cannot ride a btree; that is already true of `0027` and is accepted, not a regression.
- `layer`*** filter******:****** no index.*** A three-value domain applied to a candidate set already bounded by workspace and page size. An index here would be cargo cult.
- ***"Used in N tests" (AC-10)******:****** no index.**** `test*steps*atc*id*idx` (`0024*tests.sql:72`) already serves the batched `count(distinct test*id) … where atc*id = any(<page's ids>) group by atc*id` rollup. The aggregate is computed over the ****page***, not the workspace — 30 ids, one grouped scan, the shape `lib/home/active-runs.ts`'s `readStepRollups` uses.
- ***Facet lists (Project / Module)******:*** derived from the full filtered set inside the same statement, the way `bunkai*list*bugs` computes `by*severity`/`by*status` from its `filtered` CTE — never client-side, never from the returned page only.

***Redundancy, and the deliberate decision not to act on it****: `atcs*project*id*updated*at*idx` (`0059`) is a strict column prefix of the new index and shares its partial predicate, so it becomes logically redundant the moment this ships. ****Do not drop it in this migration.**** `0051` set the precedent explicitly when `bugs*project*id*severity*created*at*id*idx` superseded `0046`'s index: **"Additive***:**** the existing index stays, both are cheap on this table's expected cardinality."** Dropping it here would change the plan for `listRecentProjects` (`lib/home/recent-projects.ts`) — a `/home` access path BK-267's test outlines never exercise — and the narrower index may still be the planner's choice there. File the drop as a follow-up tech-story with its own `/home` verification.

One disclosed operational note: this is a plain `create index`, which takes an `ACCESS EXCLUSIVE` lock on `atcs` for its duration. `0059`, `0060` and `0061` all did exactly this against the same shared project and `atcs` is small; `concurrently` is unnecessary and would forbid running inside the migration transaction. Stated so the choice is visible rather than assumed.

***Migration classification****: ****ADDITIVE.*** One `create index if not exists`, no DDL on any existing object, no behavioural change, re-runnable. Ships in the same file as the `bunkai*list*atcs` function, matching `0051`'s two-section layout.

***ADR-0012 compliance***: An index changes no authorization surface — it alters which plan Postgres picks, never which rows RLS admits. Worth stating because the same non-sequitur ("we added an index to make the cross-project read fast, so the read is cross-project-safe") is how a scoping gap gets rationalized.

***Precedent cited***: `0051*bugs*list.sql` (index section) · `0059*home*recent*projects*indexes.sql` · `0060*home*active*runs*index.sql` · `0061*home*open*bugs*index.sql` · `0004*atcs.sql:71-74` · `0024*tests.sql:72` · `0002*projects*modules.sql:27` · `0027*atc*search.sql:70-85`

---

## AI Tech Lead — Decision: What is BK-267 actually worth, against its current 1 story point?

***Context****: BK-267 is recorded at ****1 SP****. That value predates the story's own acceptance criteria: `story.md` records Created 2026-08-04, while the 14 AC blocks / 19 Gherkin scenarios were written in on 2026-08-07 by the shift-left session, which itself concluded **"Significant Issues"*. The 1 SP is a stale pre-refinement number, not an estimate of the story as written.

***Calibration against shipped stories, measured from git, not from memory***

| Story | SP | AC / scenarios | Merge diff | Code-only | New page route | New API route | Migration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BK-45 (`f75709e`) | ***8*** | 7 AC / 8 scenarios | 22 files, +3204/−24 | 15 files, +2308/−2 | 1 | 1 (+openapi) | `0068`, 327 lines |
| BK-48 (`2396847`) | ***5*** | 6 AC / 28 scenarios | 9 files, +1238/−25 | 8 files, +1237/−25 | 0 | 0 | `0069`, 209 lines |
| BK-50 (`7b16c0c`) | ***5*** | 6 AC / 5 scenarios | 12 files, +877/−94 | 4 files, +521/−17 | 0 | 0 | none |
| ***BK-267**** | ****1 (stale)**** | ****14 AC / 19 scenarios**** | — | — | ****1**** | ****1**** | ****1, additive*** |

Two calibration facts worth carrying, because they cut against the obvious reading. ***Scenario count is a weak predictor****: BK-48 had 28 scenarios at 5 SP because it added a filter layer to a screen that already existed. ****New-surface count is the strong predictor***: BK-45 is the only one of the three that opened a new page route, a new API route and a new RPC in one story, and it is the only 8. BK-267 opens all three, and carries more interaction surface than BK-45 did on top (BK-45 had six render states and no search, no filters, no keyboard handling and no pagination).

Also on record from `git`: BK-50's plan forecast ~275 lines and shipped 521 — ***1.9x***. BK-45's forecast of ~2200 landed at 2308 (+5%). Plan-time forecasts here run accurate on large stories and low by roughly 2x on small ones, which argues against optimism at the bottom of the range.

***Estimate for BK-267 AS WRITTEN******:****** 8 SP, honest range 8-13.***

8 is the floor because BK-267's surface is a strict superset of BK-45's at equal architectural depth, and the INVOKER design makes two things genuinely cheaper than BK-45's: no actor-bind spoofing cases in the isolation suite (there is no actor parameter to spoof), and the cursor reuses `lib/pagination/keyset-cursor.ts`'s existing `(timestamp, id)` codec verbatim. 13 is the ceiling and becomes the right number if AC-10 stays whole: the per-row usage rollup plus the US/AC anchor columns add two join families that BK-45's RPC never carried, each landing on the `atc*acceptance*criteria` scoping hazard documented in `0068`'s `pair` CTE. Expected code volume 2200-2600 lines.

***Slice estimates, aligned to the AI Product Owner's three-way split***

| Slice | Content | Estimate |
| --- | --- | --- |
| ***A — Browse + navigate**** (first shippable) | `/atcs` route, sidebar enablement, `bunkai*list*atcs` + index migration, `GET /api/v1/atcs`, keyset-paginated list, loading / nothing-found / error-with-retry states, row → owning-project navigation with toast, isolation test suite | ****5 SP*** (range 5-8) |
| ***B — Search + keyboard**** | `p_query` on the same RPC, debounced incremental narrowing, `/` focus, Esc clear | ****3 SP*** (range 2-3) |
| ***C — Filters + row enrichment**** | Project / Module / layer facets combining with AND, clear-all | ****3 SP*** (range 3-5) |

***One divergence from the AI Product Owner's split, stated rather than smoothed over.**** The PO ruling places AC-10 (the "used in N tests" count and the US/AC anchor columns) inside slice A, on the product-fidelity argument that a row missing columns is a half-built row. This ruling costs AC-10 as the single most expensive element in the story — the two extra join families are exactly what moves the monolith from 8 to 13. Both readings are defensible. ****Resolution adopted******:****** AC-10 stays in slice A per the PO ruling, and slice A is therefore sized 5-8 rather than a flat 5, with AC-10 named explicitly as the cost driver.*** Whoever plans slice A should size it after reading `0068`'s `pair` CTE, not before.

The slices sum to 11 against 8 for the monolith, and that gap is real rather than an arithmetic error: three PRs, three code reviews, three staging verifications and two rounds of re-testing the AC that straddles B and C cost something. Split for shippability and risk isolation, not to reduce total effort.

***Rationale***: The competing estimates are "leave it at 1" (indefensible — 1 SP does not buy a migration, and the story needs one), "3 SP" (assumes the search endpoint can simply be widened, which the T1 ruling refutes), and "13 flat" (defensible but prices AC-10's full join surface as certain). 8 with a stated 13 ceiling and an explicit trigger for it — AC-10 surviving intact — is the estimate that stays honest under either outcome.

***Precedent cited***: `git show --stat f75709e` (BK-45) · `2396847` (BK-48) · `7b16c0c` (BK-50) · `lib/pagination/keyset-cursor.ts` · `components/layout/AppSidebar.tsx:170`

---

### Ely - 8/13/2026, 3:49:28 PM

## AI Product Owner — BK-267 superseded by BK-439 / BK-440 / BK-441

> ***INFO******:**** Posted by an automated run executing the ruling above rather than making a new decision. Authored by the ****AI Product Owner / Business Analyst*** profile under CLAUDE.md Critical Rule #18. Not a human PO sign-off.

### What happened

The AI Product Owner ruling on this ticket (comment 12315) found this story oversized and not implementable at its recorded 1 SP against 14 AC blocks / 19 scenarios, and sliced it three ways. The AI Tech Lead ruling (comment 12316) partitioned the architecture decisions across those slices and independently sized them. That slicing is now materialized:

| Slice | Story | Points | Depends on |
| --- | --- | --- | --- |
| a | [BK-439](https://jira.upexgalaxy.com/browse/BK-439) — TMS-ATC Library | Browse every ATC in the workspace from one index | 5 | nothing |
| b | [BK-440](https://jira.upexgalaxy.com/browse/BK-440) — TMS-ATC Library | Find an ATC by name as you type | 3 | BK-439 |
| c | [BK-441](https://jira.upexgalaxy.com/browse/BK-441) — TMS-ATC Library | Narrow the index by Project, Module, layer and anchor | 3 | BK-440 |

Total 11 SP against the 1 SP recorded here, which is the sizing correction the rulings called for. Each successor carries its own acceptance criteria (copied and adjusted from this ticket's AC-01 through AC-14), scope, out-of-scope, business rules and workflow, derived from this ticket's fields and narrowed by the rulings above.

### Amendments applied while materializing

- ***AC-04's Cmd+K / Ctrl+K scenario is retired*** and does not carry into BK-440 — it collides with BK-398's command palette binding on the same chord. "/" and Esc carry over; Cmd+K does not.
- ***Search matches ATC name only, not ATC id***, in BK-440 — resolving the disagreement between this ticket's own design artifacts in the AI Product Owner ruling's favor.
- ***Sizing for BK-440 (slice b) carries two independent estimates, both on record***: the AI Tech Lead ruling sizes it at 3 SP; the AI Product Owner ruling independently proposed 2 SP. 3 SP is recorded on the ticket (sizing is the Tech Lead's remit); the dissenting 2 SP estimate is kept in BK-440's own description rather than silently dropped.

### Status

Transitioning this ticket to ABORTED. That is this workflow's only terminal non-success state and it means "will not be delivered" — accurate here, since the ticket will not be delivered **as written**. The work is not cancelled; it is carried in full by BK-439, BK-440 and BK-441. Nothing was deleted: this ticket, its fields, and both rulings above remain readable as the record of where the three successors came from.

---


_Synced from Jira by sync-jira-issues_
