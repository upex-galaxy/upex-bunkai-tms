# Bug/Defect Fixing

> AI-guided bug analysis, triage, fix implementation, and complete Jira documentation.

---

## Purpose

Analyze, triage, and fix bugs/defects reported during exploratory testing or production. This prompt helps the AI:

1. **Gather full context** from Jira (issue, comments, links, related stories)
2. **Reproduce the bug** using available testing tools
3. **Triage** to determine if it's a real bug, enhancement, or duplicate
4. **Implement the fix** with minimal changes following code standards
5. **Verify the fix** passes typecheck, lint, build, and manual testing
6. **Create branch, commit, and PR** with proper documentation
7. **Document in Jira** with root cause analysis and fix details
8. **Provide educational feedback** to improve bug report quality (optional)

**Prerequisites:**

- Bug reported in Jira (from exploratory testing or production)
- Access to `[ISSUE_TRACKER_TOOL]` (e.g., Atlassian/Jira MCP)
- Access to GitHub CLI (`gh`)
- Optional: Browser testing tools (e.g., Playwright MCP)
- Optional: API testing tools (e.g., Postman MCP)
- Optional: Context7 MCP for library documentation

**Important:** This prompt is primarily configured for the **UPEX Galaxy Jira Workspace**. The custom field IDs below are shared across all projects in this workspace. For external workspaces, see the **Fallback Strategy** section.

---

## MCP Tool Verification

**BEFORE starting, verify available tools:**

### Required: Atlassian MCP

**Check if available:** [Verify access to `[ISSUE_TRACKER_TOOL]`]

**If NOT available:**

```
⚠️ Atlassian MCP Required

This workflow requires Jira integration to:
- Read bug details and custom fields
- Read comments for context
- Transition issue status
- Add documentation comments

**How to connect:**
1. Add Atlassian MCP to your configuration
2. Restart the chat session

**Cannot proceed without Atlassian MCP.**
```

### Required: GitHub CLI (gh)

**Check if available:** Run `gh --version`

**If NOT available:**

```
⚠️ GitHub CLI Required

This workflow requires GitHub CLI for:
- Creating branches
- Pushing changes
- Creating Pull Requests

**How to install:**
1. Visit: https://cli.github.com/
2. Install for your OS
3. Authenticate: `gh auth login`
```

### Optional: Browser Testing Tools

**When useful:**

- UI bugs requiring visual verification
- Reproducing user interaction bugs
- Taking screenshots of before/after state

**Examples:** Playwright MCP, browser automation tools

**If NOT available:**

- Manual reproduction steps will be provided
- User will need to verify visually

### Optional: API Testing Tools

**When useful:**

- API/Integration bugs
- Data validation issues
- Backend error reproduction

**Examples:** Postman MCP, HTTP client tools

### Optional: Context7 MCP

**When useful:**

- Understanding library behavior for root cause analysis
- Verifying correct API usage
- Checking for known issues in dependencies

---

## Custom Fields Schema (UPEX Galaxy Workspace)

> **CRITICAL:** Use these exact field IDs for bug custom fields. For non-UPEX workspaces, see **Fallback Strategy**.

### Bug Fields Reference

| Field ID            | Jira Field Name    | Type     | Values/Usage                                                                         |
| ------------------- | ------------------ | -------- | ------------------------------------------------------------------------------------ |
| `customfield_10109` | 🐞 Actual Result   | Textarea | What happened (the bug behavior)                                                     |
| `customfield_10110` | ✅ Expected Result | Textarea | What should have happened                                                            |
| `customfield_10112` | Error Type         | Dropdown | Functional/Visual/Content/Performance/Crash/Data/Integration/Security                |
| `customfield_10116` | SEVERITY           | Dropdown | Crítica/Mayor/Moderada/Menor/Trivial                                                 |
| `customfield_12210` | Test Environment   | Dropdown | Dev/QA/UAT/Staging/Production                                                        |
| `customfield_10701` | Root Cause🐞       | Dropdown | Code Error/Config-Env Error/Environment Error/Requirement Error/WAD/Third-Party/etc. |
| `customfield_12212` | Fix                | Radio    | Bugfix (standard) / Hotfix (critical, immediate deploy)                              |

### Root Cause Categories

| Value                       | When to Use                                     |
| --------------------------- | ----------------------------------------------- |
| `Code Error`                | Bug in source code logic                        |
| `Config/Env Error`          | Environment variables, configs, feature flags   |
| `Environment Error`         | Infrastructure, server, deploy, CI/CD           |
| `Requirement Error`         | Unclear spec, ambiguous AC, missing requirement |
| `Working As Designed (WAD)` | Not a bug, works as intended                    |
| `Third-Party Error`         | Bug in external library/framework               |
| `Integration Error`         | External service down, third-party API failed   |
| `Data Error`                | Corrupted data in DB, failed migration          |

### SEVERITY to Priority Mapping

| SEVERITY (Spanish) | Jira Priority | Action                        |
| ------------------ | ------------- | ----------------------------- |
| Crítica            | Highest       | Hotfix flow (immediate)       |
| Mayor              | High          | Standard fix (high priority)  |
| Moderada           | Medium        | Standard fix (normal)         |
| Menor              | Low           | Standard fix (low priority)   |
| Trivial            | Lowest        | Standard fix (when available) |

---

## Fallback Strategy (Non-UPEX Workspaces)

> Apply when using this prompt in Jira workspaces OTHER than UPEX Galaxy.

