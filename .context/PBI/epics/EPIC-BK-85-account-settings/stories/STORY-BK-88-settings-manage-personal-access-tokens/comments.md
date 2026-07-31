# Comments for BK-88

[View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

---

### Carlos Alberto Chiavassa - 6/10/2026, 7:30:17 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

ATP DRAFT lives in the field (29 test outlines, 4 critical PO questions for sprint planning).

***Critical questions blocking sprint planning:***
1. Should revoked tokens appear in the list? If yes, what is the visual treatment?
2. What is the exact copy for the revocation confirmation dialog?
3. Are expiry date and workspace binding shown in the list row and issuance form?
4. What is the expected fallback when the Clipboard API is unavailable?

***Security review required (Technical Question #6):*** confirm token secret does not appear in server logs, client console, or error payloads; confirm mintPat() uses cryptographically secure randomness.

Refined on: 2026-06-10 | Outlines: 29 (Positive 9, Negative 11, Boundary 3, Integration 3, API 3) | Story quality: Needs Improvement

---

### Carlos Alberto Chiavassa - 6/12/2026, 5:46:21 PM

## QA Session Report — BK-88 (API-only, partial)

***Date******:**** 2026-06-12 | ****Tester******:**** Carlos Chiavassa | ****Environment******:*** staging

---

### Scope of this session

API surface only. UI testing deferred — BK-87 Settings Hub has not shipped (status: Ready For Dev). Story remains in ***Ready For Dev*** after this session.

---

### Critical finding: Privilege Escalation — BK-135

***TC08 FAIL*** — POST /api/v1/tokens allows member-role users to issue workspace:admin scoped tokens without 403 enforcement.

- Member-role user holds 19 active workspace:admin PATs (workspace_id=NULL — unscoped admin access across all workspaces)
- 136 active workspace:admin PATs confirmed across 24 staging users
- No role-gate exists on the token issuance path
- Bug: ***BK-135*** (severity crítica, type: security)

> ***Note******:*** BK-135 replaces BK-117, which was filed against BK-109 (cloned story — consolidated back to BK-88 per Ely's instruction). BK-117 will be deleted by Ely along with BK-109.

---

### TCs created (14 total — BK-120 to BK-133)

| Group | TCs | Status |
| --- | --- | --- |
| GET /api/v1/tokens (Bearer) | BK-121, BK-124, BK-130 | Not executed — deferred to full session |
| POST /api/v1/tokens (cookie session) | BK-120, BK-123, BK-126, ***BK-127***, BK-128, BK-129 | BK-127 executed (FAIL). Others deferred — cookie session required |
| DELETE /api/v1/tokens (cookie session) | BK-122, BK-125, BK-131, BK-132 | Deferred — cookie session required |
| Integration | BK-133 | Deferred |

---

### Blockers to QA sign-off

1. ***BK-135 must be fixed*** (privilege escalation — crítica security)
2. Full API execution requires cookie session (POST/DELETE) — Playwright magic-link setup needed
3. UI surface requires BK-87 to ship

ATP field updated to ACTIVE phase (API-only subset, 14 TCs). ATR field updated with this session's partial results.

---

### Ely - 7/30/2026, 1:28:52 PM

Mockup — Settings — Personal Access Tokens. Source: .context/designs/bunkai-test-management-tool/bk-85-account-settings/settings-tokens.html · spec: master-design-plan §4.10



---


_Synced from Jira by sync-jira-issues_
