# BK-226 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-226)

## Design intent — mockup pending

- ***Screen***: project runs view + a three-step "Upload CI results" modal (Choose file / Review mapping / Confirm).
- ***Layout in words***: step 1 — Test picker, environment picker, file drop zone; step 2 — mapping table (report entry, matched step, status), warning panel listing unmapped entries and uncovered steps with an acknowledgement checkbox; step 3 — summary (steps covered, verdict preview) and a Create run button.
- ***Key interactions***: drag-and-drop or browse for the file; acknowledgement checkbox gates the Confirm button; on success the modal closes and the new run row is highlighted in the runs view.

---
_Synced from Jira by sync-jira-issues_
