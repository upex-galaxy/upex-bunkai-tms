# Sprint Report Guide

> **Purpose**: Generate a development-oriented snapshot of the current sprint and backlog — epics, stories, PRs grouped by status — so the team (PM, PO, dev leads) can see at a glance what's blocked, what's in flight, what's ready to start, and what's done.
> **Output**: A markdown report assembled in the conversation (not persisted as a file unless the user asks).

---

## When to use

Read this reference whenever the user asks for any of:

- "sprint report" / "reporte de sprint" / "estado del sprint"
- "reporte de épicas y stories" / "progress report" / "what's in the sprint"
- "qué hay en el sprint" / "estado de los PRs" / "in-flight stories"
- "dashboard del backlog" / "snapshot del proyecto"

This is a **read-only PM visibility workflow**. It does not change Jira state, does not create issues, and does not write to `.context/`. Its single job is to gather state from the issue tracker (and optionally GitHub) and render a structured report.

---

## Prerequisites

- `[ISSUE_TRACKER_TOOL]` reachable (`acli` preferred — see the `/acli` skill — or MCP Atlassian as fallback). Resolve via the Tool Resolution table in `CLAUDE.md`.
- `{{PROJECT_KEY}}` available in `.agents/project.yaml` (ships with the cloned boilerplate; clone the full repo if missing).
- (Optional) `gh` authenticated against the project's GitHub repo if the user wants PR state included.

---

## Inputs to gather from the user

Before running, confirm:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SPRINT REPORT PARAMETERS                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Project key:     {{PROJECT_KEY}} (default — confirm with user)              │
│                                                                             │
│ Report scope:    ○ Active sprint only                                       │
│                  ○ Full backlog                                             │
│                  ○ Both (default)                                           │
│                                                                             │
│ Optional filters:                                                           │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Sprint name:     (e.g. "Sprint 5") — leave empty for openSprints()         │
│ Assignee:        (e.g. "Juan Perez") — empty = all                         │
│ Epic:            (e.g. "UPEX-100") — empty = all epics                     │
│                                                                             │
│ Include PRs:     ○ Yes (requires gh)   ○ No                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

If the user doesn't specify, default to: **Both scope**, **all assignees**, **all epics**, **PRs Yes if `gh` is available**.

---

## Workflow

### Step 0 — Discover issue types in the project (dynamic)

Different Jira projects use different issue type names. Before the main queries, fetch one sample issue and inspect its `issuetype`:

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = {{PROJECT_KEY}} ORDER BY created DESC"
  limit: 1
  fields: "issuetype"
```

Relevant types for a dev-oriented report:

| Type            | Description               | Include in report |
| --------------- | ------------------------- | ----------------- |
| **Epic**        | Containers for stories    | ✅ Always         |
| **Story**       | User-facing functionality | ✅ Always         |
| **Improvement** | Tech debt / enhancements  | ✅ If present     |
| **Task**        | Technical tasks / spikes  | ⚪ Optional       |

If the project uses alternate names (`Initiative` for Epic, `Feature` for Story, `Enhancement` for Improvement, `Technical Task` for Task, etc.), substitute throughout the queries below — see "Workflow adaptation" at the bottom.

### Step 1 — Get active epics

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = {{PROJECT_KEY}} AND issuetype = Epic AND status NOT IN (Done, Closed, Cancelled) ORDER BY priority DESC, created ASC"
  limit: 50
  fields: "summary,status,priority,assignee"
```

### Step 2 — Get active stories (sprint)

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = {{PROJECT_KEY}} AND issuetype IN (Story, Improvement, Task) AND status NOT IN (Done, Closed, Cancelled) ORDER BY status ASC, priority DESC"
  limit: 100
  fields: "summary,status,priority,assignee,issuetype,parent"
```

### Step 3 — Get backlog (if scope includes it)

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = {{PROJECT_KEY}} AND issuetype IN (Story, Improvement, Task) AND status IN (Backlog, 'To Do', Open) ORDER BY priority DESC, created ASC"
  limit: 100
  fields: "summary,status,priority,assignee,issuetype,parent"
```

### Step 4 — (Optional) Get PR state

If the user asked to include PRs and `gh` is authenticated:

