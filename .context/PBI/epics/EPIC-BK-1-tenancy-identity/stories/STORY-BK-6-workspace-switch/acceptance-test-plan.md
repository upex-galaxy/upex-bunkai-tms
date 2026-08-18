# BK-6 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-6)

## Acceptance Test Plan (ATP) — [https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6](https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6)

***Stage 1 Planning completed:*** 2026-06-06
***Risk Score:*** 13/15 — HIGH
***TCS Planned:*** 4
***Surface Coverage:*** UI + API + DB

> Full ATP stored in field: 🧪 Acceptance Test Plan (ATP)
This comment is the diff-history mirror per jira-native modality.

---

### Risk Summary

Score 13/15 — HIGH. Veto override: auth + data integrity → Full ATP mandatory.

***Top risks:***

1. ***DEF-001 (to file in Stage 2):*** API response schema mismatch — spec requires {{{ id, slug, name, role }}} but implementation returns {{{ ok: true, active*workspace*id }}}. TC1 will fail this assertion.
2. ***DISC-003 (test and report):*** AC3 suspended error code may not be `MEMBERSHIP_SUSPENDED` — RLS-based rejection may return generic code. TC3 captures actual code.
3. ***Session data leak risk:*** If tenancy scoping fails, data from the wrong workspace could leak. TC1 verifies scoping post-switch.

***Accepted discrepancies:***

- DISC-002: Navigation to `/projects` instead of `/home` — ACCEPTED (no `/home` route; spec stale).

---

### TC Outlines

| TC  | AC  | Type  | Priority  | Test Data  |
| --- | --- | --- | --- | --- |
| ---- | ---- | ------ | ---------- | ----------- |
| TC1  | AC1  | Positive — API + DB  | Critical  | FROM: Bünkāï QA → TO: Extra Test  |
| TC2  | AC2  | Negative — API  | Critical  | Non-member workspace `bd947203`  |
| TC3  | AC3  | Negative — API + DB  | Critical  | Suspended membership `c828d131` (BK5 Test Workspace)  |
| TC4  | AC4  | Positive — UI + Integration  | High  | Switcher + reload persistence  |

---

### Pre-test DB Check for TC3

```sql
SELECT status FROM workspace_members
WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
-- Expected: status = 'suspended'
```

***Post-TC3 cleanup (mandatory):***

```sql
UPDATE workspace_members SET status = 'active'
WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
```

---

### Execution Order

TC2 → TC3 → TC1 → TC4 (negatives first to avoid state contamination; reset active workspace between TC1 and TC4)

---

**ATP posted by QA Engineering — Stage 1 Planning | 2026-06-06**

---
_Synced from Jira by sync-jira-issues_
