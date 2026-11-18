# Implement a story

Stage 2 for a new story: implement **STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}** one step at a time from its implementation plan, validate it by hand, and hand off to unit tests and code review. The plan is the contract, so read it before touching code. This phase delivers functionality plus unit tests. Integration and E2E tests belong to the QA workflow (Test Automation), outside this skill.

## Jira fields and tools

Jira field ids differ per workspace, so this skill never carries them. Each field resolves at runtime through `{{jira.<slug>}}` against the catalog in `.agents/jira-required.yaml`; the slug-to-id map is `.agents/jira-fields.json`, filled by `bun run jira:sync-fields`. When a slug does not exist in the target workspace, the catalog declares the fallback and `bun run jira:check` warns.

This workflow reads one slug: `{{jira.acceptance_test_plan}}`, the Story-level Textarea with the test cases the implementation must cover. It is read-only here, and always through the sync (`bun run jira:sync-issues get <STORY_KEY> --include-comments`, then read `acceptance-test-plan.md`), never with `view` on the custom field.

Every Jira read or write is written as `[ISSUE_TRACKER_TOOL]` pseudo-code, and the runtime picks the tool from the table in `.agents/instructions/agent-tool-resolution.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). The operation-to-tool matrix is in `.agents/skills/product-management/references/jira-operations.md`, and the rich-text (ADF) publishing bugs are in `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

## Tool check (MCP)

Check these before starting.

### Context7 MCP

Can you reach `[DOCS_TOOL]`? Context7 gives you the official, current docs for Next.js, React, Supabase and the rest, so you implement against the current API instead of remembered, possibly outdated knowledge.

When it is missing, tell the person in one message. Connecting it takes three steps: read `docs/setup/mcp/README.md` (per-harness guides `claude-code.md` and `codex.md`), add Context7 to the MCP configuration, and restart the session. Offer two options: pause and connect it (recommended), or continue on the model's own knowledge, which is less reliable. The stop and its wording follow `agentic-dev-core/references/mcp-capabilities.md` §4.

### DB MCP (capability `db`: Supabase or the same Postgres family)

Only a story that touches the database (schema, RLS, functions, data) needs it. A story that does not touch it never stops on this capability (`agentic-dev-core/references/mcp-capabilities.md` §4, optional steps).

Is there a tool whose name ends in `list_migrations` or `execute_sql`, under any prefix? When the story needs the database and there is none, stop per `agentic-dev-core/references/mcp-capabilities.md` §4: name the capability, the server that provides it and how to enable it. Hand-written SQL is an option only if the person picks it after that stop.

### shadcn/ui MCP (when the project uses shadcn)

Can you reach it? Use it when creating new UI components, to search the available shadcn components and to confirm component props and API. It gives semantic component search and current docs, so components follow shadcn's own practices. Without it you can continue on your knowledge of shadcn, which may be outdated.

## Required context

Read these in order.

### 1. Story and implementation plan

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/story.md
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/implementation-plan.md
```

Read the whole synced folder, not only these two. The sync (`bun run jira:sync-issues get <STORY_KEY> --include-comments`) materializes the complete Story folder under `.context/PBI/`: every per-field file (`story.md`, `acceptance-criteria.md`, `scope.md`, custom fields and so on) plus `comments.md`. Skipping an AC, the scope, a custom field or a comment means implementing a different story than the one asked for.

The Acceptance Test Plan (the test cases) is a detailed read that depends on the modality, and it is always materialized through the sync:

1. jira-native: the ATP is the Story field `{{jira.acceptance_test_plan}}`. Run `bun run jira:sync-issues get <STORY_KEY> --include-comments`, then read `.context/.../stories/.../acceptance-test-plan.md` (inline comments with "Test Case", "TC-" or "Scenario:" in `comments.md` count too).
2. jira-xray: the ATP is the description of the `Test Plan` issue. Run `bun run jira:sync-issues get <ATP_KEY>` (the sync supports Test Plan and Test Execution issues), then read `.context/.../test-plans/TESTPLAN-<KEY>-<slug>.md`. Per-TC run results come through xray-cli.
3. Last fallback: `comments.md` or the issue description, where the `## Acceptance Test Plan` fallback comment lands when the custom field is absent (per `.agents/jira-required.yaml`).

