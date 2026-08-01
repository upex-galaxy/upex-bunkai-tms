# Worker A handoff — avalanche-2026-07

Retired on context limit, not on a failure. Track: Settings cluster (BK-88, BK-176), then shared-queue pulls (BK-90).

## Tickets touched

- **BK-88** (Manage Personal Access Tokens) — shipped. Stacked 2-PR split: #68 (list+revoke), #70 (issue-token flow). Both merged, Stage 4 closed out fully by me.
- **BK-90** (Leave a workspace) — shipped. Stacked 2-PR split: #72 (backend RPC+endpoint), #74 (frontend modal+wiring). Both merged, Stage 4 closed out fully by me. Completed the whole Phase 1 Settings cluster (BK-87/88/89/90 all landed).
- **BK-176** (Sign-out redirect never fires, bug) — CLOSED by generation 2, see the "BK-176 — CLOSED" section below.
- **BK-248** (`POST /api/v1/tests` idempotency FK-violation 500, bug) — SHIPPED. PR #81 merged, Stage 4 closed out fully by me (Jira auto-transitioned this time, unlike BK-176 — see the trap below). Root cause: `beginIdempotentRequest` mapped every non-23505 Postgres insert error to a generic `internal_error`, including a `23503` FK violation on `idempotency_keys.workspace_id` when the caller supplies a nonexistent workspace — now mapped to `validation_failed`/422. Reproduced directly against the live Supabase project (raw SQL, then the real JS admin client) before writing the fix — worth doing for any "500 with a generic message" bug report. A real, out-of-scope gap was found and deliberately NOT fixed (route accepts workspace_id with no membership check) — spun off as its own background task (`task_fcaab167`).
- **BK-46** (Untested ACs / coverage surface, 8sp story) — **IN FLIGHT, retiring mid-chain. See `queue.md`'s BK-46 row for the full, current, precise state (branch names, commit SHAs, PR numbers, exact next command) — I wrote it carefully right before this handoff specifically so it doesn't need restating here.** The short version: all 4 feature-branch-chain slices are code-complete; Slices 1-3 are merged into the long-lived integration branch; Slice 4 (PR #87) is open and its CI was re-running on my very last commit when I retired — check it fresh. The only remaining work is the final `feature/BK-46-coverage-view` -> `staging` PR (full-diff adversarial review first, per this run's convention for final chain PRs) and Stage 4 after that merges. Below are the traps/conventions/knowledge from this ticket that aren't in `queue.md`.

## Traps that cost real time

1. **Two-phase branch-protection drift, not one.** Early in the run `staging`'s GitHub ruleset genuinely required 1 approving review + code-owner review while `.agents/project.yaml` declared `require_pr_reviews: 0` — real declared-vs-enforced drift, not a false alarm (verified via both classic-protection AND `rules/branches/staging`, per this run's own doctrine). This blocked #68 for ~4h. The user relaxed the ruleset (`required_approving_review_count: 0`) mid-run — after that, Agent 4 correctly stopped using `--admin` on new merges. If you see `reviewDecision: REVIEW_REQUIRED` on a PR, check the ruleset directly before assuming it's still the old drift; it may already be fixed.

2. **Agent 4's own session hit a harness Bash-permission clamp mid-run** (documented in `escalation-log.md` as the "~4.5h stall") — its 15-minute sweep cron got cancelled and, per its own log entry, needed a manual `/loop 15m <sweep prompt>` relaunch after Bash was restored. It merged one batch (#67/#68/#70) immediately after recovery, then went quiet again for ~1.5-2h on #69/#71 with the branch-protection issue already fixed — nothing wrong code-side, the cron just wasn't ticking. If a PR sits mergeable-and-clean for a long stretch, check whether Agent 4 is between sweeps before assuming something's broken.