### Fallback 1: Search for Equivalent Field

When a custom field ID fails, use `[ISSUE_TRACKER_TOOL]` to search for fields:

```
Use [ISSUE_TRACKER_TOOL] to search fields:
  keyword: "root cause"  // or "severity", "error type", etc.
```

If found:

1. Use discovered field ID for this session
2. Inform user: "Using `customfield_XXXXX` for [Field Name] in this workspace"
3. Proceed with fix workflow

### Fallback 2: Ask User to Define Fields

```
⚠️ Custom Field Not Found

The field "[Field Name]" (UPEX ID: `customfield_XXXXX`) doesn't exist.

Options:
1. Tell me the correct custom field ID for this workspace
2. Skip this field and include info in the Jira comment
3. Proceed without updating this field

Which would you prefer?
```

### Fallback 3: Include in Comment

As last resort:

1. **Omit the custom field** from update
2. **Add info to Jira comment** in structured format
3. Note to user which fields were unavailable

---

## Required Context

**MUST gather this information before starting:**

### 1. Bug Issue from Jira

> **⚠️ IMPORTANT:** The Atlassian MCP may not return custom fields with `fields: "*all"`. Make TWO calls to ensure complete data.

**Call 1 - Standard fields:**

```
Use [ISSUE_TRACKER_TOOL] to get issue:
  issue_key: "PROJ-123"
  fields: "*all"
  expand: "changelog"
  comment_limit: 50
```

**Call 2 - Custom fields explicitly:**

```
Use [ISSUE_TRACKER_TOOL] to get issue:
  issue_key: "PROJ-123"
  fields: "customfield_10109,customfield_10110,customfield_10112,customfield_10116,customfield_12210,customfield_10701,customfield_10111,customfield_10607,customfield_12212"
```

**Extract from combined results:**

- Summary and Description
- Steps to Reproduce
- **Actual Result** (customfield_10109) vs **Expected Result** (customfield_10110)
- **Error Type** (customfield_10112) and **Severity** (customfield_10116)
- **Test Environment** (customfield_12210)
- **Root Cause** (customfield_10701) - may be empty initially
- All comments (context, discussions, prior attempts)
- Attachments (screenshots, logs)

### 2. Linked Issues

Check issue links for:

- **Parent User Story:** Understand the original requirement and AC
- **Related bugs:** Check for duplicates or related issues
- **Blocked/Blocking:** Dependencies that might affect the fix

### 3. Code Standards (when implementing fix)

```
.claude/skills/sprint-development/references/
├── code-standards.md           # Coding standards (DRY, naming, TypeScript)
├── error-handling.md           # Error handling patterns
└── data-testid-standards.md    # Test attributes (if UI fix)
```

### 4. Git Strategy

**Default branching pattern (user can override):**

| Type       | Branch Pattern                           | Target  |
| ---------- | ---------------------------------------- | ------- |
| **Bugfix** | `fix/{ISSUE_KEY}/{short-description}`    | staging |
| **Hotfix** | `hotfix/{ISSUE_KEY}/{short-description}` | main    |

**Ask user if they have a different git strategy before creating branches.**

---

## Workflow

### Phase 1: Bug Context Gathering

**Objective:** Understand the bug completely before attempting to fix.

**Step 1: Read the bug issue (TWO CALLS REQUIRED)**

> **CRITICAL:** The Atlassian MCP may not return custom fields with `fields: "*all"`. You MUST make TWO separate calls to ensure you have all information.

**Call 1 - Standard fields and comments:**

```
Use [ISSUE_TRACKER_TOOL] to get issue:
  issue_key: "[BUG_ID]"
  fields: "*all"
  expand: "changelog"
  comment_limit: 50
```

**Call 2 - Custom fields explicitly (REQUIRED):**

```
Use [ISSUE_TRACKER_TOOL] to get issue:
  issue_key: "[BUG_ID]"
  fields: "customfield_10109,customfield_10110,customfield_10112,customfield_10116,customfield_12210,customfield_10701,customfield_10111,customfield_10607,customfield_12212"
```

**Why two calls?**

- Call 1: Gets summary, description, status, comments, changelog
- Call 2: Explicitly retrieves custom field VALUES (Actual/Expected Result, Severity, Error Type, etc.)

**If custom fields return `null` or "field not found":**

1. Use `[ISSUE_TRACKER_TOOL]` to search for fields by keyword to find equivalent fields
2. Ask user for correct field IDs (see Fallback Strategy section)
3. Do NOT assume fields are empty without verifying

**Step 2: Extract and present critical information**

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

**Step 3: Check for duplicates**

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = [PROJECT] AND type = Bug AND status != Done AND summary ~ '[keywords]' AND key != [CURRENT_BUG]"
```

**If potential duplicate found:**

```
⚠️ Potential Duplicate Detected

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

### Phase 2: Bug Reproduction

**Objective:** Confirm the bug is reproducible before implementing a fix.

**Reproduction approach by bug type:**

| Bug Type           | Reproduction Method                  |
| ------------------ | ------------------------------------ |
| **UI Bug**         | Browser testing tools (if available) |
| **API Bug**        | API testing tools or curl commands   |
| **Code/Logic Bug** | Code inspection and trace            |
| **Data Bug**       | Database queries or API verification |

**For UI Bugs (if browser tools available):**

1. Navigate to the affected page
2. Follow steps to reproduce exactly
3. Capture screenshot if bug manifests
4. Note any console errors or network failures