The story gives you what to implement (the Acceptance Criteria), the plan gives you how (the technical steps), and the Jira test cases tell you what to validate afterwards.

### 2. Development guidelines

```
.agents/skills/sprint-development/references/
├── code-standards.md           # code standards (DRY, naming, TypeScript)
├── error-handling.md           # structured error handling
└── data-testid-standards.md    # data-testid attributes for E2E testing
```

These are the defaults for an app that has no convention of its own. Where the app already has one (structure, the alias `{{stack.conventions.import_alias}}`, naming, error handling, the test id style `{{stack.conventions.testid_style}}`), the app's wins: `../SKILL.md` under `## Stack parameters`, "Existing conventions win". An existing test id is never renamed.

### 3. Design system (when the story has UI)

```
DESIGN.md                                  # frozen tokens (path: frontend.design_md_path in .agents/project.yaml)
.context/design/master-design-plan.md      # §8 US-to-screen, §4 screen spec (AGENTS.md Rule 14)
.context/design-system.md                  # component guide, when frontend-setup created it
```

It tells you which reusable UI components exist, the palette and visual style, and the design patterns to follow.

### 4. Technical specs

```
.context/SRS/architecture-specs.md
.context/SRS/api-contracts.yaml  (when the story touches backend or API)
```

They give the project's tech stack, folder structure and API contracts (endpoints, schemas). Without an SRS (an existing app whose product docs are the business maps), the same questions are answered by the map sections `../SKILL.md` lists under "Product docs: PRD/SRS or business maps" (architecture, data model, API contract), plus `.context/business/project-dev-guide.md`. Do not create an SRS to complete this step.

## Implementation process

### Step 1: Read and understand

1. Read `implementation-plan.md` whole. Identify every step, understand the dependencies, and check the size of the change against the plan's Review Size Forecast.
2. Read `story.md`. Understand each Acceptance Criterion, the user value and the reason behind the story.
3. Review the test cases (Acceptance Test Plan). Use the modality-aware discovery order: sync get `<STORY>` or `<ATP_KEY>`, then the materialized `acceptance-test-plan.md` (jira-native) or `test-plans/TESTPLAN-<KEY>-<slug>.md` (jira-xray), then `comments.md` or the issue description as the last fallback. Understand what is expected to work, spot the edge cases, and use the test cases as a checklist while you implement. Unit tests come after the code, with `/unit-testing`; integration and E2E belong to the QA workflow.
4. Check library docs with Context7 MCP. This is the most important MCP, so use it whenever you work with an external library: read the current official docs of a library you have not used, verify any doubt about an API, and confirm that the API or method exists in the version in use before you implement against it. Use `[DOCS_TOOL]` for Next.js, React, Supabase and the like.
5. Load the frontend skills, then consult the shadcn MCP (story has UI).
   - Required, before the first component or layout write: the design set (`/frontend-design` + `/ui-ux-pro-max` + `/impeccable` + `/emil-design-eng` + `/modern-web-guidance`) + `/shadcn` + `/tailwind-css-patterns` (category `frontend-ui`). They carry the composition, shadcn and Tailwind rules, and `/modern-web-guidance` picks the native platform feature (`search`, then `retrieve`) before any dialog, popover, form, animation or layout behaviour is written; the shadcn MCP below is the component catalog, not a substitute. A story that redesigns a screen that already exists also loads `/redesign-existing-projects`; a public marketing page (landing, pricing) also loads `/design-taste-frontend`, and an indexable one `/seo`. Not installed: say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
   - When you need UI components, search the available shadcn components, and when a prop is in doubt, check the component's API (search "dialog", "form" or "table" to find the right one).

Output of this step:

```markdown
## Analysis complete

**Story:** STORY-{PROJECT_KEY}-{ISSUE_NUM} - [Title]

**Acceptance Criteria:**

1. [AC1]
2. [AC2]
3. [AC3]

**Steps to implement:**

1. [Step 1]: [short description]
2. [Step 2]: [short description]
3. [Step 3]: [short description]

**Technologies involved:**

- [Tech 1]
- [Tech 2]

**Design system components to use:**

- Button (variant: primary)
- Card
- [Others...]

**Next step:** Implement Step 1
```

### Step 2: Dependencies and database changes

Verify that these exist:

- [ ] The needed dependencies are installed
- [ ] The environment variables are set (`.env`)
- [ ] The database is reachable (when it applies)

When something is missing, do not run interactive scripts (`npm init`, `npx create-*` and the like), because they wait for input nobody can type. Install dependencies with the app's package manager: `{{stack.package_manager}} add [package]`. When the setup is complex, walk the person through it step by step.

For database changes:

- Required first: load `/supabase` + `/supabase-postgres-best-practices` (category `backend-db`) before the first schema, RLS, function or migration call through the DB MCP. Not installed: say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- Read the migration history through the DB MCP (`list_migrations`) right before writing the change.
- Apply it according to `{{stack.database.migrations_tool}}`. With `supabase-mcp` or `supabase-cli`, apply through the DB MCP (`supabase-cli` also commits the file under the version the MCP recorded). With `prisma` or `drizzle`, the app's own tool generates the migration and applying it is the team's pipeline, so ask before applying; the MCP stays read-only. Detail: `agentic-dev-core/references/db-change-doctrine.md`.
- After applying, `list_migrations` shows the change: re-read the live definition and regenerate the types (`{{stack.package_manager}} run {{stack.scripts.db_types}}`).
- No DDL through `execute_sql`, and no change applied only to clear a local error, because either one leaves the real schema history out of step with the code.

### Step 3: Implement one step at a time

Follow `implementation-plan.md` one step at a time. For each step:

**A) Announce what you are about to do:**

```markdown
### Implementing Step 1: [Step name]

**Task:** [Description]
**Files to create or modify:**

- [File 1]
- [File 2]

**Approach:** [Short explanation of the approach]
```

**B) Implement the code:**

- Create or modify files.
- Follow the code standards (`references/code-standards.md`) and apply error handling (`references/error-handling.md`).
- With UI, use design system components.
- Add `data-testid` to every UI component (see B.1).

**B.1) data-testid for E2E testing.** Mandatory for every component with UI, because the QA automation selects elements by it. Where to add it depends on the component type:

| Type | Where to add it | Example |
| --- | --- | --- |
| Base UI components (shadcn Button, Card, Input) | Where it is **used** | `<Button data-testid="submit_button">` |
| Domain components (MentorCard, LoginForm and the like) | In the **definition** | see the example below |

```tsx
// Domain-specific component: data-testid in the DEFINITION
export function MentorCard({ mentor }) {
  return (
    <Card data-testid="mentorCard">  {/* Root: camelCase */}
      <h3 data-testid="mentor_name">{mentor.name}</h3>  {/* Internal: snake_case */}
      <Button data-testid="book_session_button">Book session</Button>
    </Card>
  )
}

// Base UI components: data-testid where they are USED
<Input data-testid="email_input" type="email" />
<Button data-testid="login_button">Log in</Button>
```

Naming: the root component is camelCase (`mentorCard`, `loginForm`) and internal elements are snake_case (`email_input`, `submit_button`). Never use dynamic ids such as ``data-testid={`card-${id}`}``, which no selector can predict. Descendant selectors work: `$('[data-testid="mentorCard"] button')`. Full reference: `references/data-testid-standards.md`.

**C) Explain the important decisions:**

```markdown
**Decision:** [Decision made]
**Reason:** [Why you chose this approach]
```

**D) Validate by hand that it works:**

````markdown
**Validation:**

- Code compiles without TypeScript errors
- Linting passes (when configured)
- Basic functionality shows up and works (smoke test)

**How to test:**

```bash
{{stack.package_manager}} run {{stack.scripts.dev}}   # from {{stack.app_root}}
# Go to: http://localhost:3000/[route]
# Check: [what should show up or work]
```
````

**E) Continue to the next step.**

While implementing:

- Do not hardcode values (use env vars and constants), duplicate code (keep it DRY), use `any` in TypeScript (type explicitly), or use `console.error` (use the proper logger).
- Do not hardcode SQL in the app code: use parameterized queries or the project's client. Schema changes go through the DB MCP (`agentic-dev-core/references/db-change-doctrine.md`).
- Do not create a UI component that already exists. Reuse the design system.
- Do not implement integration or E2E tests: that is QA's Test Automation, outside this skill.
- Follow the structure and conventions the app already has, since they win over the defaults in the references. Apply the naming conventions (camelCase, PascalCase as appropriate), document complex functions (JSDoc when needed), handle errors properly (try-catch, error boundaries), and validate user input (sanitization, validation).
- Add test ids to new UI components in the app's style (`{{stack.conventions.testid_style}}`, or the one its code already uses; with none, `references/data-testid-standards.md`). Never rename an existing one.