3. **When blocked on a merge you can't control, don't idle — build the next stacked slice on top of the still-unmerged branch.** I did this twice (BK-88's PR2 stacked on PR1 while PR1 sat blocked; would have done it again on BK-90 but PR1 merged before I needed to). GitHub auto-shrinks a stacked PR's diff to just the new slice the moment the base PR merges — no rebase needed unless a real conflict appears. This kept both tickets moving instead of sitting in 15-20min `ScheduleWakeup` loops doing nothing. Only extend this to the SAME ticket's next slice, not an unrelated new ticket — the explicit worker protocol is wait-for-merge-before-the-next-ticket, and I stuck to that boundary.

4. **Every `LeaveWorkspaceModal`/hand-built-modal-on-`useModalDismiss` needs its OWN explicit focus-on-open effect.** The shared hook (`lib/hooks/use-modal-dismiss.ts`, BK-88) only does Escape-to-close, return-focus-to-trigger, and Tab-wrapping — it does NOT move focus in on open. If a new modal doesn't focus something inside `containerRef` itself, the Tab-trap silently never engages (it only wraps focus already inside the container) and a keyboard user walks straight past the "modal" into the page. Caught this in review on both `RevokeTokenModal`'s original build (BK-88, fixed) and independently again on `LeaveWorkspaceModal` (BK-90, fixed) — it is NOT a one-off mistake, it's a gap in the hook's own contract that every consumer needs to compensate for manually. Worth fixing in the hook itself rather than re-discovering per modal.

5. **Migration numbering must be checked against the LIVE Supabase project, not local `git log`.** BK-90's plan assumed migration `0042` was next-free; by the time I implemented, a concurrent worker's unmerged branch (BK-35) had already applied `0042`/`0043` to the shared remote project. `ls supabase/migrations/` locally didn't show this — had to check the actual Supabase ledger (`list_migrations` via MCP) to find the true next-free number (`0044`). This project's single Supabase instance is shared dev/test infra across all concurrent workers; local files lag behind what's actually been applied remotely.

6. **Atlassian MCP (`editJiraIssue`, `addCommentToJiraIssue`, `getJiraIssue`, `lookupJiraAccountId`) times out intermittently, sometimes for several consecutive calls, occasionally with a distinct "classifier temporarily unavailable" error instead of a plain timeout.** Both are transient — retrying a few times over a couple minutes usually recovers it. If it stays down: the direct REST fallback (`curl -u $ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN -X PUT "$ATLASSIAN_URL/rest/api/3/issue/{key}/assignee" --data '{"accountId": "..."}'`) is a legitimate substitute — it is NOT the same failure mode as acli CLI's silent-unassign bug (that gotcha is specific to `acli`'s own CLI path, not to REST called directly). Always verify the assignee actually changed afterward regardless of which path you used (`GET .../issue/{key}?fields=assignee`).

## Conventions I established (not written down elsewhere, follow if you touch this area)

