# BUG: BK-27: POST /api/v1/tests returns 500 Idempotency insert failed

**Jira Key:** [BK-248](https://jira.upexgalaxy.com/browse/BK-248)
**Priority:** Medium
**Status:** Ready For QA
**Components:** None

---

## Description

Found during QA automation 2026-07-22.

POST /api/v1/tests returns 500 Internal Server Error when Idempotency-Key header is provided.

**Steps:**

1. Authenticate with PAT
2. Create ATC via POST /api/v1/atcs
3. POST /api/v1/tests with Idempotency-Key + valid body
4. Observe 500 error

**Actual:** 500 - ```

**Expected:** 201 Created

**Impact:**

- Test Builder API non-functional for successful requests
- 4 QA automation tests blocked
- UI double-click protection and agent retry broken

Idempotency middleware at lib/api/idempotency.ts fails on insert into idempotency_keys table. Likely DB constraint or missing migration.

---

## Metadata

- **Created:** 7/22/2026
- **Updated:** 7/31/2026
- **Reporter:** Nahuel Gomez
- **Assignee:** Nahuel Gomez
- **Labels:** automation-found, bk-27, idempotency, regression-blocker

---

_Synced from Jira by sync-jira-issues_
