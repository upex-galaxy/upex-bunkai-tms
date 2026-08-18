# BK-315 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-315)

# ATP: BK-315 — TMS-ATC Library | Export a Project's ATCs to CSV (Shift-Left DRAFT)

***Status***: DRAFT — Awaiting PO/Dev confirmation
***Refined on***: 2026-08-16 — QA Shift-Left batch session
***Modality***: Jira-native (Story custom field)

## Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 6 | Happy-path variants: full export, column order, tag join, status pass-through, empty-with-no-error, combined-chars baseline |
| Negative | 6 | Non-disclosure denial (3 EP-distinct causes), unauthenticated 401, security non-leak charter, slow-generation anomaly |
| Boundary | 9 | n=1, n=0, 3 isolated escape-character classes, title×tags decision-table interaction, tag-own-text escaping, representative-large (500), very-large (5,000+) |
| Integration | 1 | Browser-native file download from the API response |
| Edge (idempotency) | 1 | Double-click / repeated trigger |
| ***Total**** | ****23*** | 1-point Story, 5 original ACs → 23 outlines (~4.6x) — access-control EP surface, CSV-escaping surface, unbounded-scale BVA surface |

## Outline names (DRAFT — full Given/When/Then in the local working copy)

### Positive

- Should export one CSV row per ATC with all 7 columns populated for a 12-ATC library
- Should always emit columns in the fixed order ATC ID/Slug/Title/Module/Layer/Tags/Status
- Should join multiple tags into a single Tags cell
- Should pass through each valid ATC status value verbatim
- Should show no error indicator when exporting an empty library
- Should correctly export a Title containing a comma, quote, and line break combined

### Negative

- Should return 404 "Project not found" for a workspace-non-member
- Should return the identical 404 for a nonexistent Project ID
- Should return the identical 404 for a removed former member
- Should return 401 for a completely unauthenticated request
- Should not leak Project existence via response shape or timing
- Should not time out or produce a partial/corrupted file under slow generation

### Boundary

- Should export exactly one data row when the Project has exactly 1 ATC
- Should export a header-only CSV for a Project with zero ATCs
- Should quote a Title containing only a comma
- Should quote and double an embedded quote in a Title containing only a double quote
- Should quote and preserve a Title containing only a line break
- Should correctly escape a Title AND a joined-Tags cell in the same row when both contain special characters
- Should escape a single Tag's own text containing a comma, quote, or line break
- Should include every row without truncation for a representative large library (500 ATCs)
- Should behave predictably at a very large ATC count (5,000+)

### Integration

- Should trigger a browser-native file download via Content-Disposition when export completes

### Edge

- Should handle repeated "Export as CSV" triggers without duplicate or stuck downloads

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***What delimiter joins multiple tags into the single Tags CSV cell?*** Suggested answer: `"; "` (semicolon-space) — avoids the delimiter itself ever triggering quoting.
2. ***Does free-text Tag content permit commas, double quotes, or line breaks — the same character set as Title?*** If tag free-text is already constrained (e.g. slug-like) at creation time, this narrows to "N/A."
3. ***Is there an upper bound on ATC library size for this export, or must it support unbounded growth (streaming)?*** No sibling endpoint in this codebase does a full, unbounded, single-request export today.

## Technical Questions for Dev

> These do not block PO but block implementation.

1. ***Reuse the established non-disclosure 404 convention?*** Every sibling project-scoped reporting endpoint already implements `P0002` → `404` + ````` (`lib/coverage/errors.ts`). Recommend BK-315 follow the identical pattern.
2. ***Expected status for a fully unauthenticated request?*** Presumably standard `401`, distinct from the `404` non-disclosure path.
3. ***Client-side lock on the export trigger?*** Is "Export as CSV" disabled while a request is in flight, or can it be triggered repeatedly?
4. ***Performance/timeout budget for large exports?*** Even an informal "best-effort, no SLA" answer unblocks the slow-generation scenario's design.

## Data feasibility

No risks — data model fully implemented. `atcs` (`module_id`, `layer`, `status`, `tags` all `NOT NULL`/defaulted), Project/workspace membership, and the RLS + RPC access-control pattern all pre-exist. Only the CSV-serialization logic and the export trigger itself are net-new.

---

Full narrative: `.context/PBI/epics/EPIC-BK-13-atc-library-acceptance-test-cases/stories/STORY-BK-315-tms-atc-library-export-a-project-s-atcs-to-csv/shift-left-refinement.md`

---
_Synced from Jira by sync-jira-issues_
