# Bug and defect fixing

> Read a bug from Jira, reproduce it, triage it, fix it with the smallest change, verify, open the PR and document the fix in Jira.

---

## Purpose

This workflow takes a bug reported during testing or in production and carries it to Ready For QA:

1. Gather the full context from Jira (issue, comments, links, parent story).
2. Reproduce the bug with the tools available.
3. Triage it: real bug, enhancement, working as designed, duplicate, or deferred.
4. Implement a minimal fix that follows the code standards.
5. Verify the fix: types, lint, build, tests and a manual check.
6. Create the branch, commit and PR.
7. Document root cause and fix in Jira.
8. Give feedback on the bug report (optional, only on request).

Prerequisites:

- The bug exists in Jira.
- `[ISSUE_TRACKER_TOOL]` resolves (for example the Atlassian/Jira MCP).
- The GitHub CLI (`gh`) is installed and authenticated.
- Optional: `/playwright-cli` for browser reproduction (session rules in `live-ui-validation.md` §3), an API client such as Postman MCP, and Context7 MCP for library docs.

## With nobody at the keyboard

Each point where this workflow would wait for a person has a path for the three ways it runs. The rulings behind them are in `agentic-dev-core/references/decision-protocol.md` (§5.2 covers "no person at the wheel"); this table only places them in the workflow.

| Wait point | A person is present | Supervised worker | Routine with nobody |
| --- | --- | --- | --- |
| Git strategy differs from the default (Git strategy section) | Ask. | The launcher answers. | Use `git_strategy` from `.agents/project.yaml`; report it as DECIDED. |
| Slug does not resolve, option 2 of the fallback | Ask which field maps. | The launcher answers. | Take fallback 3 (put the information in the Jira comment) and say so. |
| Possible duplicate (Phase 1) | Offer the three options. | Send the question to the launcher. | Decide by evidence: same root cause is a duplicate, otherwise continue as a separate bug. Report DECIDED. |
| Not reproducible, WAD or enhancement (Phases 2 and 3) | Offer the options. | Send the question to the launcher. | The delegating brief covers tracker writes for this bug; without one, record the finding in the escalation log and stop before any Jira write. |
| Fix needs a breaking change (Case 2) | Stop and ask the user or the Product Owner / Business Analyst (delegated). | Escalate to the launcher. | Escalation log entry, then stop on this bug and move to the next within the run's cap. |
| Insufficient information (Case 5) | Ask the reporter through Jira. | Same. | Comment with the specific questions only when the brief covers tracker writes; the bug stays `open`. |

Phase 8 never waits: it runs only when the user asks for it.

---

## Tools and access

Check these before starting.

### Jira: reads go through the sync, writes through `[ISSUE_TRACKER_TOOL]`

The two directions use different tools.

- Detailed reads (the bug custom fields `actual_result`, `expected_result`, `error_type`, `severity`, `test_environment`, `root_cause`, `fix`, plus the description and the comments) come from `bun run jira:sync-issues get <BUG-KEY> --include-comments`. Then read every file the sync materialized under `.context/PBI/`: one `.md` per field and `comments.md`. The sync resolves every slug and converts ADF to Markdown. Fixing a bug on a partial read is how fields and comment context get missed, so read the whole folder.
- `[ISSUE_TRACKER_TOOL]` `view` returns `null` for `customfield_*`, so it is never the way to read a bug custom field.
- Writes (status transitions, documentation comments, custom fields) go through `[ISSUE_TRACKER_TOOL]`: `/acli` first, the Atlassian MCP as fallback, per `.agents/instructions/agent-tool-resolution.md` §6.

Both must work before you start: the sync succeeds (when it fails on auth, log in through `[ISSUE_TRACKER_TOOL]` and re-run it) and `[ISSUE_TRACKER_TOOL]` resolves for transitions and comments. When either fails, tell the user what is missing:

```
Jira access required

This workflow needs:
- READ bug details + custom fields + comments: bun run jira:sync-issues get <BUG-KEY> --include-comments
- WRITE status transitions + documentation comments: [ISSUE_TRACKER_TOOL]

If the sync errors with an auth failure, authenticate via [ISSUE_TRACKER_TOOL] and re-run.
Cannot proceed without Jira read (sync) and write ([ISSUE_TRACKER_TOOL]) access.
```

For the operation-to-tool matrix see `.agents/skills/product-management/references/jira-operations.md`; for the two ADF rich-text bugs and their workarounds see `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

### GitHub CLI (`gh`)

Run `gh --version`. When it is missing, tell the user:

```
GitHub CLI required

This workflow uses it to create branches, push changes and open Pull Requests.

