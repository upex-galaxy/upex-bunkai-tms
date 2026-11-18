# Frontend setup

This phase scaffolds the frontend once, after backend setup, and leaves a base every later story reuses: the design system, the project structure, the Supabase types wired in, and two or three demo pages that prove the system works. It is not feature work. The goal is a coherent, good-looking foundation the team can build on.

The user-facing templates below are written in English. Say them in the language the user writes in.

---

## Entry guard: greenfield only

This phase only creates things (`next@latest`, `tailwind.config` and `globals.css` from `DESIGN.md`, `shadcn init`, the layout, `/login` with demo credentials, `middleware.ts`, the demo pages, the README), so on an existing app it would overwrite real work. A script owns the verdict, not your reading of the file tree (`SKILL.md`, "Entry gate", rule **B0**). Before any step:

- `.session/project-bootstrap/plan.md` has the line `Bootstrap guard: greenfield, exit 0`: continue.
- There is no plan (a loose request, or a subagent briefed with only this reference): run `bun run bootstrap:guard`. Exit 0 continues; exit 2 stops.
- The verdict is `existing-app`, unreadable or missing: stop and touch nothing. Quote the signals the script printed, say what this phase would have overwritten, and route to `/project-adoption` (and to `/design-system extract` when the request was about how the UI looks). The Phase 3 add-ons of the skill stay available and read the `stack:` block.

Do not replace the verdict by inspecting the tree yourself, and do not accept "it is greenfield" from the user as a waiver. `SKILL.md` says how to fix a wrong reading.

---

## Inputs

### Project context

Read all of these:

- `.context/PRD/executive-summary.md`: project name, description, industry (essential)
- `.context/PRD/mvp-scope.md`: the main MVP epics and features
- `.context/SRS/architecture-specs.md`: frontend stack, frameworks, libraries
- `DESIGN.md`: palette, typography, visual style (produced by `/design-system`)
- `.context/SRS/functional-specs.md`: the main features, which inspire the demo pages
- `.context/PBI/epic-tree.md` (optional): epics and overall structure

### Backend integration

Backend setup must be finished first. This phase needs:

- `src/types/supabase.ts`: types generated from the database schema (by `backend-setup.md` / `supabase-types-setup.md`)
- `src/lib/supabase/client.ts`: the Supabase browser client
- `src/lib/supabase/server.ts`: the Supabase server client
- `src/lib/config.ts`: the central configuration

From them, identify which database tables exist (they become type helpers), how login and signup work (they shape the auth pages) and which queries are available.

### A partial frontend

If the frontend already exists in part (a resumed run, for example), read `package.json` (dependencies, and the lock file for the package manager), `src/**` (folder structure) and `tailwind.config.js`. Identify whether a Next.js or React project exists, which dependencies are installed and which package manager it uses.

---

## Tools

### MCP servers

1. Context7 is highly recommended. Read the official docs before writing code. Useful queries:
   - "Next.js 15 App Router latest setup"
   - "TailwindCSS v3 configuration latest"
   - "Shadcn/ui installation Next.js App Router"
   - "Lucide React icons usage"

2. The shadcn/ui MCP is highly recommended when the user picks shadcn/ui. It finds any component from a natural-language query, far faster than browsing by hand. When it is available, use it and suggest the user keeps it enabled. Without it, Context7 or a manual search works, only slower.

No other MCP is needed for this phase.

### Local tools

Node.js (v18+ recommended), a package manager (npm, pnpm, yarn or bun; Phase 0 asks the user) and Git (to check state).

### Tailwind CSS v3, pinned on purpose

Install the latest v3 release (3.4.x). It works with Next.js 15 and React 19, keeps the traditional `tailwind.config.js/ts` configuration and the `@tailwind base/components/utilities` syntax, and the shadcn/ui CLI installs components without errors. Tailwind v4 has known compatibility problems with the shadcn CLI (validation errors while installing components) and a more complex CSS-first configuration.

npm now installs v4 by default, so always write `tailwindcss@3` explicitly.

---

## What this phase delivers

Not in scope: every MVP page (only the demos), real business functionality (the UI is visual, with mock data), story-specific designs (those belong to story implementation in `/sprint-development`) and full E2E tests (visual validation only).

Files:

| Area | Files |
|---|---|
| Project config | `package.json`, `tsconfig.json`, `tailwind.config.js` (with the project palette), `next.config.js` (or equivalent), `postcss.config.js` |
| Types | `src/lib/types.ts`: type helpers extracted from the database, importing `src/types/supabase.ts` (created in backend setup) |
| Design system | `src/components/ui/[componentName].tsx` and more components as the project needs them |
| Layout | `src/components/layout/[componentName].tsx` (Navbar, Sidebar, Footer, ...) and `src/app/layout.tsx`, the root layout with providers |
| Auth, if it applies | `middleware.ts` to protect routes; `src/app/login/page.tsx`, a working login page with demo credentials |
| Demo pages | `src/app/page.tsx` (landing: hero, features, CTA) only when it fits the business; `src/app/[pageName]/page.tsx` for the core pages of the priority epics. Keep to the minimum a demo needs |
| Styles | `src/app/globals.css` (Tailwind imports, CSS variables for the palette applied consistently, typography system) |
| Docs | `.context/design-system.md` (palette, components and usage; the one doc the later phases cannot do without), `SETUP.md` or `README.md` with setup instructions |

The phase is done when:

- the TypeScript build passes with no type errors: `[package-manager] run build`
- the UI reflects the visual style of `DESIGN.md` and the palette is applied consistently on every page
- the copy is real, written from the business context, not generic filler
- the user has run the server and confirmed it compiles without warnings and the pages look right (ask them to run it). With nobody at the keyboard, run `[pm] run build`, check the demo pages with `/playwright-cli` in a named session, and list the person's run-and-look check as pending in the report
- the design system is visually coherent and attractive, checked with `/playwright-cli` in a named session or by the user manually

---

## Boundaries

Each of these protects against a likely mistake:

- Run this phase only on a greenfield repo. The entry guard (`bun run bootstrap:guard`) refuses an existing app, which is adopted with `/project-adoption`.
- Leave an existing visual identity alone. A `tailwind.config`, `globals.css` or `components.json` this session did not write is recorded with `/design-system extract`, never overwritten.
- Scaffold in the current directory. `create-next-app`, `create-vite` and `create-react-app` create a subdirectory, and the project is already in the right folder.
- Install only the fundamental dependencies.
- Build two or three demo pages, not the MVP. Use mock data: the demos validate the design system, not business logic, and the acceptance criteria belong to story implementation.
- Take the vocabulary from this project's PRD, SRS and PBI. Example names from other domains make the demos look generic.
- Run only commands that terminate. `npm run dev` and other interactive commands hang the session.
- Recommend commits to the user and do not make them.
- Make the design visually impressive, with personality. A generic one defeats the point of the phase.

The questions this phase asks the user cover layout, priority components, package manager and UI strategy. Palette and style are never asked, because they come from `DESIGN.md`, and values are never invented: the palette is the one in `DESIGN.md`. Explain each decision to the user as you go.

---

## Workflow

| Phase | What happens |
|---|---|
| 0 | Package manager selection |
| 0.5 | Backend types integration |
| 1 | Context analysis: 1.4 `DESIGN.md` pre-flight, 1.5 layout and priority components, 1.5.4 Baseline target, 1.6 UI component strategy |
| 2 | Demo page decision |
| 3 | Project setup: dependencies, folders, Tailwind, global styles |
| 4 | Design system components (4.5: layout components) |
| 5 | Demo pages |
| 6 | Validation |
| 7 | Documentation |

### With nobody at the keyboard

A supervised worker sends a question to its launcher (`agentic-dev-core/references/decision-protocol.md` §5.2). A routine with nobody never waits for an answer. The four questions (package manager, layout, priority components, UI strategy) are technical choices that each offer a "Choose for me" option, so a run with no person takes that option, with the rule written for it in the step, and reports each as `DECIDED: <choice> | beat: <options> | why: <reason>`. The dev-server confirmation in the completion list is a person's check: an unattended run builds, checks the pages with `/playwright-cli` and reports that check as pending. The stops do not have a default: the entry guard, missing backend types, a missing `DESIGN.md` and an existing theme end the run with a report that says what is missing and what to run next.

---

## Phase 0.5: backend integration

Import the TypeScript types the backend generated, so frontend and backend share one set and type errors surface at build time.

### Step 0.5.1: check the backend types

Run `ls -la src/types/supabase.ts`. When the file exists, the types are available to import. When it does not, stop: backend setup (`backend-setup.md`) has to run first, and it generates the types with `npx supabase gen types typescript --project-id xxx > src/types/supabase.ts`.

### Step 0.5.2: create the types helper

