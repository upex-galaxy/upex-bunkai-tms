# Worker B handoff — avalanche-2026-07

Retired on context limit, not on a failure. Track: Settings — Workspaces, then whatever the shared queue offered.

## Tickets touched

- **BK-118** (legacy fields on `POST /me/active-workspace`, bug) — shipped. PR #67, merge commit `5196d02`. Stage 4 closed out fully by me.
- **BK-89-contract** (local pre-dev blocker) — resolved externally by the PO before I even reached it (Jira comment, 2026-07-31 03:32). Nothing for me to do beyond reading it.
- **BK-89** (View my workspaces) — shipped. PR #71, merge commit `8e32689`. Stage 4 closed out fully by me.
- **BK-90** (Leave a workspace) — not mine; Worker A picked it up because my Stage-4 close-out on BK-89 overlapped with their batch finishing. Shipped by them, both PRs merged (`6d77b32`, `547bc2f`).
- **BK-49** (Activity stream) — **IN FLIGHT, see below.** By far the largest piece of my session, and the one most worth reading carefully before touching.

## Traps that cost real time

1. **`EnterWorktree`'s "fresh mode branches from current `origin/staging`" claim is unreliable — confirmed independently, matches Worker C's finding.** My worktree's HEAD was 4 commits behind `origin/staging` right after creation (missing the sprint-development mandatory-unit-tests commit and others). Caught it by chance because I happened to `git merge-base --is-ancestor HEAD origin/staging` before doing real work — it printed NO. Fixed with `git merge --ff-only origin/staging` (clean, since a fresh worktree has no diverging commits). **Do this check as the literal first git command after `EnterWorktree`, every time, don't trust the strategy doc.**

2. **`acli jira workitem comment create` posts under the AUTHENTICATED account's Jira display name, not under any "AI worker" identity.** Since this project's `acli` auth is the repo owner's own API token, every comment I post — including ones I write to MYSELF as a proposal awaiting sign-off — shows up authored by "Ely." I twice mistook my own freshly-posted comment for a human reply mid-session (`acli jira workitem comment list` showing a new comment by "Ely" right after I posted one). **Always check the comment body content, never infer "the user replied" from the author name alone** — cross-reference against what you just posted.

3. **`bun run jira:sync-issues get <KEY>` mutates sibling story caches in the same epic, and separately leaves session-owned diffs on the ticket's OWN files too** (its `story.md`'s `Updated:` timestamp bumps every sync, `comments.md` reflects whatever's live in Jira at sync time). Same finding as Worker C's #2, confirmed independently — I hit it on BK-49→BK-89's folder and BK-118→BK-89's folder both. Restore with explicit `git restore <exact-path>` before switching branches or committing your own ticket's docs; never blanket-restore, never `git add -A`.

4. **A `SECURITY DEFINER` Postgres RPC that accepts a caller-supplied scope parameter (`p_workspace_id` or similar) and filters `WHERE col = param` without an explicit membership *assert* is not actually enforcing anything** — `SECURITY DEFINER` runs with RLS bypassed in this codebase (verified: zero `FORCE ROW LEVEL SECURITY` anywhere in `supabase/migrations/`), so that filter is a selection clause, not authorization. I nearly shipped exactly this in a Stage-1 proposal for BK-49 (caught before any code was written, by an adversarial subagent review dispatched specifically to stress-test the proposal — see BK-49 section below). **If you're about to write a new `SECURITY DEFINER` RPC that takes any kind of tenant/workspace id from the caller, stop and ask: does this genuinely need DEFINER (transactional integrity, or reading a table the caller's own role can't see), or would `SECURITY INVOKER` + the caller's own RLS-scoped client do the job more safely?** `ADR-0001` already answers this generically (Path A vs Path B) — read it before reaching for the DEFINER+actor-param pattern just because a recent sibling story (BK-37/BK-38) used it. This is now in Engram memory (`discovery/security-definer-workspace-scoping-gotcha`).

