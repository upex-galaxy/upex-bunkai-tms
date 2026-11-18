# Publisher: Jira Epic (default)

Runs when the Q1 answer is `Jira Epic`, or when the user accepts the default.

Tool: `[ISSUE_TRACKER_TOOL]` per `.agents/instructions/agent-tool-resolution.md` §6, which resolves to `/acli` first and the Atlassian MCP as fallback. This file says when and what to publish. For exact syntax, auth, flags and ADF, load `.agents/skills/acli/SKILL.md` §Jira and §Publishing rich text.

Body: `references/credentials-content-template.md`. This adapter only converts and publishes it; it holds no content of its own.

## When to prefer it

Jira Epic is the default because:

- ADF code blocks (from `md-to-adf.ts`) render a copy button on every snippet, which suits one credential per block.
- `[ISSUE_TRACKER_TOOL]` is already wired in this boilerplate, with auth through an API token in `.env`.
- Epic-level permissions can be restricted to the QA group.
- The Epic key becomes the snapshot's `credentials-source` value and stays valid across re-runs.

## Before publishing

1. Confirm `[ISSUE_TRACKER_TOOL]` is authenticated, using the tier's auth-check operation (for example, listing accessible workspaces succeeds). The owning skill has the exact command.
2. Read the Jira project key from `.agents/project.yaml` (`project.project_key`). If it is missing, ask the user; a guessed key files the Epic in the wrong project.
3. Run the `security-rules.md` checklist.
4. Read the snapshot's `credentials-source`. If it names a previous Epic, update that Epic instead of creating a new one.

## Create flow (no previous Epic)

1. Build the credentials-content body from the template as Markdown.
2. Convert it to ADF JSON with the bundled converter. The `acli` skill's validated path is ADF, so do not hand-write wiki markup:

   ```bash
   bun .agents/skills/acli/scripts/md-to-adf.ts /tmp/qa-credentials.md /tmp/qa-credentials.adf.json
   ```

   The converter validates by default (a zero-dependency ADF gate that catches the combined-marks HTTP 400 before publishing). One credential is one fenced code block, so Jira renders a copy button per snippet.
3. Create the Epic, then set its description from the ADF file (`acli` descriptions accept an ADF JSON file through `--description-file`):

   ```bash
   KEY=$(acli jira workitem create --project "{{PROJECT_KEY}}" --type Epic \
     --summary "{{PROJECT_NAME}}: QA Testing Credentials (DB / API / UI)" --json | jq -r '.key')
   acli jira workitem edit --key "$KEY" --description-file /tmp/qa-credentials.adf.json
   ```

   The rich-text recipe table is in `.agents/skills/acli/SKILL.md` §"Publishing rich text".
4. Capture the Epic key (for example `UPEX-321`).
5. Set view restrictions to the QA group, if `.agents/project.yaml` declares one.

The old two-step "create with wiki markup, then update" is obsolete. The ADF `--description-file` path converts cleanly in one write, with no `\*\*bold\*\*` escaping and no dropped `+`.

## Update flow (Epic already exists)

Take the Epic key from the snapshot's `credentials-source`. If the snapshot is missing or stale, ask the user for the key and wait; a derived key can overwrite the wrong Epic. Use it inline as `<EPIC_KEY>`.

The artifact is human-owned after the first publish. The body goes out with `<see secrets store>` placeholders, and the QA lead then fills the real secrets (passwords, connection strings, demo users) inside the gated Epic, which is the security model (`security-rules.md` §artifact-side). A blind `update description` would overwrite those curated values with placeholders, and that loss is silent. So never overwrite an existing Epic description without reading it first.

1. Fetch the current Epic body and inspect it:

   ```bash
   acli jira workitem view <EPIC_KEY> --json | jq -r '[.fields.description | .. | .text? // empty] | join("\n")'
   ```
2. Classify the body:
   - Empty, pure template, or our own last-rendered placeholders: safe to regenerate, go to step 3.
   - Human-curated (real secrets, extra sections, edits beyond the template): do not overwrite. Show the user what real content exists and offer three options, then wait for the choice: (a) leave it untouched and add a companion comment linking the refreshed `/qa` page (the default and the recommendation), (b) a guided merge that keeps their real values and patches only structure, (c) an explicit overwrite, where they accept losing the curated body.
3. Build the new body, convert it to ADF with `md-to-adf.ts`, and compute `content-hash`. If it matches the snapshot's `content-hash`, report `re-publish skipped (content-hash unchanged)`.
4. Only when the body is safe (step 2) and the user authorized a write:

   ```bash
   acli jira workitem edit --key <EPIC_KEY> --description-file /tmp/qa-credentials.adf.json
   ```
5. Add a comment on the Epic with the change summary (drifted fields, date).

