# Hazard catalogue: failure modes an unattended run checks for

> Owned by `autonomous-delivery`. Cited from its `## Hazard checks` table.
> Every entry was observed in a real multi-agent delivery run. None is hypothetical.

Read this like a pre-flight card. Each entry is a check the run performs, not a caution it keeps in mind. A trap written down once does not stop anyone walking into it again under pressure, so each entry ends in an executable check.

Each entry has a trigger (what sets it up), a symptom (what you see, which is usually not the problem) and a check (what actually catches it). When a check ends in a stop, it is a clean stop: write the escalation entry and end the run as `agentic-dev-core/references/decision-protocol.md` describes. The run never waits for an answer.

---

## 1. State that lies

### 1.1 A tracker reports work as shipped when nothing is on the integration branch

**Trigger.** Merge automation transitions a ticket on any pull request merge, including the internal ones of a chain, whose base is not the integration target.
**Symptom.** A ticket reads ready-for-QA or done, and a dependent is selected. Its base is missing half of what it depends on, and the gap surfaces as inexplicable conflicts or missing symbols.
**Check.** `git merge-base --is-ancestor <merge-commit> origin/<integration-branch>` on every contributing merge commit. A status flip never advances a dependency.

### 1.2 Auto-transition on merge is inconsistent, in both directions

**Trigger.** No known cause. It fired for one ticket and not for another of the same type in the same session, and fired hours late on a third.
**Symptom.** A close-out is skipped because "the automation handles it", or done twice.
**Check.** Check live status after every merge, for every ticket and every type. Assume nothing fired.

### 1.3 A status flips to ready-for-dev with blocking questions still open

**Trigger.** A human transition with no comment trail.
**Symptom.** A run picks up work whose core behaviour is undecided, and finds out at planning time, or guesses.
**Check.** Read the refinement trail, not the status field. The signals are listed in `./audit-and-selection.md` §6.

### 1.4 A design or fidelity artifact says a screen does not exist that shipped this week

**Trigger.** The artifact is refreshed by a separate pass, not automatically.
**Symptom.** A plan says build from scratch for something already live, and a run duplicates it.
**Check.** Search for the real component and the real route before trusting any completeness claim in a design document.

### 1.5 A plan cites a schema or infrastructure gap that a later change already closed

**Trigger.** The plan was written before the gap was closed.
**Symptom.** Work is planned around a limitation that no longer exists.
**Check.** Verify against the live catalog, not the document.

---

## 2. Shared mutable infrastructure

All of this section comes from one property: several concurrent agents share one database, one code host, one tracker and one set of coordination files. Isolating the working tree isolates none of the four.

### 2.1 Migration numbering collides in both directions

**Trigger.** Several agents fork from the same base and each picks "next free" from a local listing.
**Symptom.** A local listing shows one number as last while peers have already applied later ones to the shared instance. The reverse also happens: the live ledger holds a migration that exists in no file you can list, pushed from a branch that never merged.
**Check.** Query the live ledger through `[DB_TOOL]` immediately before composing the change (and before naming its file, when `{{stack.database.migrations_tool}}` keeps one), not at planning time. A number chosen at planning time goes stale within minutes under concurrency. Cross-check the integration branch's migration history and sibling branches.

### 2.2 Regenerating from a shared live instance imports a peer's unmerged schema

**Trigger.** Any generate-from-live step (types, clients, published specifications) run while a peer has applied an out-of-band change.
**Symptom.** Your diff silently contains a foreign ticket's tables and function signatures.
**Check.** Read regenerated output before committing it. Strip foreign entries only after proving zero consumers in the diff. If you hand-patch a generated file, give the reason in the pull request body.

### 2.3 Applying a schema change is irreversible and hits every concurrent agent

**Trigger.** A local error that "just needs" a live schema change.
**Symptom.** Every other running agent's regeneration now carries your change, and the run that caused it has no idea.
**Check.** The migration gate in the parent skill. Composing the change is autonomous and applying it is gated: additive changes proceed under `migrations: autonomous`, and a drop, rename or rewrite always stops. Never apply a change just to clear a local error. If something wrong was applied, stop and report, and do not write a corrective migration yourself.

### 2.4 A narrow bug-fix precedent pattern-matched onto a rewrite in place

**Trigger.** A run-wide precedent that confirmed, unambiguous bug fixes proceed without asking.
**Symptom.** A replace-in-place that changes a live object's output nearly went ahead because the fix's shape matched the precedent.
**Check.** If a fix replaces something already live and changes its output, not only its safety margin, it stops, even when the general precedent says otherwise. Read your specific instructions before generalizing a precedent written for a different case. In the escalation entry, offer a real second option (defer to a fast-follow) instead of a yes/no.

