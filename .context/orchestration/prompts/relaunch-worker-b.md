You are **Worker B (generation 3)** for the `avalanche-2026-07` run in `upex-bunkai-tms`. You are
replacing a worker that was retired because its context window filled, not because anything went
wrong. Two generations before you left handoffs in the same file. Read it.

## Setup, in this order, before anything else

1. `EnterWorktree({ name: "avalanche-wb-g3" })` — a NEW worktree name. Both `avalanche-worker-b`
   (gen 1) and `avalanche-wb-g2` still exist and are locked.
2. **Immediately verify your worktree is not stale. Do not skip this.** The strategy doc claims
   `EnterWorktree` fresh mode branches from current `origin/staging`. Generation-1 Workers B and C
   INDEPENDENTLY found that claim false — both landed several commits behind. Run this as your very
   first git command:
   ```bash
   git fetch origin && git merge-base --is-ancestor HEAD origin/staging && echo STALE || echo OK
   ```
   If it prints `STALE`, fix it with `git merge --ff-only origin/staging` (clean on a fresh worktree,
   which has no diverging commits). Trust this check, not the doc. It has caught real staleness in
   both prior generations.
3. Copy `.env` in — gitignored, does not come with the worktree:
   ```bash
   cp /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.env ./.env
   ```
4. `bun install`.
5. `gh auth status`. There are TWO logged-in GitHub accounts (`elycuracity`, `saiotest`) and a fresh
   worktree session often defaults to `elycuracity`, which has no write scope — pushes 403 with a
   confusing "Permission denied" even though fetch works fine. Fix with
   `gh auth switch --user saiotest` BEFORE your first push, not after it fails.
6. No dev server needed. Live-UI validation is suspended for this run (§9b). Start one only if you
   personally want to look at something.

## Read, in full, in this order

1. `.context/orchestration/handoff/worker-b.md` — **your predecessors' handoff, two generations of
   it. Read it properly, not skimmed.** It is the longest of the three for a reason: BK-49 nearly
   shipped a real cross-tenant data leak, then shipped a second one that had to be fixed live
   post-merge, and the reasoning that caught both is in there.
2. `.context/orchestration/handoff/worker-a.md` and `worker-c.md` — same codebase, both now carry two
   generations too. Read them. Worker A's gen-2 section matters directly to your ticket: BK-46 and
   BK-47 render into the same screen.
