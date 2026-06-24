# Tech Story: Enforce workspace:admin scope on admin endpoints (consumption-side)

**Jira Key:** [BK-167](https://jira.upexgalaxy.com/browse/BK-167)
**Status:** In Review
**Type:** Tech Story

---

## Description

After BK-135 fixed PAT **issuance** (a member can no longer mint a workspace:admin token), the workspace:admin scope is still NOT enforced when a token is **used**. requireScope (lib/api/middleware/bearer.ts) is dead code (0 call sites) and there are 0 requireCapability('workspace:admin') gates in app/api. The impersonation JWT carries no scopes (lib/api/user-jwt.ts), so RLS cannot see PAT scopes — capability enforcement must live in the TS layer (the requires:[] option of withApiHandler, already used by the ATC domain). This ticket wires workspace:admin enforcement into the admin endpoints, with a workspace_id context match so a workspace-scoped admin PAT cannot act on a different workspace.

## Acceptance Criteria (Gherkin)

### Scenario: PAT without workspace:admin is rejected on admin endpoints

Given a PAT whose scopes do NOT include workspace:admin
When it calls an admin endpoint (invite create / resend / revoke, or workspace settings PATCH)
Then the API returns 403 Forbidden and the operation does not occur

### Scenario: workspace-scoped admin PAT cannot cross workspaces

Given a PAT with workspace:admin scoped to workspace A (workspace_id = A)
When it calls an admin endpoint targeting workspace B
Then the API returns 403 Forbidden

### Scenario: admin PAT works on its own workspace

Given a PAT with workspace:admin scoped to workspace A held by an admin/owner of A
When it calls an admin endpoint targeting workspace A
Then the operation succeeds

### Scenario: cookie sessions unchanged

Given an admin/owner browser (cookie) session
When it calls the admin endpoints
Then it succeeds; and a member cookie session still gets 403 from the existing role check

## Scope

Gate invites POST + invite resend POST + invite DELETE + workspace PATCH (and invite list GET). Keep the existing workspace*members role checks (they gate cookie members; capability gate only constrains PAT callers). Add a shared helper for the workspace*id context match. Add tests asserting a non-admin-scoped PAT is rejected on each gated endpoint. Record the enforcement model in ADR-0006.

---

## Fields

### 🛠️ Spec Implementation Plan (Dev)

# Spec Implementation Plan (Dev) — BK-167

Follow-up A of BK-135. Enforce the workspace:admin scope on the consumption side. See ADR-0006.

## Steps

1. lib/api/principal.ts: add assertWorkspaceContext(principal, targetWorkspaceId). Cookie sessions (via='cookie') return (trusted UI; RLS+role gate them). Bearer with workspaceId=null -> 403 (no global admin). Bearer with workspaceId != targetWorkspaceId -> 403.
2. Add requires:['workspace:admin'] to handler options of: POST + GET /api/v1/workspaces/[id]/invites; POST + DELETE /api/v1/workspaces/[id]/invites/[inviteId]; PATCH /api/v1/workspaces/[id].
3. In each handler, after resolving the [id] workspace param, call assertWorkspaceContext(principal, workspaceId). Keep the existing workspace*members admin/owner role checks (they gate cookie members; the capability gate only constrains PAT callers since cookie sessions hold ALL*CAPABILITIES).
4. Tests: lib/api/workspace-context.test.ts — cookie passes; bearer null-ws -> throw; bearer mismatched ws -> throw; bearer matching ws -> ok.
5. ADR-0006 (Proposed): TS-layer capability gate (requires:[]) + workspace_id context match complements RLS; cookie = trusted UI.

## Out of scope

Non-ATC write endpoints broad audit = BK-168.

## Review Workload Forecast

Estimated: ~70 additions + ~10 deletions = ~80 lines. Risk: Low. Chain: single-pr. Decision needed: No.

### customfield_10000

{pullrequest={dataType=pullrequest, state=MERGED, stateCount=1}, json={"cachedValue":{"errors":[],"summary":{"pullrequest":{"overall":{"count":1,"lastUpdated":"2026-06-21T13:40:38.000-0300","stateCount":1,"state":"MERGED","dataType":"pullrequest","open":false},"byInstanceType":{"GitHub":{"count":1,"name":"GitHub"}}}}},"isStale":true}}

### customfield_10026

2026-06-21T13:04:53.849-0300

### customfield_10027

3_*:*_1_*:*_0_*|*_10027_*:*_1_*:*_310998

### customfield_10072

2026-06-21T13:04:53.849-0300

### Fix

Bugfix

### Rank

0|i0m9wv:

---

## Metadata

- **Created:** 6/21/2026
- **Updated:** 6/21/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
