# Skill Registry (auto-generated)

> Generated: `2026-06-10T13:19:15.491Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.claude/skills/agentic-dev-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 40

---
## Skill: accessibility

**Purpose**: Audit and improve web accessibility following WCAG 2.2 guidelines.

**Compact Rules**:
- A copy-paste or autofill mechanism is available
- An alternative method exists (e.g., passkey, SSO, email link)
- The test uses object recognition or personal content (AA only; AAA removes this exception)
- [ ] **Keyboard navigation:** Tab through entire page, use Enter/Space to activate
- [ ] **Screen reader:** Test with VoiceOver (Mac), NVDA (Windows), or TalkBack (Android)
- [ ] **Zoom:** Content usable at 200% zoom
- [ ] **High contrast:** Test with Windows High Contrast Mode
- [ ] **Reduced motion:** Test with `prefers-reduced-motion: reduce`
- [ ] **Focus order:** Logical and follows visual order
- [ ] **Target size:** Interactive elements meet 24×24px minimum
- Missing form labels
- Missing image alt text
- Insufficient color contrast
- Keyboard traps
- No focus indicators
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/accessibility/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: acli

**Purpose**: Atlassian CLI (official `acli` binary, v1.3+ as of 2026) for Jira Cloud, Confluence Cloud, and org admin tasks from the terminal.

**Compact Rules**:
- **Silent pagination truncation.** `workitem search` without `--paginate` returns the first page only — no warning. Scripts that count or iterate keys read the wrong number of items.
- **Auth is per-product.** `acli jira auth login` does not authenticate `acli admin`, `acli confluence`, or `acli rovodev`. There is also a top-level `acli auth` for global OAuth (newer surface). Each scope has its own session.
- **The "work item" vs "issue" split.** The CLI renamed commands (`jira issue` → `jira workitem`) but the JSON response still has a top-level `issues[]` array and CSV inputs still use `issueType`/`parentIssueId` spellings. Mixing old and new terminology in the same script works, but confuses readers.
- **Unknown subcommands fail silently.** Typing `acli jira workflow --help` does NOT error — it falls back to `acli jira --help` with exit 0. So "no error" ≠ "command exists". Always verify by checking the help body actually changed.
- **Hard limits the docs do not advertise.** `acli` cannot list custom fields, edit custom-field values on existing items, manage workflows, manage issue types, or touch project versions/components. See `references/gotchas.md`.
- Read `complementary_categories` from this skill's frontmatter (`issue-tracker`).
- Resolve via the host repo's skill-registry cache (`.claude/skills/REGISTRY.md`, built by `scripts/build-skill-registry.ts`). Fallback: scan the session-start `system-reminder` skill list.
- Apply the threshold rule per the host repo's skill-composition strategy doc (T1 / T3 silent; T4 ASK).
- The Atlassian MCP fallback documented below is OPT-IN, not a skill — enable manually via `docs/mcp/`.
- `acli` binary is not installed in the environment.
- `acli` auth fails and cannot be fixed in the current session.
- The operation is one of the documented `acli` blind spots: enumerate custom fields, edit custom-field values on existing work items, manage workflows / issue types / priorities / resolutions / project versions / components, upload attachments, add watchers, add an item to a sprint.
- Bulk operations (acli consumes far fewer tokens per call).
- Scripting / CI pipelines.
- Operations that return large result sets (MCP payloads inflate token usage).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/acli/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: agentic-dev-core

**Purpose**: Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrin...

**Compact Rules**:
- agentic-dev-core/references/briefing-template.md
- agentic-dev-core/references/dispatch-patterns.md
- Read `complementary_categories` from this skill's frontmatter (`language`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply when consulting agentic-dev-core/references/typescript-patterns.md? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents that consume `references/typescript-patterns.md`, inject a `## Composable Skills` block per strategy doc §6.2.
- Provide a bootstrap or init action — clone the full repo instead.
- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/agentic-dev-onboard` and `/project-foundation`).
- Generate or scaffold tests, fixtures, or test components (that belongs to `/unit-testing` and test-automation skills).
- Adapt the framework to a specific stack (that belongs to `/project-bootstrap`).
- Sync project-specific facts in `CLAUDE.md` (that belongs to `/sync-ai-memory`).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-dev-core/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: agentic-dev-onboard

**Purpose**: Walks new users through this repo's dev flow — Next.js + Supabase stack, Jira workflow (Ready For Dev → In Progress → In Review → Ready F...

**Compact Rules**:
- Read `complementary_categories` from this skill's frontmatter.
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- Apply threshold rule per strategy doc §3.2 (T1/T3 silent; T4 ASK).
- Inject a `## Composable Skills` block per strategy doc §6.2 only when (rarely) dispatching a sub-agent.
- Use **Context7** for "how to use X" — official docs, current API
- Use **Tavily** for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)
- **§1 CRITICAL RULES** — 12 rules that override defaults (credentials, plan-before-coding, no AI attribution, MCP credential failure protocol, `READ package.json DIRECTLY`).
- **§4 CONTEXT LOADING MAP** — task → trigger phrase → skill → context files → primary tool.
- **§5 SKILLS + COMMANDS + MCPs REGISTRY** — full T1/T3/T4 skill model.
- **§12 PROACTIVE MEMORY TRIGGERS** — when to call `mem_save` without being asked.
- [ ] Did you run the setup script (`bun run setup` — verify name in `package.json`)?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `TAVILY_API_KEY`, `SUPABASE_*`)?
- [ ] Does the agents linter (`bun run vars:check` per `package.json`) exit clean (0 errors)?
- [ ] Does Engram appear in the active MCP list (restart your agent if not)?
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-dev-onboard/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: deploy-to-vercel

**Purpose**: Deploy applications and websites to Vercel.

