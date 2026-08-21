# DEFECT: WorkspaceSwitch: API: active-workspace switch not reflected in Bearer/PAT-authenticated GET /me

**Jira Key:** [BK-316](https://jira.upexgalaxy.com/browse/BK-316)
**Related Story:** [BK-6](https://jira.upexgalaxy.com/browse/BK-6) - TMS-Workspace | Switch between workspaces
**Priority:** High
**Status:** Closed
**Components:** Bunkai Workspaces
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

`POST /api/v1/me/active-workspace` returns 200 and the correct target-workspace body, but when the caller is authenticated via ***Bearer PAT**** (not cookie session), a subsequent `GET /api/v1/me` still reports the ****previous*** `active*workspace*id` — the switch never becomes visible to Bearer-authenticated calls.

This violates BK-6's own Business Rule: **"All subsequent API responses MUST reflect data scoped to the new active workspace"** — no exception is documented for Bearer/PAT auth.

## Steps to Reproduce

1. `POST /api/v1/auth/signin` with valid credentials → capture the session cookie AND the `pat.token` from the response body.
2. `GET /api/v1/me` using the ***Bearer PAT*** in `Authorization: Bearer <pat.token>` → note `active*workspace*id` (call it `W1`).
3. `POST /api/v1/me/active-workspace` with `{ "workspace_id": "<W2>" }` (a different workspace the same user is an active member of), using the same Bearer header → response is `200 { id: W2, slug, name, role }`.
4. `GET /api/v1/me` again, still using the ***same Bearer PAT*** → `active*workspace*id` is still `W1`, NOT `W2`.
5. Control check: repeat steps 1-4 using ***cookie-session auth only*** (no `Authorization` header, same cookie jar) → step 4 correctly returns `active*workspace*id: W2`.

## Actual Result

`GET /me` via Bearer PAT keeps reporting the pre-switch `active*workspace*id` after a `200` switch response. `auth.source` in the `GET /me` payload reads `"bearer"` in this path (vs `"cookie"` in the control case), confirming the two auth paths resolve tenancy scope differently.

## Expected Result

Per BK-6 Business Rules and AC ("Successful workspace switch" scenario): **"every subsequent API call is scoped to Workspace B"**, with no carve-out for the authentication mechanism used. `GET /me` (and any other scoped endpoint) should report the new `active*workspace*id` regardless of whether the caller authenticates via cookie or Bearer PAT.

## Impact

Any API client, CLI, or CI/automation suite that authenticates via PAT (Bearer) — which is the primary auth path for non-browser clients, including this repo's own test framework — silently keeps operating against the ***wrong workspace*** after calling the switch endpoint. No error is raised; the switch response itself looks successful. This breaks the single-source-of-truth guarantee the Business Rules explicitly require for tenancy scoping.

## Evidence

Reproduced twice, independently of any test framework, via raw `curl` against staging (`https://staging-upexbunkai.vercel.app`) with a persistent cookie jar:

```
# Bearer-authenticated path (BROKEN)
GET /me (Bearer)              -> active*workspace*id: a808499e... (bunkai-qa)
POST /me/active-workspace     -> 200 { id: 9a2c3de7..., slug: extra-test, name: "Extra Test", role: member }
GET /me (Bearer, same PAT)    -> active*workspace*id: a808499e...  <- STALE, expected 9a2c3de7...

# Cookie-only path (CORRECT, control case)
GET /me (cookie)              -> active*workspace*id: a808499e...
POST /me/active-workspace     -> 200 { id: 9a2c3de7..., slug: extra-test, name: "Extra Test", role: member }
GET /me (cookie)              -> active*workspace*id: 9a2c3de7...  <- correct
```

Also caught live by the new KATA regression test `tests/integration/workspace/switchActiveWorkspace.test.ts` (`@atc('BK-250')`), which asserts the same cross-endpoint invariant and fails deterministically against staging.

## Root Cause

Not diagnosed yet — this repo is the QA test-automation framework, not the application backend, so the middleware/session-resolution code isn't available to inspect here. Hypothesis: the Bearer/PAT authentication path resolves `active*workspace*id` from a source that isn't updated by the `bk*active*ws` cookie mutation the switch endpoint performs (e.g. a value cached at PAT-mint time, or a separate resolution branch that never re-reads the cookie for Bearer-authenticated requests).

---

## 🐞 Actual Result

GET /me via Bearer PAT keeps reporting the pre-switch `active*workspace*id` after a 200 switch response (`auth.source: "bearer"`). See Description for full repro + curl evidence.

---

## ✅ Expected Result

GET /me should report the new `active*workspace*id` for Bearer-authenticated calls too, per BK-6 Business Rules ("All subsequent API responses MUST reflect data scoped to the new active workspace") and AC ("every subsequent API call is scoped to Workspace B") — no auth-mechanism exception documented.

---

## 🚩 Workaround

Unconfirmed. Cookie-session auth (browser/UI clients) is NOT affected — only Bearer/PAT-authenticated clients hit this. No confirmed mitigation for PAT-based clients yet.

---

## 🧫 Evidence

Reproduced via raw curl against staging (bypassing Playwright entirely) — see Evidence section in Description. Also caught by the new KATA regression test `tests/integration/workspace/switchActiveWorkspace.test.ts` (`@atc('BK-250')`), which fails deterministically against staging.

---

## Related Issues

- causes: [BK-6](https://jira.upexgalaxy.com/browse/BK-6) - TMS-Workspace | Switch between workspaces
- relates to: [BK-182](https://jira.upexgalaxy.com/browse/BK-182) - Bearer run creation cannot resolve active workspace

---

## Metadata

- **Created:** 8/6/2026
- **Updated:** 8/20/2026
- **Reporter:** Luis Eduardo Flores Villarroel
- **Assignee:** Luis Eduardo Flores Villarroel

---

_Synced from Jira by sync-jira-issues_
