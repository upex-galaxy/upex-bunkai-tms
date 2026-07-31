# Comments for BK-49

[View in Jira](https://jira.upexgalaxy.com/browse/BK-49)

---

### José Andrés Lorca - 6/29/2026, 2:55:55 PM

## Acceptance Test Plan (ATP) - Shift-Left DRAFT ready for review

The ATP DRAFT lives in the Acceptance Test Plan (ATP) field.

Action Required: review ambiguities, answer critical PO questions, confirm edge-case behavior, and validate technical decisions before implementation.

Refined on: 2026-06-29 - QA Shift-Left batch session

- Local working copy: 
.context/PBI/epics/EPIC-BK-44-coverage-traceability/stories/STORY-BK-49-tms-activity-stream-a-read-side-feed-over-the-exis/shift-left-refinement.md

---

### José Andrés Lorca - 7/8/2026, 3:37:58 PM

Acting as PO Proxy to help accelerate the estimation flow, following Ely's guidance, BK-49 is estimated at 5 SP under a bounded MVP scope.

The 5 SP estimate applies if the scope remains limited to:
- Read-side feed over the existing `activity_log`.
- Paginated reads.
- Newest-first ordering.
- Workspace-scoped visibility.
- Visibility for workspace members while respecting the current permissions/RLS model.
- No realtime, polling, push, or auto-refresh.
- No new event writers within this story.
- Bug/defect activity out of scope unless a confirmed writer exists or is added separately.

Expected effort is mainly concentrated on:
- Read model / query contract.
- Deterministic pagination.
- Feed UI rendering.
- Event taxonomy/labels.
- Workspace isolation.
- Loading, error, empty, and pagination-end states.
- Safe fallbacks for deleted or unavailable actor/item references.

Justification:
The existing `activity_log`, current event writers, indexes, and permissions/RLS model reduce the backend scope. The remaining complexity is in exposing and rendering the feed in a safe, consistent, and testable way.

If realtime/polling, new event writers, defect activity, or a broader public API are added, the story should be re-estimated as 8+ SP or split into separate follow-up stories.

---

### Ely - 7/31/2026, 1:21:46 PM

## PROPOSED resolution — the 4 items that actually block Stage 1 (pending PO/Dev sign-off)

> ***Status******:****** PROPOSAL, not a decision.*** Posted by Worker B (AI, avalanche-2026-07) after codebase investigation, mirroring how BK-89's Dev-contract and BK-35's Q5 were resolved this run. Needs an explicit approval (or correction) from the PO/Dev owner before this story can be claimed — the other 17 shift-left open items (copy, event taxonomy, loading/empty/error states) are NOT addressed here; they're expected to close during implementation once these 4 are settled.

### Read contract shape (Dev Q1 / Q2 / Q3)

`public.activity*log` already exists (`supabase/migrations/0009*cross*cutting.sql`) with `workspace*id, actor*user*id, entity*type, entity*id, action, payload jsonb, created*at`, an index on `(workspace*id, created_at desc)`, and real writers already populating it (module mutations, BK-59). This is not a from-scratch design.

***Proposed shape***, mirroring the two most recent list/report endpoints in this codebase (BK-37's `bunkai*list*test*runs`, BK-38's `bunkai*report*project*runs`):

- New RPC `bunkai*list*activity(p*actor*user*id, p*workspace*id, p*limit, p*cursor*created*at, p*cursor*id)`, `SECURITY DEFINER`, with the actor-bind guard (`auth.uid() = p*actor*user*id`) baked in from the start — BK-37 shipped without this and had to retrofit it in a follow-up migration after a caller-impersonation gap was found; BK-38 baked it in from day one citing that exact incident. No reason for BK-49 to repeat the mistake.
- Keyset pagination on `(created_at, id) < (cursor)`, same tuple-predicate shape as both precedents. Cursor: reuse the existing base64url `${value}|${id}` encode/decode in `lib/runs/history-validation.ts` as-is rather than inventing a new format.
- Returns `jsonb {items, next_cursor}` — no `totals` block, this is a feed not a report.
- Route: `GET /api/v1/activity`, workspace resolved implicitly from the caller's identity/active-workspace (no endpoint in this codebase puts `workspace_id` in the path for a "list what's mine" shape — `/api/v1/workspaces`, `/api/v1/tests` both work this way).
- Server component (wherever the feed is surfaced) calls the SAME RPC directly on first read, not its own `/api/v1/activity` route — established, unbroken pattern across `/settings/account`, `/settings/workspaces` (BK-89), and the Run History screen (BK-37): avoids a self-referential HTTP hop. The API route exists for client-side "load older" pagination and Bearer-PAT callers.

### Cross-workspace leakage (Critical edge case #2)

Two-layer defense-in-depth, matching this codebase's established pattern everywhere else:

1. RLS `activity*log*select*workspace*member` already exists and is correctly workspace-scoped (`0009*cross*cutting.sql`) — no new policy needed.
2. The new RPC adds its own explicit `workspace_id` filter and the actor-bind guard on top of RLS — same "RLS is defense-in-depth, the RPC predicate is the real enforcement for this report" reasoning `0041`'s own migration comment states for BK-38.

***One gap surfaced, not currently believed to block MVP***: `activity*log`'s RLS is workspace-flat — it doesn't re-check that the caller could individually read the specific entity a row references (`entity*type`/`entity_id`) beyond workspace membership. No entity in this schema is currently known to have a stricter read restriction than "workspace member", so this is likely moot — flagging in case that assumption is wrong.

### Non-blocking finding worth knowing before implementation

No mechanism exists anywhere in this codebase to resolve an arbitrary OTHER user's `actor*user*id` to a display name — the only existing id→email resolution (`settings/account/page.tsx`, `GET /api/v1/me`) is self-only, via the Supabase Admin API. Dev Q6 (actor/item resolution mechanism) will need to either bulk-resolve via `getUserById` per batch or build something new — there's no multi-user precedent to copy verbatim. Not one of the 4 blockers, but worth knowing going in.

---

Full evidence (file:line citations for every claim above) available on request — kept out of this comment to stay readable; ping Worker B's session or check `escalation-log.md` in `.session/sprint-development-queue/avalanche-2026-07/` for the underlying research.

---

### Ely - 7/31/2026, 1:39:06 PM

## SUPERSEDES the 2026-07-31 proposal above — that one had a real security gap

Before any code was written, the proposal above went through an independent 3-lens adversarial review (technical-soundness, security, scope-completeness — each blind to the others, each told to try to break it). Two of the three returned ***reject-and-redo*** or near-reject confidence (8% and 25-30%). The finding that matters most:

***The "cross-workspace leakage" section was wrong.**** The proposed RPC's `workspace*id = p*workspace*id` filter is a **selection clause*, not an authorization check — and `SECURITY DEFINER` functions in this codebase run with RLS bypassed (no `FORCE ROW LEVEL SECURITY` exists anywhere in `supabase/`). Without an explicit membership assertion, any signed-in user could pass an arbitrary workspace UUID as `p*workspace*id` and read that workspace's entire activity feed — under their own honest identity, no user-id spoofing needed. Worse than the BK-37 incident (`0039*run*history*actor_guard.sql`) in exactly that way. Caught here, not in production, because the proposal was verified before implementation started — do not act on the version above.

### Revised resolution (5 items, corrected + expanded from the original 4)

***1. Read contract shape + 2. Cross-workspace leakage — corrected design***

Drop the `SECURITY DEFINER` + `p*actor*user_id` shape entirely. It was reaching for BK-37/BK-38's pattern without asking whether this feature needs their privilege escalation — it doesn't (no cross-table aggregation, no transactional-integrity need). `ADR-0001` already settled this fork for exactly this case: "(A) SECURITY DEFINER RPCs with an explicit actor... (B) give the PAT caller an RLS-scoped client... Path B was chosen." A read-only feed is Path B territory.

- `bunkai*list*activity(p*workspace*id uuid, p*limit int, p*cursor*created*at timestamptz, p*cursor*id uuid)` — `SECURITY INVOKER` (the default — omit `security definer`). No actor parameter, nothing to spoof.
- Route (`GET /api/v1/activity`) uses `principal.db` from `getAuth(ctx)` — the RLS-scoped client — ***never*** `createAdminClient()`. Server component uses the SSR cookie client, same as every other page in this app. `activity*log*select*workspace*member` (already shipped, `0009*cross*cutting.sql`) then enforces workspace membership automatically via `auth.uid()`, on every call path, with nothing to bypass.
- Keyset pagination unchanged: `(created_at, id) < (cursor)`, cursor codec reused from `lib/runs/history-validation.ts` (relocated/renamed to a neutral module — activity isn't a "run", the field names shouldn't lie).
- ***New migration needed***: `activity*log*workspace*created*at*id*idx (workspace*id, created*at desc, id desc)`. The existing index (`workspace*id, created*at desc`) has no `id` tie-break column and does not serve the keyset seek — same gap BK-37 hit and fixed with a purpose-built index; this proposal's first draft claimed no schema change was needed, which was wrong.
- Route: `GET /api/v1/activity`, no workspace id in the path — reusing the caller's active-workspace resolution. ***Known dependency***: BK-182 (open bug) — Bearer-PAT active-workspace resolution is currently broken for at least one existing route. Link BK-49 to BK-182; this new route inherits that gap until it's fixed.

***3. Event allowlist (new — the taxonomy question, previously undecided by omission)***

The RPC needs a `p*actions text[] default null` filter and an explicit MVP allowlist, not "return every row in the table." Concretely: BK-35 (`run*step.marked`) fires once per step per run and would drown every other event type in an unfiltered feed within a day of use. Proposed MVP allowlist: the entity-create/update/complete-level events (`module.*`, `atc.created`, `test.created`, `run.finished`, `run.aborted`) — excluding step-level noise (`run_step.marked`) and no-op/internal events. `.context/business/events.md` needs a refresh in the same story — it currently documents 6 of the (at least) 13 actions now writing to the table.

***4. Actor + item display (reclassified from "non-blocking" to blocking — it determines the RPC's return columns, which determines the OpenAPI schema, which is where Stage 1 planning would otherwise stall)***

No mechanism exists to resolve another user's id to a name (verified: every `getUserById` call in this codebase is self-only). Proposed: a new narrow `SECURITY DEFINER` helper, scoped to the caller's co-membership in the same workspace, batch-resolving the page's distinct `actor*user*id` values via the Admin API — same justification-comment pattern as `settings/account/page.tsx:62`. ***This exposes member emails to all workspace members (including viewers), which is a real posture change from the current ****`service*role`****-only lookups (****`0022`****, ****`0034`****) — flag as ADR-worthy, not just a code decision.**** Item label: derive from `payload` where a usable field exists (module/ATC/test events all carry one); fall back to a generic `"a <entity*type>"` label when it doesn't (`run.**` events) — avoids five conditional joins across entity tables and keeps deleted/archived entities non-broken by construction.

***5. Payload safety (new)***

Do not return `payload` raw. This codebase already has a payload-minimization convention it doesn't get credit for in the original proposal: `module.description*updated` writes an intentionally empty payload specifically to avoid a content leak (`0023*module*activity*log.sql`). `run.aborted.reason` is up to 500 characters of unconstrained operator-entered text — broadcasting it to every workspace member with no redaction reverses that convention. Proposed: allowlist specific payload keys per `(entity_type, action)` pair for what actually reaches the client, tied to the same event-taxonomy decision in item 3.

***Archived/soft-deleted entities***: soft-delete filtering in this codebase is entirely application-level (no RLS references `archived*at`). `activity*log` has no join to it. Proposed default: suppress feed rows for entity types where an `archived_at is null` filter is cheaply joinable (module, at minimum) — surfacing an archived item's rename/move history to the whole workspace after it's been hidden everywhere else in the app would defeat the soft-delete UX everywhere else establishes.

### Still open — needs product input, not a technical call (flagging separately, not deciding here)

***Where does this feed actually render?*** `master-design-plan.md` §4.2 maps BK-49 to the Home dashboard, which is 0% built and explicitly blocked by domains that don't exist yet (bugs, coverage). The Home mockup's activity panel is also a last-24h widget with no pagination, while this story's AC explicitly requires paginated "load older." This is a real placement conflict, not a detail — raised to the human separately.

---

### Ely - 7/31/2026, 2:15:03 PM

## Placement decision RESOLVED — standalone `/activity` route (Option A)

Decision made by the product owner (2026-07-31, chat), after Worker B laid out the tradeoff:

- ***Option A (chosen)***: build a standalone `/activity` route now. Preserves the story's ACs as written (paginated "load older"). Doesn't block on the Home dashboard, which has no ticket anywhere in the backlog (verified: zero Jira results for "Home"/"Dashboard" in this project) and would need a brand-new epic seeded via `/product-management`, refined, and estimated before anything could render into it.
- Option B (wait for Home) was ruled out for THIS story specifically once it became clear "wait" meant "wait for work that doesn't exist yet and isn't scoped into this run" rather than a short delay.
- Option C (shrink to a non-paginated 24h widget matching the mockup as-drawn) was ruled out — it would silently cut scope already agreed (the PO-proxy's bounded-MVP estimate explicitly named "deterministic pagination").

This is a deliberate departure from `master-design-plan.md` §4.2 (which maps BK-49 into the Home dashboard's `home.jsx` mockup) — per this repo's design-fidelity rule, it gets ratified as a `master-design-plan.md` §5 divergence entry as part of Stage 1 for this story (not silently built).

Separately: the product owner is evaluating whether to seed a proper "Home Dashboard" epic via `/product-management` now that 2 of its 3 feeder stories (BK-8, done; BK-46, in flight) are ready — that's a distinct initiative, not a blocker for BK-49, tracked outside this ticket.

BK-49 is now fully unblocked. Starting Stage 1 implementation planning.

---

### Ely - 7/31/2026, 2:41:12 PM

## Chain strategy decision (Stage 1 → Stage 2 gate, risk=High per the Workload Forecast)

***Chain strategy******:****** feature-branch-chain***

***Decision trace****: Q1=No (new domain logic — a new RPC pair following ADR-0001 Path B, a new PII-exposure ADR, and a wholly new UI surface with zero existing components to reuse, unlike BK-89 which reused BK-87's `WorkspacesList`; not a rename/formatter/generated-code/vendor-update) · Q2=No (the natural DB/API/UI split has API alone — `route.ts` + `response.ts` + the full `ActivityItemSchema` discriminated-union-across-8-event-types + `route.test.ts` — realistically landing 450-650 lines, and UI alone — new page + all-new list/skeleton/empty/row components with actor-badge and item-label rendering + tests, nothing reused — realistically landing 700-1000+ lines; neither clears the <400-line-per-slice bar this leaf requires) · Q3=Yes (the new RPC's `jsonb {items, next*cursor}` shape and the generated TS types for `bunkai*list_activity`/the actor-resolution helper are shared scaffolding the API slice defines and the UI slice directly imports and calls — per this codebase's own established pattern of the server component calling the same RPC/query the route uses; a partial merge of the UI slice without the API slice would not compile) → ****feature-branch-chain***

***Decided by***: /git-flow-master §Chained-PR decision tree (branching-strategies.md)

### Slices

`feat/BK-49-activity-stream` (already created, off `origin/staging`) is the long-lived integration branch. Docs (ADR-0011, `master-design-plan.md` §5/§8/§4.16) are already committed directly to it (commit `2048a17`) — they're governance artifacts, not one of the code slices.

1. ***DB*** (`feat/BK-49-activity-stream-db` → PRs into `feat/BK-49-activity-stream`): migration — `activity*log*workspace*created*at*id*idx`, `bunkai*list*activity` (`SECURITY INVOKER`), the actor-resolution `SECURITY DEFINER` helper, Supabase TS types regen.
2. ***API*** (`feat/BK-49-activity-stream-api` → PRs into `feat/BK-49-activity-stream`): `app/api/v1/activity/route.ts`, `response.ts` (cursor codec + query/merge helpers), `route.openapi.ts` (full `ActivityItemSchema`), `route.test.ts`, `.context/business/events.md` refresh.
3. ***UI**** (`feat/BK-49-activity-stream-ui` → PRs into `feat/BK-49-activity-stream`): new standalone page + `components/activity/**` (list, skeleton, empty/error states, row rendering), tests.
4. ***Final***: `feat/BK-49-activity-stream` → `staging`, once slices 1-3 are all merged into it.

Same mechanics as this repo's own precedent for a comparably-sized new feature (BK-35, `feat/BK-35-mark-run-step`, DB/API/Realtime/UI on one long-lived branch).

---


_Synced from Jira by sync-jira-issues_
