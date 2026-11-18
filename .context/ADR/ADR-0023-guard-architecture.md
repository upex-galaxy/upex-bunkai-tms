# ADR-0023 — GUARD: Guarded Unidirectional Agent-Ready Development as the product architecture

- **Status:** Accepted (by the owner, 2026-11-17)
- **Date:** 2026-11-17
- **Deciders:** framework owner (boilerplate maintainer), owner deck `kata-review` (https://claude.ai/artifact/Khx8ScWSe8j6sCiHhYiR1G, decisions D4, D5 and D8) and the owner's chat of 2026-11-17, which named the architecture GUARD and chose where the example lives
- **Tags:** architecture, lint, manifest, agents, conventions
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The boilerplate taught principles for product code (feature folders, aliases, max two positional parameters) in prose, and a reviewer held them. An agent had no shape to copy, no registry to read before creating a feature, and no machine that told it a layer rule was broken. The sibling QA boilerplate already solved the same problem for test code with KATA: layers, a generated manifest and lint per layer (its ADR-0027).

KATA names test concepts (ATCs, fixtures, components) that have no product equivalent, so it cannot be applied to app code as it stands.

## Decision

We will adopt **GUARD** (Guarded Unidirectional Agent-Ready Development) as the product architecture: four layers, one direction, one door per feature, a registry, lint before prose.

1. Four layers, `src/platform`, `src/adapters`, `src/features/<name>` and `src/app`. A layer imports only from the layers below it, and a feature is reached only through its `index.ts`.
2. Rules R1 to R6 each map to a check: an inline ESLint plugin (`guard/layer-imports`, `guard/feature-door`), a generated `guard-manifest.json` with a `--check`, core `max-params` and `max-lines`, and Critical Rule 18 (no comments by default).
3. The layer map is configurable through ESLint `settings.guard.layers`, so an adopted app maps its own folders without moving files.
4. Every check ships at `warn` this release and at `error` the next, through `GUARD_ENFORCEMENT_LEVEL`.
5. The example feature lives in `packages/guard-example/`. The installer inserts it into a new project on first install, the updater never ships it, and a skill re-copies it from the upstream repository on request.
6. A repeated review finding becomes a check first (`agentic-dev-core` Compact Rules).

Provenance: KATA (layers, manifest, entry point), the talk "All Code Is Slop (Except Mine)" by Lauren Tan (trust pyramid, every correction becomes a check, one folder per feature with import bans) and Matt Pocock's codebase-design (the interface is the test surface). Doctrine: `.agents/skills/agentic-dev-core/references/guard-architecture.md`.

## Consequences

- **Positive:** a layer or door violation shows in the editor and in `lint:check` with the fix named. A feature's exported actions become the vocabulary QA automates as KATA ATCs.
- **Negative / trade-offs:** the plugin and the manifest script are code the boilerplate maintains. Downstream projects get new warnings on `bun sync`.
- **Neutral / follow-ups:** the flip to `error` is a later release and its own change, tracked with QA's flip.

## Alternatives considered

- **KATA as it stands** — its test concepts have no product equivalent, so the product layers would borrow words that mean something else.
- **An external standard such as Feature-Sliced Design** — another doctrine to adapt and maintain, with its own vocabulary on top of ours.
- **Principles only** — the status quo: nothing for agents to copy and nothing a machine checks.

## References

- Owner deck `kata-review` (https://claude.ai/artifact/Khx8ScWSe8j6sCiHhYiR1G), decisions D4, D5 and D8.
- QA twin: ADR-0027 of the agentic-qa boilerplate (KATA rules as lint and manifest checks).
