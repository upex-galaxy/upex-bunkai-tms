# IMPROVEMENT: [BK-9] Module name field stores raw HTML tags — inconsistent with description sanitization

**Jira Key:** [BK-69](https://jira.upexgalaxy.com/browse/BK-69)
**Priority:** Low
**Status:** Ready For QA
**Components:** None

---

## Description

FINDING: The module name field stores raw HTML tags as-is (e.g. '<script>alert(1)</script>' stored literally in DB). The description field IS sanitized via sanitizeMarkdown() which strips dangerous HTML. CURRENT STATE: React JSX escapes the name on render — no XSS in current UI (confirmed). AC REFERENCE: Edge case AC from shift-left: 'HTML tags must be sanitized / stored as literal text.' Name stores as literal text but is NOT stripped like description. Inconsistency. RISK: If name is rendered in future non-React contexts (email templates, PDFs, exports), XSS risk exists. RECOMMENDATION: Apply sanitizeMarkdown() or a simple HTML-strip to the name field on save, same as description. EVIDENCE: DB row — name='<script>alert(1)</script>', path='script-alert-1-script'. ENVIRONMENT: staging | RELATED: BK-9

---

## Related Issues

- created: [BK-9](https://jira.upexgalaxy.com/browse/BK-9) - TMS-Module | Create modules with nested sub-modules

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 6/10/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** bk-9, improvement, sanitization, security

---

_Synced from Jira by sync-jira-issues_