```bash
# Open PRs
gh pr list --state open --json number,title,headRefName,author,isDraft,reviewDecision,labels

# Recently merged (last 7 days)
gh pr list --state merged --search "merged:>=$(date -d '7 days ago' +%Y-%m-%d)" --json number,title,mergedAt,author
```

Cross-reference `headRefName` against the ticket key (e.g. branch `feature/UPEX-123-...` → ticket `UPEX-123`) to associate each PR with its story.

### Step 5 — Group results by status

Bucket the issues by **status**, ordered by development urgency:

1. **BLOCKED** — critical, demands attention now
2. **In Progress** — active development
3. **In Review** — PR open
4. **Ready For Dev** — refined and waiting to start
5. **To Do / Backlog** — not yet pulled in
6. **Done** — completed in this sprint

**Type icons** (use these consistently in the output tables):

| Type        | Icon |
| ----------- | ---- |
| Epic        | 🎯   |
| Story       | 📗   |
| Improvement | 💡   |
| Task        | 📋   |

---

## Output template

Render the report in this exact structure (omit sections with zero items unless the absence itself is meaningful — e.g., always show BLOCKED so a green `✅ No items blocked` is visible).

```markdown
# 📋 Sprint Report - {{PROJECT_KEY}}

**Date:** {today}
**Sprint:** {sprint_name if filtered, else "openSprints()"}

---

## 🎯 Active epics ({count})

| Key   | Epic      | Status   | Stories total | Stories Done | Progress |
| ----- | --------- | -------- | ------------- | ------------ | -------- |
| {key} | {summary} | {status} | {n}           | {n}          | {%}      |

---

## 🔴 BLOCKED ({count})

{If items exist, show table. Otherwise: "No items blocked ✅"}

| Type     | Key   | Summary   | Priority   | Assignee   | Epic       |
| -------- | ----- | --------- | ---------- | ---------- | ---------- |
| 📗 Story | {key} | {summary} | {priority} | {assignee} | {epic-key} |

---

## 🟡 In Progress ({count})

| Type          | Key   | Summary   | Priority   | Assignee   | Epic       | PR      |
| ------------- | ----- | --------- | ---------- | ---------- | ---------- | ------- |
| {icon} {type} | {key} | {summary} | {priority} | {assignee} | {epic-key} | {pr#/–} |

---

## 🔵 In Review ({count})

> Stories with an open PR

| Type          | Key   | Summary   | Assignee   | PR    | Review status                                    |
| ------------- | ----- | --------- | ---------- | ----- | ------------------------------------------------ |
| {icon} {type} | {key} | {summary} | {assignee} | #{pr} | {APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED} |

---

## 🟦 Ready For Dev ({count})

| Type          | Key   | Summary   | Priority   | Assignee   | Epic       |
| ------------- | ----- | --------- | ---------- | ---------- | ---------- |
| {icon} {type} | {key} | {summary} | {priority} | {assignee} | {epic-key} |

---

## 📦 Backlog / To Do ({count})

> Awaiting prioritization or assignment

| Type          | Key   | Summary   | Priority   | Assignee   | Epic       |
| ------------- | ----- | --------- | ---------- | ---------- | ---------- |
| {icon} {type} | {key} | {summary} | {priority} | {assignee} | {epic-key} |

---

## ✅ Done this sprint ({count})

| Type          | Key   | Summary   | Assignee   | Merged          |
| ------------- | ----- | --------- | ---------- | --------------- |
| {icon} {type} | {key} | {summary} | {assignee} | {pr-merge-date} |

---

## 📊 Status summary

| Status        | Stories | Improvements | Tasks   | Total             |
| ------------- | ------- | ------------ | ------- | ----------------- |
| BLOCKED       | {n}     | {n}          | {n}     | {total}           |
| In Progress   | {n}     | {n}          | {n}     | {total}           |
| In Review     | {n}     | {n}          | {n}     | {total}           |
| Ready For Dev | {n}     | {n}          | {n}     | {total}           |
| Backlog       | {n}     | {n}          | {n}     | {total}           |
| Done          | {n}     | {n}          | {n}     | {total}           |
| **Total**     | **{n}** | **{n}**      | **{n}** | **{grand_total}** |

---

## 📈 Per-epic progress

| Epic          | Stories total | In Progress | In Review | Done | Progress |
| ------------- | ------------- | ----------- | --------- | ---- | -------- |
| 🎯 {epic-key} | {n}           | {n}         | {n}       | {n}  | {%}      |

---

## 🔀 Pull Requests (if requested)

### Open

| PR   | Title   | Author   | Branch   | Ticket   | Review     | Draft?   |
| ---- | ------- | -------- | -------- | -------- | ---------- | -------- |
| #{n} | {title} | {author} | {branch} | {ticket} | {decision} | {Yes/No} |

### Recently merged

| PR   | Title   | Author   | Merged | Ticket   |
| ---- | ------- | -------- | ------ | -------- |
| #{n} | {title} | {author} | {date} | {ticket} |

---

## 🎯 Key metrics

| Metric                     | Value                           |
| -------------------------- | ------------------------------- |
| **Blocked items**          | {blocked_count} {⚠️ if > 0}     |
| **Stories in development** | {in_progress_count}             |
| **Open PRs**               | {open_pr_count}                 |
| **PRs awaiting review**    | {review_required_count}         |
| **Stories completed**      | {done_count}                    |
| **Sprint progress**        | {(done / total_sprint) \* 100}% |

---

## ⚠️ Alerts

### Active blocks

{If BLOCKED items exist: list with type and block reason}

### In Progress without PR

{If In Progress stories have no associated PR for > N days: list}

### PRs without reviewers

{If open PRs lack reviewers or have been inactive: list}

### Issues without assignee

{If active (non-Backlog) issues have no assignee: list}
```

