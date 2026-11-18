# Publisher: Confluence Page

Runs when the Q1 answer is `Confluence page`.

Tool: `[KNOWLEDGE_BASE_TOOL]` per `.agents/instructions/agent-tool-resolution.md` §6, which resolves to `/acli` Confluence subcommands when available and to the Atlassian MCP otherwise. This file says when and what to publish. For exact syntax, auth and flags, load `.agents/skills/acli/SKILL.md` §Confluence.

Body: `references/credentials-content-template.md`.

## When to prefer it

Pick Confluence over a Jira Epic when:

- The team's testing docs already live in Confluence, so the QA group will look for this artifact next to them.
- The page will host inline screenshots, embedded diagrams or rich macros (Jira issue lists, a table of contents).
- Permissions need page-level granularity beyond what a Jira Epic offers.

## Before publishing

1. Confirm `[KNOWLEDGE_BASE_TOOL]` is authenticated and has Confluence access, using the tier's auth-check operation (for example, listing accessible spaces succeeds). The owning skill has the exact command.
2. Ask the user for the Confluence space key and wait. Do not guess it or read it from config. Use it inline as `<SPACE_KEY>`.
3. Ask for the parent page ID, or accept the space root if the user says so, and wait. Use it inline as `<PARENT_PAGE_ID>`.
4. Run the `security-rules.md` checklist.
5. Read the snapshot's `credentials-source`. If it holds a previous page URL, update that page.
6. Update flow only: if `credentials-source` did not capture the page ID, ask the user for it and wait. Use it inline as `<PAGE_ID>`.

## Create flow (no previous page)

1. Build the credentials-content body.
2. Convert the markdown to Confluence storage format (XHTML), or use the tier's built-in markdown adapter when it has one. The `Code Block` macro is the target that matters: it renders a copy button per snippet.

   Before writing rich-text fields in Jira or Confluence, read `.agents/skills/product-management/references/jira-publishing-gotchas.md` for the two known ADF bugs and their workarounds.
3. Invoke the create-page operation:

   ```text
   [KNOWLEDGE_BASE_TOOL] create_page(
     space        = "<SPACE_KEY>",
     title        = "{{PROJECT_NAME}}: QA Testing Credentials (DB / API / UI)",
     parent       = "<PARENT_PAGE_ID>",
     body_source  = /tmp/qa-credentials-body.confluence,  # storage XHTML or markdown per tier
   )
   ```

   For exact tier syntax (CLI flags or MCP tool inputs), load `.agents/skills/acli/SKILL.md` §Confluence.
4. Capture the returned page URL.
5. Apply view restrictions to the QA group.

## Update flow (page exists)

1. Build the new body.
2. Compare `content-hash` and skip the update if it is unchanged.

   The `jira-publishing-gotchas.md` note from the create flow applies here too.
3. Invoke the update-page operation:

   ```text
   [KNOWLEDGE_BASE_TOOL] update_page(
     page_id      = "<PAGE_ID>",
     body_source  = /tmp/qa-credentials-body.confluence,
     bump_version = true,
   )
   ```

   For exact tier syntax, load `.agents/skills/acli/SKILL.md` §Confluence.
4. Add a brief comment on the page noting the change.

## Storage-format gotchas

Needed only when the tier requires storage XHTML. If the primary tier already converts markdown to storage format, skip manual conversion.

| Markdown | Storage format | Why |
| --- | --- | --- |
| `code` | `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[…]]></ac:plain-text-body></ac:structured-macro>` | The `code` macro renders the copy button. Plain `<pre>` does not. |
| Tables | `<table><tbody><tr><th>…</th></tr>…</tbody></table>` | Standard HTML tables work. |
| Code language hint | `<ac:parameter ac:name="language">bash</ac:parameter>` inside the macro | Syntax highlighting. Optional. |

## Tier degradation

When the primary tier (CLI) lacks page CRUD (for example, the bundled Confluence CLI is on a version where `page` is read-only) or is unauthenticated, degrade to the fallback tier per `.agents/instructions/agent-tool-resolution.md` §6:

1. Re-invoke the same `[KNOWLEDGE_BASE_TOOL] create_page` or `update_page` operation against the fallback tier (Atlassian MCP).
2. The body format depends on what the tier accepts. An MCP-based tier usually takes markdown directly.
3. The same content-hash check and permission gating apply on either tier.
4. Log the degradation in the workflow output (`tool_layer: primary | fallback`) so the user can see which tier ran.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Tier cannot find the space | Wrong space key | Ask the user. Do not create a space. |
| Page created but code blocks have no copy button | `<pre>` used instead of the `code` macro | Re-convert and update the page. |
| View restrictions can't be applied | Account lacks `space admin` | Tell the user and recommend escalating to a workspace admin. |
| Tier returns 401 or 403 | Expired token | Stop, fix the env var, restart the session (Critical Rule 9). |

## After publish

1. Set the snapshot's `credentials-source` to the Confluence page URL.
2. Update the `/qa` page's credentials CTA `href`.
3. Re-run §verification.

## Without a person present

Creating or updating a Confluence page is an outward write. A routine publishes only when its brief covers it, and the brief also supplies `<SPACE_KEY>`, `<PARENT_PAGE_ID>` and `<PAGE_ID>`. Without a covering brief, the routine stops before the write, saves the body as the `manual-paste.md` handover and reports the destination. A supervised worker sends each question to its launcher. The full table is in `SKILL.md` §"With nobody at the keyboard"; the rule is `agentic-dev-core/references/decision-protocol.md`.

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Snapshot field updated: `credentials-source`
