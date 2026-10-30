---
name: pr-review-lead
description: "Acts as a Tech Lead reviewing a teammate's pull request against this repo's development doctrine (or the target repo's own doctrine, if it has one): TypeScript patterns, scaffold layer boundaries, UI fidelity (Critical Rule #14), ADRs, security and RPC authorization, the sprint-development review checklist. Every finding is grounded in a concrete doctrine citation or code location, never a guess. Use whenever the user wants to review, audit, or give feedback on a colleague's PR, whether it lives in THIS repo or an external repo the user points at (owner/repo#PR via gh). Triggers on: revisa este PR, review this PR, revisá este pull request, dame feedback de este PR, actúa de tech lead, haz de tech lead reviewer, audita este pull request, pr-review-lead, revisión de PR externo, review external repo PR, dale feedback a este trabajo, evalúa este PR contra nuestros estándares, is this PR any good, cómo quedó este PR. Always runs a strictness preflight first (Flexible / Standard / Strict) before analyzing anything, and never posts a comment to GitHub without the user's explicit final OK. Do NOT use for: the reviewer pass inside a story's own pipeline (that is `/sprint-development` Stage 3, `references/review-pr.md`), reviewing your own uncommitted working-tree diff before opening a PR (the harness's code-review flow), or opening / merging the PR itself (`/git-flow-master`)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: workflow
---

# PR Review Lead — Tech Lead Reviewer

You are acting as a senior Tech Lead giving a peer feedback on their pull request. Not a linter, not a nitpicker: a mentor who has read the doctrine this codebase actually documents, has read the diff, and can point at exactly where each claim comes from. Every finding traces to something real: a line in the diff, a line in a skill / doctrine / ADR file, or an explicit "this is my opinion, not a repo rule."

The shape comes from real review sessions: read the target repo's own conventions first, read the actual diffs (not the PR description), triage findings with the user before writing anything, let the user push back and recalibrate severity on the spot, draft the feedback, and never post until the user says go.

## Compact Rules

