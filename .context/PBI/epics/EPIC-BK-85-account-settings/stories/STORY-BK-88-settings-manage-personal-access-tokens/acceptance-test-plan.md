# BK-88 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

# ATP ACTIVE — [https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88): Settings | Manage Personal Access Tokens

***Status***: ACTIVE — API-only phase (2026-06-12)
***Mode***: Partial sprint — UI outlines deferred ([https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) not shipped)
***Outlines***: 14 API-executable | 17 UI-deferred

---

## API-Executable TCs (this sprint)

| ***TC**** | ****Summary**** | ****Auth**** | ****Expected*** |
| --- | --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-120#icft=BK-120](https://jira.upexgalaxy.com/browse/BK-120#icft=BK-120) | TC01: POST happy path — token issued, secret returned once | cookie session | 201 |
| [https://jira.upexgalaxy.com/browse/BK-121#icft=BK-121](https://jira.upexgalaxy.com/browse/BK-121#icft=BK-121) | TC02: GET happy path — prefix only, {tokens:[...]} shape | Bearer PAT | 200 |
| [https://jira.upexgalaxy.com/browse/BK-122#icft=BK-122](https://jira.upexgalaxy.com/browse/BK-122#icft=BK-122) | TC03: DELETE happy path — soft-revoke, 200 | cookie session | 200 |
| [https://jira.upexgalaxy.com/browse/BK-123#icft=BK-123](https://jira.upexgalaxy.com/browse/BK-123#icft=BK-123) | TC04: POST unauthenticated → 401 | none | 401 |
| [https://jira.upexgalaxy.com/browse/BK-124#icft=BK-124](https://jira.upexgalaxy.com/browse/BK-124#icft=BK-124) | TC05: GET unauthenticated → 401 | none | 401 |
| [https://jira.upexgalaxy.com/browse/BK-125#icft=BK-125](https://jira.upexgalaxy.com/browse/BK-125#icft=BK-125) | TC06: DELETE unauthenticated → 401 | none | 401 |
| [https://jira.upexgalaxy.com/browse/BK-126#icft=BK-126](https://jira.upexgalaxy.com/browse/BK-126#icft=BK-126) | TC07: POST invalid scope enum value → 422 | cookie session | 422 |
| [https://jira.upexgalaxy.com/browse/BK-127#icft=BK-127](https://jira.upexgalaxy.com/browse/BK-127#icft=BK-127) | TC08: POST workspace:admin scope by member-role user → 403 ⚠️ BK-117 | cookie session | 403 |
| [https://jira.upexgalaxy.com/browse/BK-128#icft=BK-128](https://jira.upexgalaxy.com/browse/BK-128#icft=BK-128) | TC09: POST name = 80 chars (boundary accept) → 201 | cookie session | 201 |
| [https://jira.upexgalaxy.com/browse/BK-129#icft=BK-129](https://jira.upexgalaxy.com/browse/BK-129#icft=BK-129) | TC10: POST name = 81 chars (boundary reject) → 422 | cookie session | 422 |
| [https://jira.upexgalaxy.com/browse/BK-130#icft=BK-130](https://jira.upexgalaxy.com/browse/BK-130#icft=BK-130) | TC11: GET RLS — User B cannot see User A tokens | Bearer PAT | 200 (own tokens only) |
| [https://jira.upexgalaxy.com/browse/BK-131#icft=BK-131](https://jira.upexgalaxy.com/browse/BK-131#icft=BK-131) | TC12: DELETE RLS — User B cannot revoke User A token → 404 | cookie session | 404 |
| [https://jira.upexgalaxy.com/browse/BK-132#icft=BK-132](https://jira.upexgalaxy.com/browse/BK-132#icft=BK-132) | TC13: DELETE already-revoked token → 404 | cookie session | 404 |
| [https://jira.upexgalaxy.com/browse/BK-133#icft=BK-133](https://jira.upexgalaxy.com/browse/BK-133#icft=BK-133) | TC14: Revoked PAT → 401 on subsequent API call | revoked PAT | 401 |

> ***ERROR:**** ****TC08 (BK-127) references known defect BK-117 (HIGH)*** — expected to FAIL until BK-117 is resolved.
TC08 is DISTINCT from TC07: TC07 tests an invalid enum string (e.g. "admin:all"), TC08 tests a valid scope ("workspace:admin") with insufficient role.

---

## UI-Deferred TCs (17 outlines)

Blocked on [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) (Settings Hub — Ready For Dev). Will activate when [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) reaches Ready For QA.

---

## Open PO questions (block UI TCs only)

1. Should revoked tokens appear in the list? Visual treatment?
2. Exact copy for revocation confirmation dialog?
3. Are expiry date and workspace binding shown in list row and form?
4. Clipboard API unavailability fallback?

---
_Synced from Jira by sync-jira-issues_