When the Epic is human-curated and the user picks "leave untouched", set the snapshot `content-hash` to a hash of the current live Epic body as a drift anchor (see `idempotency-snapshot.md`, `external-maintained`). This is a successful outcome, so do not mark the run failed: the page was refreshed and the credentials artifact stayed human-owned.

## Tables: the converter can't build them

The credentials body has tables (Environments, and the demo-users table in UI Variant B). `md-to-adf.ts` does not produce them. Its parser lists markdown tables as out of scope, so a `| col | col |` table comes out as literal text, never as an ADF table node. Its validator allowlist does include `table`, `tableRow`, `tableHeader` and `tableCell`, which means hand-built table nodes pass validation even though the converter never authors them. So you build the table nodes yourself and interleave them with the converted prose.

The recipe below is generic. Take cell contents from detection and never hardcode the example values.

1. Author each prose section as a markdown string and each table as a 2-D array of strings (first row is the header).
2. Hand-build ADF `table` nodes with these two helpers:

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

3. Splice `mdToAdf(prose).content` around each table node:

   ```ts
   const md = (s: string): Node[] => mdToAdf(s).content;
   const content: Node[] = [
     ...md(intro), envTable, ...md(dbBody), ...md(api), ...md(footer),
   ];
   const doc = { type: "doc", version: 1, content };
   ```

4. Validate a probe that leaves the table nodes out, so structural errors in your authored prose still fail fast:

   ```ts
   const probe = { type: "doc", version: 1, content: content.filter((n) => n.type !== "table") };
   const { valid, errors } = validateAdf(probe);
   if (!valid) { console.error(errors); process.exit(1); }
   ```

5. Publish with `--description-file`, then read the Epic back (view the work item as JSON through `[ISSUE_TRACKER_TOOL]`) and confirm the table nodes survived. The probe skipped them, so the round-trip is the real proof.

The one-liner `md-to-adf.ts <in> <out>` cannot inject table nodes. When the body has tables, write a small project-local generator (the helpers above plus your authored sections) that emits the ADF JSON, and feed that JSON to `acli edit --description-file`. Keep real secrets out of the generator: placeholders only, since real values are filled in the gated Epic after publishing.

## Wiki markup gotchas

Legacy: the `acli` ADF path above sidesteps all of this. The table applies only when you publish through a wiki-markup channel (some Atlassian MCP or raw REST wiki flows). Do not convert to wiki markup when `acli` is the publisher.

| Markdown input | Wiki output | Why |
| --- | --- | --- |
| `**bold**` | `*bold*` | Wiki uses single asterisks. Double asterisks survive the create path but render as literal `**`, so replace them at conversion time. |
| `_italic_` | `_italic_` | Identical syntax, no conversion. |
| `+` between words | `\+` | Wiki reads `+` as inserted-text formatting, and without the escape the character disappears silently. |
| `[text](url)` | `[text\|url]` | Pipe-separated. |
| code fence | `{noformat}…{noformat}` | `{code}` is also valid but adds syntax highlighting and noise. `{noformat}` suits the copy button. |
| `<` / `>` | `&lt;` / `&gt;` only inside `{noformat}`, when they should not be interpreted | Wiki tolerates literal `<` and `>` in body text. |

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Tier returns `401` | API token expired or missing in `.env` | Stop, ask the user to set `ATLASSIAN_API_TOKEN`, restart the session (Critical Rule 9). |
| Epic body renders literal `**` or `h2.` | Published as wiki or markdown instead of ADF | Re-run the ADF path: `md-to-adf.ts`, then `acli edit --description-file`. |
| Table renders as literal `\| col \| col \|` | A markdown table went through the converter | Hand-build the ADF table nodes and interleave them with the converted prose, per "Tables: the converter can't build them". |
| An Epic with the same summary exists in another project | Wrong `project_key` in `.agents/project.yaml` | Ask the user to confirm the key. |
| View restrictions can't be applied | Account lacks permission | Tell the user and continue publishing. The Epic is still less risky than credentials inline on the page. |

## After publish

1. Set the snapshot's `credentials-source` to the Epic URL: `https://<atlassian-domain>/browse/<EPIC_KEY>`.
2. Update the `/qa` page's credentials CTA `href` to that URL.
3. Re-run §verification.

## Without a person present

Creating or editing the Epic is an outward write. A routine publishes only when its brief covers it, and the brief also supplies the decisions this file asks the user for (project key, `<EPIC_KEY>`, the human-curated choice). Without a covering brief, the routine stops before the Epic write: it saves the body as the `manual-paste.md` handover, reports the destination, and leaves a human-curated Epic untouched. A supervised worker sends each question to its launcher. The full table is in `SKILL.md` §"With nobody at the keyboard"; the rule is `agentic-dev-core/references/decision-protocol.md`.

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Snapshot field updated: `credentials-source` (see `references/idempotency-snapshot.md`)