---

## JQL reference snippets

### Active sprint — stories and tasks

```jql
project = {{PROJECT_KEY}}
AND issuetype IN (Story, Improvement, Task)
AND sprint in openSprints()
ORDER BY status ASC, priority DESC
```

### Active epics

```jql
project = {{PROJECT_KEY}}
AND issuetype = Epic
AND status NOT IN (Done, Closed, Cancelled)
ORDER BY priority DESC
```

### Stories under a specific epic

```jql
project = {{PROJECT_KEY}}
AND issuetype = Story
AND parent = {EPIC-KEY}
ORDER BY status ASC, priority DESC
```

### Blocked issues

```jql
project = {{PROJECT_KEY}}
AND issuetype IN (Story, Improvement, Task)
AND status = "BLOCKED"
ORDER BY priority DESC
```

### Active issues without assignee

```jql
project = {{PROJECT_KEY}}
AND issuetype IN (Story, Improvement, Task)
AND assignee IS EMPTY
AND status NOT IN (Backlog, Done, Closed)
ORDER BY priority DESC
```

### Pending tech debt

```jql
project = {{PROJECT_KEY}}
AND issuetype = Improvement
AND status NOT IN (Done, Closed)
ORDER BY priority DESC
```

---

## Workflow adaptation

### Alternate type names per project

| Standard type | Common alternatives                   |
| ------------- | ------------------------------------- |
| Epic          | Initiative, Theme                     |
| Story         | User Story, Historia, Feature         |
| Improvement   | Enhancement, Technical Debt, Refactor |
| Task          | Technical Task, Dev Task, Spike       |

If unsure which types the project uses, run:

```jql
project = {{PROJECT_KEY}} ORDER BY created DESC
```

…and inspect the `issuetype` field on the results.

---

## Example run

### Input

```
Project: UPEX
Scope: Active sprint + Backlog
Include PRs: Yes
```

### Calls

```
// Step 1: Active epics
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = UPEX AND issuetype = Epic AND status NOT IN (Done, Closed, Cancelled) ORDER BY priority DESC"
  limit: 50
  fields: "summary,status,priority,assignee"

// Step 2: Active stories (all dev types)
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = UPEX AND issuetype IN (Story, Improvement, Task) AND status NOT IN (Done, Closed, Cancelled) ORDER BY status ASC, priority DESC"
  limit: 100
  fields: "summary,status,priority,assignee,issuetype,parent"

// Step 3: Backlog
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = UPEX AND issuetype IN (Story, Improvement, Task) AND status IN (Backlog, 'To Do', Open) ORDER BY priority DESC"
  limit: 100
  fields: "summary,status,priority,assignee,issuetype,parent"

// Step 4: Open PRs via gh
gh pr list --state open --json number,title,headRefName,author,isDraft,reviewDecision
```

