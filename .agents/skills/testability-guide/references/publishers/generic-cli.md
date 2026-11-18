# Publisher: Generic CLI-Reachable Tool

Runs when the Q1 answer is `Other CLI-reachable tool` and the user named a destination and its CLI (for example `op` for 1Password, `bw` for Bitwarden, `vault` for HashiCorp Vault, or a custom internal `qa-secrets push` binary).

Tool: the user-named CLI binary. The skill probes `which <cli>` at runtime.

Body: `references/credentials-content-template.md`.

## When to prefer it

Choose the CLI over an MCP when:

- The destination's CLI is more capable than its MCP, or there is no MCP.
- The CLI is already in the team's workflow and the user trusts it.
- The CLI exists in CI/CD and the team wants the same path locally.

## Adapter contract

1. Verify the CLI is installed: `which <cli>` returns a path and `<cli> --version` exits 0.
2. Verify auth with the CLI's `whoami`, `status` or equivalent. On failure, stop and tell the user to authenticate the CLI themselves. The skill never scrapes their credentials.
3. Identify the create or write subcommand. Common patterns:
   - `<cli> create <type> --file body.md`
   - `<cli> push --title "…" --content "$(cat body.md)"`
   - `<cli> secret put <name> --from-file body.md`

   When the subcommand is not obvious, the user names it. Do not guess: a guessed subcommand can write somewhere unintended.
4. Run it and capture stdout and stderr. The CLI usually echoes the destination URL or an item ID on success.
5. Check access gating. Many CLIs publish to whatever default scope they were authenticated with. If that scope is broader than the QA group, tell the user and ask them to narrow it before continuing.

## Before publishing

1. The CLI binary is on `PATH`.
2. The CLI is authenticated (an idempotent status check).
3. The user named the destination location (vault path, secret name or page slug). Do not derive it.
4. Run the `security-rules.md` checklist.
5. For password and secret managers (1Password, Bitwarden, Vault), the artifact body holds placeholders, not real passwords. The user fills in the real values inside the destination tool, and the CLI publishes only the placeholders and structure.

## Create flow (template)

```bash
<cli> <create-subcommand> \
  --title "{{PROJECT_NAME}}: QA Testing Credentials (DB / API / UI)" \
  --file /tmp/qa-credentials-body.md \
  --vault "<user-named>" \
  --tags qa,testing,credentials
```

Replace the flags with the CLI's real flag names. The user supplies them when naming the destination.

## Update flow (artifact exists)

1. Compare `content-hash` and skip the update if it is unchanged.
2. Call the CLI's `update`, `edit` or `put` subcommand against the item ID in the snapshot.
3. If the CLI has no update, delete and recreate, accept the new ID and update the snapshot.

## Secret managers

For 1Password (`op`), Bitwarden (`bw`) and HashiCorp Vault (`vault`), the CLI typically creates a "secure note" or "secret" item, and the body lives inside it. Ideally each credential snippet becomes its own field in the item, so the manager's UI renders a copy button per field instead of one giant note. Split the snippets into named fields and put the section headings in the item's notes section. A single secure note is simpler and the body works there as-is.

Ask the user which mode they want when the CLI is one of these well-known managers.

## What this adapter does not do

- It does not install the CLI. The skill adds no dependencies.
- It does not scrape the CLI's credentials. If auth fails, the user authenticates manually.
- It does not use the CLI's interactive mode. Unattended runs use flags and files.
- It does not swallow CLI errors. Every non-zero exit goes to the user.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `which <cli>` is empty | Not installed | Fall through to `publishers/manual-paste.md` and tell the user to install it. |
| CLI returns an auth error | Token expired | Stop and ask the user to authenticate through the CLI's native flow. |
| CLI has no update or edit subcommand | Capability gap | Delete and recreate, and update the snapshot's `credentials-source`. |
| CLI's default scope is too broad | Workspace-wide write | Stop and ask the user to scope it to the QA group before publishing. |

## After publish

1. Set the snapshot's `credentials-source` to the URL or item ID the CLI returned.
2. Update the `/qa` page's credentials CTA `href`. If the destination has no web URL (a Vault path, for example), point the CTA at a per-team runbook that explains how to fetch it through the CLI.
3. Re-run §verification.

## Without a person present

Writing to the destination is an outward write. A routine publishes only when its brief covers it, and the brief also names the destination location and the subcommand this file asks the user for. Without a covering brief, the routine stops before the write, saves the body as the `manual-paste.md` handover and reports the destination. An auth error ends the publish step with a report. A supervised worker sends each question to its launcher. The full table is in `SKILL.md` §"With nobody at the keyboard"; the rule is `agentic-dev-core/references/decision-protocol.md`.

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- MCP alternative: `references/publishers/generic-mcp.md`
- Manual fallback: `references/publishers/manual-paste.md`
