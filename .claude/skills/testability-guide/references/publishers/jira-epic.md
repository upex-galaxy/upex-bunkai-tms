# Publisher — Jira Epic (default)

> **When this adapter runs**: Q1 answered with `Jira Epic` (or the user accepted the default).
>
> **Tool**: `[ISSUE_TRACKER_TOOL]` per `CLAUDE.md` §6. Resolves to `/acli` primary, Atlassian MCP fallback. This adapter owns the WHEN/WHAT — for the HOW (exact syntax, auth, flags, ADF), load `.claude/skills/acli/SKILL.md` §Jira and §Publishing rich text.
>
> **Body**: `references/credentials-content-template.md`. This adapter ONLY describes how to convert + publish; it does not duplicate content.

---

## Why Jira Epic is the default

- ADF code blocks (via `md-to-adf.ts`) render a copy button on every snippet — perfect for one-credential-per-block.
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

## Tables: the converter can't build them

The credentials body has tables (Environments; and the demo-users table in UI Variant B). **`md-to-adf.ts` will NOT produce them.** Its parser lists markdown tables as out-of-scope (so a `| col | col |` markdown table is emitted as literal text, never an ADF table node), while its validator allowlist DOES include `table` / `tableRow` / `tableHeader` / `tableCell` — i.e. hand-built table nodes pass validation, but the converter never authors them. So you hand-build the table nodes and interleave them with the converted prose.

Recipe (generalized — adapt cell contents from detection, never hardcode the example values):

1. Author each prose section as a markdown string. Author each TABLE as a 2-D array of strings (first row = header).
2. Hand-build ADF `table` nodes with these two compact helpers:

   ```ts
   type Node = Record<string, any>;

   function cellText(text: string, header: boolean): Node {
     const type = header ? "tableHeader" : "tableCell";
     const content = text.length
       ? [{ type: "paragraph", content: [{ type: "text", text }] }]
       : [{ type: "paragraph", content: [] }];
     return { type, attrs: {}, content };
   }

   function table(rows: string[][]): Node {
     return {
       type: "table",
       attrs: { isNumberColumnEnabled: false, layout: "default" },
       content: rows.map((cells, i) => ({
         type: "tableRow",
         content: cells.map((c) => cellText(c, i === 0)),
       })),
     };
   }
   ```

3. Interleave the hand-built tables with the converted prose, splicing `mdToAdf(prose).content` around each table node:

   ```ts
   const md = (s: string): Node[] => mdToAdf(s).content;
   const content: Node[] = [
     ...md(intro), envTable, ...md(dbBody), ...md(api), ...md(footer),
   ];
   const doc = { type: "doc", version: 1, content };
   ```

4. **Gate with a PROBE validation that filters out the table nodes** before publishing — the validator allowlist accepts table nodes, but validate the prose nodes explicitly so structural errors in your authored prose still fail fast:

   ```ts
   const probe = { type: "doc", version: 1, content: content.filter((n) => n.type !== "table") };
   const { valid, errors } = validateAdf(probe);
   if (!valid) { console.error(errors); process.exit(1); }
   ```

5. Publish via `--description-file`, then **GET the Epic back** (view the work item as JSON via `[ISSUE_TRACKER_TOOL]`) and confirm the table nodes survived the round-trip — the round-trip is the real proof, since the probe skipped them.

> Why a generator script and not the plain `md-to-adf.ts <in> <out>` one-liner: the one-liner can't inject table nodes. When the body has tables, build a small project-local generator (the helpers above + your authored sections) that writes the ADF JSON, then feed that JSON to `acli edit --description-file`. Keep zero real secrets in the generator — placeholders only; real values are filled in the gated Epic after publish.

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
| Epic created but body renders as literal `**` or `h2.`        | Published as wiki/markdown instead of ADF          | Re-run the ADF path: `md-to-adf.ts` then `acli edit --description-file`. Never hand-author wiki markup.                   |
| Table renders as literal `| col | col |`            | Passed a markdown table to the converter      | Hand-build ADF table nodes (`table` / `tableRow` / `tableHeader` / `tableCell`) and interleave with the converted prose — see §"Tables: the converter can't build them". The converter never emits table nodes. |
| Epic exists with same summary in a different project | Wrong `project_key` in `.agents/project.yaml` | Ask user to confirm key. Do NOT auto-pick.                                                              |
| View restrictions can't be applied                   | Account lacks permission                      | Surface to user. Continue with publish — the Epic is still less risky than the page inline credentials. |

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Snapshot field updated: `credentials-source` — see `references/idempotency-snapshot.md`
