# Continue an implementation

Resume **STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}** after it was paused. The goal is to find out what is really done before writing anything new: compare the plan with the code, report the state, then carry on from the first pending step under the same rules as `implement-story.md`.

## Tool check

Check which MCPs are available before continuing:

1. Context7 MCP, for library documentation.
2. DB MCP (capability `db`), only when the story needs database changes. They are applied according to `agentic-dev-core/references/db-change-doctrine.md`.
3. shadcn MCP, for UI components (when the project uses shadcn).

`references/implement-story.md` ("Tool check (MCP)") has the detail on each one, including what to do when one is missing and what a routine does with nobody at the keyboard.

## Context to read

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/implementation-plan.md
```

Also read the code already implemented in the project and the files modified recently.

## Process

### Step 1: Analyze the current state

1. Review `implementation-plan.md`: which steps are complete and what is still missing.
2. Review the existing code: the files already created or modified and the functionality already implemented.
3. Validate the state: run `{{stack.package_manager}} run {{stack.scripts.build}}` to see whether it compiles (with the role null, use the `types` script and say so), and do a quick manual test of what works.

### Step 2: Report the state

Output:

```markdown
## Current state of STORY-{PROJECT_KEY}-{ISSUE_NUM}

### Completed

- Step 1: [Name] - [Files: x, y, z]
- Step 2: [Name] - [Files: a, b]

### In progress

- Step 3: [Name] - partially implemented
  - Done: [completed part]
  - Pending: [pending part]

### Pending

- Step 4: [Name]
- Step 5: [Name]

### Current validation

- Build: compiles / errors
- Functionality: [what works now]

### Next step

[Description of the next step to implement]
```

### Step 3: Continue the implementation

From the first pending step:

1. Implement the next step in full.
2. Validate that it works (build plus a manual test).
3. Move on to the next one.

The same rules as `implement-story.md` hold:

- No integration or E2E tests: that is QA's work, outside this skill.
- Follow the code standards, the error handling rules and the design system.
- Create unit tests with `/unit-testing` when you finish.

If you find errors in code that was already implemented, debug them first with `fix-issues.md`.
