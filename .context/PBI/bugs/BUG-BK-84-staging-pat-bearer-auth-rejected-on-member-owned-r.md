# BUG: [Staging] PAT bearer auth rejected on member/owned-resource routes (Imports, Projects, Modules, Tokens) — requireAuth middleware regression

**Jira Key:** [BK-84](https://jira.upexgalaxy.com/browse/BK-84)
**Priority:** Highest
**Status:** Closed
**Components:** Tenancy & Identity

---

## Description

**SUMMARY**
A valid, unrevoked, freshly-minted Personal Access Token (`bk*pat***`) authenticates successfully against `/api/v1/me` and `/api/v1/workspaces` (200) but is rejected with `401 {"code":"unauthorized","message":"You must be signed in."}` on essentially every member-only / owned-resource route on staging: `POST/GET /api/v1/imports**`, `POST /api/v1/workspaces/{id}/projects`, `POST /api/v1/projects/{id}/modules`, `POST /api/v1/me/active-workspace`, `GET /api/v1/tokens`. This is a staging-wide `requireAuth` middleware regression — not isolated to any single feature.

---

**STEPS TO REPRODUCE**

#### Step 1 - `POST /api/v1/auth/signin` with valid staging credentials -> 200, mint a fresh PAT (`bk*pat**`)
#### Step 2 - `GET /api/v1/me` with `Authorization: Bearer <PAT>` -> 200 (works correctly, returns user + workspaces + active*workspace*id)
#### Step 3 - `POST /api/v1/imports` (or any of: `POST /workspaces/{id}/projects`, `POST /projects/{id}/modules`, `POST /me/active-workspace`, `GET /tokens`) with the SAME bearer token
#### Step 4 - Observe: `401 {"code":"unauthorized","message":"You must be signed in."}` -- on the SAME token that just succeeded on `/me` and `/workspaces`

---

**TECHNICAL ANALYSIS**

- **File:** `api/schemas/auth.types.ts:70,81` -- repo's own type facade documents "PAT token (bk*pat**) for Bearer auth on requireAuth endpoints"; our usage matches the documented contract exactly
- **Function:** `requireAuth` middleware (route-handler tier)
- **Network:** `GET /me` 200, `GET /workspaces` 200, `POST /imports` 401, `GET /imports/{id}` 401, `POST /workspaces/{id}/projects` 401, `POST /projects/{id}/modules` 401, `POST /me/active-workspace` 401, `GET /tokens` 401 -- all same bearer token in the same session
- **Console:** `{"code":"unauthorized","message":"You must be signed in."}`

---

**VERIFICATION PERFORMED**

- Re-tested with a SECOND freshly-minted PAT (new `signin` call) -- identical 401s. Rules out token staleness / expiry / clock-skew.
- DB-verified the token is genuinely valid: `access*tokens` row has `revoked*at IS NULL`, no expiry set, `last*used*at` populated (proves the token was accepted at least once).
- Conclusion: the `requireAuth` middleware accepts the PAT bearer only for a narrow Identity-tier allowlist (`/me`, `/workspaces`) and rejects it on essentially every member-only / owned-resource route -- including routes entirely unrelated to Imports (Projects, Modules, Tokens), which rules out an Imports-specific cause.

---

**HYPOTHESES (untested -- for dev triage)**

- (a) A route-allowlist bug in the bearer-auth middleware that only covers Identity-tier endpoints
- (b) A scope mismatch -- the signin-minted PAT carries scopes `atc:read, atc:write, run:execute, workspace:admin`, which may not map to the `imports:**` / `projects:**` permissions the gated routes expect
- Recommended first triage step: verify whether browser/cookie-session auth (Supabase session cookies) reaches these same routes where PAT-bearer fails -- this isolates a "PAT-tooling gap" (workaround exists) from a "full route outage" (confirmed staging-wide defect)

---

**IMPACT**

- Blocks BK-17 (Jira Import) QA entirely -- 0 of 22 planned ATP test outlines executable; AC1-AC6 all DEFERRED
- Also blocks any staging QA/dev work on Projects, Modules, and Token management performed via API/PAT
- If the same gap exists in production, it would block real users from using these features through API integrations

---

**WORKAROUND**

UNKNOWN -- not yet verified whether browser/cookie-session auth (Supabase session cookies) reaches these routes where PAT-bearer fails. Recommend that as the first triage step; it would isolate "PAT-tooling gap" from "full route outage".

---

**RELATED STORIES**

- Blocks: [BK-17] -- Async one-way Jira import by JQL (Jira Import | Pull Jira issues by JQL). QA Stage 2 for BK-17 is paused pending resolution of this defect.

---

**EVIDENCE**

- Canonical repro record: `.context/PBI/epics/EPIC-BK-12-user-stories-acceptance-criteria/stories/STORY-BK-17-async-one-way-jira-import-by-jql-adf-markdown-idem/test-session-memory.md`, section "Smoke Test Verdict -- 2026-06-07T13:53Z -- NO-GO (BLOCKING)"
- Raw request/response captures: `/tmp/bk17-atp/{login.json, login2.json, me.json, post*probe.json, post*probe2.json, known*job2.json, malformed.json, create*proj.json, create_mod.json, tokens.json}` (ephemeral working dir, re-runnable from the repro steps above)

---

**ROOT CAUSE (TENTATIVE)**

Not yet confirmed -- pending dev triage. Best current hypothesis: environment/config-level (`environment_error`), specifically a route-allowlist gap in the `requireAuth` middleware on staging. Set as TENTATIVE; do not treat as final until a developer confirms.

---

## Related Issues

- is blocked by: [BK-17](https://jira.upexgalaxy.com/browse/BK-17) - Jira Import | Pull Jira issues by JQL
- is duplicated by: [BK-92](https://jira.upexgalaxy.com/browse/BK-92) - BK-7: Module: PAT bearer token rejected on module/workspace resource endpoints (401)
- is duplicated by: [BK-93](https://jira.upexgalaxy.com/browse/BK-93) - BK-7: Module: PAT bearer token rejected on module/workspace resource endpoints (401)

---

## Metadata

- **Created:** 6/7/2026
- **Updated:** 6/26/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** auth, blocker, bug, integration, staging

---

_Synced from Jira by sync-jira-issues_
