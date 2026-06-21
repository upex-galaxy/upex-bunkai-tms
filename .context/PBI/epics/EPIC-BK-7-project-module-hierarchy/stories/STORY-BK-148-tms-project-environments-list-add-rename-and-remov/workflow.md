# BK-148 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-148)

1. The Senior QA Engineer opens the project's settings and selects the Environments section.
2. The system lists the project's environments (seeded with "Staging" and "Production").
3. To add one, she enters a name and confirms; the system validates uniqueness, trimming, and length, then shows it in the list.
4. To rename one, she edits the name inline and confirms; the same validation rules apply.
5. To remove one, she chooses remove and confirms. If no run references it, it is removed. If a run references it, the system blocks the removal and explains why (PO-confirm default).
6. The updated environment list is immediately reflected wherever a run target is chosen.

---
_Synced from Jira by sync-jira-issues_
