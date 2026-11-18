# Publisher: Notion Page

Runs when the Q1 answer is `Notion page`.

Tool: the Notion MCP if installed (for example `mcp__notion__create_page` or the Notion server's equivalent). Without one, fall back to manual paste.

Body: `references/credentials-content-template.md`.

## When to prefer it

- The team uses Notion as the source of truth for engineering docs.
- The QA group has a Notion workspace where this artifact will sit next to runbooks, on-call pages and onboarding docs.
- The team values Notion's database and inline-link features over Jira or Confluence formatting.

## Before publishing

1. List the configured MCPs (`.mcp.json`, `opencode.jsonc`, or the host's MCP config file).
2. Look for a Notion MCP. Common server names are `notion`, `notion-mcp` and `mcp-notion-server`.
3. If none is configured, switch to `publishers/manual-paste.md` and tell the user.
4. If a Notion MCP is configured but returns `401` or `403`, stop, fix the env var and restart the session (Critical Rule 9). Falling back to manual paste here would hide the real auth issue.
5. Ask the user for the Notion parent page ID (or database ID) and wait. Do not guess or derive it. Use it inline as `<NOTION_PARENT_PAGE_ID>`.
6. Run the `security-rules.md` checklist.

## Create flow (no previous page)

1. Build the credentials-content body.
2. Notion MCPs typically accept Markdown directly, so no conversion is needed.
3. Create the page:

   ```text
   mcp__notion__create_page(
     parent: { type: "page_id", id: "<NOTION_PARENT_PAGE_ID>" },
     title: "{{PROJECT_NAME}}: QA Testing Credentials (DB / API / UI)",
     body: <rendered credentials-content body>
   )
   ```

4. Capture the returned page URL.
5. Share the page with specific people (the QA group). Notion permissions are share-based, not group-based, so tell the user if the workspace has no `QA` group concept.

## Update flow (page exists)

1. Build the new body, compare `content-hash`, and skip the update if it is unchanged.
2. Append a block or replace the page body through the MCP's update tool. "Edit page" semantics vary by MCP, so read the tool's docs first.
3. Add a one-line callout block with the change date.

## Code-block rendering

- Notion's native code blocks render copy buttons.
- One credential per code block, the same rule as Jira and Confluence.
- The language tag (`bash`, `json`, and so on) drives syntax highlighting, so set it per block.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| MCP not in the configured list | Notion MCP not installed | Fall through to `publishers/manual-paste.md` and tell the user how to install it if they want automation. |
| MCP returns 401 or 403 | Expired Notion integration token | Stop, fix the env var, restart the session. |
| Page created but publicly accessible | Default sharing was `everyone in workspace` | Tell the user and ask them to scope it to the QA group manually. |
| Code blocks have no language hint | Adapter sent plain text | Re-render with the `language` parameter populated. |

## After publish

1. Set the snapshot's `credentials-source` to the Notion page URL.
2. Update the `/qa` page's credentials CTA `href`.
3. Re-run §verification.

## Without a person present

Creating or updating a Notion page is an outward write. A routine publishes only when its brief covers it, and the brief also supplies `<NOTION_PARENT_PAGE_ID>`. Without a covering brief, the routine stops before the write, saves the body as the `manual-paste.md` handover and reports the destination. A `401` or `403` ends the publish step with a report naming the env variable and the restart. A supervised worker sends each question to its launcher. The full table is in `SKILL.md` §"With nobody at the keyboard"; the rule is `agentic-dev-core/references/decision-protocol.md`.

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Manual fallback: `references/publishers/manual-paste.md`
