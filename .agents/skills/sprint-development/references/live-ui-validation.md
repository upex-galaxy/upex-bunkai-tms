# Live-UI validation — mechanics (flow-aware, tool-agnostic)

> Owned by `/sprint-development`. SKILL.md holds the WHEN/WHAT (the four principles + hard rules in the **Live-UI validation** subsection); this file holds the HOW. Live-UI validation runs against the **running app**, never a static read of the mockup plus green lint/types/tests — those stay green while the rendered UI is wrong.

---

## 0. Identity contract (read BEFORE any login)

Which account the automation logs in as, and which shortcuts are forbidden while doing it, are governed by **`references/live-ui-identity.md`**. Read it before the first authenticated action of a run. Summary of what binds here:

- The identity is declared BY VARIABLE NAME in `.agents/project.yaml` → `testing.automation_identity` (with optional `per_env` overrides) and resolved from `.env` at runtime. The names below are examples, not required spellings.
- It must be a **dedicated non-production account** (or an intentionally-public shared demo account). Never a real user, an admin/staff account, or anything with production reach.
- **Fail-closed**: slot unset, variable missing from `.env`, or `scope` unset → **STOP and report**. Do not pick a different account, do not query the database for one, do not create one, do not reuse the human's open browser session.
- **Never bypass the app's own login path.** No service-role / secret / admin keys, no admin user-management APIs, no generated magic or reset links, no locally-signed JWTs, no hand-written session cookies, no impersonation. Full statement + rationale: `live-ui-identity.md` §3.
- Session material (cookie jar, `storageState.json`, `.har`, token files) follows the ephemeral-artifact contract: scratch dir only, deleted before reporting, disclosed via `secrets_materialized:` / `cleaned:`.

When live-UI work is dispatched to a subagent, these rules travel in briefing component 7 or they do not exist for the executor (`live-ui-identity.md` §5).

---

## 1. Tool resolution + preference order

The tool is resolved per project via `[AUTOMATION_TOOL]` (AGENTS.md §6 Tool Resolution). **Never hardcode one tool** — pick the highest-preference tool the project has configured/available:

| Pref | Tool | Why | Session-bound? |
| ---- | ---- | --- | -------------- |
| 0 (COMPLEMENT) | **Authenticated HTTP probe** (`[API_TOOL]`) | No browser. Fast inner-loop + server-rendered assertions only. **Cannot replace a browser tier** — see §7 for the capability boundary. | No |
| 1 (PRIMARY) | **Playwright CLI** (`/playwright-cli`) | Spawns its own browser, logs in with the declared automation identity, follows scripted steps. Portable / CI-friendly / not bound to the Claude session. | No |
| 2 | **Playwright MCP** | Extension controlling the user's default browser profile. | Partially |
| 3 | **claude-in-chrome MCP** | Only when Claude Code runs AND the Chrome cloud/extension is configured + installed. | **Yes** (see §6) |

Default expectation: **Playwright CLI**, because it is not session-bound and runs cleanly inside a stage subagent in Orchestrated mode.

Load the owning skill before invoking its binary/tool (AGENTS.md §6.5): Playwright CLI → `/playwright-cli`.

---

## 2. Flow-aware execution

Validation runs wherever the **active flow mode** runs (the mode is resolved once at Phase 0 and locked for the run — see SKILL.md "Execution mode"):

- **Orchestrated (default)** → live-UI validation happens **inside the stage subagent** that owns it (Stage 2 implementer for the real-time check; the Stage 3 verifier for the final pass). Any of the three tools can run inside a stage subagent.
- **Solo (opt-in)** → live-UI validation happens **inline** in the one session, same stage boundaries.

The flow mode — not the tool — decides where it runs. The only exception is the claude-in-chrome session-binding caveat in §6.

---

## 3. Per-tool startup

### 3.1 Playwright CLI (PRIMARY)