**Compact Rules**:
- `.vercel/project.json` — created by `vercel link` (single project linking). Contains `projectId` and `orgId`.
- `.vercel/repo.json` — created by `vercel link --repo` (repo-based linking). Contains `orgId`, `remoteName`, and a `projects` array mapping directories to Vercel project IDs.
- **Ask the user before pushing.** Never push without explicit approval:
- **Commit and push:**
- **Retrieve the preview URL.** If the CLI is authenticated:
- **Ask the user which team to deploy to.** Present the team slugs from Step 1 as a bulleted list. If there's only one team (or just a personal account), skip this step.
- **Once a team is selected, proceed directly to linking.** Tell the user what will happen but do not ask for separate confirmation:
- **If a git remote exists**, use repo-based linking with the selected team scope:
- **Then deploy using the best available method:**
- If a git remote exists → commit and push (see git push method above)
- If no git remote → `vercel deploy [path] -y --no-wait --scope <team-slug>`, then `vercel inspect <url>` to check status
- **Install the CLI (if not already installed):**
- **Authenticate:**
- **Ask which team to deploy to** — present team slugs from `vercel teams list --format json` as a bulleted list. If only one team / personal account, skip. Once selected, proceed immediately.
- **Link the project** with the selected team scope (use `--repo` if a git remote exists, plain `vercel link` otherwise):
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/deploy-to-vercel/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: design-system

**Purpose**: Genera un DESIGN.md (formato Google Labs Apache-2.0) en el root del proyecto antes del scaffolding del frontend.

**Compact Rules**:
- `agentic-dev-core/references/briefing-template.md` — used when dispatching to a subagent (Open Design or Claude Design handoff conversion).
- `agentic-dev-core/references/dispatch-patterns.md` — selects Single / Sequential / Parallel for the chosen path.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/design-system/`, archive on completion.
- `.context/business/business-model.md` — industria, value-prop, tone implícito.
- `.context/PRD/personas.md` — target visual, demographic signal.
- `.context/PRD/executive-summary.md` — positioning, success KPIs.
- Read `complementary_categories` from this skill's frontmatter (`frontend-ui`, `accessibility`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this design-system work? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents (Open Design conversion, Claude Design handoff, LLM-authored custom DESIGN.md), inject a `## Composable Skills` block per strategy doc §6.2.
- A new project just finished the PRD and needs to define visual identity before the SRS architecture phase.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/design-system/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: design-taste-frontend

**Purpose**: Senior UI/UX Engineer.

**Compact Rules**:
- DESIGN_VARIANCE: 8 (1=Perfect Symmetry, 10=Artsy Chaos)
- MOTION_INTENSITY: 6 (1=Static/No movement, 10=Cinematic/Magic Physics)
- VISUAL_DENSITY: 4 (1=Art Gallery/Airy, 10=Pilot Cockpit/Packed Data)
- **DEPENDENCY VERIFICATION [MANDATORY]:** Before importing ANY 3rd party library (e.g. `framer-motion`, `lucide-react`, `zustand`), you MUST check `package.json`. If the package is missing, you MUST output the installation command (e.g. `npm install package-name`) before providing the code. **Never** assume a library exists.
- **Framework & Interactivity:** React or Next.js. Default to Server Components (`RSC`).
- **RSC SAFETY:** Global state works ONLY in Client Components. In Next.js, wrap providers in a `"use client"` component.
- **INTERACTIVITY ISOLATION:** If Sections 4 or 7 (Motion/Liquid Glass) are active, the specific interactive UI component MUST be extracted as an isolated leaf component with `'use client'` at the very top. Server Components must exclusively render static layouts.
- **State Management:** Use local `useState`/`useReducer` for isolated UI. Use global state strictly for deep prop-drilling avoidance.
- **Styling Policy:** Use Tailwind CSS (v3/v4) for 90% of styling.
- **TAILWIND VERSION LOCK:** Check `package.json` first. Do not use v4 syntax in v3 projects.
- **T4 CONFIG GUARD:** For v4, do NOT use `tailwindcss` plugin in `postcss.config.js`. Use `@tailwindcss/postcss` or the Vite plugin.
- **ANTI-EMOJI POLICY [CRITICAL]:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons (Radix, Phosphor) or clean SVG primitives. Emojis are BANNED.
- **Responsiveness & Spacing:**
- Standardize breakpoints (`sm`, `md`, `lg`, `xl`).
- Contain page layouts using `max-w-[1400px] mx-auto` or `max-w-7xl`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/design-taste-frontend/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: emil-design-eng

**Purpose**: This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make so...