**For API Bugs:**

1. Replicate the API call with same parameters
2. Capture response and status code
3. Compare with expected behavior

**For Code/Logic Bugs:**

1. Identify the code path from the bug description
2. Trace through the logic
3. Identify where behavior diverges from expected

**Document reproduction results:**

```markdown
## Reproduction Results

**Attempt 1:** [Date/Time]

- Steps executed: [List]
- Result: ✅ Reproduced / ❌ Not Reproduced / ⚠️ Intermittent
- Evidence: [Screenshot path / Log excerpt / None]

**Conclusion:**

- [ ] Bug confirmed reproducible → Proceed to Phase 3
- [ ] Bug NOT reproducible → Request more info
- [ ] Bug is intermittent → Note timing/race condition
```

**If NOT reproducible:**

```
⚠️ Unable to Reproduce Bug

I followed the steps but could not reproduce the issue.

Possible reasons:
1. Environment difference (I'm on [env], bug reported on [env])
2. Missing preconditions (user state, data setup)
3. Bug already fixed in current code
4. Timing/race condition issue

Options:
1. Add Jira comment requesting more details from reporter
2. Check git history for recent fixes that might have resolved this
3. Close as "Cannot Reproduce" with documentation

Which would you prefer?
```

---

### Phase 3: Triage & Decision

**Objective:** Determine the correct course of action based on analysis.

**Decision Matrix:**

| Finding                       | Action                     | Jira Transition                |
| ----------------------------- | -------------------------- | ------------------------------ |
| Real bug, reproducible        | Proceed to fix             | → In Progress                  |
| Duplicate of existing bug     | Link and close             | → Duplicate                    |
| Not a bug (works as designed) | Document reasoning         | → Won't Fix (WAD)              |
| Enhancement request           | Reclassify as enhancement  | → Enhancement / Backlog        |
| Cannot reproduce              | Request more info or close | → Need Info / Cannot Reproduce |
| Deferred (low priority/risk)  | Document and defer         | → Deferred                     |

**For "Real Bug" - Check if Hotfix needed:**

