# Publisher — Generic CLI-Reachable Tool

> **When this adapter runs**: Q1 answered with `Other CLI-reachable tool` and the user named a specific destination + its CLI (e.g. `op` for 1Password, `bw` for Bitwarden, `vault` for HashiCorp Vault, a custom internal `qa-secrets push` binary).
>
> **Tool**: the user-named CLI binary. The skill probes `which <cli>` at runtime.
>
> **Body**: `references/credentials-content-template.md`.

---

## When CLI > MCP

- The destination's CLI is more capable than its MCP (or there is no MCP).
- The CLI is already in the team's workflow and the user trusts it.
- The CLI exists in CI/CD and the team wants the same path locally.

---

## Adapter contract

1. **Verify the CLI is installed.** `which <cli>` returns a path AND `<cli> --version` exits 0.
2. **Verify auth.** Run the CLI's `whoami` / `status` / equivalent. On failure → STOP. Tell the user to authenticate the CLI manually (do NOT scrape their credentials).
3. **Identify the create / write subcommand.** Common patterns:
   - `<cli> create <type> --file body.md`
   - `<cli> push --title "…" --content "$(cat body.md)"`
   - `<cli> secret put <name> --from-file body.md`
     The user names the subcommand if it is non-obvious. Do NOT guess.
4. **Run it.** Capture stdout / stderr. The CLI usually echoes the destination URL or an item ID on success.
5. **Validate access gating.** Many CLIs publish to whatever default scope the CLI was authenticated with. If that scope is broader than the QA group → surface to the user and ask to narrow before continuing.

---

## Pre-publish checks

1. CLI binary is on `PATH`.
2. CLI is authenticated (idempotent status check).
3. The user named the destination location (vault path, secret name, page slug). Do NOT auto-derive.
4. Run `security-rules.md` checklist.
5. Special case for password / secret managers (1Password, Bitwarden, Vault): the artifact body holds **placeholders**, not real passwords. The user fills the real values in inside the destination tool. The CLI only publishes the placeholders + structure.

---

## Create flow (template)

```bash
<cli> <create-subcommand> \
  --title "{{PROJECT_NAME}} — Credenciales de Acceso para Testing (DB / API / UI)" \
  --file /tmp/qa-credentials-body.md \
  --vault "<user-named>" \
  --tags qa,testing,credentials
```

Replace the flags with the CLI's actual flag names. The user supplies them when naming the destination.

---

## Update flow (artifact exists per snapshot)

1. Compare `content-hash`. Skip if unchanged.
2. Call the CLI's `update` / `edit` / `put` subcommand against the item ID from the snapshot.
3. If the CLI does not support update → delete + recreate, accept the new ID, update the snapshot.

---

## Special case — secret managers

For 1Password (`op`), Bitwarden (`bw`), HashiCorp Vault (`vault`):

- The CLI typically creates a "secure note" or "secret" item. The body lives inside that item.
- Each credential snippet ideally becomes its own FIELD inside the item (so the manager's UI renders the copy button per field), not one giant note. Adapt the body accordingly — split the snippets into named fields, drop the section headings into the item's notes section.
- If the user prefers a single secure-note (simpler), the body works as-is.

Ask the user which mode they want when the CLI is one of the well-known secret managers.

---

## What this adapter explicitly does NOT do

- It does NOT auto-install the CLI. The skill never adds dependencies.
- It does NOT scrape the CLI's credentials. If auth fails, the user authenticates manually.
- It does NOT redirect output through the CLI's interactive mode. Always use flags / files for unattended runs.
- It does NOT swallow CLI errors. Surface every non-zero exit to the user.

---

## Failure modes

| Symptom                               | Cause                | Fix                                                                  |
| ------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `which <cli>` is empty                | Not installed        | Fall through to `publishers/manual-paste.md` + tell user to install. |
| CLI returns auth error                | Token expired        | STOP, ask user to authenticate via the CLI's native flow.            |
| CLI lacks an update / edit subcommand | Capability gap       | Delete + recreate; update snapshot's `credentials-source`.           |
| CLI's default scope is too broad      | Workspace-wide write | STOP, ask user to scope to the QA group before publishing.           |

---

## After publish

1. Set the snapshot's `credentials-source` to the URL or item ID the CLI returned.
2. Update the `/qa` page's credentials CTA `href`. If the destination has no web URL (e.g. a Vault path), point the CTA at a per-team runbook that explains how to fetch it via the CLI.
3. Re-run §verification.

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- MCP alternative: `references/publishers/generic-mcp.md`
- Manual fallback: `references/publishers/manual-paste.md`
