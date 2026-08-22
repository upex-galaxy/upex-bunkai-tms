# BK-507 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-507)

- Select ATCs on a Project's ATC list: a per-row selection control, a header control that selects or clears every row currently listed, and a live count of how many ATCs are selected
- A bulk-edit action that appears only while at least one ATC is selected and names how many ATCs it will change
- Three bulk-editable fields, one field per bulk-edit action: ***tags****, ****Module****, and ****layer*** (UI / API / Unit)
- Tag edits are per-tag and additive or subtractive — add tag X to every selected ATC, or remove tag Y from every selected ATC — never a wholesale replacement of each ATC's own tag set
- A confirmation step that states the exact change and the exact number of ATCs before anything is written
- ***Partial-failure reporting***: when some of the selected ATCs change and others do not, the outcome names how many succeeded, how many failed, and which ones failed with the reason for each
- Selection clears after a fully successful bulk edit; after a partial failure the ATCs that did not change stay selected so only those can be retried
- Screen states for the selection and bulk-edit surface: nothing selected, selection active, confirmation pending, in progress, fully succeeded, partially succeeded, fully failed

---
_Synced from Jira by sync-jira-issues_