File: `lib/types.ts`. Its purpose is to extract the database-specific types components use.

Instruction: import `Database` from `@/types/supabase` and extract the table types (Row, Insert, Update). Add helper types for API responses when needed.

Then explain it to the user:

```markdown
**Backend types integrated**

Benefits:

1. No type mismatches: frontend and backend share the same types.
2. Autocomplete: TypeScript knows exactly which fields each entity has.
3. Safe refactoring: schema changes show up automatically.

Components import their types from `@/lib/types`, and TypeScript validates the available fields.

When the schema changes:

- Regenerate the types: `npx supabase gen types typescript...`
- TypeScript points to where the code breaks
- Update the code
- No production bugs from fields that no longer exist
```

---

## Phase 0: package manager

The user picks the package manager that installs everything else.

### Step 0.1: explain package managers

```markdown
## Package manager selection

Before starting I need to know which **package manager** you want for installing dependencies.

A package manager installs, updates and manages the libraries your project needs.

**npm** (Node Package Manager) ships with Node.js. It works, but it is the slowest of the options. It uses the traditional `node_modules/`. Commands: `npm install`, `npm run dev`.

There are modern alternatives that are much faster and more efficient. I will list them next.
```

### Step 0.2: ask

Ask with the `AskUserQuestion` tool.

Question: "Which package manager do you want to use for this project?" Header: "Package Manager". MultiSelect: false.

Options:

1. **pnpm** (fast and disk-efficient). Very fast, saves disk space with hard links, installs up to 2x faster than npm, popular in monorepos and large projects. Commands: `pnpm install`, `pnpm run dev`.
2. **bun** (all-in-one toolkit), recommended. The fastest option (up to 25x faster than npm). It also runs JavaScript and TypeScript directly, and it is the most modern choice. Commands: `bun install`, `bun run dev`.
3. **Choose for me.** The AI selects the most appropriate package manager for the project and operating system. The default is **bun** for its speed.

### Step 0.3: process the answer

- pnpm: use pnpm in every command.
- bun: use bun in every command.
- "Choose for me" (or nobody to ask): pick **bun** and explain why.

```markdown
## Package manager selected: [pnpm/bun]

**Reason:** [For "Choose for me", say: "I selected **bun** because it is the fastest and most modern, a good fit for agile development. Installs are up to 25x faster than npm."]

**Commands we will use:**

- Install dependencies: `[pnpm/bun] install`
- Add packages: `[pnpm/bun] add [package]`
- Run dev: `[pnpm/bun] run dev`
- Build: `[pnpm/bun] run build`

**Next step:** analyze the project context.
```

---

## Phase 1: context analysis

Understand the project before writing any code.

### Step 1.1: read the project documentation

Read all of these.

PRD (product requirements):

- `.context/PRD/executive-summary.md`: problem, solution, users
- `.context/PRD/user-personas.md`: who will use the system
- `.context/PRD/mvp-scope.md`: epics and main functionality
- `.context/PRD/user-journeys.md`: the main user flows

SRS (software requirements):

- `.context/SRS/functional-specs.md`: detailed functional requirements
- `.context/SRS/non-functional-specs.md`: performance, security and so on
- `.context/SRS/architecture-specs.md`: the most important one: technical stack, framework, patterns
- `.context/SRS/api-contracts.yaml`: the available endpoints

PBI (product backlog):

- `.context/PBI/epic-tree.md`: the full view of the MVP epics
- `.context/PBI/epics/*/epic.md`: review every epic
- `.context/PBI/epics/*/stories/*/story.md`: scan the main stories

Backend types:

- `src/types/supabase.ts`: types generated from the Supabase schema; identify the main entities available

What to identify:

1. Business domain: the problem it solves (PRD), the users (PRD), the domain vocabulary (names, entities), and the personality or tone the app should have (formal, creative, corporate, startup).
2. Technical stack: frontend framework (Next.js, React+Vite, SvelteKit, ...), UI library (TailwindCSS, Material UI, Chakra, ...), auth provider (Supabase, Auth0, Firebase, NextAuth, ...), backend and database (Supabase, Firebase, custom API, ...) and state management (Zustand, Redux, Jotai, ...).
3. Core functionality: the highest-priority epics, the pages that appear in several user journeys, the main business entities.
4. Design hints, if the docs have any: specific colors, a visual style (minimalist, modern, ...) or design references.

The output of this step is for your own use and is not shown to the user: the stack, the domain, the tone, the priority epics, the vocabulary, the design hints and the entities available in `src/types/supabase.ts`.

---

### Step 1.2: read the official docs (Context7 MCP)

Use Context7 to read the official documentation of the stack you identified, so the components you write follow current patterns. Suggested queries:

1. Framework: "[Framework] project structure best practices latest version", "[Framework] routing configuration"
2. Auth provider: "[Auth Provider] client setup [Framework]", "[Auth Provider] authentication flow [Framework]"
3. UI library (the most important): "[UI Library] setup [Framework]", "[UI Library] theming and customization", "[UI Library] component patterns"

Show the user the result:

```markdown
## Analysis complete

### Technical stack identified

- **Framework:** [name and version from the SRS]
- **UI library:** [from the SRS]
- **Auth provider:** [from the SRS]
- **Backend/DB:** [from the SRS]

### Business domain

- **Problem it solves:** [one-line summary from the PRD]
- **Main users:** [personas from the PRD]
- **Core entities:** [main entities]
- **Personality/tone:** [Formal/Creative/Corporate/Startup, inferred from the PRD]

### Priority epics (from the PBI)

1. EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}: [description] - [why it is a priority]
2. EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}: [description] - [why it is a priority]
3. EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}: [description] - [why it is a priority]

### Backend types available

[Entities found in src/types/supabase.ts]

### Documentation consulted

- **[Framework]**: [key concepts]
- **[UI Library]**: [design patterns available]
- **[Auth Provider]**: [recommended setup]

**Next step:** `DESIGN.md` pre-flight (Phase 1.4).
```

---

## Phase 1.4: `DESIGN.md` pre-flight

Confirm that the `DESIGN.md` produced by `/design-system` exists, and derive the visual tokens (palette, typography, spacing, radii) straight from it. Without `DESIGN.md` there is no frontend scaffold (`SKILL.md`, rule **B5**).

### Step 1.4.1: detect `DESIGN.md`

```bash
DESIGN_MD_PATH=$(yq '.frontend.design_md_path // "./DESIGN.md"' .agents/project.yaml 2>/dev/null || echo "./DESIGN.md")

if [ -f "$DESIGN_MD_PATH" ]; then
  echo "DESIGN.md found at $DESIGN_MD_PATH: deriving tokens."
else
  echo "DESIGN.md not found at $DESIGN_MD_PATH. STOPPED (B5): run /design-system and come back to this phase."
  exit 1
fi
```

When `DESIGN.md` exists, parse its YAML frontmatter, map it to `tailwind.config.js` and `globals.css` (table below) and continue with Phase 1.5.

When it does not, stop the frontend scaffold and tell the user to run `/design-system` (the tokens phase), then resume here once `DESIGN.md` exists. There is no alternative path: a palette invented or assembled from asked preferences would replace the tokens (B5). A project that already has a frontend never reaches this phase, because the entry guard refuses it, and its visual identity is recorded as it is with `/design-system extract`.

Visual identity hard guard (B5). Even after a `greenfield` verdict, a theme this session did not write may exist by the time you reach this step (`tailwind.config.*`, a `globals.css` with CSS variables, `components.json`). Then stop: do not generate or overwrite those files from `DESIGN.md`. An existing visual identity is recorded with `/design-system extract` and never replaced. Report the files you found and ask how to proceed. With nobody to ask, report and stop.

### Step 1.4.2: map `DESIGN.md` to the Tailwind config

The frontmatter tokens map like this:

| DESIGN.md frontmatter        | Tailwind config target                    |
| ---------------------------- | ----------------------------------------- |
| `colors.primary`             | `theme.colors.primary.DEFAULT`            |
| `colors.secondary`           | `theme.colors.secondary.DEFAULT`          |
| `colors.tertiary`            | `theme.colors.accent.DEFAULT`             |
| `colors.neutral`             | `theme.colors.neutral.DEFAULT`            |
| `colors.background`          | `theme.colors.background`                 |
| `colors.text`                | `theme.colors.foreground`                 |
| `colors.border`              | `theme.colors.border`                     |
| `typography.h1.fontFamily`   | `theme.fontFamily.heading`                |
| `typography.body.fontFamily` | `theme.fontFamily.sans`                   |
| `typography.body.fontSize`   | `theme.fontSize.base[0]`                  |
| `rounded.sm/md/lg/full`      | `theme.borderRadius.{sm,DEFAULT,lg,full}` |
| `spacing.sm/md/lg`           | `theme.spacing.{2,4,8}` (4px base scale)  |