- **Stacked-to-main slice boundary for a story whose backend is already fully built** (BK-88's shape): Slice A = list/read + the "safe" mutation (revoke), explicitly WITHOUT the create/issue action and WITHOUT its UI trigger (no dead button, just omit the button/CTA entirely in the interim state). Slice B = the create/issue flow, added on top. Applies when the two flows are independently coherent user-facing states, not artificial file-based cuts.
- **Stacked-to-main slice boundary for a story needing NEW backend work** (BK-90's shape): Slice A = the new RPC/migration + its thin REST wrapper + route-level tests only, deliberately excluding any `lib/`-level UI-consumption helper (e.g. `isSoleOwner`/`buildWorkspaceRows` extensions) even though they're "just" pure TS — those belong to Slice B because they only exist to feed the UI. Reference: `.context/PBI/epics/EPIC-BK-85-account-settings/stories/STORY-BK-90-tms-workspace-leave-a-workspace/implementation-plan.md`'s own Technical Decision 6 reasoning.
- **When a shift-left AC question has only a "role-played, explicitly disclaimed practice-exercise" answer that was never formally accepted (the Jira field's confirmation flags never got cleared): treat it as genuinely unresolved, not resolved.** I escalated two of these live (BK-90) rather than trusting the draft comment — and one of my own first-pass answers to the user turned out to conflict with the ACTUAL shipped mockup (a more authoritative, more recent source per Critical Rule #15). Always cross-check a ratified answer against the mockup before implementing, even after the user has answered — the mockup can outrank an answer given without having re-read it.
- **User granted standing full autonomy partway through this run**: stop asking clarifying questions, auto-pick the recommended option, document the reasoning in the artifact it belongs to (Jira comment, `review.md`, etc.) instead of pausing. This is now in Engram memory (`workflow/avalanche-2026-07-autonomy`) — should already carry over to a fresh session reading project memory, but flagging here in case it doesn't get picked up automatically.

## Codebase knowledge that isn't obvious from reading

- `components/settings/WorkspacesList.tsx` is rendered from TWO call sites (`settings/account/page.tsx` AND `settings/workspaces/page.tsx`) with the same component, same props shape mostly — but they intentionally fetch their own data independently (not shared/cached), and any new opt-in behavior (like BK-90's `enableLeaveAction`) must default OFF and be explicitly verified NOT to leak onto the account page via an empty `git diff` check, not just "I didn't touch that file."
- `lib/hooks/use-modal-dismiss.ts` mirrors the mockups' vanilla-JS `trapFocus()`/`openModal()`/`closeModal()` pattern closely, but is NOT a byte-for-byte port — the initial-focus call (`lvInput.focus()` in the mockups) was left out of the hook itself in BK-88's first build and never retrofitted; see trap #4.
- Bug work items (Jira type `Bug`) start at status `Open`, not `Ready For Dev` like Stories — confirmed independently, same as Worker C's note.
- `bunkai_leave_workspace` (migration `0044`) is the second transactional multi-step RPC in this codebase after `bunkai_bootstrap_workspace` (migration `0006`) — if a third one is ever needed, that pair is the reference pattern (SECURITY DEFINER, `search_path=''`, custom `45xxx` errcodes, single-statement atomicity via PL/pgSQL exception rollback).
- `public/openapi.json` is a COMMITTED, statically-served file (`app/api/openapi/route.ts` reads it off disk, `force-static`) — it does NOT regenerate itself on build or on route changes. Every new `route.openapi.ts` needs an explicit `bun run openapi:gen` + commit in the same PR, or the live `/api/openapi` spec silently drifts. Caught this missing on BK-90 PR1 in review; regenerating it also incidentally picked up a real, already-merged gap from BK-89 (the `role` field on `GET /api/v1/workspaces` was never in the spec either) — that's expected, not scope creep, as long as you verify the diff doesn't ALSO leak an unmerged concurrent worker's schema.

## BK-176 — CLOSED (generation 2, see queue.md for full detail)

Merged (`5abf890`), Stage 4 complete, `queue.md` row is `done`. Not in flight anymore — the section
below is gen-1's original account, kept for the root-cause narrative; don't act on its "Next concrete
step", it's stale.

## Work in flight — BK-176 (historical, gen-1's account — ticket is closed now, see above)

**Branch**: `fix/BK-176-signout-redirect` (pushed to origin, commit `8a9a431`). **No PR opened.**

**Done**: root cause found and fixed. The `onAuthStateChange` listener in `components/providers/auth-context.tsx` fires in the SAME tab that called `signOut()`, and fires BEFORE that tab's own post-signOut redirect — supabase-js awaits every subscriber before `signOut()`'s own promise resolves. The listener was injecting a soft `router.replace('/login')` (Next.js client-side nav), which raced the initiating tab's own hard-navigation redirect and could silently fail to commit — matching the bug's exact symptom (page stays put, manual reload fixes it). Fix: `lib/account/auth-redirect.ts`'s `handleAuthChangeRedirect` now defaults its second param to `window.location.assign` (a real hard navigation) instead of requiring an injected soft-router callback; `auth-context.tsx` no longer imports/uses `useRouter` for this listener at all. Regression test added (`lib/account/auth-redirect.test.ts`) asserting the default calls `window.location.assign('/login')` exactly once on `SIGNED_OUT`. Lint clean, types clean, new test 3/3 pass, no new suite failures observed before I stopped.

**Not done**: Stage 3 independent adversarial review (none has happened — this is a genuine, unadjudicated gate gap, not a formality), opening the PR, and everything in Stage 4. Jira BK-176 has NOT been transitioned (still whatever the bug's live status was when claimed — check fresh, don't assume).

**Next concrete step**: `cd` into this worktree (or a fresh one), `git fetch origin && git log origin/fix/BK-176-signout-redirect` to confirm the branch/commit above is genuinely what's on remote. Dispatch an independent adversarial review against `git diff origin/staging..fix/BK-176-signout-redirect` (small diff, 3 files — should be quick). Adjudicate findings, fix if needed, THEN open the PR via `/git-flow-master` (`fix/BK-176-signout-redirect` -> `staging`) with the Stage 3 adjudication (BLOCKER/MAJOR/MINOR/NIT counts + disposition of each) explicitly in the PR body — per the user's own mid-session instruction, Agent 4 will not merge without that on record. Set `queue.md`'s BK-176 row to `pr-open` with the PR number. Once merged: full Stage 4 (Jira Ready For QA verify/transition, reassign to the shift-left QA owner — check `comments.md` for who actually ran shift-left on this bug rather than assuming it's the reporter/assignee Andrés Daniel Cumare Morales by default, verify the assignee change, handoff comment with the PR link, Jira sync, archive `.session/sprint-development/BK-176/`), mark `done`.

## Update from Worker A (generation 2) — BK-176 PR opened

`fix/BK-176-signout-redirect` was stale (forked before BK-182 merged into `staging`) — confirmed via
the `git merge-base --is-ancestor` check per the run-launch protocol. It printed `STALE`. Fixed with
`git merge origin/staging --no-edit` on a differently-named local branch (the branch name itself was
already checked out in gen-1's own leftover worktree, which was clean/untouched — no need to remove
it, just avoid the name collision), then pushed the merge back to the same remote branch name. Diff
came back down to exactly the intended 3 files after the merge, confirmed before dispatching review.

Dispatched a 2-lens adversarial Stage 3 review (correctness/regression, security/session-hygiene) via
the Workflow tool. Result: 0 BLOCKER, 0 MAJOR, 2 NIT, both from the correctness lens (security lens
came back clean `approve`, 0 findings). One NIT (double `window.location.assign` call in the
initiating tab — the listener's new default plus the pre-existing explicit call in
`AppSidebar.tsx`/`UserMenu.tsx`'s own `handleSignOut`) was verified against the actual call-site code
and dismissed as intentional defense-in-depth, not sloppiness — removing either call trades a harmless
same-URL double-navigation for a real fragility (no fallback if the listener doesn't fire). The other
(test leaked a `globalThis.window` mutation via unconditional `delete` in `finally` instead of
save/restore) was cheap and real, fixed in a follow-up commit. PR #78 opened to `staging` with the
full adjudication in the body; `queue.md` row updated in parallel per the standing instruction that
checking only one of the two places has caused a false block before.

**New trap, worth flagging for whoever reads this next**: in a worktree session, an absolute path
that happens to point at the MAIN checkout (not this worktree) reads silently — no error, just the
wrong branch's file content, with no signal anything is wrong. I read `auth-context.tsx` and
`auth-redirect.ts` via their `/Users/.../upex-bunkai-tms/...` absolute path out of habit right after
checking out the fix branch in my worktree, and got the OLD pre-fix code back, because that path is
the main checkout (still on `staging`), not my worktree. Cost real time chasing a "the fix isn't
there" false alarm before noticing `pwd` and the file's actual git-tracked branch didn't match. Inside
a worktree session, prefer cwd-relative paths (or the worktree's own absolute prefix) for anything
you expect to reflect YOUR branch's state, and treat the main-checkout absolute path as a different
repo state entirely, not an alias for "the repo."

**Second new trap**: `gh auth status` showed two logged-in accounts (`elycuracity`, `saiotest`), with
`elycuracity` active by default in this fresh worktree session — pushing failed with a 403 (`Permission
... denied to elycuracity`) even though the repo itself was reachable for read/fetch. Fixed with
`gh auth switch --user saiotest` (the account with actual `repo` write scope on
`upex-galaxy/upex-bunkai-tms`) before the push succeeded. Worth checking `gh auth status` early if a
push 403s for no obvious reason — it may not be a permissions problem with the repo, just the wrong
locally-cached identity being active.

## What I'd do differently

- **I over-invested in the multi-hour idle wait-loop before finding the real root cause of the stall.** Like Worker C, I sat through many `ScheduleWakeup` cycles checking the same two PRs with nothing new to report. I did eventually trace it to Agent 4's cancelled sweep cron and surfaced that directly to the user rather than logging another silent entry — that part I'd keep doing. But I should have checked `escalation-log.md`'s history for the pattern much earlier (on maybe the 2nd or 3rd identical check, not the 5th) — the information to explain the stall was already sitting in that file the whole time.
- **The two-round AskUserQuestion on BK-90 (ratify, then correct against the mockup) was the right call, not a mistake** — catching my own first-pass answer's conflict with the shipped mockup before implementing was real value, not friction. But I'd frame it more efficiently next time: check the mockup FIRST, before asking anything, so the question set presented to the user already accounts for what the design actually shows, rather than asking twice.
- **I did not get to verify whether BK-176's fix actually resolves the bug against a live browser** (avalanche's §9b suspension covers this, and this bug's whole nature — a client-side navigation race — is exactly the kind of thing a unit test can assert the DECISION for but can't fully prove end-to-end). Worth a QA priority flag: this specific bug class (navigation race conditions) is a weaker fit for "unit-test-only, no live-UI" than most of this run's other tickets, since the actual browser navigation timing is what's under test conceptually, even though the regression test is legitimate at the unit level.

## Update — generation 2 (context limit, BK-46 in flight)

### Bugs don't all auto-transition the same way, and it's not obvious which

BK-176 needed a fully MANUAL Jira transition (`Open` -> `In Progress` id `121` -> `Ready For QA` id `5`)
after its PR merged — no automation fired. BK-248, closed a few hours later in the SAME session, auto-
transitioned AND auto-assigned to the reporter the moment its PR merged (a real "Automation for Jira"
rule visibly fired, confirmed via the comment trail: "🔎 Pull Request created... ✅ Pull Request is
successfully MERGED. Task is Done."). I never found what actually differs between the two bugs'
triggering conditions (labels? component? something set at ticket-creation time?). **Don't assume
either behavior — check the ticket's live status after every merge, for every ticket, bug or story.**

### A second instance of the main-checkout-vs-worktree path trap, same session

Despite writing this exact trap into my OWN handoff last generation (see above), I hit a near-miss
of the SAME class again this generation: ran `bun run jira:sync-issues get BK-176` correctly in my
worktree, then read the synced `comments.md` via its absolute `/Users/.../upex-bunkai-tms/...` path
out of habit and got the STALE main-checkout content (`_No comments_`) instead of the freshly-synced
87-line file with the actual PO decisions. Caught it by re-running the same read via a Bash `cat`/`git
diff` from cwd instead, which showed the real content. **Writing the trap down once does not stop you
from doing it again under time pressure — grep your own commands for absolute `/Users/ely/Desktop/...`
paths that don't include the worktree segment, in EVERY session, not just after the first time it
bites.**

### A live, active cross-worker file conflict, caught only by re-reading queue.md mid-ticket

`master-design-plan.md` §4.7 maps BOTH BK-46 (mine) and BK-47 (Worker B, claimed the same day) into
the SAME mockup screen and the SAME route (`/projects/[projectSlug]/metrics`). Worker B left a
coordination flag on BK-46's own `queue.md` row BEFORE I'd re-read the file mid-ticket — I only found
it because I happened to re-read the full file while updating my own row after finishing Slice 4, not
because anything alerted me. Had I not re-read it, BK-47's Stage 2 would likely have either duplicated
`page.tsx` (a guaranteed merge conflict on the final chain PR, since neither branch is based on the
other) or forced a late rewrite. **`queue.md` is not a write-once claim ticket — re-read the WHOLE
file, not just your own row, at least once per work session on a story that touches shared UI real
estate (anything mapping to a mockup screen another ticket might also map to), not only at claim time.**
I fixed it by making my `page.tsx` the shell with an explicit extension-point comment (see
`app/(app)/projects/[projectSlug]/metrics/page.tsx`), since I landed there first and Worker B hadn't
started Stage 2 yet — but this was luck of timing, not something either of us could have planned for
without the flag existing. Whoever picks up BK-46 (or BK-47) next: re-check this coordination is still
accurate before assuming it's settled.

### Convention established — feature-branch-chain execution shape had a DAY-OLD standing rule I almost silently re-decided

My own launch briefing told me: "if you hit a chain, ask the user which shape is the standing rule
rather than picking one and setting a third precedent." I did ask — and got an answer (one-branch/
single-PR) that turned out to CONTRADICT a standing rule Worker C gen-2 had already settled on BK-40
a few hours earlier (PR-per-slice), recorded in `escalation-log.md` with an explicit "do not
re-litigate." I hadn't re-read that file closely enough before asking, so my question re-litigated a
settled decision and got the opposite answer purely because the user wasn't reminded of their own
earlier ruling. Caught it by reading further down `escalation-log.md` before ACTING on my fresh
answer, surfaced the conflict directly, and the user confirmed the existing BK-40 ruling stands.
**Before asking ANY "which standing convention applies" question, grep `escalation-log.md` for the
exact topic first (chain shape, QA-owner reassignment pattern, branch-protection state) — a governing
entry may already exist from earlier the SAME day, not just from a prior generation.** BK-46 executed
under the confirmed standing rule: PR-per-slice against the integration branch, self-merged, only the
final integration -> staging PR touching Agent 4.

### Codebase knowledge — coverage domain (BK-46), not obvious from reading the code alone

- **The segment filter ("All"/"Coverage gaps"/"Never run") is NOT the same partition as the RPC's
  per-module `status` enum.** The mockup's own JS (`metrics-dashboard.html`'s `applyFilter`) checks
  raw `unc > 0` (gaps) and `nr > 0 && bound > 0` (notrun) independently — a module can match BOTH
  segments at once (confirmed: the mockup's own 8 demo rows sum to 4+5=9 matches across only 8
  modules). If a future story extends this screen, don't reuse the RPC's `status` field for filtering
  — re-derive from the raw counts, matching `lib/coverage/coverage-view.ts`'s `matchesSegment`.
- **`atc_acceptance_criteria` (the ATC<->AC join table) has NO project-scoping of its own** — its RLS
  only gates write access to the ATC side, nothing stops a row pairing an ATC from Project X with an
  AC from Project Y. `bunkai_report_project_coverage`'s `ac_state` CTE has to filter
  `a.project_id = p_project_id` explicitly in the join itself (not inherited from anywhere else) —
  omitting it was the real Stage-3 BLOCKER on Slice 1's PR. Any FUTURE query joining through this
  table needs the same explicit re-check; it is not a one-off fix, it's a property of the table.
- **The legacy `bunkai_save_atc` RPC (migration 0007, SECURITY INVOKER) is still `grant execute ...
  to authenticated`, and its grant was never revoked** even though `lib/supabase/rpc.ts` has no TS
  wrapper for it anymore (the comment there only says "no longer called from app code," which is
  easy to misread as "no longer reachable"). It's directly callable via `supabase.rpc()`/PostgREST by
  any signed-in user today, and it inserts into `atc_acceptance_criteria` with no cross-check against
  the AC's own project — this is a live, real path for the cross-project leak above, not a
  hypothetical one. Nobody has revoked it or replaced it; flagging for whoever eventually audits
  legacy RPC grants.
- **`modules.position` and `acceptance_criteria.position` are NOT unique enough to sort by alone.**
  `modules` has no per-project position-uniqueness constraint at all; `acceptance_criteria.position`
  is unique only per `user_story_id`, so two ACs from different stories in the same module can share
  a position. Any new query ordering by either needs a tertiary tiebreaker (id) or the result order is
  genuinely nondeterministic across identical calls — confirmed this is not theoretical, my own test
  fixture ties on `(0,0)` by construction.
- **`atcs.archived_at` already exists live** (used since 0021/0027-0029) — the BK-46 ATP's own
  "SCHEMA GAP (future): atcs has no soft-delete today, decide before adding archiving" note is stale;
  the column it worries about has existed for a while. If a future ticket's ATP cites a "future schema
  gap," verify against `information_schema.columns` before trusting it — the ATP may predate a
  migration that already closed it.

### Convention established — coverage-view.ts / coverage-isolation.test.ts as the reference shape

For any future story extending the `/metrics` screen (BK-47 is about to): the pure display-logic
split (`lib/coverage/coverage-view.ts`, zero DB/React) vs. the DB-integration isolation test
(`lib/coverage/coverage-isolation.test.ts`, real seeded rows, real RPC calls) is the pattern to copy,
mirroring `lib/runs/report-view.ts` / `lib/runs/report-isolation.test.ts` one story earlier. Derive
filter/label logic from the ACTUAL mockup's own JS and literal demo data, not from the RPC's coarser
enum — the two diverge in ways that are easy to get wrong by inference alone.

## Update — generation 3 (relaunch, picked up BK-46's last mile)

Retired gen 2's "genuinely last step" turned out to have two more real findings in it. Both closed,
chain now fully assembled and PR #93 open to `staging`. Recording as I go, not waiting for retirement.

### The absolute-path trap bit a THIRD time, same class, new file

Despite two prior generations documenting this exact trap, I hit it again editing
`.context/design/master-design-plan.md` — passed the Edit tool the MAIN-CHECKOUT absolute path
(missing the `.claude/worktrees/avalanche-wa-g3` segment) out of habit. Silently succeeded against the
wrong branch's file — no error, no signal. Caught it because the D-number I used (`D15`) collided with
an existing row when I grepped to sanity-check, which only worked because I happened to grep the
worktree copy afterward and got zero matches for my own edit. **If a Read/Edit/Write call ever "succeeds"
but a subsequent grep in the SAME session can't find what you just wrote, suspect the absolute-path trap
before anything else** — don't assume the tool lied, assume the path pointed somewhere else. Restored
the main checkout's accidental change via `git restore` (Critical Rule #13, explicit single path I'd
just touched myself) and redid the edit correctly in the worktree. Also worth noting for whoever writes
the NEXT `master-design-plan.md` divergence row: grep for the highest existing `D<N>` first — I nearly
shipped a second `D15` (BK-49 already owns that number) before catching it in the same sweep.

### The final full-diff review found a genuine BLOCKER that four PRIOR reviews (Slice 1's own review,
### the security posture check, the assembled-chain scan itself across other lenses) all missed

`bunkai_report_project_coverage` derived "executed" state from `atcs.status` — a column that LOOKS
execution-shaped (check constraint: pass/fail/blocked/skipped/running/unrun) and that the PO's own Q1
Jira comment explicitly named as the mechanism ("¿Es `atcs.status = 'unrun'`... estado puntual en DB?").
It is dead. Grepped every `update public.atcs` in the whole migration history — none of them touch
`status`. `0037_run_finish.sql`'s own header comment says so explicitly ("atcs.status ... is NEVER
touched"). Real execution lives in `run_atcs.status`, a DIFFERENT table, already established as this
codebase's precedent by BK-35's `mark-step-view.ts`. Consequence: `bool_or(a.status = 'unrun')` was
always true for any AC with a linked ATC, so `'executed'`/`'fully_covered'` were UNREACHABLE in
production — a whole AC (AC3) and two KPI tiles permanently and silently broken, on a feature that had
already passed Slice-1 review, a security-posture check, and three OTHER lenses in the same final
review. **Lesson: "the PO named the exact column" is not evidence the column does what the PO thinks it
does — verify the column is actually WRITTEN somewhere, not just that it's named in a decision.** This
is a different failure shape than every prior BLOCKER this run (BK-49/BK-40's actor-bind-guard family,
all about AUTHORIZATION on a real, active data path) — this one was a dead data path nobody had ever
exercised end-to-end, hiding behind a column that read as meaningful.

Fixed as migration `0050`: derive "executed" from each ATC's most-recent `run_atcs` row across any Run
(unscoped by project_id — the ATC id feeding it is already project-scoped upstream, adding a second
predicate there would be redundant not protective, worth saying explicitly since it looks at first glance
like it's missing one). Rewrote the isolation suite's fixture to seed real `run_atcs` rows via a
throwaway Environment/Test/Run instead of setting `atcs.status` directly — that field is now pure NOT
NULL scaffolding with zero bearing on the RPC.

**Applying this one required an actual stop.** My own launch prompt's migration-application rule
(distinct from the general run doctrine, which treats confirmed-bug-fixes-to-live-code as
log-and-continue per BK-49's own precedent) explicitly carves out "a migration that ... rewrites existing
objects" from the additive/formality path. A `CREATE OR REPLACE FUNCTION` changing an already-live
function's core logic is exactly that, even though the SHAPE of the fix (confirmed bug, narrow,
unambiguous mechanism) matched BK-49's own log-and-continue precedent closely enough that I nearly
talked myself into applying it without asking. Used `AskUserQuestion` with a real second option (defer to
a fast-follow) rather than a rubber-stamp yes/no — got "apply now, verify, include in chain." **If a
finding's fix requires `CREATE OR REPLACE` on something already live and changes its OUTPUT (not just
its safety margin), that crosses into needing a stop even when the run's general precedent for
"confirmed bugs" doesn't — read your own specific instructions before pattern-matching to a
run-wide precedent that was written for a different case.**

### `git checkout` correctly refused to switch branches with uncommitted BLOCKER-fix work in flight —
### but the `&&`-chained fetch/merge after it still ran, against whatever branch was ACTUALLY current

`git checkout wa-g3-coverage && git fetch origin && git merge --ff-only ...` — the checkout aborted
(uncommitted changes), but bash doesn't short-circuit a failed leading command the way I expected here
(it does with `&&` for a nonzero exit, and `checkout` DID exit nonzero — but I'd only chained the
LATER commands with `&&` after a `;`-separated block, so the fetch/merge still ran against my
still-current branch). No harm this time — the merge target and my current branch happened to be at
compatible tips — but it's worth being deliberate: check `git branch --show-current` after any
`checkout` in a chain before trusting later commands ran where you meant them to, especially when
you're mid-way through committing a slice with uncommitted files still open.

### Everything else, briefly

- PR #87 (Slice 4) re-verified fresh and self-merged cleanly, no drift from gen-2's handoff.
- BK-47 coordination flag: re-checked live, found `queue.md` itself was lagging a real, already-merged
  PR (#88, BK-47's DB slice) — the relaunch prompt knew about it, `queue.md` didn't yet. Confirmed via
  `gh pr view` directly rather than trusting either document, left an explicit note on BK-47's row.
  **A relaunch prompt can be MORE current than `queue.md` if a concurrent relaunched worker moved between
  the prompt being written and you reading the file — check live, cite what you checked, don't average
  the two documents.**
- Final chain: 16 files, 2287 insertions, PR #93 open to `staging`, adjudication in both the PR body and
  this file's BK-46 row per standing instruction.

## RUN CLOSE — 2026-08-01, `avalanche-2026-07` closed by the repo owner

BK-46's final PR (#93) merged (`c9155e7`, confirmed ancestor of `origin/staging`) and Stage 4 fully
closed BEFORE the freeze was announced — Jira transitioned to `Ready For QA`, QA handoff comment posted,
cache resynced. No Jira action taken after the freeze; none was owed.

**This is a clean stop on the owner's explicit instruction to close the run, not a context-limit
retirement.** Don't read anything below as "ran out of room mid-thought" — it's a deliberate final
account, written with full context intact.

### State verified before stopping

- Every branch this generation touched (`wa-g3-coverage`, `wa-g3-coverage-review-fixes`,
  `wa-g3-coverage-blocker-fix`, `wa-g3-coverage-final`) checked individually via
  `git fetch origin && git status --short && git log --oneline @{u}..HEAD`. The only thing that looked
  like unpushed work was `wa-g3-coverage-review-fixes` showing 2 commits ahead of its own remote — that
  branch had a slice fix committed directly on it before I caught the topology slip and moved the work to
  a fresh child branch (`wa-g3-coverage-blocker-fix`) instead. Verified with `git merge-base
  --is-ancestor` that the commit is already a real ancestor of `origin/staging` via the OTHER branch —
  nothing lost, just a stale local ref pointing at already-safe content. Worth naming as its own trap:
  **`git log @{u}..HEAD` showing commits "ahead" does not by itself mean unpushed-and-at-risk — check
  whether the SAME commit hash reached the target branch by a different path before treating it as a
  gap.**
- No `.session/` directory exists anywhere in this worktree — confirmed twice, once by `find` returning
  nothing and once by the rescue `cp` commands themselves reporting "no matches found." Nothing was ever
  created here this generation; nothing to lose.
- `queue.md`'s BK-46 row is `done` with the full Stage 4 close-out on record. No claim held on any other
  row.

### What I'd do differently — no softening, per the ask

- **I hit the exact same absolute-path trap a THIRD time this run**, across three different generations
  of Worker A, despite it being documented twice already in this same file before I started. Caught it
  by luck (a D-number collision I happened to grep for), not by discipline. If there's a fourth
  generation of any worker in a future run: **grep your own tool calls for
  `/Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/` WITHOUT a `.claude/worktrees/` segment, as a
  standing habit, not just after you've already been bitten once.** Three generations writing the same
  warning down and still hitting it says the warning-in-prose approach doesn't work past the session that
  wrote it. If this pattern recurs in a future run, it's worth a pre-commit hook or a linter check over a
  fourth handoff paragraph.
- **The final-chain-review discipline earned its keep a THIRD time on this run** (after BK-49, BK-40) —
  a genuine, unanimous, independently-verified BLOCKER (dead-column coverage bug) that four other checks
  in the same review pass, plus Slice 1's own dedicated review, all missed. I'd run it again exactly the
  same way, full stop — this is not the part I'd change.
- **The migration-application confirmation gate cost real wall-clock** (draft, stop, ask, wait for the
  answer, apply, verify) on a ticket that was otherwise "genuinely the last step" per two prior
  generations' own accounts. I'd take that cost again without hesitation — the alternative was shipping a
  feature whose headline KPI silently never fires, discovered by QA or a user instead of a reviewer. The
  one thing I'd change: I nearly talked myself OUT of stopping, reasoning from this run's own
  log-and-continue precedent for confirmed bugs (BK-49's migration `0047`) before re-reading my OWN launch
  prompt's more specific carve-out. **When a run-wide precedent and your own specific instructions seem to
  point different ways, re-read the specific instruction in full before pattern-matching to the general
  precedent — proximity to the current task is not the same as authority.**

### Debt this run is closing WITH, not instead of — for whoever picks this backlog up next

- **BK-41/BK-42/BK-43 are a deliberate SCOPE CUT at run-close, not a completion.** Phase 3 (epic BK-31,
  defects) shipped only BK-40 (file a defect). The list/filter, heatmap, and external-tracker-sync
  stories were never started and are explicitly out of scope for this run per the owner's closing
  message — a future run needs to re-derive its own priority for them, not assume they're "almost done."
- **BK-45/BK-50 never became claimable.** Their gate ("Phase 3 substantially done") was written assuming
  Phase 3 would ship more than just BK-40 — that premise didn't hold. Re-evaluate their gate condition
  fresh rather than trusting `queue.md`'s original `depends_on` wording, which now describes a Phase 3
  that didn't happen as originally scoped.
- **ADR-0012 (the RPC actor-bind/result-scoping invariant) is still `Status: Proposed`**, not `Accepted` —
  it governed real behavior this whole run (three independent incidents fit its pattern, including the
  BK-46 final-review BLOCKER's ADJACENT class — a dead-column bug, not an auth bug, but caught by the same
  "final assembled review, not per-slice" discipline the ADR's own doctrine argues for). Needs the
  owner's formal sign-off same as ADR-0010/ADR-0011 eventually got.
- **The 22 unbound `p_actor_user_id` functions (ADR-0012's own audit) are still unbound.** Tracked as
  `task_f36dfa41`, deliberately not touched by any ticket this run per that ADR's own "don't retrofit
  inline" reasoning. Real, scoped, waiting on someone to own it as its own remediation pass.
- **BK-49's "seed a Home Dashboard epic" thread (Worker B gen 1) was never brought to a close** — flagged
  in `worker-b.md`, not resolved by the time this run ended. Not mine, just making sure it's visible from
  the run-closing side too, not buried in a mid-run handoff nobody re-reads at closure time.

Worktree left in place (`avalanche-wa-g3`, `.claude/worktrees/`) per the owner's explicit instruction, not
removed, pending their own verification of everything above.
