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

1. Build the credentials-content body from the template (`credentials-content-template.md`) as Markdown.
2. Convert Markdown → **ADF JSON** with the bundled converter. Do NOT hand-author wiki markup — the `acli` skill's canonical, validated path is ADF:

   ```bash
   bun .claude/skills/acli/scripts/md-to-adf.ts /tmp/qa-credentials.md /tmp/qa-credentials.adf.json
   ```

   The converter validates by default (zero-dep ADF gate → catches the combined-marks HTTP 400 before publish). One credential = one fenced code block (Jira renders a copy button per snippet).
3. Create the Epic, then set its description from the ADF file (`acli` descriptions accept an ADF JSON file via `--description-file`):

   ```bash
   KEY=$(acli jira workitem create --project "{{PROJECT_KEY}}" --type Epic \
     --summary "{{PROJECT_NAME}} — Credenciales de Acceso para Testing (DB / API / UI)" --json | jq -r '.key')
   acli jira workitem edit --key "$KEY" --description-file /tmp/qa-credentials.adf.json
   ```

   Exact syntax + the rich-text recipe table: `.claude/skills/acli/SKILL.md` §"Publishing rich text".
4. Capture the Epic key (e.g. `UPEX-321`).
5. Set view restrictions to the QA group (if `.agents/project.yaml` declares one).

> The old "create-with-wiki, then re-update" two-step dance is OBSOLETE. The ADF `--description-file` path converts cleanly in one write (no `\*\*bold\*\*` escaping, no dropped `+`). Markdown→wiki conversion is no longer used by this adapter — see the legacy note under "Wiki markup gotchas".

---

## Update flow (Epic already exists per snapshot)

**Before running the update commands**: the Epic key MUST come from the snapshot's `credentials-source`. If the snapshot is missing or stale, ask the user for the Epic key directly. STOP and wait for the answer; do NOT guess or derive it. Use it inline as `<EPIC_KEY>`.

> **⚠️ NON-DESTRUCTIVE RULE — read first. The artifact is human-owned after first publish.** The body is published with `<see secrets store>` placeholders; the QA lead then fills REAL secrets (passwords, connection strings, demo users) INSIDE the gated Epic — that IS the security model (`security-rules.md` §artifact-side). A blind `update description` would OVERWRITE those real, curated values back to placeholders — silent data loss. NEVER blind-overwrite an existing Epic description.

1. **Fetch the current Epic body FIRST** and inspect it:

   ```bash
   acli jira workitem view <EPIC_KEY> --json | jq -r '[.fields.description | .. | .text? // empty] | join("\n")'
   ```
2. Classify the existing body:
   - **Empty / pure-template / our own last-rendered placeholders** → safe to regenerate. Proceed to step 3.
   - **Human-curated** (real secrets, extra sections, edits beyond the template) → do NOT overwrite. STOP and surface to the user: show what real content exists and offer (a) **leave untouched + add a companion comment** linking the refreshed `/qa` page (default, recommended), (b) a **guided merge** where you keep their real values and only patch structure, or (c) **explicit overwrite** (they accept losing the curated body). Wait for the choice.
3. Build the new body → ADF (`md-to-adf.ts`) → compute `content-hash`. If the snapshot's `content-hash` is unchanged → `re-publish skipped (content-hash unchanged)`.
4. Only if the body is safe (step 2) AND the user authorized a write:

   ```bash
   acli jira workitem edit --key <EPIC_KEY> --description-file /tmp/qa-credentials.adf.json
   ```
5. Add a comment on the Epic with the change summary (drifted fields, date).

> When the Epic is human-curated and the user picks "leave untouched", anchor the snapshot `content-hash` to a hash of the CURRENT live Epic body (drift anchor) — see `idempotency-snapshot.md` (`external-maintained` handling). Do NOT mark the run failed: "page refreshed, credentials artifact left human-owned" is a valid successful outcome.

---

## Wiki markup gotchas

> **LEGACY — not used by the `acli` ADF path above.** This table applies ONLY if you publish through a wiki-markup channel (some Atlassian MCP / raw REST wiki flows). The default `acli` adapter uses `md-to-adf.ts` + `--description-file` (ADF JSON), which sidesteps every gotcha below. Keep this for the fallback case; do not convert to wiki markup when `acli` is the publisher.

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