Drive the running dev server with a scripted login. The account is the declared automation identity (§0 + `live-ui-identity.md`); its values come from `.env` at runtime (AGENTS.md Critical Rule #1) — never hardcode. Env URL comes from `.agents/project.yaml` (`{{WEB_URL}}` for the active env; localhost dev server for the real-time check).

```ts
// scripts/_live-ui-check.ts (skeleton — adapt selectors to the app's login form)
import { chromium } from 'playwright';

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:3000'; // active-env or dev server

// Variable NAMES come from .agents/project.yaml → testing.automation_identity.
// The two below are the boilerplate's default names — substitute the project's.
const EMAIL = process.env.QA_E2E_USER_EMAIL;       // from .env — never inline
const PASSWORD = process.env.QA_E2E_USER_PASSWORD; // from .env — never inline

// Fail-closed: no declared identity → STOP, do not improvise another account.
if (!EMAIL || !PASSWORD) {
  throw new Error('Automation identity missing: declare testing.automation_identity in .agents/project.yaml and set the named vars in .env');
}

const browser = await chromium.launch();          // headless OK for capture
const page = await browser.newPage();

await page.goto(`${BASE_URL}/login`);
await page.getByLabel(/email/i).fill(EMAIL!);
await page.getByLabel(/password/i).fill(PASSWORD!);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL('**/dashboard');            // app-specific post-login route

await page.goto(`${BASE_URL}/<story-screen-route>`);
await page.screenshot({ path: '.context/PBI/.../evidence/<screen>-default.png', fullPage: true });
// repeat for loading / empty / error states + responsive breakpoints (§4)

await browser.close();
```

Run via the project's runtime (READ `package.json` for the script; do not quote a build command from docs — AGENTS.md Rule #10). Capture screenshots into the story's `evidence/` folder so the Spec Compliance Matrix can cite them.

### 3.2 Playwright MCP (extension)

When the project routes `[AUTOMATION_TOOL]` to the Playwright MCP, drive the extension against the user's browser profile. Same per-screen checklist (§4). Log in with the declared automation identity.

**Caveat that matters here**: an "already-authenticated profile" is convenient but is usually the HUMAN's session, not the automation identity. Reusing it is impersonation under `live-ui-identity.md` §3. Check who the profile is logged in as; if it is not the declared identity, log out (or use a fresh context) and log in properly.

### 3.3 claude-in-chrome MCP

Loop: `tabs_context_mcp` (get current tabs / confirm the logged-in localhost tab exists) → `navigate` to the screen route → `computer` / `read_page` / screenshot → assert against the checklist. Load the tools via `ToolSearch` first. **Session-binding caveat applies — see §6.**

---

## 4. Per-screen validation checklist

For every screen the story touches, validate the **rendered** result (not the source):

- [ ] **Layout & structure** — matches the screen's intent; no truncation / overflow / clipped controls (e.g. a dropdown that cuts off its options).
- [ ] **Design tokens** — colors, spacing, typography come from `DESIGN.md` (and the frozen-token contract / `master-design-plan.md` §2 when present). No hardcoded hex / off-system spacing.
- [ ] **Live-UI consistency** — consistent with the CURRENT live components + navigation, per the LIVE-UI-FIRST doctrine (AGENTS.md Critical Rule #14). Reuse existing components; do not blind-copy a mockup that conflicts with the improved live UI.
- [ ] **Loading state** — skeleton / spinner renders, no layout shift.
- [ ] **Empty state** — message + CTA present.
- [ ] **Error state** — message + retry path present.
- [ ] **Responsive** — mobile / tablet / desktop breakpoints hold.
- [ ] **AC interactive flows** — every interactive Acceptance Criterion is exercised end-to-end in the running app (click, type, submit, navigate) and observed to work.
- [ ] **Navigation** — how the user reaches and moves through this screen is correct (LIVE-UI-FIRST principle 3: navigation is paramount for UX).

---

## 5. Two patterns + the fix loop

### 5.1 Real-time during implementation (Stage 2)

While building UI, keep the dev server up and re-render after each meaningful change. Catch render bugs **as you code**, not after — tests/types stay green while the pixels are wrong. This often collapses scope: if the live UI already has the affordance the story assumed was greenfield, the task becomes **harden**, not **build** (LIVE-UI-FIRST — inspect + reuse first).

### 5.2 Final verification pass (Stage 3)

Before approving the PR, run a clean pass over all of the story's screens against the §4 checklist (all states, responsive, every interactive AC). Capture evidence into `evidence/` for the Spec Compliance Matrix.

### 5.3 Fix loop (gate)

A UI story **cannot reach merge with an open, unratified live-UI gap.** On any gap:

1. Fix immediately — **Orchestrated**: dispatch a fix subagent (`fix-issues.md`); **Solo**: fix inline.
2. Re-validate the affected screen(s).
3. Repeat until clean, or — for a deliberate, user-approved departure — ratify it as a `master-design-plan.md` §5 divergence (+ ADR if architectural) before approving.

Non-UI stories skip live-UI validation entirely.

**Hard rules (carry from SKILL.md):** NEVER validate against a production build — use the running dev server (e.g. `bun run dev`). Log in as the declared automation identity, resolved by variable name from `.env`, never hardcoded, never bypassing the app's login path (§0 + `live-ui-identity.md`). Before reporting, delete any session material written to disk and disclose `secrets_materialized:` / `cleaned:`.

---

## 6. claude-in-chrome session-binding caveat

claude-in-chrome is **bound to the Claude Code session**: its tabs and the user's logged-in localhost live in the session that owns the extension. A stage subagent generally cannot reach that browser. So:

- The **default** tool (Playwright CLI) is **not** session-bound — ordinary in-subagent execution is the norm. This caveat does NOT apply to it.
- This caveat applies **only** when a project is configured to use claude-in-chrome AND the flow is Orchestrated AND a subagent cannot reach that browser. In that specific case, run the live-render step **where the session's browser actually lives** (the main session that owns the extension) — a sanctioned session-bound exception per `agentic-dev-core/references/orchestration-doctrine.md`.

This is a documented edge, not the primary design. Prefer Playwright CLI; reach for claude-in-chrome only when that is what the project has configured.

---

## 7. Tier 0 — authenticated HTTP probe (sanctioned light path)

Spinning up a full browser for every check is expensive, and a large share of what a server-rendered app does is observable over plain HTTP. A scripted authenticated fetch is a **sanctioned complement** to the browser tiers — never a replacement.

**Shape** (tool-agnostic, `[API_TOOL]`): log in through the app's own login endpoint using the declared automation identity → keep the session (cookie jar / auth header) in the **session scratch directory** → fetch the routes under test → assert on status, redirects, and the server-rendered markup → **delete the session file before reporting**.

The identity contract (§0), the prohibition list, and the ephemeral-artifact contract apply in full. A probe is a login like any other: the same forbidden shortcuts stay forbidden, and a cookie file is exactly the material §0 requires you to clean up.

### Sanctioned for

- Route reachability and HTTP status (200 / 404 / 500 on the story's routes).
- Auth behaviour: protected route redirects when anonymous, reachable when authenticated, correct post-login destination.
- Presence or absence of server-rendered content: a heading, a row, a data-testid, an empty-state string that the server emits.
- Data correctness in the delivered markup (right records, right ordering, right formatting).
- Fast regression re-checks on a route already validated visually, after an unrelated change.
- Non-UI stories that expose an endpoint or an SSR page and never needed the browser tiers.

### NOT sufficient for (browser tier required)

Every item below is in the §4 checklist and cannot be observed over HTTP:

- Layout, spacing, overflow, truncation, clipped controls.
- Design-token conformance as **computed** styles.
- Loading / empty / error states produced by client-side JavaScript after hydration.
- Responsive breakpoints.
- Interactive AC flows (click, type, submit, navigate) and post-hydration behaviour.
- Screenshot evidence for the Spec Compliance Matrix.

**Rule**: Tier 0 may carry the Stage 2 inner loop and non-visual assertions. The **Stage 3 final verification pass on a UI story is always browser-based** (§5.2). A UI story approved on HTTP evidence alone violates S14.

**Reporting**: say which tier produced each piece of evidence. `manual:<path>` rows in the Spec Compliance Matrix that came from a probe are labelled as such, so a reader does not read "verified" as "rendered".