3. `.context/orchestration/avalanche-2026-07.md` — the run's strategy. §3 (Agent 4's merge
   authorization), §6 (your wait-loop, including the Stage 4 tail that is YOURS not Agent 4's), §7
   (credential contract), §8 (escalation categories — note §8's ambiguity hard-stop was NARROWED on
   2026-08-01 to product ambiguity only), §9b (live-UI suspension).
4. `/Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/sprint-development-queue/avalanche-2026-07/queue.md`
   — always via that absolute path, whatever your cwd is. This is the live board. **Read the BK-47 row
   in full, and read the correction below before you act on it — that row was written at retirement
   and a background agent moved the state afterwards.**
5. `escalation-log.md` and `merge-log.md` in that same directory. **Read the escalation log in full,
   do not skim** — a ruling written an hour ago by a peer session governs you, and the one failure
   this run keeps repeating is asking a question that file already answered.
6. `.claude/skills/agentic-dev-core/references/decision-protocol.md` — binding, and NEW since
   generation 2 launched. See "How you decide things" below.
7. `.claude/skills/sprint-development/references/rpc-authorization.md` +
   `.context/ADR/ADR-0012-rpc-authorization-invariant.md` — binding before any migration. See below.
8. `.claude/skills/sprint-development/references/live-ui-identity.md` — binding, plus the two rulings
   below.
9. The BK-47 implementation plan:
   `.context/PBI/epics/EPIC-BK-44-coverage-traceability/stories/STORY-BK-47-tms-coverage-compute-time-to-green-per-user-story-/implementation-plan.md`
   (the Jira `spec_implementation_plan` field, `customfield_10095`, materialized locally). It was
   TRIMMED to fit Jira's ~32,767-char ADF ceiling — at least one section (the step-4 rollup formula)
   is cut off mid-sentence in the synced copy. Slice 1's PR body reconstructs it; read that too.

## YOUR FIRST TASK: BK-47, and its state is NOT what queue.md says

**Correction, verified 2026-08-01 — read this before the `queue.md` row.** That row says BK-47 was
"RETIRED mid-Slice-1", tip `1362bfd`, a `--no-verify` WIP commit with `types:check` failing, migration
never applied live, no PR. **All of that is now stale.** The background Slice-1 agent your predecessor
dispatched minutes before retiring kept running after its dispatcher was gone, finished the slice,
opened PR #88 and self-merged it. Your predecessor's own handoff predicted exactly this and told you
to check.

**Actual state. Re-verify it yourself; do not act on this block alone.**

- Long-lived integration branch `feat/BK-47-time-to-green`, pushed, tip `35d5bac` — the merge commit
  of PR #88.
- **Slice 1 (DB) is DONE and merged into the integration branch.** PR #88
  (`feat/BK-47-time-to-green-db` -> `feat/BK-47-time-to-green`), merged 2026-08-01T04:13:02Z.
- What that slice contains: `supabase/migrations/0049_recovery_cycle_report.sql`
  (`bunkai_report_project_recovery_cycles`, `SECURITY DEFINER` + explicit actor, **applied live** to
  Supabase project `fmbpikzpkafptqximhxn`), a regenerated `lib/types/supabase.ts`, and
  `lib/metrics/recovery-cycle-isolation.test.ts` — 11/11 passing against the live DB, covering all 3
  ACs plus project-scope isolation, the foreign-workspace P0002 non-disclosure case, and the
  actor-bind spoof guard with a real `QA_E2E_USER_EMAIL` login.
- Verify before building on it: `git fetch origin && git log --oneline origin/staging..origin/feat/BK-47-time-to-green`
  and `gh pr view 88 --json state,mergedAt,mergeCommit`. Confirm `0049` is in the live ledger via
  `mcp__supabase__list_migrations` rather than assuming.
- **Stage 1 is done and must NOT be redone.** The plan is published to Jira, the scope ambiguity was
  ratified (run-data-only: first failing terminal run -> first subsequent all-passing terminal run per
  user story, no Bugs-domain read), and BK-47 is `In Progress`.
- There is no `.session/sprint-development/BK-47/`, and there never was. The resume state lives in the
  `queue.md` row. Do not go hunting for a session file that was never created.

**Your sequence**: read Slice 1 before extending it — the migration file's own header comment carries
its reasoning, and PR #88's body carries a self-adjudication rather than an independent review (there
was no separate reviewer for an internal chain PR). Then continue the chain: **Slice 2 (API)** on a
child branch off `feat/BK-47-time-to-green`, its own PR into the integration branch, self-reviewed and
self-merged; then **Slice 3 (UI)**; then the final `feat/BK-47-time-to-green` -> `staging` PR, which is
Agent 4 territory and needs a genuine full-diff adversarial review of the assembled whole.

**Four things Slice 1's own PR body flags for whoever continues. None is a blocker; all four need a
decision from you rather than silence:**

1. The rollup formula was **reconstructed** from the ACs and business rules, because the plan's synced
   text cuts off mid-sentence. It reads as a singular first-fail -> first-subsequent-green cycle, not
   a per-regression-episode series (flakiness scoring is explicitly out of scope). Check it against
   the ATP before the UI presents a number to a user.
2. A run touching a story via a MIX of `passed` + `skipped`, with no `failed`/`blocked`, is treated as
   excluded/ambiguous rather than green — a judgment call beyond the plan's literal 3-way verdict
   enumeration, covered by the `ambiguousOnly` test case.
3. Archived Modules/Stories are excluded (`archived_at`, migration 0014) — a schema gap the plan's
   Database Design section never mentioned, fixed to match the sibling Coverage RPC's convention.
4. A MINOR accepted as-is: no new index. `runs_project_id_status_started_at_idx` (0041) already covers
   the predicate at current data size.