### Step 4: Manual smoke test

When all steps are done:

1. Build the project:

   ```bash
   {{stack.package_manager}} run {{stack.scripts.build}}   # role null: skip it and report that
   ```

   The build succeeds with no TypeScript errors, and linting passes (when configured).

2. Test the functionality by hand: start the dev server, go to the page or feature you implemented, and check EACH Acceptance Criterion manually.

Output:

```markdown
## Manual validation

**Acceptance Criteria:**

- AC1: [Description] - works correctly
- AC2: [Description] - works correctly
- AC3: [Description] - works correctly

**Edge cases reviewed:**

- [Edge case 1]: works
- [Edge case 2]: works

**How I tested:**

1. [Step 1]
2. [Step 2]
3. [Expected result]
```

Unit tests are created with `/unit-testing`. Integration and E2E tests belong to the QA workflow, outside this skill.

### Step 5: Wrap-up and next steps

When the implementation is finished:

````markdown
## Implementation complete

### Files created or modified

**Created:**

- `[path]` - [short description of what it does]
- `[path]` - [short description]

**Modified:**

- `[path]` - [what changed]

### Functionality implemented

**Acceptance Criteria met:**

- AC1: [Description]
- AC2: [Description]
- AC3: [Description]

### Manual validation done

- Build succeeds
- Linting has no errors
- Functionality tested by hand
- Edge cases considered

**Commands to test locally:**

```bash
# 1. Install dependencies (if you added any)
{{stack.package_manager}} install

# 2. Start the server
{{stack.package_manager}} run {{stack.scripts.dev}}

# 3. Open in the browser
# http://localhost:3000/[route]

# 4. Check that:
# - [Point 1 to check]
# - [Point 2 to check]
```
````

Next steps:

1. Unit tests (if not done yet): load `/unit-testing` for unit test design (TDD, AAA, mocking) and write tests for the critical business logic.
2. Code review (Stage 3): use `references/review-pr.md`, a sibling in this skill, which reviews the code with static analysis.
3. Integration and E2E tests are out of scope for this skill. They come after code review and the staging deployment, in the QA workflow.

Suggested commit message:

```
feat(STORY-{PROJECT_KEY}-{ISSUE_NUM}): [Short description]

- Implements [functionality 1]
- Adds [functionality 2]
- Modifies [functionality 3]

Acceptance Criteria:
- AC1: [Description]
- AC2: [Description]
- AC3: [Description]

Story: [Jira link, if it applies]
```

Do not commit yet: write the unit tests first, then go through code review (Stage 3).

## With nobody at the keyboard

A person who is present answers each question below as written. A supervised worker sends the question to its conductor and waits for the answer. A routine does the reversible work, stops short of the outward part and reports (`agentic-dev-core/references/decision-protocol.md`):

- A missing `library-docs` or `db` capability follows `agentic-dev-core/references/mcp-capabilities.md` §4: a worker asks its conductor, and a routine skips the dependent step, does the work that needs no capability and puts the gap in the run report. Neither guesses an API from memory.
- A command that needs interactive input, or a setup too complex to script: write the manual steps in the run report and keep going with the work that does not depend on it.
- A `prisma` or `drizzle` migration: generate the migration file, and leave applying it to the team's pipeline. A routine reports it as pending and never applies it.

## Troubleshooting

### A script asks for interactive input

Do not run commands such as `npx create-next-app@latest` or `npm init`, which prompt. Give the person the manual steps instead:

```markdown
This command needs interactive input. Here are the manual steps:

**Option 1: the user runs it**

1. Open a terminal
2. Run: [command]
3. Choose: [recommended options]

**Option 2: manual setup**
[Steps to configure it by hand without an interactive script]
```

### Context7 MCP is not available

See "Tool check (MCP)" above.

### TypeScript compile error

Follow `references/fix-issues.md`: read the whole error, find the file and line, check Context7 when the error comes from an external library, then fix the type, import or syntax.