### 2.5 Hand-retyped migration SQL is its own drift source

**Trigger.** Typing a migration's contents into an apply call by hand instead of taking them from the reviewed SQL (or the file).
**Symptom.** A clause silently dropped, caught only by habit.
**Check.** After any apply, including a re-apply where you believe nothing changed, re-read the live definition and diff it against the SQL you meant to apply (the committed file, when the tool keeps one).

### 2.6 Shared-instance fixtures produce races and permanent flakes

**Trigger.** A test that reads live seed state, computes an expectation and then asserts against the earlier read, or fixtures seeded into an existing shared tenant.
**Symptom.** An off-by-one assertion that fails repeatedly and reproduces in isolation. Pagination tests that pass on the first page and are silently wrong afterwards, because open-ended cursor predicates make every real historical row eligible. Setup hooks timing out at a fixed boundary under concurrent load, which reads as a stalled round-trip instead of an assertion failure.
**Check.** Reproduce the file alone. Prove zero diff overlap with the area (`git diff --stat origin/<integration-branch> -- <dirs>` is empty). Then log it and continue instead of chasing it. For pagination and ordering tests, seed a dedicated throwaway tenant, never an existing one.

---

## 3. Green and still wrong

### 3.1 A dead data path under a fully green suite

**Trigger.** Code derives state from a column that no production path ever writes. The column looks meaningful, and a product owner's own decision comment may name that exact column.
**Symptom.** An entire acceptance criterion is unsatisfiable and dependent metrics sit permanently at zero, while every test passes, because fixtures seed the column the code reads and not the column production writes.
**Check.** Prove something other than your fixture writes the column: search the migration history for writes to that table, read the lifecycle migrations that finish the record, and check the sibling precedent. That someone named the column is not evidence it does what they think. Require at least one assertion against a real production write path.

### 3.2 Reviewed and merged is not ever executed

**Trigger.** Route tests that mock the database call entirely.
**Symptom.** A type mismatch between the declared return and the real one raised an error on every real invocation, invisible to all earlier review.
**Check.** A mocked call proves nothing about the thing being mocked. Writing a function's first real integration test routinely turns up unrelated pre-existing bugs. Budget for that, and do not treat it as scope creep.

### 3.3 Per-slice review is not evidence about the assembled chain

**Trigger.** A chain reviewed slice by slice, each one passing.
**Symptom.** The final full-diff review found, on three separate occasions, a live exploitable vulnerability, a feature that could never work, and five further defects that no slice review caught.
**Check.** Budget the assembled-diff review as seriously as any slice's. It is not a formality before opening the pull request.

### 3.4 Unit tests cannot prove timing or transport behaviour

**Trigger.** Client-side navigation races, live-update paths, anything where the assertion is about when and not what.
**Symptom.** A test proves the decision was made, and nothing observes the browser or the second observer.
**Check.** Name these ticket classes explicitly in the handoff and in the pull request's risk section, so the humans who can verify them know what to look at first.

---

## 4. Authorization defect classes

These recurred more than any other class: the same shape shipped three times in one day, and one reached production. The full gate lives in `sprint-development/references/rpc-authorization.md`, and this run never waives it.

### 4.1 A privileged function filtering on a caller-supplied scope authorizes nothing

**Trigger.** A definer-rights stored procedure that takes a tenant or scope identifier and filters `WHERE column = parameter`. Definer rights bypass row-level security unless the table forces it.
**Symptom.** The filter selects rows and authorizes nothing. Any signed-in user passes an arbitrary scope identifier under their own honest identity and reads that scope's data.
**Check.** First ask whether the function needs definer rights at all, since invoker rights plus the caller's own scoped client is safer by construction. If it does, both properties in 4.2 and 4.3 must hold.

### 4.2 An actor parameter without an identity bind is not an authorization primitive

**Trigger.** A helper that checks whether the supplied identifier is a privileged member, without ever comparing it to the session identity.
**Symptom.** It authorizes a spoofed identity as long as that identity is real and has access. A caller attributes a write to another member, in a scope they never belonged to.
**Check.** The bind sits at step 0, before any table read. Its absence is a planning defect that review should not have to catch.

### 4.3 Assert and disclosure fail independently

**Trigger.** A function that correctly asserts the caller's own membership, then returns rows that are not scoped to that membership.
**Symptom.** Live and exploitable for hours after the slice passed its own review.
**Check.** Treat "actor bind" and "result scoping" as two separate properties, since asserting membership does not scope a result set. Re-check the disclosure boundary at final assembly, and never inherit it from a per-slice review.

