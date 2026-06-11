# BUG: BK-8: Non-Latin (CJK/Cyrillic) project names rejected as name_no_alphanumeric

**Jira Key:** [BK-53](https://jira.upexgalaxy.com/browse/BK-53)
**Priority:** Medium
**Status:** Ready For QA
**Components:** None
**Fix Type:** Bugfix

---

## Description

## Summary

Project names written in non-Latin scripts (CJK, Cyrillic, etc.) are rejected with `422 name*no*alphanumeric`, even though they are valid human names. The alphanumeric guard is ASCII-only.

## Environment

Staging — https://staging-upexbunkai.vercel.app · API `/api/v1` · 2026-06-04.

## Severity / Type

Severity: ***Minor**** · Error type: ****functional*** (i18n usability).

## Steps to Reproduce

1. Authenticate as an active workspace member.
2. `POST /api/v1/workspaces/{id}/projects` with `{ "name": "日本語プロジェクト" }`.
3. Repeat with Cyrillic `{ "name": "Проект" }`.

## Expected Result

`201` — these are valid names with ≥1 letter. (For a multi-tenant SaaS, non-Latin project names should be allowed; slug may transliterate or fall back to a generated value.)

## Actual Result

Both return `422 validation*failed`, `details.reason = name*no_alphanumeric`. Latin-accented names work (`Café Münchën` → `cafe-munchen`), but CJK/Cyrillic are rejected.

## Root Cause (code-confirmed)

`hasAlphanumeric` in the projects route uses an ASCII-only class `[a-z0-9]`. Non-Latin letters fail the check, and `slugify` would also strip them to empty. Consider Unicode-aware validation (`\p{L}\p{N}`) and a transliteration/fallback for the slug.

## Impact

International users cannot name a project in their own script. Improvement-grade, but real for a product positioned as multi-tenant SaaS.

## Evidence

`test-session-memory.md` (T13b row).

---

## 🔍 Root Cause

**Category:** Code Error

---

## Related Issues

- is duplicated by: [BK-56](https://jira.upexgalaxy.com/browse/BK-56) - BK-8: Non-Latin (CJK/Cyrillic) project names rejected as name_no_alphanumeric

---

## Metadata

- **Created:** 6/3/2026
- **Updated:** 6/10/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** bk-8, sprint-defect, wave-1

---

_Synced from Jira by sync-jira-issues_
