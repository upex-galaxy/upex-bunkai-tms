# BK-372 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

Design plan §4.6 · bk-31-bug-reports/bug-detail.html

This slice writes the sync state that the frozen External tracker panel reads, but ships no part of that panel — slice c renders it. The mockup reference is carried here so the state this story records stays answerable to the four states the mockup froze.

Note the §5 divergence ruling 12177 recorded (decision 5): the frozen mockup models three sync states and no in-flight state, while an asynchronous send necessarily has one. The in-flight state reuses the existing in-flight grammar rather than introducing new copy. UI-only, no backend cost.

---
_Synced from Jira by sync-jira-issues_
