# Skill Registry (auto-generated)

> Generated: `2026-09-02T01:22:07.437Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.claude/skills/agentic-dev-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 42

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
- **T1.** NEVER hand-author raw ADF JSON for descriptions, comments, or rich-text custom fields. Use `scripts/md-to-adf.ts` — deterministic, diffable, snake_case-safe, and avoids the combined-marks bug (inline `code` co-occurring with `strong`/`em` causes HTTP 400).
- **T2.** NEVER hardcode Jira `customfield_NNNNN` IDs in scripts or AI output that consumes `acli`. Resolve via the host project's slug catalog (see the host repo's `acli-integration.md`). IDs differ per workspace; slugs travel.
- **T3.** NEVER assume `acli` accepts custom-field input on `workitem edit`. It hard-rejects every shape (`additionalAttributes`, `fields`, flat `customfield_X`) with exit 1. Use the REST `PUT /rest/api/3/issue/{KEY}` workaround documented above — there is no acli-native path.
- **T4.** NEVER run a bulk `acli` mutation (transition, edit, comment, link, archive) without first verifying `acli jira auth status`. Silent auth expiry cascades into HTTP 401s mid-loop, leaving the batch half-applied with no clean rollback.
- **`--paginate` is opt-in.** Default limit is server-side (30–50 depending on command). No warning on truncation. If you are counting, iterating, or making decisions based on the result, pass `--paginate`.
- **Custom fields on `workitem create` go through `additionalAttributes` in `--from-json`.** Numeric IDs only (`customfield_NNNN`), no name-addressing. Documented value shapes in the `create` template are: `{"value": "..."}` (single-select), bare number, bare string. **`workitem edit` actively REJECTS custom-field input — hard error, exit 1, not a silent drop** (empirically confirmed across `additionalAttributes`, `fields`, and flat `customfield_X` shapes). For editing custom-field values on existing items, the **only** working path is REST `PUT /rest/api/3/issue/{KEY}` via `curl` using the session env vars — see the "WORKAROUND" subsection in "Publishing rich text" above, plus `references/gotchas.md` §4 and `references/workitem.md`.
- **`acli` cannot enumerate custom fields.** `acli jira field` only does create/update/delete/cancel-delete. To discover field IDs, use `workitem view --json | jq` against an item that has the field set, or call `GET /rest/api/3/field` directly. There is no in-CLI listing. Host repos typically cache the catalog under `.agents/` and resolve fields by slug — see `<repo-core>/references/acli-integration.md`.
- **Transitions match by status name, not transition ID.** When two transitions lead to the same status with different validators, the CLI picks one and may fail. No `--transition-id` escape hatch exists — fall back to REST if this hits.
- **Trace IDs are the only debug signal.** An `unexpected error, trace id: XXXXXXXX` line is all you get on backend failures. Capture and log the trace ID always; Atlassian Support needs it.
- **`workitem link create` flag names are misleading — `--out` and `--in` are EMPIRICALLY INVERTED relative to Jira's outward/inward semantics.** Running `acli jira workitem link create --out X --in Y --type Dependencies` produces "**Y** depends on **X**" — NOT "X depends on Y" as the flag names suggest. Y becomes the outward party (the one that performs the outward verb, e.g. "depends on" / "blocks" / "causes"); X becomes the inward party. Confirmed empirically against Dependencies; the same inversion applies to ALL outward-asymmetric link types (Blocks, Blocking, Causes, Duplicate, Cloners, Defect, Test, Test Automation, Test Design, Test Execute). Symmetric types (Relates) are immune — direction is lost either way. **Reverse-mapping rule of thumb**: `--out` takes the PREREQUISITE (the inward partner in Jira's UI); `--in` takes the DEPENDENT (the outward partner in Jira's UI). **Mandatory verification after every link create**: run `acli jira workitem link list --key <expected-dependent> --json` and confirm the response shows `outwardIssueKey: <expected-prerequisite>`. If the direction is wrong, delete the link and recreate with swapped flags. Deep recipe + per-type mapping table → `references/workitem.md`.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/acli/SKILL.md` · phase: `unknown` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: agentic-dev-core

**Purpose**: Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrin...

**Compact Rules**:
- `agentic-dev-core` does not:
- Provide a bootstrap or init action — clone the full repo instead.
- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/agentic-dev-onboard` and `/project-foundation`).
- Generate or scaffold tests, fixtures, or test components (that belongs to `/unit-testing` and test-automation skills).
- Adapt the framework to a specific stack (that belongs to `/project-bootstrap`).
- Sync project-specific facts in `CLAUDE.md` (that belongs to `/sync-ai-memory`).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).
- Run any external command — no `bun install`, no `git`, no `gh`.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-dev-core/SKILL.md` · phase: `foundation` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: agentic-dev-onboard