The mapping follows the Tailwind convention without rewriting the theme from scratch, and the semantic tokens (primary, secondary, accent) match shadcn/ui naming.

### Step 1.4.3: generate the derived files

Once the frontmatter is parsed:

1. Generate `tailwind.config.js` with the mapped tokens. Do not ask the user: `DESIGN.md` is already the source. Do this only on a repo with no previous theme (the hard guard in Step 1.4.1); when the `DESIGN.md` came from `/design-system extract`, the theme already exists in the code and this phase does not run.
2. Generate `globals.css` with the CSS custom properties (`--color-primary`, `--font-heading`, and so on) pointing at the same values.
3. Continue with Phase 1.5 (layout and priority components), then Phase 1.6 (UI component strategy: shadcn, manual or hybrid).

Do not skip Phases 1.5 and 1.6. How the components get implemented is independent of the design system, and shadcn/ui is still a valid question when `DESIGN.md` exists.

---

## Phase 1.5: layout and priority components (interactive)

Palette, typography and visual style are not asked here: they come from `DESIGN.md` (Phase 1.4). This phase decides only what the tokens do not say: the navigation structure and which components to build first.

### Step 1.5.1: question 1, main layout

Ask with the `AskUserQuestion` tool.

Question: "Which layout do you prefer for the application?" Header: "Main Layout". MultiSelect: false.

Options:

1. **Sidebar + Top Navbar** (classic dashboard). Fixed side navigation with a top bar. Fits applications with many sections (5+), dashboards and complex tools.
2. **Top Navbar only** (clean and simple). Fits simple applications (2-4 sections), landing pages and focused apps.
3. **Collapsible Sidebar** (flexible and modern). A sidebar that hides and expands. Fits medium applications that need flexible space and a modern UX.
4. **Choose for me** (based on the MVP pages). Count the MVP pages and pick the layout that fits: 2-3 pages, Top Nav; 4 or more, Sidebar.

### Step 1.5.2: question 2, priority UI components

Ask with the `AskUserQuestion` tool.

Question: "Which UI components are a priority for your application? (you can pick several)" Header: "UI Components". MultiSelect: true.

Options:

1. **Buttons and CTAs** (always recommended). Primary, secondary, outline and ghost buttons, which any application needs.
2. **Cards and containers** (very common). Cards for showing information and containers with shadows or borders. Useful for lists, dashboards and grids.
3. **Forms and inputs** (if you have forms). Inputs, textareas, selects and checkboxes. Needed for auth and create/edit forms.
4. **Modals and dialogs** (interactions). Modal windows, confirmations and dialogs. Useful for confirmations, details and quick forms.
5. **Choose for me** (based on the MVP epics). Analyze the MVP epics and select the components the project will need most.

### Step 1.5.3: process the answers and produce the design plan

After the answers, generate the plan:

```markdown
## Design plan

Based on `DESIGN.md`, your answers and the project analysis, here is the design plan:

---

### Tokens (from `DESIGN.md`)

- **Colors:** primary [hex] · secondary [hex] · accent [hex] · background [hex] · text [hex] · border [hex]
- **Typography:** heading [family] · body [family, size]
- **Radii and spacing:** [values from the frontmatter]

---

### Layout: [selected]

**Structure:**

- Navigation: [Sidebar/Top Nav/Collapsible Sidebar]
- Header: [present/absent] - [content]
- Footer: [present/absent] - [content if it applies]

**Reason:** [For "Choose for me", say: "Your MVP has [X] pages, so [layout] fits best."]

---

### UI components to create

**Level 1 (essential, always created):**

- Button (primary, secondary, outline, ghost, danger)
- Card (default, hover, clickable)
- Layout components (Navbar, Sidebar if it applies)

**Level 2 (by selection):**
[the components the user selected]

**Level 3 (domain-specific):**
[from the epics, the specific components that will be needed]

---

**Next step:** decide the UI component strategy.
```

### Step 1.5.4: question 3, Baseline target

Ask with the `AskUserQuestion` tool.

Question: "Which Baseline target should the UI code hold to?" Header: "Baseline". MultiSelect: false.

Options:

1. **Baseline Widely available** (recommended). Features every major browser has shipped for roughly 30 months. Right unless the product needs newer features.
2. **Baseline <year>** (a named year, for example the current or previous one). Admits features that became Baseline Newly available up to that year. Fits a product with a known modern-browser audience.
3. **Choose for me**. Use Baseline Widely available.

Write the answer as one line under a `## Web platform` heading in `.agents/instructions/agent-project.md` (project-owned, so `bun sync` keeps it), in the form `This project's Baseline target is Baseline Widely available.` or `This project's Baseline target is Baseline <year>.`. Without the line, `modern-web-guidance` assumes Baseline Widely available. Say once that volatile features (not yet Baseline) stay gated and off by default, and that a person enables them with `npx modern-web-guidance@latest set-allow-volatile-features`; never run that command here.

---

## Phase 1.6: UI component strategy (interactive)

Decide how to implement the design system's components. This choice changes development time and effort a lot.

Required skills, loaded before Step 1.6.1: the design set (`/frontend-design` + `/ui-ux-pro-max` + `/impeccable` + `/emil-design-eng` + `/modern-web-guidance`), `/shadcn` and `/tailwind-css-patterns` (category `frontend-ui`). They own component composition, the shadcn CLI and registry, and the Tailwind patterns every component below is written with; the shadcn MCP, when present, is the catalog, not a substitute. Not installed: say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

### Step 1.6.1: question, UI component strategy

Ask with the `AskUserQuestion` tool.

Question: "How do you prefer to implement the design system's UI components?" Header: "UI Strategy". MultiSelect: false.

Options:

1. **shadcn/ui** (recommended, fast and professional). Ready-made, modern, accessible components installed with a CLI. They land in your own code, not in `node_modules`, so you can customize them fully. Includes Button, Card, Input, Dialog, Select, Dropdown, Tooltip and 40+ more components.
2. **Components from scratch** (full control, educational). The AI writes each component by hand in TypeScript and Tailwind CSS. Fits learning component development, very specific requirements or a unique design system. Slower.
3. **Headless UI + custom styles** (middle ground). Headless UI from Tailwind Labs supplies the logic (accessibility, state, keyboard navigation) and the AI writes the visual styles with Tailwind. Fits projects that need guaranteed accessibility with unique styling.
4. **Choose for me.** The AI analyzes the project type and picks the best option. Without a reason to do otherwise it recommends shadcn/ui, for efficiency, quality and development time, and it picks manual components only when it detects very specific requirements.

### Step 1.6.2: process the answer and record the decision

For "shadcn/ui":

```markdown
## Strategy selected: shadcn/ui

**Advantages for your project:**

- 40+ professional components in minutes instead of days or weeks
- WAI-ARIA accessibility included (screen readers, keyboard navigation)
- Responsive by default
- Works with the Tailwind v3 setup this phase installs
- Compatible with React 19 and Next.js 15
- The code lives in your project (fully customizable)
- Complete TypeScript types

**Components available:**

- Basic UI: Button, Card, Badge, Avatar, Separator
- Forms: Input, Textarea, Select, Checkbox, Radio, Switch, Label
- Overlays: Dialog, Popover, Tooltip, Sheet, Drawer
- Navigation: Tabs, Dropdown Menu, Command Menu
- Feedback: Alert, Toast, Progress, Skeleton
- Layout: Accordion, Collapsible, Separator
- Data: Table, Data Table (with sorting and filtering)
- And 20+ more

**Installation:** happens in Phase 4.

**Next step:** decide the MVP demo pages.
```

For "Components from scratch":

```markdown
## Strategy selected: components from scratch

**Benefits for your project:**

- Full control over every line of code
- A deep understanding of component architecture
- No external dependencies
- 100% customized to your specific need

**Components to create:**
[the list from Step 1.5.3, "UI components to create"]

**Things to weigh:**

- Longer development time (3-5x slower)
- The AI has to implement accessibility by hand
- Each component is 50-150 lines of code

**Implementation:** happens in Phase 4.

**Next step:** decide the MVP demo pages.
```

For "Headless UI":

```markdown
## Strategy selected: Headless UI + custom styles

**Benefits for your project:**

- Robust component logic from Tailwind Labs
- Guaranteed accessibility
- 100% custom styles
- Faster than from scratch
- Official support from the Tailwind team

**Components available:**

- Listbox (Select), Combobox (Autocomplete)
- Menu (Dropdown), Popover, Dialog (Modal)
- Disclosure (Accordion), Tabs, Switch
- Radio Group, Transition utilities

**Implementation:** happens in Phase 4.

**Next step:** decide the MVP demo pages.
```

For "Choose for me":

