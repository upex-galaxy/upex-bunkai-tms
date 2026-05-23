# Publisher — Jira Epic (default)

> **When this adapter runs**: Q1 answered with `Jira Epic` (or the user accepted the default).
>
> **Tool**: `[ISSUE_TRACKER_TOOL]` per `CLAUDE.md` §6. Resolves to `/acli` primary, Atlassian MCP fallback. This adapter owns the WHEN/WHAT — for the HOW (exact syntax, auth, flags, ADF), load `.claude/skills/acli/SKILL.md` §Jira and §Publishing rich text.
>
> **Body**: `references/credentials-content-template.md`. This adapter ONLY describes how to convert + publish; it does not duplicate content.

---

## Why Jira Epic is the default

- Native `{noformat}` blocks render a copy button on every snippet — perfect for one-credential-per-block.
- `[ISSUE_TRACKER_TOOL]` is already wired in this boilerplate. Auth via API token in `.env`.
- Epic-level permissions can be restricted to the QA group.
- The Epic ID becomes the snapshot's `credentials-source` value, durable across re-runs.

---

## Pre-publish checks

1. Confirm `[ISSUE_TRACKER_TOOL]` is authenticated via the tier's auth-check operation (e.g. listing accessible workspaces succeeds). Load the owning skill for the exact command.
2. Confirm the Jira project key in `.agents/project.yaml` (`project.project_key`). NEVER guess — ask the user if missing.
3. Run `security-rules.md` checklist.
4. Check whether a previous Epic exists (read the snapshot's `credentials-source` field). If yes → UPDATE that Epic, do NOT create a new one.

---

## Create flow (no previous Epic)

1. Build the credentials-content body from the template (`credentials-content-template.md`).
2. Convert generic markdown → Jira wiki markup:
   - `# H1` → `h1.`
   - `## H2` → `h2.`
   - `### H3` → `h3.`
   - `code fence` → `{noformat}…{noformat}` (one block per credential).
   - Markdown tables → Jira table syntax (`||header||header||` / `|cell|cell|`).
3. Create the Epic:

   ```text
   [ISSUE_TRACKER_TOOL] create_issue(
     project          = "{{PROJECT_KEY}}",
     type             = "Epic",
     summary          = "{{PROJECT_NAME}} — Credenciales de Acceso para Testing (DB / API / UI)",
     description_body = /tmp/qa-credentials-body.wiki,
   )
   ```

   For exact tier syntax, load `.claude/skills/acli/SKILL.md` §Jira.
4. Capture the returned Epic key (e.g. `UPEX-321`).
5. **Immediately update the Epic** with the same body via the same tier's update-issue operation. Reason: Jira Cloud's Markdown→ADF converter (used on `create`) escapes `**bold**` as literal `\*\*bold\*\*` and silently drops `+` characters between words. The `update` path converts cleanly to wiki markup, so this two-step dance is the only safe authoring path. See `.claude/skills/product-management/references/jira-publishing-gotchas.md` for the full ADF-bug catalog.
6. Set view restrictions to the QA group (if `.agents/project.yaml` declares one).

---

## Update flow (Epic already exists per snapshot)

**Before running the update commands**: the Epic key MUST come from the snapshot's `credentials-source`. If the snapshot is missing or stale, ask the user for the Epic key directly. STOP and wait for the answer; do NOT guess or derive it. Use it inline as `<EPIC_KEY>`.

1. Build the new body.
2. Compute the `content-hash`.
3. Read the existing snapshot's `content-hash`. If identical → skip publish, report `re-publish skipped (content-hash unchanged)`.
4. If different:

   ```text
   [ISSUE_TRACKER_TOOL] update_issue(
     key              = "<EPIC_KEY>",
     description_body = /tmp/qa-credentials-body.wiki,
   )
   ```

   For exact tier syntax, load `.claude/skills/acli/SKILL.md` §Jira.
5. Add a comment on the Epic with the change summary (drifted fields, date).

---

## Wiki markup gotchas

| Markdown input       | Wiki output                                                                          | Why                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `**bold**`           | `*bold*`                                                                             | Wiki uses single asterisks. Double asterisks survive in the create path but get rendered as literal `**`. Always replace at conversion time. |
| `_italic_`           | `_italic_`                                                                           | Identical syntax. No conversion needed.                                                                                                      |
| `+` between words    | escape as `\+`                                                                       | Wiki interprets `+` as inserted-text formatting. Without escape, the character disappears silently.                                          |
| `[text](url)`        | `[text                                                                               | url]`                                                                                                                                        | Pipe-separated. |
| ` ``` ` (code fence) | `{noformat}…{noformat}`                                                              | `{code}` is also valid but renders with syntax highlighting + adds noise. `{noformat}` is the copy-button-friendly choice.                   |
| `<` / `>`            | escape as `&lt;` / `&gt;` only inside `{noformat}` if they should not be interpreted | Wiki tolerates literal `<` / `>` in body text.                                                                                               |

---

## After publish

1. Set the snapshot's `credentials-source` field to the Epic URL: `https://<atlassian-domain>/browse/<EPIC_KEY>`.
2. Update the `/qa` page's credentials CTA `href` to this URL.
3. Re-run §verification.

---

## Failure modes

| Symptom                                              | Cause                                         | Fix                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tier returns `401`                                   | API token expired or missing in `.env`        | STOP, ask user to set `ATLASSIAN_API_TOKEN`, restart session. CLAUDE.md Rule #11.                       |
| Epic created but body renders as literal `**`        | `update` step skipped after `create`          | Re-run the update flow. The fix is in the two-step dance, not in the conversion code.                   |
| Epic exists with same summary in a different project | Wrong `project_key` in `.agents/project.yaml` | Ask user to confirm key. Do NOT auto-pick.                                                              |
| View restrictions can't be applied                   | Account lacks permission                      | Surface to user. Continue with publish — the Epic is still less risky than the page inline credentials. |

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Snapshot field updated: `credentials-source` — see `references/idempotency-snapshot.md`
