# Publisher — Notion Page

> **When this adapter runs**: Q1 answered with `Notion page`.
>
> **Tool**: Notion MCP if installed (e.g. `mcp__notion__create_page` or the Notion server's equivalent). Falls back to manual paste if no Notion MCP exists.
>
> **Body**: `references/credentials-content-template.md`.

---

## When to prefer Notion

- Team uses Notion as the source of truth for engineering docs.
- The QA group has a Notion workspace where this artifact will live next to runbooks, oncall pages, and onboarding docs.
- The team values Notion's database / inline-link features over Jira / Confluence formatting.

---

## Pre-publish checks

1. List configured MCPs (`.mcp.json`, `opencode.jsonc`, or the host's MCP config file).
2. Detect a Notion MCP. Common server names: `notion`, `notion-mcp`, `mcp-notion-server`.
3. If no Notion MCP is configured → switch to `publishers/manual-paste.md` and tell the user.
4. If a Notion MCP IS configured but returns `401` / `403` → STOP, fix env var, restart session (CLAUDE.md Rule #11). Do NOT silently fall back to manual paste — that hides the real auth issue.
5. Ask the user for the Notion parent page ID (or database ID). STOP and wait for the answer; do NOT guess or derive it. Use it inline as `<NOTION_PARENT_PAGE_ID>`.
6. Run `security-rules.md` checklist.

---

## Create flow (no previous page)

1. Build the credentials-content body.
2. Notion MCPs typically accept Markdown directly — no conversion needed.
3. Create the page:

```
mcp__notion__create_page(
  parent: { type: "page_id", id: "<NOTION_PARENT_PAGE_ID>" },
  title: "{{PROJECT_NAME}} — Credenciales de Acceso para Testing (DB / API / UI)",
  body: <rendered credentials-content body>
)
```

4. Capture the returned page URL.
5. Set sharing to specific people (the QA group). Notion's permission model is share-based, not group-based — surface this to the user if the workspace lacks a `QA` group concept.

---

## Update flow (page exists)

1. Build the new body. Compare `content-hash`. Skip if unchanged.
2. Append a new block or replace the page body via the MCP's update tool. Notion's "edit page" semantics vary by MCP — read the available tool's docs.
3. Add a one-line callout block noting the change date.

---

## Code-block rendering

- Notion's native code blocks render copy buttons.
- One credential per code block — same rule as Jira / Confluence.
- Language tag (`bash`, `json`, etc.) drives syntax highlighting. Set it per block.

---

## Failure modes

| Symptom                                  | Cause                                       | Fix                                                                                              |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| MCP not in the configured list           | Notion MCP not installed                    | Fall through to `publishers/manual-paste.md` + tell user how to install if they want automation. |
| MCP returns 401 / 403                    | Expired Notion integration token            | STOP, fix env var, restart session.                                                              |
| Page created but is publicly accessible  | Default sharing was `everyone in workspace` | Surface to user, ask them to scope to QA group manually.                                         |
| Code blocks render without language hint | Adapter sent plain text                     | Re-render with the `language` parameter populated.                                               |

---

## After publish

1. Set the snapshot's `credentials-source` to the Notion page URL.
2. Update the `/qa` page's credentials CTA `href`.
3. Re-run §verification.

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Manual fallback: `references/publishers/manual-paste.md`