### 4.4 A guard that reads the session identity cannot be tested with a privileged client

**Trigger.** Testing under a service-level credential, where the session identity is null.
**Symptom.** The guard fails outright instead of being exercised, so the test proves nothing.
**Check.** Sign in as the declared non-production test identity through the application's real login path, then pass a spoofed parameter value. No second account is needed, because the guard fires before any table read.

### 4.5 A legacy grant survives the removal of its wrapper

**Trigger.** A deprecated procedure whose application-level caller was deleted, leaving the grant.
**Symptom.** It is still directly callable by any signed-in user through an auto-generated interface layer.
**Check.** Audit grants, not call sites.

### 4.6 A link table with no scoping of its own

**Trigger.** Row-level security gating writes on one side of a join only.
**Symptom.** Nothing prevents a row that pairs entities from two different scopes.
**Check.** Every query that joins through the table re-filters the scope explicitly in the join. This is a property of the table, not a one-off fix.

### 4.7 A settled document's reasoning may not hold for an instance it claims to cover

**Trigger.** An architecture decision record whose blast-radius analysis reasons about one operation class while covering another.
**Symptom.** The same missing bind on a read path is cross-scope disclosure, a severity the document's own text says none of its tracked instances reach.
**Check.** When a settled document's reasoning does not hold for a specific instance it claims to cover, say so and escalate the correction. Do not apply its conclusion anyway, and do not file the instance under a follow-up scoped to a different, lower severity.

---

## 5. Concurrency and workspace

### 5.1 A fresh worktree can branch from a stale base

**Trigger.** Tooling that claims to branch from the current tip.
**Symptom.** HEAD several commits behind, recently merged work missing, conflicts later.
**Check.** Make it the literal first git command after entering: fetch, then compare `git rev-parse HEAD origin/<integration-branch>`. An `is-ancestor` probe alone cannot tell "behind" from "current" (the self-ancestry trap in `./audit-and-selection.md` §3).

### 5.2 Gitignored environment files do not come with a worktree

**Trigger.** A worktree carries tracked files only.
**Symptom.** No credentials present. An agent that found no declared identity available has been seen improvising one, which is how a real credential incident started.
**Check.** Copy the environment file in immediately on entry, before any step that needs credentials. If it is absent, fail closed and report. Never substitute an account, query the database for one, or create one.

### 5.3 An absolute path inside a worktree silently targets the main checkout

**Trigger.** Habitually using the project's canonical absolute path while working in a worktree.
**Symptom.** No error. Reads return another branch's content, which reads as "the fix isn't there". Writes land on the wrong branch's file and report success. One worker hit it three times.
**Check.** Use worktree-relative paths for anything that should reflect your branch, and scan your own commands for absolute paths missing the worktree segment. If a write succeeds but a search in the same session cannot find it, suspect the path before the tool. Recover with an explicit single-path restore in the main checkout, never a blanket one.

### 5.4 Session files written inside a worktree die with it