**Compact Rules**:
- **Spatial consistency**: toast enters and exits from the same direction, making swipe-to-dismiss feel intuitive
- **State indication**: a morphing feedback button shows the state change
- **Explanation**: a marketing animation that shows how a feature works
- **Feedback**: a button scales down on press, confirming the interface heard the user
- **Preventing jarring changes**: elements appearing or disappearing without transition feel broken
- A **fast-spinning spinner** makes loading feel faster (same load time, different perception)
- A **180ms select** animation feels more responsive than a **400ms** one
- **Instant tooltips** after the first one is open (skip delay + skip animation) make the whole toolbar feel faster
- Drag interactions with momentum
- Elements that should feel "alive" (like Apple's Dynamic Island)
- Gestures that can be interrupted mid-animation
- Decorative mouse-tracking interactions
- **Developer experience is key.** No hooks, no context, no complex setup. Insert `<Toaster />` once, call `toast()` from anywhere. The less friction to adopt, the more people will use it.
- **Good defaults matter more than options.** Ship beautiful out of the box. Most users never customize. The default easing, timing, and visual design should be excellent.
- **Naming creates identity.** "Sonner" (French for "to ring") feels more elegant than "react-toast". Sacrifice discoverability for memorability when appropriate.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/emil-design-eng/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: frontend-design

**Purpose**: Create distinctive, production-grade frontend interfaces with high design quality.

**Compact Rules**:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/frontend-design/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: git-flow-master

**Purpose**: End-to-end Git operator for any branching strategy.

**Compact Rules**:
- "I want to start work on UPEX-123" → branch creation
- "commit and push", "subir cambios", "push to main" → commit + push flow
- "abrí un PR contra staging" → PR creation
- "tengo conflictos al hacer pull" → conflict resolution
- "este PR va a quedar enorme" → chained-PR planning hand-off
- "qué estrategia de git usamos en este repo" → strategy detection / persistence
- "el push fue rechazado" → diagnostic + recovery flow
- Current branch.
- Dirty / clean working tree (staged / unstaged / untracked counts).
- Unpushed / unpulled commits (ahead / behind upstream).
- Upstream status (no upstream, up-to-date, diverged).
- Remote name(s) — most repos have one (`origin`); some have a fork + upstream.
- **Marker in `CLAUDE.md`** — search for `<!-- git-flow-master:strategy:VALUE -->` where `VALUE` is one of the seven slugs. If found, use it. This is the persisted decision. Also read the decision markers if present — `<!-- git-flow-master:integration-branch:NAME -->`, `<!-- git-flow-master:promote-method:... -->`, `<!-- git-flow-master:feature-merge:... -->`, `<!-- git-flow-master:hotfix-policy:... -->`. Each marker that resolves a questionnaire answer means Strategy Setup SKIPS that question on re-run (idempotent).
- **Single-branch heuristic** — `git branch -a` shows only `main` (or `master`) and no integration branch in the remote → `solo-main`.
- **Two-branch heuristic** — exactly `main` (or `master`) + one of `{staging, dev, develop, integration}` exists upstream → `main-integration` (record the integration branch name).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/git-flow-master/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: impeccable

**Purpose**: Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize...

**Compact Rules**:
- Load context (PRODUCT.md / DESIGN.md) via the loader script.
- Identify the register and load the matching register reference (brand.md or product.md).
- **If the user invoked a sub-command (e.g. `craft`, `shape`, `audit`), load its reference file too.** This is non-negotiable: `craft` without `craft.md` loaded means you'll skip the shape-and-confirm step the user expects.
- **PRODUCT.md**: required. Users, brand, tone, anti-references, strategic principles.
- **DESIGN.md**: optional, strongly recommended. Colors, typography, elevation, components.
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100; high chroma at extremes looks garish.
- Never use `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01 is enough).
- Pick a **color strategy** before picking colors. Four steps on the commitment axis:
- **Restrained**: tinted neutrals + one accent ≤10%. Product default; brand minimalism.
- **Committed**: one saturated color carries 30–60% of the surface. Brand default for identity-driven pages.
- **Full palette**: 3–4 named roles, each used deliberately. Brand campaigns; product data viz.
- **Drenched**: the surface IS the color. Brand heroes, campaign pages.
- The "one accent ≤10%" rule is Restrained only. Committed / Full palette / Drenched exceed it on purpose. Don't collapse every design to Restrained by reflex.
- Cap body line length at 65–75ch.
- Hierarchy through scale + weight contrast (≥1.25 ratio between steps). Avoid flat scales.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/impeccable/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-code-javascript

**Purpose**: Write JavaScript code in n8n Code nodes.

**Compact Rules**:
- **Choose "Run Once for All Items" mode** (recommended for most use cases)
- **Access data**: `$input.all()`, `$input.first()`, or `$input.item`
- **CRITICAL**: Must return `[{json: {...}}]` format
- **CRITICAL**: Webhook data is under `$json.body` (not `$json` directly)
- **Built-ins available**: $helpers.httpRequest() (no auth), DateTime (Luxon), $jmespath(). **Not available**: $helpers.httpRequestWithAuthentication, $env (when N8N_BLOCK_ENV_ACCESS_IN_NODE=true), require() (unless allowlisted)
- **How it works**: Code executes **once** regardless of input count
- **Data access**: `$input.all()` or `items` array
- **Best for**: Aggregation, filtering, batch processing, transformations, API calls with all data
- **Performance**: Faster for multiple items (single execution)
- ✅ Comparing items across the dataset
- ✅ Calculating totals, averages, or statistics
- ✅ Sorting or ranking items
- ✅ Deduplication
- ✅ Building aggregated reports
- ✅ Combining data from multiple items
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-code-javascript/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-code-python

**Purpose**: Write Python code in n8n Code nodes.

**Compact Rules**:
- You need specific Python standard library functions
- You're significantly more comfortable with Python syntax
- You're doing data transformations better suited to Python
- Full n8n helper functions ($helpers.httpRequest, etc.)
- Luxon DateTime library for advanced date/time operations
- No external library limitations
- Better n8n documentation and community support
- **Consider JavaScript first** - Use Python only when necessary
- **Access data**: `_input.all()`, `_input.first()`, or `_input.item`
- **CRITICAL**: Must return `[{"json": {...}}]` format
- **CRITICAL**: Webhook data is under `_json["body"]` (not `_json` directly)
- **CRITICAL LIMITATION**: **No external libraries** (no requests, pandas, numpy)
- **Standard library only**: json, datetime, re, base64, hashlib, urllib.parse, math, random, statistics
- **How it works**: Code executes **once** regardless of input count
- **Data access**: `_input.all()` or `_items` array (Native mode)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-code-python/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-expression-syntax

**Purpose**: Validate n8n expression syntax and fix common errors.

**Compact Rules**:
- Node names **must** be in quotes
- Node names are **case-sensitive**
- Must match exact node name from workflow
- Store values in credentials instead
- Use a Set node with manually entered values
- Pass values through webhook query parameters
- Click field with expression
- Open expression editor (click "fx" icon)
- See live preview of result
- Check for errors highlighted in red
- `.toLowerCase()`, `.toUpperCase()`
- `.trim()`, `.replace()`, `.substring()`
- `.split()`, `.includes()`
- `.length`, `.map()`, `.filter()`
- `.find()`, `.join()`, `.slice()`
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-expression-syntax/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-mcp-tools-expert

**Purpose**: Expert guide for using n8n-mcp MCP tools effectively.

**Compact Rules**:
- **Node Discovery** → [SEARCH_GUIDE.md](SEARCH_GUIDE.md)
- **Configuration Validation** → [VALIDATION_GUIDE.md](VALIDATION_GUIDE.md)
- **Workflow Management** → [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md)
- **Template Library** - Search and deploy 2,700+ real workflows
- **Workflow Generation** - Natural-language → workflow with proposal review (`n8n_generate_workflow`, hosted-only)
- **Data Tables** - Manage n8n data tables and rows (`n8n_manage_datatable`)
- **Credential Management** - Full credential CRUD + schema discovery (`n8n_manage_credentials`)
- **Security & Audit** - Instance security auditing with custom deep scan (`n8n_audit_instance`)
- **Documentation & Guides** - Tool docs, AI agent guide, Code node guides
- search_nodes({query: "keyword"})
- get_node({nodeType: "nodes-base.name"})
- [Optional] get_node({nodeType: "nodes-base.name", mode: "docs"})
- validate_node({nodeType, config: {}, mode: "minimal"}) - Check required fields
- validate_node({nodeType, config, profile: "runtime"}) - Full validation
- [Repeat] Fix errors, validate again
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-mcp-tools-expert/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-node-configuration

**Purpose**: Operation-aware node configuration guidance.

**Compact Rules**:
- `get_node` with `detail: "standard"` is the most used discovery pattern
- 56 seconds average between configuration edits
- Covers 95% of use cases with 1-2K tokens response
- **get_node({detail: "standard"})** - DEFAULT
- Quick overview (~1-2K tokens)
- Required fields + common options
- **Use first** - covers 95% of needs
- **get_node({mode: "search_properties", propertyQuery: "..."})** (for finding specific fields)
- Find properties by name
- Use when looking for auth, body, headers, etc.
- **get_node({detail: "full"})** (complete schema)
- All properties (~3-8K tokens)
- Use only when standard detail is insufficient
- Identify node type and operation
- Use get_node (standard detail is default)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-node-configuration/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-validation-expert

**Purpose**: Interpret validation errors and guide fixing them.

**Compact Rules**:
- Expect validation feedback loops
- Usually 2-3 validate → fix cycles
- Average: 23s thinking about errors, 58s fixing them
- `missing_required` - Required field not provided
- `invalid_value` - Value doesn't match allowed options
- `type_mismatch` - Wrong data type (string instead of number)
- `invalid_reference` - Referenced node doesn't exist
- `invalid_expression` - Expression syntax error
- `best_practice` - Recommended but not required
- `deprecated` - Using old API/feature
- `performance` - Potential performance issue
- `optimization` - Could be more efficient
- `alternative` - Better way to achieve same result
- Configure node
- validate_node (23 seconds thinking about errors)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-validation-expert/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: n8n-workflow-patterns

**Purpose**: Proven workflow architectural patterns from real n8n workflows.

**Compact Rules**:
- **[Webhook Processing](webhook_processing.md)** (Most Common)
- Receive HTTP requests → Process → Output
- Pattern: Webhook → Validate → Transform → Respond/Notify
- **[HTTP API Integration](http_api_integration.md)**
- Fetch from REST APIs → Transform → Store/Use
- Pattern: Trigger → HTTP Request → Transform → Action → Error Handler
- **[Database Operations](database_operations.md)**
- Read/Write/Sync database data
- Pattern: Schedule → Query → Transform → Write → Verify
- **[AI Agent Workflow](ai_agent_workflow.md)**
- AI agents with tools and memory
- Pattern: Trigger → AI Agent (Model + Tools + Memory) → Output
- **[Scheduled Tasks](scheduled_tasks.md)**
- Recurring automation workflows
- Pattern: Schedule → Fetch → Process → Deliver → Log
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/n8n-workflow-patterns/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: next-best-practices

**Purpose**: Next.js best practices - file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/fon...

**Compact Rules**:
- Project structure and special files
- Route segments (dynamic, catch-all, groups)
- Parallel and intercepting routes
- Middleware rename in v16 (middleware → proxy)
- Async client component detection (invalid)
- Non-serializable props detection
- Server Action exceptions
- Async `params` and `searchParams`
- Async `cookies()` and `headers()`
- Migration codemod
- Default to Node.js runtime
- When Edge runtime is appropriate
- `'use client'`, `'use server'` (React)
- `'use cache'` (Next.js)
- Navigation hooks: `useRouter`, `usePathname`, `useSearchParams`, `useParams`
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/next-best-practices/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: next-cache-components

**Purpose**: Next.js 16 Cache Components - PPR, use cache directive, cacheLife, cacheTag, updateTag

**Compact Rules**:
- **Build ID** - invalidates all caches on deploy
- **Function ID** - hash of function location
- **Serializable arguments** - props become part of key
- **Closure variables** - outer scope values included
- **No manual cache keys** - `use cache` generates keys automatically from function arguments and closures. The `keyParts` array from `unstable_cache` is no longer needed.
- **Tags** - Replace `options.tags` with `cacheTag()` calls inside the function.
- **Revalidation** - Replace `options.revalidate` with `cacheLife({ revalidate: N })` or a built-in profile like `cacheLife('minutes')`.
- **Dynamic data** - `unstable_cache` did not support `cookies()` or `headers()` inside the callback. The same restriction applies to `use cache`, but you can use `'use cache: private'` if needed.
- **Edge runtime not supported** - requires Node.js
- **Static export not supported** - needs server
- **Non-deterministic values** (`Math.random()`, `Date.now()`) execute once at build time inside `use cache`
- [Cache Components Guide](https://nextjs.org/docs/app/getting-started/cache-components)
- [use cache Directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [unstable_cache (legacy)](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/next-cache-components/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: next-upgrade

**Purpose**: Upgrade Next.js to the latest version following official migration guides and codemods

**Compact Rules**:
- **Detect current version**: Read `package.json` to identify the current Next.js version and related dependencies (React, React DOM, etc.)
- **Fetch the latest upgrade guide**: Use WebFetch to get the official upgrade documentation:
- Codemods: https://nextjs.org/docs/app/guides/upgrading/codemods
- Version-specific guides (adjust version as needed):
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/docs/app/guides/upgrading/version-15
- https://nextjs.org/docs/app/guides/upgrading/version-14
- **Determine upgrade path**: Based on current version, identify which migration steps apply. For major version jumps, upgrade incrementally (e.g., 13 → 14 → 15).
- **Run codemods first**: Next.js provides codemods to automate breaking changes:
- `next-async-request-api` - Updates async Request APIs (v15)
- `next-request-geo-ip` - Migrates geo/ip properties (v15)
- `next-dynamic-access-named-export` - Transforms dynamic imports (v15)
- **Update dependencies**: Upgrade Next.js and peer dependencies together:
- **Review breaking changes**: Check the upgrade guide for manual changes needed:
- API changes (e.g., async params in v15)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/next-upgrade/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: playwright-cli

**Purpose**: Automate browser interactions, test web pages and work with Playwright tests.

**Compact Rules**:
- Page URL: https://example.com/
- Page Title: Example Domain
- **Running and Debugging Playwright tests** [references/playwright-tests.md](references/playwright-tests.md)
- **Request mocking** [references/request-mocking.md](references/request-mocking.md)
- **Running Playwright code** [references/running-code.md](references/running-code.md)
- **Browser session management** [references/session-management.md](references/session-management.md)
- **Spec-driven testing (plan / generate / heal)** [references/spec-driven-testing.md](references/spec-driven-testing.md)
- **Storage state (cookies, localStorage)** [references/storage-state.md](references/storage-state.md)
- **Test generation** [references/test-generation.md](references/test-generation.md)
- **Tracing** [references/tracing.md](references/tracing.md)
- **Video recording** [references/video-recording.md](references/video-recording.md)
- **Inspecting element attributes** [references/element-attributes.md](references/element-attributes.md)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/playwright-cli/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: product-management

**Purpose**: Orchestrates continuous product management work — initial backlog seed from PRD, incremental feature addition, epic creation, story refin...

**Compact Rules**:
- A new feature or epic needs to be added to the backlog
- A story has rough or ambiguous acceptance criteria that need sharpening
- A story needs INVEST validation or a 3-amigos session before development starts
- You're systematically enumerating edge cases / failure modes for a feature
- You're seeding the very first product backlog from a freshly minted PRD
- `/project-foundation` should have produced `.context/PRD/` and `.context/SRS/` (required for the initial backlog-seed workflow; useful context for all others)
- `.agents/project.yaml` populated with `{{PROJECT_KEY}}`, `{{ISSUE_TRACKER}}`, `{{ATLASSIAN_URL}}` — these ship with the cloned boilerplate; if missing, clone the full repo
- Atlassian / Jira tooling reachable (Atlassian CLI `acli` preferred, MCP Atlassian as fallback) for any workflow that writes to Jira
- `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
- `.agents/jira-required.yaml` — canonical slug catalog (fields + statuses + link types).
- `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping.
- `.agents/jira-workflows.json` — workflow + transition catalog.
- `.agents/jira-link-types.json` — slug → workspace link-type mapping (when present).
- `.context/master-implementation-plan.md` — Master Sprint roadmap.
- `.context/PRD/mvp-scope.md` — what's in vs out of the MVP.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/product-management/SKILL.md` · phase: `management` · extraction strategy: B

---

## Skill: project-bootstrap

**Purpose**: Scaffolds the technical infrastructure of a new project: backend (DB schemas, API base, types, error handling), frontend (design system,...

**Compact Rules**:
- `agentic-dev-core/references/briefing-template.md` — used when dispatching parallel scaffolding subagents (e.g. backend + frontend in parallel).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-bootstrap/`, archive on completion.
- Read `complementary_categories` from this skill's frontmatter (`frontend-framework`, `frontend-ui`, `backend-db`, `runtime`, `language`, `ci-cd`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2 (path-based: `.claude/skills/` → T1; PROJECT_LEVEL_SKILLS → T3; USER_LEVEL_SKILLS → T4).
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this bootstrap? Y/N"`. Cache the answer for the session.
- When dispatching scaffolding sub-agents (Backend setup, Frontend setup, Incremental features), inject a `## Composable Skills` block per strategy doc §6.2 listing the resolved skills + project standards (test command, runtime, etc).
- A fresh repo has its product foundation (`/project-foundation` already ran) but no code yet.
- An existing repo needs an incremental infrastructure feature added (e.g. "add OpenAPI to the API", "add bearer auth", "wire Supabase types into the frontend").
- Define the product (PRD, user journeys, architecture decisions) — that's `/project-foundation`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-bootstrap/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: project-foundation

**Purpose**: Orchestrates the foundational definition of a new product/project: Constitution (business model + market context), Architecture (PRD + SR...

**Compact Rules**:
- `agentic-dev-core/references/briefing-template.md` — used when dispatching subagents to research market data, audit competitors, or interview users.
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-foundation/`, archive on completion.
- `agentic-dev-core/references/adr-doctrine.md` — Phase 3 only: which architectural decisions earn an ADR + how to seed the first batch into `.context/ADR/`.
- Read `complementary_categories` from this skill's frontmatter (`creativity`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this foundation work? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents (Constitution, PRD, SRS, Discovery), inject a `## Composable Skills` block per strategy doc §6.2.
- Stakeholder brief or initial PRD draft — whatever the user provides as the seed for this foundation pass (paste, doc link, voice-memo transcript, etc.).
- `.context/PRD/` — existing PRD outputs if a prior version exists. UPSERT semantics: re-invoking a phase refines what's there; it does NOT rewrite from scratch.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-foundation/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: react-hook-form

**Purpose**: React Hook Form performance optimization for client-side form validation using useForm, useWatch, useController, useFieldArray, and the v...

**Compact Rules**:
- Writing new forms with React Hook Form
- Configuring useForm options (mode, defaultValues, validation)
- Subscribing to form values with watch / useWatch / subscribe
- Integrating controlled UI components (MUI, shadcn, Ant Design)
- Managing dynamic field arrays with useFieldArray
- Handling async submit, server errors, and submit lifecycle state
- Reviewing forms for performance issues
- **React 19 Server Actions / `useActionState`** — use the `react-19` skill instead
- **Deeply nested, fully type-safe forms** — TanStack Form may be a better fit for forms with complex nested schemas; this skill assumes you've already chosen RHF
- **Single-input or trivial forms** — uncontrolled `<form>` + `FormData` is often simpler than pulling in any library
- `formcfg-validation-mode` - Use onSubmit mode for optimal performance
- `formcfg-revalidate-mode` - Consider reValidateMode for expensive validation
- `formcfg-default-values` - Always provide defaultValues for form initialization
- `formcfg-async-default-values` - Use async defaultValues for server data
- `formcfg-should-unregister` - Enable shouldUnregister for dynamic form memory efficiency
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/react-hook-form/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: redesign-existing-projects

**Purpose**: Upgrades existing websites and apps to premium quality.

**Compact Rules**:
- **Scan** — Read the codebase. Identify the framework, styling method (Tailwind, vanilla CSS, styled-components, etc.), and current design patterns.
- **Diagnose** — Run through the audit below. List every generic pattern, weak point, and missing state you find.
- **Fix** — Apply targeted upgrades working with the existing stack. Do not rewrite from scratch. Improve what's there.
- **Browser default fonts or Inter everywhere.** Replace with a font that has character. Good options: `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi`. For editorial/creative projects, pair a serif header with a sans-serif body.
- **Headlines lack presence.** Increase size for display text, tighten letter-spacing, reduce line-height. Headlines should feel heavy and intentional.
- **Body text too wide.** Limit paragraph width to roughly 65 characters. Increase line-height for readability.
- **Only Regular (400) and Bold (700) weights used.** Introduce Medium (500) and SemiBold (600) for more subtle hierarchy.
- **Numbers in proportional font.** Use a monospace font or enable tabular figures (`font-variant-numeric: tabular-nums`) for data-heavy interfaces.
- **Missing letter-spacing adjustments.** Use negative tracking for large headers, positive tracking for small caps or labels.
- **All-caps subheaders everywhere.** Try lowercase italics, sentence case, or small-caps instead.
- **Orphaned words.** Single words sitting alone on the last line. Fix with `text-wrap: balance` or `text-wrap: pretty`.
- **Pure `#000000` background.** Replace with off-black, dark charcoal, or tinted dark (`#0a0a0a`, `#121212`, or a dark navy).
- **Oversaturated accent colors.** Keep saturation below 80%. Desaturate accents so they blend with neutrals instead of screaming.
- **More than one accent color.** Pick one. Remove the rest. Consistency beats variety.
- **Mixing warm and cool grays.** Stick to one gray family. Tint all grays with a consistent hue (warm or cool, not both).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/redesign-existing-projects/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: resend-cli

**Purpose**: Operate the Resend platform from the terminal — send emails (including React Email .tsx templates via --react-email), manage domains, con...

**Compact Rules**:
- Supply ALL required flags. The CLI will NOT prompt when stdin is not a TTY.
- Pass `--quiet` (or `-q`) to suppress spinners and status messages.
- Exit `0` = success, `1` = error.
- Error JSON goes to stderr, success JSON goes to stdout:
- Use `--api-key` or `RESEND_API_KEY` env var. Never rely on interactive login.
- All `delete`/`rm` commands require `--yes` in non-interactive mode.
- **Sending or reading emails** → [references/emails.md](references/emails.md)
- **Setting up or verifying a domain** → [references/domains.md](references/domains.md)
- **Managing API keys** → [references/api-keys.md](references/api-keys.md)
- **Creating or sending broadcasts** → [references/broadcasts.md](references/broadcasts.md)
- **Managing contacts, segments, or topics** → [references/contacts.md](references/contacts.md), [references/segments.md](references/segments.md), [references/topics.md](references/topics.md)
- **Defining contact properties** → [references/contact-properties.md](references/contact-properties.md)
- **Working with templates** → [references/templates.md](references/templates.md)
- **Viewing API request logs** → [references/logs.md](references/logs.md)
- **Creating automations or sending events** → [references/automations.md](references/automations.md)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/resend-cli/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: seo

**Purpose**: Optimize for search engine visibility and ranking.

**Compact Rules**:
- Maximum 50,000 URLs or 50MB per sitemap
- Use sitemap index for larger sites
- Include only canonical, indexable URLs
- Update `lastmod` when content changes
- Submit to Google Search Console
- Use hyphens, not underscores
- Lowercase only
- Keep short (< 75 characters)
- Include target keywords naturally
- Avoid parameters when possible
- Use HTTPS always
- 50-60 characters (Google truncates ~60)
- Primary keyword near the beginning
- Unique for every page
- Brand name at end (unless homepage)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/seo/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: shadcn

**Purpose**: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI.

**Compact Rules**:
- **Use existing components first.** Use `npx shadcn@latest search` to check registries before writing custom UI. Check community registries too.
- **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
- **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
- **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.
- **`className` for layout, not styling.** Never override component colors or typography.
- **No `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`. For vertical stacks, `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10` not `w-10 h-10`.
- **Use `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Don't write manual template literal ternaries.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. handle their own stacking.
- **Forms use `FieldGroup` + `Field`.** Never use raw `div` with `space-y-*` or `grid gap-*` for form layout.
- **`InputGroup` uses `InputGroupInput`/`InputGroupTextarea`.** Never raw `Input`/`Textarea` inside `InputGroup`.
- **Buttons inside inputs use `InputGroup` + `InputGroupAddon`.**
- **Option sets (2–7 choices) use `ToggleGroup`.** Don't loop `Button` with manual active state.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/shadcn/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: sprint-development

**Purpose**: Orchestrates the per-story dev loop end-to-end: Planning -> Implementation -> Code Review -> Staging deploy -> (gated) Production deploy.

**Compact Rules**:
- **New user story** (most common) -> Stage 1 (story-plan) -> Stage 2 (implement-story) -> ... -> Stage 4
- **New feature with multiple stories** -> Stage 1 macro (feature-plan) -> loop Stage 1+2 per story -> Stage 4 per merge
- **Bug fix** -> skip to Stage 2 with `bug-fix-workflow.md` (root cause first), then Stage 3+4
- **Resume from interruption** -> Stage 2 entry via `continue-implementation.md`
- **PR feedback / code review iteration** -> Stage 3 with `fix-issues.md`, fix-and-iterate loop
- **Production deploy** (separate event) -> Stage 5, only after QA green + business approval
- `.agents/project.yaml` populated. If missing, clone the full boilerplate — foundation files ship with the repo.
- Story exists in the issue tracker with refined Acceptance Criteria. If backlog is empty or AC are unclear, run `/product-management` first.
- Branch policy clear and CI configured. First-time-only setup lives in `references/setup-linting.md` and `references/ci-cd-setup.md`.
- Working directory is the **target project repo**. Sprint-dev runs there, not in the boilerplate.
- `.env` populated with environment URLs and credentials. Never hardcode credentials.
- `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
- `.agents/jira-required.yaml` — canonical slug catalog (custom fields, statuses, link types) for the active workspace.
- `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping for `{{jira.<slug>}}` resolution.
- `.agents/jira-workflows.json` — workflow + transition catalog (resolves Ready For Dev → In Progress → In Review → Ready For QA).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/sprint-development/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: supabase

**Purpose**: Use when doing ANY task involving Supabase.

**Compact Rules**:
- **Auth and session security**
- **Never use `user_metadata` claims in JWT-based authorization decisions.** In Supabase, `raw_user_meta_data` is user-editable and can appear in `auth.jwt()`, so it is unsafe for RLS policies or any other authorization logic. Store authorization data in `raw_app_meta_data` / `app_metadata` instead.
- **Deleting a user does not invalidate existing access tokens.** Sign out or revoke sessions first, keep JWT expiry short for sensitive apps, and for strict guarantees validate `session_id` against `auth.sessions` on sensitive operations.
- **If you use `app_metadata` or `auth.jwt()` for authorization, remember JWT claims are not always fresh until the user's token is refreshed.**
- **API key and client exposure**
- **Never expose the `service_role` or secret key in public clients.** Prefer publishable keys for frontend code. Legacy `anon` keys are only for compatibility. In Next.js, any `NEXT_PUBLIC_` env var is sent to the browser.
- **RLS, views, and privileged database code**
- **Views bypass RLS by default.** In Postgres 15 and above, use `CREATE VIEW ... WITH (security_invoker = true)`. In older versions of Postgres, protect your views by revoking access from the `anon` and `authenticated` roles, or by putting them in an unexposed schema.
- **UPDATE requires a SELECT policy.** In Postgres RLS, an UPDATE needs to first SELECT the row. Without a SELECT policy, updates silently return 0 rows — no error, just no change.
- **`auth.role()` is deprecated — use the `TO` clause instead.** Supabase has deprecated `auth.role()` in favour of specifying the target role directly on the policy with `TO authenticated` or `TO anon`. Beyond deprecation, `auth.role() = 'authenticated'` breaks silently when anonymous sign-ins are enabled, because anonymous users carry the `authenticated` Postgres role and pass the check regardless of whether the user is genuinely signed in.
- **`TO authenticated` alone is authentication without authorization (BOLA / IDOR).** Using `TO authenticated` only checks the role — it does not restrict which rows a user can access. The correct pattern combines `TO authenticated` with an ownership predicate in `USING`:
- **UPDATE policies require both `USING` and `WITH CHECK`.** Without `WITH CHECK`, a user can reassign a row's `user_id` to another user:
- **`SECURITY DEFINER` functions bypass RLS.** A `SECURITY DEFINER` function runs with its creator's privileges — typically a role with `bypassrls` (e.g., `postgres`). Never add `SECURITY DEFINER` to resolve a permission error; it silently removes access control without fixing the underlying cause. Prefer `SECURITY INVOKER`.
- **`SECURITY DEFINER` functions in `public` are callable by all roles.** Postgres grants `EXECUTE` to `PUBLIC` by default for every new function, so any `SECURITY DEFINER` function in `public` is a public API endpoint callable by `anon` and `authenticated` (which inherit from `PUBLIC`) without any additional grant. When `SECURITY DEFINER` is genuinely needed (e.g., bypassing RLS on an internal lookup table), keep the function in a non-exposed schema, always include an `auth.uid()` check in the function body, and run `supabase db advisors` after making changes.
- **Storage access control**
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/supabase/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: supabase-postgres-best-practices

**Purpose**: Postgres performance optimization and best practices from Supabase.

**Compact Rules**:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)
- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/supabase-postgres-best-practices/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: tailwind-css-patterns

**Purpose**: Provides comprehensive Tailwind CSS utility-first styling patterns including responsive design, layout utilities, flexbox, grid, spacing,...

**Compact Rules**:
- Styling React/Vue/Svelte components
- Building responsive layouts and grids
- Implementing design systems
- Adding dark mode support
- Optimizing CSS workflow
- **Start Mobile-First**: Write base styles for mobile, add responsive prefixes (`sm:`, `md:`, `lg:`) for larger screens
- **Use Design Tokens**: Leverage Tailwind's spacing, color, and typography scales
- **Compose Utilities**: Combine multiple utilities for complex styles
- **Extract Components**: Create reusable component classes for repeated patterns
- **Configure Theme**: Customize design tokens in `tailwind.config.js` or using `@theme`
- **Verify Changes**: Test at each breakpoint using DevTools responsive mode. Check for visual regressions and accessibility issues before committing.
- **Consistent Spacing**: Use Tailwind's spacing scale (4, 8, 12, 16, etc.)
- **Color Palette**: Stick to Tailwind's color system for consistency
- **Component Extraction**: Extract repeated patterns into reusable components
- **Utility Composition**: Prefer utility classes over `@apply` for maintainability
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/tailwind-css-patterns/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: testability-guide

**Purpose**: Generates a public in-app `/qa` page ("Software Testability Guide for QA") + a tool-agnostic credentials artifact (markdown body) the use...

**Compact Rules**:
- **A public `/qa` page inside the app** titled _"Software Testability Guide for QA"_ — explains the architecture, demo users, DB-level testing via DBHub MCP, API-level testing via OpenAPI MCP, UI-level testing via Playwright (scripted and agentic). The page links out to the real credentials but never inlines them.
- **A tool-agnostic credentials artifact** (a markdown body) that holds the real DB connection, API login, demo passwords, OpenAPI spec URL, and Swagger UI link. The user picks where this artifact gets published: a Jira Epic (default), a Confluence page, a Notion page, any tool reachable via an MCP or a CLI, or — as a last resort — manual paste.
- `.agents/project.yaml` — project identity, env URLs, default branch, MCP names.
- `.mcp.json` — available MCP servers (Atlassian, Notion, etc.). Determines which publisher targets are reachable.
- `app/qa/page.tsx` snapshot (or framework-equivalent location) when present — current state of the `/qa` page; needed for the idempotency / drift-detection check (Phase 2).
- The publisher target's API contract — varies by Q1 answer: Jira Epic via `[ISSUE_TRACKER_TOOL]`, Confluence page via `[KNOWLEDGE_BASE_TOOL]`, Notion page via Notion MCP, generic MCP / CLI per `references/publishers/`.
- `.env.example` — to know which credentials slots the credentials artifact should reference by name (NEVER quote the actual values).
- `agentic-dev-core/references/briefing-template.md` — used when dispatching parallel sub-agents (e.g. page codegen + credentials-artifact publish in parallel).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the auto-resolve step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/testability-guide/`, archive on completion.
- Read `complementary_categories` from this skill's frontmatter.
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- Classify tier per strategy doc §2.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/testability-guide/SKILL.md` · phase: `foundation-extension` · extraction strategy: B

---

## Skill: typescript-advanced-types

**Purpose**: Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for bu...

**Compact Rules**:
- Building type-safe libraries or frameworks
- Creating reusable generic components
- Implementing complex type inference logic
- Designing type-safe API clients
- Building form validation systems
- Creating strongly-typed configuration objects
- Implementing type-safe state management
- Migrating JavaScript codebases to TypeScript
- **Use `unknown` over `any`**: Enforce type checking
- **Prefer `interface` for object shapes**: Better error messages
- **Use `type` for unions and complex types**: More flexible
- **Leverage type inference**: Let TypeScript infer when possible
- **Create helper types**: Build reusable type utilities
- **Use const assertions**: Preserve literal types
- **Avoid type assertions**: Use type guards instead
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/typescript-advanced-types/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: ui-ux-pro-max

**Purpose**: UI/UX design intelligence for web and mobile.

**Compact Rules**:
- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts, etc.)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for user experience, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of interfaces
- UI looks "not professional enough" but the reason is unclear
- Receiving feedback on usability or experience
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building design systems or reusable component libraries
- Pure backend logic development
- Only involving API or database design
- Performance optimization unrelated to the interface
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/ui-ux-pro-max/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: unit-testing

**Purpose**: Focused skill for unit-test design — TDD workflow (red-green-refactor), test naming (AAA, Given-When-Then), mocking patterns (mocks/spies...

**Compact Rules**:
- "Write unit tests for this function/class"
- "TDD this slice" / "red-green-refactor"
- "What should I mock here?"
- "How do I name this test?"
- "What's the right coverage target for this module?"
- Mid-flight from `/sprint-development` Stage 2 (Implementation) when implementing TDD-friendly code (pure functions, complex branching, bug fix reproducers)
- Project has a unit test runner configured (Jest, Vitest, Mocha, or similar)
- Test command exists in `package.json` (`bun test`, `npm test`, `vitest`, etc.)
- For TDD: test runner supports watch mode (`--watch`)
- If no runner is configured, the first task is to set one up — see `references/unit-testing.md` § Setup
- The function / module under test — read its public interface first; that's the contract the tests must lock in.
- Existing tests for the same module (sibling `*.test.ts` / `*.spec.ts` in the same folder) — extend, don't duplicate.
- The function's callers (search by symbol) — informs which collaborators are external (mock) vs internal (use real).
- Test framework config (`vitest.config.ts` / `jest.config.ts` / equivalent) — env vars, setup files, coverage thresholds, path aliases.
- Test helpers / fixtures used by sibling tests in the same folder — reuse the project's seams instead of inventing parallel ones.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/unit-testing/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: vercel-cli

**Purpose**: Vercel CLI cookbook for this Next.js + Supabase + Vercel boilerplate.

**Compact Rules**:
- **`vercel ls | grep` is the wrong tool to check whether YOUR deploy is ready.** ANSI color codes break the regex, and the output mixes new and old deploys for the same branch. The canonical "is this exact commit deployed" question has a different answer: `vercel ls -m githubCommitSha=<sha> --format json` to find the URL, then `vercel inspect <url> --wait --timeout=10m` to block until terminal state.
- **`vercel deploy` blocks by default; `vercel inspect` does NOT.** That asymmetry is backwards from intuition and trips agents constantly. Rule: **always pass `--no-wait` to `vercel deploy`** (return URL immediately), **always pass `--wait` to `vercel inspect`** (block until READY / ERROR / CANCELED). See `references/gotchas.md`.
- **Env-var scopes are not the same string in the CLI and the dashboard.** CLI uses lowercase `production` / `preview` / `development`; the dashboard shows "Production" / "Preview" / "Development". The CLI is the authoritative spelling — if you need to script env mutations, use the CLI form.
- Read `complementary_categories` from this skill's frontmatter (`deploy-vercel`).
- Look up the local skill-registry script (`scripts/build-skill-registry.ts` → `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- If `/deploy-to-vercel` is installed (default project-level community skill per `cli/install.ts`), prefer it for any "I haven't deployed this project yet" intent.
- **`--no-wait` on deploy, `--wait` on inspect — never the other way around.** Inverting these means you either block for 10 minutes waiting on a deploy URL you needed immediately, or you race an unfinished deployment with a smoke test.
- **`vercel ls -m githubCommitSha=<sha>` is the canonical "find MY deploy" query.** No grep, no parsing, no race. Use `--format json` and `jq`.
- **Status filter values are UPPERCASE.** `vercel ls --status READY` works; `--status ready` returns empty with no error.
- **`vercel env pull` writes to `.env.local` by default.** That file is in `.gitignore` for a reason — never commit it. If you need a different filename, pass it as a positional arg.
- **Multi-team accounts need `--scope <team-slug>` on EVERY mutating command.** Otherwise the operation hits the wrong team's project, or fails with a confusing 404.
- **Always `--format json`** on `ls`, `env ls`, `teams ls`. Human tables include ANSI color and lose columns at narrow widths.
- **Always `--no-wait` on `vercel deploy`** in scripts. Capture the URL, then poll with `vercel inspect --wait` separately.
- **Always `--wait --timeout=10m`** on `vercel inspect` when verifying. Default behavior returns immediately with whatever state the deploy is currently in — usually `BUILDING`, which tells you nothing.
- **Always pass `--scope <team-slug>`** if `vercel teams ls` shows more than one team. If the project is already linked, the `orgId` in `.vercel/project.json` / `.vercel/repo.json` resolves the team automatically and you can omit `--scope`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/vercel-cli/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: zod

**Purpose**: Zod schema validation best practices for type safety, parsing, and error handling.

**Compact Rules**:
- Writing new Zod schemas
- Choosing between parse() and safeParse()
- Implementing type inference with z.infer
- Handling validation errors for user feedback
- Composing complex object schemas
- Using refinements and transforms
- Optimizing bundle size and validation performance
- Reviewing Zod code for best practices
- `schema-use-primitives-correctly` - Use correct primitive schemas for each type
- `schema-use-unknown-not-any` - Use z.unknown() instead of z.any() for type safety
- `schema-avoid-optional-abuse` - Avoid overusing optional fields
- `schema-string-validations` - Apply string validations at schema definition
- `schema-use-enums` - Use enums for fixed string values
- `schema-coercion-for-form-data` - Use coercion for form and query data
- `parse-use-safeparse` - Use safeParse() for user input
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/zod/SKILL.md` · phase: `unknown` · extraction strategy: B