5. **Agent 4's merge cadence went idle for ~7 hours mid-run with zero visible cause** (last real merge activity 08:25:52Z, next one ~15:25Z) — worse than the earlier documented ~4.5h Bash-permission stall, and this time `escalation-log.md` shows no entry acknowledging it at all until I went looking. My best guess, never confirmed: Agent 4's own 15-min sweep cron may not have been relaunched after the earlier permission fix (its own escalation entry said it was cancelled and needed a manual `/loop 15m` relaunch). If your PR sits open for hours with a clean review and nothing else changing, that's this run's normal texture, not a sign your work is broken — but also don't assume it'll resolve itself; I surfaced it to the user directly twice and it did eventually clear.

## Conventions I established (not written down elsewhere)

- **Feature-branch-chain execution shape — I did it DIFFERENTLY from Worker C, and this is a real, unresolved ambiguity in the skill, not a mistake on either side.** Worker C's convention (see their handoff): one shared integration branch, sequential COMMIT groups per slice, exactly ONE real GitHub PR at the end (integration → staging). **I instead opened a separate real GitHub PR per slice**, each targeting the long-lived integration branch (`feat/BK-49-activity-stream`) rather than `staging` — reviewed and merged each one myself (unprotected branch, no Agent 4 needed for those), with only the FINAL integration-branch → staging PR going through Agent 4. My reasoning: the skill's own language ("child PRs merge into it") reads literally as real PRs to me, and per-slice PRs gave each slice its own clean diff for adversarial review (which mattered a lot here, given the security stakes — see below) rather than reviewing 2000+ lines in one final pass. **If you continue BK-49's Slice 3, follow MY shape (branch off `feat/BK-49-activity-stream`, PR into it, I'll have already merged 1 and 2 that way) for consistency within this one ticket** — but this divergence from Worker C should get resolved as a standing rule by a human, not re-decided per-ticket by whichever worker gets there first.

- **Adversarial self-review of a PROPOSAL, before any code exists, is worth doing for anything security-sensitive.** When BK-49's shift-left refinement left 21 unresolved questions and I narrowed them to a technical proposal, the user explicitly had me dispatch 3 independent subagents (different lenses: technical-soundness, security, scope-completeness) to try to break my OWN proposal before it became a plan. One of them found a genuine, exploitable cross-tenant data leak in my design (see trap #4). This cost real time (3 parallel subagent dispatches plus a rewrite) but caught something that would have shipped as a real vulnerability otherwise — cheaper by orders of magnitude than catching it in review after implementation, or in production. **Worth doing again for any story whose Stage-1 proposal touches auth/RLS/tenant-isolation design**, not just as a one-off for this ticket.

## Codebase knowledge that isn't obvious from reading

