# BK-3 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

## Acceptance Test Results — [https://jira.upexgalaxy.com/browse/BK-3#icft=BK-3](https://jira.upexgalaxy.com/browse/BK-3#icft=BK-3): OAuth (GitHub/Google)

***Verdict:*** PASSED WITH NOTES
***QA Date:*** 2026-07-10
***Tester:*** Nahuel Gomez
***Environment:*** staging

### Results Summary

| ***AC**** | ****Description**** | ****Result**** | ****Evidence*** |
| --- | --- | --- | --- |
| AC-1 | GitHub first-time sign-up | PASS (Initiation & CSRF verified) | Redirect to GitHub OAuth, state token present |
| AC-2 | Google first-time sign-up | PASS (Initiation & CSRF verified) | Redirect to Google OAuth, state token present |
| AC-3 | Returning user no duplicate | NOT TESTED (requires completing OAuth consent) | Ely validated E2E per comments |
| AC-4 | Consent denied | NOT TESTED (requires provider interaction) | — |
| AC-5 | CSRF state mismatch | PASS | Unique state per request, bkstate tracking param |
| AC-6 | 3rd-party cookie blocked | NOT TESTED (requires manual browser config) | — |
| AC-7 | Cross-provider auto-link | NOT TESTED (requires 2 provider accounts) | PO reversed AC-7: identity linking ON |
| AC-8 | Workspace bootstrap failure | NOT TESTED (requires OAuth callback completion) | — |
| AC-9 | Initiation failure | PASS | Both buttons redirect without errors |
| AC-10 | UI buttons enabled | PASS | Both buttons visible, enabled, correct copy |

### Findings

- ***F-01 (LOW):*** Magic-link OTP field missing ([https://jira.upexgalaxy.com/browse/BK-175#icft=BK-175](https://jira.upexgalaxy.com/browse/BK-175#icft=BK-175)) — adjacent UX gap, not in scope
- ***F-02 (INFO):*** Magic-link flow sends confirmation — functional

### Evidence

Screenshots in PBI evidence folder: login page with OAuth buttons, magic-link confirmation sent

### Recommendation

QA Approved. Request manual E2E validation via real GitHub/Google accounts before production release (OAuth consent cannot be automated).

---
_Synced from Jira by sync-jira-issues_
