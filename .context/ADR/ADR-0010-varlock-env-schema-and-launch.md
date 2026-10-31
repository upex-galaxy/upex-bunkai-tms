# ADR-0010 — varlock owns the env schema and launches the agent harnesses

- **Status:** Accepted (the harness launch item superseded by ADR-0016)
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): env-secrets spike owner decisions OD1 = b (`.env` stays the default path, a secret manager is the advanced option), OD3 = b (the dev boilerplate adopts varlock in the same wave as the QA one), OD6 = a with an exception (the AI never writes a secret value into `.env`, it may write a non-sensitive one). Conductor ruling of the parity fleet on the shared launch contract (a precedence preflight before `varlock run`, one launcher script for the three harnesses). Ported from agentic-qa-boilerplate ADR-0003 and ADR-0005 by unit D-U2
- **Tags:** env, secrets, validation, launch, ci, updater, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** ADR-0016 ("Launch through varlock, behind a precedence preflight" only; the preflight's check lives on in `vars:env:check`)

---

## Context

Every environment variable this repo knows is routed by `cli/lib/variables-manifest.ts` and documented by `.env.example`; `scripts/check-vars.ts` keeps the two in step. Neither is a typed schema: a value's type and its sensitivity lived in comments, so nothing could answer "which variables are set" without opening the file that holds the secrets, and `bun run env:set` (Critical Rule #1's one write path) had only the manifest to decide what is a secret, which knows nothing about a project's own variables.

The three agent harnesses launched through `dotenv -o -e .env -- <bin>`, and Codex stdio servers through `bunx -p dotenv-cli@8.0.0 dotenv -o -e .env --`. `-o` made `.env` win over a variable inherited from the parent shell.

The sibling QA boilerplate adopted varlock as its schema owner (its ADR-0003, ADR-0005) and is moving its launch onto it. Measured here on the pinned 1.20.0:

1. `varlock run` lets a variable already in the process environment WIN over `.env` / `.env.local`; no flag inverts it. `varlock load --format json-full --agent` returns `overrideKeys`, every key present in the process, equal or not.
2. `varlock load --agent` prints a `@sensitive` item as a two-character prefix plus mask and every other item in full.
3. An undeclared key that is present and EMPTY in `.env` fails `varlock load`; one with a value passes as implicitly sensitive.
4. An inline `   # comment` after an unquoted value reads as empty, the same as Bun's autoload.

## Decision

We will make varlock the owner of env schema, validation and redaction, and the loader every agent launch goes through.

