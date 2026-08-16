# Comments for BK-229

[View in Jira](https://jira.upexgalaxy.com/browse/BK-229)

---

### Ely - 7/11/2026, 12:52:49 PM

## PO Ratification — 2026-07-11

- B1 ratified: Cloud tier ladder is Free / Team / Enterprise; Free is a real entry tier.
- B2 ratified (v1 targets, may be tuned pre-GA): Free = 5 seats, 3 projects, 90-day run-history retention. Team = unlimited projects, unlimited run history, per-seat billing (prices intentionally unpublished). Enterprise = custom terms. These are the values the seat and usage meters render against.
- B3 confirmed: owner manages billing; admins get a read-only billing view.

---

### Ely - 7/30/2026, 1:30:17 PM

Mockup — Settings — Billing overview (plan, seats, usage). Source: .context/designs/bunkai-test-management-tool/bk-224-billing/billing-overview.html · spec: master-design-plan §4.15



---

### pinto.lucas.nahuel - 8/13/2026, 8:04:37 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

***Shift-Left refinement completado el 2026-08-13.***

### Resumen

- ***ACs refinados******:*** 17 escenarios (5 originales + 12 nuevos)
- ***ATP outlines******:*** 18 (7 Positive / 3 Negative / 8 Boundary)
- ***Risk level******:*** MEDIUM

### Decisiones PO/Dev aplicadas

1. Admin PUEDE ver billing
2. Exceso de seats muestra "11 of 10" en estado limit-reached
3. Free plan: 3 projects, 5 seats, 30-day retention
4. Seat counting: solo `status = 'active'`
5. Sin auto-refresh
6. Usar tokens existentes del design system

### Gaps cubiertos

- Exacto 80% boundary (warning state)
- Run history retention meter (paid + free)
- API timeout (loading → error)
- Enterprise plan (Custom price)
- Suspended members
- Zero active members
- Exceeded seat limit

### Próximos pasos

Cuando esta story llegue a ***Ready For QA***, ejecutar `/sprint-testing` — detectará el label `shift-left-reviewed` y acortará las fases 1-3.

***QA Assignee******:*** pinto.lucas.nahuel

---

### pinto.lucas.nahuel - 8/13/2026, 9:50:12 PM

@@Ely Ready For Dev

---

### Ely - 8/16/2026, 3:30:55 PM

> ***NOTE:**** Decided autonomously by the ****AI Tech Lead**** profile under CLAUDE.md Critical Rule #18. ****No human sign-off is implied or claimed.*** These are technical rulings on data-access and migration SHAPE. The tier ladder VALUES and the tier naming are the AI Product Owner's to set, and are flagged as such below.

Scope of this comment: three technical questions on BK-229, each scored against concrete alternatives. Prior art was searched before deciding; where a standing ruling already exists it is ***followed and cited***, not re-derived.

---

## AI Tech Lead — Decision: Where do the plan-limit numbers live?

The tier ladder (per-tier seat limit, project limit, retention days, price) exists ***nowhere as data*** today. Live DB carries only `workspaces.plan` (`text`, default `community`, CHECK `community|cloud|enterprise`, 373 rows all `community`). No seat limit, project limit, retention limit, price, subscription or invoice anywhere. 71 migrations, none billing-related.

### Candidates scored

Criteria, 5 points each (max 25): ***SoT**** = one source of truth for both display (BK-229) and server-side enforcement (BK-230/232/233) · ****Change cost**** = cost to tune a limit later · ****Testability**** · ****Impl cost**** · ****Reversibility***.

| Candidate | SoT | Change | Test | Impl | Rev | Total |
| --- | --- | --- | --- | --- | --- | --- |
| ***A. Seeded reference table ****`plan_tiers` | 5 | 5 | 5 | 3 | 5 | ****23*** |
| B. TypeScript constant module | 2 | 4 | 4 | 5 | 5 | 20 |
| C. JSONB column on `workspaces` | 3 | 2 | 3 | 3 | 3 | 14 |
| D. Postgres enum + CHECK-driven function | 4 | 1 | 3 | 2 | 2 | 12 |

### Winner: A — a seeded reference table `plan_tiers`. 23/25.

***Why A beats B***, which is the only real contender: a TypeScript constant is invisible to Postgres. `0065*atc*tags*cap*guard.sql` exists precisely because the API layer was bypassable — both ATC write RPCs are granted to `authenticated` and therefore directly callable via PostgREST, so the zod cap in the route was not a gate at all. Every enforcement story in this epic (BK-230 upgrade, BK-232 plan-limit warnings, BK-233 downgrade) will need the limits where a DB-level guard can read them. B forces all enforcement into the route layer and re-creates the exact hole 0065 was written to close.

***Why A beats C***: per-workspace JSONB duplicates the ladder across 373 rows and makes "change the Free seat limit" a bulk UPDATE. Per-workspace overrides are a different feature (custom Enterprise terms) and are not in this story.

***Why A beats D****: changing a number would mean `CREATE OR REPLACE` on a function, i.e. a code-shaped migration for a data change, and altering an enum type is a destructive migration. The values in this ticket have ****already*** moved once (see the contradictions below), so optimising for cheap tuning is not hypothetical.

***Precedent this follows***: `feature*flags` is the shipped example of a globally-readable reference table with RLS on (`feature*flags*select*global`, `qual: scope = 'global'`). `plan_tiers` copies that posture.

***Bonus this buys****: the table carries `display_name`, which turns the Free/Team/Enterprise naming question into ****data*** rather than a hardcoded presentation map or a schema rename. See TQ3.

---

## AI Tech Lead — Decision: How does the screen read its data, and under what authorization?

### Standing precedent — FOLLOWED, not re-derived

The ***BK-267 ruling (comment ****`12316`****)**** states: for a workspace-wide read over an RLS-covered table, prefer `SECURITY INVOKER` with ****no actor parameter**** over a DEFINER function with an actor bind, with the single load-bearing condition that the route passes `getAuth(ctx).db` and ****never**** `createAdminClient()`. That ruling was ****FOLLOWED again by BK-398 (comment ****`12406`****)*** for `bunkai*search*workspace` (`0071*workspace*search.sql`), over that ticket's own self-ratified `SECURITY DEFINER` spec.

***I am following the BK-267 ruling, as applied by BK-398.*** It applies here for the same reason and one stronger one.

### Candidates scored

Criteria, 5 points each (max 25): ***Precedent**** conformance · ****ADR-0012**** (deletes the failure class vs merely guards it) · ****Seat-count correctness**** · ****Round-trips**** · ****Cookie/PAT parity*** (ADR-0001).

| Candidate | Prec | ADR-0012 | Seats | Trips | Parity | Total |
| --- | --- | --- | --- | --- | --- | --- |
| ***A. One ****`SECURITY INVOKER`**** RPC, NO actor param, via ****`getAuth(ctx).db` | 5 | 5 | 5 | 5 | 5 | ****25*** |
| B. `SECURITY DEFINER` RPC with `p*actor*user_id` + actor bind | 1 | 2 | 5 | 5 | 3 | 16 |
| C. Direct PostgREST table selects from the client | 3 | 4 | 5 | 2 | 2 | 16 |
| D. API route running several separate queries | 3 | 4 | 5 | 2 | 5 | 19 |

### Winner: A — a single `SECURITY INVOKER` RPC with no actor parameter. 25/25.

### The check that had to be run rather than assumed

BK-398's rationale was that all six of its entity tables carry a plain workspace-member SELECT policy, so INVOKER inherits the boundary on every branch. ***That is not uniformly true here, and the difference is load-bearing.*** Live-verified policy on `workspace_members`:

```
workspace*members*select*self*or_admin
  qual: (user*id = auth.uid()) OR bunkai*is*workspace*admin(workspace_id)
```

Under INVOKER, a plain `count(**)` over `workspace_members` therefore returns ****1**** for a `viewer` or `member` caller — not the true seat count. This is not theoretical: live data shows ****12 non-owner members**** (7 `member`, 5 `viewer`) across ****8 workspaces*** that would hit it today.

That would normally sink option A. ***It does not here, because BK-229's own access rule makes the two boundaries identical.**** AC scenarios 9-11 and business rule 1 restrict the Billing view to ****owner and admin****; `bunkai*is*workspace*admin` is exactly `role in ('admin','owner') and status = 'active'` (`0005*rls_helpers.sql:52-67`). Every authorised viewer of this screen passes the policy and sees all rows, so the count is exact for the entire intended audience — and degenerate for exactly the callers who are not supposed to be there. It ****fails closed by construction***.

The remaining usage tables are unaffected — all live-verified as plain member policies: `projects`, `atcs`, `tests`, `runs`, `bugs`, `modules` all use `bunkai*is*workspace*member(...)`, and `workspaces` uses `bunkai*is*workspace*member(id)`.

### An accidental control is not a control

I am ***not*** letting the admin gate emerge from "the count happens to come back as 1". It is asserted explicitly, twice:

- ***In the RPC, at step 0***, before any table read: `if not public.bunkai*is*workspace*admin(p*workspace_id) then return null; end if;`. That helper is itself `SECURITY DEFINER` and binds internally to `auth.uid()`, so it takes no caller-supplied identity and cannot be lied to.
- ***In the route***: the same null collapses to `404 not_found`, never `403` — non-disclosure, matching the repo's uniform P0002 convention.

### ADR-0012 compliance, both limbs stated separately

| Limb | Status |
| --- | --- |
| ***(a) Actor bind**** | ****N/A by construction.*** The function takes no caller-supplied identity parameter; the only identity is `auth.uid()`. This is ADR-0012's own stated preferred outcome and `rpc-authorization.md` §2's "the strongest fix is deleting the parameter". The class is removed, not guarded. |
| ***(b) Result scoping**** | `p*workspace*id` is a ****narrowing filter only, never the authorization boundary***. Under INVOKER every table read re-evaluates its own SELECT policy against the real `auth.uid()`, so a forged or foreign workspace id intersects to zero rows. A parameter cannot WIDEN the result set. Same non-disclosure property as `bunkai*list*activity` (`0045`) and `bunkai*search*workspace` (`0071`). |

### A finding that retires an old justification

The `0027` / `0029` reason for reaching for DEFINER with an explicit actor parameter — **"PAT callers carry no **`auth.uid()`**"** — is ***obsolete**** under ADR-0001 Path B. `lib/api/principal.ts` resolves a Bearer PAT through `impersonatingClient()`, which mints a per-request user JWT so PostgREST treats it as that user's session and `auth.uid()` resolves identically for cookie and Bearer callers. `principal.db` is RLS-scoped for ****both***. That removes the last standing reason to prefer DEFINER on this route, and it is why option A scores full marks on parity where B does not.

The escalation log's standing finding also applies to B: the DEFINER actor bind is ***inert on the real call path*** wherever a route reaches the RPC via `createAdminClient()`, because `auth.uid()` is then NULL. Option A cannot regress into that state, because it produces an empty result rather than a wrong one.

### Grants

```sql
revoke execute on function public.bunkai*workspace*billing_overview(uuid) from public, anon;
grant  execute on function public.bunkai*workspace*billing*overview(uuid) to authenticated, service*role;
```

`anon` and `public` are explicitly excluded, matching `0071:289-290`. Billing data must not be reachable without a session; there is no anonymous surface for this screen.

---

## AI Tech Lead — Decision: Migration shape and count

### Ruling: ONE migration. Every change ADDITIVE. No destructive change.

| # | Object | Classification |
| --- | --- | --- |
| 1 | `create table public.plan*tiers` + `enable row level security` + a global read policy modelled on `feature*flags*select*global` | ADDITIVE (new object) |
| 2 | Seed the three tier rows via `insert ... on conflict (plan_key) do nothing` | ADDITIVE (new rows) |
| 3 | `create ... function public.bunkai*workspace*billing_overview(uuid)` + grants | ADDITIVE (new function name) |

All three ship in one slice and none is useful without the others, so they belong in one file. ***Nothing existing is changed*** — no `CREATE OR REPLACE` over a live object, no column added to a live table, no constraint altered. Later value tuning is a NEW migration, never an edit to an applied one.

Deliberately ***not*** included: a foreign key from `workspaces.plan` to `plan*tiers.plan*key`. It would constrain a live 373-row table that the write stories (BK-230/233) will immediately need to change. `plan_tiers` carries its own CHECK mirroring the `workspaces.plan` domain instead. The FK is a reasonable follow-up once the ladder stops moving.

### Ruling on the naming question: `workspaces.plan` values are NOT renamed.

This is the destructive option and it is ***rejected***. A rename rewrites a live object's output and would touch:

- 373 live rows, all currently `community`
- the CHECK constraint `community|cloud|enterprise`
- the shipped OpenAPI contract `z.enum(['community', 'cloud', 'enterprise'])` in `app/api/v1/workspaces/route.openapi.ts:9` ***and*** `app/api/v1/me/route.openapi.ts:14`
- `WorkspacePlan` in `lib/types.ts:12`
- four `.select('... plan ...')` call sites under `app/api/v1/workspaces/`

That is a backend refactor performed in service of UI vocabulary, which ***Critical Rule #15 forbids**** — UI fidelity is maximised **without* backend refactors. The Free/Team/Enterprise vocabulary is carried by `plan*tiers.display*name`: a data mapping, not a schema change, and not a hardcoded presentation map either.

### What is the AI Product Owner's to set, not mine

I rule on SHAPE. ***The AI Product Owner sets the VALUES*** — which display label each storage key carries, and every number in the seed. The seed cannot be written until they rule, because the ticket currently contradicts itself in three places:

| Conflict | Older source | Newer source |
| --- | --- | --- |
| Free retention | comment `11115` ratified ***90 days**** | AC scenario 7 says ****30 days*** |
| Team limits | comment `11115` ratified "unlimited projects, unlimited run history" | AC 1 / 3-6 / 8 render Team against finite limits (10 projects, 10 seats, 90-day retention) |
| Enterprise limits | story.md AC6 says "Unlimited" for seats and projects | AC field's Enterprise scenario shows a finite "15 of 50 seats" |

***The shape accommodates either ruling with no schema change***: `null` in a limit column means unlimited, and the RPC returns `null` for that meter so the UI renders "Unlimited" with no bar. Whichever way the PO rules, this migration does not change.

### Where the migration number comes from

`0072` is next-free ***from the live ledger*** — `mcp_*supabase**list*migrations` on project `fmbpikzpkafptqximhxn`, read this session: highest applied is `20260815184349 / 0071*workspace*search`.

> ***WARNING:**** The implementer MUST re-query the live ledger immediately before writing the file and use whatever is next-free ****then***. Never `ls supabase/migrations/`. The local directory and the remote ledger have already diverged in this repo: the ledger shows `0046` applied after `0050`, `0058` applied after `0065`, and a `0068*story*traceability*report*v2` with no counterpart file. `0044*leave*workspace.sql`'s own header documents a live collision where 0042/0043 were taken by a concurrent unmerged branch.

---

## Technical contract for the implementing agent

### Table DDL

```sql
create table if not exists public.plan_tiers (
  plan_key             text primary key
                       check (plan_key in ('community', 'cloud', 'enterprise')),
  display_name         text not null,
  seat_limit           int,
  project_limit        int,
  retention_days       int,
  price*per*seat_cents int,
  price_note           text,
  is_paid              boolean not null default false,
  sort_order           int not null,
  created_at           timestamptz not null default now()
);

comment on table public.plan_tiers is
  'Reference data for the Bunkai Cloud tier ladder. NULL in any **limit column means unlimited. plan*key mirrors the workspaces.plan CHECK domain; display_name carries the UI vocabulary so storage keys never need renaming.';

alter table public.plan_tiers enable row level security;

create policy plan*tiers*select*authenticated on public.plan*tiers
  for select using (auth.uid() is not null);
```

No INSERT/UPDATE/DELETE policies: with RLS enabled and no write policy, `authenticated` cannot mutate tier data at all. Only migrations and `service_role` can. That is intended — tier values are operator data.

### RPC signature and security mode

```sql
create or replace function public.bunkai*workspace*billing_overview(
  p*workspace*id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
```

Returns `null` for a non-admin caller, an unknown workspace, or a workspace the caller cannot see — one uniform outcome, no existence disclosure. The route maps `null` to `404`.

Required body order (do not reorder — step 0 precedes every table read):

1. `if not public.bunkai*is*workspace*admin(p*workspace_id) then return null; end if;`
2. Read `workspaces.plan` for `p*workspace*id`; `null` result returns `null`.
3. Join `plan*tiers` on `plan*key = plan`.
4. `count(**)` over `workspace*members` where `workspace*id = p*workspace*id and status = 'active'` — ****active only***, per business rule 2; pending and suspended do not consume a seat.
5. `count(*)` over `projects` where `workspace*id = p*workspace_id`.
6. Retention usage from `runs.created_at`.

### Column facts verified live — do not assume otherwise

| Fact | Consequence |
| --- | --- |
| `projects` has ***no**** `archived*at` column | The project count takes ****no*** soft-delete predicate. `modules` and `atcs` do have `archived*at`; `projects` does not. Copying a neighbouring count would be wrong. |
| `workspaces` has ***no*** `updated*at` column | Columns are `id`, `slug`, `name`, `owner*user*id`, `plan`, `created*at` only. |
| `runs` has `created*at`, `updated*at`, `status`, `workspace*id` | Retention usage derives from `created*at`. |
| `workspace_members.status` CHECK is `active / invited / suspended` | Matches business rule 2 directly. |

### Route contract

`GET /api/v1/workspaces/{id}/billing`, following the `coverage` sibling: `withApiHandler(..., { auth: 'required' })`, client from `getAuth(ctx).db` — ***never*** `createAdminClient()`, or `auth.uid()` is NULL and every policy silently empties. Not a `workspace:admin` write operation, so it does not call `assertWorkspaceContext` (ADR-0006 binds a PAT to its own workspace for admin operations only).

### Test contract (`rpc-authorization.md` §5 — binding)

A route test that mocks `db.rpc` proves nothing. The DB-integration test ships ***in the same slice as the migration*** and must cover, against the real database:

1. An owner and an admin each get the true seat count.
2. A `member` and a `viewer` get `null` (not a wrong number, and not a partial payload).
3. A foreign workspace id from an authenticated non-member returns `null`, indistinguishable from an unknown id.
4. A tier row with `null` limits surfaces `null` meters rather than zero.

### Open semantic for the AI Product Owner

"Current usage against a retention limit" has no single obvious reading. The technical options are the ***age in days of the oldest retained run**** (`now() - min(runs.created_at)`), or a ****count of runs older than the limit***. I default the contract to the first, as it is what a meter reading "45 of 90 days" implies. The PO should confirm; changing it is a body edit, not a schema change.

---

***Rulings above are binding on BK-229 implementation.**** Follow them; do not re-derive. Alternatives were scored, not asserted. Decided by the AI Tech Lead profile under Critical Rule #18 — ****not human-reviewed, and not to be represented as such.***

---

### Ely - 8/16/2026, 3:31:14 PM

> ***NOTE:**** These two rulings were made ****autonomously by the AI Product Owner / Business Analyst profile**** under Critical Rule #18 of this repo's `CLAUDE.md`. ****No human sign-off is implied or claimed.*** Bunkai TMS has no human PO; open product questions on a ticket are decided by this profile, published here attributed, and followed by later agent runs. Anything below may be reversed by a human at any time — but until it is, it is the governing answer and is not to be re-derived per ticket.
Decided 2026-08-16. Deciding profile: AI Product Owner / Business Analyst.

## AI Product Owner — Decision: Does the Billing epic's "parked post-MVP" status still govern, now that BK-229 is Ready For Dev with a completed shift-left refinement?

***RULING******:****** The parking order does NOT still govern. BK-229 is built now.*** `master-design-plan.md:448` is a stale description of the 2026-07-30 board, not a product ruling, and its own stated premise is now false.

### The contradiction, stated exactly

`master-design-plan.md:448` reads: **"none of BK-229-BK-233 are Ready For Dev - the whole epic is deliberately parked Backlog, post-MVP"**. Live tracker state disagrees: BK-229 is at `Ready For Dev`, shift-left refinement completed 2026-08-13 (17 AC scenarios, 18 ATP outlines, zero open questions, QA owner `pinto.lucas.nahuel` named), and BK-230 has moved to `Shift-Left QA`. Recorded as ***DISCREPANCY D3*** across three consecutive delivery runs (2026-08-14, 2026-08-15) without ever being adjudicated. This ruling closes it.

### Candidates scored

Criteria, each 1-5: ***PV**** product value now · ****CO**** user coherence / dead-end risk · ****PR**** consistency with existing precedent · ****CN**** cost of NOT building · ****RV*** reversibility + risk.

| # | Candidate | PV | CO | PR | CN | RV | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Build BK-229 now; strike the parking note**** | 4 | 3 | 5 | 5 | 4 | ****21 / 25*** |
| B | Hold the epic parked; demote BK-229 back to `Backlog` | 1 | 4 | 2 | 1 | 3 | 11 / 25 |
| C | Ship a reduced read-only "plan name" chip only, defer meters | 2 | 4 | 2 | 2 | 4 | 14 / 25 |
| D | Build it, hide it behind a feature flag until BK-230 ships | 2 | 3 | 2 | 4 | 4 | 15 / 25 |

### Why A wins

***The note's premise is dead.*** §4.15 parks the epic because it "depends on BK-1 Tenancy/Identity and BK-87 Settings hub". Both shipped. The Settings hub is live at `/settings/account`, `/settings/tokens`, `/settings/workspaces`, `/settings/notifications`, and `lib/settings/nav-items.ts` already carries `{ id: 'billing', href: null }` as an inert `soon` entry — an empty socket built specifically to receive this story.

***The precedent is already set, in this same document.**** §4.13 Notifications carried the identical "post-MVP · build 0%" label from the same 2026-07-30 mockup batch. It was promoted and shipped anyway (BK-209 / BK-213, migration `0053_notifications.sql`, live route, and `nav-items.ts` cites **"master-design-plan.md §4.13***:**** Notifications now LIVE in the nav"**). A §4.x build-order note has already been overtaken by delivery once without anyone treating it as a broken contract. It is a snapshot of the board, not an order.

***Refusing an 8 SP story that is fully refined, fully mocked, and whose host screen is shipped is the expensive option.*** Option B discards a completed QA refinement and re-opens the same discrepancy on every future audit run — which is exactly what has already happened three times.

### Is a plan/seat/usage screen coherent before payments exist? Yes — with one binding clause

The honest objection to A is a dead end: a screen that shows a plan with no way to change it. Ruled as follows, and this clause is ***binding on the implementation***:

***BK-229 ships the upgrade entry point as an inert, honest affordance — never a live control that 404s.**** It renders present-but-disabled with a textual `soon` tag (structural difference plus text, never colour alone), matching two shipped precedents: the Settings hub's own coming-soon nav idiom (`nav-items.ts`, §4.10 / `settings-coming-soon.html`) and D23(c)'s refusal to build a drill-through to a screen that does not exist. AC's **"he sees an option to upgrade to a paid plan"** is satisfied by an entry that ****names the path***; it does not require a working checkout, which BK-229's own Out Of Scope assigns to BK-230. When BK-230 ships, that affordance becomes a live link and nothing else on this screen changes.

With that clause the screen is not a dead end — it is the first honest answer to "what is this workspace consuming?", a question no surface in the product currently answers at all.

### Consequential instructions

1. `master-design-plan.md:448`*** must stop contradicting reality.*** Exact replacement wording supplied at the end of this comment.
2. ***BK-231 / BK-232 / BK-233 stay ****`Backlog`****.*** This ruling promotes nothing but BK-229; BK-230's own promotion is its shift-left's call, not this one's.
3. ***This ruling closes DISCREPANCY D3*** in `.session/autonomous-delivery/escalation-log.md`. Do not re-litigate it.

---

## AI Product Owner — Decision: The tier ladder — canonical numbers, and how the UI vocabulary maps onto the shipped `workspaces.plan` values

***RULING******:****** One canonical ladder, published below. The database is NOT renamed; the UI maps over the shipped values, and the shipped values keep their meaning.***

### The mess this resolves

Five sources state the ladder and ***no two agree***:

| Source | Date | Free / entry tier | Paid tier | Enterprise |
| --- | --- | --- | --- | --- |
| PO ratification (this ticket, comment) | 07-11 | 5 seats · 3 projects · 90d | unlimited projects · unlimited history · price unpublished | custom |
| `billing-overview.html` (BK-229 mockup) | 07-30 | 3 seats · ***1**** project · 14d · $0 | $12/seat · ****12***-seat demo tenant · 10 projects · 90d | — |
| `plan-comparison-checkout.html` (BK-230 mockup, same batch) | 07-30 | 3 seats · ***2**** projects · 14d · $0 | $12/seat · ****up to 25**** seats · ****unlimited*** projects · 90d | unlimited · unlimited · unlimited · Custom |
| `domain-glossary.md` §3 + anti-glossary | 08-12 | vocabulary only: `community` / `cloud` / `enterprise`; "Free / Team / Enterprise" ***banned*** |  |  |
| Shift-left AC (this ticket) | 08-13 | 5 seats · 3 projects · 30d | ***10****-seat limit · 10 projects · 90d | "****50****-seat limit" in one scenario, "****Unlimited***" in AC6 |

Two of these contradict **themselves**: the two mockups in the ***same batch, same day*** disagree on free-tier projects (1 vs 2), and the AC gives Enterprise both a 50-seat limit and "Unlimited" seats. That self-contradiction is the single most useful fact here — it establishes which numbers were designed and which were generated fixtures.

### (a) The canonical tier ladder — RATIFIED

|  | ***Community**** | ****Cloud**** | ****Enterprise*** |
| --- | --- | --- |
| `workspaces.plan` literal | `community` | `cloud` | `enterprise` |
| Display name | Community | Cloud | Enterprise |
| Seats | ***5**** | ****25**** | ****Unlimited*** |
| Projects | ***3**** | ****50**** | ****Unlimited*** |
| Run-history retention | ***30 days**** | ****90 days**** | ****Unlimited*** |
| Price per seat / month | ***$0**** | ****$24**** | ****Custom*** |
| Renewal date | none — "No active subscription" | real renewal date | per contract |

Every number above is a constant in ***one*** module. None is a schema change. The whole ladder is a code edit to revise.

***Candidate ladders scored.**** Criteria, each 1-5: ****IC**** internal consistency of the source · ****BM**** agreement with `business-model.md` · ****MR**** can every meter BK-229's own mockup draws actually render · ****EN**** enforceable later by BK-232 · ****RV*** reversibility / commercial risk.

| # | Candidate | IC | BM | MR | EN | RV | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | Mockup-literal | 2 | 2 | 4 | 3 | 3 | 14 / 25 |
| L2 | AC-literal | 2 | 3 | 5 | 5 | 3 | 18 / 25 |
| L3 | PO-ratification-literal | 4 | 4 | 1 | 2 | 3 | 14 / 25 |
| ***L4**** | ****Reconciled ladder (above)**** | ****5**** | ****5**** | ****5**** | ****5**** | ****5**** | ****25 / 25*** |

***Reasoning, number by number.***

***Community seats = 5, projects = 3.*** The PO ratification (07-11) and the shift-left AC (08-13) — two independent sources five weeks apart — agree exactly. The only dissent is the mockup's Free block, which is the least reliable data in the entire batch: its two screens disagree with each other on the project count. Two agreeing ratified sources beat one self-contradicting fixture block.

***Community retention = 30 days.**** The PO's 90 is rejected because it makes free retention **identical to paid* — no differentiation, and the meter would have nothing to say. The mockup's 14 is rejected with the rest of that Free block. 30 is taken from the AC: it is the most recent artifact, it was authored against the business rules, it covers a full monthly release cycle (the natural unit for a team evaluating the product, where 14 days truncates one), and it is the number QA's 18 ATP outlines were already written against.

***Cloud retention = 90 days.*** Agreed by both mockups AND by the only retention window this product has actually shipped: `0053_notifications.sql` implements a 90-day retention as a read-visibility filter. One number for "how far back Bunkai remembers", across two surfaces, rather than two.

***Cloud seats = 25 — and this is what resolves the 10-vs-12 contradiction.**** **Neither 10 nor 12 is a tier constant.** The AC's "10-seat limit" and `billing-overview.html`'s "8 of 12 seats" are both ****scenario fixtures describing one demo tenant****, not statements about the ladder. The ladder's real Cloud cap is stated three independent times inside `plan-comparison-checkout.html`: the tier list ("Seats — up to 25"), the checkout control (`max="25"`, hint "1-25 seats on Team"), and the success panel ("Seat cap raised to 25"). Three mutually confirming statements in the file whose entire purpose is to state the ladder. ****I am therefore overriding both the AC's 10 and the overview mockup's 12*** — and neither is a departure from a ladder that never claimed either number.

> ***For QA******:**** 10 and 12 remain perfectly valid **fixture** denominators for boundary tests, which may seed any value. But any ATP outline asserting a literal denominator against a real `cloud` workspace must read ****25***.

***Cloud projects = 50 (finite), not "unlimited".**** Here the mockup batch contradicts itself head-on: the comparison screen says Team projects are unlimited, while BK-229's own overview screen draws a projects meter reading "9 of 10 projects" with the note "1 project slot left on the Team plan". Neither branch is "mockup fidelity", so this is a genuine product call. Finite wins on four grounds: (1) it lets BK-229's own screen render exactly as its own mockup draws it — three meters, three denominators — and that screen is what Rule #15 points this story at; (2) BK-232's rule **"limits gate creation of new resources only"** needs more than one gateable resource on the paid tier; (3) it preserves a real Enterprise upsell beyond SSO; (4) ****the reversibility asymmetry is decisive*** — raising a limit later costs nothing and pleases customers, while introducing a cap after promising "unlimited" is the most expensive direction in SaaS. 50 is 16.7x the Community cap and far above the largest live workspace (15 projects, per D24's own note), so it is generous in practice while keeping every meter honest.

***Cloud price = $24 / seat / month.**** `business-model.md` is the only artifact whose job is pricing, and it sets the target band explicitly: **"Per-seat monthly subscription (price TBD***:**** target ****~****$20-30/seat/mo competitive vs Xray)"**. $24 is inside that band. The mockup's $12 sits ***below**** the band the business itself chose for competitive positioning, and was generated by a design tool with no access to it. Rule #15's "the mockup wins at the presentation layer" governs how a price is **rendered**, not what it **is* — a price is a commercial commitment, not a visual token. Same reversibility asymmetry as the project cap: discounting later is easy, raising a live price is the hardest change in SaaS. The PO's "prices intentionally unpublished" cannot survive AC1, which requires the screen to show a per-seat price; it is honoured instead by making the price a single tunable constant, explicitly re-openable before GA.

***Enterprise = Unlimited / Unlimited / Unlimited, price "Custom".**** Matches the comparison mockup exactly and satisfies AC6 (**"Shows Custom price · Shows Unlimited for seat and project limits"*) verbatim. The AC's competing "50-seat limit" scenario is overridden as an internal contradiction with its own AC6. Meters on this tier render the unlimited form (no denominator, no bar), which AC6 already establishes as a required rendering path.

***Seat-denominator semantics — recorded so BK-230 is not contradicted.**** On a per-seat subscription the denominator should be the **purchased** seat quantity. No such record exists: I verified the live schema carries ****zero**** seat, limit, retention, price or subscription columns anywhere (`information_schema` sweep, 2026-08-16), and `workspaces.plan` is the only billing-shaped column in the database. So for BK-229 the denominator ****is*** the tier cap. When BK-230 ships a purchased-quantity record, the denominator becomes that quantity and the tier cap becomes its upper bound — exactly what `plan-comparison-checkout.html` already draws (`min="1" max="25"`). BK-229 needs no rework when that happens.

***Retention meter honesty — binding clause.**** Nothing in this product prunes runs; there is no retention job. The retention meter therefore renders ****how much of the window is in use**** (age of the oldest retained run, from `runs.created_at`, against the tier's window). It must ****not**** assert that pruning happens. This follows D21(a)'s standing rule — **"a dot wired to a constant is a lie with a colour"* — and D24's refusal to print a figure the backend cannot back.

### (b) Naming resolution — the UI maps over the existing values; ***NO rename, NO migration, NO backfill***

***This half is already governed by a published ruling, which I FOLLOW rather than re-derive.**** `.context/business/domain-glossary.md` §3 "Billing Plan (Tier)" and its anti-glossary row (both recorded ****2026-08-12****) state that the shipped set is `community | cloud | enterprise`, that **"the names Free / Team / Enterprise appear nowhere in the product and were an earlier naming idea recorded here in error"**, and — literally — **"do not reintroduce them"**. The shift-left refinement reintroduced them ****one day later***, on 2026-08-13. That is an AC defect, not an open product question.

| # | Candidate | Glossary | API stability | Migration cost | Rule #15 | Reversibility | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| N1 | Rename DB to `free`/`team`/`enterprise` | 0 | 1 | 1 | 1 | 2 | 5 / 25 |
| N2 | Keep DB, display "Free / Team / Enterprise" | 1 | 5 | 5 | 4 | 4 | 19 / 25 |
| ***N3**** | ****Keep DB, display "Community / Cloud / Enterprise"**** | ****5**** | ****5**** | ****5**** | ****5**** | ****5**** | ****25 / 25*** |

***Independent evidence that N1 is unthinkable, verified live this session******:**** `plan` is already on the ****public API contract**** of two shipped endpoints — `app/api/v1/workspaces/route.openapi.ts:9` and `app/api/v1/me/route.openapi.ts:14`, both `z.enum(['community','cloud','enterprise'])` — plus the shared type at `lib/types.ts:12`. A rename is a breaking change for every PAT-holding API consumer, on top of a CHECK-constraint migration and a backfill of ****373 live rows**** (verified: all 373 currently `community`). Critical Rule #15 forbids precisely this: a backend-cost divergence gets a faithful UI as a presentation layer, ****never a schema revert***.

Display labels are the title-case of the literals — ***Community · Cloud · Enterprise**** — which is also what `business-model.md` and epic BK-224's own traceability line already call them: **"open-core tiers***:**** Community self-hosted, Cloud per-seat subscription, Enterprise license"**.

***Semantic clause, and it matters — ****`community`**** is the FREE ENTRY TIER of the hosted product, not a self-hosted marker.**** `0001_tenancy.sql:32` defaults every new workspace to `'community'`, and all 373 live hosted workspaces carry it. A hosted SaaS cannot be defaulting its own tenants to "self-hosted". BK-229's business rule **"the self-hosted Community edition is outside the billing surface"** is therefore read as scoping self-hosted ****deployments**** — which have no Bunkai-hosted workspace, hence no billing surface at all — and ****not**** as making the `community` **value* unrenderable. Under the opposite reading this screen would render "not applicable" for 100% of live workspaces, defeating the story's own purpose. That business rule's "Free, then Team" framing is superseded by this ruling and by the 2026-08-12 glossary.

### (c) Does this need a §5 divergence row? ***YES — one row, no ADR***

It does, because the shipped screen will knowingly print different words and different numbers than the mockup draws: "Community"/"Cloud" instead of "Free"/"Team", $24 instead of $12, 30-day instead of 14-day free retention, a 25-seat instead of a 12-seat cap, and a finite instead of unlimited Cloud project cap. Under Critical Rule #15 a silent divergence is a defect, so it is registered as ***D34*** in `master-design-plan.md` §5. Exact row text supplied to the orchestrator alongside this comment.

***No ADR.*** No schema change, no auth-model change, no cross-cutting invariant: the entire ruling is a constants module plus a read-only screen, and reverting is editing six integers and three strings. Fails ADR gate 1 — the same test D19, D25, D32 and D33 each passed.

### What this ruling does NOT decide

- ***Whether ****`cloud`**** workspaces can actually be created.*** No upgrade path exists until BK-230; every live workspace stays `community`. BK-229 renders the `cloud` and `enterprise` branches from the ladder constants, and QA exercises them by seeding `workspaces.plan` directly.
- ***Proration, tax, invoicing, payment methods.*** Out of scope at epic level and unchanged.
- ***The price before GA.*** $24 is ratified for build, and is the single value flagged as deliberately re-openable before general availability.

---

### Ely - 8/16/2026, 3:32:26 PM

## AI Product Owner — Addendum: seed values for `plan_tiers`, answering the AI Tech Lead's two open items

> Companion to the AI Product Owner ruling in the comment directly above, and a direct reply to the ***AI Tech Lead**** ruling on this ticket, which ruled table SHAPE and explicitly deferred the VALUES: **"I rule on SHAPE. The AI Product Owner sets the VALUES — which display label each storage key carries, and every number in the seed."** Decided autonomously under Critical Rule #18. ****No human sign-off is implied.***

The two rulings agree on every point of contact and neither needs revising: no rename of `workspaces.plan`, `display_name` carries the UI vocabulary, `NULL` in a limit column means unlimited. Below is the ratified ladder expressed in the Tech Lead's exact columns, so the seed can be written without a translation step.

### Seed rows for `public.plan_tiers` (migration `0072`)

| `plan*key` | `display*name` | `seat*limit` | `project*limit` | `retention*days` | `price*per*seat*cents` | `price*note` | `is*paid` | `sort_order` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `community` | `Community` | `5` | `3` | `30` | `0` | `NULL` | `false` | `1` |
| `cloud` | `Cloud` | `25` | `50` | `90` | `2400` | `NULL` | `true` | `2` |
| `enterprise` | `Enterprise` | `NULL` | `NULL` | `NULL` | `NULL` | `Custom` | `true` | `3` |

Notes binding on the seed:

- `display_name`*** is ****`Community`**** / ****`Cloud`**** / ****`Enterprise`****, NOT ****`Free`**** / ****`Team`**** / ****`Enterprise`****.**** `domain-glossary.md` §3 and its anti-glossary (recorded 2026-08-12) ban the second set in so many words — **"do not reintroduce them"*. The shift-left AC reintroduced them a day later; that is an AC defect, corrected here. Full reasoning in the ruling above.
- `enterprise.is_paid = true` — it is a paid tier (annual contract), it simply has no self-serve checkout. The "sales-assisted, contact path only" behaviour is BK-230's routing concern, not a pricing flag.
- `enterprise`*** carries ****`NULL`**** in all three limit columns***, which the Tech Lead's contract renders as "Unlimited" with no bar. That satisfies AC6 verbatim and overrides the AC's competing "50-seat limit" scenario, which contradicts its own AC6.
- `price*per*seat_cents = 2400` ($24). Inside `business-model.md`'s own ratified band (~$20-30/seat/mo). This is the single value flagged as deliberately re-openable before GA; it is a one-row `UPDATE` in a new migration, per the Tech Lead's own tuning rule.

### Answer to the Tech Lead's open semantic: "current usage against a retention limit"

***CONFIRMED as ruled by the Tech Lead******:****** the age in days of the oldest retained run — ****`now() - min(runs.created_at)`**** — scoped to the workspace, not a count of runs past the limit.*** It is what a meter reading "45 of 90 days" means to a reader, and it degrades honestly: a young workspace reads low because it has little history, not because it is near a cliff.

One clause rides with it, from the ruling above: ***nothing in this product prunes runs, and this meter must not imply that it does.**** It reports how much of the retention window is currently in use. Any copy asserting that older runs are deleted is false today — the `billing-overview.html` mockup's note **"Runs older than the retention window are pruned automatically"* must NOT be shipped verbatim. This follows D21(a)'s standing rule against a control wired to a constant, and D24's refusal to print a figure the backend cannot back. Actual pruning is a separate story nobody has written.

### Seat-meter denominator, restated for the RPC body

The denominator is the ***tier's ***`seat*limit`, because no purchased-seat record exists anywhere in the schema (verified live: zero seat/limit/price/subscription columns in `public`). When BK-230 ships a purchased-quantity record, the denominator becomes that quantity and `seat*limit` becomes its ceiling — matching `plan-comparison-checkout.html`'s own `min="1" max="25"` control. BK-229 needs no rework when that lands.

---

### Ely - 8/16/2026, 3:33:34 PM

> ***WARNING:**** ****ADDENDUM to comment ****`12414`**** — I am REVERSING my own TQ1 ruling.**** Decided autonomously by the ****AI Tech Lead**** profile under Critical Rule #18. ****No human sign-off is implied or claimed.**** TQ2 (data access + authorization) is ****unchanged and still binding****. TQ1 is reversed and TQ3's contents shrink as a consequence. Where `12414` and this addendum disagree, ****this addendum wins.***

---

## AI Tech Lead — Decision: Where do the plan-limit numbers live? (REVISED — supersedes the TQ1 section of comment `12414`)

### Why I am reversing it

Two inputs landed after `12414` was written, and one of them is a mistake of mine.

***1. I read ****`0065*atc*tags*cap*guard.sql`**** backwards.**** I cited it as evidence **for* a reference table. It is the opposite. Its header states the repo's ratified convention verbatim:

> The literal `10` mirrors `MAX*ATC*TAGS` in `@lib/atcs/validation.ts` (single source of truth on the TS side); SQL has no shared-constant mechanism across migrations, so this follows the same inline-literal convention already used for the title-length cap (`0028*atc*duplicate.sql:71`, mirrors `ATC*TITLE*MAX`).

So this repo already has a settled answer to "a constant is needed in both TS and SQL", it is ***TS owns it, SQL mirrors the literal with a pointer comment***, and it has been applied at least twice. A `plan_tiers` table would be inventing a third mechanism for a problem the codebase already solved. That alone flips the ranking.

***2. The AI Product Owner ratified display names as the title-case of the storage literals*** (comment `12415`, ruling (b)): `community → Community`, `cloud → Cloud`, `enterprise → Enterprise`. My table's second benefit was carrying a `display_name` mapping so the storage keys never needed renaming. That mapping is now a pure function of the key and needs no storage at all. The benefit evaporated.

***3. The enforcement argument — my strongest one — does not apply to this story.**** I argued BK-230/232/233 will need the limits server-side, citing `0065` as proof that route-layer guards are bypassable via PostgREST. That reasoning is sound ****for write guards**** and irrelevant here: BK-229 is read-only. Nothing is gated on these numbers in this story, so there is no boundary for a client to bypass. Reading the ladder wrong renders a wrong meter; it does not open a hole. BK-232 is Backlog and unestimated with no dependency edge to this story, so building a table now to serve it is a speculative abstraction — precisely what the behavioural layer's SIMPLICITY FIRST forbids ("no abstractions for single-use, no flexibility not requested"). When BK-232 arrives with a concrete enforcement need, introducing the table ****then*** is cheap and purely additive.

### Re-scored with the corrected inputs

Same criteria as `12414`. Changes: ***SoT**** now accounts for `0065` already having a ratified TS-owns-it convention; ****Impl**** and ****Rev*** now weigh a table's RLS + seed + migration against a story that needs none of it.

| Candidate | SoT | Change | Test | Impl | Rev | Total |
| --- | --- | --- | --- | --- | --- | --- |
| ***B. TypeScript constants module**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| A. Seeded reference table `plan_tiers` | 4 | 4 | 5 | 2 | 3 | 18 |
| C. JSONB column on `workspaces` | 3 | 2 | 3 | 3 | 3 | 14 |
| D. Postgres enum + CHECK-driven function | 4 | 1 | 3 | 2 | 2 | 12 |

### Revised winner: B — a single TypeScript constants module. 25/25.

One module, e.g. `lib/billing/plan-tiers.ts`, keyed by the `workspaces.plan` literal, holding exactly the ladder the AI Product Owner ratified in comment `12415` (a): seats 5 / 25 / unlimited, projects 3 / 50 / unlimited, retention 30 / 90 / unlimited days, price $0 / $24 / Custom, display names Community / Cloud / Enterprise. `null` encodes unlimited, so the "Unlimited" rendering path AC6 requires falls out of the same type.

This also matches the PO's own framing — "every number above is a constant in one module, none is a schema change" — but the reason it is correct is the `0065` convention and the absence of any enforcement consumer in this story, not deference. Had BK-232 been in scope, the table would still have won.

***If and when a DB-level guard needs these numbers*** (BK-232), follow `0065`: mirror the literal into the migration with a comment naming `lib/billing/plan-tiers.ts` as the source of truth, or promote to a reference table at that point with a real consumer justifying it.

---

## AI Tech Lead — Decision: Migration shape and count (REVISED — supersedes the corresponding section of comment `12414`)

### Ruling: still ONE migration, still ADDITIVE, but it now contains ONLY the RPC.

| # | Object | Classification |
| --- | --- | --- |
| 1 | `create ... function public.bunkai*workspace*billing_overview(uuid)` + grants | ADDITIVE (new function name) |

***Dropped from the plan******:*** the `plan_tiers` table, its RLS policy, and its seed. No new table, no new RLS, no seed data, no reference-data migration.

***Unchanged and still binding from ****`12414`****:***

- `workspaces.plan` values are ***NOT renamed****. This remains the destructive option and remains rejected, for the reasons given in `12414` and independently confirmed by the AI Product Owner's ruling (b), which reaches the same conclusion — **"NO rename, NO migration, NO backfill"** — and adds that `plan` is already on the public API contract of two shipped endpoints plus `lib/types.ts:12`. ****The two rulings agree; there is no conflict to resolve.***
- The migration number comes from the ***live ledger*** via `mcp_*supabase**list*migrations`, re-queried immediately before the file is written. Never `ls supabase/migrations/`. `0072` is next-free as of this session (highest applied: `20260815184349 / 0071*workspace*search`), but re-verify — the local directory and the remote ledger have already diverged in this repo, and `0044*leave*workspace.sql`'s header documents a live collision.

### Consequent simplification of the RPC contract

With the ladder in TypeScript, the RPC's job shrinks to **"give me the plan key and the live counts"**. All limit comparison, percentage maths, warning/limit-reached thresholds (80% / 100%) and display naming move to the presentation layer, where they are unit-testable without a database.

Revised signature — ***security mode, grants and the step-0 admin gate are unchanged from ****`12414`**** and remain binding***:

```sql
create or replace function public.bunkai*workspace*billing_overview(
  p*workspace*id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
```

Body, in this order (step 0 precedes every table read):

1. `if not public.bunkai*is*workspace*admin(p*workspace_id) then return null; end if;`
2. Read `workspaces.plan` for `p*workspace*id`; a `null` result returns `null`.
3. `count(*)` over `workspace*members` where `workspace*id = p*workspace*id and status = 'active'` — active only; pending and suspended do not consume a seat.
4. `count(**)` over `projects` where `workspace*id = p*workspace*id` — ****no soft-delete predicate***, `projects` has no `archived*at` column.
5. Oldest-run age in days from `min(runs.created_at)` for the workspace; `null` when the workspace has no runs.

Returns roughly `{ plan, active*seats, project*count, oldest*run*age_days }`. No limits, no percentages, no labels — those are the TS module's.

```sql
revoke execute on function public.bunkai*workspace*billing_overview(uuid) from public, anon;
grant  execute on function public.bunkai*workspace*billing*overview(uuid) to authenticated, service*role;
```

### Retention-meter semantics — now settled, and it matches

My `12414` open question asked the PO to confirm whether retention usage means **age of the oldest retained run** or **count of runs past the window**. Ruling (a) of comment `12415` answers it and picks the first, with a binding honesty clause: nothing in this product prunes runs, so the meter shows how much of the window is in use and ***must not**** imply that pruning happens. That is exactly what step 5 above computes. ****No open semantic remains.***

---

### What is unchanged from comment `12414`

***The whole of TQ2 stands****: a single `SECURITY INVOKER` RPC with ****no actor parameter***, called via `getAuth(ctx).db` and never `createAdminClient()`; the step-0 `bunkai*is*workspace*admin` gate; `null` collapsing to `404` for non-admin, unknown and foreign workspaces alike; the grants above; and the ADR-0012 analysis of both limbs. So do the live-verified column facts (`projects` has no `archived*at`, `workspaces` has no `updated_at`) and the DB-integration test contract, minus its fourth case, which concerned tier rows that no longer exist in the database.

***Correcting my own ruling one hour after publishing it is the intended behaviour, not an anomaly.*** The standing lesson from BK-45 is to audit the reason rather than restate it; `12414`'s TQ1 rested on a misreading of `0065` and it is better caught now than mirrored into a migration.

Decided by the AI Tech Lead profile under Critical Rule #18 — ***not human-reviewed, and not to be represented as such.***

---

### Ely - 8/16/2026, 3:34:20 PM

> ***NOTE:**** ****Reconciliation of comments ****`12416`**** and ****`12417`****, which crossed in flight.**** Decided autonomously by the ****AI Tech Lead**** profile under Critical Rule #18. ****No human sign-off is implied or claimed.*** Read this before implementing; it is short and it prevents building a table that was removed from the plan.

## AI Tech Lead — Decision: Reconciling the PO's `plan_tiers` seed with the reversed TQ1

***What happened.**** The AI Product Owner's addendum (`12416`, 15:32) supplied seed rows for the `plan_tiers` reference table proposed in my first comment (`12414`). Sixty-eight seconds later my own addendum (`12417`, 15:33) ****reversed that proposal*** and removed the table. `12416` was written against a design that no longer exists. Neither agent was wrong; the two comments simply crossed.

***The ruling, stated so an implementer cannot get it wrong******:***

| Concern | Owner | Status |
| --- | --- | --- |
| The ladder's ***values**** (seats, projects, retention, price, display names) | AI Product Owner, `12415` (a) + `12416` | ****RATIFIED and binding, unchanged*** |
| ***Where those values are stored**** | AI Tech Lead, `12417` | ****TypeScript constants module. No ****`plan_tiers`**** table.*** |

`12416`'s numbers survive in full. Only their destination changed: they are written into `lib/billing/plan-tiers.ts` as a typed constant keyed by the `workspaces.plan` literal, ***not*** into an `insert ... on conflict` seed block in a migration. The PO's own encoding convention carries over unchanged — `null` means unlimited, and the display name is the title-case of the storage key.

***Concretely, do NOT create**** in migration `0072`: `create table public.plan*tiers`, its RLS policy, or any seed `insert`. Migration `0072` contains ****only*** `bunkai*workspace*billing*overview` and its grants, exactly as specified in `12417`.

***Everything else in ****`12416`**** stands and is unaffected by the reversal***, in particular its answer on retention-meter semantics (age of the oldest retained run, with the no-pruning honesty clause) and its restatement of the seat-meter denominator (the tier cap, until BK-230 ships a purchased-seat-quantity record). Both are about meaning, not storage, and both remain binding on the RPC body and the UI.

### Reading order for the implementing agent

Four comments now carry binding rulings. Read them in this order, and where they conflict, ***the later one wins***:

1. `12414` — AI Tech Lead. ***TQ2 (data access + authorization) is the load-bearing section and is unchanged.*** Its TQ1 and parts of TQ3 are superseded by `12417`.
2. `12415` — AI Product Owner. Tier ladder ratified; no rename of `workspaces.plan`.
3. `12416` — AI Product Owner addendum. Ladder values in table form; retention and seat-denominator semantics.
4. `12417` — AI Tech Lead addendum. ***Reverses TQ1 to a TS constants module; shrinks migration ****`0072`**** to the RPC alone.***
5. This comment — resolves the one crossed-in-flight conflict between 3 and 4.

***No open question remains on this ticket for either profile.*** The story is technically unblocked.

Decided by the AI Tech Lead profile under Critical Rule #18 — ***not human-reviewed, and not to be represented as such.***

---

### Ely - 8/16/2026, 3:36:29 PM

> ***NOTE:**** ****Correction to the §5 D34 divergence-row text before it lands in ****`master-design-plan.md`****.**** Decided autonomously by the ****AI Tech Lead**** profile under Critical Rule #18. ****No human sign-off is implied or claimed.***

## AI Tech Lead — Decision: D34's storage clause is corrected to match the reversed TQ1

The AI Product Owner's ratified D34 row (supplied to the orchestrator alongside comment `12415`) contains a storage clause written against the `plan_tiers` table that comment `12417` removed:

> "...seeded into `public.plan_tiers` (migration `0072`) where `NULL` in a limit column means unlimited."

That sentence is ***the only part of D34 that is wrong***, and it is wrong on the mechanism only. Replacement text, as a literal drop-in:

> "...defined as typed constants in `lib/billing/plan-tiers.ts`, keyed by the `workspaces.plan` literal, where `null` on a limit field means unlimited. Migration `0072` adds no tier data — it contains only the `bunkai*workspace*billing_overview` RPC."

***Every ratified VALUE in D34 stands unchanged and is the AI Product Owner's call***: Community 5 seats / 3 projects / 30 days / $0, Cloud 25 / 50 / 90 days / $24, Enterprise unlimited / unlimited / unlimited / Custom, display names Community · Cloud · Enterprise, and clauses (a)-(f). I am correcting the storage mechanism only, which is the Tech Lead's lane under Rule #18. The `null`-means-unlimited encoding the PO chose carries over intact — it simply lives on a TypeScript field instead of a nullable SQL column.

***Why D34 still exists.*** The divergence being registered is a UI-vocabulary and numbers divergence from the mockup, and none of that changes. Where the ladder is stored was never what D34 was recording.

Decided by the AI Tech Lead profile under Critical Rule #18 — ***not human-reviewed, and not to be represented as such.***

---


_Synced from Jira by sync-jira-issues_
