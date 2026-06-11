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


_Synced from Jira by sync-jira-issues_