```markdown
## Analyzing the project to recommend a strategy...

**Analysis:**

- Project type: [infer from the PRD]
- UI complexity: [analyze the PBI epics]
- Time available: [infer from urgency in the PRD]
- Special requirements: [look in the SRS]

**Recommendation: shadcn/ui**

**Reason:**
Your [project type] project needs [X] UI components. shadcn/ui offers:

- [Specific benefit 1 based on the epics]
- [Specific benefit 2 based on the user journeys]
- Roughly 85% less development time

If you had very specific requirements in [area], I would recommend components from scratch.
For your case, shadcn/ui is the best option.

**Next step:** decide the MVP demo pages.
```

---

## Phase 2: demo page decision

Decide which two or three demo pages to build, only to validate the design system. Pick pages that exercise its components, typically auth plus one or two core pages of the domain, and never all the MVP pages.

Examples by app type:

```pseudocode
IF app_type == "dashboard/tool":
  Pages: Login + main view (entity grid)

IF app_type == "transactional platform":
  Pages: Login + grid of the main items

IF app_type == "community/social":
  Pages: Login + main feed/listing

IF app_type == "resource management":
  Pages: Login + listing of the main resources
```

Output of this step:

```markdown
## Demo pages selected (2-3)

1. **[Page name 1]** (`/[route]`)
   - **Purpose:** validate [components it shows]
   - **UI components it uses:** [Button, Card, Form, etc.]

2. **[Page name 2]** (`/[route]`)
   - **Purpose:** validate [components it shows]
   - **UI components it uses:** [List, etc.]

**Note:** the remaining MVP pages are built during story implementation, from each story's plan.
```

---

## Phase 3: project setup

Configure the project with the selected package manager. The commands below use `[pnpm/bun]`; substitute the one chosen in Phase 0 (`[pm]` means the same).

### Step 3.1: check the current environment

```markdown
**Package manager selected:** [pnpm/bun]
**Commands to use:** `[pm] install`, `[pm] run dev`, etc.
```

### Step 3.2: install the fundamental dependencies

1. Check current versions with Context7 first:

```markdown
Before installing, ask Context7 MCP for current versions:

- "Next.js latest stable version installation"
- "Tailwind CSS v3 installation packages"
- "Supabase SSR Next.js latest version"
```

2. Core framework (Next.js):

```bash
# Next.js 15.x (stable)
[pnpm/bun] add next@latest react@latest react-dom@latest

# Check the installed version
[pnpm/bun] list next
# Expected: next@15.x.x or higher
```

3. UI library (Tailwind CSS v3):

```bash
# IMPORTANT: specify version 3 explicitly
[pnpm/bun] add -D tailwindcss@3 postcss@latest autoprefixer@latest

# Check the installed version
[pnpm/bun] list tailwindcss
# Expected: tailwindcss@3.4.x
```

Use `tailwindcss@3`, not `@latest`: npm installs v4 by default.

4. Auth provider (Supabase):

```bash
# Supabase clients (stable versions)
[pnpm/bun] add @supabase/supabase-js@latest @supabase/ssr@latest

# Check the installed versions
[pnpm/bun] list | grep supabase
# Expected:
# @supabase/supabase-js@2.x.x
# @supabase/ssr@0.x.x
```

5. TypeScript and dev tools:

```bash
[pnpm/bun] add -D typescript @types/react @types/node eslint prettier

# If shadcn/ui is used (optional):
[pnpm/bun] add -D @types/react-dom
```

6. Validate all the versions:

```bash
# See the versions of the critical dependencies
[pnpm/bun] list | grep -E "(next|react|tailwindcss|supabase)"
```

Expected output:

```markdown
Dependencies installed:

- next: ^15.x.x
- react: ^19.x.x
- tailwindcss: ^3.4.x (must be v3, not v4)
- @supabase/ssr: ^0.x.x
- @supabase/supabase-js: ^2.x.x

If tailwindcss is 4.x.x:

- Problem: v4 was installed by mistake
- Fix: [pm] remove tailwindcss && [pm] add -D tailwindcss@3
```

### Step 3.3: create the folder structure

The structure includes:

```
[framework-dir]/
├── components/
│   ├── ui/           ← Design system components (Button, Card, etc.)
│   ├── layout/       ← Layout components (Navbar, Sidebar, etc.)
│   └── [domain]/     ← Domain-specific components
├── lib/
│   ├── types.ts           ← Type helpers over src/types/supabase.ts (created in Phase 0.5)
│   └── utils.ts           ← Utilities (cn function, etc.)
```

### Step 3.4: configure Tailwind v3 with the custom palette

The traditional configuration lives in `tailwind.config.ts`. For a reference, ask Context7 MCP (optional): "Tailwind CSS v3 Next.js 15 setup configuration".

Create the Tailwind v3 configuration files:

```markdown
### Configuring Tailwind v3 (traditional configuration)

- Uses `tailwind.config.ts` (or `.js`)
- `content` paths so Tailwind detects the classes
- `theme` extended with the custom colors
- Fully compatible with shadcn/ui

**Purpose:** apply the `DESIGN.md` palette (mapped in Phase 1.4) to the whole project.
```

Step 3.4.1: initialize the Tailwind configuration

````markdown
**Creating the configuration files:**

```bash
npx tailwindcss init -p
```
````

Files created:

- `tailwind.config.js` (or rename it to `.ts`)
- `postcss.config.js`

Step 3.4.2: configure `tailwind.config.ts` with the custom palette

File: `tailwind.config.ts`

Instruction: set the `content` paths so Tailwind finds the files that use it, and extend `theme.extend.colors` with the CSS variables defined in `globals.css`. Use the HSL format for compatibility with shadcn/ui.

Step 3.4.3: explain it to the user

```markdown
**Tailwind v3 configured**

**Why v3 for this project:**

- Fully compatible with shadcn/ui, with no errors
- Clear, well-documented configuration
- Stable and proven with Next.js 15

**Use in components:**

- `bg-primary`: main color
- `text-primary`: text in the main color
- `border-primary`: border in the main color
- `bg-primary/90`: primary at 90% opacity

**Next step:** configure the global styles with the palette.
```

### Step 3.5: configure the global styles file (Tailwind v3)

```markdown
### Creating the global styles (Tailwind v3)

**File:** `app/globals.css` (or the location the framework uses)

**Purpose:**

1. Import the Tailwind v3 directives
2. Define the CSS variables for the color palette
3. Apply custom base styles

**Creating the file...**
```

Instruction:

1. Use the traditional v3 directives:
   - `@tailwind base;`
   - `@tailwind components;`
   - `@tailwind utilities;`

2. Define the CSS variables in `:root` and `.dark`:
   - Colors in HSL format: `--background`, `--foreground`, `--primary`, `--secondary`, etc.
   - Border radius: `--radius`
   - Use the format shadcn/ui expects

3. In `@layer base`, apply the base styles to the body

Why HSL:

````markdown
**Why HSL?**

Tailwind v3 and shadcn/ui use HSL because it:

- works with CSS variables
- makes opacity easy to manipulate (for example `hsl(var(--primary) / 0.9)`)
- is fully compatible with shadcn/ui
- is a standard, well-known format

**Example CSS variables:**

```css
:root {
  --background: 0 0% 100%; /* white */
  --foreground: 222.2 84% 4.9%; /* dark text */
  --primary: 221.2 83.2% 53.3%; /* blue */
  --secondary: 210 40% 96.1%; /* light blue */
}
```
````

---

## Phase 4: design system components

Implement the UI components for the strategy chosen in Phase 1.6. This phase sets the visual quality of everything built afterwards, so give it the time. Follow only the option section that matches the strategy: A (shadcn/ui), B (from scratch) or C (Headless UI). The common steps after them apply to all three.

---

## Option A: shadcn/ui

Use this section only when the user chose "shadcn/ui" in Phase 1.6.

### Step 4A.1: check tools and compatibility

Tell the user the shadcn/ui MCP speeds this up, and continue with or without it. Do not wait for an answer.

```markdown
## Recommendation: shadcn/ui MCP

The shadcn/ui MCP is optional but makes this phase faster.

With the MCP:

- Components are searched in natural language and the options show up instantly
- Implementation is roughly 3-5x faster

Without the MCP:

- Components are looked up by hand, which is slower but works the same

I will continue with or without it.
```

Check compatibility with Context7 or the shadcn/ui MCP:

```markdown
**Query (optional):** "shadcn/ui Tailwind v3 Next.js 15 compatibility"

**Expected:**

- shadcn/ui is fully compatible with Tailwind v3
- Compatible with Next.js 15 + React 19
- No CLI validation problems
```

---

### Step 4A.2: initialize shadcn/ui

Tell the user:

````markdown
## Initializing the shadcn/ui CLI

**Command:**

