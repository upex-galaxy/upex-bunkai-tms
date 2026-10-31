# ADR-0011 — Secret values live in `.env` by default; a secret manager is the advanced, provider-agnostic opt-in

- **Status:** Accepted (decision item 4's launcher drop superseded by ADR-0016)
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): env-secrets spike owner decisions OD1 = b (`.env` stays the default, a secret manager is the ADVANCED option) and OD2 (a personal plan must work too; never 1Password-only, the slot stays generic). Conductor ruling of the implementation fleet on the Critical Rule #1 wording (the readable exception becomes "`.env.example` and the committed `.env*.schema` files"). Ported from agentic-qa-boilerplate ADR-0010 (PR #110) by unit env-d-u4
- **Tags:** env, secrets, varlock, launch, ci, onboarding
- **Supersedes:** —
- **Superseded by:** ADR-0016 (decision item 4, the launcher's drop of empty inherited overlay keys, only)

---

## Context

ADR-0010 gave varlock the env schema (`.env.schema` + the generated `.env.core.schema`) and put it behind every harness launch (`scripts/launch.ts` -> `varlock run`). The values still came from one place: a plaintext `.env` (and `.env.local`) on each laptop, and one secret per variable wherever CI needs them. The env-secrets spike proposed resolving secrets from a manager at launch time through a varlock plugin, so a team shares one vault instead of passing values around, and a laptop on desktop-app auth holds no plaintext secret.

Two owner decisions frame the change:

1. **OD1 = b.** `.env` stays the DEFAULT. A fresh clone, an offline laptop, a project without a paid manager all keep working with nothing new to install. The manager is the advanced option a project opts into.
2. **OD2.** The team model is a shared project vault (`<project>-dev`) plus one CI service account. A personal 1Password plan must work too (desktop-app auth, personal vault), knowing it cannot serve CI. And 1Password must never be the only option: the hook is generic, so another varlock-supported manager plugs in the same way.

Measured in agentic-qa on the same varlock pin (1.20.0) with `@varlock/1password-plugin@2.0.4` and a stand-in `op` CLI (report `env-q-u3`, probes E1-E7), and re-checked here where noted:

- An overlay imported with `@import(<file>, allowMissing=true)` changes nothing when absent (re-checked here: `bun run vars:schema:check` loads the pair through varlock with the import in place), and its own root decorators (`@plugin`, `@initOp`) work when imported.
- An overlay item wins over the empty core declaration and over a project re-declaration with an empty value. A NON-empty value in `.env.local` / `.env`, or an inherited variable, wins over the vault, and the vault is not asked for that item (lazy resolution).
- An EMPTY inherited variable also wins and blanks the item. GitHub Actions renders every unset `secrets.X` as an empty string.
- `-p <file>` drops the `.env.local` ladder; `-p <dir>/` keeps it.
- With a pinned version and no `node_modules` copy, varlock fetches an `@varlock/*` plugin from npm into `~/.varlock/plugins-cache` without a prompt.

## Decision

We will keep `.env` / `.env.local` as the default home of every value and offer a secret manager as an opt-in overlay with one generic slot:

1. **The slot.** `.env.core.schema` (generated, synced) imports `./.env.provider.schema` with `allowMissing=true`. A project without the file loads exactly as before. The overlay is COMMITTED: it holds references (`op(op://<vault>/<VAR>/password)`), never a value, so Critical Rule #1's readable exception is "`.env.example` and the committed `.env*.schema` files", and `opencode.jsonc` allows reading `*.env.schema` / `*.env.*.schema`.
2. **The choice.** `.agents/project.yaml` `secrets.provider: local | 1password` (default `local`), plus `secrets.onepassword.{vault, account, auth: app | service-account}`. `bun run setup` keeps `.env` first and offers the manager as the advanced option at Step 7; choosing it writes the overlay once (never over an existing one) and records the choice. A project whose yaml predates the block gets it appended, comments intact.
3. **The provider.** 1Password is the first and only shipped adapter (`cli/lib/secret-providers.ts`): plugin pinned EXACTLY (`@varlock/1password-plugin@2.0.4`, no devDependency), `@initOp(token=$OP_SERVICE_ACCOUNT_TOKEN, allowAppAuth=<auth == app>)`, one Password item per variable titled with the variable NAME. Every per-variable line is written commented; the human uncomments what the vault holds.
4. **CI beside, never instead.** A job passes `OP_SERVICE_ACCOUNT_TOKEN` NEXT TO any per-variable secrets. The launcher drops the empty inherited copy of every key the overlay resolves before the preflight and before varlock, so an unset per-variable secret cannot blank a vault value (nor trip the precedence preflight), and a set one still wins. The boilerplate's own `ci.yml` passes no secrets, so it carries no token; a project wires it in the workflows it adds.
5. **Another provider** = one more id in `SECRET_PROVIDERS` and one `ProviderAdapter`. File name, import, launcher rule and CI wiring stay. varlock 1.20.0 ships plugins for AWS Secrets Manager, Azure Key Vault, Bitwarden, Dashlane, Doppler, Google Secret Manager, HashiCorp Vault, Infisical, Akeyless, KeePass, Keeper, Passbolt, Proton Pass and Pass, plus a built-in macOS Keychain (`node_modules/varlock/skills/varlock/SKILL.md`, "Plugins"); the list lives in `SUPPORTED_ELSEWHERE`.

## Consequences

- **Positive:** a team onboards a person by granting vault access instead of sending values; a laptop on desktop-app auth holds no plaintext secret; the overlay reads like the schema it extends, so the AI can open it (references only); a project that never opts in sees one inert import line, and an existing project gains the hook through `bun run up` (the core schema and `cli/` are synced) without editing its own `.env.schema`.
- **Negative / trade-offs:** only launches through varlock read the vault (`bun run claude|codex|opencode`, the Codex MCP loader); direnv, `source .env` and `bun run harness:env` read `.env` alone, so a desktop-launched Claude Code or OpenCode session sees a vault-only key as empty. A teammate without vault access must put a non-empty value in `.env.local` for every active overlay item, or the load fails on those items (clear error, item by item). Desktop-app auth runs `op` in the preflight and again in `varlock run`, so a cold app may prompt twice; `cacheTtl` on `@initOp` is the documented relief, not set by default. The first load downloads the plugin from npm. The personal plan cannot serve CI.
- **Neutral / follow-ups:** the real `op` + desktop-app path and a CI run with only the service-account token are owner actions (a vault, a service account and a repository secret this repo does not have). `bun run setup:doctor` does not report the provider state yet.

## Alternatives considered

- **1Password-first onboarding with `.env` as fallback** (the spike's OD1 recommendation) — overridden by the owner: it makes a paid account and an app the first step for every new project.
- **`op run --env-file` wrapper** — a second source of truth beside the varlock schema, 1Password-only.
- **Passing the overlay with `varlock run -p`** — measured in agentic-qa: `-p <file>` silently drops `.env.local`.
- **The import line in the project-owned `.env.schema`** — works, but `.env.schema` is delivered once, so every existing project would have to edit its own file; the synced core gets the hook to all of them through `bun run up`.
- **The plugin as a devDependency** — every clone would install the 1Password SDK to support an option most projects never enable.

## References

- ADR-0010 (varlock owns the env schema and the launch).
- agentic-qa-boilerplate ADR-0010 and PR #110 (the source of this port).
- varlock.dev/plugins/1password; the plugin README in `@varlock/1password-plugin@2.0.4`.
- `cli/lib/secret-providers.ts`, `cli/lib/env-schema.ts`, `scripts/launch.ts`, `cli/install.ts` (Step 7), `INSTALLER.md` ("Secret manager (advanced)").
