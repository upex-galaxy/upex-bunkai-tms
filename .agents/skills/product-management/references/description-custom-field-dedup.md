# Description and custom field deduplication

This contract keeps one source of truth for a story's AC, Scope and Out-of-Scope: each lives in its dedicated custom field and never in the description body. Pass 2 refinement of the downstream product backlog found widespread duplication, and every workflow that writes to a story has to respect the contract or the duplication returns.

Use it when authoring a new story, refining an existing one, or auditing a story before the ready-for-dev gate.

Companion references: `story-refinement.md` (the ready-for-dev gate calls the audit below), `acceptance-criteria.md`, `epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, and `jira-publishing-gotchas.md` (publishing edge cases).

---

## Why this contract exists

AC, Scope and Out-of-Scope copied into the description create two copies of the same content, and the copies drift. Downstream consumers (sprint-report, sprint-development planning, QA test design) read the custom fields, so anything that lives only in the description is invisible to them. Anything that lives in both leaves a "which one is correct?" coin toss. Each concept has one canonical home.

---

## Canonical body sections

The description body contains these sections, in this order, top to bottom:

1. `**Source spec:** FR-XXX` as the first line, optional. Use it when the story maps 1:1 to a Functional Requirement, and omit it when the story has no single FR owner.
2. `## User story`, the As / I want / So that narrative. Always present.
3. `## Business rules`, overflow only. Use it when the content does not fit in `{{jira.business_rules_specification}}` (tables, long enumerations, embedded diagrams). The custom field stays canonical, and this section references it explicitly.
4. `## Workflow`, overflow only, on the same terms: use it when the content does not fit in `{{jira.workflow}}`.
5. `## Definition of done`, the closing checklist. It lives in the body because no dedicated field exists for it.
6. `## Mockup`, optional. A link or embedded image.
7. `## Technical notes`, optional. Architecture hints, library choices and migration notes for the implementing dev.

Anything not listed here does not belong in the description body.

---

## Sections that must not appear in the description body

| Forbidden section | Canonical home |
|---|---|
| `## Acceptance criteria` | `{{jira.acceptance_criteria}}` |
| `## Scope` | `{{jira.scope}}` |
| `## Out of scope` | `{{jira.out_of_scope}}` |

Any of these H2 headings in a description body is a duplication bug, so run the audit below.

---

## Scope vs Out-of-Scope contract

`{{jira.scope}}` carries what the story is doing: the in-scope bullet list, the affirmative boundary. `{{jira.out_of_scope}}` carries what the story is not doing: explicit exclusions, deferred work, and things stakeholders might assume are included but are not. Each field has one job. In-scope bullets inside `{{jira.out_of_scope}}`, or out-of-scope bullets inside `{{jira.scope}}`, are a bug even when the markdown is labelled correctly.

---

## Deduplication audit procedure

The `story-refinement.md` ready-for-dev gate calls this audit, which returns a structured report to the user.

1. Fetch the story through `[ISSUE_TRACKER_TOOL]`. Include the description body and the three dedicated custom fields: `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`.
2. Parse the description body and detect any forbidden H2 section: `## Acceptance criteria`, `## Scope`, `## Out of scope`. The match is case-insensitive, and variants such as `## ACs` or `## Acceptance Criteria` count.
3. For each forbidden section found:
   - Read the section content and the corresponding canonical custom field, and compare them.
   - When the content is already canonical (substantively identical or strictly contained), mark it "safe to strip".
   - When it is not canonical (the description has more, or the custom field is empty), migrate first: write the missing content into the custom field, then mark it "safe to strip".
4. Strip every forbidden section from the description body and keep everything else verbatim.
5. Update the description through `[ISSUE_TRACKER_TOOL]` in a single write, with no batching with the custom fields (see `jira-publishing-gotchas.md`, Gotcha 2).
6. Give the user one structured report: which forbidden sections were detected, for each one whether its content was migrated to the canonical field or was already canonical and simply stripped, and the final state, which is a description body that follows the canonical layout.

When no forbidden section is detected, return one line, "description body is clean", and stop.

---

## Rules that protect the contract

- Keep AC, Scope and Out-of-Scope out of the description body, even "for visibility". The custom fields are the visibility layer, and the description body is for narrative and DoD only.
- Keep each field to one direction, with no in-scope and out-of-scope bullets in the same field.
- Verify that a forbidden section's content exists in the canonical custom field before stripping it from the description. Silent data loss is the worst outcome of this audit.
- Send the description update in its own call, never batched with the custom-field updates in a single MCP call. Gotcha 2 in `jira-publishing-gotchas.md` rejects a batch.
- Audit at refinement time, not during execution. Stripping AC from the description while a dev has it open in another tab causes confusion, so coordinate with the dev before auditing a story that is mid-implementation.

---

## Hand-off

Refinement workflows (`story-refinement.md`, `add-feature.md` Phase 2B, `product-backlog-seed.md`) call this audit before transitioning a story to Ready for Dev. Sprint-report and other read-only consumers change no state, but they follow the contract too: they read AC, Scope and Out-of-Scope from the dedicated custom fields and never from the description body. Treating the description body as authoritative for those three concepts is itself a bug, because it accepts the duplication this audit exists to remove.