```bash
[pnpm/bun] dlx shadcn@latest init
```
````

Answer the interactive prompts like this:

1. **Would you like to use TypeScript?** → Yes
2. **Which style would you like to use?** → Default (or New York for a more minimal look)
3. **Which color would you like to use as base color?** → pick from the `DESIGN.md` palette
   - blue palette: Slate or Blue
   - green palette: Green or Emerald
   - purple palette: Violet
   - orange palette: Orange
4. **Where is your global CSS file?** → `app/globals.css` (or wherever it is)
5. **Would you like to use CSS variables for colors?** → Yes
6. **Are you using a custom tailwind prefix?** → No
7. **Where is your tailwind.config located?** → `tailwind.config.ts` (or `.js`, whichever the project has)
8. **Configure the import alias for components** → `@/components`
9. **Configure the import alias for utils** → `@/lib/utils`

Expected output:

```
✔ Writing components.json
✔ Installing dependencies
✔ Created lib/utils.ts
```

Then explain to the user:

```markdown
shadcn/ui initialized.

**Files created:**

- `components.json`: shadcn/ui configuration
- `lib/utils.ts`: the `cn()` utility (merges Tailwind classes)

**Next:** install the essential components.
```

---

### Step 4A.3: apply the `DESIGN.md` palette

`shadcn@latest init` already writes the CSS variables in `:root` and `.dark` of `globals.css`, in an HSL format that works with the Tailwind setup from Phase 3. Adjust only the HSL values to the `DESIGN.md` palette.

Variables to customize:

- `--primary`: the main color of the palette
- `--secondary`: the secondary color
- `--accent`: the accent color
- `--background`, `--foreground`: background and text colors

The shadcn/ui components then use the project palette with no further work.

---

### Step 4A.4: install the components the user picked in Step 1.5.2

With the shadcn/ui MCP, search components in natural language by need. Without it, install with the CLI:

```pseudocode
Base command: [pm] dlx shadcn@latest add [component]

Always:
  - button, card, label

IF the user selected "Forms & Inputs" in Step 1.5.2:
  - input, textarea, select, checkbox, radio-group, switch

IF the user selected "Modals & Dialogs":
  - dialog, popover, tooltip, sheet

Recommended extras:
  - badge, avatar, separator, skeleton
```

The components land in `components/ui/`, fully typed and with WAI-ARIA accessibility.

---

### Step 4A.5: validate the installation

Tell the user: "Validating the shadcn/ui installation".

```bash
ls -la components/ui/
```

Check that these exist: `button.tsx`, `card.tsx`, `input.tsx` (if installed) and the other installed components.

Then check types:

```bash
[pnpm/bun] run build
```

Expected: no TypeScript errors, the components compile, the Tailwind v3 CSS works and the CLI reported no errors.

---

## Option B: components from scratch

Use this section only when the user chose "Components from scratch" in Phase 1.6.

For each component below, tell the user which file you are creating and what it is for, then write it from the spec and the directive. The directives are prompts for you: the aim is the behaviour and the design rules, so do not paste a canned implementation.

### Step 4B.1: Button (essential)

**File:** `components/ui/button.tsx`. A reusable button with variants.

- Variants: `primary` (main actions), `secondary` (secondary actions), `outline` (border only, tertiary actions), `ghost` (no background, subtle actions), `danger` (red, destructive actions)
- Sizes: `sm`, `md` (default), `lg`
- Palette: the colors from `tailwind.config`
- Borders: from the `rounded` token of `DESIGN.md`
- Hover and active states with smooth transitions; a reduced-opacity disabled state

Directive: "Create a Button component with TypeScript and TailwindCSS that implements the variants above. Use `class-variance-authority` (cva) to manage the variants cleanly. Apply the palette from `tailwind.config.ts` and the border and shadow style from `DESIGN.md`. Include hover, active, focus and disabled states."

---

### Step 4B.2: Card (essential)

**File:** `components/ui/card.tsx`. A reusable container for grouped information.

- Variants: `default` (border or shadow), `hover` (lifts slightly), `clickable` (pointer cursor plus the hover effect)
- Parts: `CardHeader`, `CardContent`, `CardFooter`
- Shadow, borders and padding follow the visual style of `DESIGN.md`; the background is `bg-card` from the theme

Directive: "Create a Card component with sub-components (Header, Content, Footer) using TailwindCSS. Apply shadows and borders as `DESIGN.md` says (tokens and style prose); if it defines no shadows, use subtle ones."

---

### Step 4B.3: form components (only if the user selected "Forms & Inputs" in Step 1.5.2)

**Files:** `components/ui/input.tsx`, `components/ui/textarea.tsx`, `components/ui/select.tsx`, `components/ui/label.tsx`. Styled inputs with visible validation states.

- States: normal, focus (primary border), error (red border plus message), disabled, success (green border, optional)
- Borders follow the visual style; the focus ring uses the primary color; the placeholder uses `text-muted-foreground`
- Height of at least 40px so they are comfortable to tap

Directive: "Create form components (Input, Textarea, Select, Label) with visible validation states. Use Tailwind for the styles and rounded borders from the visual style. Include focus states with `ring-primary`. For errors use `text-red-500` and `border-red-500`."

---

### Step 4B.4: Modal (only if the user selected "Modals & Dialogs")

**File:** `components/ui/modal.tsx`. A reusable modal for confirmations, details and forms.

- Parts: overlay (`bg-black/50`), centered content (`bg-card` with a large shadow), header, body, footer with buttons
- Behaviour: a click outside closes it, so does the ESC key, with a smooth fade in and out
- Rounded corners from the style, responsive max width

Directive: "Create a Modal component with an overlay and animations. Use Radix UI or Headless UI if available, otherwise plain React state. Use smooth transitions (`transition-all duration-200`). Close on ESC and on a click outside. Use the theme palette."

---

## Option C: Headless UI

Use this section only when the user chose "Headless UI" in Phase 1.6.

### Step 4C.1: install Headless UI

```bash
[pm] add @headlessui/react
```

Verify `@headlessui/react@2.x.x`.

---

### Step 4C.2: build the hybrid components

Headless UI supplies logic and accessibility; Tailwind supplies the styles.

- Built on Headless UI: Dialog, Listbox (Select), Menu (Dropdown), Popover, Tabs, Switch, Disclosure (Accordion), Radio Group, Combobox (Autocomplete), Transition (animations)
- Built by hand because they have no complex logic: Button, Card, Input, Badge, Avatar

```pseudocode
For Headless UI components:
  1. Import the component from @headlessui/react
  2. Write a wrapper that applies Tailwind styles from the `DESIGN.md` palette
  3. Add smooth transitions with <Transition>
  4. Export a simple API

For simple components:
  Build by hand with Tailwind (see Option B)
```

The result balances speed (the logic is ready-made) with customization (the styles are yours).

---

## Common to all options

### Step 4D.1: the `cn()` utility (essential)

**File:** `lib/utils.ts`. A `cn()` function built with `clsx` + `tailwind-merge` that merges Tailwind classes conditionally. shadcn/ui creates it automatically; with Option B or C, create it by hand.

---

### Step 4D.2: design system summary

Tell the user:

```markdown
## Design system created

**UI components implemented:**

- Button (5 variants, 3 sizes)
- Card (with Header, Content, Footer)
  [list the other components created]

**Palette applied:**

- Primary: [color], used in primary buttons, links and focus states
- Secondary: [color], used in secondary buttons and elements
- Accent: [color], used in highlights and badges

**Visual style applied:**

- Borders: [description]
- Shadows: [description]
- Spacing: [description]
- Typography: [description]

**Files created:**

- `components/ui/button.tsx`
- `components/ui/card.tsx`
  [list the others]
- `lib/utils.ts`

**Next:** the layout components (Navbar, and Sidebar if it applies).
```

---

## Phase 4.5: layout components

Create the Navbar, the Sidebar (if it applies) and the main layout, following the layout chosen in Phase 1.5. As in Option B, tell the user which file you create and why.

### Step 4.5.1: Navbar / Header

**File:** `components/layout/navbar.tsx`. The top navigation bar.

- Content: logo or project name (from the PRD), navigation links (from the Phase 2 pages), a user menu (avatar plus dropdown when there is auth), a CTA button if the business needs one
- Design: comfortable height (60-70px), `bg-card` or transparent depending on the style, a subtle bottom border, sticky positioning, a soft shadow if the style uses one
- Responsive: links inline on desktop, a hamburger menu on mobile when there are many links

Directive: "Create a responsive Navbar component. On desktop show the links inline; on mobile show a hamburger menu. Use the Button component of the design system. Apply `bg-card/50` with `backdrop-blur` when the style is Modern/Bold. Include the user avatar when there is authentication. Read the PRD/PBI to find the project's main navigation sections and use those domain-specific names."

