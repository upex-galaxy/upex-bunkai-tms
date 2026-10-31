# ADR-0019 — Sweep Pending Decisions (SPD): the human-facing session asks every small open item with the harness question tool, in rounds, with a numbered-list fallback

- **Status:** Accepted (by the owner, 2026-10-22, in the `spd-evaluation` session of agentic-qa-boilerplate: sweep in rounds, weight decides sweep vs deck, no verification layer, worktree-close port; ported here at the owner's request)
- **Date:** 2026-10-22
- **Deciders:** Boilerplate owner (upex-galaxy). Ported from agentic-qa-boilerplate ADR-0018 (commit `96b48283`, branch `elycuracity/spd-evaluation`) by the `spd-port` worker; the QA ADR carries the full per-harness evidence
- **Tags:** decisions, multi-harness, orchestration, instructions
- **Supersedes:** —
- **Superseded by:** —

---

## Context

A session about to end a turn with something waiting on the owner (a decision, an unconfirmed assumption, an item left for later) used to write it as prose. The owner has to remember to answer and the answers arrive unanchored. The webapp repo named the fix SPD and the QA twin generalised it across harnesses (QA ADR-0018). This repository already holds the surrounding machinery:

| Need | Where it lives | What it did not say |
|---|---|---|
| WHETHER a question reaches a person | `agentic-dev-core/references/decision-protocol.md` §5 (four escalation kinds) | what to do at the end of a turn that still has such items |
| WHICH instrument asks | `decision-elicitation-doctrine.md` §1 ladder | threshold was "more than three decision points, or one dense one": a count, no batching, no "later", no fallback for a harness without a question tool |
| Conductor vs worker | `orca-orchestration` (`worker_done`, blocking `ask`, `escalation`) and `templates/COMMON.md` (workers never use the question prompt) | the conductor's duty to sweep what workers list |
| Closing a worker | `orca-orchestration` playbook §6 (orphan audit, resume exception) | `worker-release` closes the agent terminal ONLY, so removal was allowed but never required and worktrees piled up |

## Decision

Add the sweep as text, with no new skill, no new Critical Rule, no hook and no router row. SPD decides HOW pendings are asked; `decision-protocol.md` still decides WHAT is asked.

1. **The rule.** The paragraph "SWEEP AT THE TURN END" in `AGENTS.md` §2, harness-neutral (it names no tool). Full shape in `decision-elicitation-doctrine.md` §7: who sweeps (the session talking to the human, never a worker, subagent or routine), what counts (only the four kinds), when (before any message that would leave something waiting; in plan mode before `ExitPlanMode`), the question shape (recommended first, a free-text way out, a "Later" option unless the item blocks), "Later" as a recorded deferral in `progress.md`, the answer as the execution contract, the tool per harness, and the numbered-list fallback.
2. **Rounds, no number.** The tool is called at its own per-call limit and again until every item is asked (9 items on a 4-per-call tool = 4, 4, 1). No limit is written anywhere in this repo.
3. **Weight decides sweep versus deck, never count.** Small decisions (A or B, a default to confirm, a deferral) are swept however many; heavy ones (architecture, an implementation approach, a larger change, real tradeoffs, a long report) get an `mkd` deck; a mixed batch sweeps the small ones after the deck. This replaces the doctrine's old ">3 decisions or one dense one" threshold (ladder §1, `decision-protocol.md` §5, `docs/ai-personality.md`, the `mkd` row of `agentic-dev-onboard`).
4. **Tool per harness** is a table in the doctrine (Claude Code `AskUserQuestion`, Codex `request_user_input`, OpenCode `question`, Gemini CLI `ask_user`, any other its own tool); the session's tool list is the authority.
5. **Known limit: no verification layer.** The owner declined an audit metric and a `Stop` hook. Compliance rests on the instruction alone, so the rule depends on the model following it. A later ADR can add a metric (`instructions:audit`) or a one-shot `Stop` reminder.
6. **`AGENTS.md` compacted** for the AI reader in the same change: header, §2 and the non-binding lines of §3 rewritten denser, no rule or exemption dropped. The Critical Rules, the router and the `…`-joined contract fragments in §3 (TWO EXECUTORS, EPHEMERAL-ARTIFACT, GATE DESIGN, VALUE PROVENANCE) are untouched.
7. **Worktree close is part of closing a worker.** `worker-release` closes the agent terminal only; the conductor removes the worker's worktree in the same turn after the orphan audit (`orca worktree rm --run-hooks`), confirms with `git worktree list`, and keeps one only with a written reason and owner in `roster.md` (a session that may still be resumed is a reason, the existing playbook §6 item 4). Workers remove worktrees they created; an end-of-run `git worktree list` check follows. Applied in `orca-orchestration` `SKILL.md` (compact rule + Quick start step 7), `coordinator-playbook.md` §6, `worker-contract.md`, `topologies.md` and `sprint-development/references/fleet-mode.md`.
8. **Worker rule reachability.** Workers now know where a pending goes (to the conductor via `ask` or their report): `templates/COMMON.md`, `worker-contract.md`, and a compact rule in `agentic-dev-core/SKILL.md` so `REGISTRY.md` carries it.

The router table is untouched: lock fingerprint `387f2c89527c` (ADR-0014) stands.

## Consequences

- **Positive:** open items stop leaving the turn as prose; any number of small decisions is answered in one pass; "Later" is recorded; finished fleets stop leaking worktrees; one text works on three harnesses.
- **Negative / trade-offs:** no enforcement (item 5); on Codex outside Plan mode and in any headless run the fallback is the normal path; tool names and limits move with harness versions; L0 still carries two new paragraphs even after compaction.
- **Neutral / follow-ups:** the QA twin states the same change (QA ADR-0018). This repo has no `stage-gates.md` and no IQL "person signs" column, so that QA subsection has no equivalent here: the escalation kinds of `decision-protocol.md` §5 are the whole input of the sweep.

## Alternatives considered

- **A fixed cap of three questions per sweep.** Dropped by the owner: rounds cover any count.
- **A numbered Critical Rule naming a Claude-only tool.** Rejected: one harness, and the Critical Rules are the break-glass list.
- **A `sweep` skill, or the sweep inside `mkd`.** Rejected: a skill loads when triggered, which is when the habit is skipped; `mkd` is user-level and optional.
- **A `Stop` hook or audit metric.** Declined by the owner for now.

## References

- QA twin: `agentic-qa-boilerplate` ADR-0018 and commit `96b48283`
- `.agents/skills/agentic-dev-core/references/decision-elicitation-doctrine.md` §1, §7; `decision-protocol.md` §5
- `.agents/skills/orca-orchestration/references/coordinator-playbook.md` §6