**Purpose**: Walks new users through this repo's dev flow — Next.js + Supabase stack, Jira workflow (Ready For Dev → In Progress → In Review → Ready F...

**Compact Rules**:
- Use **Context7** for "how to use X" — official docs, current API
- Use **Tavily** for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)
- What this skill does NOT do:
- Implement features → use `/sprint-development`
- Write unit tests → use `/unit-testing`
- Refine acceptance criteria → use `/product-management`
- Define a brand-new product → use `/project-foundation`
- Scaffold backend / frontend code → use `/project-bootstrap`
- Generate the in-app `/qa` page + credentials artifact → use `/testability-guide`

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-dev-onboard/SKILL.md` · phase: `foundation` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: autonomous-delivery

**Purpose**: SCHEDULED / UNATTENDED entry point for a delivery run with no human on the line.

**Compact Rules**:
- **Git is the source of truth; the tracker is a hint.** A ticket shipped only when `git merge-base --is-ancestor <mergeCommit> <integration-branch>` succeeds. A status of ready-for-QA, done, or merged proves nothing — merge automation commonly fires on ANY pull request merge, including a chain's internal ones. Never advance a dependency on a status flip.
- **`git fetch` immediately before every ancestor or fast-forward check, unconditionally.** A merge performed through the host's API updates the real ref at once; your remote-tracking ref updates only on the next fetch. "I fetched a few minutes ago" has produced a confident, wrong answer.
- **One lock per mode, never a queue.** A live lock for your mode means another run owns it: exit cleanly with a report. Do not wait, do not queue, do not run anyway. A lock older than `lock_staleness_minutes` is abandoned — reclaim it and log the reclamation.
- **An empty run is a correct outcome.** Nothing genuinely unblocked means stop and say so. Selecting marginal work to avoid an empty report is the failure this phase exists to prevent.
- **A story that gets a `master-design-plan.md` §8 US->Screen row gets a `.context/dev-roadmap.md` entry in the SAME change — both files or neither.** The §8 row alone gives a story a design contract while leaving it invisible to the execution order that schedules it. Seven recorded instances; six were hand-patched downstream by a later run instead of fixed at the source.
- **Caps are hard: `story` 1 per run, `bug` 3 sequential (each fully closed before the next), `discovery` writes no code.** Every measured story became a multi-thousand-line chain; two do not fit in one run's context.
- **Write the handoff as you go, never at the end.** A run that exhausts its context cannot write up why. Checkpoint after every phase and after every completed slice.
- **When context runs low, push the branch FIRST, then record resume state, then stop.** Unpushed commits in a disposable worktree are the only unrecoverable loss in this system. A clean mid-work handoff is a success; a mid-ticket death with unpushed work is the failure to design against.
- **Applying a schema migration to shared infrastructure is irreversible and hits every concurrent agent.** Under `migrations: confirm` (default) it stops for approval, stating target and additive-vs-destructive. Under `migrations: autonomous` it proceeds for ADDITIVE changes only and still stops for anything that drops, renames, or rewrites a live object. Writing the migration file is always autonomous; applying it is not.
- **Take the migration number from the live ledger immediately before writing the file**, never from a local directory listing. The ledger can be ahead of your branch by a peer's unmerged migration, and behind no file you can list.
- **Read regenerated output before committing it.** Types, clients, and API specs generated from a shared live instance silently absorb a concurrent sibling's unmerged schema. Diff it; strip foreign entries after proving zero consumers.
- **Give every dispatched agent its own worktree.** A background subagent writes into its dispatcher's working directory by default, outlives its dispatcher, and keeps mutating shared state after the dispatcher is gone. Fixing this after `git status` looks wrong is too late.
- **Never rebase a branch a subagent already pushed** — merge the base in instead (`git checkout -B <branch> origin/<branch> && git merge <integration-branch> --no-edit`). Rebasing forces a force-push, which is a history rewrite on pushed work.
- **Green tests are not evidence the feature works.** Fixtures that seed the column the code reads, rather than the column production writes, keep every test green over a dead data path. Require at least one assertion against a real production write path before calling an acceptance criterion covered.
- **Editing a skill's rules does nothing until the registry is regenerated** (`bun run skills:registry`). The registry is what reaches a subagent briefing; a rule that never reached the briefing never reached any executor.
- **Decide technical calls yourself, after searching the record.** Follow `agentic-dev-core/references/decision-protocol.md`: search -> follow if settled -> scored judge panel if genuinely novel -> escalate ONLY product, novel security posture, irreversible, and whatever the operator reserved. Record every autonomous decision where the NEXT run's Phase 1 will find it.
- **Whether a PRODUCT call escalates is per-project config, not a constant.** Read `decision_authority.product` in `.agents/project.yaml`. `escalate` (default, and the correct default) means it stops the run. `decide` means there is no human PO: dispatch a scored decision subagent, publish the ruling to the ticket under a heading naming the deciding profile, resync, and continue — never style it as human sign-off. Categories 2-4 escalate under both settings. Method: `decision-protocol.md` §5.1.

**Read full SKILL.md when**: you are running any phase of a scheduled run, a gate fires, or the briefing tells you to load the full skill.

> Source: `.claude/skills/autonomous-delivery/SKILL.md` · phase: `implementation` · source: frontmatter `compact_rules` (verbatim)

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
- **D1.** NEVER hardcode hex color values, font sizes, or spacing values in component code — they belong in `DESIGN.md` frontmatter tokens and are consumed via Tailwind config / CSS variables.
- **D2.** NEVER bypass `DESIGN.md` when answering "what color is X?" / "what's the spacing scale?" — the file is the source of truth, including for the assistant. Read it, do not guess.
- **D3.** NEVER regenerate `DESIGN.md` from scratch when a surgical rebrand suffices — UPSERT existing tokens, preserve section order, do not lose rationale prose.
- **D4.** NEVER ship a token rename without a migration path for component consumers — silent rename breaks every downstream import + `tailwind.config.js` reference.
- **D5.** NEVER override design tokens inline (`style={{ color: '#fff' }}`, `className="text-[#1A1C1E]"`) in components — the escape hatch becomes the rule and the token system rots.
- **D6.** NEVER let a designer hand off a Figma URL alone — require the exported token JSON or a built `DESIGN.md`; design intent must be machine-readable for downstream scaffolds.
- **D7.** NEVER auto-run the optional screen phase or hand-author screen mockups yourself — the phase is always an explicit user opt-in, and the mockups always come from the external tool: either supplied by the user into `.context/designs/<project>/` (Mode B) or commissioned by the AI through the Open Design MCP and exported there (Mode A — sanctioned delegation, see `references/screen-design-mapping.md` S1). What stays banned is the orchestrating AI writing mockup markup itself.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/design-system/SKILL.md` · phase: `foundation` · source: frontmatter `compact_rules` (verbatim)

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
- **Read the repo state first (Step 1).** Never assume branch, upstream, or cleanliness.
- **The strategy comes from `.agents/project.yaml` → `git_strategy`**, read per invocation. Never infer it from a skill example or from another project.
- **`strategy: solo-main` is the shipped DEFAULT, not evidence of a decision.** `meta.strategy_source` is what tells them apart: `inherited` means nobody chose. On a repo whose `project.project_name` is set and whose `strategy_source` is still `inherited`, OFFER Strategy Setup and say what the default costs (no integration branch, no promotion path, no review gate). Strategy Setup stamps `chosen`; nothing else may.
- **`policy:` records INTENT, not enforcement.** Reconcile it by RUNNING `bun run git:policy verify` (Step 1b) at the first push / PR / merge intent, then `--stamp` when clean. Never perform the protection queries by hand and never state what the remote requires from a `declared` reading — say "declared, not verified".
- **Query BOTH GitHub protection mechanisms.** `branches/{b}/protection` (classic) AND `rules/branches/{b}` (rulesets); `git:policy verify` does both. A `404` on the classic endpoint does NOT mean unprotected — rulesets enforce PR requirements invisibly to it. A push that succeeds is not proof a rule is absent: admins bypass rulesets while the rule still binds everyone else.
- **Report drift, never auto-correct it.** A mismatch between `policy:` and host protection is surfaced with both values and three options; editing `.agents/project.yaml` needs the user's choice. Writing the HOST needs it too: `git:policy apply` is a dry run until `--yes`, and refuses outright to remove a guard, lower the approval bar, turn off code-owner review, or widen the merge methods unless `--allow-loosening` is passed for that specific give-up.
- **`require_code_owner_review: true` with no `CODEOWNERS` file is unsatisfiable, not strict.** Nobody outside the bypass list can clear it, so every merge becomes a bypass. Treat that combination as drift with a named remedy: add the file, or turn the flag off.
- **Config examples in `references/` are examples.** Quoting one as a project's real configuration is a defect. Open the project's own file and cite it.
- **The chained-PR decision travels with its trace.** Return `Chain strategy` + `Decision trace` (verbatim tree answers, each with the reason from this change) + `Decided by`. Callers reject a bare label. This skill is the ONLY authority that may fill those lines.
- **Never push to `main` without explicit confirmation**; honour `direct_push_to_protected` on every protected branch.
- **Never** `--force`, `--force-with-lease`, `--no-verify`, amend, or rebase pushed history on a shared branch unless the user explicitly asks AND the branch is unshared.
- **Admin bypass may only be OFFERED when `admin_bypass: true`**, and only after re-confirming at runtime that the operator really is an admin and that they accept the specific irreversible action.
- **Stop at PR creation.** Never auto-merge.
- **One commit = one responsibility**, conventional prefix, no AI-attribution lines (sole scoped exception: the `Claude-Session: <session-id>` forensic trailer on AI-authored commits — `references/conventional-commits.md` § Hard rules).

