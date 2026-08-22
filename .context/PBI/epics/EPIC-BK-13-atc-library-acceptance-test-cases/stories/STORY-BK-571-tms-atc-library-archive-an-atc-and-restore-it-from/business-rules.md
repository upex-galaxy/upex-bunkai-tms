# BK-571 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-571)

- ***Archive is a library-visibility operation, not a record operation.**** It controls whether an ATC is **offered for reuse* going forward. It never rewrites, hides, or invalidates anything the ATC has already produced.
- ***The archive filter must not be applied uniformly.*** Surfaces that offer an ATC for reuse — the library list and its badge, ATC search, the command palette, the Test-chain step picker — hide archived ATCs. Surfaces that report what already happened — a past Run and its recorded steps and results, the Traceability chain, a Defect's anchor — must keep resolving an archived ATC in full. A blanket "hide everything archived" rule silently blanks historical Run evidence the first time anyone archives a reused ATC, and is a defect, not a simplification.
- ***Being chained by Tests never blocks archiving.**** It triggers a warning that names the affected Tests and requires an explicit confirmation. This follows the product's existing stance that an in-use ATC is still mutable — an edit to a chained ATC propagates rather than being refused — and it deliberately does **not* adopt a "used, therefore locked" rule, because no such rule exists anywhere in the product today.
- ***Being archived does block editing.**** This inherits the already-shipped guard that an archived ATC is non-editable; this story does not weaken or override it. The two rules are different questions: **in use** constrains nothing, **archived* freezes everything until restore.
- ***Archiving never edits a Test.*** Chain positions, their order, and each Test's step count are untouched. A Test that chains an archived ATC keeps it, and shows that the step refers to an archived ATC.
- ***An Acceptance Criterion whose only ATC is archived is not "uncovered".*** Uncovered names an authoring gap — nothing bound at all. A bound-but-archived ATC is a different state and must render as archived evidence, not as an absence.
- ***Archive and restore are reversible and idempotent.*** Repeating either is reported as success and changes nothing further. Neither action ever destroys an ATC record.
- ***Archive and restore require write access to the ATC's owning Project*** — the same access that already permits editing it. A member who cannot write is not offered either action.
- ***Every archive and every restore is auditable*** — one workspace Activity Stream entry each, naming the ATC and the actor.
- ***An archived ATC stays fully readable*** to anyone who can read its Project. Archiving hides it from reuse surfaces; it is not a permission change.

---
_Synced from Jira by sync-jira-issues_