- **Two committed schema files, no values.** `.env.core.schema` is GENERATED from `VAR_MANIFEST` plus `UNROUTED_VARS` (`cli/lib/env-schema.ts`, `bun run vars:schema`), synced by the updater (component `env-schema`), never hand-edited. `.env.schema` is project-owned, imports the core file, holds the root decorators and the project's own variables, and is delivered once (protected watchlist). Every manifest secret is `@sensitive`; every key a template or Vercel-pulled `.env` carries is declared (fact 3).
- **The schema requires nothing.** This repo is a template: a fresh clone has no Supabase project and no Atlassian site, and the consumer that reads a variable fails by name. A project that wants a stronger contract re-declares an item in `.env.schema` as required.
- **Exact pin and a pair-load gate.** `varlock` is pinned exactly (`package.json`), and `bun run vars:schema:check` (pre-commit when a staged file can stale it, and `repo:check`) loads the committed pair through the pinned varlock in a scratch directory. The core file is named `.env.core.schema` because varlock reads only `.env[.<env>][.<type>]` names and never treats an IMPORTED file as environment-specific; that second rule is in varlock's source, not its docs, and the gate is what catches a bump that changes it.
- **Validation where it is cheap.** Pre-push runs `bunx varlock load --agent` WARN-only (it describes the developer's machine); CI runs `dmno-dev/varlock-action` before installing anything; `bun run setup:doctor` reports the schema, the reachable varlock and whether `.env` satisfies it, and makes only an invalid load a pending action.
- **`env:set` reads the schema.** A key is writable only when the schema declares it without `@sensitive` and the manifest neither marks it secret nor sources it outside `.env`. With no schema on disk, the manifest alone decides.
- **Launch through varlock, behind a precedence preflight.** `bun run claude | codex | opencode` run `bun --no-env-file scripts/launch.ts <bin>`. The launcher takes varlock's `overrideKeys`, compares each with `.env` / `.env.local` in-process, and REFUSES to start when an inherited value differs (names and lengths only, never a value); otherwise it runs `varlock run -- <bin>`. Fact 1 would otherwise turn a stale shell export into a silent override for the whole session. `bun run vars:env:check` runs the same comparison (error by default, warning under `VARS_ENV_CHECK_DRIFT=warn` in pre-push). `dotenv-cli` is retired.
- **Codex stdio servers load through `bunx -p varlock@<pin> varlock run --no-redact-stdout --`.** The pin equals the devDependency (a test enforces it), and `--no-redact-stdout` keeps varlock from rewriting the JSON-RPC stream on the stdio pipe.
- **The presence check for an agent is `bunx varlock load --agent`.** Because of fact 2, the protection is the `@sensitive` marking: a secret declared without it is printed. Never `varlock load` without `--agent`, `varlock printenv` or `varlock reveal` (Critical Rule #1).

## Consequences

- **Positive:** one typed, self-documenting schema that humans, CI, the doctor, `env:set` and the agent read the same way; an agent learns which variables are set without opening `.env`; a project variable gets its sensitivity declared once and every tool honours it; a stale shell export now stops the launch by name instead of shadowing `.env` in silence; the launch and the Codex loader are the same mechanism, ready for a secret-manager plugin without another rewrite.
- **Negative / trade-offs:** a second generated artifact to keep fresh (mitigated by the gate); a reliance on an undocumented varlock rule (mitigated by the pin and the pair-load gate); the launcher refuses a session that `dotenv -o` used to fix silently, so a developer whose shell exports a differing value must `unset` it first; a launch outside the wrappers (bare binary, direnv) keeps varlock's precedence with no preflight; `--agent` output leaks a two-character prefix of each sensitive value.
- **Neutral / follow-ups:** a secret-manager provider (1Password plugin behind an optional import) is the next unit, shared with the QA boilerplate; wrapping the Claude Code and OpenCode MCP servers in `varlock run --filter` and retiring the `harness:env` surfaces needs the standalone binary on PATH and comes after it; `.envrc` keeps its POSIX loader (no value-printing `varlock load --format shell`); no `@generateTsTypes` until something reads the typed `ENV`.

## Alternatives considered

- **Keep `dotenv -o` for launches and use varlock only to validate** — rejected: two loaders with opposite precedence, and the secret-manager path needs `varlock run` at launch anyway.
- **`varlock run` with no preflight** — rejected by the conductor ruling: measured on the conductor's own machine, a shell exported an `ATLASSIAN_API_TOKEN` that differed from `.env`, which `varlock run` would have used in silence.
- **Mark the Supabase and Atlassian variables `@required`** — rejected: a fresh clone, CI and a fork PR hold none of them; the requirement belongs to the code path that reads them.
- **Hand-written `.env.schema` parsed back into the manifest** — rejected: needs an env-spec parser in `cli/`; the manifest keeps the routing fields env-spec has no decorator for.

## References

- `cli/lib/env-schema.ts` (layout rule, pair-load gate, `schemaClassification`, `inheritedOverrides`), `scripts/env-schema.ts`, `scripts/launch.ts`, `scripts/check-vars.ts` (rule 5), `scripts/env-set.ts`.
- `.agents/skills/agentic-dev-core/references/secret-hygiene.md`, `.agents/instructions/agent-critical-rules.md` §1, `.agents/instructions/agent-harnesses.md` §5.5.
- agentic-qa-boilerplate `.context/ADR/ADR-0003-env-schema-owner-varlock.md` and `ADR-0005-validation-scope.md` (the decisions this ports).
- varlock docs: https://varlock.dev/reference/item-decorators, https://varlock.dev/reference/cli/load-and-run, https://varlock.dev/guides/ai-tools.
