# BK-33 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-33)

- Three tag values are reserved with special meaning for filtering: smoke, sanity, and regression
- Custom tags are allowed freely and coexist with reserved tags on the same Test
- A Test cannot carry the same tag value more than once — duplicates collapse to a single tag
- Assigning tags replaces the Test's whole tag set; the new set fully determines how the Test is grouped and filtered
- A Test may have zero tags; removing all tags is valid and simply leaves the Test untagged
- Filtering by a reserved tag returns exactly the Tests carrying that tag and excludes all others
- An untagged Test does not appear under any tag-based suite filter
- Changing a Test's tags never alters the Test's chained ATCs or its ability to run
- Any workspace member who can edit the Test can change its tags; no extra permission is required

---
_Synced from Jira by sync-jira-issues_
