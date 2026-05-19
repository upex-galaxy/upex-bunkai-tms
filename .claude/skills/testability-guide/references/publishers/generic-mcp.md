# Publisher — Generic MCP-Reachable Tool

> **When this adapter runs**: Q1 answered with `Other MCP-reachable tool` and the user named a specific destination (e.g. Linear, GitBook, an internal wiki, 1Password Connect, a custom secrets-store MCP).
>
> **Tool**: the user-named MCP. The skill probes the configured MCP list at runtime.
>
> **Body**: `references/credentials-content-template.md`.

---

## Adapter contract

This adapter is intentionally generic. It does not know the destination tool's API in advance. The orchestrator follows this contract:

1. **Identify the MCP.** Read `.mcp.json` (or the host's MCP config). Match the user-named destination against configured MCP servers. If no match → switch to `publishers/manual-paste.md` and tell the user which MCPs are configured.
2. **Inspect the MCP's tools.** Call the MCP's `list_tools` (or rely on the MCP's documentation in its server config) to find a "create page" / "create document" / "create note" / "create issue" tool.
3. **Map the body.** Most MCPs accept Markdown directly. If the destination needs HTML, Confluence storage format, or some custom XML → ask the user to confirm the conversion or to point at a `body_format` parameter.
4. **Validate access gating.** Most destinations have a permission model. Surface to the user the access scope the new artifact will have. Refuse to publish if scope is `public` / `anyone with link`.

---

## Pre-publish checks

1. The user named the destination tool explicitly (e.g. "Linear", "GitBook"). Do NOT infer.
2. The MCP for that tool is in the host's MCP config.
3. The MCP authenticates (no `401` / `403` on a list call). On failure → STOP, fix env var, restart session.
4. The user named the parent location (workspace / project / space / team). Do NOT guess.
5. Run `security-rules.md` checklist.

---

## Create flow (template)

```
mcp__<TOOL_NAME>__<CREATE_TOOL>(
  <parent_field>: "<user-supplied parent>",
  <title_field>: "{{PROJECT_NAME}} — Credenciales de Acceso para Testing (DB / API / UI)",
  <body_field>: <rendered credentials-content body>,
  <permissions_field>: <restrict to QA group>,
)
```

Replace the placeholders with the MCP's actual tool name + parameter names. The orchestrator reads them from the MCP's exposed schema (via `ToolSearch` or the MCP's `list_tools` if the runtime exposes one).

---

## Update flow (artifact exists per snapshot)

1. Compare `content-hash`. Skip if unchanged.
2. Use the MCP's "update" / "edit" tool. If the MCP only exposes `create` and `delete`, prefer leaving the old artifact + creating a new one + flipping the snapshot's `credentials-source` (audit trail wins over tidiness).

---

## What this adapter explicitly does NOT do

- It does NOT install a new MCP. The skill never adds dependencies — that includes MCP servers.
- It does NOT cache MCP credentials. CLAUDE.md Rule #11 (env vars cached at MCP-spawn time) applies.
- It does NOT auto-translate the body to a destination-specific format unless the destination genuinely cannot render Markdown. When unsure → ask the user.

---

## Failure modes

| Symptom                                      | Cause                                        | Fix                                                                                             |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Named MCP is not in config                   | Not installed                                | Fall through to `publishers/manual-paste.md`. Tell user how to install if they want automation. |
| MCP returns 401 / 403                        | Expired token                                | STOP, fix env var, restart session.                                                             |
| MCP exposes no "create page / document" tool | Wrong destination class (e.g. read-only MCP) | Fall through to manual paste; surface why.                                                      |
| Artifact created but body renders broken     | Destination needed format conversion         | Convert + update; if the destination format is opaque, ask the user for the right adapter.      |

---

## After publish

1. Set the snapshot's `credentials-source` to the destination's URL (the MCP usually returns it; ask the user if not).
2. Update the `/qa` page's credentials CTA `href`.
3. Re-run §verification.

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- CLI alternative: `references/publishers/generic-cli.md`
- Manual fallback: `references/publishers/manual-paste.md`