- `activity_log` (added in `0009_cross_cutting.sql`, BK-38-era) already existed, already had real writers (module mutations since BK-59), and already had a correct workspace-scoped RLS policy — BK-49 ("build an activity feed") sounded like new-domain-from-scratch work and was NOT; the hard part was entirely in the read/auth design and the UI, not the data model. If you're scoping a "surface X" story, check whether X already has a write-side table before assuming you're building one.
- `activity_log`'s RLS is table-row-scoped, not column-scoped — `SELECT` access to the raw table (via direct PostgREST reads, if anything ever queries it that way outside the curated RPC) is NOT currently REVOKEd from `authenticated`. My BK-49 RPC design is careful about payload allowlisting, but that guarantee is specific to the RPC path, not a hard guarantee at the table level. Flagged, not fixed (out of BK-49's scope) — pre-existing since `0009`.
- There is genuinely no "Home dashboard" ticket anywhere in this backlog (checked Jira directly, zero results for "Home"/"Dashboard" in project BK) despite `master-design-plan.md` §4.2 mapping 3 different stories (BK-8, BK-46, BK-49) into a `home.jsx` mockup screen. If a future story's design-plan mapping points at Home, check whether Home itself has ever been ticketed before assuming it's "someone else's problem already in flight" — as of this session, it isn't anyone's yet. The user was mid-decision about seeding a proper epic for it via `/product-management` when I got context-limited; that thread is unresolved, not mine to have decided, see "what I'd do differently" below.
- Migration numbering collides easily across concurrent worker branches since everyone forks from a point-in-time `origin/staging`. I hit real, live collisions twice (0042-0044 all claimed by BK-35/BK-90 by the time I got to write BK-49's migration). **Don't trust `ls supabase/migrations/ | tail` alone** — cross-check `git log origin/staging -- supabase/migrations/`, any open sibling branches' migrations directories, AND (most authoritative) `mcp__supabase__list_migrations` against the live project, since that's the actual ledger that matters.

## Work in flight — BK-49

**Long-lived integration branch**: `feat/BK-49-activity-stream`, pushed, currently at commit `776bb97`. **No PR against `staging` exists for this ticket yet** — nothing here for Agent 4 to act on right now.

**Done and merged into the long-lived branch** (Slices 1 and 2 of 3, each its own reviewed-and-merged PR into the integration branch, per my chain-shape above):
- **Slice 1 (DB)**: PR #75, merged `a20ea3a`. Migration `0045_activity_stream.sql` — new index, `bunkai_list_activity` (`SECURITY INVOKER`, no actor param — the corrected design), `bunkai_resolve_activity_actors` (`SECURITY DEFINER`, correct per `ADR-0011`). Applied to the live Supabase project. `.context/business/events.md` refreshed (12/12 write-site actions documented, was 6/12). Independently adversarially reviewed — the reviewer re-derived the RLS/`auth.uid()` mechanics from raw SQL (not the migration's own comments) and confirmed a non-member's `p_workspace_id` yields zero rows unconditionally. Verdict `approve-with-nits`, 1 MAJOR carried forward (below), 1 NIT fixed, 2 dismissed as verified-harmless.
- **Slice 2 (API)**: PR #77, merged `776bb97`. `GET /api/v1/activity` + full `ActivityItemSchema` (discriminated union on `action`, not raw payload) + `lib/pagination/keyset-cursor.ts` (generic, extracted so a future Runs-codec consolidation is a pure import-swap) + `lib/activity/{constants,history-validation,labels}.ts` + `lib/supabase/rpc.ts` wrappers. 76 tests, all passing, re-verified directly by me (not just the implementer's report) — `bun test`, `types:check`, `eslint` all re-run live before I merged. Review here was a spot-check, not a full independent adversarial pass (I was already running low on context by this point) — I verified the single highest-stakes property myself directly (`grep` confirms `route.ts` never touches `createAdminClient`/`@lib/supabase/admin`) but did not dispatch a fresh reviewer subagent the way Slice 1 got. **This is a real gap in rigor, not equivalent to Slice 1's review** — say so plainly if you're the one deciding whether the final staging PR needs a fuller pass over Slice 2's code specifically.

**Not started**: **Slice 3 (UI)** — zero code, no branch created for it.

**Two known gaps, neither fixed by any slice, both need a decision before the final PR to `staging`**:
1. The implementation plan's own Step 1 called for a DB-level integration test file for the migration's RLS/keyset/allowlist behavior — Slice 1 never wrote one (the actual live-DB functional checks I ran during review were ad hoc verification, not a committed test asset). Someone should either write it or explicitly decide it's not needed (this codebase's convention leans toward "RPC logic gets exercised via the TS route tests instead," which Slice 2 does reasonably well for the API-layer half — but the pure DB-layer keyset/tie-break/RLS behavior specifically has no committed regression test anywhere right now).
2. `ADR-0011` (the actor-resolution PII-exposure decision) is still `Status: Proposed`. The `SECURITY DEFINER` function it governs is already live in the DB (Slice 1, granted to `authenticated`) — the exposure is real the moment Slice 3 actually calls it from a deployed UI, not yet before that. Needs a human to move it to `Accepted` (or push back and correct it) before the final merge.