---

### Step 4.5.2: Sidebar (only if the layout includes one)

**File:** `components/layout/sidebar.tsx`. Side navigation, fixed or collapsible.

- Content: logo or name at the top, navigation links with icons (`lucide-react` is the recommended icon library), an active state, and a collapse button when it is collapsible
- Design: 256px expanded and 64px collapsed, `bg-card` or `bg-muted` depending on the style, a subtle right border
- States: active link `bg-primary/10` + `text-primary`; hover `bg-accent/50`; focus `ring-primary`

Directive: "Create a Sidebar component with collapsed/expanded state if it is collapsible. Use `lucide-react` for icons. Apply hover and active states with the primary palette. When collapsed, show only icons. Read the PRD/PBI to find the project's main sections and entities, and name the navigation items with that domain vocabulary."

---

### Step 4.5.3: main layout

**File:** `components/layout/main-layout.tsx`, or directly `app/(app)/layout.tsx`. It combines the Navbar, the Sidebar (if it applies) and the content area, in the structure chosen in Phase 1.5:

- "Sidebar + Top Navbar": Navbar on top at full width, Sidebar fixed on the left, main content offset by the sidebar width
- "Top Navbar only": Navbar on top, main content at full width below it
- "Collapsible Sidebar": like "Sidebar + Top Navbar", but the sidebar collapses and its state is saved in `localStorage`

Main content gets adequate padding, transitions are smooth when the sidebar collapses, and on mobile the sidebar becomes a drawer.

Directive: "Create the Main Layout component that uses the Navbar and the Sidebar (if it applies) and implements the layout chosen in Phase 1.5. For a Collapsible Sidebar, add the toggle with its state in `localStorage`. Below 768px the sidebar becomes a mobile drawer that closes automatically on navigation. Use smooth transitions (`transition-all duration-200`)."

---

## Phase 5: strategic demo pages

Build the pages selected in Phase 2, with real design from the design system. Generic, unstyled pages defeat the purpose of this phase, so each page uses the design system components and the `DESIGN.md` palette.

### Step 5.1: login page (if the project needs auth)

**Route:** `/login` (or the framework equivalent).

Design:

- A centered layout (`min-h-screen flex items-center justify-center`) with the design system Card
- Logo or project name (from the PRD), a form built with the design system Input components, a primary Button for "Sign in", a "Forgot password?" link if it applies
- Background: a subtle gradient or a solid color depending on the style
- Palette: Card `bg-card` with a shadow, inputs `border-border` with `focus:ring-primary`, Button `variant="default"`

The page works for real, it is not a mock: complete UI, visible validation (error states in inputs), a loading state on the button, real Supabase Auth integration (`signInWithPassword`), real error handling (wrong credentials and the like), and an automatic redirect to the dashboard or home after a successful login.

Directive: "Create a FUNCTIONAL login page with Supabase Auth. Use the Card component to hold the form and the design system Input and Button. Include the logo (the project name from the PRD). Use a subtle gradient background (for example `bg-gradient-to-br from-primary/5 to-secondary/5`).

Show the demo credentials in an Alert or Banner visible in the UI:

- Email: infer it from the PRD context (for example `admin@company.com`, `demo@product.com`)
- Password: suggest a demo password (for example `Demo123!`)

Implementation: use `supabase.auth.signInWithPassword()` from the Supabase client; show error states with the API's real messages; a loading spinner while authenticating; redirect to `/` or `/dashboard` (by context) after a successful login; handle 'Invalid credentials', 'Network error' and similar."

The demo credentials shown in the UI have to match a real user created in Supabase during backend setup. If no such user exists, tell the user to create one (nobody present: say so in the report).

---

### Step 5.1.5: route-protection middleware

Only if Step 5.1 implemented auth. Without this middleware the login page protects nothing.

**File:** `middleware.ts`, at the project root next to `package.json`. It protects private routes and redirects unauthenticated users to the login.

Directive: "Create `middleware.ts` at the project root that:

1. Verifies the active session using `@supabase/ssr` with `createServerClient`.
2. Protects private routes: read the PRD/PBI to find which routes need authentication (typically `/dashboard`, `/[main-entity]`, `/profile`) and leave public routes open (`/`, `/login`, `/signup`, marketing routes). For a SaaS or dashboard, protect the dashboard and the main functionality; for eCommerce, checkout, profile and orders; for a platform, the user or workspace area.
3. Redirects: an unauthenticated user reaching a protected route goes to `/login`; an authenticated user reaching `/login` goes to `/dashboard` or `/` (by context).
4. Refreshes the session when needed (Supabase `updateSession`).

Configure `config.matcher` so the middleware only runs on routes that need it and skips static assets (`_next/static`, `_next/image`, `favicon.ico`)."

Then tell the user:

```markdown
**Auth middleware implemented**

**Protected routes:**
[list the protected routes for this project]

**Flow:**

1. A user tries to open `/dashboard` (protected)
2. The middleware checks the Supabase session
3. Not authenticated: redirect to `/login`
4. Authenticated: access allowed

**Public routes:**

- `/`: landing page
- `/login`: login page
- [other public routes for this project]

**Next:** build the project's main pages.
```

---

### Step 5.2: landing page `/` (only if the business needs one)

First decide whether the project needs a landing page, from the PRD, the PBI and the idea.

It needs one when:

- it is a B2C product
- it is a SaaS with public marketing
- it is a platform that has to attract users
- it is an eCommerce
- the PRD mentions "landing page", "marketing" or user acquisition

It does not need one when:

- it is an internal or corporate dashboard
- it is a tool only for authenticated users
- the user says they do not need one
- the PRD only describes internal functionality

If it does not apply, skip to Step 5.3.

If it does, build it at `app/page.tsx` (or the framework equivalent). The copy is real, never generic filler: draw it from `.context/business/` (the problem and the proposed solution), `.context/PRD/executive-summary.md` (the value proposition), `.context/PRD/user-personas.md` (who it targets) and `.context/PRD/mvp-scope.md` (the main features).

Structure:

1. **Hero** (above the fold): the headline is the main value proposition from the PRD, the subheadline explains the problem it solves in one line, a primary CTA button (for example "Get started free", "See the demo", "Sign up"), a visual (illustration, screenshot or a relevant icon as placeholder), and optional social proof (badges, short testimonials)
2. **Features**: 3-6 main features taken from the PBI epics, each with an icon, a title and a short description, in a responsive grid of 2 or 3 columns, with the chosen palette
3. **How it works / Benefits** (optional): 3 simple steps, or the key benefits
4. **Closing CTA**: repeat the main CTA with a short motivating message and a prominent button (`variant="default"`)
5. **Footer**: basic links (Contact, Terms, Privacy), copyright, social networks if it applies

Directive: "This is the face of the product, so make it professional and good-looking.

Copy:

1. Read `.context/PRD/executive-summary.md` and extract the real value proposition.
2. Read `.context/business/README.md` to understand the problem and the solution.
3. Read `.context/PRD/mvp-scope.md` and identify the 3-6 main features.
4. Avoid generic phrases such as 'Welcome to our platform' or 'The best solution'.
5. Use the project's domain vocabulary (real names, specific terms).

Design:

- Hero with a background gradient from the chosen palette (for example `bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10`)
- Headline `text-4xl md:text-6xl font-bold`
- Features grid `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8`, each feature card with the design system hover effect
- CTA buttons `variant='default'` at size `lg`
- Generous section padding `py-16 md:py-24`
- The chosen visual personality (Minimalist, Bold, Corporate or Playful)

Components: the design system Button, Card for features (optional) and `lucide-react` icons that fit the domain."

---

### Step 5.3: dashboard / main page (only if the project needs a post-login home)

**Route:** `/dashboard`, or `/` when there is no landing page.

Pick the layout from the PBI epics:

```pseudocode
Analyze the PBI epics:
  Identify the MAIN_ENTITY of the domain

  IF the main epic shows a list of [ENTITY]:
    Build: grid of [ENTITY] cards (responsive, hover effects)

  IF the main epic shows statistics:
    Build: dashboard with stats cards (metrics from the PRD)

  IF the main epic shows a flow/timeline:
    Build: feed/timeline of [ENTITY] items
```

Use the design system Card and Button, and stats or metrics cards when they apply. Import the entity type from `@/lib/types` and type the mock data with it, so the data is type-safe against the backend.

Directive: "Create the post-login dashboard of the domain. Read the PBI epics to identify the MAIN_ENTITY (the core business entity). Use the backend types imported from `@/lib/types` to create type-safe mock data: 4-6 realistic items that match the type's structure. Use the Card component with a hover effect and include loading skeleton states. If the grid is empty, show a good-looking empty state with an illustration or icon plus a CTA. Use the theme palette consistently. Title `text-3xl font-bold`, description `text-muted-foreground`."