### Expected output (excerpt)

```markdown
# 📋 Sprint Report - UPEX

**Date:** 2026-03-10
**Sprint:** Sprint 5

---

## 🎯 Active epics (2)

| Key         | Epic          | Status      | Stories total | Stories Done | Progress |
| ----------- | ------------- | ----------- | ------------- | ------------ | -------- |
| 🎯 UPEX-100 | Onboarding    | In Progress | 8             | 3            | 38%      |
| 🎯 UPEX-150 | Auth refactor | In Progress | 5             | 1            | 20%      |

---

## 🔴 BLOCKED (0)

No items blocked ✅

---

## 🟡 In Progress (3)

| Type           | Key      | Summary           | Priority | Assignee         | Epic     | PR  |
| -------------- | -------- | ----------------- | -------- | ---------------- | -------- | --- |
| 📗 Story       | UPEX-2   | User Registration | Highest  | Samuel Amonzabel | UPEX-100 | #42 |
| 📗 Story       | UPEX-4   | Password Recovery | High     | Maxe Aguilera    | UPEX-100 | –   |
| 💡 Improvement | UPEX-101 | Optimize queries  | Medium   | Dev Team         | UPEX-150 | –   |

---

## 🔵 In Review (2)

| Type     | Key    | Summary           | Assignee         | PR  | Review status     |
| -------- | ------ | ----------------- | ---------------- | --- | ----------------- |
| 📗 Story | UPEX-2 | User Registration | Samuel Amonzabel | #42 | APPROVED          |
| 📗 Story | UPEX-7 | Login flow        | Ana Garcia       | #45 | CHANGES_REQUESTED |

---

## 📊 Status summary

| Status      | Stories | Improvements | Tasks | Total  |
| ----------- | ------- | ------------ | ----- | ------ |
| BLOCKED     | 0       | 0            | 0     | 0      |
| In Progress | 2       | 1            | 0     | 3      |
| In Review   | 2       | 0            | 0     | 2      |
| Backlog     | 18      | 4            | 2     | 24     |
| Done        | 4       | 1            | 0     | 5      |
| **Total**   | **26**  | **6**        | **2** | **34** |

---

## ⚠️ Alerts

### In Progress without PR

- 📗 **UPEX-4** - Password Recovery (assigned 5 days ago, no PR yet)

### PRs without reviewers

- #45 - Login flow (open 3 days, no reviewers)
```

---

## Report variants

The user may ask for a slimmer cut. Adapt accordingly:

### Epics + progress only

```jql
project = {{PROJECT_KEY}}
AND issuetype = Epic
AND status NOT IN (Done, Closed)
ORDER BY priority DESC
```

### Stories only

```jql
project = {{PROJECT_KEY}}
AND issuetype = Story
AND status NOT IN (Done, Closed)
ORDER BY status ASC, priority DESC
```

### Tech debt focus

```jql
project = {{PROJECT_KEY}}
AND issuetype = Improvement
AND status NOT IN (Done, Closed)
ORDER BY priority DESC
```

### Quick metrics only

```markdown
## 📊 Sprint Status - {{PROJECT_KEY}}

| Metric            | Value |
| ----------------- | ----- |
| 🔴 Blocked        | 1 ⚠️  |
| 📗 Active stories | 16    |
| 🔀 Open PRs       | 6     |
| ✅ Completed      | 9     |
| 📈 Progress       | 36%   |
```

---

## Follow-up after generating the report

The report itself is read-only, but it almost always surfaces follow-up work. Suggest these next steps to the user when conditions are met:

- **BLOCKED items present** → investigate and unblock immediately (likely a `/sprint-development` planning session or escalation)
- **Open PRs with no activity** → push for reviews or reassign reviewers (consider `/git-flow-master` for PR hygiene)
- **In Progress stories without PR > N days** → follow up with assignee, possibly re-scope
- **Issues without assignee in active states** → assign owners
- **Backlog growing without prioritization** → schedule a refinement session and re-invoke `/product-management` → workflow B (add-feature) or D (story-refinement)
