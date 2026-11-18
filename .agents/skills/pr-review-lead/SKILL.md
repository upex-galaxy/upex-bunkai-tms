---
name: pr-review-lead
description: "Reviews a colleague's pull request as a Tech Lead against the repo's development doctrine, citing doctrine or code for every finding. Use when asked to review, audit, score or give feedback on a PR, in this repo or an external one (owner/repo#PR). Not for the story pipeline's own reviewer (sprint-development), your uncommitted diff (code-review) or opening the PR (git-flow-master)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: workflow
---

# PR Review Lead: Tech Lead Reviewer

You review a peer's pull request the way a senior Tech Lead would: as a mentor who has read the doctrine this codebase documents, has read the diff, and can point at where each claim comes from. Every finding traces to a line in the diff, a line in a skill, doctrine or ADR file, or an explicit "this is my opinion, not a repo rule."

A good session reads the target repo's own conventions first, then the diffs, shows the findings before writing anything, lets the user recalibrate severity, drafts the feedback, and posts only on their go.

## Compact Rules

- Run the strictness preflight (Flexible, Standard or Strict) before reading any diff. If the invocation already answered it, do not ask again.
- At Flexible and Standard, a doctrine-pattern deviation is an observation framed as a comparison, never an error, and it does not move the score the way a Real defect does. Strict widens what counts as a finding; it does not turn a pattern note into an error.
- When the target repo ships its own doctrine (`AGENTS.md`, `.agents/skills/`, `.context/`), load it before analyzing. Only when it has none is this repo's doctrine the reference standard, and the output says so once, up front.
- Present a "best practice" as a repo requirement only with a `file §section` citation. An ungrounded call is labeled as opinion, in those words.
- Put every finding in exactly one bucket (Real, Pattern or Positive) with a severity from the shared scale in `sprint-development/references/review-pr.md` §"Adjudication contract" (`BLOCKER`, `MAJOR`, `MINOR`, `NIT`).
- Fill the Positive bucket. A review with no positives on a PR that clearly has some is uncalibrated, not rigorous.
- Read the actual diffs, never the PR description. On a PR too large for one diff, page the per-file patches, and check the commit headlines first so a lockfile, generated-types or vendor-sync commit is not reviewed line by line.
- When the PR has a ticket, plan or acceptance criteria to check against, review on two axes, Spec and Standards, each by its own reviewer in a fresh context, with the briefs in `sprint-development/references/review-pr.md` `## Two-axis review`. Check the new tests for lying tests (LT-1 and LT-2 with Spec, LT-3 with Standards), defined in `unit-testing/references/tdd-workflow.md`.
- Present the findings table, the positives and a score out of 10 as a checkpoint, then let the user triage and re-classify. Their context decides what ships; do not defend the first-pass severity.
- Skip what `guard` lint and `guard-manifest.json` already check (layer direction, feature door, thin app, registry). Spend GUARD review on judgment (`agentic-dev-core/references/guard-architecture.md`): is the action named as the business names it, is the feature a deep module (deletion test), is a new adapter a real seam or a hypothetical one (one adapter is hypothetical), does each exception carry an `eslint-disable` with a reason.
- Post to GitHub only after an explicit go-ahead on the final draft. Approval for a different PR does not carry over, and silence is not approval. The comment carries no AI-generated marker.
- With no person to ask, follow `## Who holds the gates`: the brief's strictness or Standard, no triage, and the draft saved to the report unless the brief names this PR and says to post.
- Drafting and posting stay with the orchestrator, because tone and an outward action are not for a subagent.
- Write the posted comment in English (Critical Rule #12) unless the user asked for another language for that comment.
- Review the PR and leave the fixing to its author: push nothing to the PR under review. A fix the user wants goes through the PR author or a separate branch through `/git-flow-master`. Submit a formal GitHub approval or change request only when the user asks for that action; the default artifact is a plain comment.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md`, `agentic-dev-core/references/dispatch-patterns.md` and `agentic-dev-core/references/orchestration-doctrine.md`, when a PR is large enough for subagent fan-out (Step 2).
- The default doctrine set for this repo, read fresh every invocation and never from memory of a prior session, widened or narrowed to what the PR touches: `references/evidence-and-doctrine-lookup.md` §"Doctrine map".
- `/git-flow-master` before the first `gh` call (`.agents/instructions/agent-tool-resolution.md` §6.5).
- `references/severity-and-scoring.md`, `references/evidence-and-doctrine-lookup.md` and `references/output-and-posting-flow.md`, this skill's own references, read at the step noted below.

## When to use this vs. a sibling

| Need | Use |
|---|---|
| Feedback on a colleague's finished PR (this repo or another), scored and grounded in doctrine, posted only after your OK | This skill |
| The reviewer pass inside a story's pipeline: an independent adversarial agent, findings adjudicated by the orchestrator, loops back to Stage 2 | `/sprint-development` Stage 3, `references/review-pr.md` |
| Review of your own uncommitted working-tree changes before opening a PR | the harness's code-review flow |
| Open the PR, fix conflicts, manage branches | `/git-flow-master` |

The story pipeline's reviewer and this skill share one checklist (`review-pr.md` §"Review checklist", never restated here) and one severity scale. Stage 3 answers to the orchestrator of one story and never posts. This skill answers to a human reviewing someone else's PR, adds the strictness lens and the score, and posts only on an explicit OK.

---

## Who holds the gates

Three points wait for a person: the strictness choice (Step 0), the triage (Step 5) and the posting go-ahead (Step 7). Whether a question reaches a person at all follows `agentic-dev-core/references/decision-protocol.md`.

| Gate | A person is present | Supervised worker | Routine with nobody |
|---|---|---|---|
| Strictness (Step 0) | ask, unless already given | the conductor's brief or reply answers it | the brief's level; without one, Standard, reported as DECIDED |
| Triage (Step 5) | the user triages | the conductor triages | skip it; the draft carries every finding, and the report says it was not triaged |
| Posting (Step 7) | explicit go on the shown draft | the explicit go the conductor relays from the person, naming this PR | post only if the brief names this PR and tells you to post; otherwise save the draft and report |

Without a go, the worker stops at the saved draft, puts it in its report and posts nothing. The two-axis reviewers are subagents, so they never wait.

---

## Step 0: Preflight, strictness level (every invocation)

Before reading any diff, ask how strict to be, through the harness's own prompt (one question, three options; AGENTS.md §2 "Asking the human to decide"), unless the invocation already answered it ("review this strictly", "be flexible with the patterns").

Offer three levels, in the user's language:

- Flexible: only what is evidently wrong or puts correctness, security or data at risk: real bugs, hardcoded secrets, an RPC that trusts a caller-supplied identity, a migration that cannot be rolled back, an acceptance criterion the diff does not meet. A pattern that diverges from the documented one but works is not a finding.
- Standard (recommended default): the Flexible bar, plus doctrine-pattern deviations as light observations, framed as a comparison ("the documented pattern does X, this PR does Y") and never as an error. A pattern note never drags the score.
- Strict: a full literal pass against every applicable doctrine file. A deviation is a tagged finding even when it works. The Real and Pattern buckets stay separate: Strict widens what counts as a finding and does not turn pattern notes into errors.

In the same round, confirm the scope if it is not yet given: which PR (`owner/repo#N`, a PR URL, "the current branch's PR" or a raw diff), and whether it is this repo or an external one. `references/severity-and-scoring.md` has the rationale and a worked recalibration.

## Step 1: Resolve scope and load doctrine

Review against what you just verified is documented, never against remembered conventions. Read first, opine second.

In this repo, load `AGENTS.md` (§1 Critical Rules, §2 SIMPLICITY FIRST and SURGICAL CHANGES) and the sections its router names: `.agents/instructions/agent-critical-rules.md` for each rule's full text and `agent-code-quickref.md` for §10 Stack quick-reference. Add the doctrine files the PR touches (`references/evidence-and-doctrine-lookup.md` §"Doctrine map"). When the branch names a story key, load that story's acceptance criteria and implementation plan through the synced PBI (`bun run jira:sync-issues get <KEY>`), because "does it do what the story asked" is the first checklist item.

For an external repo, check whether it ships its own `AGENTS.md`, `.agents/skills/` or `.context/` before assuming anything. A project scaffolded from this boilerplate may carry an evolved copy of the doctrine, which is a signal and not proof. If it has doctrine, that doctrine is authoritative for this review. If it has none, grade against this repo's doctrine and say so in the output.

Read `references/evidence-and-doctrine-lookup.md` now, before Step 2: it has the `gh api` probes and the citation format.

## Step 2: Gather the PR

In this repo, take the current branch's PR with `gh pr view` and `gh pr diff`.

For an external repo, run `gh pr view <N> --repo <owner>/<repo> --json ...` for metadata, commits and files, then read the per-file patches from the paginated `pulls/<N>/files` endpoint. A very large PR makes `gh pr diff` fail with `PullRequest.diff too_large`; fall back to the per-file patches rather than skimming the description.

Separate real work from noise. A large diff is sometimes mostly a lockfile, regenerated Supabase types, an OpenAPI type sync or a template-sync commit. Check `commits[].messageHeadline` first and tell the user about the noise instead of reviewing it line by line. Generated output still gets one check: it must match what generated it, and a hand-edited generated file is a finding.

For a PR touching many files, dispatch per file or per logical group (UI, API, DB and migrations, tests) with a 7-component briefing (`agentic-dev-core/references/briefing-template.md`) and the pattern from `dispatch-patterns.md` (Parallel for independent groups, Single for one module), so the diffs stay out of your own context. A handful of files is read inline.

## Step 3: Analyze against doctrine

For every candidate finding, ask where it comes from: a code location (`<file>:<line>` in the diff) showing the defect, a doctrine `file §section` backing the "wrong per our conventions" claim, or both. With neither, it is a general engineering opinion and you label it as one (`references/evidence-and-doctrine-lookup.md`).

Walk `sprint-development/references/review-pr.md` §"Review checklist" in its order (acceptance criteria, lint and build, code standards, architecture, security, performance, UI/UX, data-testid, general quality), plus the three areas a cross-PR reviewer owns that a story reviewer may not reach:

- Layer boundaries: the GUARD layers (or the app's own map in `settings.guard.layers`) and the design-system structure in the frontend are framework architecture (`project-bootstrap` rule B1). Collapsing them is a finding, not a simplification. Lint and the manifest police the mechanical half, so the review judges the rest: the action's name against the business's own word, a feature that earns its door (deletion test: removing it would scatter its complexity across callers), an adapter that is a real seam, and every disable comment carrying a reason.
- UI fidelity (Critical Rule #14): the current live UI plus the `DESIGN.md` tokens are the reference, and the mockup is inspiration. A UI change that matches neither the live UI nor the design system, and carries no §5 spec-only ratification in `.context/design/master-design-plan.md`, is a defect. A PR that follows the improved live UI where the mockup differs is not a finding.
- UI post-write pass: a PR that touches UI carries the `impeccable` critique notes and the `modern-web-guidance legacy-scan` output in the PR body or the evidence (`sprint-development/references/live-ui-validation.md` §5.4). Missing evidence is a finding. Reading the screen is the review's own work, since lint cannot judge hierarchy, states, copy or accessibility semantics (the right element, name, focus order and keyboard path).
- ADRs: an architectural choice that passes the three-gate test in `agentic-dev-core/references/adr-doctrine.md` §1 (hard to reverse, surprising without context, a real trade-off) and has no ADR is a finding, and so is one that contradicts an `Accepted` ADR in `.context/ADR/`.

When the PR has a ticket, plan or acceptance criteria to check against, run the review on two axes: one Spec reviewer and one Standards reviewer, each in a fresh context, with the briefs in `sprint-development/references/review-pr.md` `## Two-axis review`. A PR can pass one axis and fail the other, and one reviewer holding both lets the first answer color the second. Tag each finding with its axis and do not merge or rerank the reports. With no spec to check (common on an external repo), say so and let Standards run alone, inline. Spec findings stay in the Real bucket; a Standards finding that matches the documented standards is Pattern or Real by the Step 0 level.

Check the PR's new tests for lying tests: LT-1 tautological, LT-2 cannot fail, LT-3 structure-sensitive (defined in `unit-testing/references/tdd-workflow.md`). A green test is evidence only if it could have been red. These are Real findings at every strictness level, because they leave a defect unprotected. LT-1 and LT-2 go with the Spec axis, LT-3 with Standards. LT-2 is a `BLOCKER`, the other two `MAJOR`.

Bucket every finding into exactly one of:

1. Real: bugs, unmet acceptance criteria, hardcoded credentials (Critical Rule #1), RPCs that trust caller-supplied identity (`sprint-development/references/rpc-authorization.md`), unsafe or irreversible migrations, unratified UI divergence, missing error handling on a public path, lying tests, genuinely unaddressed test gaps. Weighted at every strictness level.
2. Pattern: diverges from a documented convention without being a functional defect (more than two positional params, a deep relative import, a domain helper in a shared utility, a naming slip). Its weight follows the Step 0 level.
3. Positive: things done well. Look for tests that pin behavior rather than implementation, a migration with a working down path, honest disclosure of trade-offs in the PR body, a clean ADR, a reusable component instead of a copy, and live-UI evidence attached.

Severity within Real and Pattern uses the scale in `review-pr.md` §"Adjudication contract" (`BLOCKER`, `MAJOR`, `MINOR`, `NIT`), with the labels mirrored in the user's language in conversation. The rubric and scoring are in `references/severity-and-scoring.md`.

## Step 4: Present the findings

Show a table grouped by bucket and severity (severity, location, the finding, its evidence citation), the Positive list, and a score out of 10 with a one-line rationale tied to the buckets that drove it. This is a checkpoint and nothing goes outside yet. Template: `references/output-and-posting-flow.md`.

## Step 5: Triage with the user

The user picks which findings go into the feedback, or pushes back on a severity or bucket ("that's opinion, not an error", "only blockers and majors"). Re-triage exactly as asked; that is the expected flow, not a failure of the first pass. Their context is the authority on what ships.

## Step 6: Draft the feedback

Once the user confirms which findings ship (and the tone, if they have not set one), draft the message: praise, constructive points with their evidence, then praise, with a real strength at each end. Template: `references/output-and-posting-flow.md`.

## Step 7: Confirm, then post

Show the complete draft and wait for an explicit go-ahead about this draft ("post it", "dale", or the equivalent in any language). A posted comment is visible to others and not cheaply undone. After the go, post it as a plain PR comment from a scratch file (`gh pr comment <N> [--repo <owner>/<repo>] --body-file <path>`).

Done means the comment URL `gh` returned is in your report and a read-back confirms the comment is on the PR (Critical Rule #16: the exit code describes the call, not the outcome). Commands: `references/output-and-posting-flow.md`.

---

## Subagent dispatch strategy

| Stage | Pattern | Subagent role |
|---|---|---|
| Probe external repo for its own doctrine (Step 1) | Single | one agent checks for `AGENTS.md`, `.agents/skills` and `.context`, and reports what exists |
| Fetch N independent file diffs (Step 2, large PR) | Parallel | one agent per file group, returns the patch and a one-line summary; cap per `dispatch-patterns.md` |
| Analyze against doctrine (Step 3) | Parallel, one reviewer per axis | a Spec reviewer and a Standards reviewer, each in a fresh context, whenever the PR has a spec to check; with no spec, Standards runs inline |

Steps 6 and 7 never go to a subagent. They carry user-facing tone and an outward action, which stay with the orchestrator (`agentic-dev-core/references/orchestration-doctrine.md`; the briefing template's anti-patterns rule out delegating "ask the user").
