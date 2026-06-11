# BK-8 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-8)

1. ATP DRAFT — BK-8: Create a Project inside a Workspace

Date: 2026-05-28 | Risk: HIGH (9/10) | Modality: Jira-native

1. 

AC-1: Given active member (role>=member) in Workspace W / When POST /api/v1/workspaces/{W.uuid}/projects { name: 'Checkout v2' } / Then HTTP 201 + { project_id, slug: 'checkout-v2' }

AC-2: Given workspace member / When POST { name: 'AB' } / Then HTTP 400, code NAME*TOO*SHORT — NEEDS PO/DEV CONFIRMATION: story uses NAME**TOO**SHORT

AC-3: Given W has slug 'checkout-v2' / When POST { name: 'Checkout V2' } same workspace / Then HTTP 409, SLUG*DUPLICATE*IN_WORKSPACE — NEEDS PO/DEV CONFIRMATION: auto-suffix instead?

AC-4: Given user NOT member of Workspace X / When POST to X / Then HTTP 403, NOT*A*MEMBER — NEEDS PO/DEV CONFIRMATION: RLS vs middleware

AC-5 (new): Viewer role → 403 — NEEDS PO/DEV CONFIRMATION

AC-6 (new): Name '---' (no alphanumeric) → 400 — NEEDS PO/DEV CONFIRMATION

AC-7 (new): Name 81+ chars → 400 — NEEDS PO/DEV CONFIRMATION

AC-8 (new): Description >5KB → 400 — NEEDS PO/DEV CONFIRMATION

AC-9 (new): Non-existent workspace UUID → 404 or 403 — NEEDS PO/DEV CONFIRMATION

AC-10 (new): Same slug in different workspace → 201 (per-workspace scope)

AC-11 (new, from arch comment): Reserved slug ('api','app', etc.) → 400 — NEEDS PO/DEV CONFIRMATION: list of reserved slugs

1. 

T01 Successful creation valid member → 201 + slug [P1]
T02 Name 2 chars → 400 NAME*TOO*SHORT [P1]
T03 Name 81 chars → 400 [P1]
T04 Name only specials '---' → 400 [P1]
T05 Duplicate slug same workspace → 409 [P1]
T06 Same slug different workspace → 201 [P1]
T07 Non-member → 403 [P1]
T08 Viewer role → 403 [P1]
T09 Reserved slug ('api') → 400 [P1]
T10 Non-existent workspace UUID → 404/403 [P2]
T11 Description >5KB → 400 [P2]
T12 Description null → 201 [P2]
T13 Slug derivation (accents, spaces, uppercase) [P2]
T14 DB integrity post-201 [P1]
T15 Unauthenticated → 401 [P1]

1. 

Q1 BLOCKER: Error code separator * vs ** (NAME*TOO_SHORT vs NAME**TOO*SHORT)

Q2 RESOLVED: Path param = workspace UUID (confirmed by arch comment)
Q3 BLOCKER: Auth mechanism — cookie session or PAT bearer? Which scope?
Q4: Slug collision — 409 or auto-suffix?
Q5: Unknown workspace — 404 or 403?
Q6: UI form in BK-8 or Phase E?
Q7: Max slug length?
Q8 NEW: Complete list of reserved slugs?

---
_Synced from Jira by sync-jira-issues_
