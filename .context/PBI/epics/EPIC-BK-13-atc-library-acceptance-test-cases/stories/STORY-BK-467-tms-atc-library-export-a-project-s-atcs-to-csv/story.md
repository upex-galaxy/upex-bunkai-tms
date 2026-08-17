# 🚀 TMS-ATC Library | Export a Project's ATCs to CSV

**Jira Key:** [BK-467](https://jira.upexgalaxy.com/browse/BK-467)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** 1

---

## Overview

## User story

******As a**** **QA Lead*
**********I want to****** ****export a Project's ATC library as a CSV file***
**So that**** I can hand auditors and stakeholders a reviewable snapshot of the project's test-case inventory without assembling it by hand

## Context

No export capability exists anywhere in the product today. The existing Jira import machinery ([https://jira.upexgalaxy.com/browse/BK-17#icft=BK-17](https://jira.upexgalaxy.com/browse/BK-17#icft=BK-17)) only writes User Stories and Acceptance Criteria — it never touches ATCs. [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) exports a single User Story's evidence chain, a different entity boundary (see Out of Scope). This story is the first export capability at the ATC-library level.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 8/14/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Gianluca Módena
- **Labels:** Aurora, AutoDeployed, DeployedInQA, atc, csv-export, mvp

---

_Synced from Jira by sync-jira-issues_
