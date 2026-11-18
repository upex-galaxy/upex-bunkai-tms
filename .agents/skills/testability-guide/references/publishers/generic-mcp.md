# Publisher: Generic MCP-Reachable Tool

Runs when the Q1 answer is `Other MCP-reachable tool` and the user named a destination (for example Linear, GitBook, an internal wiki, 1Password Connect, or a custom secrets-store MCP).

Tool: the user-named MCP. The skill probes the configured MCP list at runtime.

Body: `references/credentials-content-template.md`.

## When to prefer it

Use this adapter when the destination has an MCP in the host's config but no dedicated adapter in this folder. It knows nothing about the destination's API in advance, so it works from the MCP's own tool schema.

## Adapter contract

1. Identify the MCP. Read `.mcp.json` (or the host's MCP config) and match the user-named destination against the configured servers. With no match, switch to `publishers/manual-paste.md` and tell the user which MCPs are configured.
2. Inspect the MCP's tools. Call its `list_tools`, or use its documentation in the server config, to find a "create page", "create document", "create note" or "create issue" tool.
3. Map the body. Most MCPs accept Markdown directly. If the destination needs HTML, Confluence storage format or custom XML, ask the user to confirm the conversion or to point at a `body_format` parameter.
4. Check access gating. Tell the user the access scope the new artifact will have, and refuse to publish if the scope is `public` or `anyone with link`.

## Before publishing

1. The user named the destination tool explicitly (for example "Linear" or "GitBook"). Do not infer it.
2. The MCP for that tool is in the host's MCP config.
3. The MCP authenticates, with no `401` or `403` on a list call. On failure, stop, fix the env var and restart the session (Critical Rule 9).
4. The user named the parent location (workspace, project, space or team). Do not guess it.
5. Run the `security-rules.md` checklist.

## Create flow (template)

```text
mcp__<TOOL_NAME>__<CREATE_TOOL>(
  <parent_field>: "<user-supplied parent>",
  <title_field>: "{{PROJECT_NAME}}: QA Testing Credentials (DB / API / UI)",
  <body_field>: <rendered credentials-content body>,
  <permissions_field>: <restrict to QA group>,
)
```

Replace the placeholders with the MCP's real tool name and parameter names, which the orchestrator reads from the MCP's exposed schema (through `ToolSearch`, or `list_tools` when the runtime exposes one).

## Update flow (artifact exists)

1. Compare `content-hash` and skip the update if it is unchanged.
2. Use the MCP's "update" or "edit" tool. If the MCP exposes only `create` and `delete`, leave the old artifact, create a new one and point the snapshot's `credentials-source` at it. The audit trail matters more than tidiness.

## What this adapter does not do

- It does not install an MCP. The skill adds no dependencies, MCP servers included.
- It does not cache MCP credentials. Critical Rule 9 applies: env vars are cached at MCP-spawn time.
- It does not translate the body to a destination format unless the destination genuinely cannot render Markdown. When unsure, ask the user.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Named MCP is not in config | Not installed | Fall through to `publishers/manual-paste.md`. Tell the user how to install it if they want automation. |
| MCP returns 401 or 403 | Expired token | Stop, fix the env var, restart the session. |
| MCP exposes no "create page or document" tool | Wrong destination class (for example a read-only MCP) | Fall through to manual paste and say why. |
| Artifact created but the body renders broken | Destination needed format conversion | Convert and update. If the destination format is opaque, ask the user for the right adapter. |

## After publish

1. Set the snapshot's `credentials-source` to the destination's URL. The MCP usually returns it; ask the user if it does not.
2. Update the `/qa` page's credentials CTA `href`.
3. Re-run §verification.

## Without a person present

Creating or updating an artifact through an MCP is an outward write. A routine publishes only when its brief covers it, and the brief also names the destination tool and parent location this file asks the user for. Without a covering brief, the routine stops before the write, saves the body as the `manual-paste.md` handover and reports the destination. A `401` or `403` ends the publish step with a report naming the env variable and the restart. A supervised worker sends each question to its launcher. The full table is in `SKILL.md` §"With nobody at the keyboard"; the rule is `agentic-dev-core/references/decision-protocol.md`.

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- CLI alternative: `references/publishers/generic-cli.md`
- Manual fallback: `references/publishers/manual-paste.md`