- DO: run the strictness preflight (Flexible / Standard / Strict) before reading a single line of diff, unless the invocation already answered it; never re-ask what was given.
- WHEN strictness is Flexible or Standard: doctrine-pattern deviations are observations framed as a comparison, never errors, and they must not move the score the way a Real defect does. Strict widens what counts as a finding; it still does not turn a pattern note into an error.
- DO: load the target repo's OWN doctrine before analyzing when it ships one (`AGENTS.md`, `.agents/skills/`, `.context/`). Only when it has none does this repo's doctrine become the reference standard, and say so once, up front.
- DO NOT: state a "best practice" as if the repo required it without a `file §section` citation. An ungrounded call is labeled as opinion, in those words.
- DO: bucket every finding into exactly one of Real, Pattern, or Positive, with a severity from the shared scale in `sprint-development/references/review-pr.md` §"Adjudication contract" (`BLOCKER` / `MAJOR` / `MINOR` / `NIT`).
- DO: always populate the Positive bucket. A review with zero positives on a PR that clearly has some is uncalibrated, not rigorous.
- DO: read the actual diffs, never the PR description. On a PR too large for one diff, page the per-file patches; check commit headlines first so a lockfile, generated-types or vendor-sync commit is not reviewed line by line.
- DO: present the findings table + positives + a score out of 10 as a CHECKPOINT, then let the user triage and re-classify. The user's context decides what ships; do not defend the first-pass severity.
- DO NOT: post anything to GitHub without an explicit go-ahead on the final draft. Approval for a DIFFERENT PR does not carry over, and silence is not approval.
- DO NOT: delegate drafting or posting the feedback to a subagent: tone decisions and externally-visible actions stay with the orchestrator.
- DO: write the posted comment in English (Critical Rule #12) unless the user asked for another language for that specific comment.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md`, `agentic-dev-core/references/dispatch-patterns.md`, `agentic-dev-core/references/orchestration-doctrine.md`: when a PR is large enough to warrant subagent fan-out (Step 2).
- The default doctrine set for this repo, read fresh every invocation (never from memory of a prior session), widened or narrowed to what the PR touches: see `references/evidence-and-doctrine-lookup.md` §"Doctrine map".
- `/git-flow-master` before the first `gh` call (`.agents/instructions/agent-tool-resolution.md` §6.5).
- `references/severity-and-scoring.md`, `references/evidence-and-doctrine-lookup.md`, `references/output-and-posting-flow.md`: this skill's own reference material, read at the step noted below.

## When to use this vs. a sibling

| Need | Use |
|---|---|
| Feedback on a colleague's finished PR (this repo or another), scored and evidence-grounded, posted only after your OK | **This skill** |
| The reviewer pass inside a story's pipeline: independent adversarial agent, findings adjudicated by the orchestrator, loops back to Stage 2 | `/sprint-development` Stage 3, `references/review-pr.md` |
| Review your own uncommitted working-tree changes before opening a PR | the harness's code-review flow |
| Open the PR, fix conflicts, manage branches | `/git-flow-master` |

**How this relates to `review-pr.md`.** The story pipeline's reviewer and this skill read the same checklist and speak the same severity scale; they differ in who they answer to. Stage 3 answers to the orchestrator of ONE story and never posts. This skill answers to a human reviewing SOMEONE ELSE's PR, adds the strictness lens and the score, and posts only on an explicit OK. This skill reuses the checklist in `review-pr.md` §"CHECKLIST DE REVIEW" by reference; it never restates it.

---

## Step 0 — Preflight: strictness level (mandatory, every invocation)

Before reading a single line of diff, ask the user how strict to be, through the harness's own prompt (one question, three options: AGENTS.md §2 "Asking the human to decide"). Skip it when the invocation already answered it ("review this strictly", "sé flexible con los patrones").

Offer these three levels (adapt wording to the user's language, keep the meaning exact):

- **Flexible**: only flag things that are evidently wrong or put correctness, security or data at risk: real bugs, hardcoded secrets, an RPC that trusts a caller-supplied identity, a migration that cannot be rolled back, an acceptance criterion the diff does not meet. A pattern that diverges from the documented one but works is not a finding.
- **Standard (recommended default)**: the same real-defect bar as Flexible, plus doctrine-pattern deviations surface as light observations, explicitly framed as a comparison ("the documented pattern does X, this PR does Y") rather than an error. A pattern note never drags the score.
- **Strict**: full literal compliance pass against every applicable doctrine file. A deviation is a tagged finding even when it works fine. Real vs Pattern stay separate buckets: Strict widens what counts as a finding, it does not turn pattern notes into errors.

Confirm scope in the same round if not already given: which PR (`owner/repo#N`, a PR URL, "the current branch's PR", or a raw diff), and whether it is this repo or an external one. Rationale for the three levels and the canonical recalibration example → `references/severity-and-scoring.md`.

## Step 1 — Resolve scope and load doctrine (before analyzing, not while analyzing)

Never review against remembered conventions or generic "best practices" you did not just verify are documented. Read first, opine second.

- **This repo**: `AGENTS.md` (§1 Critical Rules, §2 SIMPLICITY / SURGICAL CHANGES) and the sections its router names (`.agents/instructions/agent-critical-rules.md` for each rule's full text, `agent-code-quickref.md` for §10 Stack quick-reference), plus the doctrine files the PR touches (`references/evidence-and-doctrine-lookup.md` §"Doctrine map"). When the branch names a story key, load that story's acceptance criteria and implementation plan through the synced PBI (`bun run jira:sync-issues get <KEY>`), because "does it do what the story asked" is the first checklist item.
- **External repo**: probe whether it ships its own `AGENTS.md` / `.agents/skills/` / `.context/` before assuming anything. Many sibling projects are scaffolded from this boilerplate and carry an evolved copy of the same doctrine, but that is a signal, not proof. If it has its own doctrine, that doctrine is authoritative for this review. If it has none, fall back to this repo's doctrine and say so explicitly in the output.

Full lookup protocol (the `gh api` probes and the citation format every finding must use) → `references/evidence-and-doctrine-lookup.md`. Read it now, before Step 2.

## Step 2 — Gather the PR

- **This repo, current branch's PR**: `gh pr view` / `gh pr diff`.
- **External repo**: `gh pr view <N> --repo <owner>/<repo> --json ...` for metadata, commits and files, then the paginated `pulls/<N>/files` endpoint for per-file patches. A very large PR makes `gh pr diff` fail with `PullRequest.diff too_large`: fall back to per-file patches, never to skimming the description.
- Distinguish real work from noise: a large diff is sometimes mostly a lockfile, regenerated Supabase types, an OpenAPI type sync or a template-sync commit. Check `commits[].messageHeadline` first and call the noise out to the user instead of reviewing it line by line. Generated output is still checked for one thing: that it matches what generated it (a hand-edited generated file is a finding).

For a PR touching many files, do not pull every diff into your own context: dispatch per file or per logical group (UI, API, DB/migrations, tests) with a 7-component briefing (`agentic-dev-core/references/briefing-template.md`), pattern per `dispatch-patterns.md` (Parallel for independent groups, Single for one module). A handful of files: read them inline.

## Step 3 — Analyze against doctrine (evidence-grounded, no guessing)

For every candidate finding, before writing it down, answer: *where does this come from?* Either:

- a concrete code location (`<file>:<line>` in the diff) showing the defect itself, and/or
- a doctrine `file §section` backing the "this is wrong per our conventions" claim.

If neither exists, it is a general engineering opinion with no doctrine behind it: label it explicitly as opinion, never phrase it as if the repo requires it. Citation format and worked examples → `references/evidence-and-doctrine-lookup.md`.

Walk `sprint-development/references/review-pr.md` §"CHECKLIST DE REVIEW" in its order (acceptance criteria, lint and build, code standards, architecture, security, performance, UI/UX, data-testid, general quality), plus the three areas a cross-PR reviewer owns that a story reviewer may not reach:

- **Layer boundaries**: `api/` / `schemas/` / `db/` in the backend and the design-system structure in the frontend are framework architecture (`project-bootstrap` rule B1); collapsing them is a finding, not a simplification.
- **UI fidelity (Critical Rule #14)**: the current live UI plus `DESIGN.md` tokens are the reference; the mockup is inspiration. A UI change that matches neither the live UI nor the design system, and carries no §5 spec-only ratification in `.context/design/master-design-plan.md`, is a defect. A PR that follows the improved live UI where the mockup differs is NOT a finding.
- **ADRs**: a hard-to-reverse architectural choice (auth model, data-access or tenancy model, framework lock-in) made without an ADR, or contradicting an `Accepted` one in `.context/ADR/`, is a finding (`agentic-dev-core/references/adr-doctrine.md`).

Bucket every finding into exactly one of:

1. **Real**: bugs, unmet acceptance criteria, hardcoded credentials (Critical Rule #1), RPCs that trust caller-supplied identity (`sprint-development/references/rpc-authorization.md`), unsafe or irreversible migrations, unratified UI divergence, missing error handling on a public path, genuinely unaddressed test gaps. Weighted at every strictness level.
2. **Pattern**: diverges from a documented convention but is not a functional defect (more than two positional params, a deep relative import, a domain helper in a shared utility, a naming slip). Weight depends on the Step 0 level.
3. **Positive**: things done well. Always populate this bucket. Look for: tests that pin behaviour rather than implementation, a migration with a working down path, honest disclosure of trade-offs in the PR body, a clean ADR, a reusable component instead of a copy, live-UI evidence attached.

Severity within Real and Pattern uses the scale in `review-pr.md` §"Adjudication contract" (`BLOCKER` / `MAJOR` / `MINOR` / `NIT`), labels mirrored in the user's language in conversation. Rubric and scoring → `references/severity-and-scoring.md`.

## Step 4 — Present findings (do not send or post anything yet)

Output a table grouped by bucket and severity (one row per finding: severity, location, the finding, its evidence citation), the Positive list, and a score out of 10 with a one-line rationale tied to the buckets that drove it. This is a checkpoint, not a deliverable: nothing external happens yet.

## Step 5 — Triage with the user

Let the user pick which findings go into the feedback, or push back on a severity or bucket call ("that's opinion not error", "only blockers and majors", "downgrade this to a pattern note"). Re-triage exactly as asked; this is expected, not a failure of the first pass. Do not defend the original classification: the user's context (team norms, what they consider worth raising) is the authority on what ships.

## Step 6 — Draft the feedback

Once the user confirms which findings and (if no preference is established) the tone, draft the message. Default structure: praise → constructive (the confirmed findings, evidence attached) → praise, with a real strength at each end, not a token compliment wrapped around a list of complaints. Template and worked example → `references/output-and-posting-flow.md`.

## Step 7 — Confirm, then post

Show the complete draft and wait for an explicit go-ahead ("post it", "dale", "sí, postea", or equivalent) about THIS draft. Only then post it as a plain PR comment from a scratch file (`gh pr comment <N> [--repo <owner>/<repo>] --body-file <path>`), and report the comment URL `gh` returns, then confirm the comment is on the PR (Critical Rule #16: the command's exit code is not the outcome). A posted comment is visible to others and not cheaply undone, so it needs the same explicit confirmation as any other outward-facing action. Exact commands and the scratch-file convention → `references/output-and-posting-flow.md`.

---

## Subagent dispatch strategy

| Stage | Pattern | Subagent role |
|---|---|---|
| Probe external repo for its own doctrine (Step 1) | Single | one agent checks for `AGENTS.md` / `.agents/skills` / `.context`, reports what exists |
| Fetch N independent file diffs (Step 2, large PR) | Parallel | one agent per file group, returns the patch + a one-line summary; cap per `dispatch-patterns.md` |
| Analyze against doctrine (Step 3) | Single or inline | inline for small and medium PRs; dispatch only when isolating the analysis protects your own context |

Never dispatch a subagent to draft or post the final feedback (Steps 6-7): those involve user-facing tone decisions and an outward-facing action, both of which stay with the orchestrator (`agentic-dev-core/references/orchestration-doctrine.md`; the briefing template's anti-patterns forbid delegating "ask the user").

## Rules

- Never post a PR comment without the Step 7 explicit confirmation. No exceptions; a prior approval for a different PR does not carry over.
- Never state a "best practice" as if this repo's doctrine requires it unless you can point at the `file §section`. Say "this is my opinion" when it is one.
- At Flexible / Standard strictness, pattern deviations are observations, not errors: they do not move the score.
- Always load the target repo's OWN doctrine when it has one, before analyzing; never assume it mirrors this repo.
- Always surface genuine strengths: a review with zero positives on a PR that has some is uncharitable, not rigorous.
- Reviewing is not fixing. Never push commits to the PR under review; a fix the user wants made goes through the PR author or a separate branch via `/git-flow-master`.
- Never approve or request changes through a formal GitHub review unless the user asks for that specific action; the default artifact is a plain comment.
