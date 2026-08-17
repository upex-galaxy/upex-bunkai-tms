# BK-262 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-262)

# Shift-Left ATP DRAFT: BK-262 — PAT | Enforce capability scopes on every non-ATC route

***Status***: Refined — All Critical + Technical Questions Resolved — Ready for Estimation
***Full analysis***: `shift-left-refinement.md` in the Story's PBI folder (`.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-262-.../`) + the decisions comment on this issue.

## Central feasibility finding

`requireCapability()` (via `withApiHandler({ requires: [...] })`) is the real, live enforcement mechanism — already covering 25/82 handlers (all ATC, run-execution, and the 5 `workspace:admin` routes). This Story extends that pattern to the 49-handler gap. 2 of the 3 originally-published ACs already pass on unfixed code; only the module-create AC targets a genuine gap.

## Decisions (resolved 2026-08-14, see issue comment for full rationale)

1. `atc:read` required on GET across the 7 named route families.
2. AC3 (workspace-context rejection) narrowed to `workspace:admin` family only.
3. Reparented BK-183 -> BK-1 (Tenancy & Identity).
4. Delivery grouped into 2 PRs: Foundation+Authoring, then Reporting+Identity+Docs.
5. `traceability/route.test.ts:127-134` updated to assert `403` in the fixing PR.
6. `invites/accept` out of scope — follow-up debt.

## Coverage estimate

| Type | Count |
| --- | --- |
| Positive | 5 |
| Negative | 7 |
| Boundary | 2 |
| Integration | 3 |
| ***Total**** | ****17*** |

## Test outline names (Positive)

- Should create a module successfully with a PAT scoped `atc:write`
- Should bootstrap a workspace with any single-scope authenticated PAT
- Should read a non-ATC list/detail resource with a PAT scoped `atc:read`
- Should invite a member successfully with a PAT scoped `workspace:admin` bound to that workspace
- Should perform all 7 route-family actions unchanged via a cookie/session caller

## Test outline names (Negative)

- Should reject module creation with a PAT scoped only `atc:read`
- Should reject invite creation with a PAT scoped only `atc:read`
- Should reject a `workspace:admin`-gated delete with a PAT holding unrelated scopes
- Should reject any capability-gated request with an expired PAT (401, before the capability check)
- Should reject any capability-gated request with a revoked PAT (401, before the capability check)
- Should reject a `workspace:admin` action with a PAT holding no workspace binding
- Should reject a non-ATC GET with a PAT missing `atc:read`

## Test outline names (Boundary)

- Should succeed on the narrowest single-scope PAT that exactly matches a route's requirement
- Should reject when the narrowest single-scope PAT holds the wrong single scope

## Test outline names (Integration)

- Should confirm the capability check does not bypass RLS
- Should fail the route-capability coverage snapshot when a new route omits a posture (conditional on Slice 1 landing)
- Should apply capability enforcement consistently across all 7 named route families (parametrized sweep)

## Open items

None blocking — all Critical (PO) and Technical (Dev) questions resolved. See full refinement file for the 7 refined Given/When/Then scenarios, edge cases, risks, and recommended testing strategy.

---
_Synced from Jira by sync-jira-issues_
