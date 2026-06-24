# Live-UI validation — mechanics (flow-aware, tool-agnostic)

> Owned by `/sprint-development`. SKILL.md holds the WHEN/WHAT (the four principles + hard rules in the **Live-UI validation** subsection); this file holds the HOW. Live-UI validation runs against the **running app**, never a static read of the mockup plus green lint/types/tests — those stay green while the rendered UI is wrong.

---

## 1. Tool resolution + preference order

The tool is resolved per project via `[AUTOMATION_TOOL]` (CLAUDE.md §6 Tool Resolution). **Never hardcode one tool** — pick the highest-preference tool the project has configured/available:

| Pref | Tool | Why | Session-bound? |
| ---- | ---- | --- | -------------- |
| 1 (PRIMARY) | **Playwright CLI** (`/playwright-cli`) | Spawns its own browser, logs in with `.env` creds, follows scripted steps. Portable / CI-friendly / not bound to the Claude session. | No |
| 2 | **Playwright MCP** | Extension controlling the user's default browser profile. | Partially |
| 3 | **claude-in-chrome MCP** | Only when Claude Code runs AND the Chrome cloud/extension is configured + installed. | **Yes** (see §6) |

Default expectation: **Playwright CLI**, because it is not session-bound and runs cleanly inside a stage subagent in Orchestrated mode.

Load the owning skill before invoking its binary/tool (CLAUDE.md §6.5): Playwright CLI → `/playwright-cli`.

---

## 2. Flow-aware execution

Validation runs wherever the **active flow mode** runs (the mode is resolved once at Phase 0 and locked for the run — see SKILL.md "Execution mode"):

- **Orchestrated (default)** → live-UI validation happens **inside the stage subagent** that owns it (Stage 2 implementer for the real-time check; the Stage 3 verifier for the final pass). Any of the three tools can run inside a stage subagent.
- **Solo (opt-in)** → live-UI validation happens **inline** in the one session, same stage boundaries.

The flow mode — not the tool — decides where it runs. The only exception is the claude-in-chrome session-binding caveat in §6.

---

## 3. Per-tool startup

### 3.1 Playwright CLI (PRIMARY)

Drive the running dev server with a scripted login. Credentials come from `.env` (CLAUDE.md Critical Rule #1) — never hardcode. Env URL comes from `.agents/project.yaml` (`{{WEB_URL}}` for the active env; localhost dev server for the real-time check).

```ts
// scripts/_live-ui-check.ts (skeleton — adapt selectors to the app's login form)
import { chromium } from 'playwright';

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:3000'; // active-env or dev server
const EMAIL = process.env.LOCAL_USER_EMAIL;       // from .env — never inline
const PASSWORD = process.env.LOCAL_USER_PASSWORD; // from .env — never inline

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

Run via the project's runtime (READ `package.json` for the script; do not quote a build command from docs — CLAUDE.md Rule #10). Capture screenshots into the story's `evidence/` folder so the Spec Compliance Matrix can cite them.

### 3.2 Playwright MCP (extension)

When the project routes `[AUTOMATION_TOOL]` to the Playwright MCP, drive the extension against the user's browser profile (already-authenticated session is common). Same per-screen checklist (§4); no login script needed if the profile is logged in — otherwise log in with `.env` creds.

### 3.3 claude-in-chrome MCP

Loop: `tabs_context_mcp` (get current tabs / confirm the logged-in localhost tab exists) → `navigate` to the screen route → `computer` / `read_page` / screenshot → assert against the checklist. Load the tools via `ToolSearch` first. **Session-binding caveat applies — see §6.**

---

## 4. Per-screen validation checklist

For every screen the story touches, validate the **rendered** result (not the source):

- [ ] **Layout & structure** — matches the screen's intent; no truncation / overflow / clipped controls (e.g. a dropdown that cuts off its options).
- [ ] **Design tokens** — colors, spacing, typography come from `DESIGN.md` (and the frozen-token contract / `master-design-plan.md` §2 when present). No hardcoded hex / off-system spacing.
- [ ] **Live-UI consistency** — consistent with the CURRENT live components + navigation, per the LIVE-UI-FIRST doctrine (CLAUDE.md Critical Rule #14). Reuse existing components; do not blind-copy a mockup that conflicts with the improved live UI.
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

**Hard rules (carry from SKILL.md):** NEVER validate against a production build — use the running dev server (e.g. `bun run dev`). Log in with credentials from `.env`, never hardcoded.

---

## 6. claude-in-chrome session-binding caveat

claude-in-chrome is **bound to the Claude Code session**: its tabs and the user's logged-in localhost live in the session that owns the extension. A stage subagent generally cannot reach that browser. So:

- The **default** tool (Playwright CLI) is **not** session-bound — ordinary in-subagent execution is the norm. This caveat does NOT apply to it.
- This caveat applies **only** when a project is configured to use claude-in-chrome AND the flow is Orchestrated AND a subagent cannot reach that browser. In that specific case, run the live-render step **where the session's browser actually lives** (the main session that owns the extension) — a sanctioned session-bound exception per `agentic-dev-core/references/orchestration-doctrine.md`.

This is a documented edge, not the primary design. Prefer Playwright CLI; reach for claude-in-chrome only when that is what the project has configured.