**Trigger.** A dispatched skill writes its session state inside the worktree it ran in. (This skill's own state lives at `<<PRIMARY_ROOT>>`, SKILL.md Phase 0a step 1, and is not at risk.)
**Symptom.** Per-ticket resume records are stranded and unrecoverable once the worktree is removed.
**Check.** Rescue them into the main checkout before removal: `bun run worktree:audit <path> --rescue` copies them to `<<PRIMARY_ROOT>>` and exits 0 only when nothing durable is left.

### 5.5 A background subagent outlives its dispatcher and shares its working directory

**Trigger.** Dispatching a background agent without giving it its own worktree.
**Symptom.** Its files default to the caller's working directory and ride through every branch switch. One such agent finished a slice, pushed, opened a pull request and merged it after its dispatcher retired.
**Check.** Give it its own worktree from the start, because reacting after the working tree looks wrong is too late. A successor checks the working tree state before assuming it is clean, and treats any retirement-time work-in-progress commit as possibly incomplete.

### 5.6 Never rebase a branch a subagent already pushed

**Trigger.** Keeping up with a moving base by rebasing.
**Symptom.** It forces a force-push, which rewrites history on pushed work.
**Check.** `git checkout -B <branch> origin/<branch> && git merge origin/<integration-branch> --no-edit`, then a normal push. Merge the base in periodically while still implementing, not only once a pull request is open, to keep eventual conflicts small.

### 5.7 Two tickets mapped onto the same surface

**Trigger.** A design plan that maps different tickets onto the same screen or route.
**Symptom.** Duplicate scaffolding and a guaranteed conflict for whichever chain merges second, with neither branch based on the other.
**Check.** Whichever lands first owns the scaffolding and leaves an explicitly named extension-point comment, and the second extends there without restructuring. Leave a coordination flag on the other ticket's row, and re-read the whole coordination file, since that is the only way such a flag is ever found.

### 5.8 A command chain does not protect its later commands

**Trigger.** Chaining after a block whose separator does not short-circuit.
**Symptom.** A checkout correctly aborts on uncommitted work, and the chained fetch and merge run anyway against whatever branch is actually current.
**Check.** Run `git branch --show-current` after any checkout inside a chain, before trusting what follows.

### 5.9 A branch checked out in another worktree cannot be checked out in yours

**Symptom.** An already-used-by-worktree error, even for a read-only look.
**Check.** Check it out under a different local name that tracks the same remote: `git checkout -B <local-name> origin/<branch>`. Pushes still land on the remote branch.

### 5.10 A scheduler-assigned worktree cannot be closed by this session's own tools

**Trigger.** The scheduling app's own "Worktree" option is checked, so the session starts already inside a worktree the scheduler created, not one this session entered itself.
**Symptom.** On Claude Code, `ExitWorktree` is a documented no-op here, because it tracks only worktrees this session entered through `EnterWorktree`. The run finishes and the branch is pushed, but the worktree it ran in is still on disk with no tool left to remove it.
**Check.** Leave the scheduler's "Worktree" option unchecked. The run creates its own worktree in Phase 0a and closes it in Phase 4 (SKILL.md Phase 0a step 4, Phase 4 step 7): `EnterWorktree` and `ExitWorktree(remove)` on Claude Code, `git worktree add` and `git worktree remove` on OpenCode and Codex. Either pair gives the run a worktree it is allowed to close.

### 5.11 A fresh worktree branches from the wrong branch entirely, not merely a stale one

**Trigger.** On Claude Code, `EnterWorktree`'s default base-ref behavior (`fresh`) branches from `origin/<the repo's default branch>`. On OpenCode and Codex, a `git worktree add` given the default branch instead of `origin/<integration-branch>` does the same. A repo's default branch (what `origin/HEAD` points to) and its integration branch (`git_strategy.branches.integration`) are not always the same ref. In a `main-integration` strategy the default is typically `main` while work should branch from `staging`.
**Symptom.** This differs from 5.1, where the base is correct but old. Here the base is the wrong branch outright. Every commit the run makes lands on top of `main` instead of `staging`, which fails to merge cleanly or opens a pull request against the wrong target that nobody notices until review.
**Check.** Immediately after the worktree is created (`EnterWorktree` returns, or `git worktree add` exits) and before any other work, run `git fetch origin && git merge-base --is-ancestor origin/<integration-branch> HEAD`. If the base is wrong, realign with `git checkout -B <this-worktree-branch> origin/<integration-branch>`, which is safe because nothing has been committed on the brand-new branch yet. Do not use `git reset --hard`. Critical Rule #13 forbids repo-wide destructive git commands (a shared working tree may hold another session's uncommitted work), and a project that enforces it has the permission layer deny the call, which stalls the run instead of realigning it. `fresh` does not mean "based on the branch I actually work against".

### 5.12 A dispatched agent's worktree is never auto-removed once it holds changes

**Trigger.** The Agent tool's own contract: a worktree with zero changes is cleaned up automatically, and one that holds any commit is deliberately left on disk, so a still-useful worktree survives for a possible follow-up message to that agent.
**Symptom.** Every dispatched agent that committed anything leaves a worktree behind (three in a 3-bug run) until the orchestrator removes each one. Nothing in the Agent tool will.
**Check.** Immediately after a dispatched agent reports back (merged, escalated with a push, or stopped at a gate with a push), rescue anything in its `.session/` tree, then run `git worktree remove <path>`. Do not use `ExitWorktree`, which does not track worktrees the Agent tool created. Do this per ticket, in Phase 3.5, never batched at the end of the run.

---

## 6. Host, permissions and merge mechanics

### 6.1 Declared protection differs from enforced protection

**Trigger.** Protection implemented as a ruleset instead of classic branch protection.
**Symptom.** The classic endpoint returns a not-protected 404, which reads as unprotected. A declared zero-reviews policy met an enforced approving-review requirement and blocked a pull request for hours.
**Check.** Query both endpoints. Record the enforced fields, including allowed merge methods (a repo may forbid squash and rebase entirely) and whether unresolved review threads block.

### 6.2 A permission denial can escalate to session-wide

**Trigger.** A risk classifier judging actions independently of any allowlist.
**Symptom.** Denials spread from one command to plainly read-only ones. The affected role stopped working and its scheduled sweep was cancelled, which cost hours.
**Check.** Two consecutive denials on unrelated read-only commands are enough signal that the clamp is session-wide. Stop probing, log it, and name the exact allowlist entry a human should add. Do not route around a denial by finding another path to the same effect, and do not change your own permission settings to restore your own capability.

### 6.3 Chat approval and the tool-permission layer are different channels

**Symptom.** A user answering "I authorize, retry" changes nothing at the permission layer.
**Check.** Treat a conversational approval as approval of the intent, never as a grant of the capability. If the layer still denies, the run stops and names what is needed.

### 6.4 The forcing variant gets denied where the safe variant passes

**Symptom.** A force-delete was denied repeatedly while the safe delete (which refuses unless the branch is genuinely merged) passed with no friction.
**Check.** Reach for the non-forcing variant first on routine cleanup. In general, drop to the lowest-privilege option that works, and say so when you cannot.

### 6.5 A remote branch deletion triggers the full pre-push hook chain

**Symptom.** A default timeout kills it mid-hook, which looks the same as a permission denial.
**Check.** Retry with an explicit longer timeout before treating a hang as a permission problem.

---

## 7. Coordination artifacts

### 7.1 Claim files go stale within minutes and are treated as write-once

**Symptom.** A peer's coordination flag sits on your row and is found only by chance.
**Check.** Re-read the whole file, not just your own row, at least once per work session, and on anything that touches shared surface area.

### 7.2 A retiring agent's state block is stale on arrival

**Symptom.** Confirmed exactly as predicted: a background agent finished work after its dispatcher's handoff was written.
**Check.** The first move on resuming is to re-verify every claim in a predecessor's state block against live sources. Never narrate a handoff's claims as fact.

### 7.3 A briefing can be more current than the shared board, or less

**Symptom.** A peer moved between the time a prompt was written and the time the board was read.
**Check.** Check live, cite what you checked, and do not average two documents.

### 7.4 A rule recorded only in a log reaches only agents who already read the log

**Symptom.** Full autonomy was granted verbally, in a handoff and in persistent memory, and agents kept escalating anyway.
**Check.** A rule that must bind an executor becomes a compact rule in the owning skill, and then the registry is regenerated (`bun run skills:registry`), because the registry is what reaches a briefing. Regeneration is a second, separate step, and editing the rule alone changes nothing. A stale registry also fails the repository check in CI.

### 7.5 An unsourced instruction appearing in exactly one artifact

**Symptom.** A record referenced a constraint that exists nowhere else, and a peer had completed the same close-out an hour earlier with no mention of it.
**Check.** Surface it instead of guessing. Note whether the actions already taken are reversible, and record a request that the ruling be written where the next reader will look.

### 7.6 A cache-sync side effect makes the working tree look like scope creep

**Trigger.** A sync command that mutates sibling caches and bumps timestamps.
**Symptom.** The working tree shows unrelated drift, and a blanket add would commit it.
**Check.** Restore with explicit paths only. Never blanket-restore and never stage everything.

---

## 8. External systems

- Rich-text round-trips corrupt inline code, and re-pushing the corrupted copy compounds it. For a small addendum, post a small, clean, separate comment and leave the whole field alone.
- A field can reject a documented format despite advertising it. On the first rejection go straight to the documented fallback, and do not retry with a second encoding.
- Rich-text fields have a size ceiling, and encoded size can be half again the source size. Trim prose, never decisions.
- Assignment through some tool paths silently unassigns while reporting success. Verify the assignee actually changed, whatever the path.
- Agent-authored comments post under the authenticated human's display name. Check a comment's body, and never infer that a human replied from an author name.
- Intermittent timeouts are transient. Retry over a couple of minutes before treating one as a failure.

---

## 9. Process hazards

- Pure idle wait-loops cost more wall-clock than the coding, and agents independently named them their biggest waste. Planning and root-cause work for the next candidate touches no shared branch state, so do it while waiting. Only implementation has to block.
- Timezone confusion inflates stall estimates: one report said three hours of silence for an actual forty-nine minutes. Use explicit thresholds, re-alert only on a material state change or an order-of-magnitude increase, and append corrections instead of editing in place.
- A run that records only successes leaves a record nobody can act on. Report weak reviews and broken conventions plainly.
- A rule stated is not a rule followed. One agent ruled on a convention and did not apply it on the first slice it ruled on. Say the rule to yourself before the first commit of a slice.
