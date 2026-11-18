# ADR-0024 — Oxlint runs the GUARD rules at commit, ESLint stays the CI gate

- **Status:** Accepted (by the owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** framework owner (boilerplate maintainer)
- **Tags:** lint, oxlint, eslint, pre-commit, guard
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0023 put the GUARD rules in an inline ESLint plugin. ESLint takes about 10 to 13 s on the repo and several seconds on a few staged files, because the type-aware `ts/*` rules load the TypeScript project. Every commit pays that cost.

Oxlint ran the same plugin unchanged through its JS plugin loader, in well under a second, and honoured `settings.guard.layers`. A full replacement of ESLint was measured and rejected: 37 antfu rules have no Oxlint equivalent, JS plugins are alpha, and type-aware linting needs TypeScript 7 while the repo is on 5.9. The QA boilerplate made the same decision (its ADR-0028).

## Decision

Use both, each where it is strong.

1. Pre-commit (`lint-staged`) runs Oxlint on staged code with `.oxlintrc.json`, which `extends` the synced `.oxlintrc.base.json`.
2. ESLint stays the gate in `lint:check`, `repo:check`, `pre-push` and CI. `oxlint:check` is a leg of `repo:check`, so a config that stops loading fails there.
3. The `guard` plugin and the default layer map move to `guard-eslint-plugin.js` (default export plus `GUARD_LAYERS`), so ESLint and Oxlint load one file. `eslint.config.base.js` re-exports both.
4. ESLint runs every stock rule. `eslint-plugin-oxlint` was tried and dropped: it switches off 93 core ESLint rules assuming Oxlint runs them, and our config keeps Oxlint's `correctness` category off, so those rules would run in neither linter. Enabling the category was measured (14 findings in this repo, mostly `unicorn` style rules) and left for a later, separate change.
5. The split mirrors ESLint: base files synced, `.oxlintrc.json` project-owned, `validateOxlintWiring` in `agents:compat:check`. An adopted app runs no Oxlint and is exempt; it still receives `guard-eslint-plugin.js` because its tooling lint imports the base.
6. A project that maps its own folders sets `settings.guard.layers` in BOTH `eslint.config.js` and `.oxlintrc.json`. Oxlint replaces the whole `layers` object, ESLint merges key by key.
7. Prettier stays. The `warn` severities in `.oxlintrc.base.json` follow `GUARD_ENFORCEMENT_LEVEL`; a test fails on drift.

## Consequences

- **Positive:** a GUARD violation shows in under a second at commit, with the same message as in CI.
- **Negative / trade-offs:** two linters to keep aligned, and pre-commit no longer autofixes style (`lint:fix`, then `pre-push`, catch it). Oxlint JS plugins are alpha, pinned at an exact version. A custom layer map has to be written twice.
- **Neutral / follow-ups:** a missing `await` is caught by `ts/no-floating-promises` in ESLint, not at commit, because Oxlint does not run type-aware rules until TypeScript 7. A later swap to full Oxlint plus oxfmt waits for stable JS plugins and TypeScript 7.

## Alternatives considered

- **ESLint only, tuned** — `--cache` is stale on type-aware rules and cold in CI and fresh worktrees.
- **Full Oxlint plus oxfmt now** — loses 37 style rules and the type-aware set.
- **Biome** — cannot run the inline GUARD plugin.

## References

- `.oxlintrc.base.json`, `guard-eslint-plugin.js`, `eslint.config.js`, `scripts/oxlint-config.test.ts`, `cli/lib/agent-compatibility-contracts.ts` (`validateOxlintWiring`).
- ADR-0023; QA boilerplate ADR-0028.
