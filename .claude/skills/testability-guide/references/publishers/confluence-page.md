# Publisher — Confluence Page

> **When this adapter runs**: Q1 answered with `Confluence page`.
>
> **Tool**: `[KNOWLEDGE_BASE_TOOL]` per `CLAUDE.md` §6. Resolves to `/acli` Confluence subcommands when available, Atlassian MCP otherwise. This adapter owns the WHEN/WHAT — for the HOW (exact syntax, auth, flags), load `.claude/skills/acli/SKILL.md` §Confluence.
>
> **Body**: `references/credentials-content-template.md`.

---

## When to prefer Confluence over Jira Epic

- Team's testing docs already live in Confluence. The QA group expects to find this artifact next to existing docs.
- The page will host inline screenshots, embedded diagrams, or rich macros (Jira issue lists, table-of-contents).
- Permissions need page-level granularity beyond what a Jira Epic offers.

---

## Pre-publish checks

1. Confirm `[KNOWLEDGE_BASE_TOOL]` is authenticated AND has Confluence access via the tier's auth-check operation (e.g. listing accessible spaces succeeds). Load the owning skill for the exact command.
2. Ask the user for the Confluence space key. STOP and wait for the answer; do NOT guess or read from any config. Use it inline as `<SPACE_KEY>`.
3. Ask the user for the parent page ID (or accept root-of-space if the user says so). STOP and wait. Use it inline as `<PARENT_PAGE_ID>`.
4. Run `security-rules.md` checklist.
5. Check the snapshot's `credentials-source` for a previous page URL. If yes → UPDATE that page.
6. Update flow only: if the snapshot's `credentials-source` did not capture the page ID, ask the user for it. STOP and wait. Use it inline as `<PAGE_ID>`.

---

## Create flow (no previous page)

1. Build the credentials-content body.
2. Convert generic markdown → Confluence storage format (XHTML) OR use the tier's built-in markdown adapter when available. The `Code Block` macro is the must-have target — it renders a copy button per snippet.
> Before writing rich-text fields in Jira / Confluence, read `.claude/skills/product-management/references/jira-publishing-gotchas.md` for the two known ADF bugs and their workarounds.

3. Invoke the create-page operation:

   ```text
   [KNOWLEDGE_BASE_TOOL] create_page(
     space        = "<SPACE_KEY>",
     title        = "{{PROJECT_NAME}} — Credenciales de Acceso para Testing (DB / API / UI)",
     parent       = "<PARENT_PAGE_ID>",
     body_source  = /tmp/qa-credentials-body.confluence,  # storage XHTML or markdown per tier
   )
   ```

   For exact tier syntax (CLI flags vs MCP tool inputs), load `.claude/skills/acli/SKILL.md` §Confluence.
4. Capture the returned page URL.
5. Apply view restrictions to the QA group.

---

## Update flow (page exists)

1. Build the new body.
2. Compare `content-hash`. Skip if unchanged.
> Before writing rich-text fields in Jira / Confluence, read `.claude/skills/product-management/references/jira-publishing-gotchas.md` for the two known ADF bugs and their workarounds.

3. Invoke the update-page operation:

   ```text
   [KNOWLEDGE_BASE_TOOL] update_page(
     page_id      = "<PAGE_ID>",
     body_source  = /tmp/qa-credentials-body.confluence,
     bump_version = true,
   )
   ```

   For exact tier syntax, load `.claude/skills/acli/SKILL.md` §Confluence.
4. Add a brief comment on the page noting the change.

---

## Storage-format gotchas (when the tier requires storage XHTML)

| Markdown           | Storage format                                                                                                     | Why                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `code`             | `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[…]]></ac:plain-text-body></ac:structured-macro>` | The `code` macro renders the copy button. Plain `<pre>` does not. |
| Tables             | `<table><tbody><tr><th>…</th></tr>…</tbody></table>`                                                               | Standard HTML tables work.                                        |
| Code language hint | `<ac:parameter ac:name="language">bash</ac:parameter>` inside the macro                                            | Syntax highlighting. Optional.                                    |

If the primary tier already handles the markdown→storage conversion → skip manual conversion entirely.

---

## Tier degradation

If the primary tier (CLI) lacks page CRUD (e.g. the bundled Confluence CLI is on a version where `page` is read-only) or is unauthenticated, degrade to the fallback tier per `CLAUDE.md` §6:

1. Re-invoke the same `[KNOWLEDGE_BASE_TOOL] create_page` / `update_page` operation against the fallback tier (Atlassian MCP).
2. The body format depends on the tier's accepted input — usually accepts markdown directly when the tier is MCP-based.
3. Same content-hash check + permission gating applies regardless of tier.
4. Log the degradation in the workflow output (`tool_layer: primary | fallback`) so the user can see which tier ran.

---

## Failure modes

| Symptom                                                 | Cause                                    | Fix                                                         |
| ------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Tier cannot find the space                              | Wrong space key                          | Ask user. Do NOT auto-create a space.                       |
| Page created but code blocks render without copy button | Used `<pre>` instead of the `code` macro | Re-convert + update the page.                               |
| View restrictions can't be applied                      | Account lacks `space admin`              | Surface to user. Recommend escalating to a workspace admin. |
| Tier returns 401 / 403                                  | Expired token                            | STOP, fix env var, restart session. CLAUDE.md Rule #11.     |

---

## After publish

1. Set the snapshot's `credentials-source` to the Confluence page URL.
2. Update the `/qa` page's credentials CTA `href`.
3. Re-run §verification.

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Snapshot field updated: `credentials-source`