**Read full SKILL.md when**: running Strategy Setup, resolving conflicts, planning a chain, or when the compact rules above do not settle the operation.

> Source: `.claude/skills/git-flow-master/SKILL.md` · phase: `implementation` · source: frontmatter `compact_rules` (verbatim)

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

## Skill: jira-administration

**Purpose**: Run bounded Jira administration workflows for project Components or Atlassian instance migration.

**Compact Rules**:
- Exactly ONE mode per run: `components` (`references/components.md`) or `instance-migration` (`references/instance-migration.md`). Load only that mode's reference. Never combine the two, never fall through into the other.
- Mode unclear → ASK. Do not infer one from a bare "fix Jira" / "sync Jira" request.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials = HARD STOP (`CLAUDE.md` Critical Rule #10). Name the exact env var, point at `.env` / `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read-first on every mutation: inspect the live state before authoring any plan. Nothing is created, applied, deleted, or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect → author the plan file → dry-run → WAIT for explicit approval → only then `--apply`.
- `instance-migration`: resolve and confirm BOTH instances → audit and verify reachability → WAIT for explicit approval → only then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global: re-login repoints every repo on the host, not just this one.
- The Atlassian host lives in `.agents/project.yaml` → `issue_tracker.atlassian_url` and NOWHERE else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination to DELETE, never to update — a second copy is what goes stale.
- Template-repo carve-out: if `.agents/project.yaml` → `project.project_name` is `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` `null`, say so in the report, and never manufacture a commit to hide the emptiness.
- Run only the selected reference's verification steps. Never run the other mode's.
- Forward `$ARGUMENTS` unchanged.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

> Source: `.claude/skills/jira-administration/SKILL.md` · phase: `unknown` · extraction strategy: A

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
- **I1.** NEVER hardcode `customfield_NNNNN` IDs in skill or AI output. Resolve via `{{jira.<slug>}}`.
- **I2.** NEVER prefix story summaries with `FR-XXX —`. Use `**Source spec:** FR-XXX` as the first body line.
- **I3.** NEVER copy AC / Scope / Out-of-Scope content into the description. Those live exclusively in their custom fields.
- **I4.** NEVER let two stories in the same epic share a literal Scope bullet. Surface as `overlap_alert` and ask the user to resolve.
- **I5.** NEVER invent acceptance criteria, scope items, or business rules. Source must be PRD / SRS / business map / explicit user input. If missing → report `gap`, halt that field, continue with the rest.
- **I6.** NEVER batch multiple ADF custom fields in a single MCP update call. Split per field, or pre-convert with `md-to-adf.ts`.
- **I7.** NEVER nest inline `code` inside `**bold**` markdown destined for ADF — the converter combines incompatible marks and Jira rejects HTTP 400.
- **I8.** NEVER create stories without immediately running the dependency-linking phase. Local declarations are not enough; Jira links must exist.
- **I9.** NEVER hardcode `acli`, `mcp__atlassian__`, or REST URL examples in this skill. Use `[ISSUE_TRACKER_TOOL]` pseudo-code. The tool skill owns the syntax.
- **I10.** NEVER use "Wave" terminology. Use "Sprint" (or "Master Sprint" / "Execution Sprint" when ambiguity matters).
- **I11.** NEVER skip sprint-sequencing after creating multiple linked stories.
- **I12.** NEVER hardcode link-type names (`"Dependencies"`, `"Blocks"`, `"Relates"`). Use `{{jira.link_types.<slug>}}`.
- **I13.** NEVER use `Relates` for ordering-sensitive dependencies. Symmetric → direction is lost. Use `Dependencies` (or flag fallback explicitly as degradation).
- **I14.** NEVER ignore cycle detection in sprint-sequencing. A cycle in the `dependencies` graph is a bug — halt and report.
- **I15.** NEVER include implementation surface in `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, or `{{jira.workflow}}`. Disallowed surface: API/endpoint paths, HTTP status codes, DB table/column names, error-code identifiers (e.g. `VALIDATION_ERROR`), framework or library names, transaction/locking patterns, internal algorithms. Those describe HOW; AC/Scope/Workflow describe WHAT the persona observes/does/receives. Implementation belongs in the impl-plan generated by `/sprint-development`. `{{jira.business_rules_specification}}` tolerates domain rules (boundaries, role gates, retry semantics, audit guarantees) but NOT internal algorithms. **Exception**: when the persona is an API consumer (DevEx, integration agent, headless client), endpoint paths and response shapes ARE part of their observable UX. **Heuristic**: if the criterion stays true after a stack swap → business voice; if a stack swap breaks it → implementation, rewrite.
- **I16.** NEVER populate `{{jira.story_points}}` on create or edit by default. Story Points stay EMPTY unless the user explicitly requests estimation in the current session ("estimate this", "size this story", "story points", or equivalent in the user's language). Rationale: PO/BA role does not estimate; estimation belongs to the team that will build the work (Design + Dev + Test). When opted-in by the user, use Fibonacci (1, 2, 3, 5, 8); 13+ is a smell → split instead.
- **I17.** NEVER write `{{jira.acceptance_criteria}}` as plain text. Every scenario MUST be wrapped in a fenced ```gherkin code block. Applies on initial create AND on every edit/re-format pass. Reason: Jira ADF renders the fenced block as monospaced + syntax-highlighted, which is the only readable shape for Given/When/Then in the Jira UI. When refining EXISTING AC that was written unfenced, rewrite the field in full to apply the fence.
- **I18.** NEVER create or edit a story (or epic) without first running an **active dependency discovery** pass against the current backlog graph (`.context/PBI/epic-tree.md` + live Jira link graph + `.context/business/business-data-map.md` when present). Default state is "no global/infrastructural dependencies surface as story links" — generic prerequisites (auth exists, DB exists, framework is set up) are filtered out as noise. Only feature-level, observable, explicit dependencies become candidate links. Output: a `(from, to, source-of-decision)` matrix surfaced to the user for confirmation BEFORE writing any Jira link. Passive "only link if obviously needed" is rejected — discovery is an active step.
- **I19.** NEVER use generic actors ("the user", "the customer", "the system") in the `As a` line of a user story. The persona MUST resolve to a named entity in `.context/PRD/user-personas.md`. If the matching persona is absent → surface as `gap`, ask the user, never invent.
- **I20.** NEVER write the `As a … I want to … so that …` sentence as the story summary. The summary MUST be `{Feature} | {Action}` (see §Story title format); the full sentence lives ONLY in the description `## User story` section. Persona and benefit NEVER appear in the title. Domain-entity feature prefixes that collide with agile/QA vocabulary carry the `TMS-` (project-domain) tag; cross-cutting features stay plain. Epics keep noun-phrase titles (no pipe, no verb).
- **I21.** NEVER publish Jira content whose domain entity/process/state names diverge from `.context/business/domain-glossary.md`, and NEVER use a term its anti-glossary bans — use the prescribed replacement. A needed term missing from the glossary → surface as `gap` for the PM to add per the glossary's change protocol; never invent terminology mid-story.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/product-management/SKILL.md` · phase: `management` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-bootstrap

**Purpose**: Scaffolds the technical infrastructure of a new project: backend (DB schemas, API base, types, error handling), frontend (design system,...

**Compact Rules**:
- **B1.** NEVER collapse the scaffold architecture layers (`api/` / `schemas/` / `db/` boundaries in backend, design-system structure in frontend). That structure is framework architecture, not speculative abstraction — CLAUDE.md §2 SIMPLICITY FIRST exempts it.
- **B2.** NEVER skip env-var validation (Zod or equivalent schema check at boot). Silent missing env vars cause cryptic prod failures far from the root cause.
- **B3.** NEVER clobber existing scaffolding. Detect prior state under `app/`, `lib/`, `db/` and apply UPSERT semantics — patch surgically, preserve user edits.
- **B4.** NEVER hardcode credentials, URLs, or env-specific values in scaffolded code. They belong in `.env` (secrets) + `.agents/project.yaml` (non-secret config).
- **B5.** NEVER scaffold the frontend before `DESIGN.md` exists at repo root. Design tokens are the input contract for Phase 2 — run `/design-system` first.
- **B6.** NEVER skip Supabase types generation when scaffolding the DB layer. Runtime TypeScript types must match the live schema; drift is a silent bug factory.
- **B7.** NEVER ship bearer-token auth without rate-limiting + secret-rotation guidance in the same scaffold. Auth without those two is a half-finished feature.
- **B8.** NEVER scaffold OpenAPI without the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler). The contract surface must be browsable from day one or downstream consumers won't trust it. Do NOT ship Redoc/Swagger instead — Scalar is the standard for this stack.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-bootstrap/SKILL.md` · phase: `foundation` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-foundation

**Purpose**: Orchestrates the foundational definition of a new product/project: Constitution (business model + market context), Architecture (PRD + SR...

**Compact Rules**:
- **F1.** NEVER rewrite the project Constitution, PRD, or SRS from scratch when prior versions exist under `.context/`. Always UPSERT — preserve existing decisions, surface diffs, refine in place.
- **F2.** NEVER fabricate user personas, market data, or competitor analysis. If the user has no research, surface the gap as a `[PLACEHOLDER]` open TODO and ask — speculative personas mislead every downstream skill.
- **F3.** NEVER conflate PRD scope with SRS architecture. PRD answers WHAT and WHY (problem, users, journeys, MVP cut); SRS answers HOW (functional contracts, NFRs, tech stack, API definitions). Cross-contamination breaks traceability.
- **F4.** NEVER skip Phase 4 Discovery (`/business-data-map`, `/business-feature-map`, `/business-api-map`, `project-dev-guide`). Downstream skills (`/product-management`, `/sprint-development`) assume those running-mental-model docs exist.
- **F5.** NEVER hardcode tool choices (DB engine, hosting provider, auth vendor, framework) in the Constitution. Tool selection lives in SRS architecture — Constitution stays vendor-agnostic so the SRS can change without invalidating the strategic anchor.
- **F6.** NEVER define personas, problem statements, or KPIs without quoting evidence (user interview, analytics snapshot, stakeholder ask, market data citation). Evidence-free claims look authoritative and mislead the PRD downstream.
- **F7.** NEVER produce a PRD without an explicit out-of-scope section. Implicit scope boundaries always leak; missing out-of-scope is the #1 source of mid-sprint argumentation.
- **F8.** NEVER leave the SRS architecture's hard-to-reverse decisions undocumented. Seed the foundational ones as ADRs in `.context/ADR/` (per `agentic-dev-core/references/adr-doctrine.md`) so later sessions don't re-litigate or silently violate them. Draft as `Proposed`; never mark `Accepted` without human sign-off.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-foundation/SKILL.md` · phase: `foundation` · source: frontmatter `compact_rules` (verbatim)

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
- **Automation identity is declared, never chosen.** Log into a running app ONLY as the account named in `.agents/project.yaml` → `testing.automation_identity` (variable NAMES there, values in `.env`). Slot unset or variable missing → STOP and report; never substitute another account, query the DB for one, create one, or reuse the human's browser session. See `references/live-ui-identity.md`.
- **Never bypass the app's own login path.** No service-role / secret / admin keys, no admin user-management APIs (list / create / mutate users), no generated magic or password-reset links, no locally-signed JWTs, no hand-crafted session cookies, no impersonation of any account — including "just to see the admin view". Surface the need as a finding instead.
- **Session material is ephemeral.** Cookie jars, `storageState.json`, token files, `.har` captures: session scratch directory only (never the repo tree), deleted BEFORE reporting, disclosed as `secrets_materialized:` + `cleaned:` in the report. Never echo a credential into a report, plan, commit, PR body, or tracker comment.
- **Live-UI validation is browser-based at the gate.** A UI story cannot be approved on HTTP-probe evidence alone; Tier 0 probes carry the inner loop and non-visual assertions only (`references/live-ui-validation.md` §7). Never validate against a production build.
- **A DEFINER function's `WHERE` clause is not authorization.** `SECURITY DEFINER` bypasses RLS unless the table declares `FORCE ROW LEVEL SECURITY` (verify for your schema; never assume it), so a filter on a caller-supplied identity or scope parameter selects rows — it does not decide who may ask. Writing or changing such a function requires BOTH an actor bind at step 0 (`if auth.uid() is not null and auth.uid() <> p_actor_user_id then raise ... errcode 'P0002'`) AND explicit scoping of every returned row; asserting the caller's own membership does NOT scope the result set. First ask whether `SECURITY INVOKER` — or deleting the identity parameter — removes the class instead. Prove it with a DB-integration test that attempts the spoof against the real database: a mocked `db.rpc` proves nothing. See `references/rpc-authorization.md`.
- **The workload forecast gate is fail-closed.** With `risk = High`, `Chain strategy` is accepted ONLY with a verbatim `Decision trace:` citing the git-flow-master chained-PR tree answers. Missing or malformed trace is treated as `pending` and blocks Stage 2. The planner may only emit `pending` — it never picks a strategy itself.
- **Ticket availability is queried, never read from prose.** Before planning or recommending a ticket, query the tracker live for that ticket and its direct blockers. `.context/dev-roadmap.md` is authoritative for dependency edges and mockup gates, never for current status — a recent timestamp on that file says nothing about a ticket's status today.
- **Config claims cite the file they came from.** Read `.agents/project.yaml` / `package.json` / `.env.example` before asserting what the project is configured to do. Never quote a value from a skill reference or worked example as project state.
- **Technical decisions are yours to make — but read the record before you make one.** Search the run's decision/escalation log, `.context/ADR/`, and the ticket plus its siblings BEFORE deciding OR asking. A decision already made is followed and cited, never re-derived; re-asking a settled question — even to a human, asked cold without the prior ruling in front of them — yields a contradiction, not an override. Genuinely unsettled and technical → decide it yourself via a scored judge panel of 3-5 independent lenses, then record the decision AND its scoring rationale where the next agent's search will find it. Escalate ONLY product/business calls, a novel security posture not already ratified, irreversible or destructive actions, and whatever the operator explicitly reserved. See `agentic-dev-core/references/decision-protocol.md`. **Product calls are the one configurable category**: a project that sets `decision_authority.product: decide` in `.agents/project.yaml` (no human PO in the loop) routes them to a scored, attributed decision subagent instead of escalating — read the block, then `decision-protocol.md` §5.1.
- **Plan before code.** Stage 1 always runs; even a bug fix gets a one-paragraph root-cause analysis before the diff.
- **Verification cap=3**: lint + types + unit tests in parallel; green before any push.
- **Atomic commits**, semantic prefixes, no AI-attribution lines, never `--no-verify`, never force-push a pushed branch, never push to `main` without explicit confirmation.
- **Scope discipline**: touch only what the story states. No "while I'm here" refactors.
- **Reviewer findings are adjudicated**, not auto-applied: each is verified against the diff + AC, or dismissed with a one-line reason.

**Read full SKILL.md when**: the stage you are running needs its full walkthrough, a gate fires, or the briefing tells you to load the full skill.

> Source: `.claude/skills/sprint-development/SKILL.md` · phase: `implementation` · source: frontmatter `compact_rules` (verbatim)

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
- **T1.** NEVER hardcode credential values in the in-app `/qa` page or in the credentials artifact body. Reference environment / config slots by name (e.g. `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`); the real values live in `.env` and in the chosen publisher destination, never in source.
- **T2.** NEVER bypass drift detection. When the host-stack signature changes, respect the snapshot-comment mechanism (`/* qa-guide-snapshot: stack=…, generated=… */`) and propose a surgical patch — do NOT regenerate the page from scratch when a targeted diff suffices.
- **T3.** Gate `/qa` in production ONLY when the host is an internal tool / customer-facing product where an operational page would leak. For a **public practice / demo platform** (where `/qa` IS the teaching surface, e.g. the page that onboards external testers), the page is intentionally public — do NOT gate it. Detect the project type in pre-flight; when unsure, ask. Either way the page NEVER inlines real secrets (T1), so "public" means "public docs", not "public credentials".
- **T4.** NEVER include PII, real customer data, or production data examples in the testability guide. Demo users and sanitized fixtures only.
- **T5.** NEVER duplicate the credentials-artifact body across multiple publisher targets. The markdown body in `references/credentials-content-template.md` is the single source of truth; publishers are thin adapters.
- **T6.** NEVER assume idempotency without re-checking the snapshot comment. Re-runs MUST read the snapshot, diff against current detected stack, and only then decide no-op vs surgical patch vs fresh scaffold.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/testability-guide/SKILL.md` · phase: `foundation-extension` · source: frontmatter `compact_rules` (verbatim)

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
- **U1.** NEVER test implementation details (private helpers, internal state, call counts on internal methods). Test public behavior and observable contracts — implementation details refactor freely, tests should not.
- **U2.** NEVER over-mock. When a test mocks every collaborator, it verifies the mock graph rather than the code under test. Prefer real implementations + dependency injection at the seam; mock only true external boundaries (HTTP, DB, filesystem, time, randomness).
- **U3.** NEVER skip the red phase in TDD. Writing the test AFTER the code defeats the design feedback loop — the test must fail for the right reason before any production code is written.
- **U4.** NEVER use weak assertions (`expect(result).toBeTruthy()`, `expect(x).toBeDefined()`) when you actually mean an exact value. Weak assertions hide regressions; assert the specific value, shape, or error.
- **U5.** NEVER share mutable state between tests (module-level vars, singleton caches, shared fixtures mutated in-place). Order-dependent flakes are the result. Reset state in `beforeEach` or scope it inside the test.
- **U6.** NEVER chase 100% line coverage as a goal. Coverage is a signal, not a target — 100% with brittle mock-heavy tests is worse than 80% with behavior-driven tests. Mutation testing is the better signal when the question is "are my tests actually catching bugs?".
- **U7.** NEVER mock what you own without a real reason. Prefer dependency injection at the seam so the test can pass a fake or stub explicitly; reach for `jest.mock` / `vi.mock` only when the seam is unavoidable (module-level side effects, third-party SDK).
- **U8.** NEVER let a flaky test ship green. Either fix the root cause (timing, shared state, network) or quarantine with a tracked ticket — ignoring flakes erodes trust in the entire suite.
- **U9.** NEVER write tests for framework code (matchers behaving correctly, library internals, ORM mechanics). Test YOUR logic; trust the framework's own test suite.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/unit-testing/SKILL.md` · phase: `implementation` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: vercel-cli

**Purpose**: Vercel CLI cookbook for this Next.js + Supabase + Vercel boilerplate.

**Compact Rules**:
- **`--no-wait` on deploy, `--wait` on inspect — never the other way around.** Inverting these means you either block for 10 minutes waiting on a deploy URL you needed immediately, or you race an unfinished deployment with a smoke test.
- **`vercel ls -m githubCommitSha=<sha>` is the canonical "find MY deploy" query.** No grep, no parsing, no race. Use `--format json` and `jq`.
- **Status filter values are UPPERCASE.** `vercel ls --status READY` works; `--status ready` returns empty with no error.
- **`vercel env pull` writes to `.env.local` by default.** That file is in `.gitignore` for a reason — never commit it. If you need a different filename, pass it as a positional arg.
- **Multi-team accounts need `--scope <team-slug>` on EVERY mutating command.** Otherwise the operation hits the wrong team's project, or fails with a confusing 404.
- **Always `--format json`** on `ls`, `env ls`, `teams ls`. Human tables include ANSI color and lose columns at narrow widths.
- **Always `--no-wait` on `vercel deploy`** in scripts. Capture the URL, then poll with `vercel inspect --wait` separately.
- **Always `--wait --timeout=10m`** on `vercel inspect` when verifying. Default behavior returns immediately with whatever state the deploy is currently in — usually `BUILDING`, which tells you nothing.
- **Always pass `--scope <team-slug>`** if `vercel teams ls` shows more than one team. If the project is already linked, the `orgId` in `.vercel/project.json` / `.vercel/repo.json` resolves the team automatically and you can omit `--scope`.
- **Never grep `vercel ls` output for URLs.** Use metadata filters (`-m githubCommitSha=$SHA`) + `--format json` + `jq`. ANSI codes will break naive regex.
- **Never commit `.env.local`** produced by `vercel env pull`. It's gitignored; keep it that way.
- **Verify exit codes.** `vercel inspect --wait` exits 0 only on `READY`. Any non-zero is a real failure — surface it, don't swallow it.
- **Pin the CLI version in CI.** New majors have shifted flag shapes (e.g. `--confirm` → `--yes`). Document the pinned version in `package.json` devDependencies or in the CI workflow.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/vercel-cli/SKILL.md` · phase: `implementation` · source: frontmatter `compact_rules` (verbatim)

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
