# Description ↔ Custom Field Deduplication

> **Purpose**: Codify the single-source-of-truth contract between the Jira issue description body and the dedicated rich-text custom fields. AC / Scope / Out-of-Scope content lives in its own custom field, NEVER in the description body. The downstream product backlog surfaced widespread duplication during Pass 2 refinement — every workflow that writes to a story must respect this contract or the duplication returns.
> **Use when**: Authoring a new story, refining an existing one, or auditing a story before the ready-for-dev gate.
> **Companion references**: `story-refinement.md` (ready-for-dev gate calls the audit below), `acceptance-criteria.md`, `epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `jira-publishing-gotchas.md` (publishing edge cases).

---

## Why this contract exists

Storing AC / Scope / Out-of-Scope inside the description body creates two copies of the same content: one in the description, one in the dedicated custom field. The two drift. Downstream consumers (sprint-report, sprint-development planning, QA test design) read the custom fields — anything that lives only in the description becomes invisible. Anything that lives in both creates a "which one is correct?" coin toss. One canonical home per concept.

---

## Canonical body sections — what the description body SHOULD contain

In this order, top to bottom:

1. **`**Source spec:** FR-XXX`** — first line, optional. Use when the story maps 1:1 to a Functional Requirement. Omit when the story does not have a single FR owner.
2. **`## User story`** — As / I want / So that narrative. Always present.
3. **`## Business rules`** — overflow only. Use when content does not fit in `{{jira.business_rules_specification}}` (e.g. tables, long enumerations, embedded diagrams). The custom field remains canonical; this section explicitly references it.
4. **`## Workflow`** — overflow only. Same rule as Business rules: use when content does not fit in `{{jira.workflow}}`.
5. **`## Definition of done`** — closing checklist. Lives in the body because no dedicated field exists for it.
6. **`## Mockup`** — optional. Link or embedded image.
7. **`## Technical notes`** — optional. Architecture hints, library choices, migration notes for the implementing dev.

Anything not listed above does not belong in the description body.

---

## Sections that MUST NOT appear in the description body

| Forbidden section | Canonical home |
|---|---|
| `## Acceptance criteria` | `{{jira.acceptance_criteria}}` |
| `## Scope` | `{{jira.scope}}` |
| `## Out of scope` | `{{jira.out_of_scope}}` |

If you see any of these H2 headings in a description body, the story has a duplication bug. Run the audit below.

---

## Scope vs Out-of-Scope contract

`{{jira.scope}}` carries what the story IS doing — the in-scope bullet list, the affirmative boundary. `{{jira.out_of_scope}}` carries what the story is NOT doing — explicit exclusions, deferred work, things stakeholders might assume are included but are not. No cross-pollution between the two fields. Mixing in-scope bullets and out-of-scope bullets inside either field is a bug, even if the markdown is correctly labelled. Each field has one job.

---

## Deduplication audit procedure

Called from `story-refinement.md` ready-for-dev gate. Returns a structured report to the user.

1. Fetch the story via `[ISSUE_TRACKER_TOOL]`. Include the description body AND the three dedicated custom fields: `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`.
2. Parse the description body. Detect any of the forbidden H2 sections: `## Acceptance criteria`, `## Scope`, `## Out of scope`. Case-insensitive match; variants like `## ACs` or `## Acceptance Criteria` all count.
3. For each forbidden section found:
   - Read the section content.
   - Read the corresponding canonical custom field.
   - Compare. If the content is already canonical (substantively identical or strictly contained) → mark as "safe to strip".
   - If the content is NOT canonical (description has more, or the custom field is empty) → **migrate first**: write the missing content into the custom field, then mark as "safe to strip".
4. Strip every forbidden section from the description body. Preserve everything else verbatim.
5. Use `[ISSUE_TRACKER_TOOL]` to update the description — single write, no batching with the custom fields (see `jira-publishing-gotchas.md` Gotcha 2).
6. Surface to the user, in one structured report:
   - Which forbidden sections were detected.
   - For each: whether content was migrated to its canonical field, or was already canonical and simply stripped.
   - Final state: description body now follows the canonical layout.

If no forbidden sections are detected, return a one-line "description body is clean" and exit.

---

## Anti-patterns

- NEVER copy AC / Scope / Out-of-Scope content into the description body "for visibility". The custom fields ARE the visibility layer; the description body is for narrative + DoD only.
- NEVER mix in-scope bullets and out-of-scope bullets inside the same field. Each field has exactly one direction.
- NEVER strip a forbidden section from the description without first verifying the content exists in the canonical custom field. Silent data loss is the worst outcome of this audit.
- NEVER batch the description update with the custom-field updates in a single MCP call — Gotcha 2 in `jira-publishing-gotchas.md` will reject it.
- NEVER run the audit on a story mid-implementation without coordinating with the dev — stripping AC from the description body while a dev has it open in another tab causes confusion. Audit at refinement time, not during execution.

---

## Hand-off

Refinement workflows (`story-refinement.md`, `add-feature.md` Phase 2B, `product-backlog-seed.md`) call this audit before transitioning a story to Ready for Dev. Sprint-report and other read-only consumers do NOT modify state, but they must still respect the contract: read AC / Scope / Out-of-Scope from the dedicated custom fields, never from the description body. Treating the description body as authoritative for those three concepts is itself a bug — it accepts duplication that this audit is designed to eliminate.
