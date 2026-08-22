# BK-226 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-226)

Sara's pipeline finishes and drops a junit.xml next to the build artifacts. She opens Bunkai, hits "Upload CI results" in the runs view, picks the "Checkout happy path" Test and the Staging environment, and drops the file in. The preview maps four entries onto the four steps, flags two extra entries as unmapped; she acknowledges them and confirms. A finished automated run appears at the top of the runs view with a failed verdict — the checkout step failed. Next sprint, she moves the same flow into the pipeline itself using a token, and the uploads happen without her.

---
_Synced from Jira by sync-jira-issues_