How to install:
1. Visit: https://cli.github.com/
2. Install for your OS
3. Authenticate: `gh auth login`
```

### Optional tools

- Browser testing, for UI bugs that need visual verification, reproduction of an interaction, or before and after screenshots: `/playwright-cli`, in a named in-memory session logged in as the declared automation identity (`live-ui-validation.md` §3 and `live-ui-identity.md`). Without it, write manual reproduction steps and ask the user to verify visually.
- API testing (Postman MCP or an HTTP client), for API, data-validation and backend-error bugs.
- Context7 MCP, to check library behavior, correct API usage and known dependency issues while analyzing the root cause.

To attach a screenshot as inline evidence (on the bug or in `{{jira.evidence}}`), use the bundled helper. `![](path)` does not embed in Jira ADF, and the helper uploads the file and posts it as a real image, so a reviewer sees the before and after state without opening the Attachments panel. One call per image:

```bash
bun .agents/skills/acli/scripts/jira-attach-media.ts <BUG-KEY> ./before.png --caption "Before fix" --publish
bun .agents/skills/acli/scripts/jira-attach-media.ts <BUG-KEY> ./after.png  --caption "After fix"  --publish
```

The recipe and when to use it are in `.agents/skills/acli/references/adf-authoring-style.md` §media.

---

## Custom fields

Jira's numeric field ids (`customfield_NNNNN`) differ per workspace, so they never appear in this skill. Every field is referenced as `{{jira.<slug>}}`, resolved against the catalog in `.agents/jira-required.yaml`. At runtime the slug resolves to the numeric id through `.agents/jira-fields.json`, which `bun run jira:sync-fields` fills. When a slug is missing from the target workspace, the catalog declares its fallback and `bun run jira:check` warns.

### Bug fields

| Slug | Jira field | Type | Values and use |
| --- | --- | --- | --- |
| `{{jira.actual_result}}` | 🐞 Actual Result | Textarea | What happened (the bug behavior) |
| `{{jira.expected_result}}` | ✅ Expected Result | Textarea | What should have happened |
| `{{jira.error_type}}` | Error Type | Dropdown | Functional / Visual / Content / Performance / Crash / Data / Integration / Security |
| `{{jira.severity}}` | SEVERITY | Dropdown | Crítica (critical) / Mayor (major) / Moderada (moderate) / Menor (minor) / Trivial. These are the dropdown's own Spanish values. |
| `{{jira.test_environment}}` | Test Environment | Dropdown | Dev / QA / UAT / Staging / Production |
| `{{jira.root_cause}}` | Root Cause🐞 | Dropdown | See the categories below |
| `{{jira.workaround}}` | Workaround | Textarea | Temporary solution until the definitive fix lands |
| `{{jira.evidence}}` | Evidence | Attachments/links | Screenshots, logs, traces |
| `{{jira.fix}}` | Fix | Radio | Bugfix (standard) / Hotfix (critical, immediate deploy) |

### Root cause categories

| Value | When to use |
| --- | --- |
| `Code Error` | Bug in source code logic |
| `Config/Env Error` | Environment variables, configs, feature flags |
| `Environment Error` | Infrastructure, server, deploy, CI/CD |
| `Requirement Error` | Unclear spec, ambiguous AC, missing requirement |
| `Working As Designed (WAD)` | Not a bug, works as intended |
| `Third-Party Error` | Bug in an external library or framework |
| `Integration Error` | External service down, third-party API failed |
| `Data Error` | Corrupted data in the DB, failed migration |

### Severity to priority

| SEVERITY | Jira priority | Action |
| --- | --- | --- |
| Crítica | Highest | Hotfix flow (immediate) |
| Mayor | High | Standard fix (high priority) |
| Moderada | Medium | Standard fix (normal) |
| Menor | Low | Standard fix (low priority) |
| Trivial | Lowest | Standard fix (when available) |

### Fallback when a slug does not resolve

Apply this when a `{{jira.<slug>}}` has no matching field in the target workspace (per `.agents/jira-fields.json` or a runtime probe). Try the options in order.

1. Search the workspace for an equivalent field:

   ```
   [ISSUE_TRACKER_TOOL] search_fields(keyword="root cause")  // or "severity", "error type", etc.
   ```

   When one exists, point the slug at it in `.agents/jira-required.yaml` (or add an alias slug), re-run `bun run jira:sync-fields`, tell the user "Slug `<slug>` now resolves to the discovered field in this workspace", and continue with the fix workflow.

2. Ask the user to define the field:

   ```
   Custom field not found

   The slug `{{jira.<slug>}}` ("[Field Name]") doesn't resolve to a present field in this workspace.

   Options:
   1. Tell me which existing workspace field maps to this slug, and I'll update `.agents/jira-required.yaml`.
   2. Skip this field and include the information in the Jira comment.
   3. Proceed without updating this field.

   Which would you prefer?
   ```

3. Last resort: omit the custom field from the update, put the information in the Jira comment in structured form, and tell the user which fields were unavailable.

---

## Required context

Gather this before starting.

### 1. The bug issue

Run the sync from "Tools and access" and read the whole materialized folder. Extract:

- Summary and description, steps to reproduce.
- Actual Result against Expected Result.
- Error Type, Severity and Test Environment.
- Root Cause (often empty at this point).
- Every comment, from `comments.md`: context, discussion, earlier attempts.
- Attachments (screenshots, logs), linked in the synced fields.

When a field's `.md` is a stub, the field is absent on this instance. The stub points at the fallback comment, which you read in `comments.md` (per the `fallback:` key in `.agents/jira-required.yaml`). A field counts as empty only after you have checked its `.md`, `comments.md` and the description.

### 2. Linked issues

- The parent user story, for the original requirement and its AC.
- Related bugs, for duplicates.
- Blocking and blocked-by links, for dependencies that affect the fix.

### 3. Code standards (when implementing the fix)

```
.agents/skills/sprint-development/references/
├── code-standards.md           # Coding standards (DRY, naming, TypeScript)
├── error-handling.md           # Error handling patterns
└── data-testid-standards.md    # Test attributes (if UI fix)
```

### 4. Git strategy

The default branching pattern, which the user can override:

| Type | Branch pattern | Target |
| --- | --- | --- |
| Bugfix | `fix/{ISSUE_KEY}/{short-description}` | `git_strategy.branches.integration` (the production branch when integration is null) |
| Hotfix | `hotfix/{ISSUE_KEY}/{short-description}` | `git_strategy.branches.production` |

Ask the user whether they use a different git strategy before creating the branch (see "With nobody at the keyboard" for the other two cases).

---

## Workflow

### Phase 1: Bug context gathering

Goal: understand the bug completely before touching code.

Step 1. Read the bug through the sync (`bun run jira:sync-issues get [BUG_ID] --include-comments`) and then the materialized files under `.context/PBI/`: each per-field `.md` (Actual and Expected Result, Error Type, Severity, Test Environment, Root Cause, Workaround, Evidence, Fix), the description and `comments.md`. One command yields the complete context: summary, description, status, changelog-derived fields, comments and custom field values.

Step 2. Summarize what you found:

```markdown
## Bug Analysis: [BUG_ID]

**Summary:** [Title]
**Reported by:** [Reporter] on [Date]
**Assignee:** [Assignee or Unassigned]

**Classification:**
| Field | Value |
| --------------- | --------------- |
| Error Type | [Type] |
| Severity | [Severity] |
| Environment | [Environment] |
| Priority | [Priority] |

**Steps to Reproduce:**

1. [Step 1]
2. [Step 2]
   ...

**Expected Result:**
[Expected behavior]

**Actual Result:**
[Actual behavior/bug]

**Comments Summary:** [X comments]

- [Key points from discussion]

**Attachments:** [List or "None"]

**Linked Issues:**

- Parent Story: [STORY-XXX] or "Not linked"
- Related Bugs: [List or "None"]
```

Step 3. Check for duplicates:

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = [PROJECT] AND type = Bug AND status != Done AND summary ~ '[keywords]' AND key != [CURRENT_BUG]"
```

When a likely duplicate turns up, put the options to the user:

```
Potential duplicate detected

This bug may be a duplicate of [EXISTING-BUG]:
- Summary: [Summary]
- Status: [Status]
- Similarity: [What matches]

Options:
1. Mark as duplicate and link to [EXISTING-BUG]
2. Continue as separate bug (different root cause)
3. Let me investigate further

Which would you prefer?
```

---

### Phase 2: Bug reproduction

Goal: confirm the bug is reproducible before implementing a fix.

| Bug type | Reproduction method |
| --- | --- |
| UI bug | Browser testing tools, when available |
| API bug | API testing tools or curl commands |
| Code or logic bug | Code inspection and trace |
| Data bug | Database queries or API verification |

For a UI bug (with browser tools): open the affected page, follow the steps exactly, capture a screenshot when the bug shows, and note console errors and network failures.

For an API bug: replay the call with the same parameters, capture the response and status code, and compare with the expected behavior.

For a code or logic bug: find the code path from the description, trace the logic, and locate where the behavior diverges from the expected one.

Write the result down:

```markdown
## Reproduction Results

**Attempt 1:** [Date/Time]

- Steps executed: [List]
- Result: Reproduced / Not reproduced / Intermittent
- Evidence: [Screenshot path / Log excerpt / None]

**Conclusion:**

- [ ] Bug confirmed reproducible, proceed to Phase 3
- [ ] Bug NOT reproducible, request more info
- [ ] Bug is intermittent, note timing/race condition
```

When you cannot reproduce it, say so and offer the options:

```
Unable to reproduce bug

I followed the steps but could not reproduce the issue.

Possible reasons:
1. Environment difference (I'm on [env], bug reported on [env])
2. Missing preconditions (user state, data setup)
3. Bug already fixed in current code
4. Timing/race condition issue

Options:
1. Add a Jira comment requesting more details from the reporter
2. Check git history for recent fixes that might have resolved this
3. Close as "Cannot Reproduce" with documentation

Which would you prefer?
```

When the cause is not obvious from the report, or the bug reproduces only sometimes, `Call the Skill tool with "diagnosing-bugs"` and follow it through all six phases. Here you go on to fix the bug, which that skill's diagnosis alone does not do. Form no hypothesis before you have a command that goes red on the bug. Its regression test goes in at the seam the plan named; when no seam can host it, the missing seam is a finding for the review notes. Its cleanup phase leaves no `[DEBUG-...]` line behind. With nobody at the keyboard, follow that skill's own unattended lines: when no loop can be built it ends at its Phase 1 with the list of what was tried, and you record that as an escalation entry (a clean stop, `decision-protocol.md` §5.2) and move to the next bug within the run's cap. When the skill is not installed, keep the reproduction steps above, write down the failing command before you form a hypothesis, and say once that the diagnosis method was not available.

---

### Phase 3: Triage and decision

Goal: pick the right course of action from the analysis.

| Finding | Action | Jira transition (slug, then status) |
| --- | --- | --- |
| Real bug, reproducible | Proceed to fix | `start_fixing` → `in_progress` |
| Duplicate of an existing bug | Link and close | `is_duplicated` → `duplicated` |
| Not a bug (works as designed) | Document the reasoning | `is_wad` → `rejected` |
| Enhancement request | Reclassify as enhancement | `is_not_a_bug` → `enhancement` |
| Cannot reproduce | Request more info or close | comment, then `is_cnr` → `cannot_reproduce` (or leave `open`) |
| Deferred (low priority or risk) | Document and defer | `defer` → `deferred` |

Slugs resolve through `{{jira.transition.bug.<slug>}}` (the same slugs serve `defect` and `improvement`). A slug this project's catalog lacks follows the unmapped-status fallback in `agentic-dev-core/references/artifact-lifecycle.md` §4: never a remembered id, never a status name typed from memory.

For a real bug, decide whether it is a hotfix:

```markdown
## Fix Type Determination

**Severity:** [Crítica/Mayor/Moderada/Menor/Trivial]
**Environment:** [Dev/QA/UAT/Staging/Production]

**Hotfix criteria:**

- [ ] Severity is "Crítica"
- [ ] Found in Production environment
- [ ] Blocking a critical business flow

**Decision:**

- [ ] HOTFIX: `hotfix/*` branch, PR to the production branch (`git_strategy.branches.production`)
- [ ] BUGFIX: `fix/*` branch, PR to the integration branch (`git_strategy.branches.integration`)
```

For a "not a bug" finding, explain it to the user:

```
I've analyzed this issue and determined it's NOT a bug.

Classification: Working As Designed (WAD)

Analysis:
[Detailed explanation of why this is expected behavior]

Reference:
- AC from [STORY-XXX]: "[Quote the AC]"
- Design decision: [Reference if documented]

Recommendation:
[Close as WAD / Convert to enhancement / Other]

Do you want me to:
1. Close this issue with documentation
2. Convert to enhancement request
3. Let me investigate further
```

For a real bug, move it to In Progress:

```
Use [ISSUE_TRACKER_TOOL] to transition issue:
  issue_key: "[BUG_ID]"
  transition: {{jira.transition.bug.start_fixing}}
```

Parent story in `blocked` (defect loop): when QA filed this defect from testing, the parent story sits in `blocked` (QA fired `defect_reported`). Starting the fix also moves the story. Fire `fix_defect` (`blocked` to `in_progress`) on the parent story, read its status back, and keep it there while the fix is built and reviewed. The defect and the story each have their own transitions, and moving one never moves the other.

---

### Phase 4: Implementing the fix

Goal: a minimal, targeted fix that follows the code standards.

Step 1. Analyze the root cause and write it down:

```markdown
## Root Cause Analysis

**Category:** [Code Error / Config Error / Third-Party / etc.]

**Location:**

- File: `[path/to/file.ts]`
- Function/Component: `[functionName / ComponentName]`
- Line(s): [approximate lines]

**Technical Explanation:**
[Detailed explanation of what causes the bug]

**Why it happens:**
[The logic error / missing check / incorrect assumption]
```

Step 2. Create the fix branch from the Phase 3 decision:

```bash
# For standard BUGFIX:
git checkout -b fix/[ISSUE_KEY]/[short-description]
# Example: git checkout -b fix/PROJ-123/email-validation

# For HOTFIX (critical production bug):
git checkout -b hotfix/[ISSUE_KEY]/[short-description]
# Example: git checkout -b hotfix/PROJ-456/payment-crash
```

Step 3. Implement the fix:

- Change only what is broken. Refactor only what is directly tied to the bug.
- Follow `references/code-standards.md` and `references/error-handling.md`.
- Add a `data-testid` when a UI element is involved, for future automation.
- Consider the edge cases and related scenarios the change might affect.

Document the change:

````markdown
## Fix Implementation

**Files Modified:**
| File | Change Description |
| ---- | ------------------ |
| `[file1.ts]` | [What changed] |
| `[file2.ts]` | [What changed] |

**Before (problematic code):**

```[language]
[old code snippet]
```

**After (fixed code):**

```[language]
[new code snippet]
```

**Why this fixes it:**
[Explanation of how the fix addresses the root cause]
````

---

### Phase 5: Verifying the fix

Goal: the fix works and breaks nothing.

Step 1. Run the code quality checks with the app's own scripts (`## Stack parameters` in `../SKILL.md`), from `{{stack.app_root}}`. A role set to null is skipped and reported, never replaced by an invented command.

```bash
# TypeScript check
{{stack.package_manager}} run {{stack.scripts.types}}

# Linting
{{stack.package_manager}} run {{stack.scripts.lint}}

# Build
{{stack.package_manager}} run {{stack.scripts.build}}
```

Step 2. Verify by hand: follow the original reproduction steps, confirm the bug no longer occurs, test related scenarios, and capture evidence (a screenshot for UI).

Step 3. Run the tests, when the project has them:

```bash
{{stack.package_manager}} run {{stack.scripts.test}}
```

Checklist:

```markdown
## Fix Verification

**Code quality:**

- [ ] TypeScript: no errors
- [ ] Lint: no errors (or only pre-existing)
- [ ] Build: successful

**Functional verification:**

- [ ] Original bug: fixed
- [ ] Steps to reproduce now show the expected behavior
- [ ] Related scenarios not broken (regression check)
- [ ] Evidence captured: [Screenshot path or "N/A"]

**Tests:**

- [ ] Existing tests pass
- [ ] New test added for this scenario: [Yes/No/N/A]
```

---

### Phase 6: Git flow (commit, push, PR)

Step 1. Commit with a semantic message:

```bash
git add [files]
git commit -m "fix(ISSUE_KEY): brief description

- Root cause: [brief explanation]
- Fix: [what was changed]

Fixes: ISSUE_KEY"
```

Examples:

```bash
# Standard bugfix
git commit -m "fix(PROJ-123): resolve email validation allowing invalid format

- Root cause: regex pattern missing anchor at end
- Fix: updated EMAIL_REGEX to include $ anchor

Fixes: PROJ-123"

# Hotfix
git commit -m "fix(PROJ-456): prevent payment crash on empty cart [HOTFIX]

- Root cause: null reference when cart items array undefined
- Fix: added null check before accessing cart.items

Fixes: PROJ-456"
```

Step 2. Push the branch:

```bash
git push -u origin [branch-name]
```

Step 3. Create the pull request:

```bash
# For BUGFIX, to the integration branch (<integration> = git_strategy.branches.integration;
#   when it is null, the PR targets git_strategy.branches.production)
gh pr create \
  --title "fix(ISSUE_KEY): brief description" \
  --body "$(cat <<'EOF'
## Summary

Fixes [ISSUE_KEY]: [Bug summary from Jira]

### Root Cause

[Brief explanation of what caused the bug]

### Fix

[Brief explanation of what was changed to fix it]

### Changes

| File | Change |
| ---- | ------ |
| `file1.ts` | [description] |
| `file2.ts` | [description] |

### Testing

- [x] Reproduced original bug
- [x] Verified fix resolves the issue
- [x] Checked related scenarios (no regression)
- [x] All existing tests pass

### Evidence

[Screenshot or description of verification]

---

Fixes: [ISSUE_KEY]
EOF
)" \
  --base <integration>

# For HOTFIX, to the production branch (git_strategy.branches.production)
gh pr create \
  --title "fix(ISSUE_KEY): brief description [HOTFIX]" \
  --body "..." \
  --base <production>
```

Confirm the PR to the user:

```
Pull Request created

Title: fix(PROJ-123): resolve email validation
PR #: [NUMBER]
URL: [PR_URL]
Base: [integration branch, or production when integration is null]

Next steps:
1. Request code review
2. After merge, I'll update Jira
```

---

### Phase 7: Jira documentation

Goal: Jira carries the complete fix documentation.

Before writing rich-text fields, read `.agents/skills/product-management/references/jira-publishing-gotchas.md` for the two known ADF bugs and their workarounds.

Step 1. Update the custom fields (root cause and fix type):

```
[ISSUE_TRACKER_TOOL] update_issue_field(
  issue_key="[BUG_ID]",
  field={{jira.root_cause}},
  value={"value": "[Root Cause Category]"}
)

[ISSUE_TRACKER_TOOL] update_issue_field(
  issue_key="[BUG_ID]",
  field={{jira.fix}},
  value={"value": "Bugfix"}  // or "Hotfix"
)
```

Step 2. Add the fix documentation comment (template under "Jira comment templates"):

```
Use [ISSUE_TRACKER_TOOL] to add comment to issue:
  issue_key: "[BUG_ID]"
  body: "[Use Fix Documentation template below]"
```

Step 3. Transition to Ready For QA:

```
Use [ISSUE_TRACKER_TOOL] to transition issue:
  issue_key: "[BUG_ID]"
  transition: {{jira.transition.bug.fixed_and_deployed}}  // from in_review; urgent hotfix with no review: hard_pushed
```

Step 4. Assign the bug to the QA. Read `{{jira.qa_assignee}}` from the synced defect (QA fills it when filing). When it names a QA, move the native `assignee` to that QA and read it back (use `editJiraIssue` with the `accountId`; a raw accountId through the CLI can silently unassign). When it is empty, leave `assignee` as it is, write no made-up or placeholder address, and say so in the fix comment.

Step 5. Re-deliver the parent story and record the DTU cycle.

- Parent story in `blocked` (defect loop): once the fix is merged and deployed, re-deliver the story to Ready For QA (`pushed` from `in_progress`, or `pull_request` then `deployed`), read its status back and move its `assignee` to the QA in `{{jira.qa_assignee}}`. The full loop is in `SKILL.md` Stage 4 "Defect loop".
- DTU: write the next cycle per `SKILL.md` Stage 4. Read the current `{{jira.development_token_usage}}`, add this cycle's measured delta (never overwrite), and post one `DTU cycle N: +x K (total y K) source=<harness or human>` comment, or a stated N/A when no figure exists. The figure is measured, never an estimate.

---

### Phase 8: Educational feedback (optional)

This phase is off by default. Run it only when the user asks for feedback mode or asks for feedback on the bug report. Its goal is better bug reports from the same reporter next time.

Before you call any field "missing" or "incomplete", verify it: re-run the sync so you read current values rather than a stale cache, show the actual values from the synced per-field `.md` files in your feedback, and mark a field missing only when its `.md` is a stub and `comments.md` carries no fallback for it. An AI that reads through `view` (which returns `null` for `customfield_*`) or from a stale cache concludes "empty" when the field was filled. If you already gave feedback on that basis, tell the user, re-run the sync and give the corrected assessment.

| Aspect | Good | Needs improvement |
| --- | --- | --- |
| Steps to Reproduce | Clear, numbered, reproducible | Vague, missing steps |
| Expected vs Actual | Specific, measurable | Generic, unclear |
| Error Type | Correctly categorized | Misclassified |
| Severity | Appropriate to impact | Over or under estimated |
| Environment | Specified correctly | Missing or incorrect |
| Evidence | Screenshots, logs attached | No evidence |
| User Story Link | Linked to related story | No traceability |
| Title | Follows nomenclature | Unclear or too vague |

Feedback comment template:

```markdown
## Feedback on the Bug Report

### What went well

- [Positive aspect 1]
- [Positive aspect 2]

### Opportunities to improve

**Custom fields:**
| Field | Status | Comment |
|-------|--------|---------|
| 🐞 Actual Result | OK / Partial / Missing | [Comment] |
| ✅ Expected Result | OK / Partial / Missing | [Comment] |
| Error Type | OK / Partial / Missing | [Comment] |
| SEVERITY | OK / Partial / Missing | [Comment] |
| Test Environment | OK / Partial / Missing | [Comment] |
| Root Cause🐞 | N/A | [Filled in after the fix] |

**Report structure:**

- [ ] Clear, numbered steps to reproduce
- [ ] Evidence attached (screenshot/video)
- [ ] Link to the related User Story
- [ ] Title follows the nomenclature: `<EPICNAME>: <COMPONENT>: <ISSUE_SUMMARY>`

**Note on issue type:**

- Defect: an error found while testing a US that has not been approved yet
- Bug: an error in functionality already deployed or approved in production

### Tips for future reports

1. [Specific tip based on this report]
2. [Another helpful suggestion]

---

_This feedback is meant to improve our testing process._
_Bug retest / QA verification: out of scope here._
```

---

## Jira comment templates

### Fix documentation (standard)

```markdown
## Bug Fix Documentation

### Root Cause Analysis

**Category:** [Code Error / Config Error / Third-Party / etc.]
**Location:** `[file:line]`

**Technical Explanation:**
[Detailed explanation of why the bug occurred]

### Fix Applied

**Branch:** `fix/[ISSUE_KEY]/[description]`
**PR:** [PR URL]
**Fix Type:** Bugfix / Hotfix

**Changes:**
| File | Change |
| ---- | ------ |
| `[file1]` | [What changed] |
| `[file2]` | [What changed] |

### Verification Performed

- [x] Bug reproduced before fix
- [x] Bug resolved after fix
- [x] Related scenarios verified (no regression)
- [x] All tests pass

### How to Verify

1. Navigate to [location/URL]
2. [Step 2]
3. [Step 3]
4. Expected: [Expected behavior now achieved]

---

_Fix ready for QA verification._
```

### Duplicate resolution

```markdown
## Duplicate Bug Resolution

This issue is a **duplicate** of **[EXISTING-BUG]**.

### Analysis

- Both issues describe: [common problem]
- Same root cause: [explanation]
- [EXISTING-BUG] status: [Status]

### Action Taken

- Linked this issue to [EXISTING-BUG]
- Closing as Duplicate

**Note:** Progress will be tracked on [EXISTING-BUG].
```

### Not a bug (WAD)

```markdown
## Resolution: Working As Designed (WAD)

### Analysis

This behavior is **intentional** and working as designed.

**Reason:**
[Detailed explanation of why this is expected behavior]

**Reference:**

- User Story [STORY-XXX] specifies: "[Quote AC]"
- Design decision: [Link or explanation]

### Recommendation

[If there's a valid enhancement request, note it here]

---

_Closing as "Won't Fix" - Working As Designed._
```

### Cannot reproduce

```markdown
## Resolution: Cannot Reproduce

### Reproduction Attempts

- **Date:** [Date]
- **Environment:** [Environment used]
- **Steps followed:** [List of steps attempted]
- **Attempts:** [Number of attempts]

### Result

Unable to reproduce the reported behavior.

### Possible Reasons

1. Environment difference
2. Missing preconditions
3. Bug may have been fixed in recent changes
4. Timing/race condition

### Questions for Reporter

- [Specific question 1 about environment/state]
- [Specific question 2 about exact data used]

---

_Please provide additional details to help us investigate._
```

### Enhancement request

```markdown
## Reclassified: Enhancement Request

### Analysis

After investigation, this is **not a bug** but a **feature request/enhancement**.

**Current Behavior:**
[What the system does, correctly]

**Requested Behavior:**
[What the reporter wants it to do]

### Recommendation

This should be:

1. Converted to a Story/Enhancement issue
2. Added to the product backlog for prioritization

---

_Reclassifying and moving to backlog._
```

---

## Hotfix (critical production bugs)

A hotfix applies when severity is Crítica and the environment is Production (the Phase 3 criteria). It branches from and targets the production branch, then backports.

```markdown
## HOTFIX Required

**Bug:** [ISSUE_KEY]
**Severity:** Crítica
**Environment:** Production
**Impact:** [Business impact description]

### Hotfix criteria met:

- [x] Severity is Crítica
- [x] Bug is in Production
- [x] Blocking a critical business flow

### Hotfix workflow:

1. [ ] Branch from `<production>` (`git_strategy.branches.production`): `hotfix/[ISSUE_KEY]/[description]`
2. [ ] Implement the minimal fix
3. [ ] Verify the fix locally
4. [ ] Create a PR to `<production>` with the [HOTFIX] tag
5. [ ] Request expedited review
6. [ ] After merge to `<production>`:
   - [ ] Verify the production deployment
   - [ ] Backport to the integration branch (`git_strategy.branches.integration`)
7. [ ] Update Jira with the hotfix documentation
```

Branch strategy:

```bash
# 1. Create the hotfix branch from <production> (git_strategy.branches.production)
git checkout <production>
git pull origin <production>
git checkout -b hotfix/[ISSUE_KEY]/[description]

# 2. Implement the fix (minimal changes only)
# ... make changes ...

# 3. Commit with the HOTFIX tag
git commit -m "fix(ISSUE_KEY): description [HOTFIX]

- Root cause: [explanation]
- Fix: [what changed]
- Impact: [affected areas]

Fixes: ISSUE_KEY"

# 4. Push and create the PR to <production>
git push -u origin hotfix/[ISSUE_KEY]/[description]
gh pr create --base <production> --title "fix(ISSUE_KEY): description [HOTFIX]"

# 5. After merge to <production>, backport to <integration> (git_strategy.branches.*;
#    skip when integration is null). Hotfix policy: git_strategy.decisions.hotfix_policy
git checkout <integration>
git pull origin <integration>
git cherry-pick [hotfix-commit-hash]
git push origin <integration>
```

Hotfix PR template:

```markdown
## HOTFIX: [ISSUE_KEY]

**Severity:** Crítica
**Environment:** Production
**Impact:** [What's broken and who's affected]

### Root Cause

[Brief explanation]

### Fix

[Brief explanation of the minimal fix]

### Changes

| File      | Change        |
| --------- | ------------- |
| `file.ts` | [description] |

### Testing

- [x] Reproduced in a production-like environment
- [x] Fix verified
- [x] No regression in critical paths

### Deployment Notes

- [ ] Requires immediate deployment to production
- [ ] Backport needed to: the integration branch (`git_strategy.branches.integration`)

### Rollback Plan

[If the fix causes issues, how to roll back]

---

**EXPEDITED REVIEW REQUESTED**

Fixes: [ISSUE_KEY]
```

---

## Edge cases

### Case 1: bug already fixed

The problematic code no longer exists. Verify the fix is deployed to the environment where the bug was reported, add a Jira comment documenting when and how it was fixed, then transition to Ready For QA (or close it if it is already in production).

### Case 2: the fix needs a breaking change

The fix would break an existing API or behavior other features use. Stop, and do not implement a breaking change without approval. Document the impact in a Jira comment, ask the user or the Product Owner / Business Analyst (delegated) how to proceed, and weigh a deprecation strategy, a feature flag or versioning.

### Case 3: bug in a third-party library

1. Check for a newer version that fixes it.
2. When none does, implement a workaround in our code, document it as a known limitation, and consider opening an issue in the library's repo.
3. Record the third-party dependency in Jira.

### Case 4: bug affects multiple areas

Scope the full impact before implementing, split into several PRs when one would be too large, test regressions extra thoroughly, and document every affected area in the PR.

### Case 5: insufficient information

You cannot understand or reproduce the bug from the report. Add a Jira comment with the specific questions and list exactly what information is needed. Leave the bug `open` with the questions in the comment, or fire `is_cnr`, which moves it to `cannot_reproduce`, when the user chooses to close it. The bug workflow has no "Need Info" status; a project that added one is the `artifact-lifecycle.md` §4 case. Do not guess.

### Case 6: security bug

The bug involves a vulnerability (auth bypass, data exposure, XSS). Keep vulnerability details out of public Jira comments, use a private or restricted channel when one exists, prioritize it as critical whatever the original severity, and consider whether disclosure is needed after the fix.

---

## Decision flow

```
Bug Reported in Jira
        │
        v
┌───────────────────┐
│ Phase 1: Gather   │
│ Context from Jira │
└─────────┬─────────┘
          │
          v
    Is Duplicate? ───Yes──> Link & Close as Duplicate
          │
          No
          │
          v
┌───────────────────┐
│ Phase 2: Attempt  │
│ to Reproduce      │
└─────────┬─────────┘
          │
          v
    Reproducible? ───No──> Request More Info / Cannot Reproduce
          │
          │
    Intermittent? ───Yes──> Note as race condition, continue
          │
          Yes
          │
          v
┌───────────────────┐
│ Phase 3: Triage   │
└─────────┬─────────┘
          │
    ┌─────┴─────┬─────────────┬──────────────┐
    │           │             │              │
    v           v             v              v
Real Bug    Not a Bug    Enhancement    Deferred
    │        (WAD)        Request          │
    │           │             │            │
    │           v             v            v
    │      Close WAD    Reclassify    Document
    │                                  & Defer
    │
    v
Is Crítica + Production? ───Yes──> HOTFIX Flow
    │                              (hotfix/* → production branch)
    No
    │
    v
┌───────────────────┐
│ Phase 4: Fix      │
│ Implementation    │
│ (fix/* → integ.)  │
└─────────┬─────────┘
          │
          v
┌───────────────────┐
│ Phase 5: Verify   │
│ (typecheck/lint/  │
│  build/test)      │
└─────────┬─────────┘
          │
    Verification OK? ───No──> Debug & Iterate
          │
          Yes
          │
          v
┌───────────────────┐
│ Phase 6: Git Flow │
│ (commit/push/PR)  │
└─────────┬─────────┘
          │
          v
┌───────────────────┐
│ Phase 7: Jira     │
│ Documentation     │
└─────────┬─────────┘
          │
          v
┌───────────────────┐
│ Phase 8: Feedback │  <-- Optional (user request)
│ (if requested)    │
└─────────┬─────────┘
          │
          v
        DONE
```

---

## Final report to the user

After the workflow, present this consolidated report in the chat.

### Fix report template

```markdown
## [ISSUE_KEY] - FIX COMPLETE

| Aspect         | Detail                                   |
| -------------- | ---------------------------------------- |
| Issue Key      | [ISSUE_KEY]                              |
| Title          | [Bug summary/title]                      |
| Final status   | Ready For QA                             |
| Assigned to    | [Tester name] (original reporter/tester) |
| Branch         | `fix/[ISSUE_KEY]/[description]`          |
| Commit         | [Full commit URL, clickable]             |
| PR             | [PR URL, clickable] (if applicable)      |
| Files modified | [List of modified files]                 |
| Root cause     | [Category]: [Brief explanation]          |
| Jira URL       | [Full Jira URL, clickable]               |

---

### Actions taken

| Action            | Detail                                                    |
| ----------------- | --------------------------------------------------------- |
| Jira - Read       | `bun run jira:sync-issues get` [ISSUE_KEY] `--include-comments` (with comments/changelog) |
| Jira - Transition | [Initial status] → In Progress → Ready For QA             |
| Jira - Fields     | Root Cause and Fix Type updated                           |
| Jira - Comments   | [N] comments added (Fix documentation [+ Feedback])       |
| Jira - Assign     | Assigned to [Tester name] for re-test                     |
| Git - Branch      | `fix/[ISSUE_KEY]/[description]`                           |
| Git - Commit      | `fix([ISSUE_KEY]): [commit message]`                      |
| Git - Push        | → [target branch: integration, or production when null]   |
| Verification      | typecheck ✓, lint ✓, build ✓                              |

---

### Triage assessment

| Criterion           | Result                                      |
| ------------------- | ------------------------------------------- |
| Is it really a bug? | Yes / Partly / No (it is an enhancement)    |
| Aligned with AC?    | [Yes/No - AC reference if any]              |
| Reproducible?       | Yes / Intermittent / No                     |
| Fix type            | Bugfix / Hotfix                             |
| Decision            | [Short explanation of the decision taken]   |

**Analysis:**
[1-2 paragraphs covering:

- Context of the bug
- Why it happened
- Decisions taken during the fix
- Notes relevant to QA (edge cases, limitations, etc.)
- For a borderline case (bug vs enhancement), the reasoning]

---

### How to verify the fix

1. Go to [URL/specific page]
2. [Specific verification step]
3. [Specific verification step]
4. **Expected:** [Behavior expected after the fix]

---

**Next step:** Bug retest / QA verification: out of scope here.
```

### Report variations

Hotfix: add this banner at the top.

```markdown
## [ISSUE_KEY] - HOTFIX COMPLETE

> **HOTFIX:** This fix was applied directly to the production branch because it was critical in production.
> Backport to the integration branch: [Yes, commit: XXX / Pending / N/A]
```

Duplicate resolution:

```markdown
## [ISSUE_KEY] - DUPLICATE

| Aspect       | Detail               |
| ------------ | -------------------- |
| Issue Key    | [ISSUE_KEY]          |
| Duplicate of | [EXISTING_ISSUE_KEY] |
| Final status | Duplicate            |
| Jira URL     | [Jira URL]           |

### Actions taken

| Action            | Detail                         |
| ----------------- | ------------------------------ |
| Jira - Read       | `bun run jira:sync-issues get` [ISSUE_KEY] `--include-comments` |
| Jira - Link       | Linked to [EXISTING_ISSUE_KEY] |
| Jira - Transition | [Status] → Duplicate           |
| Jira - Comment    | Documented duplicate reasoning |

**Analysis:** [Why it is a duplicate, which issue has the fix/tracking]

**Next step:** Follow progress on [EXISTING_ISSUE_KEY]
```

Working as designed:

```markdown
## [ISSUE_KEY] - CLOSED (WAD)

| Aspect       | Detail                    |
| ------------ | ------------------------- |
| Issue Key    | [ISSUE_KEY]               |
| Resolution   | Working As Designed (WAD) |
| Final status | Won't Fix                 |
| Jira URL     | [Jira URL]                |

### Actions taken

| Action            | Detail                       |
| ----------------- | ---------------------------- |
| Jira - Read       | `bun run jira:sync-issues get` [ISSUE_KEY] `--include-comments` |
| Jira - Transition | [Status] → Won't Fix         |
| Jira - Comment    | Documented WAD reasoning     |

**Analysis:**
[Why it is not a bug: reference to the AC, design or documentation]

**Recommendation:** [If applicable, suggest creating an Enhancement]
```

Cannot reproduce:

```markdown
## [ISSUE_KEY] - CANNOT REPRODUCE

| Aspect       | Detail                                 |
| ------------ | -------------------------------------- |
| Issue Key    | [ISSUE_KEY]                            |
| Final status | Open (pending info) / Cannot Reproduce |
| Attempts     | [N] reproduction attempts              |
| Jira URL     | [Jira URL]                             |

### Actions taken

| Action            | Detail                                          |
| ----------------- | ----------------------------------------------- |
| Jira - Read       | `bun run jira:sync-issues get` [ISSUE_KEY] `--include-comments` |
| Jira - Comment    | Specific questions for the reporter             |
| Jira - Transition | none (stays Open) / `is_cnr` → Cannot Reproduce |

**Analysis:**
[What was tried, what information is missing, questions for the reporter]

**Next step:** Wait for the reporter's reply with more details
```

### Output checklist (internal)

Before presenting the report, tick these.

Jira:

- [ ] Bug analyzed with full context
- [ ] Reproduction documented
- [ ] Triage decision made and documented
- [ ] Root Cause custom fields updated
- [ ] Fix documentation comment added
- [ ] Issue transitioned to Ready For QA
- [ ] Assignee moved to the `{{jira.qa_assignee}}` QA (or left as is with the reason in the fix comment); parent story in `blocked` re-delivered to Ready For QA; DTU cycle written or N/A

Code:

- [ ] Fix follows the code standards
- [ ] Fix verified (typecheck, lint, build, manual test)
- [ ] Branch named per the strategy
- [ ] Semantic commit message
- [ ] PR created with a detailed description (if applicable)

Report:

- [ ] Every URL is complete and clickable
- [ ] Triage assessment includes the reasoning
- [ ] The analysis gives useful context
- [ ] "How to verify the fix" has specific, actionable steps
- [ ] Educational feedback provided (if requested); hotfix backported (if applicable)

---

## Quick reference

### Tools

| Action | Tool |
| --- | --- |
| Read bug custom fields | `bun run jira:sync-issues get <BUG-KEY> --include-comments` |
| Search for duplicates | `[ISSUE_TRACKER_TOOL]` to search issues |
| Update custom fields | `[ISSUE_TRACKER_TOOL]` to update issue |
| Add comment | `[ISSUE_TRACKER_TOOL]` to add comment |
| Transition status | `[ISSUE_TRACKER_TOOL]` to transition issue |
| Link issues | `[ISSUE_TRACKER_TOOL]` to link issues |
| Search for fields | `[ISSUE_TRACKER_TOOL]` to search fields |
| Navigate browser, take screenshot | `[AUTOMATION_TOOL]` (if available) |
| Check library docs | `[DOCS_TOOL]` |

### Jira transitions (by slug)

Transition ids differ per workspace, so this file names slugs only. Each resolves through `{{jira.transition.bug.<slug>}}` against `.agents/jira-workflows.json` (refreshed by `bun run jira:sync-workflows`). Who fires each one, and what to do when a slug is missing, is in `agentic-dev-core/references/artifact-lifecycle.md`.

| Slug | From → To |
| --- | --- |
| `start_fixing` | `open` → `in_progress` |
| `pull_request` | `in_progress` → `in_review` |
| `fixed_and_deployed` | `in_review` → `ready_for_qa` |
| `hard_pushed` | `in_progress` → `ready_for_qa` |
| `is_not_a_bug` | `open` → `enhancement` |
| `is_duplicated` | `open` → `duplicated` |
| `is_cnr` | `open` → `cannot_reproduce` |
| `is_wad` | `open` → `rejected` |
| `defer` | `open` → `deferred` |

Usage:

```
Use [ISSUE_TRACKER_TOOL] to transition issue:
  issue_key: "PROJ-123"
  transition: {{jira.transition.bug.start_fixing}}
```

### Code quality commands

Run from `{{stack.app_root}}`; a role set to null is skipped and reported.

| Check | Command |
| --- | --- |
| TypeScript | `{{stack.package_manager}} run {{stack.scripts.types}}` |
| Lint | `{{stack.package_manager}} run {{stack.scripts.lint}}` |
| Build | `{{stack.package_manager}} run {{stack.scripts.build}}` |
| Test | `{{stack.package_manager}} run {{stack.scripts.test}}` |

The git commands are in Phases 4 and 6 and in the Hotfix section.

### Related references

| Reference | When to use |
| --- | --- |
| `implement-story.md` | Implementing new features |
| `review-pr.md` | Code review of the fix PR |
| `/git-flow-master` | Advanced git operations |

Bug reporting, retest and QA verification flows are out of scope here.

---

## Several bugs in one session

### JQL for pending bugs

```
project = [PROJECT_KEY] AND issuetype in (Bug, Defect) AND status = OPEN ORDER BY priority DESC, created ASC
```

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = PROJ AND issuetype in (Bug, Defect) AND status = OPEN ORDER BY priority DESC"
  fields: "summary,priority,status,reporter,created"
  limit: 20
```

### Bug list template

Track progress across several bugs with this table:

```markdown
## Bug List - Session [DATE]

| #   | Key       | Summary   | Priority | Status | Result    |
| --- | --------- | --------- | -------- | ------ | --------- |
| 1   | [PROJ-XX] | [Summary] | Highest  | OPEN   | Pending   |
| 2   | [PROJ-XX] | [Summary] | High     | OPEN   | Fixed     |
| 3   | [PROJ-XX] | [Summary] | Medium   | OPEN   | WAD       |
| 4   | [PROJ-XX] | [Summary] | Low      | OPEN   | Duplicate |

**Legend:** Pending; Fixed (Ready For QA); WAD / Rejected; Duplicate; CNR (Cannot Reproduce); Enhancement.
```

### Session report template

```markdown
## Session Report - Bug Fixing [DATE]

### Summary

| Metric                              | Value |
| ----------------------------------- | ----- |
| Bugs analyzed                       | [N]   |
| Bugs fixed                          | [N]   |
| Bugs rejected (WAD/CNR/Duplicate)   | [N]   |
| Commits made                        | [N]   |
| Files modified                      | [N]   |

---

### Bugs processed

#### [PROJ-XX] - [Summary]

| Aspect       | Detail              |
| ------------ | ------------------- |
| Final status | Ready For QA        |
| Root Cause   | [Category]: [Brief] |
| Commit       | [URL]               |
| Assigned to  | [Tester]            |

#### [PROJ-XX] - [Summary]

| Aspect       | Detail                |
| ------------ | --------------------- |
| Final status | WAD / Duplicate / CNR |
| Reason       | [Brief explanation]   |

---

### Code changes

| File               | Related bugs      | Change        |
| ------------------ | ----------------- | ------------- |
| `path/to/file.ts`  | PROJ-XX, PROJ-YY  | [Description] |
| `path/to/other.ts` | PROJ-ZZ           | [Description] |

---

### Educational feedback delivered

| Tester | Key points             |
| ------ | ---------------------- |
| [Name] | [Summary of feedback]  |

---

### Next bugs to handle

| #   | Key       | Summary   | Priority   |
| --- | --------- | --------- | ---------- |
| 1   | [PROJ-XX] | [Summary] | [Priority] |
| 2   | [PROJ-XX] | [Summary] | [Priority] |
```

### Session continuation template

To continue an earlier session, paste this block with updated data:

```markdown
---

## Continuation of the Previous Session

**Previous session:** [DATE]
**Bugs completed:** [N]
**Bugs pending:** [N]

### Summary of previous progress

[Paste the previous session report or the key summary here]

### Pending bugs from the previous session

| # | Key | Summary | Priority | Notes |
|---|-----|---------|----------|-------|
| 1 | [PROJ-XX] | [Summary] | [Priority] | [Context if any] |
| 2 | [PROJ-XX] | [Summary] | [Priority] | |

---

**Continuing with:** [PROJ-XX]
```

---

## Troubleshooting

| Issue | Solution |
| --- | --- |
| Slug `{{jira.<slug>}}` doesn't resolve to a workspace field | Use the fallback (search for an equivalent, or put it in the comment) |
| "Transition not valid" | Check the available transitions for the current status |
| Cannot reproduce the bug | Request more info, check environment differences |
| Fix breaks other tests | Investigate the regression, reconsider the scope of the fix |
| PR conflicts | Rebase on the target branch and resolve the conflicts |
| Hotfix needs a backport | Cherry-pick it onto the integration branch |

### Custom fields come back null or missing

`[ISSUE_TRACKER_TOOL]` `view` and `get_issue` return the standard fields but `null` for `customfield_*` (acli, and some MCP tiers). Read custom-field content through the sync (`bun run jira:sync-issues get <BUG-KEY> --include-comments`): it resolves every slug, converts ADF to Markdown and writes one `.md` per field under `.context/PBI/`, next to `comments.md`.

When a field's `.md` is a stub, read the fallback comment in `comments.md`, verify the slug-to-id mapping in `.agents/jira-fields.json` (`bun run jira:sync-fields` refreshes it) or in `.agents/jira-required.yaml`, and check whether the field is visible only to certain roles or projects.

### Wrong "missing field" feedback

The cause is almost always a read through `view` or a stale cache, which makes a filled field look empty. Read through the sync every time, re-run it before giving feedback, and list the fields that were found with their values in Phase 8. If the feedback already went out wrong, tell the user, re-run the sync, read the materialized fields and give the corrected assessment.