---

### Step 5.4: core domain pages (1-3 more)

For each core page selected in Phase 2, announce the page to the user and build it:

```markdown
### Creating page [domain name]

**Route:** `/[route]`
**File:** [location by framework]
**Related epic:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}

**Design to implement:**

[Read the epic to choose the layout:]

- A list page: grid or table of Cards
- A detail page: two columns (info + actions)
- A creation page: a form with steps if it is complex

**Components used:** [design system components]

**Main sections:**

1. [Section 1]: [description]
2. [Section 2]: [description]

**States:** loading (skeleton), success (with data), empty (no data), error (if it applies)

**Palette applied:** [how the palette is used on this page]

**Deferred to story implementation:**

- Real data fetching
- Working filters and search
- Real pagination
- Full CRUD actions
```

Directive: "Create a visually attractive page using the design system components. Read the epic EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name} to understand what to show. Use the backend types from `@/lib/types` to create type-safe mock data: 6-8 realistic items that match the type's structure. Include loading (skeleton), empty and error states where they apply. For a list, use a responsive grid of Cards; for actions, use design system Buttons with `lucide-react` icons. Apply the palette coherently. Build only the UI with mock data, with no real logic."

---

### Step 5.5: visual consistency and UI/UX personality

Do not skip this step. Review every page created:

1. **Palette:** the `DESIGN.md` palette is applied consistently: primary on CTAs, links and focus states; secondary on secondary elements; accent on highlights and badges; background, foreground and card colors right. No hardcoded colors outside the palette.
2. **Personality:** the chosen visual style shows. Minimalist means generous spacing, clean typography and subtle shadows. Bold/Modern means gradients, pronounced shadows and rounded borders. Corporate means straight lines, sober colors and a professional feel. Playful means vibrant colors, illustrations and very rounded borders.
3. **Design system:** every page uses the same components, spacing (padding and margin), typography hierarchy (`text-*`), shadows and borders, and types the mock data with the backend types.
4. **Copy:** no generic text ("Welcome", "The best platform"); everything reflects the project context (PRD or idea), uses the domain vocabulary correctly and states a clear, specific value proposition.

Fix whatever fails before continuing. The result is an application with a coherent visual identity that fits the project.

---

## Phase 6: validation

Check that the project compiles and looks right.

### Step 6.1: check the installed versions

Before the build, confirm the versions are stable and compatible. This is where a Tailwind v4 that slipped in gets caught.

```bash
[pnpm/bun] list | grep -E "(next|react|tailwindcss|supabase)"
```

Expected output (an example; the real versions are whatever the command prints):

```
Frontend stack:
- next: 15.x.x (stable)
- react: 19.x.x (stable)
- react-dom: 19.x.x (stable)
- tailwindcss: 3.4.x (stable; it must be v3)
- postcss: latest
- autoprefixer: latest

Backend/Auth stack:
- @supabase/ssr: 0.x.x (stable)
- @supabase/supabase-js: 2.x.x (stable)
```

If `tailwindcss` is 4.x.x, v4 was installed by mistake (it is incompatible with the shadcn CLI). Run `[pm] remove tailwindcss && [pm] add -D tailwindcss@3`, then repeat this check.

Compatibility confirmed:

- Next.js 15.x + Tailwind v3: officially compatible
- Next.js 15.x + Supabase SSR 0.x: compatible (async cookies)
- Tailwind v3 + shadcn/ui: compatible, with no CLI errors
- React 19.x + Next.js 15.x: officially compatible

---

### Step 6.2: validate the build

Tell the user: "Validating the project build".

```bash
[pnpm/bun] run build
```

The build is the right check because it terminates (it is not interactive), catches TypeScript and import errors, proves the backend types are correct and exercises the Tailwind v3 configuration.

Common failures:

```markdown
If it fails with a Tailwind error:
→ Check that globals.css uses `@tailwind base;` `@tailwind components;` `@tailwind utilities;`
→ Check that tailwind.config.ts and postcss.config.js exist
→ Check that tailwindcss is 3.x (not 4.x)
→ Ask Context7: "Tailwind CSS v3 Next.js build error"

If it fails with a shadcn/ui error:
→ Check that tailwindcss is 3.x (the shadcn CLI has problems with v4)
→ Reinstall: [pm] remove tailwindcss && [pm] add -D tailwindcss@3
→ Run shadcn@latest init again

If it fails with a Supabase types error:
→ Check that src/types/supabase.ts exists
→ Regenerate the types: npx supabase gen types typescript...
→ Check the imports in lib/types.ts

If it fails with a React/Next error:
→ Check compatible versions (React 19 + Next 15)
→ Clear the cache: rm -rf .next && [pm] run build
```

---

## Phase 7: documentation and recommendations

Document the architecture and the design, and give the user recommendations.

### Step 7.1: setup documentation

Create `SETUP.md` (or `README.md` setup section): requirements, install, how to copy `.env.example` to `.env` and fill it in, the run and build commands with the selected package manager.

### Step 7.2: architecture documentation

Create `.context/frontend-architecture.md`: the stack and versions, the folder structure, the technical decisions made in this phase (package manager, layout, UI strategy) and a section on the backend types (`src/types/supabase.ts` and `src/lib/types.ts`).

### Step 7.3: design system documentation

**File:** `.context/design-system.md`. Later phases cannot do without it: it records the design decisions for the whole team, including the palette, the components, the backend types integration, usage guidelines and code examples. Tell the user you are creating it, then write it with this structure (a repo artifact, so in English):

`````markdown
# Design System - [Project name]

**Generated:** Frontend setup
**Date:** [date]
**Visual style:** [derived from `DESIGN.md`]

---

## Backend-Frontend integration

### Shared TypeScript types

**Benefit:** no type mismatches between backend and frontend.

**Types file:** `src/types/supabase.ts` (generated by the Supabase CLI)
**Type helper:** `lib/types.ts` (extracts specific types)

**Example:**

```typescript
import type { User, Profile } from '@/lib/types'

// TypeScript knows exactly which fields User has
const UserCard = ({ user }: { user: User }) => {
  return (
    <div>
      <h3>{user.name}</h3>      {/* TypeScript checks that 'name' exists */}
      <p>{user.email}</p>       {/* TypeScript checks that 'email' exists */}
      <p>{user.invalid}</p>     {/* Error: 'invalid' does not exist on User */}
    </div>
  )
}
```

**Sync flow:**

1. The backend defines the schemas (Supabase)
2. Types are generated: `npx supabase gen types typescript...`
3. The frontend imports the types from `lib/types.ts`
4. Any schema change requires regenerating the types
5. TypeScript catches the errors automatically

---

## Color palette

### Main colors

| Color         | Hex    | Use                                                    |
| ------------- | ------ | ------------------------------------------------------ |
| **Primary**   | [#HEX] | Primary buttons, links, focus states, main elements    |
| **Secondary** | [#HEX] | Secondary buttons and elements                         |
| **Accent**    | [#HEX] | Highlights, badges, secondary calls to action          |

### System colors

| Color          | Hex    | Use                        |
| -------------- | ------ | -------------------------- |
| **Background** | [#HEX] | Application background     |
| **Card**       | [#HEX] | Card and modal background  |
| **Border**     | [#HEX] | Input and card borders     |
| **Text**       | [#HEX] | Main text                  |
| **Muted**      | [#HEX] | Secondary text, placeholders |

### Semantic colors

| Color       | Hex    | Use                                   |
| ----------- | ------ | ------------------------------------- |
| **Success** | [#HEX] | Success messages, positive validation |
| **Warning** | [#HEX] | Warnings                              |
| **Error**   | [#HEX] | Errors, failed validation             |
| **Info**    | [#HEX] | Informational messages                |

**Use in components:**

- Tailwind classes: `bg-primary`, `text-primary`, `border-border`, `text-muted-foreground`, and so on
- Direct CSS variables: `var(--color-primary)`, `var(--color-secondary)`, and so on

---

## UI components

### Button

**Location:** `components/ui/button.tsx`

| Variant             | Use                  | Look                               |
| ------------------- | -------------------- | ---------------------------------- |
| `default` (primary) | Main actions         | Primary background, white text     |
| `secondary`         | Secondary actions    | Secondary background, white text   |
| `outline`           | Tertiary actions     | Primary border, transparent fill   |
| `ghost`             | Subtle actions       | No background, primary text        |
| `danger`            | Destructive actions  | Red background, white text         |

**Sizes:** `sm` (height 32px), `md` (height 40px, default), `lg` (height 48px).

**Use:** import from `@/components/ui/button` and pass `variant` (default/secondary/outline/ghost/danger) and `size` (sm/md/lg).

---

### Card

**Location:** `components/ui/card.tsx`

**Sub-components:** `Card` (container), `CardHeader` (title), `CardContent` (main content), `CardFooter` (actions).

**Variants:** `default` (basic card), `hover` (lifts on hover), `clickable` (pointer cursor plus hover).

**Use:** import the sub-components from `@/components/ui/card`, type the props with the backend types from `@/lib/types` and apply hover effects with Tailwind classes.

---

[Document the other components created]

---

## Layout

### Chosen structure: [Sidebar + Top Navbar / Top Navbar only / etc.]

**Reason:** [why this layout was chosen]

**Components:**

- `components/layout/navbar.tsx`: top bar
  [If it applies:] `components/layout/sidebar.tsx`: side navigation

**Available navigation:**
[list the pages with their routes]

---

## Visual style

### Traits of the [chosen] style

**Spacing:** [generous / compact]

**Borders:**

- Border radius: [value] ([very rounded / rounded / straight])
- Border width: [value]

**Shadows:** [pronounced / subtle / none]; card shadow: [CSS value]

**Typography:**

- Font family: [font name]
- Headings: [sizes]
- Body text: [size]

---

## Usage guidelines

### Do

1. Use the design system components: `<Button>` instead of `<button>`, `<Card>` to group information, Tailwind classes from the palette (`bg-primary`, `text-primary`).
2. Use the backend types: `import type { User } from '@/lib/types'`, typed props (`{ user }: { user: User }`) and typed mock data (`const mockData: User[] = [...]`).
3. Keep consistency: the same spacing (`gap-6`, `p-6`), border radius and shadows.
4. Use semantic variants: `variant="default"` for main actions, `variant="danger"` for destructive ones, `text-muted-foreground` for secondary text.

### Don't

1. Hardcode colors: `bg-blue-500` becomes `bg-primary`, `#3B82F6` becomes `var(--color-primary)`.
2. Use `any`: `const user: any = ...` becomes `const user: User = ...`, `props: any` becomes `props: { user: User }`.
3. Build custom buttons: `<button className="bg-blue-500...">` becomes `<Button>`.
4. Break consistency: a different border radius per component, inconsistent spacing.

