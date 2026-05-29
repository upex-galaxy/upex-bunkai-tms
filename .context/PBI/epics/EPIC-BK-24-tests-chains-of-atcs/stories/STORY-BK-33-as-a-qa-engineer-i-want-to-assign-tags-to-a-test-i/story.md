# As a QA Engineer, I want to assign tags to a Test, including the reserved smoke, sanity, and regression tags, so that my Tests are grouped and filtered into the right suites.

**Jira Key:** [BK-33](https://upexgalaxy67.atlassian.net/browse/BK-33)
**Epic:** [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-018

## User story

***As a*** QA Engineer

***I want to*** assign and replace the set of tags on a Test, using both reserved suite tags (smoke, sanity, regression) and my own custom tags

***So that*** my Tests are automatically grouped and filterable into the right suites without maintaining separate lists by hand

## Definition of done

- [ ] I can assign one or more tags to a Test and see them displayed on the Test
- [ ] The reserved tags smoke, sanity, and regression are recognized and drive suite filtering
- [ ] I can add custom tags of my own wording alongside reserved tags
- [ ] Replacing the tag set on a Test updates how that Test is grouped and filtered
- [ ] Filtering Tests by a reserved tag returns exactly the Tests carrying that tag
- [ ] Removing all tags from a Test is allowed and leaves it untagged
- [ ] A Test cannot carry the same tag twice

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Story (1)

- [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27): As a QA Engineer I want to assemble a Test by chaining ATCs from my workspace so that I can run the validations together when verifying a User Story _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:50.908Z_
