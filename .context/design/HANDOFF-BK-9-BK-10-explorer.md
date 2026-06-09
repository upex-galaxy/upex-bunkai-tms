# Handoff — BK-9 / BK-10 Projects Explorer refactor

> Pick up here in a fresh session. `@`-load this file to restore context.
> Created 2026-06-08 after the design-fidelity pass (PR #31) shipped to staging.

## Goal

Bring the **Projects explorer** (the module-tree side panel) up to mockup fidelity for two
already-implemented stories. Per `.context/design/master-design-plan.md` §4.3 + the mockup
`.context/designs/bunkai-test-management-tool/project/screens/project.jsx`.

| Story | Status | Gap to close |
|-------|--------|--------------|
| **BK-10** rename/delete module | BLOCKED (code exists) | Hover action icons → real **right-click context menu** (Open · Rename · Move · Duplicate · Copy ID · Delete, with shortcuts) |
| **BK-9** create modules | In Test | Explorer **status filter chips** (`all / fail / blocked / unrun`) with live counts |

Both back stories at/above QA handoff, so per the user's rule their screen must be faithful.

## Files

- `components/layout/Sidebar.tsx` — the module-tree explorer (recursive `ModuleNode`). Currently
  renders hover action icons (`group-hover:flex`, absolute right) on module + story rows. This is
  where the context menu replaces them. `AtcLink` renders ATC rows with `.dot` status + `.layer-chip`.
- `app/(app)/projects/[projectSlug]/project-explorer.tsx` — client wrapper that owns modal state and
  passes callbacks (`onRenameModule`, `onMoveModule`, `onDeleteModule`, `onNewUserStory`, etc.) into
  `Sidebar`. Add filter state + filter-chip UI here (above the tree).
- `app/(app)/projects/[projectSlug]/page.tsx` — server page; passes the built tree + the topbar.
- Mockup reference: `screens/project.jsx` (explorer panel: `all 623 / fail 7 / blocked 3 / unrun 14`
  chips, right-click `ContextMenu` with Open/Run/Edit/Rename/Duplicate/Copy ID/Link/View deps/Delete).

## Approach (decided)

- **BK-10 context menu** = **custom right-click** (`onContextMenu` + a positioned popover). Do NOT add
  `@radix-ui/react-context-menu` — it's not in deps, and touching `package.json`/lockfile risks churn.
  Keep the hover icons as a touch fallback, or fold them into the menu. Menu items reuse the existing
  callbacks already threaded through `Sidebar`. "Copy ID" = `navigator.clipboard.writeText`. "Open" =
  navigate to the ATC/module. "Run"/"View deps"/"Duplicate" have no backend yet → render disabled/soon
  or omit (ratify in master-design-plan §5 if omitted).
- **BK-9 filter chips** = compute status counts from the tree's `node.atcs[].status` (recurse). Filter
  hides/dims non-matching ATC rows. **Data caveat:** the seeded test project `openapi-test-project`
  (workspace `mobile`) has **0 ATCs**, so chips show 0 and there's nothing to filter — build it but
  verify against a project that has ATCs with varied statuses (may need to seed, or wait for real data).
- Tokens are frozen — reuse `.status-chip` / `.dot` / chip styles already aligned in `app/globals.css`.
  Follow CLAUDE.md Rule #15 + master-design-plan §2/§4.

## Verify (Playwright + magic-link auth — proven recipe)

Auth against remote Supabase magic-link via the Resend CLI:
1. `bun run dev` (background). Login user: `openapi-testing@delgri.resend.app` (has data in workspace
   `mobile`, project `openapi-test-project`).
2. `playwright-cli open http://localhost:3000/login` → `fill <email-ref> "openapi-testing@delgri.resend.app" --submit`.
3. `resend emails receiving list --limit 5 -q` → grab latest id → `resend emails receiving get <id> -q`,
   extract the `…supabase.co/auth/v1/verify?token=pkce_…&redirect_to=…/auth/callback…` URL.
4. `playwright-cli goto "<verify-url>"` (same browser → PKCE code_verifier persists) → lands authed on
   `/projects`. `playwright-cli state-save .scratch/auth.json` to reuse.
5. Navigate to `/projects/openapi-test-project`, screenshot, iterate.
- Next.js Dev Tools renders a bottom-left "N" badge — dev-only overlay, NOT app UI; ignore.
- Do NOT use the Supabase service-role key to seed/read the DB — the auto-mode classifier blocks it.

## Git

- Branch off `staging` (e.g. `fix/BK-9-BK-10-explorer`) → PR. Or, if small, the user is OK with a
  direct commit + push to `staging` (protected, but the owner token bypasses the PR rule on push).
- All gates currently green (`bun run repo:check` EXIT 0). Pre-push runs `repo:check`.

## State at handoff (what's already done)

- Shipped to staging (PR #31, merge `0d43e0c`): design governance (master-design-plan + CLAUDE.md
  Rule #15 + DESIGN.md), atom-style fidelity, global App Shell sidebar, per-page UserMenu/WorkspaceSwitcher
  dedup, ATC editor live-preview + inline anchoring, login ambient polish (glow/motion/mobile brand).
- Skills symlink work + lint-skills symlink fix + REGISTRY regen: committed `82cb516` on staging.
- Boilerplate fix pushed to both `agentic-dev-boilerplate` (c377f7d) + `agentic-qa-boilerplate` (b99a268):
  `lint-skills.ts` now skips symlinks in T1 discovery.
- **Pending (user-owned, in boilerplate):** the design-fidelity wiring into `/sprint-development`
  (3 edits to SKILL.md + review-pr.md) — user is adding these to the boilerplate; once pulled via
  `bun run up`, sprint-development will auto-consult the master-design-plan §8 US→Screen map.

## Roadmap after BK-9/BK-10

Remaining design-plan items (master-design-plan §6), mostly blocked on data models that don't exist
(runs / bugs / coverage): Home/Dashboard, Test Runner, Bug Reports, Metrics, Test Runs index, global
ATC Library, Settings. Build each when its story leaves Shift-Left/Ready-For-Dev into implementation.