```markdown
## Fix Type Determination

**Severity:** [Crítica/Mayor/Moderada/Menor/Trivial]
**Environment:** [Dev/QA/UAT/Staging/Production]

**Hotfix Criteria:**

- [ ] Severity is "Crítica"
- [ ] Found in Production environment
- [ ] Blocking critical business flow

**Decision:**

- [ ] **HOTFIX** → Use `hotfix/*` branch, PR to main
- [ ] **BUGFIX** → Use `fix/*` branch, PR to staging
```

**For "Not a Bug" scenarios:**

```
I've analyzed this issue and determined it's NOT a bug.

**Classification:** Working As Designed (WAD)

**Analysis:**
[Detailed explanation of why this is expected behavior]

**Reference:**
- AC from [STORY-XXX]: "[Quote the AC]"
- Design decision: [Reference if documented]

**Recommendation:**
[Close as WAD / Convert to enhancement / Other]

Do you want me to:
1. Close this issue with documentation
2. Convert to enhancement request
3. Let me investigate further
```

**Transition to In Progress (if real bug):**

```
Use [ISSUE_TRACKER_TOOL] to transition issue:
  issue_key: "[BUG_ID]"
  transition: "In Progress"
```

---

### Phase 4: Implementation of Fix

**Objective:** Implement minimal, targeted fix following code standards.

**Step 1: Root Cause Analysis**

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

**Step 2: Create Fix Branch**

Determine branch type based on Phase 3 decision:

```bash
# For standard BUGFIX:
git checkout -b fix/[ISSUE_KEY]/[short-description]
# Example: git checkout -b fix/PROJ-123/email-validation

# For HOTFIX (critical production bug):
git checkout -b hotfix/[ISSUE_KEY]/[short-description]
# Example: git checkout -b hotfix/PROJ-456/payment-crash
```

**Step 3: Implement Fix**

**Guidelines:**

- **Minimal changes:** Fix only what's broken
- **Don't refactor:** Unless directly related to the bug
- **Follow code standards:** `references/code-standards.md`
- **Error handling:** `references/error-handling.md`
- **Add data-testid:** If UI element involved (for future automation)
- **Consider edge cases:** Related scenarios that might be affected

**Document the change:**

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
````

**After (fixed code):**

```[language]
[new code snippet]
```

**Why this fixes it:**
[Explanation of how the fix addresses the root cause]

````

---

### Phase 5: Verification of Fix

**Objective:** Ensure fix works and doesn't break anything.

**Step 1: Code Quality Checks**

```bash
# TypeScript check (adjust command per project)
npm run typecheck  # or: bun run typecheck

# Linting
npm run lint:check  # or: bun run lint:check

# Build
npm run build  # or: bun run build
````

**Step 2: Manual Verification**

1. Follow original steps to reproduce
2. Verify bug no longer occurs
3. Test related scenarios (regression check)
4. Capture evidence (screenshot if UI)

**Step 3: Run Tests (if available)**

```bash
npm run test  # or: bun run test
```

**Verification Checklist:**

```markdown
## Fix Verification

**Code Quality:**

- [ ] TypeScript: No errors
- [ ] Lint: No errors (or only pre-existing)
- [ ] Build: Successful

**Functional Verification:**

- [ ] Original bug: FIXED
- [ ] Steps to reproduce now show expected behavior
- [ ] Related scenarios: Not broken (regression check)
- [ ] Evidence captured: [Screenshot path or "N/A"]

**Tests:**

- [ ] Existing tests pass
- [ ] New test added for this scenario: [Yes/No/N/A]
```

---

### Phase 6: Git Flow (Branch, Commit, Push, PR)

**Step 1: Stage and Commit**

Use semantic commit format:

```bash
git add [files]
git commit -m "fix(ISSUE_KEY): brief description

- Root cause: [brief explanation]
- Fix: [what was changed]

Fixes: ISSUE_KEY"
```

**Commit Message Examples:**

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

**Step 2: Push Branch**

```bash
git push -u origin [branch-name]
```

**Step 3: Create Pull Request**

```bash
# For BUGFIX (to staging/develop)
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

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --base staging

# For HOTFIX (to main)
gh pr create \
  --title "fix(ISSUE_KEY): brief description [HOTFIX]" \
  --body "..." \
  --base main
```

**Confirm PR creation:**

```
✅ Pull Request Created

Title: fix(PROJ-123): resolve email validation
PR #: [NUMBER]
URL: [PR_URL]
Base: [staging/main]

Next steps:
1. Request code review
2. After merge, I'll update Jira
```

---

### Phase 7: Jira Documentation

**Objective:** Update Jira with complete fix documentation.

**Step 1: Update Custom Fields (Root Cause)**

```
Use [ISSUE_TRACKER_TOOL] to update issue:
  issue_key: "[BUG_ID]"
  fields:
    customfield_10701: {"value": "[Root Cause Category]"}
    customfield_12212: {"value": "Bugfix"}  // or "Hotfix"
```

**Step 2: Add Fix Documentation Comment**

```
Use [ISSUE_TRACKER_TOOL] to add comment to issue:
  issue_key: "[BUG_ID]"
  body: "[Use Fix Documentation Template below]"
```

**Step 3: Transition to Ready For QA**

```
Use [ISSUE_TRACKER_TOOL] to transition issue:
  issue_key: "[BUG_ID]"
  transition: "Ready For QA"  // or appropriate transition name
```

**Step 4: Assign to QA (if known)**

```
Use [ISSUE_TRACKER_TOOL] to update issue:
  issue_key: "[BUG_ID]"
  fields:
    assignee: "[qa-email@example.com]"
```

---

### Phase 8: Educational Feedback (Optional)

> **Note:** This phase is OFF by default. Activate only when explicitly requested by the user.

**Objective:** Provide constructive feedback to improve future bug reports.

**When to activate:**

- User explicitly requests feedback mode
- User asks "give me feedback on this bug report"

**⚠️ CRITICAL: Verify Custom Fields Before Giving Feedback**

Before evaluating whether fields are "missing" or "incomplete":

1. **Ensure you made the explicit custom fields call** (Phase 1, Call 2)
2. **Re-verify if uncertain:** Make another call with explicit field IDs
3. **List found values:** In your feedback, show the ACTUAL values found
4. **Only mark as "missing" if the explicit call returned `null` or empty**

```
Use [ISSUE_TRACKER_TOOL] to get issue:
  issue_key: "[BUG_ID]"
  fields: "customfield_10109,customfield_10110,customfield_10112,customfield_10116,customfield_12210,customfield_10701,customfield_10111,customfield_10607,customfield_12212"
```

**If fields return null after explicit call:** Then it's valid to note as missing in feedback.

**Evaluation Criteria:**

| Aspect             | Good                          | Needs Improvement    |
| ------------------ | ----------------------------- | -------------------- |
| Steps to Reproduce | Clear, numbered, reproducible | Vague, missing steps |
| Expected vs Actual | Specific, measurable          | Generic, unclear     |
| Error Type         | Correctly categorized         | Misclassified        |
| Severity           | Appropriate to impact         | Over/under estimated |
| Environment        | Specified correctly           | Missing or incorrect |
| Evidence           | Screenshots, logs attached    | No evidence          |
| User Story Link    | Linked to related story       | No traceability      |
| Title              | Follows nomenclature          | Unclear or too vague |

**Feedback Comment Template:**

```markdown
## 📚 Feedback sobre el Bug Report

### ✅ Lo que estuvo bien

- [Positive aspect 1]
- [Positive aspect 2]

### 🔧 Oportunidades de mejora

**Custom Fields:**
| Campo | Estado | Comentario |
|-------|--------|------------|
| 🐞 Actual Result | ✅/⚠️/❌ | [Comentario] |
| ✅ Expected Result | ✅/⚠️/❌ | [Comentario] |
| Error Type | ✅/⚠️/❌ | [Comentario] |
| SEVERITY | ✅/⚠️/❌ | [Comentario] |
| Test Environment | ✅/⚠️/❌ | [Comentario] |
| Root Cause🐞 | ⚠️ N/A | [Se llena después del fix] |

**Estructura del Reporte:**

- [ ] Steps to reproduce claros y numerados
- [ ] Evidencia adjunta (screenshot/video)
- [ ] Link a User Story relacionada
- [ ] Título sigue nomenclatura: `<EPICNAME>: <COMPONENT>: <ISSUE_SUMMARY>`

**Nota sobre Issue Type:**

- **Defect:** Error encontrado durante testing de una US que aún no ha sido aprobada
- **Bug:** Error en funcionalidad ya desplegada/aprobada en producción

### 💡 Tips para futuros reportes

1. [Specific tip based on this report]
2. [Another helpful suggestion]

---

_Este feedback es constructivo y busca mejorar nuestro proceso de testing._
_Bug retest / QA verification: out of scope here — see `agentic-qa-boilerplate` sister repo._
```

---

## Jira Comment Templates

### Fix Documentation (Standard)

```markdown
## 🔧 Bug Fix Documentation

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

### Duplicate Resolution

```markdown
## 🔗 Duplicate Bug Resolution

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

### Not a Bug (WAD)

```markdown
## ✅ Resolution: Working As Designed (WAD)

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

### Cannot Reproduce

```markdown
## ❓ Resolution: Cannot Reproduce

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

### Enhancement Request

```markdown
## 📝 Reclassified: Enhancement Request

### Analysis

After investigation, this is **not a bug** but rather a **feature request/enhancement**.

**Current Behavior:**
[What the system currently does - correctly]

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

## Hotfix Section (Critical Production Bugs)

> Use this workflow when: SEVERITY = "Crítica" AND Environment = "Production"

### Hotfix Checklist

```markdown
## 🚨 HOTFIX Required

**Bug:** [ISSUE_KEY]
**Severity:** Crítica
**Environment:** Production
**Impact:** [Business impact description]

### Hotfix Criteria Met:

- [x] Severity is Crítica
- [x] Bug is in Production
- [x] Blocking critical business flow

### Hotfix Workflow:

1. [ ] Branch from `main`: `hotfix/[ISSUE_KEY]/[description]`
2. [ ] Implement minimal fix
3. [ ] Verify fix locally
4. [ ] Create PR to `main` with [HOTFIX] tag
5. [ ] Request expedited review
6. [ ] After merge to main:
   - [ ] Verify production deployment
   - [ ] Backport to staging/develop
7. [ ] Update Jira with hotfix documentation
```

### Hotfix Branch Strategy

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/[ISSUE_KEY]/[description]

# 2. Implement fix (minimal changes only)
# ... make changes ...

# 3. Commit with HOTFIX tag
git commit -m "fix(ISSUE_KEY): description [HOTFIX]

- Root cause: [explanation]
- Fix: [what changed]
- Impact: [affected areas]

Fixes: ISSUE_KEY"

# 4. Push and create PR to main
git push -u origin hotfix/[ISSUE_KEY]/[description]
gh pr create --base main --title "fix(ISSUE_KEY): description [HOTFIX]"

# 5. After merge to main, backport to staging
git checkout staging
git pull origin staging
git cherry-pick [hotfix-commit-hash]
git push origin staging
```

### Hotfix PR Template

```markdown
## 🚨 HOTFIX: [ISSUE_KEY]

**Severity:** Crítica
**Environment:** Production
**Impact:** [What's broken and who's affected]

### Root Cause

[Brief explanation]

### Fix

[Brief explanation of minimal fix]

### Changes

| File      | Change        |
| --------- | ------------- |
| `file.ts` | [description] |

### Testing

- [x] Reproduced in production-like environment
- [x] Fix verified
- [x] No regression in critical paths

### Deployment Notes

- [ ] Requires immediate deployment to production
- [ ] Backport needed to: staging, develop

### Rollback Plan

[If fix causes issues, how to rollback]

---

🚨 **EXPEDITED REVIEW REQUESTED**

Fixes: [ISSUE_KEY]
```

---

## Edge Cases Handling

### Case 1: Bug Already Fixed

**Detection:** Code inspection shows problematic code no longer exists.

**Action:**

1. Verify fix is deployed to the environment where bug was reported
2. Add Jira comment documenting when/how it was fixed
3. Transition to Ready For QA (or close if already in production)

### Case 2: Bug Requires Breaking Change

**Detection:** Fix would break existing API/behavior used by other features.

**Action:**

1. **STOP** - Do not implement breaking change without approval
2. Document the impact in Jira comment
3. Ask user/PO for guidance on approach
4. Consider: deprecation strategy, feature flag, versioning

### Case 3: Bug in Third-Party Library

**Detection:** Root cause is in external dependency.

**Action:**

1. Check for newer version that fixes the issue
2. If no fix available:
   - Implement workaround in our code
   - Document as known limitation
   - Consider opening issue in library repo
3. Update Jira with third-party dependency info

### Case 4: Bug Affects Multiple Areas

**Detection:** Fix requires changes across multiple features/modules.

**Action:**

1. Scope the full impact before implementing
2. Consider splitting into multiple PRs if too large
3. Extra thorough regression testing
4. Document all affected areas in PR

### Case 5: Insufficient Information

**Detection:** Cannot understand or reproduce from bug report.

**Action:**

1. Add Jira comment with specific questions
2. Transition to "Need Info" status
3. List exactly what information is needed
4. Do NOT guess or assume

### Case 6: Security Bug

**Detection:** Bug involves security vulnerability (auth bypass, data exposure, XSS, etc.)

**Action:**

1. **DO NOT** discuss vulnerability details in public Jira comments
2. Use private/restricted channel if available
3. Prioritize as critical regardless of original severity
4. Consider if disclosure is needed after fix

---

## Decision Flow Diagram

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
    │                              (hotfix/* → main)
    No
    │
    v
┌───────────────────┐
│ Phase 4: Fix      │
│ Implementation    │
│ (fix/* → staging) │
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
│ Phase 8: Feedback │  ←── Optional (user request)
│ (if requested)    │
└─────────┬─────────┘
          │
          v
        DONE
```

---

## Output: Final Report to User

After completing the workflow, present this consolidated report to the user in the chat:

### Fix Report Template

```markdown
## ✅ [ISSUE_KEY] - FIX COMPLETADO

| Aspecto              | Detalle                                  |
| -------------------- | ---------------------------------------- |
| Issue Key            | [ISSUE_KEY]                              |
| Título               | [Bug summary/title]                      |
| Estado Final         | Ready For QA                             |
| Asignado a           | [Tester name] (reporter/tester original) |
| Branch               | `fix/[ISSUE_KEY]/[description]`          |
| Commit               | [Full commit URL - clickeable]           |
| PR                   | [PR URL - clickeable] (si aplica)        |
| Archivos Modificados | [List of modified files]                 |
| Causa Raíz           | [Category]: [Brief explanation]          |
| URL Jira             | [Full Jira URL - clickeable]             |

---

### Acciones Realizadas

| Acción            | Detalle                                                   |
| ----------------- | --------------------------------------------------------- |
| Jira - Read       | `jira_get_issue` [ISSUE_KEY] (con comentarios/changelog)  |
| Jira - Transition | [Status inicial] → In Progress → Ready For QA             |
| Jira - Fields     | Root Cause, Fix Type actualizados                         |
| Jira - Comments   | [N] comentarios añadidos (Fix documentation [+ Feedback]) |
| Jira - Assign     | Asignado a [Tester name] para re-test                     |
| Git - Branch      | `fix/[ISSUE_KEY]/[description]`                           |
| Git - Commit      | `fix([ISSUE_KEY]): [commit message]`                      |
| Git - Push        | → [target branch: staging/main]                           |
| Verificación      | typecheck ✓, lint ✓, build ✓                              |

---

### Triage Assessment

| Criterio              | Resultado                                   |
| --------------------- | ------------------------------------------- |
| ¿Es realmente un bug? | ✅ Sí / ⚠️ Parcial / ❌ No (es enhancement) |
| ¿Alineado con AC?     | [Sí/No - referencia AC si existe]           |
| ¿Reproducible?        | ✅ Sí / ⚠️ Intermitente / ❌ No             |
| Tipo de Fix           | Bugfix / Hotfix                             |
| Decisión              | [Breve explicación de la decisión tomada]   |

**Análisis:**
[1-2 párrafos explicando:

- Contexto del bug
- Por qué ocurría
- Decisiones tomadas durante el fix
- Notas relevantes para QA (casos edge, limitaciones, etc.)
- Si fue un caso borderline (Bug vs Enhancement), explicar el razonamiento]

---

### Cómo Verificar el Fix

1. Navegar a [URL/página específica]
2. [Paso específico de verificación]
3. [Paso específico de verificación]
4. **Expected:** [Comportamiento esperado después del fix]

---

**Próximo paso:** Bug retest / QA verification: out of scope here — see `agentic-qa-boilerplate` sister repo.
```

### Report Variations

**For HOTFIX (critical production bugs):**

Add this banner at the top:

```markdown
## 🚨 [ISSUE_KEY] - HOTFIX COMPLETADO

> **HOTFIX:** Este fix fue aplicado directamente a `main` por ser crítico en producción.
> Backport a staging: [Sí, commit: XXX / Pendiente / N/A]
```

**For Duplicate resolution:**

```markdown
## 🔗 [ISSUE_KEY] - DUPLICADO

| Aspecto      | Detalle              |
| ------------ | -------------------- |
| Issue Key    | [ISSUE_KEY]          |
| Duplicado de | [EXISTING_ISSUE_KEY] |
| Estado Final | Duplicate            |
| URL Jira     | [Jira URL]           |

### Acciones Realizadas

| Acción            | Detalle                        |
| ----------------- | ------------------------------ |
| Jira - Read       | `jira_get_issue` [ISSUE_KEY]   |
| Jira - Link       | Linked to [EXISTING_ISSUE_KEY] |
| Jira - Transition | [Status] → Duplicate           |
| Jira - Comment    | Documented duplicate reasoning |

**Análisis:** [Por qué es duplicado, qué issue tiene el fix/tracking]

**Próximo paso:** Seguir progreso en [EXISTING_ISSUE_KEY]
```

**For WAD (Working As Designed):**

```markdown
## ✅ [ISSUE_KEY] - CERRADO (WAD)

| Aspecto      | Detalle                   |
| ------------ | ------------------------- |
| Issue Key    | [ISSUE_KEY]               |
| Resolución   | Working As Designed (WAD) |
| Estado Final | Won't Fix                 |
| URL Jira     | [Jira URL]                |

### Acciones Realizadas

| Acción            | Detalle                      |
| ----------------- | ---------------------------- |
| Jira - Read       | `jira_get_issue` [ISSUE_KEY] |
| Jira - Transition | [Status] → Won't Fix         |
| Jira - Comment    | Documented WAD reasoning     |

**Análisis:**
[Por qué no es un bug - referencia a AC, diseño, o documentación]

**Recomendación:** [Si aplica, sugerir crear Enhancement]
```

**For Cannot Reproduce:**

```markdown
## ❓ [ISSUE_KEY] - NO REPRODUCIBLE

| Aspecto      | Detalle                      |
| ------------ | ---------------------------- |
| Issue Key    | [ISSUE_KEY]                  |
| Estado Final | Need Info / Cannot Reproduce |
| Intentos     | [N] intentos de reproducción |
| URL Jira     | [Jira URL]                   |

### Acciones Realizadas

| Acción            | Detalle                           |
| ----------------- | --------------------------------- |
| Jira - Read       | `jira_get_issue` [ISSUE_KEY]      |
| Jira - Comment    | Preguntas específicas al reporter |
| Jira - Transition | [Status] → Need Info              |

**Análisis:**
[Qué se intentó, qué información falta, preguntas para el reporter]

**Próximo paso:** Esperar respuesta del reporter con más detalles
```

---

## Output Checklist (Internal)

Before presenting the final report, verify:

**Jira Updates:**

- [ ] Bug analyzed with full context
- [ ] Reproduction documented
- [ ] Triage decision made and documented
- [ ] Root Cause custom fields updated
- [ ] Fix documentation comment added
- [ ] Issue transitioned to Ready For QA
- [ ] Assignee updated to original reporter/tester

**Code Changes:**

- [ ] Fix implemented following code standards
- [ ] Fix verified (typecheck, lint, build, manual test)
- [ ] Branch created with proper naming
- [ ] Commit with semantic message
- [ ] PR created with detailed description (if applicable)

**Report Quality:**

- [ ] All URLs are complete and clickeable
- [ ] Triage assessment includes reasoning
- [ ] Analysis section provides useful context
- [ ] "Cómo Verificar" has specific, actionable steps

**Optional:**

- [ ] Educational feedback provided (if requested)
- [ ] Hotfix backported (if applicable)

---

## Quick Reference: Tools

| Action                | Tool                                       |
| --------------------- | ------------------------------------------ |
| Read bug issue        | `[ISSUE_TRACKER_TOOL]` to get issue        |
| Search for duplicates | `[ISSUE_TRACKER_TOOL]` to search issues    |
| Update custom fields  | `[ISSUE_TRACKER_TOOL]` to update issue     |
| Add comment           | `[ISSUE_TRACKER_TOOL]` to add comment      |
| Transition status     | `[ISSUE_TRACKER_TOOL]` to transition issue |
| Link issues           | `[ISSUE_TRACKER_TOOL]` to link issues      |
| Search for fields     | `[ISSUE_TRACKER_TOOL]` to search fields    |
| Navigate browser      | `[AUTOMATION_TOOL]` (if available)         |
| Take screenshot       | `[AUTOMATION_TOOL]` (if available)         |
| Check library docs    | `[DOCS_TOOL]`                              |

## Quick Reference: Jira Transition IDs (UPEX Galaxy)

> **Note:** Transition IDs may vary by workspace. Use `[ISSUE_TRACKER_TOOL]` to get available transitions for a specific issue.

| ID  | Transition Name | From → To                  |
| --- | --------------- | -------------------------- |
| 121 | start fixing    | OPEN → In Progress         |
| 5   | Hard pushed     | In Progress → Ready For QA |
| 141 | is not a Bug    | OPEN → Enhancement         |
| 71  | is duplicated   | OPEN → Duplicated          |
| 8   | is CNR          | OPEN → Cannot Reproduce    |
| 111 | is WAD          | OPEN → Working As Designed |
| 51  | defer           | OPEN → Deferred            |

**Usage:**

```
Use [ISSUE_TRACKER_TOOL] to transition issue:
  issue_key: "PROJ-123"
  transition_id: "121"  // or transition name: "start fixing"
```

## Quick Reference: Git Commands

| Action                 | Command                                                   |
| ---------------------- | --------------------------------------------------------- |
| Create fix branch      | `git checkout -b fix/ISSUE-KEY/description`               |
| Create hotfix branch   | `git checkout -b hotfix/ISSUE-KEY/description`            |
| Stage changes          | `git add [files]`                                         |
| Commit with message    | `git commit -m "fix(ISSUE-KEY): description"`             |
| Push branch            | `git push -u origin [branch-name]`                        |
| Create PR              | `gh pr create --title "..." --body "..." --base [branch]` |
| Cherry-pick (backport) | `git cherry-pick [commit-hash]`                           |

## Quick Reference: Code Quality Commands

| Check      | Command (npm)        | Command (bun)        |
| ---------- | -------------------- | -------------------- |
| TypeScript | `npm run typecheck`  | `bun run typecheck`  |
| Lint       | `npm run lint:check` | `bun run lint:check` |
| Build      | `npm run build`      | `bun run build`      |
| Test       | `npm run test`       | `bun run test`       |

---

## Related Prompts

| Prompt                                     | When to Use                   |
| ------------------------------------------ | ----------------------------- |
| `fase-7-implementation/implement-story.md` | For implementing new features |
| `fase-8-code-review/review-pr.md`          | For code review of the fix PR |
| `git-flow.md`                              | For advanced git operations   |

> _Bug reporting, retest, and QA verification flows are out of scope here — see the `agentic-qa-boilerplate` sister repo._

---

## Multi-Bug Session Support

This section provides templates for handling multiple bugs in a single session.

### JQL Query for Pending Bugs

Use this query to get a list of bugs to work on:

```
project = [PROJECT_KEY] AND issuetype in (Bug, Defect) AND status = OPEN ORDER BY priority DESC, created ASC
```

**Tool usage:**

```
Use [ISSUE_TRACKER_TOOL] to search issues:
  jql: "project = PROJ AND issuetype in (Bug, Defect) AND status = OPEN ORDER BY priority DESC"
  fields: "summary,priority,status,reporter,created"
  limit: 20
```

---

### Bug List Template

Use this table to track progress across multiple bugs:

```markdown
## Lista de Bugs - Sesión [DATE]

| #   | Key       | Summary   | Priority | Status | Resultado    |
| --- | --------- | --------- | -------- | ------ | ------------ |
| 1   | [PROJ-XX] | [Summary] | Highest  | OPEN   | ⏳ Pendiente |
| 2   | [PROJ-XX] | [Summary] | High     | OPEN   | ✅ Fixed     |
| 3   | [PROJ-XX] | [Summary] | Medium   | OPEN   | ❌ WAD       |
| 4   | [PROJ-XX] | [Summary] | Low      | OPEN   | 🔗 Duplicate |

**Leyenda:**

- ⏳ Pendiente
- ✅ Fixed (Ready For QA)
- ❌ WAD / Rejected
- 🔗 Duplicate
- ❓ CNR (Cannot Reproduce)
- 🔄 Enhancement
```

---

### Session Report Template

Use this report at the end of a multi-bug session:

```markdown
## 📊 Reporte de Sesión - Bug Fixing [DATE]

### Resumen Ejecutivo

| Métrica                             | Valor |
| ----------------------------------- | ----- |
| Bugs analizados                     | [N]   |
| Bugs arreglados                     | [N]   |
| Bugs rechazados (WAD/CNR/Duplicate) | [N]   |
| Commits realizados                  | [N]   |
| Archivos modificados                | [N]   |

---

### Bugs Procesados

#### ✅ [PROJ-XX] - [Summary]

| Aspecto      | Detalle             |
| ------------ | ------------------- |
| Estado Final | Ready For QA        |
| Root Cause   | [Category]: [Brief] |
| Commit       | [URL]               |
| Asignado a   | [Tester]            |

#### ❌ [PROJ-XX] - [Summary]

| Aspecto      | Detalle               |
| ------------ | --------------------- |
| Estado Final | WAD / Duplicate / CNR |
| Razón        | [Explicación breve]   |

---

### Cambios en Código

| Archivo            | Bugs Relacionados | Cambio        |
| ------------------ | ----------------- | ------------- |
| `path/to/file.ts`  | PROJ-XX, PROJ-YY  | [Descripción] |
| `path/to/other.ts` | PROJ-ZZ           | [Descripción] |

---

### Feedback Educacional Entregado

| Tester | Puntos Clave           |
| ------ | ---------------------- |
| [Name] | [Resumen del feedback] |

---

### Próximos Bugs a Atender

| #   | Key       | Summary   | Priority   |
| --- | --------- | --------- | ---------- |
| 1   | [PROJ-XX] | [Summary] | [Priority] |
| 2   | [PROJ-XX] | [Summary] | [Priority] |
```

---

### Session Continuation Template

To continue a previous session, paste this block with updated data:

```markdown
---

## Continuación de Sesión Anterior

**Sesión anterior:** [DATE]
**Bugs completados:** [N]
**Bugs pendientes:** [N]

### Resumen del Progreso Anterior

[Pegar aquí el reporte de sesión anterior o resumen clave]

### Bugs Pendientes de la Sesión Anterior

| # | Key | Summary | Priority | Notas |
|---|-----|---------|----------|-------|
| 1 | [PROJ-XX] | [Summary] | [Priority] | [Contexto si hay] |
| 2 | [PROJ-XX] | [Summary] | [Priority] | |

---

**Continuando con:** [PROJ-XX]
```

---

## Troubleshooting

| Issue                               | Solution                                             |
| ----------------------------------- | ---------------------------------------------------- |
| "Field customfield_XXXXX not found" | Use Fallback Strategy (search or include in comment) |
| "Transition not valid"              | Check available transitions for current status       |
| Cannot reproduce bug                | Request more info, check environment differences     |
| Fix breaks other tests              | Investigate regression, consider scope of fix        |
| PR conflicts                        | Rebase on target branch, resolve conflicts           |
| Hotfix needs backport               | Use cherry-pick to apply to staging/develop          |

### Custom Fields Not Returned (Common Issue)

**Problem:** `jira_get_issue` with `fields: "*all"` returns standard fields but custom field values are `null` or missing.

**Root Cause:** The Atlassian MCP may not expand custom fields automatically.

**Solution:** Always make TWO calls:

1. **First call:** `fields: "*all"` for standard fields + comments
2. **Second call:** Explicitly list custom field IDs:
   ```
   fields: "customfield_10109,customfield_10110,customfield_10112,customfield_10116,customfield_12210,customfield_10701,customfield_10111,customfield_10607,customfield_12212"
   ```

**If still not found:**

1. Verify field exists: use `[ISSUE_TRACKER_TOOL]` to search fields with keyword
2. Ask user for correct field ID
3. Check if field is only visible to certain roles/projects

**NEVER assume a field is empty without making the explicit call.**

### Incorrect Feedback Due to Missing Fields

**Problem:** AI gives feedback that custom fields are "missing" when they were actually filled.

**Root Cause:** AI only made one call with `fields: "*all"` and assumed empty = not filled.

**Prevention:**

1. Always make the second explicit call for custom fields
2. Before giving feedback on missing fields, verify with explicit field query
3. In Phase 8 (Feedback), explicitly list which fields WERE found and their values

**If you already gave incorrect feedback:**

1. Acknowledge the error to the user
2. Re-query with explicit field IDs
3. Provide corrected assessment