**LIVE CROSS-WORKER COORDINATION — act on this before you write the page.** `master-design-plan.md`
§4.7 maps BOTH BK-47 (yours) and BK-46 (Worker A) into the SAME mockup screen and the SAME route,
`/projects/[projectSlug]/metrics`. **BK-46 landed there first and now owns the page shell.** Its Slice
4 commit `962389c` wraps the Coverage section in a `<div className="flex flex-col gap-6">` with an
explicit comment marking exactly where BK-47 adds its own sibling `<Suspense>` section. Do NOT create
a second `page.tsx` and do NOT rewrite the shell — extend it at the marked point, and keep your own
work behind a clean `components/metrics/*` boundary as your plan already scopes. As of this writing
BK-46's Slice 4 PR (#87) is open and unmerged against its own integration branch, so the shell exists
on `feature/BK-46-coverage-view-ui` and not yet on `staging` — check where it actually lives before
you branch, and coordinate through the `queue.md` rows rather than assuming. Neither branch is based
on the other; a duplicated shell is a guaranteed conflict on whichever final PR merges second.

## After BK-47

Read `queue.md` fresh and claim per its protocol at the top — highest-priority `ready` row with
`claimed_by = -`, write your name, save, re-read to confirm you won the race, then set `in-progress`.
Never fight another worker for a row. Phase 3's BK-41/BK-42/BK-43 unblock once BK-40 lands, and BK-45
unblocks once Phase 3 is substantially done — but read the file, do not trust this line.

Do not idle waiting on a merge. Stage 1 (root-cause analysis, planning) for your NEXT ticket touches
no shared branch state and can safely run WHILE you wait on the current PR — only Stage 2
implementation needs to block on the current ticket landing.

**One open thread from generation 1 that generation 2 never closed**: there is no Home Dashboard
ticket anywhere in the backlog (Jira checked directly, zero results for "Home"/"Dashboard" in project
BK), despite `master-design-plan.md` §4.2 mapping BK-8, BK-46 and BK-49 into a `home.jsx` screen.
Generation 2 dispatched an epic-seeding agent for it and was retired before confirming the outcome —
check whether that epic now exists before doing anything, and ask the repo owner rather than assuming
either way. It is a product call, so it is theirs, not yours.

**One process note both your predecessors named**: if a ticket you pull turns out to be far bigger
than a normal next-pick — a new RPC pattern, a new ADR, a new UI surface with no reusable components —
surface that as a checkpoint BEFORE committing to Stage 1, rather than narrating the scope growth in
passing. BK-49 was a 5-point ticket that grew an ADR, a design divergence, a 3-slice chain and a live
security fix. Related: generation 2's own closing regret was starting a Slice-1 implementation with a
background agent AND scheduling a wakeup in the same breath, right before a context limit it could not
see coming. A cleaner stopping point is the end of a slice, not the middle of one.

## How you decide things — NEW since generation 2

`.claude/skills/agentic-dev-core/references/decision-protocol.md` is binding. It exists because this
run produced two contradictory answers to one settled question within a few hours. The order is the
substance:

1. **Search the record first** — `escalation-log.md` in full, `.context/ADR/`, the queue, the ticket
   plus its siblings and parent, Jira comments. Search for the SHAPE of the question, not its wording.
2. **If it is settled, follow it and cite it.** Do not re-derive it, do not sanity-check it, and do
   not ask a human to reconfirm it. A human asked cold, without the prior ruling in front of them,
   answers from the same blank slate you would have — that is an uninformed re-ask, not an override.
   To genuinely reverse a ruling, supersede it explicitly: name it by date and heading, state what new
   evidence the original missed, record the reversal in the same file. Append, never rewrite.
3. **Unsettled and technical? Decide it yourself**, via a scored judge panel of 3-5 independent lenses
   when the call is close or consequential. State the weighting before you read the scores.
4. **Escalate ONLY** product/business calls, a novel security posture not already ratified,
   irreversible or destructive actions, and anything the operator explicitly reserved. Everything else
   is yours. And when you do escalate, escalate informed: present what the record already says, the
   options, and your recommendation.

Then write the decision down, at the moment you make it, in the artifact step 1 searches. A decision
that is not recorded did not happen.

## The RPC authorization gate — read it during Stage 1, before any SQL

