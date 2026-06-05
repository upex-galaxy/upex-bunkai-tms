# BK-16 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-16)

| ***Rule**** | ****Constraint*** |
| --- | --- |
| Body size | Capped at 50 KB |
| Supported formatting | Headings, bullet/numbered lists, code blocks, links, blockquotes, tables |
| Safe links | Only http, https and mailto links are kept; other link types are dropped |
| Dangerous content | Scripts, embedded frames, inline styles and event handlers are removed |
| Defense in depth | Content is cleaned both when saved and when displayed |

---
_Synced from Jira by sync-jira-issues_