---

## Extending the design system

When you implement new features:

### Add a UI component

1. Create it in `components/ui/[name].tsx`
2. Use the theme palette
3. Apply the consistent visual style (borders, shadows)
4. Use the backend types if the component receives data
5. Document it in this file

### Modify an existing component

1. Edit the file in `components/ui/`
2. Stay compatible with existing usage
3. Update this documentation

### Add a page

1. Use the existing layout components
2. Use the design system components and palette
3. Import the backend types for props and mock data
4. Keep spacing consistent

---

## References

- **Tailwind config:** `tailwind.config.ts`, the full palette
- **Global styles:** `app/globals.css`, the CSS variables
- **UI components:** `components/ui/`
- **Layout components:** `components/layout/`
- **Backend types:** `src/types/supabase.ts`, generated from Supabase
- **Type helpers:** `lib/types.ts`

---

This design system is the single source of truth for the project's visual design. Keep it consistent throughout development.
`````

---

### Step 7.4: final summary

Show the user this summary:

`````markdown
# Frontend setup complete

---

## Summary

**Files created:** [total number]
**Demo pages:** [2-3] (to validate the design system)
**UI components created:** [number]
**Package manager:** [pnpm/bun]
**Scope:** frontend setup, run once after backend setup

---

## Backend-Frontend integration

**Backend file:** `src/types/supabase.ts` (generated by `backend-setup.md`)
**Frontend helper:** `lib/types.ts` (created in this phase)

- Components have autocomplete and no type mismatches
- Schema changes show up as type errors once the types are regenerated

Example:

```typescript
import type { User } from '@/lib/types'

const UserCard = ({ user }: { user: User }) => {
  return <div>{user.name}</div>  // TypeScript checks it all
}
```

---

## Design implemented

- **Color palette:** [name]; Primary [color] ([use]), Secondary [color] ([use]), Accent [color] ([use])
- **Visual style:** [chosen]; [main traits]
- **Layout:** [chosen]; [structure]

---

## What was implemented

1. **Backend integration:** backend types imported (`src/types/supabase.ts`), type helper created (`lib/types.ts`), type-safe mock data in the demo pages
2. **Framework architecture:** [framework] with [package manager], TypeScript and ESLint, folder structure by best practices
3. **Design system:** palette applied in Tailwind, [X] reusable UI components (Button with 5 variants and 3 sizes, Card with Header/Content/Footer, [others]), layout components (Navbar, [Sidebar if it applies]), global styles and CSS variables, the `cn` utility
4. **Demo pages** (to validate the design system):
   1. [Page 1] (`/[route]`): [short visual description]; [X] mock items typed with the backend types; validates [components]
   2. [Page 2] (`/[route]`): [short visual description]; [X] mock items typed with the backend types; validates [components]

   The remaining MVP pages are built in story implementation, from each story's plan.
5. **Documentation:** `SETUP.md` (install guide), `.context/frontend-architecture.md` (technical architecture), `.context/design-system.md` (design system plus backend integration), `.env.example` (variables template)

---

## Next steps

### 1. Set the environment variables

```bash
cp .env.example .env
# Edit .env with your real credentials
```

### 2. Try the project

Open a separate new terminal:

```bash
[pnpm/bun] run dev
```

Then:

1. Open http://localhost:[port] in your browser
2. Navigate between the pages
3. Check the visual consistency (colors, components) and the hover states on buttons and cards
4. Check in DevTools that the mock data uses the backend types

You should see a coherent palette, styled components, a professional layout, a design that matches the business personality and no TypeScript errors.

### 3. Review the design system (recommended)

Open `.context/design-system.md`: the full palette, the available components and how to use them, the backend-frontend integration guide, the design guidelines and code examples. It is the style guide for story implementation.

### 4. Consider a git checkpoint (recommended)

```bash
git add .
git commit -m "feat: Setup frontend with design system and backend types integration

- Configured [Framework] with [package manager]
- Created design system ([X] components)
- Integrated backend types (src/types/supabase.ts)
- Implemented [X] demo pages with type-safe mock data
- Applied [Color Palette] + [Visual Style]
- Layout: [Chosen Layout]
"
```

### 5. Continue with backlog seeding

With the backend schemas, the frontend integrated with the backend types and the base design system in place, the next step is seeding the product backlog in Jira (epics and user stories) with `/product-management`. Each story then implements its functionality with the design system components, the backend types and the patterns set here.

---

## For the team demo

1. Start the server (`[pm] run dev`)
2. Show the pages working
3. Point out the visual design (palette, components, layout)
4. Explain the backend-frontend integration (no type errors)
5. Show `.context/design-system.md`
6. Present the roadmap

**Documentation:**

- `SETUP.md`: how to start the project
- `.context/frontend-architecture.md`: technical architecture
- `.context/design-system.md`: the full design guide plus the backend integration
`````

---

## Final validations

An internal checklist, not shown to the user.

Backend integration:

- `src/types/supabase.ts` exists (verified)
- `lib/types.ts` created with helpers
- Mock data in the pages uses the backend types
- The build passes with no TypeScript errors

Design:

- The palette is applied in `tailwind.config`
- The design system with its components is created
- The pages use the design system components
- The visual consistency holds across the application
- `.context/design-system.md` is created, with the backend integration section

Architecture:

- The framework is configured
- The package manager is the one the user chose
- The folder structure is right
- The build passes with no errors

Documentation:

- `SETUP.md` has the instructions
- `frontend-architecture.md` has the technical decisions
- `design-system.md` has the design guide plus the backend integration

User:

- The interactive questions were asked (package manager, design), or taken by default with a DECIDED line when nobody was present
- Each decision was explained, with a "Choose for me" option offered
- A commit was recommended, not forced

Output: a frontend project with a solid architecture, backend types integrated, a complete design system and 2-3 good-looking demo pages with type-safe mock data, all documented and ready to show the team.

---

## Design split: base now, story design later

Frontend setup is the once-only base. Per-story design happens when each story is implemented.

| | Frontend setup (this reference, once) | Story implementation (`/sprint-development`, per story) |
|---|---|---|
| Scope | The color palette, the reusable UI components (Button, Card, Form, Modal and so on), the layout system (Navbar, Sidebar), the integration with the backend types, 2-3 demo pages that prove it works. Roughly 80% of the visual design | Wireframes or mockups specific to the story, custom domain components (for example `[Entity]Card`, `[Entity]Table` based on the business), specific UX flows, validations and visual states. Roughly 20% of the visual design |
| Purpose | A reusable base for the whole project, with synchronized types | Design the implementation of each story with the base design system and the backend types |

The first is the toolbox (hammer, screwdriver) plus precise plans (the types); the second is deciding how to use them to build each piece of furniture.
