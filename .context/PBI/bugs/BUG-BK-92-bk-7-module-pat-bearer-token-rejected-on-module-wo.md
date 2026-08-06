# BUG: BK-7: Module: PAT bearer token rejected on module/workspace resource endpoints (401)

**Jira Key:** [BK-92](https://jira.upexgalaxy.com/browse/BK-92)
**Priority:** High
**Status:** Duplicated
**Components:** Tenancy & Identity

---

## Description

## Summary

PAT bearer tokens are rejected with 401 on module and workspace resource endpoints, despite working correctly on the identity endpoint (GET /api/v1/me). The PAT is documented as the headless/CLI authentication mechanism but is not honored by resource endpoints, which require session-cookie auth only.

---

## Steps to Reproduce

***Precondition:*** Valid PAT obtained via POST /api/v1/auth/api-tokens with scopes: atc:read, atc:write, workspace:admin

1. `PATCH https://staging-upexbunkai.vercel.app/api/v1/modules/{valid-module-id}` with `Authorization: Bearer {PAT_TOKEN}` and body `{"name": "Test Rename"}`
2. Observe HTTP 401 response: `{"error":{"code":"unauthorized","message":"You must be signed in.","request_id":"..."}}`
3. Reproduce also on `POST /api/v1/workspaces` — same 401

---

## Technical Analysis

- Network: PATCH /api/v1/modules/{id} — 401 unauthorized with PAT
- Network: POST /api/v1/workspaces — 401 unauthorized with PAT (same pattern)
- Network: GET /api/v1/me — 200 with same PAT (PAT is valid)
- PAT scopes tested: atc:read, atc:write, run:execute, workspace:admin
- Session cookie auth works for all module/workspace operations

---

## Impact

- Agents, CLI tools, and headless integrations that use PAT auth cannot perform module rename/delete operations
- Forces session-cookie workaround for all programmatic access to resource endpoints
- Inconsistent auth model: identity endpoints accept PAT; resource endpoints do not

---

## Related Stories

- Related: BK-10 (TC-I04)

---

## Related Issues

- duplicates: [BK-84](https://jira.upexgalaxy.com/browse/BK-84) - [Staging] PAT bearer auth rejected on member/owned-resource routes (Imports, Projects, Modules, Tokens) — requireAuth middleware regression

---

## Metadata

- **Created:** 6/8/2026
- **Updated:** 6/26/2026
- **Reporter:** Jorgelina Abdo
- **Assignee:** Jorgelina Abdo
- **Labels:** api, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