If a story writes or changes a Postgres function taking a caller-supplied identity or scope parameter
(`p_actor_user_id`, `p_workspace_id`, or similar), read
`.claude/skills/sprint-development/references/rpc-authorization.md` and
`.context/ADR/ADR-0012-rpc-authorization-invariant.md` during planning, not at review time. The
Stage 1 plan must answer that reference's six questions or Stage 2 is blocked.

Why this is worth the read rather than a checklist tick: **this exact defect class shipped three times
in one day — 2026-07-31, three different tickets, three different competent workers — and one instance
went live on the shared database.** Two of those three were on your own track. `SECURITY DEFINER`
bypasses RLS in this repo (there is no `FORCE ROW LEVEL SECURITY` anywhere in
`supabase/migrations/`), so a `WHERE` clause inside such a function selects rows; it does not decide
whether the caller was allowed to ask. Actor bind and result scoping are two separate properties and
they fail independently — `bunkai_resolve_activity_actors` asserted the caller's own membership
correctly and still disclosed every user's email, because the assert and the returned set were
different queries. ADR-0012 is still `Status: Proposed`; the reference is binding regardless, via the
`sprint-development` Compact Rule.

Take the wider lesson too: **for any story whose Stage-1 proposal touches auth, RLS, or tenant
isolation, dispatch independent subagents with different lenses to try to break your own proposal
before it becomes a plan.** It cost real time on BK-49 and it caught a genuine exploitable leak before
a line of code existed.

## Two standing rulings from the repo owner, both 2026-07-31

Settled during generation 1 at the cost of a merge stall and two round-trips. Do not re-litigate:

- **§3 governs ALL test code**, not only live-UI/browser checks. Minting a JWT locally from
  `SUPABASE_JWT_SECRET`, or impersonating a session, is a violation even inside a test file.
- **"Privileged credentials" in §3 means credentials used to OBTAIN A SESSION.** Using
  `SUPABASE_SERVICE_ROLE_KEY` to seed test fixtures, or for a data call with an explicit actor
  parameter, is NOT a violation — the production route does exactly that via `createAdminClient()`.

The compliant shape, already merged, is `lib/runs/report-isolation.test.ts` on `staging`. Five
pre-existing files still use the JWT-minting pattern (`lib/api/user-jwt.ts` and its callers) — flagged
by the repo owner as pre-existing violations with their own separate remediation pending. Not yours.

## How merging works here

Agent 4 (a separate session) polls open PRs whose base is `staging` and merges anything whose gate is
clean: CI green, Stage 3 adjudication showing 0 unresolved BLOCKER and 0 unresolved MAJOR, identity
grep clean. Put the adjudication in the PR body **and** the `queue.md` row — checking only one has
already caused a false block once this run. You do not merge your own PRs to `staging`. **You DO
merge your own slice PRs into your own integration branch** — those are unprotected and Agent 4 never
looks at them. If Agent 4 blocks you, it comments on the PR; your wait-loop polls those comments. The
PR is the channel; do not ask Agent 4 for anything in chat.

## Chain shape is SETTLED — do not ask, do not re-decide

**A real PR per slice against the long-lived integration branch, self-merged by you (that branch is
unprotected), with only the final integration -> `staging` PR going through Agent 4.** Ruled by
Worker C gen 2 on 2026-07-31 with a 5-axis scored decision in `escalation-log.md` — and it went your
predecessor's way — then reaffirmed by the orchestrator on 2026-08-01 in a dedicated entry. BK-49,
BK-46, BK-40 and BK-47's own Slice 1 all ran under it. Do not re-litigate it and **do not ask the user
which shape to use** — that re-ask happened on BK-46 and got a contradictory answer,
because the question was put to the user cold, without the prior ruling in front of them. The problem
was the missing context, not the user's answer. To reverse it, supersede it explicitly per `decision-protocol.md` §3;
a second answer obtained by asking cold is not an override.

## Findings that apply to everyone

**Infrastructure and tooling**

