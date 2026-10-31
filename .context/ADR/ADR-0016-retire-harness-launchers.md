# ADR-0016 — Retire the harness launch scripts: a harness opens as its bare binary, no secret enters its process

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): decision B13 of handoff 07 (2026-10-05), "retire `bun run claude|codex|opencode` harness launcher scripts in both repos; opening a harness needs no script at all (terminal or desktop); `scripts/launch.ts` stays only for test/tooling scripts; no secret reaches the AI shell", in the owner's words a launch through those scripts "should not be possible, should not be necessary at all". Same decision record: B3 (a credential proxy) cancelled as superseded by B8 + B13. Conductor ruling of the parity fleet for this repo: `scripts/launch.ts` is deleted outright, because no test or tooling script here runs through it. Twin unit in agentic-qa-boilerplate: b13-q. Ported here by unit b13-d
- **Tags:** secrets, env, launch, harness-compatibility, installer, doctor, updater
- **Supersedes:** ADR-0010 (the decision item "Launch through varlock, behind a precedence preflight"); ADR-0011 (decision item 4, the launcher's drop of empty inherited overlay keys); ADR-0015 (its trade-off line sending a bare harness to `bun run <harness>`)
- **Superseded by:** —

---

## Context

ADR-0010 put the three harnesses behind `bun run claude | codex | opencode`: `scripts/launch.ts` compared every inherited process variable with `.env` / `.env.local`, refused to start on a difference, and otherwise ran `varlock run -- <harness>`. That made the harness process hold every value of `.env`, secrets included, and every command the agent runs inherits that process.

Two later decisions removed every reason to do that. ADR-0012 gave each MCP server its own `.env` loader (`varlock run --filter <its names>`), so a server reads its values whoever launched the harness: terminal, desktop app, or a natively launched supervised worker. ADR-0015 removed the shell autoloader. After both, the launch scripts were the last path that put secrets into the AI's own environment. The sibling QA repository measured the exposure in its b8 unit: an installer run inside a worker session launched that way saw a Slack token in its environment.

In this repository `scripts/launch.ts` had no other consumer: the test and tooling scripts call `bun` directly, so the QA plan of keeping the launcher for test scripts has nothing to keep it for here.

B3, a credential proxy that would have handed secrets to the agent on demand, was cancelled in the same decision record: it would have needed a launcher to sit in front of the harness, it cannot work for a desktop app, and B8 + B13 already reach its goal (no secret in the AI's shell) without one.

## Decision

We will ship no harness launch script. A harness opens as its own binary in the project folder (`claude`, `opencode`, `codex`) or as its desktop app, and its process holds no `.env` value.

- `package.json` loses the `claude`, `codex` and `opencode` scripts; `scripts/launch.ts` and its test are deleted, and so is `withoutEmptyProviderShadows` (`cli/lib/secret-providers.ts`), whose only caller was the launcher.
- The launcher's stale-variable preflight is not moved anywhere new. Its check already runs as `bun run vars:env:check` (`scripts/check-vars.ts` rule 5, `inheritedOverrides` in `cli/lib/env-schema.ts`), which is where a stale inherited value is diagnosed now: it still wins over `.env` inside every varlock load, MCP servers included.
- A command the agent runs that needs a `.env` value goes through the loader in a subprocess, `bunx varlock run -- sh -c '<command using "$VAR">'` (`agentic-dev-core/references/secret-hygiene.md` §3). `bun` scripts autoload `.env`.
- A remote (HTTP) MCP server that reads a token from the harness's own environment (`${VAR}`, `{env:VAR}`, `bearer_token_env_var`) gets none on any launch. Prefer the server's OAuth login; a token-only server needs the operator to export that one variable before launching, a choice that puts it in the agent's environment knowingly.
- A CI step that reads a secret manager runs through `varlock run` and passes a per-variable secret only when the job sets it, because an unset GitHub secret renders as `""` and an empty inherited value wins over the vault (the drop ADR-0011 item 4 put in the launcher).
- The installer's closing steps, the doctor's success box and every doc, deck and skill name the bare binary. Supervised workers and human-pasted launch lines are now the same in credential terms; launch lines are the bare binary with its flags.
- The updater never re-adds the scripts (its `package.json` sync appends only keys upstream declares) and never deletes a project's copy: `scripts/launch.ts` is in its `excludePaths`, so not even `--force` removes it, and the parity table reports the scripts and the launcher as removable, one informational row each (`retiredHarnessLaunchers`, `cli/lib/updater-parity.ts`).

## Consequences

- **Positive:** no `.env` value reaches the agent's process or the shell its tool calls run in unless one command asks for it; terminal, desktop and supervised launches behave the same; one script and one helper less to maintain.
- **Negative / trade-offs:** a token-only remote MCP server no longer resolves by default; the stale-variable refusal at launch is gone, so a stale export shows up as an MCP that seems to ignore `.env` until `vars:env:check` is run; a CI job that mixes a vault with per-variable secrets must not pass unset ones.
- **Neutral / follow-ups:** a downstream project keeps its scripts and its `scripts/launch.ts` until its developer deletes them; they still run, and the parity row says why to drop them.

## Alternatives considered

- **Keep `scripts/launch.ts` as a generic `varlock run` wrapper for future tooling scripts** — rejected: no script uses it, so it would be dead code kept for a hypothetical caller.
- **Keep the scripts, launch with an empty environment** — rejected: a script that loads nothing is a longer way to type the binary's name, and the owner's ruling is that the script should not exist.
- **A credential proxy (B3)** — cancelled: needs a launcher in front of the harness, does not work for desktop apps, and the goal is already met.