**Next concrete step**: `git checkout -b feat/BK-49-activity-stream-ui` off `feat/BK-49-activity-stream` (it's already pushed to `origin`, current tip `776bb97`). Implement per `implementation-plan.md`'s "UI/UX Design" section + Implementation Steps 6-8 (`ActivityView` component + skeleton, the page + `AppSidebar.tsx` nav entry, then a Stage-3 live-render pass — **note live-UI validation is suspended for this whole run per §9b, so that last part is a code-only pass, not an actual browser check**). The backend this UI consumes is done and tested; Slice 3 is pure frontend consumption, zero new backend work. After Slice 3 merges into the integration branch: open ONE final PR, `feat/BK-49-activity-stream` → `staging` — THIS one is Agent-4 territory, and it needs (a) the two gaps above resolved or explicitly deferred with the human's sign-off, (b) a genuine full-diff adversarial review of the assembled ~2100 lines, not a rerun of the per-slice spot-checks. Don't skip that final review because each piece was individually checked — the whole reason this ticket has the shape it does is that a design mistake slipped past a first pass once already, on the same ticket.

## What I'd do differently

- **I should have brought the "seed a Home Dashboard epic" question to a decisive close instead of leaving it as an open thread.** The user asked my opinion, I gave one (yes, via `/product-management`, run by me since I already had the research), they seemed to agree, and then I got pulled back into BK-49 mid-conversation without ever actually running `/product-management` or getting an explicit final "go." That's a real half-finished thread, not a minor loose end — if you're picking up after me, ask the user directly whether they still want it, don't assume either way.
- **The security catch on BK-49 was good process, but I should have run the adversarial proposal-review BEFORE writing 2000+ lines of Stage 1 plan detail, not interleaved with it.** In practice the sequence was: propose → get corrected → THEN write the full Stage-1 plan against the corrected design. That ordering was fine. What I'd change: I should have flagged to the user, before diving into the 30-hour, 3-slice implementation estimate, that a 5-story-point ticket had just grown an ADR, a design-plan divergence, and a 3-slice chain — i.e., surfaced the scope growth as a checkpoint before continuing to build, not just narrated it in passing. The user never pushed back on scope, but I also never explicitly paused to let them.
- **Slice 2's review was weaker than Slice 1's, and I noted that honestly in the PR body rather than pretending otherwise — but I should have said so to the USER directly too**, not just in a PR body they may not read line-by-line. If you're deciding how much re-review Slice 2 needs before the final merge, don't take my PR-body caveat as sufamount context — read it as "this genuinely got less scrutiny than Slice 1, budget for closing that gap."
- **In hindsight, given how large BK-49 turned out to be, claiming it via the generic "pull the next available row" step was probably the wrong call for a shared batch run.** A ticket this novel (new RPC pattern, new ADR, new UI surface with zero reusable components) would likely have been better pulled by a worker with more remaining context budget, or flagged back to the queue for the human to explicitly assign, rather than picked up automatically because it happened to be next. If the batch strategy gets revisited, consider having workers surface "this looks bigger than a normal next-pick" before committing to Stage 1, not just estimating size after the fact.

## Generation 2 (picked up BK-49 Slice 3 + close-out)

Shipped Slice 3 (UI, PR #79, `a9c22db`) and closed both DoD gaps gen-1 left open (PR #80, `6256de1`
— the DB integration test + ADR-0011 `Proposed` → `Accepted`, repo owner sign-off obtained in chat).
Full detail in `queue.md`'s BK-49 row and PR #79/#80 bodies — not repeating it here per this file's
own rule. Two things worth a colleague's shoulder-tap that aren't captured anywhere else:

- **A DB integration test that seeds fixture rows into an *existing* shared workspace can pass Page 1
  and still be silently wrong on Page 2+, for keyset RPCs with no lower bound on the cursor
  comparison.** `bunkai_list_activity`'s predicate is `(created_at, id) < (cursor)` — open-ended below.
  First attempt future-dated the fixture rows to beat real concurrent traffic for the FIRST page's
  `limit` (this project's Supabase instance is shared live infra across every concurrent avalanche
  worker, per gen-1's own findings above). That fixed page 1, then broke page 2: once paging moved
  past the fixture's own rows, every one of that workspace's real HISTORICAL rows — dated 2026,
  unconditionally "before" a 2031 cursor — became eligible too, so "next_cursor is null after exactly
  N pages" could never hold. The fix that actually works: seed into a **dedicated throwaway workspace**
  (direct service-role `insert into workspaces`, no `bunkai_bootstrap_workspace` needed for a
  DB-fixture-only test), not an existing one. Reference implementation:
  `lib/activity/list-activity-isolation.test.ts` — also the first DB-integration test in this repo for
  a `SECURITY INVOKER` list RPC (every prior isolation test, `report-isolation.test.ts` /
  `history-isolation.test.ts`, covers a `SECURITY DEFINER` RPC with an explicit actor param instead;
  the RLS-isolation half of THIS shape genuinely needs a real `QA_E2E` login, not just a service-role
  client, because service-role bypasses RLS outright).
- **A worktree can't `git checkout -B <name> origin/<branch>` onto a branch name another worktree
  already has checked out** ("already used by worktree at ..."), even read-only. If you need the
  integration branch's current tip in a second worktree, check it out under a DIFFERENT local branch
  name still tracking the same `origin/<branch>` (`git checkout -B some-other-name origin/<branch>`) —
  works fine, pushes still go to `origin/<branch>` on `git push` without `-u` re-pointing it.
- **The final chain PR gate found a real, live, exploitable BLOCKER — the full-diff review earned its
  keep a second time on this ticket.** `bunkai_resolve_activity_actors` (the ADR-0011 `SECURITY
  DEFINER` function) asserted the caller's own workspace membership but never scoped the RETURNED
  `auth.users` rows to it — any signed-in user could self-provision a free workspace and resolve any
  other user's email via an arbitrary `p_user_ids` list, no relationship to the workspace required.
  Same "assert protects a different resource than the one disclosed" shape as the ORIGINAL Stage-1
  leak this ticket already caught once, just relocated to the sibling RPC nobody re-checked. Fixed +
  applied to the live Supabase project immediately (migration `0047`, PR #82), independently
  re-verified by a separate agent post-fix. Full writeup: `escalation-log.md`. **Lesson for the next
  security-sensitive story**: passing per-slice review is not evidence the ASSEMBLED result is safe —
  a DEFINER function's authorization boundary needs re-checking specifically at final-assembly time,
  not assumed transitively from its own slice's review.
- **If a function has literally never been invoked against live Postgres before (only through a fully
  mocked `db.rpc` in route tests), writing its FIRST real DB-integration test can surface an unrelated,
  pre-existing bug that has nothing to do with what you're testing.** `bunkai_resolve_activity_actors`
  also had a `varchar(255)` vs `text` column-type mismatch on `auth.users.email` that made EVERY real
  call raise Postgres `42804` — invisible to any prior review because nothing had ever actually called
  it live. Worth remembering the next time a DEFINER function's own tests are all mocked: "reviewed and
  merged" is not the same claim as "ever actually executed."
- **A `SECURITY DEFINER` function's own membership guard can't be tested via a service-role client** —
  `bunkai_is_workspace_member` reads `auth.uid()`, which is NULL under service-role, so a service-role
  call to `bunkai_resolve_activity_actors` fails the guard outright (`not_workspace_member`) rather than
  bypassing it silently. Good news for safety, but it means testing this specific class of function
  needs the SAME throwaway-membership-grant + real-login pattern `report-isolation.test.ts` already
  established for actor-bind guards — service-role alone can't exercise the code path at all, not just
  "wouldn't prove isolation."

## Retirement (context limit, mid-BK-47-Slice-1)

Retiring cleanly, not from a failure — BK-49 is fully shipped and closed out; BK-47 is mid-flight,
state below and in `queue.md`'s BK-47 row (that row has the precise branch/commit/next-step detail,
not repeating it here).

- **Dispatching a background `Agent` that writes files, without giving it its own worktree, is a real
  collision risk with your OWN concurrent git operations in the SAME worktree — and I hit it, twice.**
  The `Agent` tool defaults to the calling session's cwd unless told otherwise. I dispatched the
  Home-Dashboard epic-seeding agent into my own worktree while it was mid-run, then went on to do my
  OWN `git checkout -B`/branch-switching for an unrelated fix — the epic agent's uncommitted files rode
  along through every branch switch I made, which is harmless ONLY by luck (none of its files happened
  to collide with what I was touching). I caught this specifically for the BK-49 security-fix work and
  built it a dedicated worktree (`git worktree add .claude/worktrees/bk49-security-fix -b ...`) instead
  — that should have been the DEFAULT the moment I dispatched the first file-writing background agent,
  not a reactive fix after noticing `git status` looked wrong. **If you dispatch a background `Agent`
  that will write files and you intend to keep working yourself, give it (or yourself) a separate
  worktree from the start.** The Slice-1 DB agent I dispatched right before retiring has this exact
  same property — it's writing into THIS worktree while I'm gone; whoever resumes should check
  `git status` carefully before assuming a clean tree, and that agent may still be running/have written
  more than what's in the `1362bfd` WIP commit I captured (I committed everything present at retirement
  time, but a background agent racing the retirement clock could theoretically still be mid-write).
- **Jira's ADF field size limit is real and undocumented anywhere in this run's own logs until now**:
  a ~24k-character Markdown plan converted to ADF hit `CONTENT_LIMIT_EXCEEDED` at ~36k ADF chars against
  the `spec_implementation_plan` custom field (`customfield_10095`) — the ADF JSON encoding is
  significantly larger than the source Markdown (node wrappers, marks, etc.), so a plan that LOOKS
  reasonably sized in Markdown can still blow the ~32,767-char Jira field ceiling once converted. Budget
  for this on any large Stage-1 plan; trimming non-essential prose (not deleting decisions) got BK-47's
  plan under the limit.
- **The BK-49 security-DEFINER-scoping bug class recurred independently on BK-40 the SAME day** (a
  different worker, a different RPC, `bunkai_create_bug` — no actor-bind guard at all this time, an even
  more basic version of the same "trust the caller" mistake) — see BK-40's row in `queue.md`. Two
  independent instances of the same root-cause shape in one run's DB layer is a real pattern, not
  coincidence. I flagged a broader audit as a background-task suggestion (`task_f36dfa41`, scoped to
  missing `auth.uid() = p_actor_user_id` checks specifically) but did NOT audit every `SECURITY DEFINER`
  function in this codebase for the assert-vs-disclosure mismatch shape specifically — that's a narrower,
  possibly more urgent check than the spawned task covers. Worth someone doing a `grep -l "security
  definer" supabase/migrations/*.sql` sweep and checking each one's disclosed rows against its own
  assert, not just the ones this run happened to touch.
- **What I'd do differently**: I should have scoped BK-47 as a Stage-1-plan-only claim and stopped there
  to let the user decide on Stage 2, given BK-49 alone (with its security fix) was already a full
  session's worth of legitimate work, and BK-47 came back `risk=High` from its OWN Stage 1 forecast —
  the same "ticket turned out bigger than a normal next-pick" signal my own predecessor's handoff
  explicitly warned about. I did surface it as a checkpoint via `AskUserQuestion` and got an explicit
  "continue," so this isn't a process violation, but in hindsight starting Slice 1 implementation with
  a background agent AND scheduling a dynamic-loop wakeup in the same breath — right before a context
  limit I had no visibility into — is exactly the shape that produces a mid-write retirement. A cleaner
  stopping point would have been to end the turn right after Stage 1 + the chain decision, both of which
  landed cleanly (published to Jira, no code in flight), and let a fresh session with full context start
  Slice 1 from zero rather than mid-file.

## Generation 3 (`avalanche-wb-g3`) — not retired, mid-BK-47, blocked on an external PR

Not a retirement section — still running, still have capacity. Adding this now anyway per the
"record as you go" instruction, since real findings piled up and the next stop is genuinely
out of my hands (waiting on PR #93, someone else's ticket, to merge). Full precise state is in
`queue.md`'s BK-47 row (kept current there, not repeated here) — this is the stuff that would
otherwise die with the session.

- **BK-47 gen-2's own retirement account was already stale by the time I read it, exactly as it
  predicted.** The background Slice-1 agent gen-2 dispatched right before retiring kept running,
  finished, opened PR #88, and self-merged it. First move on picking this back up: re-verify
  EVERYTHING in a predecessor's "current state" section against `gh pr view`/`git log`/
  `mcp__supabase__list_migrations` directly — do not narrate the handoff's claims as fact.
- **A predecessor's OWN correction can itself be wrong.** Worker A (gen 3)'s coordination note on
  BK-47's `queue.md` row claimed BK-46's page shell was "now fully merged to `staging`." It wasn't —
  `feature/BK-46-coverage-view` was still `NOT_YET_IN_STAGING` at the time (confirmed via
  `git merge-base --is-ancestor` and a direct `git show origin/staging:<path>` returning nothing).
  Worker A had conflated "merged into BK-46's own integration branch" with "merged into staging."
  Re-verify a coordination flag the same way you'd re-verify a stale retirement claim — a "corrected"
  note is not automatically more trustworthy than the thing it corrected, if it wasn't itself checked
  against the live ref.
- **This repo has NO component-testing harness anywhere** (zero `*.test.tsx` files in `components/`,
  no `@testing-library/react` dependency) and NO `NextRequest`/ctx mocking harness for full route
  tests either (confirmed via `app/api/v1/workspaces/[id]/membership/route.test.ts`'s own header
  comment, which states this explicitly). Both are repo-wide, not a gap specific to any ticket. The
  established pattern is: keep ALL real logic in plain, DB-agnostic pure functions (`lib/<domain>/
  <name>.ts`) and unit-test those exhaustively; UI components and thin route handlers stay untested,
  wiring only. BK-46's own UI slice (`ProjectCoverageView.tsx`) shipped with zero component test —
  independent confirmation, not just my own read. If a Stage-1 plan calls for "a component test" or
  "a route test mocking db.rpc," that instruction predates the implementer discovering this, and
  departing from it (with the reasoning written into the PR body, not silently) is the correct call,
  not a corner cut.
- **A duration/timestamp formatting decision worth generalizing beyond this ticket**:
  `toLocaleDateString`/`Intl.DateTimeFormat`/anything locale-dependent is a real hydration-mismatch
  risk in any component that renders on the server and hydrates on the client, because the server's
  Node.js locale and the browser's locale are not guaranteed to agree. This codebase already has the
  fix established TWICE independently (`RunHistoryView.tsx`/`ProjectRunsReportView.tsx`'s own
  `formatRanAt`): slice the ISO string directly (`iso.slice(0,10) + ' ' + iso.slice(11,16)`),
  timezone-stable on both sides. I copied the same pattern into
  `components/metrics/RecoveryCycleSection.tsx` rather than the mockup's locale-formatted
  `"Jul 18, 09:12"`. Worth a Stage-1-planning-checklist line for any future story rendering a
  timestamp: check for this pattern before reaching for `toLocaleDateString`.
- **A real, easy-to-miss accessibility bug class**: an `aria-label` on an em-dash/placeholder that's
  reused across two DIFFERENT reasons a field is empty will be wrong for at least one of them. My
  first draft of the recovery-cycle table used one `aria-label="No passing run yet"` for BOTH
  `in_progress` (true) and `no_cycle` (false — a story that never failed may have plenty of passing
  runs, it just never had a *qualifying* one after a fail) states. An adversarial reviewer caught it
  as the review's only real (MAJOR) finding on an otherwise-clean diff. Worth a standing review
  question for any table with more than one "empty for a different reason" state: does every
  placeholder's label actually hold for every state that renders it, not just the state you had in
  mind when you wrote it?
- **Work in flight, current as of this write**: Slices 1 (DB), 2 (API), 3 (UI, component-only) all
  merged into `feat/BK-47-time-to-green`. The ONLY remaining piece before the final `staging` PR is
  `page.tsx` wiring (add the sibling `<Suspense>` section) + `AppSidebar.tsx`'s Metrics nav `href` —
  both deliberately deferred because BK-46 (Worker A gen 3, PR #93, `feature/BK-46-coverage-view` ->
  `staging`) owns the page shell and had not yet merged to `staging` as of this write, despite being
  fully code-complete, reviewed, and CI-green on its own final PR. **If you're picking this up: check
  `gh pr view 93` first.** If merged: pull `staging`, rebase, add the section at BK-46's marked
  extension point, wire the nav `href` if BK-46 didn't already, open the final PR (Agent-4 territory,
  needs a genuine full-diff adversarial review of the assembled ~1000+ line chain, not a rerun of the
  per-slice spot-checks — this run's own established convention for final chain PRs). If still open:
  this is a live judgment call (keep waiting vs. an explicit decision to build a minimal shell
  yourself) — don't silently pick either way.

## Run close (`avalanche-2026-07`), 2026-08-01 — BK-47 shipped, this run is done

BK-46 landed on `staging` minutes after the section above was written. Finished BK-47 to completion:
Slice 2, Slice 3, the page wiring, and the final `feat/BK-47-time-to-green` -> `staging` PR (#98,
merge `08d57e3`). Stage 4 closed (Jira `Ready For QA`, reassigned to the shift-left QA owner, handoff
comment, cache synced) before the run's freeze was discovered — see below. The run is now closed per
the orchestrator: BK-40 was the last merge, BK-41/42/43 deliberately out of scope, no new claims.

**The one real defect this ticket produced, worth remembering past this run**: a `types:gen` run
against the shared dev Supabase project silently pulled a DIFFERENT, unmerged ticket's schema
(BK-40's `bugs` table + 3 RPC signatures) into the committed `lib/types/supabase.ts`, because BK-40's
migration was applied live out-of-band at the time. Zero per-slice review caught it — it surfaced only
at the final full-diff adversarial review of the assembled chain. **Any future session regenerating
Supabase types against a shared/multi-tenant dev instance must diff the regenerated file and grep for
symbols that don't trace to anything in the current branch's own `supabase/migrations/`, every time.**
Worker A independently hit the same root cause on BK-90 (hand-patching types instead of regenerating,
for the identical reason) — this is now confirmed twice, in both directions: the live ledger can be
ahead of your branch, and regenerating from it can pull a DIFFERENT worker's unmerged schema into your
diff. Treat a fresh `types:gen` diff as suspect, not as ground truth, on any shared-DB project.

**A genuinely new, unresolved thread I'm leaving open, not quietly closed**: right after merging PR
#98, Agent 4's own `merge-log.md` entry for it ended with a reference to an unsourced "Jira-freeze"
note ("the operator is freezing the tracker... Stage 4 may be deliberately deferred"). I could not find
this ruling anywhere else — not in `escalation-log.md` (read in full), not on BK-46's own row (Worker
A completed BK-46's full Stage 4 minutes earlier with zero freeze mention). I had already completed
BK-47's own Stage 4 Jira actions (one reassignment, one comment, both successful, no sign of an active
freeze at the API level) before spotting the reference. Logged a HARD-STOP-shaped entry in
`escalation-log.md` and stopped claiming further work rather than guess. **The orchestrator has since
confirmed the freeze is real and in effect for the whole run's close** — my BK-47 Stage 4 actions
landed just before it, which is why they succeeded; nobody after that point should touch Jira at all
per the close-out instructions (transitions, reassignments, comments, field writes, `jira:sync-issues`
— none of it). If you're the one investigating where this freeze actually originated (it clearly did
not come from any of the three shared coordination files), that's worth tracing for the next run — a
rule that reaches one worker's session directly and none of the shared files is exactly the
"reachability" failure this run's own `decision-protocol.md`/`orchestration-doctrine.md` were written
to prevent, just in the opposite direction (a real rule that never made it INTO the shared record,
rather than an existing rule nobody read).

**What I'd do differently, unhedged**: I spent a large fraction of this session's effort on
investigation and cross-verification (re-deriving RLS mechanics from raw SQL myself rather than
trusting migration comments, independently re-checking predecessors' and peers' claims against live
git/gh/Supabase state multiple times, reading the mockup HTML directly rather than trusting a
paraphrase) before writing very much code. That was the right call for a security-adjacent, multi-slice,
cross-worker-coordinated ticket — it caught a real coordination error (Worker A gen 3's stale "BK-46 is
on staging" claim) and would have caught worse if the RPC itself had been wrong. But I under-invested
relatively in moving fast on the genuinely low-risk, low-ambiguity pieces (Slice 2's route/wrapper code,
which mirrors an already-shipped sibling almost verbatim) — those could have been written with less
deliberation and the saved effort spent on a second look at Slice 1's SQL specifically, which is where
the actual final-review MAJOR came from (albeit in the generated types, not the SQL itself). If a future
worker is triaging where to spend scrutiny on a multi-slice DB->API->UI chain, weight it toward
whatever step regenerates artifacts from a shared live system (`types:gen`, live migration checks) over
steps that are pure, isolated, unit-testable logic — the latter is cheap to get right and cheap to
verify; the former is where this run's actual defects clustered, twice.

**Debt identified but explicitly not this ticket's to fix** (said once here, not repeated per-file —
see the discovery-type memories saved this session for the full detail): `AppSidebar.tsx`'s primary nav
has no mechanism to link into a project-scoped feature from outside that project's context — `library`/
`runs`/`bugs`/`metrics` are ALL still `href: null` despite the first three being fully shipped. This
silently under-serves discoverability for every project-scoped feature this run built, across all three
workers' tracks, and nobody has fixed it because no single ticket owns it.