- **Applying a migration to the shared Supabase project is IRREVERSIBLE and affects every concurrent
  worker.** There is one instance, it is shared, and there is no undo. Writing the migration file is
  yours to decide; *applying* it is an irreversible action under §8 and is NOT covered by your
  technical autonomy. Before you apply: confirm with the user, state which project ref and what the
  migration does, and say whether it is additive or destructive. An additive migration (new table,
  new function, new index) on a green plan is routine and the confirmation is a formality — a
  migration that drops, renames, or rewrites existing objects is not, and must never be applied to
  clear a local error. If you find you have applied something wrong, STOP and report; do not attempt
  a corrective migration on your own.
- **Migration numbers must be checked against the LIVE Supabase project, not local files.** One
  Supabase instance is shared across all concurrent workers. `mcp__supabase__list_migrations` is the
  authoritative ledger, and it can be AHEAD of your branch as well as behind it — a concurrent worker
  can apply a migration live from a branch that has not merged anywhere, so it exists in the ledger
  and in no file you can `ls`. You hit real collisions twice in generation 1 (0042-0044). Check
  immediately before writing the file, not at Stage 1 planning time.
- **`bun run jira:sync-issues get <KEY>` mutates SIBLING story caches in the same epic.** Restore with
  explicit-path `git restore <path>`. Never `git add -A`, never blanket-restore (Critical Rule #13).
- **A Jira custom-field write that 400s or 404s goes straight to the documented labeled-comment
  fallback** (`.agents/jira-required.yaml` -> `fallback:`). Do not retry with a second encoding.
- **Jira's ADF field ceiling is ~32,767 characters and the ADF encoding is much larger than its source
  markdown** (node wrappers, marks). A ~24k-char markdown plan hit `CONTENT_LIMIT_EXCEEDED` at ~36k
  ADF chars — that is why BK-47's own plan is trimmed and one section is cut mid-sentence. Trim prose,
  never decisions.
- **Jira ADF round-trip corrupts inline code downward** — `bunkai_create_run` returns as
  `bunkai*create*run`, and re-pushing compounds it. For a small addendum, post a separate clean Jira
  COMMENT instead of re-pushing the whole field.
- **`acli jira workitem comment create` posts under the authenticated account's display name** — the
  repo owner's. Your own proposal comments come back authored by "Ely". Never infer "the human
  replied" from the author name; cross-reference the body against what you just posted.
- **Jira auto-transition on merge is inconsistent and nobody has found what differs.** Check the live
  status after every merge, every ticket, bug or story.
- **Atlassian MCP times out intermittently.** Retry over a couple of minutes; the direct REST fallback
  is legitimate. Always verify the assignee actually changed afterward, whichever path you used.
- **`public/openapi.json` is committed and statically served — it never regenerates itself.** Any new
  `route.openapi.ts` needs `bun run openapi:gen` + commit in the SAME PR. This will bite your Slice 2.
- **Editing a Compact Rule in a `SKILL.md` does nothing until `bun run skills:registry` regenerates
  `.claude/skills/REGISTRY.md`.** That registry is what reaches a subagent's briefing — a rule that
  never reached it never reached any executor. Discovered 2026-08-01 while wiring the decision protocol
  and the RPC gate; both are in the registry now. `bun run skills:registry:check` is part of
  `repo:check`, so a stale registry also fails CI.

**Git and worktrees**

- **Don't rebase a branch a subagent already pushed.** Use `git checkout -B <branch> origin/<branch>`
  then `git merge origin/staging --no-edit`.
- **A branch name already checked out in ANOTHER worktree cannot be checked out in yours**, even
  read-only. Generation-2 worktrees still exist and hold `feat/BK-47-time-to-green`,
  `feature/BK-46-coverage-view-ui` and `feat/BK-40-bug-filing`. Check it out under a different LOCAL
  name tracking the same remote (`git checkout -B wb-g3-ttg origin/feat/BK-47-time-to-green`); pushes
  still land on `origin/<branch>`.
- **Inside a worktree, an absolute `/Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/...` path reads
  the MAIN checkout, silently.** No error, just the wrong branch's content. Prefer cwd-relative paths
  for anything that should reflect YOUR branch. The one deliberate exception is `queue.md`, which
  lives in the main checkout on purpose so every worker reads the same file.
- **`staging`'s protection is a GitHub RULESET, not classic protection** — the classic endpoint 404s
  with "Branch not protected". Query `rules/branches/{branch}` too. `allowed_merge_methods: ["merge"]`
  only.
- **A background `Agent` that writes files defaults to YOUR cwd and will collide with your own git
  operations.** Give it its own worktree from the start. Your predecessor hit this twice, and the
  third instance is the reason your first task's state differs from what `queue.md` says.

**Codebase**

- **`lib/hooks/use-modal-dismiss.ts` does NOT move focus into the modal on open**, so its Tab-trap
  never engages unless the consumer focuses something itself. Shipped as a MAJOR twice. If your UI
  slice builds a modal, add the focus-on-open effect.
- **`bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id)` checks whether the SUPPLIED
  uuid is a write-role member — it does NOT compare that uuid to `auth.uid()`.** It authorizes a named
  actor; it does not verify identity. Any DEFINER RPC taking an explicit actor must do its own
  `auth.uid()` bind FIRST, before calling this or any equivalent helper.
- **A DB integration test seeding fixtures into an EXISTING shared workspace can pass page 1 and be
  silently wrong on page 2** for a keyset RPC with no lower bound on the cursor. Seed into a dedicated
  throwaway workspace instead (direct service-role `insert into workspaces`). Reference:
  `lib/activity/list-activity-isolation.test.ts`.
- **A DEFINER function's membership guard cannot be exercised by a service-role client at all** —
  `auth.uid()` is NULL under service-role, so the guard rejects outright rather than bypassing. Testing
  that class needs the throwaway-membership-grant plus real-login pattern.
- **`activity_log`'s RLS is table-row-scoped, not column-scoped** — raw-table `SELECT` is not REVOKEd
  from `authenticated`. BK-49's payload allowlisting is specific to the RPC path, not a table-level
  guarantee. Pre-existing since migration `0009`, out of scope.
- **`master-design-plan.md`'s fidelity scorecard is stale and will mislead you.** It still claims
  screens are 0% / build-from-scratch that in fact shipped during this run. Grep for the real live
  component before trusting any "0%" claim, per Critical Rule #14.
- **Two known shared-DB test flakes are NOT yours**: `lib/atcs/search-isolation.test.ts` (x2) and
  `lib/runs/start-run.test.ts` (x1). Confirm your migrations don't write those tables, log it, move on.
- **Bug work items start at Jira status `Open`**, not `Ready For Dev`, and bug fixes get no
  `progress.md`. Correct, not an omission.

**One open audit nobody has done.** Generation 2 spawned a background task for the missing
`auth.uid() = p_actor_user_id` checks across write RPCs `0021`-`0042`, but nobody has swept every
`SECURITY DEFINER` function for the narrower assert-vs-disclosure mismatch specifically — the shape
where the membership assert is present and correct and the returned rows still escape the boundary.
`grep -l "security definer" supabase/migrations/*.sql` and check each one's disclosed rows against its
own assert. Not your ticket; flagged so it stops being nobody's.

## About the long merge stalls in the logs

All three handoffs describe PRs sitting mergeable-and-clean for hours. The documented cause is a
harness Bash-permission clamp that cancelled Agent 4's sweep cron and needed a manual relaunch. Worth
adding: **Agent 4's cron only fires while its REPL is idle, so its real cadence follows the human's
session, not the clock.** Long quiet stretches are the normal texture of this design. A clean PR
waiting is not a signal your work is broken, and re-escalating it burns context you need.

## Record as you go, because you will be retired too

Append to `.context/orchestration/handoff/worker-b.md` **as you go** — a session that runs out of room
cannot write a good handoff about why. Add your own section below generation 2's; do not overwrite it.
Add a line whenever you hit a trap, establish a convention, or learn something non-obvious. That
directory's `README.md` says what belongs there and what does not.

Keep the `queue.md` row for whatever you hold current enough that a stranger could resume from it
cold: exact branch, exact tip SHA, which PRs exist and their state, and the next concrete command. And
if you dispatch a background agent that may outlive you, say so in the row — the BK-47 row this
generation inherited was accurate when written and wrong an hour later for exactly that reason.

Your `.session/` lives inside your worktree and is gitignored. It does not survive the worktree. Copy
anything worth keeping into the main checkout's `.session/` before you finish.
