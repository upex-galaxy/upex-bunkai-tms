# Jira Publishing Gotchas

> **Purpose**: A write to a Jira rich-text field (description, AC, Scope, Out-of-Scope, Business rules, Workflow) passes through a Markdown to ADF (Atlassian Document Format) conversion. Two converter and API bugs have cost the downstream project real cycles; this file lets a workflow avoid both.
> **Use when**: Any methodology workflow is about to publish to a Jira rich-text field, or when an HTTP 400 surfaces during publish.
> **Companion references**: `epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `story-refinement.md`, `acceptance-criteria.md`, `jira-operations.md`, `description-custom-field-dedup.md`.
> **Scope boundary**: this file covers what breaks at publish (HTTP 400 edges). For what reads well (when to use a table, panel or nested list so field content is scannable, including the now-supported GFM tables), see `../../acli/references/adf-authoring-style.md`.

---

## Background

Jira rich-text fields require ADF, a structured JSON document and not Markdown. The `[ISSUE_TRACKER_TOOL]` ecosystem converts Markdown to ADF for most operations, but the conversion has known edges and the API rejects some payloads without a useful diagnostic. Both gotchas below are reproducible and stay silent until publish time.

---

## Gotcha 1: `md-to-adf.ts` combines `code` + `strong` marks

- Symptom: HTTP 400 `INVALID_INPUT` from the Jira REST endpoint (or the CLI wrapper) when publishing a rich-text field. The error body points to no node, only a top-level "invalid document".
- Cause: the converter at `.agents/skills/acli/scripts/md-to-adf.ts` emits one text node carrying both `code` and `strong` marks when the markdown nests `` `inline_code` `` inside `**bold**` (or italics). Jira rejects that mark combination at document validation, with no node-level diagnostic.
- Permanent fix (landed): commit `4afd4f8` patched the converter at `acli/lib/md-to-adf.ts` to strip `strong` / `em` marks when an inline `code` mark co-occurs on the same text node. Jira REST `POST /rest/api/3/issue` now accepts documents that previously triggered HTTP 400 `INVALID_INPUT`. The fix lives inside the `acli` skill, so this file does not duplicate the patch.
- Authoring habit (still recommended): keep inline code spans outside bold and italic spans in markdown destined for Jira. The strip transform makes nested marks safe, but flat authoring renders cleaner in Jira and does not depend on the transform surviving a future converter regression. The same rule covers italics, strikethrough, and any mark the converter learns to combine with `code`.
  - Preferred: `**run** \`bun install\` **first**`
  - Tolerated (transform handles it): `**run \`bun install\` first**`

---

## Gotcha 2: MCP rejects batched ADF custom fields

- Symptom: `[ISSUE_TRACKER_TOOL]` returns `Operation value must be an Atlassian Document (see the Atlassian Document Format)` when one call updates several rich-text custom fields (for example `{{jira.acceptance_criteria}}` + `{{jira.scope}}` + `{{jira.out_of_scope}}` together).
- Cause: the MCP variant of `[ISSUE_TRACKER_TOOL]` converts Markdown to ADF only for the top-level `description` field. Custom fields inside an `additional_fields` payload are forwarded as-is, so Jira receives raw Markdown where it expects ADF JSON and rejects the whole update.
- Workaround A, split the update: issue one update call per ADF custom field. It is slower but simple and resilient, and it is the default when touching two or more rich-text custom fields.
- Workaround B, pre-convert each value: run each Markdown value through `.agents/skills/acli/scripts/md-to-adf.ts` and pass the resulting ADF JSON inside `additional_fields`. It is faster but ties the workflow to converter internals, and a stale local copy of the converter produces ADF the live API rejects, so check that its version matches the project's checked-in converter first.
- Best practice: one call per field (Workaround A), never batched. The whole call is rejected, not just the later fields, and partial state can result if the API committed any side effect before rejecting. The latency is small next to a failed publish that leaves the issue half-updated.

---

## Detection checklist

Triage for a failed publish:

- HTTP 400 with no node-level error pointer: suspect Gotcha 1. Grep the authoring markdown for `` ` `` inside `**…**` or `_…_` and fix it at the markdown layer.
- Error reads `Operation value must be an Atlassian Document`: Gotcha 2. Move the update path to one call per field, or pre-convert each value.
- Any other 400: not covered here. Show the raw error to the user. A retry without the fix fails the same way, so do not retry silently.

---

## Cross-references

`epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `story-refinement.md` and `acceptance-criteria.md` cite this file. A workflow that publishes rich-text content to Jira links here for the two gotchas above before its first write.
