# ADR-NNNN — <Short decision title>

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** YYYY-MM-DD <!-- date the decision was made / last status change -->
- **Deciders:** <names or roles — who owns this decision>
- **Tags:** <comma-separated, e.g. authentication, api, cross-cutting-invariant>
- **Supersedes:** — <!-- ADR-MMMM if this replaces an older decision, else — -->
- **Superseded by:** — <!-- ADR-MMMM if a newer decision replaced this, else — -->

---

## Context

What forces a decision here? Describe the problem, the constraints (technical, business, team, time), and the assumptions in play. State what is true _now_ — enough that a reader six months from now understands the pressure without having been in the room. Cite evidence where it exists (SRS section, PRD requirement, incident, benchmark, constraint from a vendor).

## Decision

The option we chose, stated as a clear, active sentence: "We will …". Be specific enough that someone can tell whether a future change violates it. If the decision introduces an invariant every feature must uphold, state the invariant explicitly.

## Consequences

What becomes true once this is in effect — the good, the bad, and the neutral. This is the section future readers care about most.

- **Positive:** what gets easier, safer, or faster.
- **Negative / trade-offs:** what gets harder or what we give up. (An ADR with no negative is usually under-examined.)
- **Neutral / follow-ups:** new constraints, things to revisit, work this unblocks or blocks.

## Alternatives considered

The serious options we did **not** pick, and why. One short block each — enough that nobody re-proposes a rejected option without new information.

- **<Alternative A>** — why rejected.
- **<Alternative B>** — why rejected.

## References

- Links to SRS / PRD sections, tickets, benchmarks, docs, prior ADRs, external write-ups that informed this decision.

<!--
Authoring notes (delete this comment in the real ADR):
- Filename: ADR-<NNNN>-<kebab-slug>.md  (4-digit number, never reused).
- Add a row to .context/ADR/README.md → Index after creating this file.
- Append-only: once Accepted, do not rewrite the Decision/Consequences. To change course,
  write a NEW ADR that Supersedes this one and flip this file's Status + Superseded-by line.
- Only ADR-worthy decisions belong here: architectural AND hard to reverse. Story-local
  trade-offs stay in the story's implementation-plan.md. See .context/ADR/README.md.
-->
