# BK-88 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

# ATP ACTIVE — BK-88: Settings | Manage Personal Access Tokens

***Status***: ACTIVE — API-only phase (2026-06-12)
***Mode***: Partial sprint — UI outlines deferred (BK-87 not shipped)
***Outlines***: 14 API-executable | 17 UI-deferred

---

## API-Executable TCs (this sprint)

| TC | Summary | Auth | Expected |
| --- | --- | --- | --- |
| BK-120 | TC01: POST happy path — token issued, secret returned once | cookie session | 201 |
| BK-121 | TC02: GET happy path — prefix only, {tokens:[...]} shape | Bearer PAT | 200 |
| BK-122 | TC03: DELETE happy path — soft-revoke, 200 | cookie session | 200 |
| BK-123 | TC04: POST unauthenticated → 401 | none | 401 |
| BK-124 | TC05: GET unauthenticated → 401 | none | 401 |
| BK-125 | TC06: DELETE unauthenticated → 401 | none | 401 |
| BK-126 | TC07: POST invalid scope enum value → 422 | cookie session | 422 |
| BK-127 | TC08: POST workspace:admin scope by member-role user → 403 ⚠️ BK-117 | cookie session | 403 |
| BK-128 | TC09: POST name = 80 chars (boundary accept) → 201 | cookie session | 201 |
| BK-129 | TC10: POST name = 81 chars (boundary reject) → 422 | cookie session | 422 |
| BK-130 | TC11: GET RLS — User B cannot see User A tokens | Bearer PAT | 200 (own tokens only) |
| BK-131 | TC12: DELETE RLS — User B cannot revoke User A token → 404 | cookie session | 404 |
| BK-132 | TC13: DELETE already-revoked token → 404 | cookie session | 404 |
| BK-133 | TC14: Revoked PAT → 401 on subsequent API call | revoked PAT | 401 |

> ***ERROR:**** ****TC08 (BK-127) references known defect BK-117 (HIGH)*** — expected to FAIL until BK-117 is resolved.
TC08 is DISTINCT from TC07: TC07 tests an invalid enum string (e.g. "admin:all"), TC08 tests a valid scope ("workspace:admin") with insufficient role.

---

## UI-Deferred TCs (17 outlines)

Blocked on BK-87 (Settings Hub — Ready For Dev). Will activate when BK-87 reaches Ready For QA.

---

## Open PO questions (block UI TCs only)

1. Should revoked tokens appear in the list? Visual treatment?
2. Exact copy for revocation confirmation dialog?
3. Are expiry date and workspace binding shown in list row and form?
4. Clipboard API unavailability fallback?

---
_Synced from Jira by sync-jira-issues_
